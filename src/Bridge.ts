const startupTime:number = Date.now();

import { Debugger } from './lib/debugger';
const $d:Debugger = Debugger.Get('[Cloud Bridge]');

import { RegisterRobot, RegisterApp, GetCerts, UncaughtExceptionHandler } from './lib/helpers'
const bcrypt = require('bcrypt-nodejs');

// includes start //

const fs = require('fs');

import * as C from 'colors'; C; //force import typings with string prototype extension


//import { MessageReader } from "@foxglove/rosmsg2-serialization"

const _ = require('lodash');

// import { Validation as $v} from './lib/validation';

const https = require('https');

//import { AuthLib } from './lib/auth';

//const { MongoClient } = require("mongodb");
//MongoLogger.setLevel("debug");
//const mongoClient = require('mongodb').MongoClient;
import { MongoClient, Db, Collection, MongoError, InsertOneResult, ObjectId } from 'mongodb';

// import { RouteObjectStateByKey, RouteAppCmdByKey, RouteAppStateByKey, RouteSessionStateByKey } from './lib/topicRouters';


import * as SocketIO from "socket.io";

import { App, AppSocket } from './lib/app'
import { Robot, RobotSocket } from './lib/robot'

// load config & ssl certs //

const dir:string  = __dirname + "/..";

if (!fs.existsSync(dir+'/config.jsonc')) {
    $d.e('CONFIG EXPECTED AND NOT FOUND IN '+dir+'/config.jsonc');
    process.exit();
};

import * as path from 'path'
import * as ejs from 'ejs';
import { off } from 'process';

import * as JSONC from 'comment-json';
const defaultConfig = JSONC.parse(fs.readFileSync(dir+'/config.jsonc').toString());
const CONFIG = _.merge(defaultConfig);

const SIO_PORT:number = CONFIG['BRIDGE'].sioPort;
const UI_PORT:number = CONFIG['BRIDGE'].webPort;
const PUBLIC_ADDRESS:string = CONFIG['BRIDGE'].address;
const DB_URL:string = CONFIG.dbUrl;

const SSL_CERT_PRIVATE =  CONFIG['BRIDGE'].ssl.private;
const SSL_CERT_PUBLIC =  CONFIG['BRIDGE'].ssl.public;

const DIE_ON_EXCEPTION:boolean = CONFIG.dieOnException;

const VERBOSE:boolean = CONFIG['BRIDGE'].verbose;

const MSG_TYPES_DIR = CONFIG['BRIDGE'].msgTypesDir;
const MSG_TYPES_JSON_FILE = CONFIG['BRIDGE'].msgTypesJsonFile;

const certFiles:string[] = GetCerts(dir+"/"+SSL_CERT_PRIVATE, dir+"/"+SSL_CERT_PUBLIC);
const HTTPS_SERVER_OPTIONS = {
    key: fs.readFileSync(certFiles[0]),
    cert: fs.readFileSync(certFiles[1]),
};


////////////////////////////////////////////////////////////////////////////////////

import { MessageReader } from "@foxglove/rosmsg2-serialization"
import { MessageWriter } from "@foxglove/rosmsg2-serialization";

import { ImportMessageTypes } from './lib/messageTypesImporter';


/*
let def_Time = fs.readFileSync(dir+'/static/msg_types/buildin_interfaces/Time.msg').toString()
const timeDefinitions:MessageDefinition[] = parse(def_Time, { ros2:true, skipTypeFixup:true }); // for ROS 2 definitions
//console.log('Time:', JSON.stringify(timeDefinition, null, 2));

let def_Header = fs.readFileSync(dir+'/static/msg_types/std_msgs/Header.msg').toString()
const headerDefinitions:MessageDefinition[] = parse(def_Header, { ros2:true, skipTypeFixup:true }); // for ROS 2 definitions
//console.log('Header:', JSON.stringify(headerDefinition, null, 2));


let def_BatteryState = fs.readFileSync(dir+'/static/msg_types/sensor_msgs/BatteryState.msg').toString()
const batteryStateDefinitions:MessageDefinition[] = parse(def_BatteryState, { ros2:true, skipTypeFixup:true }); // for ROS 2 definitions

let allDefinitions = [].concat(timeDefinitions).concat(headerDefinitions).concat(batteryStateDefinitions);
*/


