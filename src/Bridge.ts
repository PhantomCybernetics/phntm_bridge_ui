const startupTime:number = Date.now();

import { Debugger } from './lib/debugger';
const $d:Debugger = Debugger.Get('[Bridge]');

import { RegisterRobot, GetCerts, UncaughtExceptionHandler } from './lib/helpers'
const bcrypt = require('bcrypt-nodejs');

// includes start //

const fs = require('fs');

import * as C from 'colors'; C; //force import typings with string prototype extension



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

class Robot {
    id_robot: ObjectId;
    name: string;
    type: ObjectId;
    isConnected: boolean;
    isAuthentificated: boolean;
    socket: SocketIO.Socket;
    topics: {topic: string, subscribed:boolean, msgTypes:string[]}[];

    static connectedRobots:Robot[] = [];

    public AddToConnedted() {
        if (Robot.connectedRobots.indexOf(this) == -1) {
            Robot.connectedRobots.push(this);
            this.StateToSubscribers();
        }
    }

    public RemoveFromConnedted() {
        let index = Robot.connectedRobots.indexOf(this);
        if (index != -1) {
            Robot.connectedRobots.splice(index, 1);
            this.StateToSubscribers();
        }
    }

    static GetStateData(id: ObjectId, robot?:Robot):any {
        let data:any = {
            id_robot: id.toString()
        }
        if (robot)
            data['name'] =  robot.name ? robot.name : 'Unnamed Robot';
        if (robot && robot.socket)
            data['ip'] =  robot.socket.handshake.address;

        return data;
    }

    public StateToSubscribers():void {
        App.connectedApps.forEach(app => {
            if (app.IsSubscribedToRobot(this.id_robot)) {
                app.socket.emit('robot', Robot.GetStateData(this.id_robot, this))
            }
        });
    }

    public TopicsToSubscribers():void {
        let robotTopicsData:any = {}
        robotTopicsData[this.id_robot.toString()] = this.topics;
        App.connectedApps.forEach(app => {
            if (app.IsSubscribedToRobot(this.id_robot)) {
                app.socket.emit('topics', robotTopicsData)
            }
        });
    }


    public static FindConnected(idSearch:ObjectId):Robot|null {
        for (let i = 0; i < Robot.connectedRobots.length; i++)
        {
            if (!Robot.connectedRobots[i].id_robot)
                continue;
            if (Robot.connectedRobots[i].id_robot.equals(idSearch))
                return Robot.connectedRobots[i];
        }
        return null;
    }
}



class App {
    id_app: ObjectId;
    isConnected: boolean;
    isAuthentificated: boolean;
    socket: SocketIO.Socket;
    robotSubscriptions: ObjectId[];

    static connectedApps:App[] = [];

    public AddToConnedted() {
        if (App.connectedApps.indexOf(this) == -1) {
            App.connectedApps.push(this);
        }
    }

    public RemoveFromConnedted() {
        let index = App.connectedApps.indexOf(this);
        if (index != -1) {
            App.connectedApps.slice(index, 1);
        }
    }

    public SubScribeRobot(idRobot: ObjectId) {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].equals(idRobot))
                return;
        }
        this.robotSubscriptions.push(idRobot);
    }

    public IsSubscribedToRobot(idRobot: ObjectId):boolean {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].equals(idRobot))
                return true;
        }
        return false;
    }
}

// load config & ssl certs //

const dir:string  = __dirname + "/..";

if (!fs.existsSync(dir+'/config.jsonc')) {
    $d.e('CONFIG EXPECTED AND NOT FOUND IN '+dir+'/config.jsonc');
    process.exit();
};

import * as JSONC from 'comment-json';
const defaultConfig = JSONC.parse(fs.readFileSync(dir+'/config.jsonc').toString());
const CONFIG = _.merge(defaultConfig);

const SIO_PORT:number = CONFIG['BRIDGE'].sioPort;
const UI_PORT:number = CONFIG['BRIDGE'].webPort;
const PUBLIC_ADDRESS:string = CONFIG['BRIDGE'].address;
const DB_URL:string = CONFIG.dbUrl;

const DIE_ON_EXCEPTION:boolean = CONFIG.dieOnException;

const VERBOSE:boolean = CONFIG['BRIDGE'].verbose;

const certFiles:string[] = GetCerts(dir+"/ssl/private.pem", dir+"/ssl/public.crt");
const HTTPS_SERVER_OPTIONS = {
    key: fs.readFileSync(certFiles[0]),
    cert: fs.readFileSync(certFiles[1]),
};

console.log('-----------------------------------------------------------------------'.yellow);
console.log(' PHNTM BRIDGE NODE'.yellow);
console.log('');
console.log((' https://localhost:'+SIO_PORT+'/info                     System info JSON').yellow);
console.log((' https://localhost:'+SIO_PORT+'/robot/socket.io/         Robot API').green);
console.log((' https://localhost:'+SIO_PORT+'/robot/register?yaml      Register new robot').green);
console.log(('                                                         & download config YAML/JSON').green);
console.log((' https://localhost:'+UI_PORT+'/robot/__ID__              Robot web UI').green);
console.log((' https://localhost:'+SIO_PORT+'/human/socket.io/         Human API').red);
console.log((' https://localhost:'+SIO_PORT+'/app/socket.io/           App API').green);
//console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log('----------------------------------------------------------------------'.yellow);

// important global stuffs on this node defined here:
let activeUsers : { [id:number]:any } = {}; // all users active in this region
let activeLocations: { [id:number]:any } = {}; // all areas loaded and active in this region
let activeRobots: { [iRobot:number]:any } = {}; // all areas loaded and active in this region
let db:Db = null;
let humansCollection:Collection = null;
let robotsCollection:Collection = null;

