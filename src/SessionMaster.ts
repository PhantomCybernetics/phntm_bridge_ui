/**
 * ///////////////////
 *     SESSION MASTER  
 * ///////////////////
 * 
 * Socket.io Server https://127.0.0.1:1337 
 *  - 'auth' (user)
 *  - 'apps'
 *  - 'msg'
 *  - 'subscribe'
 * 
 *  - 'dev:area-jump' (experimental; client jumps to given area)
 *  - 'dev:cave-fix' (experimental; set area cave fix from editor)
 * 
 * Kafka IO
 * 
 *  Users: {cmd}
 *  + userSession#%idUser% (producing init/update session, disconnect on payoad=null)
 *  < userSessionLocalized#%idSession% (listen to Localizer output)
 *
 *  Objects: {app-cmd}
 *  < obj#%idArea%>%appKey%-%idObj%=%objKey%?%objVersion (place obj of version)
 *  < obj#%idArea%>%appKey%-%idObj% (update/remove if payload=null)
 * 
 *  Apps: {app-cmd}
 *  < app#%appKey% (clear objs and push app disconnect to clients if payload null)
 *
 *  Messages & Callbacks: {app-cmd}
 *  < msg:App>Client#%appKey% (consume msg app => client, filter and push to clients)
 *  + msg:App>Client>CB#%idCallback% (produce client's reply to app msg)
 *  + msg:Client>App#%appKey% (produce msg client => app)
 *  < msg:Client>App>CB#&idCallback& (consume app's reply to client msg and push back to the client)
 *  
 *  Real-time Object Movement: {area-obj-%idArea%}
 *  < consume all per area, key=%idObj% (local obj position cache only)
 * 
 * 
 * REST API https://127.0.0.1:1337 
 *  /i (json status info)
 *  /u/r/%REG_SECRET%?handle=%USERNAME%&password=%PASSWORD%&email=%EMAIL% [ &fullName=%FULL_NAME% ] (TMP register user with given handle, pass, email [& full name])
 *  /d/%ADMIN_SECRET%/relocalize/%SESSION_ID%?param1=val1&...
 * 
 **/

const startupTime:number = Date.now();

const ARGS = require('minimist')(process.argv.slice(2));
if (ARGS.region === undefined && ARGS.r === undefined) {
    console.log('Please specify region partition by --region=N or -r=N');
    process.exit();
}

const REGION_PARTITION:number = ARGS.region !== undefined ? ARGS.region : ARGS.r;

import { Debugger, ObjectsEqual, DeepCopy, QuatToEulerAngles, Vec3FromArray, QuatFromArray, PhantomObject } from 'phntm.io-cloud-sdk';
import { NodeTypeToName, ClientType, ToNumberedArray } from './lib/types';
const $d = Debugger.Get(NodeTypeToName(ClientType.SESS_M, [ REGION_PARTITION ] ));

// includes start //

import { DataCallback,
    Socket,
    ObjectSize, Gps, ArrayToFixed, ArrayToFixedString, 
    Mat4FromRowMajorArray, TopicPartitionInitConfig, Mat4FromColMajorArray } from './lib/types';

const fs = require('fs');
import * as Path from 'path';
import * as C from 'colors'; C; //force import typings with string prototype extension

import { Db, Collection, MongoError } from 'mongodb';

const _ = require('lodash');

import { CommonHelpers } from './lib/commonHelpers';
import { mat4, vec3, quat } from 'gl-matrix';

import { Session, SessionLocalizeRequestData, SessionBoundsData } from './lib/session';
import { Area } from './lib/area';

import { ClientAppList, ClientAppState, ClientAppWMode,
         MsgCallbackList, MsgCallback, PhantomClientMsgData, InternalClientMsgData,
        ClientStateData, InternalAppMsgData } from './lib/app';

import { AppObject, SlowObjectUpdateData, AppObjectInternalUpdate} from './lib/appObject';

import { Validation as $v} from './lib/validation';

const https = require('https');

import { AuthLib } from './lib/auth';
import { SessionHelpers, LoadingBatch } from './lib/sessionHelpers';

import { User, SlowMonitorUpdateData } from './lib/user';

const mongoClient = require('mongodb').MongoClient;

import { RouteObjectStateByKey, RouteAppCmdByKey, RouteAppStateByKey, RouteSessionStateByKey } from './lib/topicRouters';

import { ObjectID, ObjectId } from 'bson';

import * as Kafka from 'node-rdkafka';
import { KafkaConsumerWrapper, KafkaConsumerWrapperSubscription } from './lib/kafkaConsumerWrapper';
import { toUnicode } from 'punycode';
import { UpdateRateMonitor } from './lib/updateRateMonitor';
import { LocalizationEventData } from './lib/localizerHelpers';

// load config & ssl certs //

const dir:string  = __dirname + "/..";

if (!fs.existsSync(dir+'/config.jsonc')) {
    $d.e('CONFIG EXPECTED AND NOT FOUND IN '+dir+'/config.jsonc');
    process.exit();
};

import * as JSONC from 'comment-json';
const defaultConfig = JSONC.parse(fs.readFileSync(dir+'/config.jsonc').toString());
const CONFIG = _.merge(defaultConfig);

const IO_PORT:number = CONFIG['SESS.M'].ioPort;
const USER_REGISTER_SECRET:string = CONFIG['SESS.M'].userRegisterSecret;
const ADMIN_SECRET:string = CONFIG.adminSecret;
const DIE_ON_EXCEPTION:boolean = CONFIG.dieOnException;
const KAFKA_BROKER_LIST:string = CONFIG.kafkaBrokerList;
const DB_URL:string = CONFIG.dbUrl;
const VERBOSE:boolean = CONFIG['SESS.M'].verbose;
const VERBOSE_OBJECT_UPDATES:boolean = CONFIG['SESS.M'].verboseObjectUpdates;
const VERBOSE_USER_UPDATES:boolean = CONFIG['SESS.M'].verboseUserUpdates;
const VERBOSE_MESSAGES:boolean = CONFIG['SESS.M'].verboseMessages;
const STATIC_SERVER_ADDRESS:string = CONFIG.staticServerAddress;
const KEEP_SESSIONS_LOADED_FOR_MS:number = CONFIG['SESS.M'].keepSessionsLoadedForMs;
const DEFAULT_USER_APP_KEYS:string[] = CONFIG['SESS.M'].defaultUserApps;

const certFiles:string[] = CommonHelpers.GetCerts(dir+"/ssl/private.pem", dir+"/ssl/public.crt");
const HTTPS_SERVER_OPTIONS = {
    key: fs.readFileSync(certFiles[0]),
    cert: fs.readFileSync(certFiles[1]),
};

console.log('----------------------------------------------------------------'.yellow);
console.log((' PHNTM SESSION MASTER of region #'+REGION_PARTITION).yellow);
console.log('');
console.log((' System info available as JSON at https://THIS_HOSTNAME:'+IO_PORT+'/i/').yellow);
console.log((' Register new users via https://THIS_HOSTNAME:'+IO_PORT+'/u/r/').yellow);
console.log('----------------------------------------------------------------'.yellow);

// important global stuffs on this node defined here:
let activeUsers : { [idUser:string]:User } = {}; // all users active in this region
let activeSessions: { [idSession:string]:Session } = {}; // all session loaded and active in this region
let activeAreas: { [idArea:string]:Area } = {}; // all areas loaded and active in this region

let sessionObjects: { [session:string]: { [appKey:string]:{ [idObject:number]:AppObject } } } = {};
let activeObjects: { [idObject:number]:AppObject } = {};
let msgCallbacks: MsgCallbackList = {};

// objs are pusshed when a whole batch - likely from connected sessions - arrive here (for physics consistency when placing)
let loadingAppObjectBatches: {
    [appKey:string]: LoadingBatch[] //array per app!
} = {};

//let knownAppKeys:string[] = []; 

const express = require('express');
const expressApp = express();
const server = https.createServer(HTTPS_SERVER_OPTIONS, expressApp);
const io:SocketIO.Server = require('socket.io')(server, {pingInterval: 10000, pingTimeout: 60*1000});

// connect to mongo

//const dbName:string = "world";
let worldDb:Db = null;
let appsDb:Db = null;
let shuttingDown:boolean = false;

/**
 * REST API to register users
 */ 
expressApp.get('/u/r/:secret', function(req: any, res: any) {
    if (!AuthLib.CheckRestAPISecret(req.params.secret, USER_REGISTER_SECRET, res))
        return;
    res.setHeader('Content-Type', 'application/json');
    return SessionHelpers.RegisterUserHandler(req, res, DEFAULT_USER_APP_KEYS, worldDb);
});

// info json available here
expressApp.get('/i', function(req: any, res: any) {
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(GetSystemInfo(), null, 4));
});

// info json available here
expressApp.get('/d/:secret/relocalize/:idSession', function(req: any, res: any) {
    if (!AuthLib.CheckRestAPISecret(req.params.secret, ADMIN_SECRET, res))
        return;
    res.setHeader('Content-Type', 'application/json');
    //$d.l(req.params.idSession, req.query);
    let idSession:string = req.params.idSession;
    if (idSession && idSession.length != 24) idSession = null;
        
    //let relocalize:boolean = req.query. ? true : false;
    let removeFromArea:boolean = req.query.removeFromArea ? true : false;
    let idTargetSession:string = req.query.idTargetSession ? req.query.idTargetSession : null;
    if (idTargetSession && idTargetSession.length != 24) idTargetSession = null;

    let viewpointPosition:number[] = req.query.viewpointPosition ? JSON.parse('{"val": '+req.query.viewpointPosition+'}').val : null;
    let viewpointRotation:number[] = req.query.viewpointRotation ? JSON.parse('{"val": '+req.query.viewpointRotation+'}').val : null;
    if (idSession && viewpointPosition && viewpointRotation) {
        res.send({
            time: Date.now,
            idSession:idSession,
            idTargetSession: idTargetSession,
            relocalize: true,
            removeFromArea: removeFromArea,
            viewpointPosition: viewpointPosition,
            viewpointRotation: viewpointRotation,
        });
        $d.l(('/d/ Got debug relocalize request for reg='+REGION_PARTITION+' with data').black.bgYellow, {
            idSession: idSession,
            relocalize: true,
            idTargetSession: idTargetSession,
            removeFromArea: removeFromArea,
            viewpointPosition: viewpointPosition,
            viewpointRotation: viewpointRotation
        });

        _DebugRelocalizeSession(
            idSession,
            idTargetSession,
            removeFromArea, //not removing from area, if localized
            viewpointPosition,
            viewpointRotation
        );
    } else {
        res.send({err: 1});
    }
    
});