// let hex = //'00 01 00 00 c5 f6 72 64 30 dc 73 10 08 00 00 00 62 61 74 74 65 72 79 00 c1 15 43 41 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00'
//           '00 01 00 00 01 00 00 00 c1 f6 72 64 e7 47 6f 12 05 00 00 00 6f 64 6f 6d 00 6c 69 6e 0a 00 00 00 62 61 73 65 5f 6c 69 6e 6b 00 65 6c de 29 a7 a1 d4 48 53 bf d1 2e e8 8c 09 13 36 bf 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 a4 b2 ec 4a 70 75 c2 3f 2f 80 36 04 5f aa ef 3f'
//           ;
// let msg_type = //'sensor_msgs/msg/BatteryState'
//             'tf2_msgs/msg/TFMessage'
//             ;

// hex = hex.replace(' ', '');
// let payload = new Uint8Array(hex.match(/[\da-f]{2}/gi).map(function (h) {
//   return parseInt(h, 16)
// }))

// console.log('Payload '+payload.byteLength+'B: '+hex);


// let msg_type_def = null;

// for (let i = 0; i < allDefinitions.length; i++) {
//     if (allDefinitions[i].name == msg_type) {
//         msg_type_def = allDefinitions[i];
//         break;
//     }
// }
// if (!msg_type_def) {
//     $d.err('No msg type def found for '+msg_type);
//     process.exit(1)
// }

// try {
//    const reader = new MessageReader( [] );
//    const writer = new MessageWriter( [] );

//     // // deserialize a buffer into an object
//     const message = reader.readMessage(payload);

//     console.log('message: ', message);

// } catch (e) {
//     $d.err('Error while reading: '+e.message);
// }

// process.exit(1)


////////////////////////////////////////////////////////////////////////////////////



console.log('-----------------------------------------------------------------------'.yellow);
console.log(' PHNTM BRIDGE NODE'.yellow);
console.log('');
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/info                     System info JSON').yellow);
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/robot/socket.io/         Robot API').green);
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/robot/register?yaml      Register new robot').green);
console.log(('                                                          & download config YAML/JSON').green);
console.log((' '+PUBLIC_ADDRESS+':'+UI_PORT+'/robot/__ID__              Robot web UI').green);
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/human/socket.io/         Human API').red);
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/app/socket.io/           App API').green);
console.log((' '+PUBLIC_ADDRESS+':'+SIO_PORT+'/app/register             Register new App').green);
//console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log('----------------------------------------------------------------------'.yellow);

// important global stuffs on this node defined here:
let activeUsers : { [id:number]:any } = {}; // all users active in this region
let activeLocations: { [id:number]:any } = {}; // all areas loaded and active in this region
let activeRobots: { [iRobot:number]:any } = {}; // all areas loaded and active in this region
let db:Db = null;
let humansCollection:Collection = null;
let robotsCollection:Collection = null;
let appsCollection:Collection = null;

//let knownAppKeys:string[] = [];

let imporrtedDefinitions = ImportMessageTypes(dir, MSG_TYPES_DIR, MSG_TYPES_JSON_FILE);

const reader = new MessageReader( imporrtedDefinitions );
const writer = new MessageWriter( imporrtedDefinitions );

import * as express from "express";

const sioExpressApp = express();
const sioHttpServer = https.createServer(HTTPS_SERVER_OPTIONS, sioExpressApp);

const sioRobots:SocketIO.Server = new SocketIO.Server(
    sioHttpServer, {
        pingInterval: 10000,
        pingTimeout: 60*1000,
        path: "/robot/socket.io/"
    }
);

const sioHumans:SocketIO.Server = new SocketIO.Server(
    sioHttpServer, {
        pingInterval: 10000,
        pingTimeout: 60*1000,
        path: "/human/socket.io/"
    }
);

const sioApps:SocketIO.Server = new SocketIO.Server(
    sioHttpServer, {
        pingInterval: 10000,
        pingTimeout: 60*1000,
        path: "/app/socket.io/",
        cors: {
            origin: '*',
        }
    }
);

sioExpressApp.get('/', function(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({
        phntm_bridge: true,
        robot: '/robot/socket.io/',
        human: '/human/socket.io/',
        app: '/app/socket.io/',
    }, null, 4));
});

