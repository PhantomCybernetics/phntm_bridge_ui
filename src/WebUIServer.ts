import https from "node:https";
const httpsAgent = new https.Agent({ rejectUnauthorized: false });
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import axios, { AxiosResponse, AxiosError } from "axios";
import express from "express";
import ejs from "ejs";
import fs from "fs"

import type { Debugger } from "./lib/debugger";
import type { BridgeUiConfig } from "./config";

const execFileAsync = promisify(execFile);

export function printStartupMessage(
	{ uiVersion }: { uiVersion: string },
	config: BridgeUiConfig,
) {
	console.log("-----------------------------------------------------------------------".yellow);
	console.log(` ${config.name}`.yellow);
	console.log("");
	console.log(
		` ${config.https ? "https" : "http"}://${config.host}${
			(config.https && config.port === 443) || (!config.https && config.port === 80)
				? ""
				: `:${config.port}`
		}${config.path}__ID__`.green,
	);
	console.log((" Bridge Locate URL: " + config.bridgeLocateUrl + "").green);
	console.log((" App ID: " + config.appId + "").green);
	console.log((" App Key: " + config.appKey + "").green);
	console.log((" UI version: #" + uiVersion).green);
	console.log(" ".green);
	console.log("----------------------------------------------------------------------".yellow);
}