/** 
 * admin client to check and init topics and partitions
 */
let kafkaAdminClient:Kafka.IAdminClient = Kafka.AdminClient.create({
    'client.id': 'session.m-admin-client-'+REGION_PARTITION,
    'metadata.broker.list': KAFKA_BROKER_LIST
});

//connect & init
const initCompletePromise:Promise<void> = new Promise((resolveInit, reject)=>{
    mongoClient.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true }, function(err:any,database:any) {
        if(err) {
            $d.log("Error connecting to database!".red);
            process.exit();
        }

        worldDb = database.db('world');
        appsDb = database.db('apps');

        $d.log("We are connected to", DB_URL);
    
        // check topics and make sure we have region partition ready in each of them
        //let regionJustCreated:boolean = false;
        let topicsAndPartitions:TopicPartitionInitConfig[] = [

            { topic: 'region-states', partitions: [ 0 ], deleteRetentionMS: 0}, //just one partition always + don't delete, just store region reports for now I guess

            { topic: 'region-cmd', partitions: [ REGION_PARTITION ], onCreate: () => {
                producerReadyPromise.then(()=>{ //will report when all done if new region is created here
                    CommonHelpers.ReportRegionCreated([ REGION_PARTITION ], kafkaProducer);
                });
            } },

            { topic: 'app-states', partitions: [ REGION_PARTITION ] },
            { topic: 'user-states',  partitions: [ REGION_PARTITION ] }, 

            { topic: 'session-states', partitions: [ REGION_PARTITION ] },

            { topic: 'object-states', partitions: [ REGION_PARTITION ] },
            { topic: 'fast-object-updates', partitions: [ REGION_PARTITION ] },

            { topic: 'app-cmd', partitions: [ REGION_PARTITION ] },

            { topic: 'raw-visuals', partitions: [ REGION_PARTITION ] },
            { topic: 'visuals', partitions: [ REGION_PARTITION ] },
            { topic: 'raw-pointclouds', partitions: [ REGION_PARTITION ] },
            { topic: 'pointclouds', partitions: [ REGION_PARTITION ] },
            { topic: 'markers', partitions: [ REGION_PARTITION ] },
            
            { topic: 'geometry', partitions: [ REGION_PARTITION ] },

            { topic: 'slow-client-pose', partitions: [ REGION_PARTITION ] },
            { topic: 'slow-object-monitor-pose', partitions: [ REGION_PARTITION ] },
            { topic: 'fast-client-pose', partitions: [ REGION_PARTITION ] },
            { topic: 'fast-object-monitor-pose', partitions: [ REGION_PARTITION ] },
        
        ];

        //check partition exists for all region topics
        CommonHelpers.InitTopicsAndPartitionsAsync(topicsAndPartitions, CONFIG.newKafkaTopicReplicationFactor, kafkaAdminClient, (withError:boolean) => {  
            if (withError) { return process.exit(); }
            $d.l(('All '+topicsAndPartitions.length+' kafka topics look fine for region #'+REGION_PARTITION).green);
            resolveInit(); //init done
        });
    }); 

});


initCompletePromise.then(()=>{

    $d.log("Init done, Socket.io listening, subscribing to topics...");

    consumerWrapper.subscribe(subscriptions, () => {

        kafkaProducer.connect({ }); 

        producerReadyPromise.then(()=>{
            CommonHelpers.ProduceTopicReset('user-states', [ REGION_PARTITION ], kafkaProducer);
            CommonHelpers.ProduceTopicReset('session-states', [ REGION_PARTITION ], kafkaProducer);
    
            server.listen(IO_PORT);
        });

    });

});

/**
 * produces into {session-states}, {area-states}, {cluster-cmd}
 */
let kafkaProducerConnected:boolean = false;
const KAFKA_PRODUCER_ID:string = 'session.m-producer-r'+REGION_PARTITION;
let kafkaProducer = new Kafka.Producer({
    'metadata.broker.list': KAFKA_BROKER_LIST,
    'client.id': KAFKA_PRODUCER_ID,
});
kafkaProducer.setPollInterval(100); // Poll for events every 100 ms

const producerReadyPromise:Promise<void> = new Promise((resolveProducerReady, reject)=>{
    kafkaProducer.on('ready', function () {
        $d.log("Kafka Producer ready".green);
        kafkaProducerConnected = true;
        resolveProducerReady();
    });
});

kafkaProducer.on('disconnected', function () {
    $d.err("Kafka Producer disconnected");
    kafkaProducerConnected = false;
});

kafkaProducer.on('event.error', function (err:any) {
    $d.err('Error in Kafka producer', err.message);
});

//no commits and reset to largest to always fw to the latest data on launch - we skip what ever happened during downtime
const KAFKA_CONSUMER_ID:string = 'session.m-consumer-r'+REGION_PARTITION;
let consumerWrapper:KafkaConsumerWrapper = new KafkaConsumerWrapper(KAFKA_BROKER_LIST, KAFKA_CONSUMER_ID, 'largest', false);
//let appCmdConsumerWrapper:KafkaConsumerWrapper = new KafkaConsumerWrapper(KAFKA_BROKER_LIST, KAFKA_APP_CMD_CONSUMER_ID);

