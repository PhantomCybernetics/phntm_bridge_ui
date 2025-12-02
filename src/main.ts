import fs from "node:fs";
import https from "node:https";
import http from "node:http";

import express from "express";
import C from "colors";
C; //force import typings with string prototype extension

import { getConfig } from "./config";
import { Debugger } from "./lib/debugger";
import { GetCerts, GetGitCommitHash, GetExactTagOnHead } from "./lib/helpers";
import { createWebUIServerExpressApp, printStartupMessage } from "./WebUIServer";

const $d: Debugger = Debugger.Get("[Bridge Web]");
const config = await getConfig();
const gitTag = GetExactTagOnHead();
const gitCommit = GetGitCommitHash();
const uiVersion = gitTag ? gitTag : (gitCommit ? '#' + gitCommit.slice(0, 7) : '?');

printStartupMessage({ uiVersion }, config);

const webExpressApp = express();
createWebUIServerExpressApp({ $d, uiVersion }, config, webExpressApp);

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