export function createWebUIServerExpressApp(
	{ $d, uiVersion }: { $d: Debugger; uiVersion: string },
	config: BridgeUiConfig,
	webExpressApp: express.Express,
) {
	webExpressApp.engine(".html", ejs.renderFile);
	webExpressApp.set("views", path.join(__dirname, "../src/views"));
	webExpressApp.set("view engine", "html");
	webExpressApp.use(express.urlencoded({ extended: true })); // for form data

	webExpressApp.use("/static/", express.static("static/"));
	webExpressApp.use("/static/socket.io/", express.static("node_modules/socket.io-client/dist/"));
	webExpressApp.use("/static/gridstack/", express.static("node_modules/gridstack/dist/"));

	webExpressApp.use("/static/three/", express.static("node_modules/three/build/"));
	webExpressApp.use("/static/three/examples/", express.static("node_modules/three/examples/"));
	webExpressApp.use("/static/urdf-loader/", express.static("node_modules/urdf-loader/src/"));

	if (fs.existsSync('static/lib/canvasjs-commercial/canvasjs.min.js')) // paid commercial version
		webExpressApp.use("/static/canvasjs-charts/", express.static("static/lib/canvasjs-commercial"));
	else // free version with copyright
		webExpressApp.use("/static/canvasjs-charts/", express.static("node_modules/@canvasjs/charts"));

	webExpressApp.use("/static/touch-gamepad/", express.static("node_modules/@rbuljan/gamepad/"));
	webExpressApp.use("/static/qr-code-styling/", express.static("node_modules/qr-code-styling/lib/"));

	webExpressApp.get("/favicon.ico", (req: express.Request, res: express.Response) => {
		res.redirect("/static/favicons/favicon-yellow-16x16.png");
	});

	webExpressApp.get("/", async function (req: express.Request, res: express.Response) {
		res.render("login", {
			title: "Log in to PHNTM Bridge",
			analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
			ui_git_version: uiVersion,
			login: req.query.login ? req.query.login : '',
		});
	});

	webExpressApp.post('/login', (req: express.Request, res: express.Response) => {
		// TODO
		return res.redirect('/?error=1&login='+req.body.login);
	});

	function isValidObjectId(id:string):boolean {
		return /^[0-9a-fA-F]{24}$/.test(id);
	}

	async function locateRobot(
		idRobot: string,
		config: BridgeUiConfig,
	): Promise<{ status: number; data: Record<string, unknown> }> {
		try {
			const response: AxiosResponse = await axios.post(
				config.bridgeLocateUrl,
				{
					id_robot: idRobot,
					app_id: config.appId,
					app_key: config.appKey,
				},
				{ timeout: 5000, httpsAgent },
			);
			return { status: response.status, data: response.data };
		} catch (error) {
			const axiosError = error as AxiosError;
			if (axiosError.code !== "ECONNREFUSED") {
				throw error;
			}

			const payload = JSON.stringify({
				id_robot: idRobot,
				app_id: config.appId,
				app_key: config.appKey,
			});

			const { stdout } = await execFileAsync(
				"curl",
				[
					"-ksS",
					"-X",
					"POST",
					config.bridgeLocateUrl,
					"-H",
					"Content-Type: application/json",
					"-d",
					payload,
					"-w",
					"\n%{http_code}",
				],
				{ timeout: 5000 },
			);

			const splitAt = stdout.lastIndexOf("\n");
			const body = splitAt >= 0 ? stdout.slice(0, splitAt) : stdout;
			const statusText = (splitAt >= 0 ? stdout.slice(splitAt + 1) : "").trim();
			const status = Number.parseInt(statusText, 10);

			let data: Record<string, unknown> = {};
			if (body.trim().length > 0) {
				data = JSON.parse(body);
			}

			return {
				status: Number.isFinite(status) ? status : 500,
				data,
			};
		}
	}

	webExpressApp.get(config.path + ":ID", async (req: express.Request, res: express.Response) => {
			res.setHeader("Content-Type", "text/html; charset=utf-8");

			// query the Bridge Server (closest) for the registered instance of this robot
			let idRobot: string = req.params.ID;
			if (!isValidObjectId(idRobot)) {
				res.status(400).render("error", {
					title: 'Error 400 @ PHNTM Bridge',
					code: 400,
					error: "Invalid Robot ID",
					analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
					ui_git_version: uiVersion
				});
				return;
			}
			try {
				const response = await locateRobot(idRobot, config);
				if (response.status != 200) {
					$d.err("Locate returned code " + response.status + " for " + idRobot + " (" + config.bridgeLocateUrl + ")");
					res.status(500).render("error", {
						title: 'Error 500 @ PHNTM Bridge',
						code: 500,
						error: 'Error locating robot on Bridge Server <span class="detail">Web UI credentials misconfigured, server returned: ' + response.status + '</span>',
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
					return;
				}
				if (response.data["id_robot"] != idRobot) {
					$d.err("Locate returned code wrong robot id for " + idRobot + ":", response.data);
					res.status(500).render("error", {
						title: 'Error 500 @ PHNTM Bridge',
						code: 500,
						error: "Error locating robot on Bridge Server",
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
					return;
				}
				const bridge_server_url = new URL(String(response.data["bridge_server"]));
				const bridge_socket_url_obj = new URL(bridge_server_url.toString());
				if (!bridge_socket_url_obj.port) {
					bridge_socket_url_obj.port = String(config.bridgeSocketPort);
				}
				bridge_socket_url_obj.pathname = "";
				bridge_socket_url_obj.search = "";
				bridge_socket_url_obj.hash = "";

				const bridge_files_url_obj = new URL(bridge_server_url.toString());
				bridge_files_url_obj.port = String(config.bridgeFilesPort);
				bridge_files_url_obj.pathname = "/%SECRET%/%ROBOT_ID%/%URL%";
				bridge_files_url_obj.search = "";
				bridge_files_url_obj.hash = "";

				let bridge_socket_url: string = bridge_socket_url_obj.toString().replace(/\/$/, "");
				let bridge_server: string = bridge_server_url.hostname;
				let robot_bridge_files_url: string = bridge_files_url_obj.toString();
				let robot_custom_css:string[] = response.data["ui_custom_css"] ? response.data["ui_custom_css"] as string[] : [];
				let robot_custom_js:string[] = response.data["ui_custom_js"] ? response.data["ui_custom_js"] as string[] : [];
				let background_disconnect_sec:number = response.data["ui_background_disconnect_sec"] ? Number(response.data["ui_background_disconnect_sec"]) : 0.0;
				$d.l('Locate returned:', response.data);
				res.render("robot_ui", {
					id_robot: req.params.ID,
					bridge_socket_url: bridge_socket_url,
					bridge_files_url: robot_bridge_files_url,
					app_id: config.appId,
					bridge_server: bridge_server,
					analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
					ui_git_version: uiVersion,
					custom_css: robot_custom_css,
					custom_js: robot_custom_js,
					background_disconnect_sec: background_disconnect_sec,
				});
			} catch (error) {
				const axiosError = error as AxiosError;
				if (axiosError.code === "ECONNABORTED") {
					$d.err("Locating request timed out for " + idRobot + " (" + config.bridgeLocateUrl + ")");
					res.status(408).render("error", {
						title: 'Error 408 @ PHNTM Bridge',
						code: 408,
						error: "Timed out locating robot on Bridge Server",
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
				} else if (axiosError.code === "ECONNREFUSED") {
					$d.err("Locating request refused for " + idRobot + " (" + config.bridgeLocateUrl + ")");
					res.status(403).render("error", {
						title: 'Error 403 @ PHNTM Bridge',
						code: 403,
						error: 'Error connecing to Bridge Server <span class="detail">Connection refused</span>',
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
				} else if (axiosError.status == 404) {
					$d.err("Locate returned code 404 for " + idRobot + " (" + config.bridgeLocateUrl + ")");
					res.status(404).render("error", {
						title: 'Error 404 @ PHNTM Bridge',
						code: 404,
						error: "Robot not found on Bridge Server",
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
				} else {
					$d.err("Error locating robot " + idRobot + " at " + config.bridgeLocateUrl + ":", axiosError.message);
					res.status(500).render("error", {
						title: 'Error 500 @ PHNTM Bridge',
						code: 500,
						error: 'Error locating robot on Bridge Server <span class="detail">Web UI seems misconfigured, server returned: ' + axiosError.code + '</span>',
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion
					});
				}
			}
		},
	);


	// 404 handler (must be last)
	webExpressApp.use((req: express.Request, res: express.Response) => {
		res.status(404).render("error", {
			title: 'Error 404 @ PHNTM Bridge',
			code: 404,
			error: "Page not found",
			analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
			ui_git_version: uiVersion
		});
	});


	return webExpressApp;
}
