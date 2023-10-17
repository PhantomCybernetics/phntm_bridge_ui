import { Debugger } from "./debugger";
const $d:Debugger = Debugger.Get();

import { parseRos2idl } from "@foxglove/rosmsg";
import { MessageDefinition } from "@foxglove/message-definition";

const fs = require('fs');

export function ImportMessageTypes(dir:string, MSG_TYPES_DIR:string, MSG_TYPES_JSON_FILE:string):MessageDefinition[] {
    let imporrtedDefinitions:MessageDefinition[] = [];

    let rootDir = dir + '/' + MSG_TYPES_DIR;
    $d.l('Importing .idl message types from '+ rootDir)
    let dirs:string[] = fs.readdirSync(rootDir)
    for (let i = 0; i < dirs.length; i++) {
        //check if dir
        let subDir = rootDir + dirs[i];
        if (fs.lstatSync(subDir).isDirectory()) {

            let files:string[] = fs.readdirSync(subDir)
            let numImported = 0;
            for (let j = 0; j < files.length; j++) {
                if (files[j].indexOf('.idl') == -1)
                    continue

                let fname = subDir+'/'+files[j];
                //$d.l('Importing '+(fname).cyan);
                let idl:string = fs.readFileSync(fname).toString()
                let defs:MessageDefinition[] = parseRos2idl(idl); // for ROS 2 definitions
                //$d.l('... done: ', defs);
                for (let k = 0; k < defs.length; k++) {
                    let def = defs[k];
                    //$d.l('def '+def.name, def.definitions);
                    imporrtedDefinitions.push(def);
                    numImported++;
                }
            }
            $d.l('  '+numImported+' defs imported from '+dirs[i].cyan)
        } else {
            $d.l(('Ignoring '+dirs[i]).gray)
        }
    }

    let fnameOut = dir + '/' + MSG_TYPES_JSON_FILE;
    $d.l('Imported '+((imporrtedDefinitions.length+'').cyan)+' msg defs, saving to '+fnameOut.cyan);
    fs.writeFileSync(fnameOut, JSON.stringify(imporrtedDefinitions, null, 2), {encoding:'utf8'});

    return imporrtedDefinitions;

}