sioExpressApp.get('/info', function(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');

    let robot_data:any[] = [ {
        connectedRobots:
        Robot.connectedRobots.length,
        time: new Date()
    }];
    let connectedData = [];
    for (let i = 0; i < Robot.connectedRobots.length; i++) {
        let id_robot:string = (Robot.connectedRobots[i].id_robot as ObjectId).toString();
        let one = {};
        let ui_url = PUBLIC_ADDRESS+':'+UI_PORT+'/robot/'+id_robot;
        connectedData.push(ui_url);
    }
    robot_data.push({
        connectedRobots: connectedData
    })
    res.send(JSON.stringify(robot_data, null, 4));
});

sioExpressApp.get('/robot/register', async function(req:express.Request, res:express.Response) {
    return RegisterRobot(
        req, res, new ObjectId().toString(),
        robotsCollection, PUBLIC_ADDRESS, SIO_PORT
    );
});

sioExpressApp.get('/app/register', async function(req:express.Request, res:express.Response) {
    return RegisterApp(
        req, res, new ObjectId().toString(),
        appsCollection
    );
});


//const uri = "<connection string uri>";
// $d.log('conecting to db');
const mongoClient = new MongoClient(DB_URL);
// $d.log(mongoClient.    );
//const database = mongoClient.db('phntm');
// $d.log(database);

mongoClient.connect().then((client:MongoClient) => {
    //DB_URL, , function(err:any,database:any) {
    // if(err) {
    //     $d.log("Error connecting to database!".red);

    // }

    $d.log(("We are connected to "+DB_URL).green);

    db = client.db('phntm');
    humansCollection = db.collection('humans');
    robotsCollection = db.collection('robots');
    appsCollection = db.collection('apps');

    sioHttpServer.listen(SIO_PORT);
    webHttpServer.listen(UI_PORT);
    $d.l(('SIO Server listening on port '+SIO_PORT+'; Web UI listening on port '+UI_PORT).green);
}).catch(()=>{
    $d.err("Error connecting to", DB_URL);
    process.exit();
});



// Robot Socket.io
sioRobots.use(async(robotSocket:RobotSocket, next) => {

    //err.data = { content: "Please retry later" }; // additional details
    let idRobot = robotSocket.handshake.auth.id_robot;

    if (!ObjectId.isValid(idRobot)) {
        $d.err('Invalidid id_robot provided: '+idRobot)
        const err = new Error("Access denied");
        return next(err);
    }
    if (!robotSocket.handshake.auth.key) {
        $d.err('Missin key from: '+idRobot)
        const err = new Error("Missing auth key");
        return next(err);
    }

    let searchId = new ObjectId(idRobot);
    const dbRobot = (await robotsCollection.findOne({_id: searchId }));

    if (dbRobot) {
        bcrypt.compare(robotSocket.handshake.auth.key, dbRobot.key_hash, function(err:any, res:any) {
            if (res) { //pass match => good
                $d.l(('Robot '+idRobot+' connected from '+robotSocket.handshake.address).green);
                robotSocket.dbData = dbRobot;
                return next();

            } else { //invalid key
                $d.l(('Robot '+idRobot+' auth failed for '+robotSocket.handshake.address).red);
                const err = new Error("Access denied");
                return next(err);
            }
        });

    } else { //robot not found
        $d.l(('Robot '+idRobot+' not found in db for '+robotSocket.handshake.address).red);
        const err = new Error("Access denied");
        return next(err);
    }
});

