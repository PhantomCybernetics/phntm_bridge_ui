import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";

import axios, { AxiosResponse, AxiosError } from "axios";
import express from "express";
import ejs from "ejs";

import C from "colors";

C; //force import typings with string prototype extension

import { Debugger } from "./lib/debugger";
const $d: Debugger = Debugger.Get("[Bridge Web]");
import { GetCerts } from "./lib/helpers";
import { getConfig } from "./config";

const config = await getConfig();

const uiVersion = (await import("../package.json")).version;

console.log(
	"-----------------------------------------------------------------------".yellow,
);
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
//console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log(
	"----------------------------------------------------------------------".yellow,
);

const webExpressApp = express();

function httpsOptions() {
	const SSL_CERT_PRIVATE = config.ssl!.private;
	const SSL_CERT_PUBLIC = config.ssl!.public;
	const certFiles: string[] = GetCerts(SSL_CERT_PRIVATE, SSL_CERT_PUBLIC);
	return {
		key: fs.readFileSync(certFiles[0]),
		cert: fs.readFileSync(certFiles[1]),
	};
}

const webHttpServer = config.https
	? https.createServer(httpsOptions(), webExpressApp)
	: http.createServer(webExpressApp);

webExpressApp.engine(".html", ejs.renderFile);
webExpressApp.set("views", path.join(__dirname, "../src/views"));
webExpressApp.set("view engine", "html");
webExpressApp.use("/static/", express.static("static/"));
webExpressApp.use(
	"/static/socket.io/",
	express.static("node_modules/socket.io-client/dist/"),
);

webExpressApp.use("/static/gridstack/", express.static("node_modules/gridstack/dist/"));

webExpressApp.use("/static/three/", express.static("node_modules/three/build/"));
webExpressApp.use(
	"/static/three/examples/",
	express.static("node_modules/three/examples/"),
);
webExpressApp.use(
	"/static/urdf-loader/",
	express.static("node_modules/urdf-loader/src/"),
);

webExpressApp.use(
	"/static/canvasjs-charts/",
	express.static("node_modules/@canvasjs/charts"),
);
webExpressApp.use(
	"/static/touch-gamepad/",
	express.static("node_modules/@rbuljan/gamepad/"),
);
webExpressApp.get("/favicon.ico", (req: express.Request, res: express.Response) => {
	res.redirect("/static/favicons/favicon-yellow-16x16.png");
});

// temporarily forked bcs of this: https://github.com/gridstack/gridstack.js/issues/2491

webExpressApp.get("/", async function (req: express.Request, res: express.Response) {
	// let ip:string = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

	res.setHeader("Content-Type", "text/html");
	res.send("Ohi, this is Bridge UI server");
});

webExpressApp.get(
	config.path + ":ID",
	async function (req: express.Request, res: express.Response) {
		let ip: string = (req.headers["x-forwarded-for"] ||
			req.socket.remoteAddress) as string;

		res.setHeader("Content-Type", "text/html");

		// query the cloud bridge server (closest) for the registered
		// instance of this robot
		let idRobot: string = req.params.ID;
		axios
			.post(
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
					$d.err(
						"Locate returned code " +
							response.status +
							" for " +
							idRobot +
							" (" +
							config.bridgeLocateUrl +
							")",
					);
					res.send(
						"Error locating robot on Cloud Bridge, Web UI credentials misconfigured (err: " +
							response.status +
							")",
					);
					return;
				}
				if (response.data["id_robot"] != idRobot) {
					$d.err(
						"Locate returned code wrong robot id for " + idRobot + ":",
						response.data,
					);
					res.send("Error locating robot on Cloud Bridge");
					return;
				}
				let robot_bridge_sever: string =
					response.data["bridge_server"] + ":" + config.bridgeSocketPort;
				let robot_bridge_files_url: string =
					response.data["bridge_server"] +
					":" +
					config.bridgeFilesPort +
					"/%SECRET%/%ROBOT_ID%/%URL%";
				res.render("robot_ui", {
					id_robot: req.params.ID,
					bridge_socket_url: robot_bridge_sever, //
					bridge_files_url: robot_bridge_files_url,
					app_id: config.appId,
					analytics_code: config.analyticsCode
						? config.analyticsCode.join("\n")
						: "",
					ui_git_version: uiVersion,
				});
			})
			.catch((error: AxiosError) => {
				if (error.code === "ECONNABORTED") {
					$d.err(
						"Locating request timed out for " +
							idRobot +
							" (" +
							config.bridgeLocateUrl +
							")",
					);
					res.send("Timed out locating robot on Cloud Bridge");
				} else if (error.code === "ECONNREFUSED") {
					$d.err(
						"Locating request refused for " +
							idRobot +
							" (" +
							config.bridgeLocateUrl +
							")",
					);
					res.send("Error connecing to Cloud Bridge, connection refused");
				} else if (error.status == 404) {
					$d.err(
						"Locate returned code 404 for " +
							idRobot +
							" (" +
							config.bridgeLocateUrl +
							")",
					);
					res.send("Robot not found on Cloud Bridge");
				} else {
					$d.err(
						"Error locating robot " +
							idRobot +
							" at " +
							config.bridgeLocateUrl +
							":",
						error.message,
					);
					res.send(
						"Error locating robot on Cloud Bridge, Web UI seems misconfigured (err: " +
							error.code +
							")",
					);
				}
			});
	},
);

webHttpServer.listen(config.port);
console.log(
	`${config.https ? "HTTPS" : "HTTP"} server listening on port ${config.port}`.green,
);
