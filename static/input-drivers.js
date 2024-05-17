

export function Handle_Shortcut(cfg, client) {
        
    let kb = client.ui.keyboard;
    let gp = client.ui.gamepad;

    // Call single ROS service:
    // {
    //    service: "/start_motor"
    // }
    //   or 
    // {
    //    service: [ "/start_motor", data ]
    // }
    if (cfg['service']) {
        if (typeof cfg['service'] === 'string' || cfg['service'] instanceof String) {
            console.log('Calling service '+cfg['service']);
            client.service_call(cfg['service']);
        } else if (Array.isArray(cfg['service']) && cfg['service'].length == 2) {
            console.log('Calling service '+cfg['service'][0]+' with data: ', cfg['service'][1]);
            client.service_call(cfg['service'][0], cfg['service'][1]);
        } else {
            console.error('Invalid service shortcut configuration', cfg['service']);
        }
    }

    // Call multiple ROS services:
    // {
    //    services: [ "/start_motor", "/stop_motor" ]
    // }
    //   or
    // {
    //    services: [
    //          [ "/start_motor", data ],
    //          [ "/stop_motor", data ]
    //    ]
    // }
    if (cfg['services']) {
        if (Array.isArray(cfg['services'])) {
            cfg['services'].forEach((one_cfg)=>{
                if (typeof one_cfg === 'string' || one_cfg instanceof String) {
                    console.log('Calling service '+one_cfg);
                    client.service_call(one_cfg);
                } else if (Array.isArray(one_cfg) && one_cfg.length == 2) {
                    console.log('Calling service '+one_cfg[0]+' with data: ', one_cfg[1]);
                    client.service_call(one_cfg[0], one_cfg[1]);
                } else {
                    console.error('Invalid service shortcut configuration', one_cfg);
                }
            });
        } else {
            console.error('Invalid services shortcut configuration', cfg['service']);
        }
    }

    // Click UI elements
    // {
    //    click: "#element_id"
    // }
    // or
    // {
    //    click: [ "#element1_id", "#element2_id" ]
    // }
    if (cfg['click']) {
        if (!Array.isArray()) { //one el
            console.log('Calling click '+cfg['click']);
            $(cfg['click']).click()
        } else { // multiple
            cfg['click'].forEach((el_id)=>{
                $(el_id).click();
            })
        }
    }

    // Set keyboard driver
    // {
    //    set_kb_driver: "Twist"
    // }
    if (cfg['set_kb_driver'] && kb) {
        console.log('Calling set_kb_driver '+cfg['set_kb_driver']);
        let id_driver = cfg['set_kb_driver'];
        if (kb.drivers[id_driver] && kb.current_driver != kb.drivers[id_driver]) {
            $('#keyboard_driver').val(id_driver).change();
        }
    }

    // Set gamepad driver
    // {
    //    set_gp_driver: "Joy"
    // }
    if (cfg['set_gp_driver'] && kb) {
        console.log('Calling set_gp_driver '+cfg['set_gp_driver']);
        let id_driver = cfg['set_gp_driver'];
        if (gp.drivers[id_driver] && gp.current_driver != gp.drivers[id_driver]) {
            $('#gamepad_driver').val(id_driver).change();
        }
    }
    
    // Cycle over keyboard driver list
    // {
    //    cycle_kb_drivers: [ "Twist", "Twist_Reverse" ]
    // }
    if (cfg['cycle_kb_drivers'] && kb) {
        console.log('Cycling kb_drivers '+cfg['cycle_kb_drivers']);
        if (!Array.isArray(cfg['cycle_kb_drivers']) || !cfg['cycle_kb_drivers'].length)
            return;
        let list = cfg['cycle_kb_drivers'];
        let pos = list.indexOf(kb.current_driver.id);
        pos++; // -1 => 0
        if (pos > list.length-1)
            pos = 0;
        let id_driver = list[pos];
        if (kb.drivers[id_driver] && kb.current_driver != kb.drivers[id_driver]) {
            $('#keyboard_driver').val(id_driver).change();
        }
    } 
    
    // Cycle over gamepad driver list
    // {
    //    cycle_gp_drivers: [ "Twist", "Joy", "Twist_Reverse" ]
    // }
    if (cfg['cycle_gp_drivers'] && gp) {
        console.log('Cycling gp_drivers '+cfg['cycle_gp_drivers']);
        if (!Array.isArray(cfg['cycle_gp_drivers']) || !cfg['cycle_gp_drivers'].length)
            return;
        let list = cfg['cycle_gp_drivers'];
        let pos = list.indexOf(gp.current_driver.id);
        pos++; // -1 => 0
        if (pos > list.length-1)
            pos = 0;
        let id_driver = list[pos];
        if (gp.drivers[id_driver] && gp.current_driver != gp.drivers[id_driver]) {
            $('#gamepad_driver').val(id_driver).change();
        }
    } 
}







// export class TwistStampedInputDriver extends TwistInputDriver {
//     msg_type = 'geometry_msgs/msg/TwistStamped';

//     constructor(id, label) {
//         super(id, label); // TwistInputDriver
//         this.default_gamepad_config.topic = '/cmd_vel_stamped'; // don't mix msg types in one topic!
//         this.default_keyboard_config.topic = '/cmd_vel_stamped';
//     }
// }