sioRobots.on('connect', async function(robotSocket : RobotSocket){

    let robot:Robot = new Robot()
    robot.id_robot = robotSocket.dbData._id;
    robot.name = robotSocket.handshake.auth.name ?
                    robotSocket.handshake.auth.name :
                        (robotSocket.dbData.name ? robotSocket.dbData.name : 'Unnamed Robot' );

    $d.log(('Ohi, robot '+robot.name+' aka '+robot.id_robot.toString()+' connected to Socket.io').cyan);

    robot.isAuthentificated = true;

    robot.isConnected = true;

    robot.topics = [];
    robot.services = [];
    robot.cameras = [];
    robot.docker_containers = [];
    robot.discovery = false;
    robot.socket = robotSocket;

    robot.AddToConnedted(); //sends update to subscribers

    robotSocket.on('topics', async function(allTopics:any[]) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got topics from "+robot.id_robot+":");
        allTopics.forEach(topicData => {
            let topic = topicData[0];
            // let robotSubscribed:boolean = topicData[1];
            let msgTypes = [];
            for (let i = 1; i < topicData.length; i++) {
                msgTypes.push(topicData[i]); //msg types all the way
            }

            let report = false;
            let currTopic = null;
            for (let i = 0; i < robot.topics.length; i++) {
                if (robot.topics[i].topic == topic) {
                    currTopic = robot.topics[i];
                    break;
                }
            }
            if (!currTopic) {
                robot.topics.push({
                    topic: topic,
                    msgTypes: msgTypes
                });
                report = true;
            } else {
                if (currTopic.msgTypes.length != msgTypes.length) {
                    currTopic.msgTypes = msgTypes;
                    report = true;
                } else {
                    for (let i = 0; i < msgTypes.length; i++) {
                        if (currTopic.msgTypes[i] != msgTypes[i]) {
                            currTopic.msgTypes[i] = msgTypes[i];
                            report = true;
                        }
                    }
                }
            }

            if (report) {
                let out = "  "+topic+" ("+msgTypes.join(', ')+")";
                $d.l(out.gray);
            }

        });

        robot.TopicsToSubscribers();
    });

    robotSocket.on('services', async function(allServices:any[]) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got services from "+robot.id_robot+":");
        allServices.forEach(serviceData => {
            let service = serviceData[0];
            //let robotSubscribed:boolean = topicData[1];
            let msgType = serviceData[1];

            let report = false;
            let currService = null;
            for (let i = 0; i < robot.services.length; i++) {
                if (robot.services[i].service == service) {
                    currService = robot.services[i];
                    break;
                }
            }
            if (!currService) {
                robot.services.push({
                    service: service,
                    msgType: msgType
                });
                report = true;
            } else {

                if (currService.msgType !== msgType) {
                    currService.msgType = msgType;
                    report = true;
                }
            }

            if (report) {
                let out = "  "+service+" ("+msgType+")";
                $d.l(out.gray);
            }

        });

        robot.ServicesToSubscribers();
    });


    robotSocket.on('cameras', async function(allCameras:any[]) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got cameras from "+robot.id_robot+":");
        allCameras.forEach(cameraData => {
            let idCam = cameraData[0];
            //let robotSubscribed:boolean = topicData[1];
            let camInfo = cameraData[1];

            let report = false;
            let currCamera = null;
            for (let i = 0; i < robot.cameras.length; i++) {
                if (robot.cameras[i].id == idCam) {
                    currCamera = robot.cameras[i];
                    break;
                }
            }
            if (!currCamera) {
                robot.cameras.push({
                    id: idCam,
                    info: camInfo
                });
                report = true;
            } else {

                if (currCamera.info['Model'] !== camInfo['Model']) {
                    currCamera.info['Model']  = camInfo['Model'];
                    report = true;
                }
                if (currCamera.info['Location'] !== camInfo['Location']) {
                    currCamera.info['Location']  = camInfo['Location'];
                    report = true;
                }
                if (currCamera.info['Rotation'] !== camInfo['Rotation']) {
                    currCamera.info['Rotation']  = camInfo['Rotation'];
                    report = true;
                }
            }

            if (report) {
                let out = "  "+idCam;
                $d.l(out.cyan);
            }

        });

        robot.CamerasToSubscribers();
    });

    robotSocket.on('docker', async function(allContainers:{id: string, name:string, image:string, short_id: string, status:string }[]) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got Docker containers from "+robot.id_robot+":");
        allContainers.forEach(contData => {

            let report = false;
            let currContainer = null;
            for (let i = 0; i < robot.docker_containers.length; i++) {
                if (robot.docker_containers[i].id == contData.id) {
                    currContainer = robot.docker_containers[i];
                    break;
                }
            }
            if (!currContainer) {
                robot.docker_containers.push(contData);
                currContainer = contData;
                report = true;
            } else {

                if (currContainer.image !== contData.image) {
                    currContainer.image = contData.image
                    report = true;
                }
                if (currContainer.short_id !== contData.short_id) {
                    currContainer.short_id = contData.short_id
                    report = true;
                }
                if (currContainer.status !== contData.status) {
                    currContainer.status = contData.status
                    report = true;
                }
            }

            if (report) {
                let out = "  "+currContainer.name+" ("+currContainer.status+")";
                $d.l(out.gray);
            }

        });

        robot.DockerContainersToSubscribers();
    });

    robotSocket.on('discovery', async function(state:boolean) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got discovery state from "+robot.id_robot+": "+state);

        robot.discovery = state;

        robot.DiscoveryToSubscribers();
    });


    /*if (user.loginInProgress) {
        return returnCallback({ res: 0, msg: 'Another login in progress' });
    }

    if (data && !data.clientVersion) {
        return returnCallback({ res: 0, msg: 'Client version not provided' });
    } else if (data && data.clientVersion && data.clientVersion < 0.1) {
        if (data['password']) { data['password'] = '****'; } //safe logs
        $d.err("Invalid client version received from "+user.clientAddress+" with data", data);
        return returnCallback({ res: 0, msg: "Unsupported client version detected, update Phantom via the App Store!\n(consider automatic updates for better experience)" });
    }

    if (data) {

        if ($v.isSet(data.clientType)) { user.clientType = data.clientType; }
        if ($v.isSet(data.deviceType)) { user.deviceType = data.deviceType; }

        if (!data.gps) {
            $d.err("Client GPS coords not provided");
            return returnCallback( { 'res':0, 'msg':'No GPS coordinates provided'} );
        }
        if (!data.gpsAccuracy || !$v.isSet(data.gpsAccuracy[0]) || !$v.isSet(data.gpsAccuracy[1])) {
            $d.err("Gps accuracy not provided or invalid", data.gpsAccuracy);
            return returnCallback( { 'res':0, 'msg':'No or invalid GPS accuracy provided'} );
        }
        user.lastGps = new Gps(data.gps[0], data.gps[1], data.gps[2]);
        user.gpsAccuracy = data.gpsAccuracy[0];

        if (!data.northVector) {
            $d.err("Session north vector not provided");
            return returnCallback( { 'res':0, 'msg':'No session north vector provided'} );
        }
        user.northVector = vec3.fromValues(data.northVector[0], data.northVector[1], data.northVector[2]);
        if (!$v.isSet(data.compassAccuracy)) {
            $d.err("Compass accuracy not provided");
            return returnCallback( { 'res':0, 'msg':'No compass accuracy provided'} );
        }
        user.compassAccuracy = data.compassAccuracy;

        if (!$v.isSet(data.deviceSensorOffset)) {
            $d.err("Device sensor offset not provided");
            return returnCallback( { 'res':0, 'msg':'Device sensor offset not provided'} );
        }
        user.deviceSensorOffset = data.deviceSensorOffset;

        $d.log('User GPS is: '.gray+(user.lastGps? user.lastGps.toString():'null').yellow+(' (h-acc='+data.gpsAccuracy[0]+'); ' +
                'north vector: ['+ArrayToFixed(user.northVector)+'] (compass acc='+user.compassAccuracy+')').gray);

        //try session id login
        if ($v.isSet(data.sessionCookie)) {
            user.loginInProgress = true;

            return AuthLib.LoginWithSessionCookieAsync( //calls returnCallback with { res: 0 } or { res: 1, userData: {} }
                data.sessionCookie, user, activeUsers,
                worldDb, appsDb,
                kafkaProducer, activeSessions, STATIC_SERVER_ADDRESS, returnCallback, VERBOSE,
                () => { //onSuccess when session is created:
                    //SessionHelpers.LocalizeEveryoneFollowingUser(user.idUser, activeSessions, activeUsers, sessionObjects, appObjects, loadingAppObjectBatches, kafkaProducer);
                }
            );
        }

        //anonymous but unique device id
        else if ($v.isSet(data.idDevice) && data.idDevice) {
            user.loginInProgress = true;
            return AuthLib.AnonymousLoginWithIdDeviceAsync ( //calls returnCallback with { res: 0 } or { res: 1, userData: {} }
                data.idDevice, user, DEFAULT_USER_APP_KEYS, activeUsers,
                worldDb, appsDb,
                kafkaProducer, activeSessions, STATIC_SERVER_ADDRESS, returnCallback, VERBOSE,
                () => { //onSuccess after session is created
                    //SessionHelpers.LocalizeEveryoneFollowingUser(user.idUser, activeSessions, activeUsers, sessionObjects, appObjects, loadingAppObjectBatches, kafkaProducer);
                }
            );
        }

        //credentials
        else if ($v.isSet(data.handle) && $v.isSet(data.password) && data.handle && data.password) {
            user.loginInProgress = true;
            return AuthLib.LoginWithCredentialsAsync ( //calls returnCallback with { res: 0 } or { res: 1, userData: {} }
                data.handle, data.password, user, activeUsers,
                worldDb, appsDb,
                kafkaProducer, activeSessions, STATIC_SERVER_ADDRESS, returnCallback, VERBOSE,
                () => { //onSuccess after session is created
                    //SessionHelpers.LocalizeEveryoneFollowingUser(user.idUser, activeSessions, activeUsers, sessionObjects, appObjects, loadingAppObjectBatches, kafkaProducer);
                }
            );
        }
    }

    //user log out (but still connected)
    else if (!data && user) {

        $d.log((user+' logged out from '+user.clientAddress).blue);

        SessionHelpers.ClearUser(user, activeUsers, activeSessions, activeAreas, sessionObjects, activeObjects, kafkaProducer, VERBOSE);

        //loged out but not disconnected - make a new session obj bcs the old one is destroyed
        user = new User(socket);
        user.isConnected = true;
        user.regionPartition = REGION_PARTITION;
        user.isAuthentificated = false;
        user.idSession = new ObjectID().toHexString();

        //init cave fix to zero
        //user.caveFix = mat4.create(); mat4.identity(user.caveFix);

        socket.user = user;

        returnCallback({ res: 1 });

        return;

    }
    */


    /*
     * client disconnected
     */
    robotSocket.on('disconnect', (data:any) => {

        $d.l(('Socket disconnect for robot: '+data).red);
        robot.isAuthentificated = false;
        robot.isConnected = false;
        robot.topics = null;
        robot.services = null;
        robot.socket = null;
        robot.RemoveFromConnedted(!shuttingDown);

        /*if (user != null && user.clientType == ClientType.PHNTM) {
            $d.log((user+' at '+user.clientAddress+' disconnected').blue);
            SessionHelpers.ClearUser(user, activeUsers, activeSessions, activeAreas, sessionObjects, activeObjects, kafkaProducer, VERBOSE);

        } else if (user != null) {
            $d.log((NodeTypeToName(user.clientType, [ user.regionPartition ]) +' at '+user.clientAddress+' disconnected'));
        }*/

        //SessionHelpers.ClientDisconnectHandler(user, activeUsers, activeSessions, sessionObjects, activeObjects, kafkaProducer);
    });

    robotSocket.on('disconnecting', (reason:any) => {
        $d.l(('Socket disconnecting from robot: '+reason).gray);
    });

});

