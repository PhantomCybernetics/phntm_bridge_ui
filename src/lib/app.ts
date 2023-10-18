import { Debugger } from "./debugger";
const $d:Debugger = Debugger.Get();

import * as SocketIO from "socket.io";
import { ObjectId } from 'mongodb';

export class AppSocket extends SocketIO.Socket {
    dbData?: any;
}

export class App {
    id_app: ObjectId;
    id_instance: ObjectId;
    name: string;
    isConnected: boolean;
    isAuthentificated: boolean;
    socket: AppSocket;
    robotSubscriptions: {
        id_robot: ObjectId,
        read?:string[],
        write?:string[][],
    }[]

    static connectedApps:App[] = [];

    constructor(id_instance?:string) {
        //generates new instance id if undefined
        this.id_instance = new ObjectId(id_instance);
    }

    static FindConnected(id_app:ObjectId, id_instance:ObjectId):App {

        for (let i = 0; i < App.connectedApps.length; i++) {
            if (App.connectedApps[i].id_app.equals(id_app) &&
                App.connectedApps[i].id_instance.equals(id_instance))
            {
                return App.connectedApps[i];
            }
        }

        return null;
    }

    public addToConnected() {
        if (App.connectedApps.indexOf(this) == -1) {
            App.connectedApps.push(this);
        }
    }

    public removeFromConnected() {
        let index = App.connectedApps.indexOf(this);
        if (index != -1) {
            App.connectedApps.splice(index, 1);
        }
    }

    public subscribeRobot(idRobot: ObjectId, read?:string[], write?:string[][]) {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].id_robot.equals(idRobot)) {
                this.robotSubscriptions[i].read = read;
                this.robotSubscriptions[i].write = write;
                return;
            }

        }
        this.robotSubscriptions.push({
            id_robot: idRobot,
            read: read,
            write: write
        });
    }

    public addToRobotSubscriptions(idRobot: ObjectId, read?:string[], write?:string[][]) {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].id_robot.equals(idRobot)) {

                if (read) {
                    read.forEach((id_src)=>{
                        if (this.robotSubscriptions[i].read.indexOf(id_src) === -1)
                            this.robotSubscriptions[i].read.push(id_src);
                    });
                }
                if (write) {
                    write.forEach((id_src)=>{
                        if (this.robotSubscriptions[i].write.indexOf(id_src) === -1)
                            this.robotSubscriptions[i].write.push(id_src);
                    });
                }
                return;
            }
        }
    }

    public removeFromRobotSubscriptions(idRobot: ObjectId, read?:string[], write?:string[]) {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].id_robot.equals(idRobot)) {

                if (read) {
                    read.forEach((id_src)=>{
                        let p = this.robotSubscriptions[i].read.indexOf(id_src);
                        if (p !== -1)
                            this.robotSubscriptions[i].read.splice(p, 1);
                    });
                }
                if (write) {
                    write.forEach((id_src)=>{
                        for (let i = 0; i < this.robotSubscriptions[i].write.length; i++) {
                            if (this.robotSubscriptions[i].write[i][0] == id_src) {
                                this.robotSubscriptions[i].write.splice(i, 1)
                                i--;
                            }
                        }
                    });
                }
                return;
            }
        }
    }

    public isSubscribedToRobot(idRobot: ObjectId, out_subscription?:any):boolean {
        for (let i = 0; i < this.robotSubscriptions.length; i++) {
            if (this.robotSubscriptions[i].id_robot.equals(idRobot)) {
                if (out_subscription !== undefined) {
                    out_subscription.read = this.robotSubscriptions[i].read;
                    out_subscription.write = this.robotSubscriptions[i].write;
                }
                return true;
            }

        }
        return false;
    }

}