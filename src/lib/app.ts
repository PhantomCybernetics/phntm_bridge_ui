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

    constructor() {
        this.id_instance = new ObjectId(); //generated here
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