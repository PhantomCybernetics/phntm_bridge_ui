import { Debugger } from "./debugger";
const $d:Debugger = Debugger.Get();

import * as SocketIO from "socket.io";
import { ObjectId } from 'mongodb';

export class App {
    id_app: ObjectId;
    id_instance: ObjectId;
    isConnected: boolean;
    isAuthentificated: boolean;
    socket: SocketIO.Socket;
    robotSubscriptions: ObjectId[];

    static connectedApps:App[] = [];

    constructor() {
        this.id_instance = new ObjectId();
    }

    public AddToConnedted() {
        if (App.connectedApps.indexOf(this) == -1) {
            App.connectedApps.push(this);
        }
    }

    public RemoveFromConnected() {
        let index = App.connectedApps.indexOf(this);
        if (index != -1) {
            App.connectedApps.splice(index, 1);
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