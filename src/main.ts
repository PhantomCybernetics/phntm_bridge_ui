import fs from "node:fs";
import https from "node:https";
import http from "node:http";

import C from "colors";
C; //force import typings with string prototype extension

import { getConfig } from "./config";
import { Debugger } from "./lib/debugger";
import { GetCerts } from "./lib/helpers";
import { createWebUIServerExpressApp, printStartupMessage } from "./WebUIServer";

const $d: Debugger = Debugger.Get("[Bridge Web]");
const config = await getConfig();
const uiVersion = (await import("../package.json")).version;

printStartupMessage({ uiVersion }, config);

const webExpressApp = createWebUIServerExpressApp({ $d, uiVersion }, config);

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

webHttpServer.listen(config.port);
console.log(
	`${config.https ? "HTTPS" : "HTTP"} server listening on port ${config.port}`.green,
);
