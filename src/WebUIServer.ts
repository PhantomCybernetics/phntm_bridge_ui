import path from "node:path";

import axios, { AxiosResponse, AxiosError } from "axios";
import express from "express";
import ejs from "ejs";
import fs from "fs"

import type { Debugger } from "./lib/debugger";
import type { BridgeUiConfig } from "./config";

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
	console.log((" UI version: " + uiVersion).green);
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
		// let ip:string = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.send("Ohi, this is Bridge UI server");
	});

	webExpressApp.get(
		config.path + ":ID",
		async function (req: express.Request, res: express.Response) {
			res.setHeader("Content-Type", "text/html; charset=utf-8");

			// query the Bridge Server (closest) for the registered instance of this robot
			let idRobot: string = req.params.ID;
			axios.post( // REST request
					config.bridgeLocateUrl,
					{
						id_robot: idRobot,
						app_id: config.appId,
						app_key: config.appKey,
					},
					{ timeout: 5000 },
				)
				.then((response: AxiosResponse) => {
					if (response.status != 200) {
						$d.err("Locate returned code " + response.status + " for " + idRobot + " (" + config.bridgeLocateUrl + ")");
						res.send("Error locating robot on Bridge Server, Web UI credentials misconfigured (err: " + response.status + ")");
						return;
					}
					if (response.data["id_robot"] != idRobot) {
						$d.err("Locate returned code wrong robot id for " + idRobot + ":", response.data);
						res.send("Error locating robot on Bridge Server");
						return;
					}
					let robot_bridge_sever: string = response.data["bridge_server"] + ":" + config.bridgeSocketPort;
					let robot_bridge_files_url: string = response.data["bridge_server"] + ":" + config.bridgeFilesPort + "/%SECRET%/%ROBOT_ID%/%URL%";
					let robot_custom_css:string[] = response.data["ui_custom_css"] ? response.data["ui_custom_css"] : [];
					let robot_custom_js:string[] = response.data["ui_custom_js"] ? response.data["ui_custom_js"] : [];
					$d.l('Locate returned:', response.data);
					res.render("robot_ui", {
						id_robot: req.params.ID,
						bridge_socket_url: robot_bridge_sever, //
						bridge_files_url: robot_bridge_files_url,
						app_id: config.appId,
						analytics_code: config.analyticsCode ? config.analyticsCode.join("\n") : '',
						ui_git_version: uiVersion,
						custom_css: robot_custom_css,
                    	custom_js: robot_custom_js,
					});
				})
				.catch((error: AxiosError) => {
					if (error.code === "ECONNABORTED") {
						$d.err("Locating request timed out for " + idRobot + " (" + config.bridgeLocateUrl + ")");
						res.send("Timed out locating robot on Bridge Server");
					} else if (error.code === "ECONNREFUSED") {
						$d.err("Locating request refused for " + idRobot + " (" + config.bridgeLocateUrl + ")");
						res.send("Error connecing to Bridge Server, connection refused");
					} else if (error.status == 404) {
						$d.err("Locate returned code 404 for " + idRobot + " (" + config.bridgeLocateUrl + ")");
						res.send("Robot not found on Bridge Server");
					} else {
						$d.err("Error locating robot " + idRobot + " at " + config.bridgeLocateUrl + ":", error.message);
						res.send("Error locating robot on Bridge Server, Web UI seems misconfigured (err: " + error.code + ")");
					}
				});
		},
	);

	return webExpressApp;
}
