const startupTime:number = Date.now();

import { Debugger } from './lib/debugger';
const $d:Debugger = Debugger.Get();

import { GetCerts, UncaughtExceptionHandler } from './lib/helpers'

// includes start //

const fs = require('fs');
import * as Path from 'path';
import * as C from 'colors'; C; //force import typings with string prototype extension

import { Db, Collection, MongoError } from 'mongodb';

const _ = require('lodash');

// import { Validation as $v} from './lib/validation';

const https = require('https');

//import { AuthLib } from './lib/auth';

const mongoClient = require('mongodb').MongoClient;

// import { RouteObjectStateByKey, RouteAppCmdByKey, RouteAppStateByKey, RouteSessionStateByKey } from './lib/topicRouters';

import { ObjectId } from 'bson';
import * as SocketIO from "socket.io";

// load config & ssl certs //

const dir:string  = __dirname + "/..";

if (!fs.existsSync(dir+'/config.jsonc')) {
    $d.e('CONFIG EXPECTED AND NOT FOUND IN '+dir+'/config.jsonc');
    process.exit();
};

import * as JSONC from 'comment-json';
const defaultConfig = JSONC.parse(fs.readFileSync(dir+'/config.jsonc').toString());
const CONFIG = _.merge(defaultConfig);

const IO_PORT:number = CONFIG['BRIDGE'].ioPort;
const DB_URL:string = CONFIG.dbUrl;

const DIE_ON_EXCEPTION:boolean = CONFIG.dieOnException;

const VERBOSE:boolean = CONFIG['BRIDGE'].verbose;

const certFiles:string[] = GetCerts(dir+"/ssl/private.pem", dir+"/ssl/public.crt");
const HTTPS_SERVER_OPTIONS = {
    key: fs.readFileSync(certFiles[0]),
    cert: fs.readFileSync(certFiles[1]),
};

console.log('----------------------------------------------------------------'.yellow);
console.log(' PHNTM BRIDGE NODE'.yellow);
console.log('');
console.log((' https://hostname:'+IO_PORT+'/info           System info').yellow);
console.log((' https://hostname:'+IO_PORT+'/robot          Robot API').yellow);
console.log((' https://hostname:'+IO_PORT+'/human          Human API').yellow);
//console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log('----------------------------------------------------------------'.yellow);

// important global stuffs on this node defined here:
let activeUsers : { [id:number]:any } = {}; // all users active in this region
let activeLocations: { [id:number]:any } = {}; // all areas loaded and active in this region
let activeRobots: { [iRobot:number]:any } = {}; // all areas loaded and active in this region


//let knownAppKeys:string[] = [];



const express = require('express');
const expressApp = express();
const server = https.createServer(HTTPS_SERVER_OPTIONS, expressApp);
const io:SocketIO.Server = require('socket.io')(server, {pingInterval: 10000, pingTimeout: 60*1000});


expressApp.get('/info', function(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({info:"todo"}, null, 4));
});


server.listen(IO_PORT);
$d.l('Server listening on port '+IO_PORT);

//error handling & shutdown
process.on('uncaughtException', (err:any) => {
    UncaughtExceptionHandler(err, false);
    if (DIE_ON_EXCEPTION) {
        _Clear();
        ShutdownWhenClear();
    }
} );

process.on('SIGINT', (code:any) => {
    $d.log("Worker exiting...");
    _Clear();
    ShutdownWhenClear();
});

let shuttingDown:boolean = false;
//let cleanupTimer:NodeJS.Timeout = null;

function _Clear() {
    if (shuttingDown) return;
    shuttingDown = true;

    $d.log("Cleaning up...");

    io.close();
    //clearInterval(cleanupTimer);
    //_SaveAndClearAbandonedSessions(); //will wait until areas and sessions clear
}

function ShutdownWhenClear() {
    /*if ((consumerWrapper && consumerWrapper.connected)
        || ObjectSize(activeSessions)
        || ObjectSize(activeAreas)
    ) {
        return setTimeout(ShutdownWhenClear, 10);
    }

    if (kafkaProducerConnected) {
        kafkaProducer.disconnect();
    }

    if (kafkaProducerConnected) {
        return setTimeout(ShutdownWhenClear, 10);
    }*/

    process.exit(0);
}