//let knownAppKeys:string[] = [];



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

    $d.log("We are connected to", DB_URL);

    db = client.db('phntm');
    humansCollection = db.collection('humans');
    robotsCollection = db.collection('robots');

    sioHttpServer.listen(SIO_PORT);
    webHttpServer.listen(UI_PORT);
    $d.l('SIO Server listening on port '+SIO_PORT+'; Web UI listening on port '+UI_PORT);
}).catch(()=>{
    $d.err("Error connecting to", DB_URL);
    process.exit();
});

// Robot Socket.io

sioRobots.on('connect', async function(robotSocket : SocketIO.Socket){

    $d.log('Ohai robot! Opening Socket.io for', robotSocket.handshake.address);

    let robot:Robot = new Robot()

    robot.isConnected = true;
    robot.isAuthentificated = false;
    robot.id_robot = null;
    robot.topics = [];
    robot.socket = robotSocket;
    //$d.log(socket);

    /*let user : User = new User(socket);
    user.isConnected = true;
    user.regionPartition = REGION_PARTITION;
    user.isAuthentificated = false;

    user.idSession = null; //generated on login
    user.shortUserId = 0; //generated on login, short sess pass / id

    //init cave fix to zero
    //user.caveFix = mat4.create(); mat4.identity(user.caveFix);

    socket.user = user;
    */
    /*
     * client auth
     */
    robotSocket.on('auth', async function(data:{id:string, key:string, name?:string}, returnCallback) {

        robot.isAuthentificated = false;

        if (!ObjectId.isValid(data.id)) {

            return returnCallback({'err':1});
        }

        let searchId = new ObjectId(data.id);
        const dbRobot = (await robotsCollection.findOne({_id: searchId }));

        if (dbRobot) {
            bcrypt.compare(data.key, dbRobot.key_hash, function(err:any, res:any) {
                if (res) { //pass match => good
                    $d.l(('Robot '+data.id+' connected from '+robotSocket.handshake.address).green);

                    robot.id_robot = dbRobot._id;
                    robot.isAuthentificated = true;
                    robot.name = data.name;
                    robot.AddToConnedted();

                    return returnCallback(({'success': {
                        id: robot.id_robot.toString(),
                        name: robot.name,
                        type: robot.type ? robot.type.toString() : null
                    }}));
                } else {
                    $d.l(('Robot key missmatch for id '+data.id).cyan);
                    return returnCallback({'err':1});

                }
            });

        } else {
            $d.l(('Robot not found for id '+data.id).cyan);
            return returnCallback({'err':1});
        }
    });

    robotSocket.on('topics', async function(allTopics:any[]) {

        if (!robot.isAuthentificated || !robot.isConnected)
            return;

        $d.l("Got topics from "+robot.id_robot+":");
        allTopics.forEach(topicData => {
            let topic = topicData[0];
            let subscribed:boolean = topicData[1];
            let msgTypes = [];
            for (let i = 2; i < topicData.length; i++) {
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
                    subscribed: subscribed,
                    msgTypes: msgTypes
                });
                report = true;
            } else {
                if (currTopic.subscribed != subscribed) {
                    currTopic.subscribed = subscribed;
                    report = true;
                }
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
                let out = " "+topic+" ("+msgTypes.join(', ')+")";
                $d.l(subscribed ? out.green : out.gray);
            }

        });

        robot.TopicsToSubscribers();


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
        robot.socket = null;
        robot.RemoveFromConnedted();

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





sioApps.on('connect', async function(appSocket : SocketIO.Socket){

    $d.log('Ohai app! Opening Socket.io for', appSocket.handshake.address);

    let app:App = new App()
    app.socket = appSocket;
    app.robotSubscriptions = [];
    // TODO handle auth with middleware
    // $d.log('AUTH:', socket.handshake.auth); // prints { token: "abcd" }
    app.AddToConnedted();

    appSocket.on('robot', async function (data:{id:string}, returnCallback) {
        $d.log('App requesting robot', data);

        if (!ObjectId.isValid(data.id))
            return returnCallback({'err':1});

        let searchId = new ObjectId(data.id);


        let robot = Robot.FindConnected(searchId);

        if (!robot) {
            //check it exists
            const dbRobot = (await robotsCollection.findOne({_id: searchId }));
            if (!dbRobot) {
                return returnCallback({'err':1});
            }
        }

        app.SubScribeRobot(searchId);

        returnCallback(Robot.GetStateData(searchId, robot));

        if (robot) {
            robot.TopicsToSubscribers();
        }

        return;

        /*
        let connectedRobot:RobotSocket = null;
        for (let i = 0; i < connectedRobots.length; i++) {
            if (connectedRobots[i].id_robot.equals(searchId)) {
                connectedRobot = connectedRobots[i];
                break;
            }
        }



        if (!robot)
            return res.send('Robot not found');

        bcrypt.compare(req.query.key, robot.key_hash, function(errBcrypt:any, resBcrypt:any) {
            if (!resBcrypt)
                return res.send('Access denied');

            if (!connectedRobot)
                return res.send('Robot not connected');

            let robot_data = {
                id_robot: connectedRobot.id_robot,
                ip: connectedRobot.handshake.address,
                topics: connectedRobot.robotTopics
            }
            //res.send(JSON.stringify(robot_data, null, 4));


        });
        */

    });

    appSocket.on('disconnecting', (reason:any) => {
        $d.l(('Socket disconnecting from app: '+reason).gray);
        app.RemoveFromConnedted();
    });
});






import * as path from 'path'
import * as ejs from 'ejs';

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

    res.render('robot', {
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