// App Socket.io
sioApps.use(async (appSocket:AppSocket, next) => {

    //err.data = { content: "Please retry later" }; // additional details
    let idApp = appSocket.handshake.auth.id_app;
    let key = appSocket.handshake.auth.key;

    if (!ObjectId.isValid(idApp)) {
        $d.err('Invalidid id_app provided: '+idApp)
        const err = new Error("Access denied");
        return next(err);
    }

    if (!appSocket.handshake.auth.key) {
        $d.err('Missin key from: '+idApp)
        const err = new Error("Missing auth key");
        return next(err);
    }

    let searchId = new ObjectId(idApp);
    const dbApp = (await appsCollection.findOne({_id: searchId }));

    if (dbApp) {
        bcrypt.compare(appSocket.handshake.auth.key, dbApp.key_hash, function(err:any, res:any) {
            if (res) { //pass match => good
                $d.l(('App '+idApp+' connected from '+appSocket.handshake.address).green);
                appSocket.dbData = dbApp;
                return next();

            } else { //invalid key
                $d.l(('App '+idApp+' auth failed for '+appSocket.handshake.address).red);
                const err = new Error("Access denied");
                return next(err);
            }
        });

    } else { //app not found
        $d.l(('App '+idApp+' not found in db for '+appSocket.handshake.address).red);
        const err = new Error("Access denied");
        return next(err);
    }
});

