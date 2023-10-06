import { Debugger } from "./debugger";
const $d:Debugger = Debugger.Get();

import * as SocketIO from "socket.io";
import { ObjectId } from 'mongodb';
import { App } from './app'

export class RobotSocket extends SocketIO.Socket {
    dbData?: any;
}

export class Robot {
    id_robot: ObjectId;
    name: string;
    type: ObjectId;
    isConnected: boolean;
    isAuthentificated: boolean;
    socket: RobotSocket;
    topics: {topic: string, msgTypes:string[]}[];
    services: {service: string, msgType:string}[];
    docker_containers: {id: string, name:string, image:string, short_id: string, status:string }[];
    cameras: {id: string, info: any}[];
    introspection: boolean;

    static connectedRobots:Robot[] = [];

    public addToConnected() {
        if (Robot.connectedRobots.indexOf(this) == -1) {
            Robot.connectedRobots.push(this);
            let robot = this;
            App.connectedApps.forEach(app => {
                let sub:any = {};
                if (app.isSubscribedToRobot(this.id_robot, sub)) {
                    robot.init_peer(app, sub.read, sub.write)
                }
            });
        }
    }

    public init_peer(app:App, read?:string[], write?:string[][], returnCallback?:any) {
        let data = {
            id_app: app.id_app.toString(),
            id_instance: app.id_instance.toString(),
            read: read,
            write: write,
        }

        $d.log('Calling robot:peer with data', data);
        this.socket.emit('peer', data, (answerData:{state?: any, offer:string }) => {

            this.getStateData(answerData);

            $d.log('Got robot\'s answer:', answerData);
            if (returnCallback) {
                returnCallback(answerData);
            } else {
                app.socket.emit('robot', answerData);
            }

            app.socket.emit('topics', this.GetTopicsData());
            app.socket.emit('services', this.GetServicesData());
            app.socket.emit('cameras', this.GetCamerasData());
            app.socket.emit('docker', this.GetDockerContinersData());
        });
    }

    public removeFromConnected(notify:boolean = true) {
        let index = Robot.connectedRobots.indexOf(this);
        if (index != -1) {
            Robot.connectedRobots.splice(index, 1);
            if (notify) {
                let that = this;
                App.connectedApps.forEach(app => {
                    if (app.isSubscribedToRobot(this.id_robot)) {
                        app.socket.emit('robot', that.getStateData()) //offline
                    }
                });
            }
        }
    }

    public getStateData(data:any=null):any {
        if (data == null)
            data = {};

        data['id_robot'] = this.id_robot.toString()
        data['name'] =  this.name ? this.name : 'Unnamed Robot';
        if (this.socket)
            data['ip'] =  this.socket.conn.remoteAddress; //no ip = robot offline
        data['introspection'] = this.introspection;

        return data;
    }

    public GetTopicsData():any {
        let robotTopicsData:any = {}
        robotTopicsData[this.id_robot.toString()] = this.topics;
        return robotTopicsData;
    }

    public TopicsToSubscribers():void {
        let robotTopicsData = this.GetTopicsData();
        App.connectedApps.forEach(app => {
            if (app.isSubscribedToRobot(this.id_robot)) {
                app.socket.emit('topics', robotTopicsData)
            }
        });
    }

    public GetServicesData():any {
        let robotServicesData:any = {}
        robotServicesData[this.id_robot.toString()] = this.services;
        return robotServicesData;
    }

    public ServicesToSubscribers():void {
        let robotServicesData = this.GetServicesData();
        App.connectedApps.forEach(app => {
            if (app.isSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting services to app', robotServicesData);
                app.socket.emit('services', robotServicesData)
            }
        });
    }

    public GetCamerasData():any {
        let robotCamerasData:any = {}
        robotCamerasData[this.id_robot.toString()] = this.cameras;
        return robotCamerasData;
    }

    public CamerasToSubscribers():void {
        let robotCamerasData = this.GetCamerasData();
        App.connectedApps.forEach(app => {
            if (app.isSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting cameras to app', robotCamerasData);
                app.socket.emit('cameras', robotCamerasData)
            }
        });
    }

    public IntrospectionToSubscribers():void {
        App.connectedApps.forEach(app => {
            if (app.isSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting discovery state to app', discoveryOn);
                app.socket.emit('introspection', this.introspection)
            }
        });
    }

    public GetDockerContinersData():any {
        let robotDockerContainersData:any = {}
        robotDockerContainersData[this.id_robot.toString()] = this.docker_containers;
        return robotDockerContainersData;
    }

    public DockerContainersToSubscribers():void {
        let robotDockerContainersData = this.GetDockerContinersData();
        App.connectedApps.forEach(app => {
            if (app.isSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting docker to app', robotDockerContainersData);
                app.socket.emit('docker', robotDockerContainersData)
            }
        });
    }

    // public ___WebRTCOfferToSubscribers():void {

    //     App.connectedApps.forEach(app => {
    //         if (app.isSubscribedToRobot(this.id_robot)) {
    //             this.ConnectWebRTC(app)
    //         }
    //     });

    // }

    // public ___ConnectWebRTC(app:App):void {
    //     let that = this;
    //     if (!this.socket || !this.isConnected)
    //         return;
    //     this.socket.emit('make_offer', { id_app: app.id_app.toString(), id_instance: app.id_instance.toString() }, function (offer:any) {
    //         $d.l('Got offer from the robot:', offer);
    //         let offerData:any = {};
    //         offerData[that.id_robot.toString()] = offer;
    //         app.socket.emit('offer', offerData, function (appReply:any) {
    //             $d.l('App replied:', appReply);
    //         });
    //     });
    // }

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