let subscriptions:KafkaConsumerWrapperSubscription[] = [

    { topic: 'app-cmd', partitions: [ REGION_PARTITION ] , onMessage:(msg:Kafka.Message) => {

        RouteAppCmdByKey(msg,

            //onApp2ClientMsg
            (appKey:string, msgPayload:any) => {
                SessionHelpers.ProcessApp2ClientMsg(appKey, msgPayload, activeUsers, activeSessions, activeAreas, activeObjects, kafkaProducer, VERBOSE_MESSAGES);
            },

            //onClient2App2ClientCB
            (appKey:string, idCallback:string, msgPayload:any)=>{
                return SessionHelpers.ProcessClient2AppMsgCallback(msgPayload, idCallback, msgCallbacks, VERBOSE_MESSAGES);
            },

            //onClient2AppMsg
            null, //ignored here

            //onApp2Client2AppCB
            null, //ignored here

            //onAppUserStateChange
            (appKey:string, idUser:string, statePayload:any) => { 
                $d.log(('Received user #'+idUser+' state update for app #'+appKey).cyan, statePayload);
                _ProcessUserAppStateUpdate(idUser, appKey, statePayload);
            }//,

            //onAppAreaStateChange
            //(appKey:string, idArea:string, statePayload:any) => { 
            //    $d.log(('Received area #'+idArea+' state update for app #'+appKey).cyan, statePayload);
            //    _ProcessAreaAppStateUpdate(idArea, appKey, statePayload);
            //}
        );

    }},

    // producer on [App.M]
    { topic: 'object-states', partitions: [ REGION_PARTITION ] , onMessage:(msg:Kafka.Message) => {

        RouteObjectStateByKey(msg,

            //onAddObject
            (appKey:string, idObject:number, idSession:string, statePayload:any)=>{

                return AppObject.ProcessLocalObjectAdd(
                    idObject, appKey, idSession, statePayload,
                    activeObjects, activeSessions,sessionObjects, VERBOSE_OBJECT_UPDATES,
                    (obj:AppObject, isNewHere:boolean, versionChanged:boolean, udpMappinChanged:boolean) => {

                        //let foundInBatches:boolean = false;
                        //waiting for a whole batch...
                        if (loadingAppObjectBatches[appKey]) {
                            let i:number = loadingAppObjectBatches[appKey].length;
                            while (i--) {

                                let batch = loadingAppObjectBatches[appKey][i];                               
                                if (!batch[idSession] || batch[idSession].objs[idObject] === undefined) continue; //obj not in this batch

                                batch[idSession].objs[idObject] = true; //this obj ready here for push

                                if (!SessionHelpers.CheckIfLoadingBatchSessionComplete(batch, idSession)) {
                                    return;
                                }
                                if (!SessionHelpers.CheckIfLoadingBatchComplete(batch)) {
                                    return;
                                }

                                //batch complete
                                loadingAppObjectBatches[appKey].splice(i, 1);
                                $d.l(('Full batch received for app #'+appKey+'').gray);
                                SessionHelpers.PushAddObjectsBatchToAllObservingClients(batch, activeSessions, activeObjects, activeUsers);
                                return;
                            }
                        }
                        
                        //obj not found in batches => push
                        if (VERBOSE_OBJECT_UPDATES)
                            $d.l(('Obj #'+idObject+(isNewHere?' placed':' updated')+', pushing to observers...').gray);
                        SessionHelpers.PushObjectAddToAllObservingClients(obj, activeSessions[obj.idSession], activeUsers);                                        
                    }
                );
            },

            //onRemoveObject
            (idObject:number, appKey:string, idSession:string)=>{

                //remove from loading batches if found
                if (loadingAppObjectBatches[appKey]) {
                    let i:number = loadingAppObjectBatches[appKey].length;
                    while (i--) {
                        let batch:LoadingBatch = loadingAppObjectBatches[appKey][i];
                        if (batch[idSession] && batch[idSession].objs[idObject] !== undefined) {
                            delete batch[idSession].objs[idObject];
                            if (SessionHelpers.CheckIfLoadingBatchSessionComplete(batch, idSession))
                            {
                                loadingAppObjectBatches[appKey].splice(i, 1);
                                $d.l(('Batch complete after deleting obj #'+idObject+' for app #'+appKey+'').gray);
                                SessionHelpers.PushAddObjectsBatchToAllObservingClients(batch, activeSessions, activeObjects, activeUsers);
                            }
                            continue;
                        }
                    }  
                }

                return AppObject.ProcessLocalObjectRemove(
                    idObject, activeObjects,
                    sessionObjects, //sess.m passes this
                    VERBOSE_OBJECT_UPDATES,
                    (idRemovedObject:number, idRemoveObjectSession:string) => {
                        if (VERBOSE_OBJECT_UPDATES)
                            $d.l(('Obj #'+idObject+' removed, pushing to observers...').gray);
                        // 'objs'
                        SessionHelpers.PushObjectRemoveToAllObservingClients(idRemovedObject, activeSessions[idRemoveObjectSession], activeUsers, VERBOSE_OBJECT_UPDATES);
                    }
                );
            },

            // ignore slow pose updates coming directly from the app via {object-states} here
            // as they need to make it through Mntr and come back as {slow-object-monitor-pose} 
            // with a continuous update offset (local cache and unlock pushes below)
            null,

            //on slow state update from app
            (idObject:number, stateUpdate:AppObjectInternalUpdate, appKey:string, idSession:string) => {

                let obj:AppObject = activeObjects[idObject];
                if (!obj) return; //obj not loaded here


                //send buffers to client as buffers
                SessionHelpers.StateFieldsToBuffer(obj, stateUpdate.state);

                //cache new value here
                let changedFields:string[] = stateUpdate.state ? Object.keys(stateUpdate.state) : [];
                for (let i = 0 ; i < changedFields.length; i++) {
                    if (stateUpdate.state[changedFields[i]] !== null) {
                        if (changedFields[i] == 'p') {
                            obj.position = Vec3FromArray(stateUpdate.state[changedFields[i]]);
                        } else if (changedFields[i] == 'r') {
                            obj.rotation = QuatFromArray(stateUpdate.state[changedFields[i]]);
                        } else if (changedFields[i] == 's') {
                            obj.scale = Vec3FromArray(stateUpdate.state[changedFields[i]]);
                        } else {
                            obj.state[changedFields[i]] = stateUpdate.state[changedFields[i]];
                        }
                    } else {
                        delete obj.state[changedFields[i]];
                    }
                };

                //push update to all observers via 'obj:'
                SessionHelpers.PushSlowObjectStateUpdateToAllObservingClients(obj, stateUpdate, activeSessions[obj.idSession], activeUsers);                
            },

            //onBatchWillFollow
            (appKey:string, numObjects:number, batchObjIds:{[idSession:string]:number[]}) => {

                $d.l(('Batch of '+numObjects+' loaded objects incoming for app #'+appKey).gray);

                let incomingBatch: LoadingBatch = {};
                let batchSessionIds:string[] = Object.keys(batchObjIds);

                for (let i = 0; i < batchSessionIds.length; i++) {
                    let idSession:string = batchSessionIds[i];
                    if (!batchObjIds[idSession].length) continue;

                    incomingBatch[idSession] = {
                        objs: [],
                        complete: false,
                    };

                    for (let j = 0; j < batchObjIds[idSession].length; j++) {
                        incomingBatch[idSession].objs[batchObjIds[idSession][j]] = false;
                    }
                };

                if (!ObjectSize(incomingBatch)) return; //ignore empty

                if (!loadingAppObjectBatches[appKey]) loadingAppObjectBatches[appKey] = [];
                loadingAppObjectBatches[appKey].push(incomingBatch);
            },

            //onReset
            (appKey?:string, idSession?:string) => {

                //clear bached  objs that might be in progress
                if (appKey) {
                    if (loadingAppObjectBatches[appKey]) {
                        if (idSession) {
                            for (let i = 0; i < loadingAppObjectBatches[appKey].length; i++) {
                                delete loadingAppObjectBatches[appKey][i][idSession];
                            }
                        } else {
                            delete loadingAppObjectBatches[appKey];
                        }
                    }
                } else {
                    loadingAppObjectBatches = {}; //clear all
                }
                
                
            }

        );        

    }},
  
   
    // produced on MNTR
    // cache latest pos/rot/scale state to place objs to known coords on app start / client enter
    // obj pos used to determine distsance to users (recepients of single-client msgs)
    // also push unlocks to clients when obj pose becomes steady
    // in case they didn't catch the latest udp update
    { topic: 'slow-object-monitor-pose', partitions: [ REGION_PARTITION ], onMessage:(msg:Kafka.Message) => {

        let key:string = msg.key.toString(); //idObject[C|A]@idSession
        
        let parts0:string[] = key.split('@');
        if (parts0.length != 2) {
            return $d.e('Invalid message key in {slow-object-monitor-pose}: '+msg.key+'; ignoring');
        }

        let parts1:string[] = parts0[0].split(':');
        if (parts1.length != 2) {
            return $d.e('Invalid message key in {slow-object-monitor-pose}: '+msg.key+'; ignoring');
        }

        let idObject:number = parseInt(parts1[0]);
        let poseUpdateSource:string = parts1[1]; //C=client via Monitor, A=App via Monitor

        let obj:AppObject = activeObjects[idObject];
        if (!obj) return;

        let update:SlowObjectUpdateData = JSON.parse(msg.value.toString());
        if (update.p)
            obj.position = vec3.fromValues(update.p[0], update.p[1], update.p[2]);
        if (update.r)
            obj.rotation = quat.fromValues(update.r[0], update.r[1], update.r[2], update.r[3]);
        if (update.s)
            obj.scale = vec3.fromValues(update.s[0], update.s[1], update.s[2]);
        obj.lastClientLockedBy = update.lck; //last client lock from Mntr
        obj.lastClientSteady = update.std; //last client lock from Mntr
        obj.lastMonitorPoseUpdatedFrame = update.f; //update offset from monitor

        if (VERBOSE_OBJECT_UPDATES) {
            $d.l((obj+' received a slow update').gray);
        }
        
        if (!obj.lastClientLockedBy && obj.lastClientSteady) {
            //only steady here
            // via 'obj>'
            SessionHelpers.PushSlowObjectPoseToAllObservingClients(obj, activeSessions[obj.idSession], activeUsers, VERBOSE_OBJECT_UPDATES);
        }
    
    } },


    // produced on MNTR
    // cache here so that we can determine rough disnatnce to objs and therefore recipients of single client obj messages
    { topic: 'slow-client-pose', partitions: [ REGION_PARTITION ], onMessage:(msg:Kafka.Message) => {

        let key:string = msg.key.toString();

        let parts:string[] = key.split('@'); //idUser@idSession
        if (parts.length != 2) {
            return $d.e('Invalid message key in {slow-client-pose: '+msg.key+'; ignoring');
        }

        let idUser:string = parts[0];
        let idSession:string = parts[1];
        
        //only store user pos so that we can route single-client obj messages to the nearest user
        if (activeUsers[idUser] && activeUsers[idUser].idSession == idSession) {
            let update:SlowMonitorUpdateData = JSON.parse(msg.value.toString())
            activeUsers[idUser].position = vec3.fromValues(update.p[0], update.p[1], update.p[2]);
            activeUsers[idUser].rotation = quat.fromValues(update.r[0], update.r[1], update.r[2], update.r[3]);
            activeUsers[idUser].updatedUserFrame = update.f; //from client's Unity
        }

        if (VERBOSE_USER_UPDATES) {
            $d.l((activeUsers[idUser]+' received slow update').gray);
        }

    } },


    { topic: 'app-states', partitions: [ REGION_PARTITION ] , onMessage:(msg:Kafka.Message) => {

        //TODO on newAppRegistered => check/init region partition of all app topics maybe
        RouteAppStateByKey(msg, 
            null,
            (disconectedAppKey:string, region:number) => {

                $d.log(('App #'+disconectedAppKey+' disconnected from APP.M in region '+msg.partition+'; clearing objects etc').blue);
                delete loadingAppObjectBatches[disconectedAppKey];
                return SessionHelpers.ProcessAppDisconnect(disconectedAppKey, true, sessionObjects, activeObjects, activeUsers); 

            },
            (region:number) => { //reset of all apps - delete all objs and report to connected clients
                
                loadingAppObjectBatches = {};

                let sessionIds:string[] = Object.keys(sessionObjects);
                for (let i = 0; i < sessionIds.length; i++) {
                    sessionObjects[sessionIds[i]] = {};
                }
                activeObjects = {};

                //cleat & push disconnect to clients
                let userIds:string[] = Object.keys(activeUsers);
                for (let i = 0; i < userIds.length; i++) {
                    let idUser:string = userIds[i];
                    if (!activeUsers[idUser].isConnected || !activeUsers[idUser].isAuthentificated || activeUsers[idUser].clientType != ClientType.PHNTM) continue;

                    let userAppKeys:string[] = activeUsers[idUser].runningApps ? Object.keys(activeUsers[idUser].runningApps) : [];
                    userAppKeys.forEach((appKey:string) => {
                        if (activeUsers[idUser].hasActiveApp(appKey)) {
                            activeUsers[idUser].socket.emit('app:exit', { key: appKey, clear: true } );
                        }
                    });
                    activeUsers[idUser].clientLoadedObjectIds = [];
                    activeUsers[idUser].runningApps = {};
                }

            },
        ); 
        

        if (msg.key && !msg.value) {

            
        } else {
            ///$d.l(('Ignoring app state update of app #'+msg.key).gray /*, JSON.parse(msg.value.toString())*/ );
            return;
        }
        
    }},   

    { topic: 'session-states', partitions: [ REGION_PARTITION ], onMessage:(msg:Kafka.Message) => {

        RouteSessionStateByKey(msg,
            null, null, null, //produced here

            //onSessionLocalized
            (idSession:string, updateData:LocalizationEventData, region:number) => { 

                let session:Session = activeSessions[idSession];
                if (!session) {
                    $d.l(("Session #"+idSession+" not loaded, ignoring localize update").gray);
                    return;
                }
                
                let sourceToTargetTransform:mat4 = Mat4FromColMajorArray(updateData.transformToTarget);

                let t:vec3 = vec3.create();
                let r:quat = quat.create();
                mat4.getTranslation(t, sourceToTargetTransform);
                mat4.getRotation(r, sourceToTargetTransform);
                let rDebugEuler:vec3 = QuatToEulerAngles(r);

                $d.l(session+' localized in '+updateData.idTargetSession+' with T='+ArrayToFixedString(t,6)+' and R='+ArrayToFixedString(rDebugEuler,6)+', transform=', sourceToTargetTransform);

                if (updateData.idTargetSession) {
                    $d.l(('Localizer localized '+session+' in session #'+updateData.idTargetSession).yellow);
                    _DoLocalizeInSession(session, updateData.idTargetSession, sourceToTargetTransform, (err?:any)=>{
                        if (err) {
                            $d.e(err);
                            return;
                        }
                    });
                } /*else if (updateData.idTargetArea) {
                    $d.l(('Localizer localized '+session+' in area #'+updateData.idTargetArea).yellow);
                    _DoLocalizeInArea(session, updateData.idTargetArea, sourceToTargetTransform, (err?:any)=>{
                        if (err) {
                            $d.e(err);
                            return;
                        }
                    });
                } */ 
            },

            //onSessionBounds from pc.w
            (idSession:string, updateData:SessionBoundsData, region:number) => { 

                let session:Session = activeSessions[idSession];
                if (!session) {
                    $d.l(("Session #"+idSession+" not loaded, ignoring bounds update").gray);
                    return;
                }
                let sessionArea:Area = null;
                if (session.idArea) {
                    sessionArea = activeAreas[session.idArea];
                    if (!sessionArea) {
                        $d.e("Session area "+session.idArea+" not loaded, ignoring bounds/grnd update");
                        return;
                    }
                }

                if (updateData.min && updateData.max && updateData.min.length == 3 && updateData.min.length == 3) {
                    session.bounds = [ //saved with session
                        Vec3FromArray(updateData.min),
                        Vec3FromArray(updateData.max)
                    ];
                }

                if (updateData.grndPt && updateData.grndRot && updateData.grndPt.length == 3 && updateData.grndRot.length == 4) {

                    //saved with the session here
                    session.groundPlanePoint = Vec3FromArray(updateData.grndPt);
                    session.groundPlaneRot = QuatFromArray(updateData.grndRot);

                    $d.l((session+' updated lowest ground plane to').gray, session.groundPlanePoint);

                    if (sessionArea) { 
                        if (sessionArea.updateLowestGround(activeSessions)) {
                             //update session observers (contains all in area)
                            let observerIds:string[] = session.observers ? Object.keys(session.observers) : [];
                            for (let i = 0; i < observerIds.length; i++) {
                                if (activeUsers[observerIds[i]] && activeUsers[observerIds[i]].isConnected && activeUsers[observerIds[i]].isAuthentificated)
                                    activeUsers[observerIds[i]].emitGroundUpdate(session, sessionArea);
                            }
                        }
                    }
                }
             

               
            },

            null //onReset, produced here

        ); 
    }},

    { topic: 'region-cmd', partitions: [ REGION_PARTITION ] , onMessage:(msg:Kafka.Message) => {

        if (msg.key == 'gimme:user-states' ) { //app.m and monitor when starting up

            $d.l("Answering a snapshot request for user-states".magenta);
            let userIds:string[] = Object.keys(activeUsers);
            for (let i = 0; i < userIds.length; i++) {
                activeUsers[userIds[i]].produceUpdate(kafkaProducer);
            }

        } else if (msg.key == 'gimme:session-states' ) { //app.m and monitor when starting up

            $d.l("Answering a snapshot request for session-states".magenta);
            let sessionIds:string[] = Object.keys(activeSessions);
            for (let i = 0; i < sessionIds.length; i++) {
                activeSessions[sessionIds[i]].produceUpdate(kafkaProducer, VERBOSE);
            }
            let areaIds:string[] = Object.keys(activeAreas);
            for (let i = 0; i < areaIds.length; i++) {
                activeAreas[areaIds[i]].produceUpdate(kafkaProducer);
            }

        } 

    }},

];