sioApps.on('connect', async function(appSocket : AppSocket){

    let app:App = new App(); //id instance generated in constructor
    app.id_app = new ObjectId(appSocket.handshake.auth.id_app)
    app.name = appSocket.dbData.name;
    app.socket = appSocket;
    app.isConnected = true;
    app.robotSubscriptions = [];

    $d.log(('Ohi, app '+app.name+' aka '+app.id_app.toString()+' (inst '+app.id_instance.toString()+') connected to Socket.io').cyan);

    app.AddToConnedted();

    appSocket.on('robot', async function (data:{id:string}, returnCallback) {
        $d.log('App requesting robot', data);

        if (!ObjectId.isValid(data.id))
            return returnCallback({'err':1});

        let idRobot = new ObjectId(data.id);

        let robot = Robot.FindConnected(idRobot);

        if (!robot) {
            //check it exists
            const dbRobot = (await robotsCollection.findOne({_id: idRobot }));
            if (!dbRobot) {
                return returnCallback({'err':1}); //invalid id
            }
        }

        app.SubScribeRobot(idRobot);

        returnCallback(Robot.GetStateData(idRobot, robot));

        if (robot) {
            app.socket.emit('topics', robot.GetTopicsData());
            app.socket.emit('services', robot.GetServicesData());
            app.socket.emit('cameras', robot.GetCamerasData());
            app.socket.emit('docker', robot.GetDockerContinersData());
        }
    });

    appSocket.on('discovery', async function (data:{id_robot:string, state:boolean, id_app?:string, id_instance?:string}, returnCallback) {
        $d.log('App requesting robot discovery', data);

        if (!ObjectId.isValid(data.id_robot))
            return returnCallback({'err':1});

        let idRobot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(idRobot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('discovery', data, (answerData:any) => {
            $d.log('Got robot\'s discovery answer:', answerData);
            return returnCallback(answerData);
        });

    });

    appSocket.on('docker', async function (data:{id_robot:string, container:boolean, msg:string, id_app?:string, id_instance?:string}, returnCallback) {
        $d.log('App calling robot docker container ', data);

        if (!ObjectId.isValid(data.id_robot))
            return returnCallback({'err':1});

        let idRobot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(idRobot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('docker', data, (answerData:any) => {
            $d.log('Got robot\'s docker call reply:', answerData);
            return returnCallback(answerData);
        });

    });

    appSocket.on('offer', async function (offer:{ id_robot:string, sdp:string, type:string, id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App sending webrtc offer to robot', offer);

        if (!offer.id_robot || !offer.sdp || !offer.type) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid offer data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(offer.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+offer.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(offer.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete offer['id_robot'];
        offer['id_app'] = app.id_app.toString();
        offer['id_instance'] = app.id_instance.toString();

        robot.socket.emit('offer', offer, (answerData:{'sdp':string, 'type':string}) => {

            $d.log('Got robot\'s answer:', answerData);

            return returnCallback(answerData);

            //if (i == 0 && returnCallback) { //only the 1st triggers reply (only 1 expected)
            //    returnCallback(replyData)
           // }
        });

    });

    appSocket.on('answer', async function (answer:{ id_robot:string, sdp:string, type:string, id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App sending webrtc answer to robot', answer);

        if (!answer.id_robot || !answer.sdp || !answer.type) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid answer data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(answer.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+answer.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(answer.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete answer['id_robot'];
        answer['id_app'] = app.id_app.toString();
        answer['id_instance'] = app.id_instance.toString();

        robot.socket.emit('answer', answer, (answerReplyData:any) => {

            $d.log('Got robot\'s answer reply:', answerReplyData);

            return returnCallback(answerReplyData);

            //if (i == 0 && returnCallback) { //only the 1st triggers reply (only 1 expected)
            //    returnCallback(replyData)
           // }
        });

    });

    appSocket.on('subcribe:read', async function (data:{ id_robot:string, topics:[string, number][], sdp_offer?:string, id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App requesting read subscription to robot with:', data);

        if (!data.id_robot || !data.topics) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid subscription data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(data.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+data.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('subscription:read', data, (resData:any) => {

            $d.log('Got robot\'s read subscription answer:', resData);

            return returnCallback(resData);
        });

    });

    appSocket.on('cameras:read', async function (data:{ id_robot:string, cameras:[string, number][], sdp_offer?:string, id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App requesting robot camera access with:', data);

        if (!data.id_robot || !data.cameras) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid subscription data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(data.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+data.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('cameras:read', data, (resData:any) => {

            $d.log('Got robot\'s camera subscription answer:', resData);

            return returnCallback(resData);
        });

    });

    appSocket.on('subcribe:write', async function (data:{ id_robot:string, topics:[string, number][], id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App requesting write subscription to robot with:', data);

        if (!data.id_robot || !data.topics) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid subscription data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(data.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+data.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('subscription:write', data, (resData:any) => {

            $d.log('Got robot\'s write subscription answer:', resData);

            return returnCallback(resData);
        });

    });

    appSocket.on('service', async function (data:{ id_robot:string, service:string, msg:any, id_app?:string, id_instance?:string}, returnCallback) {

        $d.log('App calling robot service:', data);

        if (!data.id_robot || !data.service) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid service call data'
                })
            }
            return;
        }

        if (!ObjectId.isValid(data.id_robot)) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Invalid robot id '+data.id_robot
                })
            }
            return;
        }
        let id_robot = new ObjectId(data.id_robot);
        let robot = Robot.FindConnected(id_robot);
        if (!robot || !robot.socket) {
            if (returnCallback) {
                returnCallback({
                    'err': 1,
                    'msg': 'Robot not connected'
                })
            }
            return;
        }

        delete data['id_robot'];
        data['id_app'] = app.id_app.toString();
        data['id_instance'] = app.id_instance.toString();

        robot.socket.emit('service', data, (resData:any) => {

            $d.log('Got robot\'s service call answer:', resData);

            if (returnCallback)
                return returnCallback(resData);
        });

    });

    // appSocket.on('answer', async function (app_answer_data:{ [id_robot:string]: {sdp:string, type:string}}, returnCallback) {
    //     $d.log('App sending webrtc answer to robot', app_answer_data);

    // });

       /*
     * client disconnected
     */
    appSocket.on('disconnect', (data:any) => {

        $d.l(('Socket disconnect for app: '+data).red);

        app.isAuthentificated = false;
        app.isConnected = false;
        app.socket = null;
        app.RemoveFromConnected();

        for (let i = 0; i < app.robotSubscriptions.length; i++) {
            let id_robot = app.robotSubscriptions[i];
            let robot = Robot.FindConnected(id_robot);
            if (robot && robot.socket) {
                robot.socket.emit('peer:disconnected', {
                    id_app: app.id_app.toString(),
                    id_instance: app.id_instance.toString()
                });
            }
        }

        /*if (user != null && user.clientType == ClientType.PHNTM) {
            $d.log((user+' at '+user.clientAddress+' disconnected').blue);
            SessionHelpers.ClearUser(user, activeUsers, activeSessions, activeAreas, sessionObjects, activeObjects, kafkaProducer, VERBOSE);

        } else if (user != null) {
            $d.log((NodeTypeToName(user.clientType, [ user.regionPartition ]) +' at '+user.clientAddress+' disconnected'));
        }*/

        //SessionHelpers.ClientDisconnectHandler(user, activeUsers, activeSessions, sessionObjects, activeObjects, kafkaProducer);
    });

    appSocket.on('disconnecting', (reason:any) => {
        $d.l(('Socket disconnecting from app: '+reason).gray);
    });
});



const webExpressApp = express();
const webHttpServer = https.createServer(HTTPS_SERVER_OPTIONS, webExpressApp);

webExpressApp.engine('.html', ejs.renderFile);
webExpressApp.set('views', path.join(__dirname, '../src/views'));
webExpressApp.set('view engine', 'html');
webExpressApp.use('/static/', express.static('static/'));
webExpressApp.use('/static/socket.io/', express.static('node_modules/socket.io-client/dist/'));

webExpressApp.get('/robot/:ID', async function(req:express.Request, res:express.Response) {

    let ip:string = (req.headers['x-forwarded-for'] || req.socket.remoteAddress) as string;

    res.setHeader('Content-Type', 'text/html');

    res.render('robot_ui', {
        //user: req.user, flashMessage: req.flash('info'), flashMessageError: req.flash('error'),
        //activeTab: 'models', title: 'Models',
        //models: modelItems
        id_robot: req.params.ID,
    });
});









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

    sioRobots.close();
    sioHumans.close();
    sioApps.close();
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