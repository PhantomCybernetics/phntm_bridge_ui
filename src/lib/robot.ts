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
    discovery: boolean;

    static connectedRobots:Robot[] = [];

    public AddToConnedted() {
        if (Robot.connectedRobots.indexOf(this) == -1) {
            Robot.connectedRobots.push(this);
            this.StateToSubscribers();
        }
    }

    public RemoveFromConnedted(notify:boolean = true) {
        let index = Robot.connectedRobots.indexOf(this);
        if (index != -1) {
            Robot.connectedRobots.splice(index, 1);
            if (notify)
                this.StateToSubscribers();
        }
    }

    static GetStateData(id: ObjectId, robot?:Robot):any {
        let data:any = {
            id_robot: id.toString()
        }
        if (robot) {
            data['name'] =  robot.name ? robot.name : 'Unnamed Robot';
            if (robot.socket)
                data['ip'] =  robot.socket.conn.remoteAddress;
            data['discovery'] =  robot.discovery;
        }



        return data;
    }

    public StateToSubscribers():void {
        App.connectedApps.forEach(app => {
            if (app.IsSubscribedToRobot(this.id_robot)) {
                app.socket.emit('robot', Robot.GetStateData(this.id_robot, this))
            }
        });
    }

    public GetTopicsData():any {
        let robotTopicsData:any = {}
        robotTopicsData[this.id_robot.toString()] = this.topics;
        return robotTopicsData;
    }

    public TopicsToSubscribers():void {
        let robotTopicsData = this.GetTopicsData();
        App.connectedApps.forEach(app => {
            if (app.IsSubscribedToRobot(this.id_robot)) {
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
            if (app.IsSubscribedToRobot(this.id_robot)) {
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
            if (app.IsSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting cameras to app', robotCamerasData);
                app.socket.emit('cameras', robotCamerasData)
            }
        });
    }

    public DiscoveryToSubscribers():void {
        let discoveryOn = this.discovery;
        App.connectedApps.forEach(app => {
            if (app.IsSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting discovery state to app', discoveryOn);
                app.socket.emit('discovery', discoveryOn)
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
            if (app.IsSubscribedToRobot(this.id_robot)) {
                // $d.l('emitting docker to app', robotDockerContainersData);
                app.socket.emit('docker', robotDockerContainersData)
            }
        });
    }

    // public ___WebRTCOfferToSubscribers():void {

    //     App.connectedApps.forEach(app => {
    //         if (app.IsSubscribedToRobot(this.id_robot)) {
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