/**
 * delayed session cleanup worker
 */
let cleanupTimer:NodeJS.Timeout = setInterval(()=>{

    _SaveAndClearAbandonedSessions();
    
}, 2000); 


function _SaveAndClearAbandonedSessions() {
    
    //clear empty sessions
    let areaIds:string[] = activeAreas ? Object.keys(activeAreas) : [];
    for (let i = 0; i < areaIds.length; i++) {
        let area:Area = activeAreas[areaIds[i]];
        if (area && area.allSessionsClear(activeSessions)) {
            SessionHelpers.SaveArea(area, worldDb, (err?:string)=>{

                if (err) {
                    $d.e(err);
                    return;
                }
    
                if (!area.allSessionsClear(activeSessions)) {
                    return;
                }
    
                delete activeAreas[area.idArea];
            }) ;
        }
    }
    
    //clear sessions and their areas
    let sessionIds:string[] = Object.keys(activeSessions);
    for (let i = 0; i < sessionIds.length; i++) {
        let session:Session = activeSessions[sessionIds[i]];

        if ((session.abandonedTime != null && Date.now()-session.abandonedTime>KEEP_SESSIONS_LOADED_FOR_MS)
            || shuttingDown
        ) { //30sec of life 

            //discard area when there are no users in it and when it's not in somebody else's transform
            if (ObjectSize(session.observers)) {
                continue;
            }

            if (session.isBeingSaved) {
                continue;
            }
            session.isBeingSaved = true;
            SessionHelpers.SaveSession(session, worldDb, (err?:string)=>{

                if (err) {
                    $d.e(err);
                    return;
                }

                session.isBeingSaved = false; 
                if (session.abandonedTime == null && !shuttingDown) //reopened
                    return;
                
                session.produceRemoveUpdate(kafkaProducer, VERBOSE);

                if (VERBOSE)
                    $d.log(('Abandoned '+session+' saved and freed').blue);
                //areas[idArea].stopFastObjConsumer(false);
    
                delete activeSessions[session.idSession];
    
                //clear area and app objects
                delete sessionObjects[session.idSession];
                let appObjIds:number[] = Object.keys(activeObjects).map((v:string):number=>{return parseInt(v);});
                for (let j = 0; j < appObjIds.length; j++) {
                    let obj:AppObject = activeObjects[appObjIds[j]];
                    if (obj.idSession == session.idSession) {
                        delete activeObjects[obj.id];
                    }
                }

                //clear loading batches
                let batchAppKeys:string[] = Object.keys(loadingAppObjectBatches);
                for (let i = 0; i < batchAppKeys.length; i++) {
                    for (let j = 0; j < loadingAppObjectBatches[batchAppKeys[i]].length; j++) {
                        delete loadingAppObjectBatches[batchAppKeys[i]][j][session.idSession];
                    }
                }

                let area:Area = session.idArea && activeAreas[session.idArea] ? activeAreas[session.idArea] : null;
                if (area && area.allSessionsClear(activeSessions)) {

                    SessionHelpers.SaveArea(area, worldDb, (err?:string)=>{

                        if (err) {
                            $d.e(err);
                            return;
                        }

                        if (!area.allSessionsClear(activeSessions)) {
                            return;
                        }

                        delete activeAreas[area.idArea];
                    }) ;

                }
            });            
        }
    }
}


