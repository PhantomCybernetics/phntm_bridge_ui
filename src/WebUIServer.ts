const startupTime:number = Date.now();

import { Debugger } from './lib/debugger';
const $d:Debugger = Debugger.Get('[Bridge Web]');
import axios, { AxiosResponse, AxiosError } from 'axios';

const fs = require('fs');

import * as C from 'colors'; C; //force import typings with string prototype extension

import { GetCerts, GetGitInfo } from './lib/helpers';

const _ = require('lodash');
import * as path from 'path'
import * as ejs from 'ejs';

// import { Validation as $v} from './lib/validation';

const https = require('https');

const dir:string  = __dirname + "/..";

import * as JSONC from 'comment-json';
let configFname = dir+'/config.jsonc';
console.log('Loading config from '+configFname);
if (!fs.existsSync(configFname)) {
    console.error('Config file not found at '+configFname);
    process.exit(1);
}
const defaultConfig = JSONC.parse(fs.readFileSync(configFname).toString());
const CONFIG = _.merge(defaultConfig);

const SSL_CERT_PRIVATE =  CONFIG['WEB_UI'].ssl.private;
const SSL_CERT_PUBLIC =  CONFIG['WEB_UI'].ssl.public;

const certFiles:string[] = GetCerts(SSL_CERT_PRIVATE, SSL_CERT_PUBLIC);
const HTTPS_SERVER_OPTIONS = {
    key: fs.readFileSync(certFiles[0]),
    cert: fs.readFileSync(certFiles[1]),
};

const UI_PORT:number = CONFIG['WEB_UI'].port;
const UI_HOST:string = CONFIG['WEB_UI'].host;
const UI_URL:string = CONFIG['WEB_UI'].url;

const BRIDGE_LOCATE_URL:string = CONFIG['WEB_UI'].bridgeLocateUrl;
const BRIDGE_SOCKET_PORT:number = CONFIG['WEB_UI'].bridgeSocketPort;
const BRIDGE_FILES_PORT:number = CONFIG['WEB_UI'].bridgeFilesPort;

const APP_ID:string = CONFIG['WEB_UI'].appId;
const APP_KEY:string = CONFIG['WEB_UI'].appKey;
const ANALYTICS_CODE:string[] = CONFIG['WEB_UI'].analyticsCode;

const GIT_INFO = GetGitInfo(); // latest sha hash & tag 
const UI_GIT_VERSION = GIT_INFO[1] ? GIT_INFO[1] : '#' + GIT_INFO[0].slice(0, 7);

console.log('-----------------------------------------------------------------------'.yellow);
console.log(' PHNTM BRIDGE WEB UI'.yellow);
console.log('');
console.log((' '+UI_HOST+':'+UI_PORT+UI_URL+'__ID__').green);
console.log((' Bridge Locate URL: '+BRIDGE_LOCATE_URL+'').green);
console.log((' App ID: '+APP_ID+'').green);
console.log((' App Key: '+APP_KEY+'').green);
console.log((' UI version: '+UI_GIT_VERSION).green);
console.log((' ').green);
//console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log('----------------------------------------------------------------------'.yellow);

import * as express from "express";

const webExpressApp = express();
const webHttpServer = https.createServer(HTTPS_SERVER_OPTIONS, webExpressApp);

webExpressApp.engine('.html', ejs.renderFile);
webExpressApp.set('views', path.join(__dirname, '../src/views'));
webExpressApp.set('view engine', 'html');
webExpressApp.use('/static/', express.static('static/'));
webExpressApp.use('/static/socket.io/', express.static('node_modules/socket.io-client/dist/'));

webExpressApp.use('/static/gridstack/', express.static('node_modules/gridstack/dist/'));

webExpressApp.use('/static/three/', express.static('node_modules/three/build/'));
webExpressApp.use('/static/three/examples/', express.static('node_modules/three/examples/'));
webExpressApp.use('/static/urdf-loader/', express.static('node_modules/urdf-loader/src/'));

webExpressApp.use('/static/canvasjs-charts/', express.static('node_modules/@canvasjs/charts'));
webExpressApp.use('/static/touch-gamepad/', express.static('node_modules/@rbuljan/gamepad/'));

// temporarily forked bcs of this: https://github.com/gridstack/gridstack.js/issues/2491

webExpressApp.get('/', async function(req:express.Request, res:express.Response) {

    // let ip:string = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

    res.setHeader('Content-Type', 'text/html');
    res.send("Ohi, this is Bridge UI server");
});

webExpressApp.get(UI_URL+':ID', async function(req:express.Request, res:express.Response) {

    let ip:string = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

    res.setHeader('Content-Type', 'text/html');

    // query the cloud bridge server (closest) for the registered 
    // instance of this robot
    let idRobot:string = req.params.ID;
    axios.post(BRIDGE_LOCATE_URL, {
        id_robot: idRobot,
        app_id: APP_ID,
        app_key: APP_KEY
    }, { timeout: 5000 })
    .then((response: AxiosResponse) => {
        if (response.status != 200) {
            $d.err('Locate returned code '+response.status+' for '+idRobot+' ('+BRIDGE_LOCATE_URL+')');
            res.send('Error locating robot on Cloud Bridge, Web UI credentials misconfigured (err: '+response.status+')');
            return;
        }
        if (response.data['id_robot'] != idRobot) {
            $d.err('Locate returned code wrong robot id for '+idRobot+':', response.data);
            res.send('Error locating robot on Cloud Bridge');
            return;
        }
        let robot_bridge_sever:string = response.data['bridge_server']+':'+BRIDGE_SOCKET_PORT;
        let robot_bridge_files_url:string = response.data['bridge_server']+':'+BRIDGE_FILES_PORT+'/%SECRET%/%ROBOT_ID%/%URL%';
        res.render('robot_ui', {
            id_robot: req.params.ID,
            bridge_socket_url: robot_bridge_sever, //
            bridge_files_url: robot_bridge_files_url,
            app_id: APP_ID,
            analytics_code: ANALYTICS_CODE ? ANALYTICS_CODE.join('\n') : '',
            ui_git_version: UI_GIT_VERSION,
        });
    })
    .catch((error:AxiosError) => {
        if (error.code === 'ECONNABORTED') {
            $d.err('Locating request timed out for '+idRobot+' ('+BRIDGE_LOCATE_URL+')');
            res.send('Timed out locating robot on Cloud Bridge');
        }
        if (error.code === 'ECONNREFUSED') {
            $d.err('Locating request refused for '+idRobot+' ('+BRIDGE_LOCATE_URL+')');
            res.send('Error connecing to Cloud Bridge, connection refused');
        }
        else if (error.status == 404) {
            $d.err('Locate returned code 404 for '+idRobot+' ('+BRIDGE_LOCATE_URL+')');
            res.send('Robot not found on Cloud Bridge');
        } else {
            $d.err('Error locating robot '+idRobot+' at '+BRIDGE_LOCATE_URL+':', error.message);
            res.send('Error locating robot on Cloud Bridge, Web UI seems misconfigured (err: '+error.code+')');
        }
    });
});

webHttpServer.listen(UI_PORT);
console.log(('HTTPS server listening on port '+UI_PORT).green);