io.on('connect', function(socket : Socket){

    $d.log('Ohai! Opening Socket.io for', socket.handshake.address);
    
    let user : User = new User(socket);
    user.isConnected = true;
    user.regionPartition = REGION_PARTITION;
    user.isAuthentificated = false;

    user.idSession = null; //generated on login
    user.shortUserId = 0; //generated on login, short sess pass / id 

    //init cave fix to zero
    //user.caveFix = mat4.create(); mat4.identity(user.caveFix);
                    
    socket.user = user;
    
    /*
     * client auth
     */
    socket.on('auth', function(data, returnCallback) { 

        if (user.loginInProgress) {
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

    });

    /*
     * client disconnected
     */
    socket.on('disconnect', (data:any) => {

        if (user != null && user.clientType == ClientType.PHNTM) {
            $d.log((user+' at '+user.clientAddress+' disconnected').blue);
            SessionHelpers.ClearUser(user, activeUsers, activeSessions, activeAreas, sessionObjects, activeObjects, kafkaProducer, VERBOSE);

        } else if (user != null) {
            $d.log((NodeTypeToName(user.clientType, [ user.regionPartition ]) +' at '+user.clientAddress+' disconnected'));
        }

        //SessionHelpers.ClientDisconnectHandler(user, activeUsers, activeSessions, sessionObjects, activeObjects, kafkaProducer);
    });

    socket.on('disconnecting', (reason:any) => {
        $d.l(('Socket disconnecting: '+reason).gray);
    });

    /*
     * client updating subscription to certain data types
     */
    //socket.on('subscribe', function(data, returnCallback) { 
    //    if (!AuthLib.IsAuthClient(user, ClientType.PHNTM) ) { return $v.err("Access denied (subscribe)", returnCallback); }
    //    return SessionHelpers.UserFeatureSubscriptionsHandler(data, user, returnCallback, kafkaProducer);
    //});

    /*
     * user updated app state (app on/off/background/etc)
     */
    socket.on('apps', function(data:ClientAppList, returnCallback:DataCallback) {

        //preserve objects between updates
        let oldRunningApps:ClientAppList = user.runningApps;

        user.runningApps = data;

        let changedAppsKeys:string[] = [];
        let openedOrClosedAppsKeys:string[] = [];

        let userAppKeys:string[] = user.runningApps ? Object.keys(user.runningApps) : [];
        for (let i = 0; i < userAppKeys.length; i++) {
            let appKey:string = userAppKeys[i];
            user.runningApps[userAppKeys[i]].appKey = appKey; //store for convenience
            if (!oldRunningApps || !oldRunningApps[appKey] ||
                oldRunningApps[appKey].wmode != user.runningApps[appKey].wmode)
            {
                changedAppsKeys.push(appKey); //launched or wmode changed
            }

            if (!oldRunningApps || !oldRunningApps[appKey] ||
                (oldRunningApps[appKey].wmode == ClientAppWMode.INACTIVE && user.runningApps[appKey].wmode != ClientAppWMode.INACTIVE))
            {
                openedOrClosedAppsKeys.push(appKey); //launched or wmode changed
            }

            //pass loaded stuff between updates
            if (oldRunningApps && oldRunningApps[appKey]) {
                user.runningApps[appKey]._objects = oldRunningApps[appKey]._objects;
                user.runningApps[appKey]._userAppState = oldRunningApps[appKey]._userAppState;
                //user.runningApps[appKey]._appAreaStates = oldARunningApps[appKey]._appAreaStates;
            }
        }

        let oldAppKeys:string[] = oldRunningApps ? Object.keys(oldRunningApps) : [];
        for (let i = 0; i < oldAppKeys.length; i++) {
            let appKey:string = oldAppKeys[i];
            if (oldRunningApps[appKey].wmode != ClientAppWMode.INACTIVE &&
                !user.hasActiveApp(appKey)) {
                
                if (changedAppsKeys.indexOf(appKey) === -1)
                    changedAppsKeys.push(appKey); //closed apps

                if (openedOrClosedAppsKeys.indexOf(appKey) === -1)
                    openedOrClosedAppsKeys.push(appKey); //closed apps

                // app was just closed by the client, clear objs cache
                if (user.runningApps && user.runningApps[appKey]) {
                    user.runningApps[appKey]._objects = [];
                    //userSession.runningApps[appKey]._objectStates = [];
                    user.runningApps[appKey]._userAppState = {};
                    //user.runningApps[appKey]._appAreaStates = {};
                }
                user.clearLoadedAppObjects(appKey, activeObjects);
                SessionHelpers.ClearAppObjectsInUnobservedSessions(appKey, activeSessions, sessionObjects, activeObjects);
            }
        }
        
        $d.log((user+' updated running apps').gray, user.runningApps);

        //$d.log((userSession+" got apps update").magenta, data);
        user.produceUpdate(kafkaProducer);

        if (returnCallback) { //we cool here, further immediate data via 'objs' & 'state'
            returnCallback(null); 
        }

        if (openedOrClosedAppsKeys.length) {
            let physicsChangedForUserIds:string[] = [ ]; //will contain current user on change
            let userSession:Session = user.idSession && activeSessions[user.idSession] ? activeSessions[user.idSession] : null;
            let userArea:Area = userSession && userSession.idArea && activeAreas[userSession.idArea] ? activeAreas[userSession.idArea] : null;
            if (userArea) {
                for (let i =  0; i < changedAppsKeys.length; i++) {
                    let changedUserIds:string[] = userArea.setPhysicsMaster(changedAppsKeys[i], null, activeUsers);
                    for (let j = 0; j < changedUserIds.length; j++) {
                        if (physicsChangedForUserIds.indexOf(changedUserIds[j]) === -1) {
                            physicsChangedForUserIds.push(changedUserIds[j]);
                        }
                    }
                }
            } else {
                physicsChangedForUserIds = [ user.idUser ];
            }
            for (let i = 0; i < physicsChangedForUserIds.length; i++) { 
                if (activeUsers[physicsChangedForUserIds[i]]) {
                    activeUsers[physicsChangedForUserIds[i]].emitPhysicsUpdate(activeSessions, activeAreas);
                }
            }
        }

        if (changedAppsKeys.length) {

            //update this client's avatar app states for avatars running some of the changed apps
            let avatarIds:string[] = Object.keys(user.observedAvatars);
            for (let i = 0; i < avatarIds.length; i++) {
                user.updateAvatarAppStates(activeUsers[avatarIds[i]], changedAppsKeys); //one avatar-app => pushes via 'av:'
            }

            //updates this user's app states for all observers also running some of the changed apps
            user.updateSelfAvatarAppStatesForObservers(changedAppsKeys, activeUsers);

        }
        
        //if the client just turned on an app, send them all we have for it loaded here
        if (user.runningApps) {
            let appKeys:string[] = Object.keys(user.runningApps);
            for (let i = 0; i < appKeys.length; i++) {
                let appKey:string = appKeys[i];
                //this app just launched on the client, place all objs we have here
                if (!oldRunningApps || !oldRunningApps[appKey] || oldRunningApps[appKey].wmode == ClientAppWMode.INACTIVE) {
                    SessionHelpers.PushAllCachedAppObjectsToClient(user, appKey, sessionObjects, loadingAppObjectBatches, true); //ignore cache here
                    //user's own app state is never here yet as we need to tell App.m first about the launch [then receive initial state via 'state:usr#']
                    //user.updateClientAppAreaStates(appKey, Object.keys(user.sessionPresence), activeSessions);
                }
            }
        }
    });

    /*
     * custom app messaging from the client
     */
    socket.on('msg', function(data:PhantomClientMsgData, callback?:MsgCallback) {

        //$d.log((userSession+" got app message").magenta, data);

        if (!AuthLib.IsAuthClient(user, ClientType.PHNTM) ) { return $v.err("Access denied (msg)", callback); }
        if (!$v.isSet(data)) { return $v.err('Missing data', callback); }
        if (!data.msg) { return $v.err('Missing msg', callback); }
        if (!data.app) { return $v.err('Missing app key for msg '+data.msg, callback); }
        
        //broadcast 'add-force' back to all observers of the obj
        if (data.idObj !== undefined && (
                data.msg == 'add-force' ||
                data.msg == 'move-to' ||
                data.msg == 'go-to'
        )) {
            //if (!data.data.force) { return callback({ err: true, msg: 'Missing force vector' }); }
            
            let obj:AppObject = activeObjects[data.idObj];
            if (!obj) {
                return $d.log(('Obj #'+data.idObj+' not found here, ignoring \''+data.msg+'\' msg from '+user).gray);
            }
            if (!activeSessions[obj.idSession]) {
                return $d.log(('Obj session #'+obj.idSession+' not found here, ignoring \''+data.msg+'\' msg from '+user).gray);
            }
            
            let sessionObservingUserIds:string[] = Object.keys(activeSessions[obj.idSession].observers); // all session observers targeted by obj messages
            if (!sessionObservingUserIds) {
               return $d.err((activeSessions[obj.idSession]+' has no observing users, ignoring \''+data.msg+'\' msg from '+user+'l ').gray);
            }

            let handlingUser:User = Area.GetPhysicsMaster(data.app, activeSessions[obj.idSession], activeSessions, activeAreas, activeUsers);
            if (!handlingUser) {
                $d.log(('No users to handle \''+data.msg+'\' msg from '+user+'; error deciding physics handler!').red);
                return;
            }
            //if (Verbo)
            $d.log(('Routing '+obj+' \''+data.msg+'\' msg from '+user+' to '+handlingUser).gray);
           
            let clientMsgData:PhantomClientMsgData = {
                app: data.app,
                msg: data.msg,
                data: data.data,
                objIds: [ obj.id ]
            };

            if (handlingUser.hasLoadedObject(obj.id)) {
                handlingUser.socket.emit('msg', clientMsgData);
            } else {
                handlingUser.stashAppObjMessage(obj.id, clientMsgData, null);
            }

            //return; //not propagating >, go-to, add-force any further
            //app will receive these but they are already handled
        }

        let appMsgData:InternalClientMsgData = {
            msg: data.msg,
            idUser: user.idUser,
            appKey: data.app,  
        };
        if (data.idObj !== undefined) {
            appMsgData.idObj = data.idObj;
        }
        if (data.data) {
            appMsgData.data = data.data;
        }
        let idCb:string = null;
        if (callback) { //will be invoked when we get reply from App.Mstr
            idCb = new ObjectID().toHexString();
            appMsgData.cb = idCb;
            msgCallbacks[idCb] = callback as MsgCallback;
        }

        if (VERBOSE_MESSAGES)
            $d.log(('>> Got Client>App Msg for app #'+data.app+' from user #'+user.idUser+(idCb?' [CB='+idCb+']':'')+' >>').cyan, appMsgData);
        else
            $d.log(('>> Got Client>App Msg for app #'+data.app+' from user #'+user.idUser+(idCb?'':'')+' >>').cyan);

        try {
            kafkaProducer.produce(
                'app-cmd',
                REGION_PARTITION,
                Buffer.from(JSON.stringify(appMsgData)),
                data.app+':msg.client>app',
                Date.now(),
                null
            );
        } catch (err) {
            $d.err('A problem occurred when sending app message for '+data.app+' to \'app-cmd\' and partition '+REGION_PARTITION, err);
        }

    });

    //client reporting loaded objs
    socket.on('loaded', function(data:{ ids: number[] }, callback?:MsgCallback) {

        if (!AuthLib.IsAuthClient(user, ClientType.PHNTM) ) { return $v.err("Access denied (has)", callback); }
        if (!$v.isSet(data)) { return $v.err('Missing data', callback); }
        if (!$v.isSet(data.ids)) { return $v.err('Missing ids', callback); }

        let newlyLoadedIds:number[] = user.markAppObjectsLoaded(data.ids);

        if (VERBOSE_OBJECT_UPDATES)
            $d.log((user+" confirmed loading objs ["+newlyLoadedIds.join(', ')+"]").gray);

        //userSession.broadcastAppObjectsLoaded(loadedIds, userSessions, appObjects);
        user.pushStashedAppObjMessages(newlyLoadedIds, kafkaProducer);
    });

    /*
     * request relocalization of user's current session in another one
     * if target session id and transform are provided, we use them and skip localizer (jump to session)
     * otherwise we generate a localization request for localizer, optionally with target session id 
     * as initial guess to try before any other automatic attempts
     */
    socket.on('localize', function(data, returnCallback) { 

        let userSession:Session = activeSessions[user.idSession];
        let idTargetSession:string = data && data.idTargetSession ? data.idTargetSession : null; 
        let transformToTargetSession:mat4 = data && data.transform && $v.isArray(data.transform, 16) ? Mat4FromRowMajorArray(data.transform) : null;
        let guess:mat4 = data && data.guess && $v.isArray(data.guess, 16) ? Mat4FromRowMajorArray(data.guess) : null;

        if (!userSession) {
            returnCallback({
                err: 1, //client will get it it via push update below
                msg: 'Session #'+user.idSession+' not loaded, unable to localize'
            });
            return; 
        }

        if (idTargetSession && (idTargetSession.length != 24 || !ObjectId.isValid(idTargetSession))) {
            returnCallback({
                err: 1, //client will get it it via push update below
                msg: 'Invalid session id #'+idTargetSession
            });
            return; 
        }
        
        if (idTargetSession && transformToTargetSession) {
                
            $d.l((user+' setting transform from '+userSession+' to #'+idTargetSession).magenta);

            returnCallback({
                res: 1, //client will get it it via push update below, not waiting for sess to load
            });

            _DoLocalizeInSession(userSession, idTargetSession, transformToTargetSession, (err?:any)=>{
                if (err) {
                    //returnCallback({err:1, msg: err});
                    $d.e('Error localizing '+user, err);
                    return;
                }
            });

        } else {

            let requestPreference:SessionLocalizeRequestData = null;

            if (idTargetSession) {
                $d.l((user+' requested relocalization of '+userSession+', desired target=#'+idTargetSession+(guess?" and initial guess":"")).magenta);
                requestPreference = {
                    idTargetSession: idTargetSession,
                };
                if (guess) {
                    requestPreference.guess = ToNumberedArray(guess);
                }
            } else 
                $d.l((user+' requested automatic relocalization of '+userSession).magenta);

            try {
                kafkaProducer.produce(
                    'session-states',
                    REGION_PARTITION,
                    requestPreference?Buffer.from(JSON.stringify(requestPreference)):null,
                    'localize:'+userSession.idSession,
                    Date.now(),
                    null
                );
            } catch (err) {
                $d.err('A problem occurred while sending a LOCALIZE request to {session-states}, partition='+REGION_PARTITION, err);
            }

            returnCallback({
                res: 1, //client will get it it via push update below
            });
        }
        
    });

    // requests current user become physics master for their area and running apps 
    socket.on('dev:handle-physics', function(data, returnCallback) {
        
        let userSession:Session = user.idSession && activeSessions[user.idSession] ? activeSessions[user.idSession] : null;
        let userArea:Area = userSession.idArea && activeAreas[userSession.idArea] ? activeAreas[userSession.idArea] : null;

        if (!userArea) {
            $d.l(user+' not in any area, ignoring request to become physics master');
            returnCallback({
                err: 1, //client will get it it via push update below
                msg: 'Not localized, already handling session physics'
            });
            return;
        }
        
        let physicsChangedForUserIds:string[] = [];

        let userAppKeys:string[] = user.runningApps ? Object.keys(user.runningApps) : [];

        $d.l(user+' becomming physics master of '+userArea+' for '+userAppKeys.length+' apps');
        returnCallback({
            err: 0, //client will get it it via push update below
        });

        for (let i = 0; i < userAppKeys.length; i++) {
            let changedUserIds:string[] = userArea.setPhysicsMaster(userAppKeys[i], user.idUser, activeUsers);
            for (let j = 0; j < changedUserIds.length; j++) {
                if (physicsChangedForUserIds.indexOf(changedUserIds[j]) === -1) {
                    physicsChangedForUserIds.push(changedUserIds[j]);
                }
            }
        }

        for (let i = 0; i < physicsChangedForUserIds.length; i++) { //this user should be included
            if (activeUsers[physicsChangedForUserIds[i]]) { 
                activeUsers[physicsChangedForUserIds[i]].emitPhysicsUpdate(activeSessions, activeAreas);
            }
        }

    });


    socket.on('dev:session-bounds', function(data, returnCallback) {
        
        if (!data) { return returnCallback({ res: 0, msg: 'Missing data' }); }
        if (!$v.isSet(data.idSession)) { return returnCallback({ res: 0, msg: 'Missing idSession' }); }
        if (!$v.isSet(data.min) || !$v.isArray(data.min, 3)) { return returnCallback({ res: 0, msg: 'Invalid min' }); }
        if (!$v.isSet(data.max) || !$v.isArray(data.max, 3)) { return returnCallback({ res: 0, msg: 'Invalid max' }); }

        let idSession:string = data.idSession;

        $d.l((user+" setting bounds of session #"+idSession+" to "+ArrayToFixedString(data.min)+" - "+ArrayToFixedString(data.max)).yellow);

        returnCallback({
            err: 0,
        });

        //lazy fw to {session-states} which is how wereceive legit data from Localizer
        let buff : Buffer = Buffer.from(JSON.stringify({
            min: data.min,
            max: data.max,
        }));
        try {
            kafkaProducer.produce(
                'session-states',
                REGION_PARTITION,
                buff,
                'bounds:'+idSession,
                Date.now(),
                null
            );
        } catch (err) {
            $d.err('A problem occurred while sending a BOUNDS update to {session-states}, partition='+REGION_PARTITION, err);
        }
    });


    /*
     * follow user around areas 
     */
    /*socket.on('dev:follow', function(data, returnCallback) { 

        $d.log("Follow data", data);

        if (!data) { return returnCallback({ res: 0, msg: 'Missing data' }); }
        if (!$v.isSet(data.idOrHandle)) { return returnCallback({ res: 0, msg: 'Missing idOrHandle' }); }
    
        let idOrHandle:string = data.idOrHandle;

        $d.log("idOrHandle", idOrHandle);
        
        if (!idOrHandle) {
            if (socket.userSession.debugFollowUser) {
                $d.l((socket.userSession+" stopped following #"+socket.userSession.debugFollowUser).gray);
                socket.userSession.debugFollowUser = null;
                //no update necessary here, areas stay loaded until manually removed (debub menu on desktop)
            }
            returnCallback({
                err: 0, //client will get it it via push update below
                idUser: null,
            });
            return;
        }

        let usersCollection : Collection = worldDb.collection('users');

        let query:{} = {};
        if (idOrHandle.length == 24) {
            query = {
                $or:[
                    { _id: new ObjectID(idOrHandle) },
                    { handle: idOrHandle }
                ]
            };
        } else {
            query = {
                handle: idOrHandle
            }
        }
        usersCollection.find(query).toArray(function (err:MongoError, items:any[]) {
            if (err || !items || !items.length || items.length != 1) {
                return returnCallback({
                    err: 1, //client will get it it via push update below
                    msg: 'Not found'
                });
            }

            let idUserToFollow:ObjectID = items[0]._id;
            $d.l((socket.userSession+" following #"+idUserToFollow).magenta);
            socket.userSession.debugFollowUser = idUserToFollow.toHexString();

            returnCallback({
                err: 0, //client will get it it via push update below
                idUser: idUserToFollow
            });

            SessionHelpers.JumpEveryoneFollowingUser(socket.userSession.debugFollowUser, areas, userSessions, areaObjects, appObjects, loadingAppObjectBatches, kafkaProducer);
        }); 
    });*/

    /*socket.on('dev:request-user-jump', function(data, returnCallback) {

        if (!data) { return returnCallback({ res: 0, msg: 'Missing data' }); }
        if (!$v.isSet(data.idArea)) { return returnCallback({ res: 0, msg: 'Missing idArea' }); }
        if (!$v.isSet(data.pos)) { return returnCallback({ res: 0, msg: 'Missing position in new area' }); }
        if (!$v.isSet(data.rot)) { return returnCallback({ res: 0, msg: 'Missing rotation in new area' }); }
        if (!$v.isSet(data.idUser)) { return returnCallback({ res: 0, msg: 'Missing idUser' }); }

        let targetUser: UserSession = userSessions[data.idUser];

        if (!targetUser) {
            return returnCallback({ res: 0, msg: 'User inactive, can not jump' });
        }

        $d.log((userSession+" asking "+targetUser+' to jumo to are #'+data.idArea).magenta);

        data.idUser = userSession.idUser; //use same data but let receiver know who called it
        targetUser.socket.emit('dev:jump', data);

        returnCallback({ res: 1});
    });*/


    /*
     * allows to set caveFix for session in editor
     * this produces a session update;
     */
    /*socket.on('dev:cave-fix', function(data, returnCallback) { 

        if (!data) { return returnCallback({ res: 0, msg: 'Missing data' }); }
        
        if (!$v.isSet(data.translation)) { return returnCallback({ res: 0, msg: 'Missing translation' }); }
        if (!$v.isSet(data.rotation)) { return returnCallback({ res: 0, msg: 'Missing rotation' }); }
        
        let trans:vec3 = vec3.fromValues(data.translation[0],data.translation[1],data.translation[2]);
        let rot:quat = quat.fromValues(data.rotation[0],data.rotation[1],data.rotation[2],data.rotation[3]);

        $d.log((userSession+' setting caveFix to trans:'+trans+', rot:'+rot+' >>>').magenta);
        let caveFix:mat4 = mat4.create();
        mat4.fromRotationTranslationScale(caveFix, rot, trans, vec3.fromValues(1,1,1));

        userSession.caveFix = caveFix;

        userSession.produceUpdate(kafkaProducer);

        returnCallback({
            res: 1, //client will get it it via push update below
        });

        //todo do this also when error is actually detected by localyzer and cafeFix calculated
        userSession.emitAreasUpdate(areas); 

        return;
    });*/


});


function _DoLocalizeInSession(srcSession:Session, idTargetSession:string, sourceToTargetSessionTransform:mat4, onFinish:(err?:any)=>void) {
     //load everything connected first (if not loaded already)
     SessionHelpers.LoadSessionArea(idTargetSession, activeSessions, activeAreas, worldDb, REGION_PARTITION, VERBOSE, kafkaProducer, () => {
         
        SessionHelpers.LocalizeInSession(srcSession, idTargetSession, sourceToTargetSessionTransform, activeSessions, activeAreas, 
            (changedSessionIds:string[], changedAreaIds:string[]) => {
             
                _PostLocalizeUpdate(changedSessionIds, changedAreaIds);
                onFinish();

            },
            (err:string) => {
                $d.err(err);
                onFinish(err);
            }
        );
    },
    (err:string)=>{ //on fail
        $d.err(err);
        onFinish(err);
    });
}

function _DoLocalizeInArea(srcSession:Session, idTargetArea:string, sourceToTargetAreaTransform:mat4, onFinish:(err?:any)=>void) {
    
    SessionHelpers.LoadArea(idTargetArea, activeAreas, worldDb, REGION_PARTITION,
        (loadedArea:Area)=>{

            SessionHelpers.LoadAreaSessions(loadedArea, activeSessions, worldDb, REGION_PARTITION, VERBOSE, kafkaProducer, () => {

                SessionHelpers.LocalizeInArea(srcSession, loadedArea, sourceToTargetAreaTransform, activeSessions, activeAreas,
                    (changedSessionIds:string[], changedAreaIds:string[]) => {
                     
                        _PostLocalizeUpdate(changedSessionIds, changedAreaIds);
                        onFinish();
         
                    },
                    (err:string) => {
                        $d.err(err);
                        onFinish(err);
                    }
                );

            },
            (err:string)=>{ //error while loading child sessions
                onFinish(err);
            });
        },
        (err:string)=>{ //error loading area
            onFinish(err);
        }
    );
}

function _PostLocalizeUpdate(changedSessionIds:string[], changedAreaIds:string[]) {
    //push session and area updates
    for (let i = 0; i < changedSessionIds.length; i++) {
        if (!activeSessions[changedSessionIds[i]])
            continue;
        activeSessions[changedSessionIds[i]].produceUpdate(kafkaProducer, VERBOSE);
    }

    let allActiveUserIds:string[] = activeUsers ? Object.keys(activeUsers) : [];
    let areaUserIdsToUpdate:string[] = [];
    //let runnigAppKeys:string[] = xxx ? Object.keys(user.runningApps) : [];
    for (let i = 0; i < changedAreaIds.length; i++) {
        let modifiedArea:Area = activeAreas[changedAreaIds[i]];

        modifiedArea.updateLowestGround(activeSessions);

        modifiedArea.produceUpdate(kafkaProducer);

        let areaAppKeys:string[] = [];

        // collect users currently active in any all area sessions for updates
        // physics for all their apps will be updated below with session presence
        for (let j = 0; j < allActiveUserIds.length; j++) {
            let idUser:string = allActiveUserIds[j];
            if (!activeUsers[idUser])
                continue;
            let idUserSession:string = activeUsers[idUser].idSession;
            if (modifiedArea.sessions[idUserSession]) {
                if (areaUserIdsToUpdate.indexOf(allActiveUserIds[j]) === -1)
                    areaUserIdsToUpdate.push(allActiveUserIds[j]);
                
                let userAppKeys:string[] = activeUsers[idUser].runningApps ? Object.keys(activeUsers[idUser].runningApps) : [];
                for (let k = 0; k < userAppKeys.length; k++) {
                    if (areaAppKeys.indexOf(userAppKeys[k]) === -1) {
                        areaAppKeys.push(userAppKeys[k]);
                    }
                }
            }
        }

        for (let j = 0; j < areaAppKeys.length; j++) {
            modifiedArea.setPhysicsMaster(areaAppKeys[j], null, activeUsers); //clienst get changes via 'sess' update
        }
    }

    //only these need updating
    for (let i = 0; i < areaUserIdsToUpdate.length; i++) {

        //update session presence
        let userToUpdate:User = activeUsers[areaUserIdsToUpdate[i]];
        let userSession:Session = activeSessions[userToUpdate.idSession];
        let userArea:Area = activeAreas[userSession.idArea];

        if (!userArea) {
            $d.e("Area "+userSession.idArea+" not found for "+userToUpdate+" in "+userSession);
            continue;
        }

        userToUpdate.updateSessionPresenceWithArea(userArea, activeSessions);

        userToUpdate.updateObservedAvatars(activeUsers, activeSessions);

        userToUpdate.produceUpdate(kafkaProducer);

        userToUpdate.emitSessionPresenceUpdate(userSession, userArea); //pushes all app area states if new area loaded and running app(s)

         //push objs to client if there are any here
        let appKeys:string[] = userToUpdate.runningApps ? Object.keys(userToUpdate.runningApps) : [];
        for (let i = 0; i < appKeys.length; i++) {
            let appKey:string = appKeys[i];
            if (!userToUpdate.hasActiveApp(appKey)) continue;
            SessionHelpers.PushAllCachedAppObjectsToClient(userToUpdate, appKey, sessionObjects, loadingAppObjectBatches, false); //client 'objs'
            //user.updateClientAppSessionStates(appKey, Object.keys(userSession.areaPresence), allActiveAreas);
        }
    }

    //SessionHelpers.LocalizeEveryoneFollowingUser(user.idUser, activeSessions, activeUsers, sessionObjects, allAppObjects, loadingAppObjectBatches, producer);

}
//const kafkaCmdConsumerGroupId : string = 'ctrl-cmd-cons-0';


//kafkaCmdConsumer.on('disconnected', function () {
//    $d.log("Kafka App/Cmd Consumer disconnected".red);
//    kafkaCmdConsumerConnected = false;
//});




/*function _ProcessAreaAppStateUpdate(idArea: string, appKey:string, newState:{ [field:string]:any}):void {
    let area:Area = areas[idArea];
    if (!area) {
        $d.log(('Received state update for area #'+idArea+' which is not loaded here, ignoring').gray, newState);
        return;
    }

    area.appStates[appKey] = newState; //always full internally (contains nulls for deleted fields)

    let areaObservingUserIds:string[] = Object.keys(area.allObservingUsers);
    for (let i = 0; i < areaObservingUserIds.length; i++) {
        
        let areaAppUser:UserSession = userSessions[areaObservingUserIds[i]];
        if (!areaAppUser.hasActiveApp(appKey)) continue;
        if (!areaAppUser.areaPresence[idArea]) continue; //user doens't have the area yet, full state will come with 'areas'

        areaAppUser.updateClientAppAreaStates(appKey, [ idArea ], areas); //pushes partial update via 'state'
    }

    //delete null fields
    let fields:string[] = (area.appStates && area.appStates[appKey]) ? Object.keys(area.appStates[appKey]) : [];
    for (let i = 0; i < fields.length; i++) {
        if (area.appStates[appKey][fields[i]] === null) { //null => delete
            delete area.appStates[appKey][fields[i]];
        }
    }
}*/


function _ProcessUserAppStateUpdate(idUser: string, appKey:string, newState:{ [field:string]:any}):void {
    let user:User = activeUsers[idUser];
    if (!user) {
        $d.log(('Received state update for user #'+idUser+' which is not active here, ignoring').gray, newState);
        return;
    }

    if (!user.hasActiveApp(appKey)) {
        if (user.runningApps && user.runningApps[appKey]) {
            user.runningApps[appKey]._userAppState = {}; //erase
        }
        $d.log(('Received state update for user #'+idUser+' who isn\'t running app '+appKey+', ignoring').gray, newState);
        return;
    }

    //newState always complete here
    if (!user.runningApps[appKey]._userAppState) user.runningApps[appKey]._userAppState = {};
    let newFields:string[] = Object.keys(newState);
    
    //pushing only changes 
    let clientStateUpdateData:ClientStateData = {
        app: appKey,
        state: {} //only pushing diff and nulls for field remove here
    };
    let avatarStateFieldChanged: boolean = false;
    let clientStateChanged: boolean = false;

    for (let j = 0; j < newFields.length; j++) {
        let fieldName:string = newFields[j];
        if (fieldName == 'avatar') { //only 'avatar' field gets pushed to other avatars
            avatarStateFieldChanged = true;
        }
        if (newState[fieldName] === null && user.runningApps[appKey]._userAppState[fieldName] !== undefined) { //null => delete
            clientStateUpdateData.state[fieldName] = null; //delete field
            delete user.runningApps[appKey]._userAppState[fieldName]; //delete sate field from cache
            clientStateChanged = true;
        } else if (user.runningApps[appKey]._userAppState[fieldName] !== newState[fieldName]) {
            clientStateUpdateData.state[fieldName] = newState[fieldName];
            user.runningApps[appKey]._userAppState[fieldName] = newState[fieldName]; //update state field in cache
            clientStateChanged = true;
        }
    }

    // push only changes to the user herself
    if (clientStateChanged) {
        $d.log(("<< ... pushing user state update to "+user).magenta, clientStateUpdateData);
        user.socket.emit('state', clientStateUpdateData);
    }
    
    // if 'avatar' field changed, push it to all observers running this app
    if (avatarStateFieldChanged) { //only 'avatars' gets pushed to observers
        user.updateSelfAvatarAppStatesForObservers([ appKey ], activeUsers);
    }
}

let _fakePoseFrame:number = 0;
function _DebugRelocalizeSession(idSession:string, idTargetSession:string, removeFromArea:boolean, fakeUserViewpointPosion:number[], fakeUserViewpointRotation:number[]) {
    let justLoaded:boolean = !activeSessions[idSession];
    SessionHelpers.LoadSession(idSession, activeSessions, worldDb, REGION_PARTITION, VERBOSE, kafkaProducer, (loadedSession:Session) => {
        
        if (removeFromArea) {
            if (activeSessions[idSession].idArea && activeAreas[activeSessions[idSession].idArea]) {
                delete activeAreas[activeSessions[idSession].idArea].sessions[idSession];
            }
    
            activeSessions[idSession].idArea = null;
            activeSessions[idSession].transformToArea = null;
            activeSessions[idSession].finalized = false;
            activeSessions[idSession].produceUpdate(kafkaProducer, VERBOSE);
        } else if (justLoaded) {
            activeSessions[idSession].finalized = false;
            activeSessions[idSession].produceUpdate(kafkaProducer, VERBOSE);
        }
        
        if (fakeUserViewpointPosion && fakeUserViewpointRotation) {
            let fakeSlowUpdate:SlowMonitorUpdateData = {
                p: fakeUserViewpointPosion,
                r: fakeUserViewpointRotation,
                f: ++_fakePoseFrame,
            };
    
            try {
                kafkaProducer.produce(
                    'slow-client-pose',
                    REGION_PARTITION,
                    Buffer.from(JSON.stringify(fakeSlowUpdate)),
                    'fakeDebugUser'+'@'+idSession,
                    Date.now(),
                    null
                );
            } catch (err) {
                $d.err('A problem occurred when faking slow-client-pose message for #'+idSession+' in partition '+REGION_PARTITION, err);
            }
        }

        let requestPreference:SessionLocalizeRequestData = {
            isDebug: true, //won't be saved to the db history on [L]
        }
        if (idTargetSession) {
            requestPreference.idTargetSession = idTargetSession;
        }

        try {
            kafkaProducer.produce(
                'session-states',
                REGION_PARTITION,
                requestPreference?Buffer.from(JSON.stringify(requestPreference)):null,
                'localize:'+idSession,
                Date.now(),
                null
            );
        } catch (err) {
            $d.err('A problem occurred while sending a LOCALIZE request to {session-states}, partition='+REGION_PARTITION, err);
        }
    },
    () => {
        $d.e('Error loading session #'+idSession);
    });
}




function GetSystemInfo() : any {
    let info : any = {
        'node' : NodeTypeToName(ClientType.SESS_M, [ REGION_PARTITION ] ),
        'type' : 'SESSION.M',
        'region' : REGION_PARTITION,
        'time' : Date.now(),
        'started' : startupTime,

        'kafka' : {
                
            'brokerList' : KAFKA_BROKER_LIST,
            'librdkafkaVersion' : Kafka.librdkafkaVersion,

            'producerId' : KAFKA_PRODUCER_ID,
            'producerConnected' : kafkaProducerConnected,

            'consumerId' : KAFKA_CONSUMER_ID,
            'consumerConnected' : consumerWrapper ? consumerWrapper.connected : false,

            //'areaObjectConsumerGroupId' : CONFIG['CTRL'].kafkaAppObjConsumerGroupId,
            //'fastUserConsumerGroupId' : CONFIG['CTRL'].kafkaFastUserConsumerGroupId,

            //'featureConsumerGroupId' : kafkaFeatureConsumerGroupId,
            //'featureProducerConnected' : kafkaFeatureConsumerConnected,
        },

        'users' : [],
        'areas' : {},
        'sessions' : {},
        'numObjectsPerApp' : {},
        'numObjectsPerSession' : {},
        'objs' : [],
    };

    let userIds:string[] = Object.keys(activeUsers);
    for (let i = 0; i < userIds.length; i++) {
        let idUser:string = userIds[i];
        let user:User = activeUsers[idUser];
        if (user.clientType == ClientType.PHNTM) {
            let userInfo:any = {
                clientType: NodeTypeToName(user.clientType),
                idUser: user.idUser,
                csid: user.csid,
                idDevice: (user.userData && user.userData ? user.userData.idDevice : null),
                debugFollowUser: user.debugFollowUser,
                idSession: user.idSession,
                sessionPresence: {},
                observedAvatars: user.observedAvatars,
                //userSubscriptions: userSessions[i].userSubscriptions,
                //pointCloudSubscriptions: userSessions[i].pointCloudSubscriptions,
                isConnected: user.isConnected,
                stateUpdatedTime: user.stateUpdatedTime,
                clientAddress: user.clientAddress,
                lastGps: (user.lastGps ? user.lastGps.toArray().toString() : null),
                lastSlowPosition: ArrayToFixedString(user.position),
                lastSlowRotation: ArrayToFixedString(user.rotation),
                runningApps: {},
                featureSubscriptions: user.featureSubscriptions,
            };

            let userSessionIds:string[] = Object.keys(user.sessionPresence);
            for (let j = 0; j < userSessionIds.length; j++) {
                userInfo.sessionPresence[userSessionIds[j]] = {
                    clientId: user.sessionPresence[userSessionIds[j]].clientSessionId,
                    transform: ArrayToFixedString(user.sessionPresence[userSessionIds[j]].transform),
                }
            }
            
            if (user.runningApps) {
                let userAppKeys:string[] = Object.keys(user.runningApps);
                for (let j = 0; j < userAppKeys.length; j++) {
                    userInfo.runningApps[userAppKeys[j]] = {
                        name: user.runningApps[userAppKeys[j]].name,
                        appKey: user.runningApps[userAppKeys[j]].appKey,
                        wmode: user.runningApps[userAppKeys[j]].wmode,
                        objects: user.runningApps[userAppKeys[j]]._objects ? ObjectSize(user.runningApps[userAppKeys[j]]._objects) : 0,
                    }
                }
            }



            info.users.push(userInfo);
        }
    }
    if (activeAreas) {
        let areaIds:string[] = Object.keys(activeAreas);
        for (let i = 0; i < areaIds.length; i++) {
            let a:Area = activeAreas[areaIds[i]];
            info.areas[a.idArea] = {
                idArea: a.idArea,
                appPhysicsMasters: a.appPhysicsMasters,
                sessions: {},
            }; 
            let childrenSessionIds:string[] = a.sessions ? Object.keys(a.sessions) : [];
            for (let j = 0; j < childrenSessionIds.length; j++) {
                let idSession:string = childrenSessionIds[j];
                info.areas[a.idArea].sessions[idSession] = ArrayToFixedString(a.sessions[idSession].transform);
            }
        }

        
        
    }
    if (activeSessions) {
        let sessionIds:string[] = Object.keys(activeSessions);
        for (let i = 0; i < sessionIds.length; i++) {
            let s:Session = activeSessions[sessionIds[i]];
            info.sessions[s.idSession] = {
                idSession: s.idSession,
                idArea: s.idArea,
                transformToArea: ArrayToFixedString(s.transformToArea),
                //bounds: s.bounds && s.bounds.length == 2 ? [ ArrayToFixedString(s.bounds[0]), ArrayToFixedString(s.bounds[1])] : null,
                updatedTime:s.updatedTime,
                observers: s.observers ? ObjectSize(s.observers) : 0,
                gps: s.gps ? s.gps.toString() : null,
                //objects: a.objects ? ObjectSize(a.objects) : 0,
                abandonedTime: s.abandonedTime,
                
            }; 
        }
    }

    if (sessionObjects) {
        let sessionIds:string[] = Object.keys(sessionObjects);
        for (let i = 0; i < sessionIds.length; i++) {
            info.numObjectsPerSession[sessionIds[i]] = {};
            if (!sessionObjects[sessionIds[i]]) continue;
            
            let sessionAppKeys:string[] = Object.keys(sessionObjects[sessionIds[i]]);
            for (let j = 0; j < sessionAppKeys.length; j++) {
                info.numObjectsPerSession[sessionIds[i]][sessionAppKeys[j]] = sessionObjects[sessionIds[i]][sessionAppKeys[j]] ? ObjectSize(sessionObjects[sessionIds[i]][sessionAppKeys[j]]) : 0;
            }
            
            
        }
    }
    if (activeObjects) {
        let objIds:number[] = Object.keys(activeObjects).map((v:string):number=>{return parseInt(v)});
        for (let i = 0; i < objIds.length; i++) {
            let o:AppObject = activeObjects[objIds[i]];

            if (info.numObjectsPerApp[o.appKey]) {
                info.numObjectsPerApp[o.appKey]++;
            } else {
                info.numObjectsPerApp[o.appKey] = 1;
            }

            info.objs.push({
                id: o.id,
                idSession: o.idSession,
                position: ArrayToFixedString(o.position),
                rotation: ArrayToFixedString(o.rotation),
                scale: ArrayToFixedString(o.scale),
                lastLock: o.lastClientLockedBy,
                state: o.state,
            })
        }
        
    }

    return info;
}

//error handling & shutdown
process.on('uncaughtException', (err:any) => {
    CommonHelpers.UncaughtExceptionHandler(err, false);
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

function _Clear() {
    if (shuttingDown) return;
    shuttingDown = true;

    $d.log("Cleaning up...");

    io.close();
    clearInterval(cleanupTimer);
    _SaveAndClearAbandonedSessions(); //will wait until areas and sessions clear

    if (consumerWrapper) {
        consumerWrapper.kill();
    }
}

function ShutdownWhenClear() {
    if ((consumerWrapper && consumerWrapper.connected)
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
    }

    process.exit(0);
}