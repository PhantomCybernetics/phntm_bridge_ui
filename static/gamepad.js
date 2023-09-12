let idGamepad = null;
window.gamepadController = null;

let capturing_gamepad_input = false;
let captured_gamepad_input = [];
let gamepad_service_mapping = {}

const axes_config = {
    0: { dead_zone: [ -0.02, 0.02, 0.0 ] },
    1: { dead_zone: [ -0.02, 0.02, 0.0 ] },
    2: { dead_zone: [ -0.02, 0.02, 0.0 ] },
    3: { dead_zone: [ -10.0, -0.98, -10.0 ] },
    4: { dead_zone: [ -10.0, -0.98, -10.0 ] },
}

function lerp(a, b, alpha ) {
    return a + alpha * (b-a)
}

function apply_axis_deadzone(val, id_axis) {
    if (axes_config[id_axis] && axes_config[id_axis]['dead_zone']
        && val > axes_config[id_axis]['dead_zone'][0] && val < axes_config[id_axis]['dead_zone'][1]
    )
        return axes_config[id_axis]['dead_zone'][2] // return dead val

    return val;
}

// browser => joy remapping
// const id_dead_man_switch_btn = 4; //will send this as true
// const browser2joy_mapping = {
//     //local btn => send as
//     buttons: {
//         9: 7, // fast mode
//         7: 5  // slow mode
//     },
//     //local axis => [ send_as, scale_factor ]
//     axes: {
//         // linear x (fw/back)
//         1 : [ 1, 1.0],

//         // left right steer
//         0 : [ 0, 1.0 ],

//         // strife w mecanum wheels
//         2 : [ 2, -1.0]
//     }
// }

class GamepadController {

    constructor(pc, id_robot, socket, supported_msg_types) {

        this.joy_msg_type = 'sensor_msgs/msg/Joy';
        this.joy_topic = '/joy';

        this.twist_msg_type = 'geometry_msgs/msg/Twist';
        // this.twist_stamped_msg_type = 'geometry_msgs/msg/TwistStamped';
        this.twist_topic = '/cmd_vel';
        // this.twist_stamped_topic = '/cmd_vel';

        this.joy_msg_class = FindMessageType(this.joy_msg_type, supported_msg_types);
        this.twist_msg_class = FindMessageType(this.twist_msg_type, supported_msg_types);
        // this.twist_stamped_msg_class = FindMessageType(this.twist_stamped_msg_type, supported_msg_types);

        this.socket = socket;
        this.id_robot = id_robot;

        console.log('Gamnepad msg classes:', this.joy_msg_class, this.twist_msg_type, this.twist_stamped_msg_type);

        let Writer = window.Serialization.MessageWriter;
        this.msg_writers = {}
        this.msg_writers[this.joy_msg_type] = new Writer( [ this.joy_msg_class ].concat(supported_msg_types) );
        this.msg_writers[this.twist_msg_type] = new Writer( [ this.twist_msg_class ].concat(supported_msg_types) );
        // this.msg_writers[this.twist_stamped_msg_type] = new Writer( [ this.twist_stamped_msg_class ].concat(supported_msg_types) );

        this.dcs = {};

        let that = this;
        window.addEventListener('gamepadconnected', (event) => {
            console.warn('Gamepad connected:', event.gamepad);
            idGamepad = event.gamepad.index;

            $('#gamepad').addClass('connected');

            if (pc && pc.connectionState == 'connected')
                that.InitProducers();

            that.UpdateLoop();
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            if (idGamepad == event.gamepad.index) {
                idGamepad = null; //kills the loop
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad').removeClass('connected');
            }
        });
    }

    InitProducers () {

        // return; //!! disabled for now
        let subscription_data = {
            id_robot: this.id_robot,
            topics: []
        };

        if (!this.dcs[this.joy_topic])
            subscription_data.topics.push([ this.joy_topic, 1, this.joy_msg_type ])

        if (!this.dcs[this.twist_topic])
            subscription_data.topics.push([ this.twist_topic, 1, this.twist_msg_type ])

        // if (!this.dcs[this.twist_stamped_topic])
        //     subscription_data.topics.push([ this.twist_stamped_topic, 1, this.twist_stamped_msg_type ])

        if (!subscription_data.topics.length)
            return;

        this.socket.emit('subcribe:write', subscription_data, (res) => {
            if (res['success']) {
                for (let i = 0; i < res['subscribed'].length; i++) {

                    let topic = res['subscribed'][i][0];
                    let id = res['subscribed'][i][1];
                    let protocol = res['subscribed'][i][2];

                    console.log('Making local DC for '+topic+', id='+id+', protocol='+protocol)
                    this.dcs[topic] = pc.createDataChannel(topic, {
                        negotiated: true,
                        ordered: false,
                        maxRetransmits: null,
                        id:id
                    });

                    this.dcs[topic].addEventListener('open', (ev)=> {
                        console.info('DC '+topic+'/W opened', this.dcs[topic])
                    });
                    this.dcs[topic].addEventListener('close', (ev)=> {
                        console.info('DC '+topic+'/W closed')
                        delete this.dcs[topic];
                    });
                    this.dcs[topic].addEventListener('error', (ev)=> {
                        console.error('DC '+topic+'/W error', ev)
                        delete this.dcs[topic];
                    });
                    this.dcs[topic].addEventListener('message', (ev)=> {
                        console.warn('DC '+topic+'/W message!!', ev); //this should not be as we use separate r/w channels
                    });
                }
            } else {
                console.warn('Error setting up gamepad publisher: ', res);
            }
        });
    }

    ClearProducers() {
        for (const topic of Object.keys(this.dcs)) {
            if (this.dcs[topic])
                this.dcs[topic].close();
        }
        this.dcs = {}
    }

    Write(topic, msg_type, msg) {
        if (!this.dcs[topic] || this.dcs[topic].readyState != 'open') {
            if (this.dcs[topic])
                console.warn('Gamepad dc not ready for '+topic+': '+(this.dcs[topic] ? 'state='+this.dcs[topic].readyState : 'Not initiated'))
            return;
        }
        let payload = this.msg_writers[msg_type].writeMessage(msg); //to binary
        //console.log('Writing '+msg_type+' into '+topic, this.dcs[topic])
        this.dcs[topic].send(payload);
    }

    UpdateLoop() {
        if (idGamepad == null)
            return;

        let transmitting = $('#gamepad_enabled').is(':checked');
        let transmitting_type = $('#gamepad_msg_type').val()

        const gp = navigator.getGamepads()[idGamepad];

        let buttons = gp.buttons;
        let axes = gp.axes;

        let now_ms = Date.now(); //window.performance.now()
        let sec = Math.floor(now_ms / 1000)
        let nanosec = (now_ms - sec*1000) * 1000000
        // console.log(now)

        let msg = {}

        switch (transmitting_type) {
            case 'Joy': //forward joy
                msg = {
                    header: {
                        stamp: {
                            sec: sec,
                            nanosec: nanosec
                        },
                        frame_id: 'phntm'
                    },
                    axes: [],
                    buttons: []
                }
                for (let id_axis = 0; id_axis < axes.length; id_axis++) {
                    let val = apply_axis_deadzone(axes[id_axis], id_axis)
                    msg.axes[id_axis] = val
                }
                for (let id_btn = 0; id_btn < buttons.length; id_btn++) {
                    msg.buttons[id_btn] = buttons[id_btn].pressed;;
                }
                break;
            case 'Twist':
            // case 'TwistStamped':

                let fw_speed = apply_axis_deadzone(axes[1], 1); // (-1,1)

                let val_strife = 0.0;
                let val_strife_l = apply_axis_deadzone(axes[4], 4)
                if (val_strife_l > -1) {
                    val_strife -= (val_strife_l + 1.0) / 4.0; // (-.5,0)
                }
                let val_strife_r = apply_axis_deadzone(axes[3], 3)
                if (val_strife_r > -1) {
                    val_strife += (val_strife_r + 1.0) / 4.0; // (0,.5)
                }
                let turn_amount = apply_axis_deadzone(-axes[2], 2); // (-1,1)
                let turn_speed_max = 2.0; //at 0.0 fw speed
                let turn_speed_min = 0.7; //at 1.0 fw speed
                let turn_speed = lerp(turn_speed_max, turn_speed_min, Math.abs(fw_speed))
                msg = {
                        "linear": {
                            "x": fw_speed, //fw / back (-1,1)
                            "y": val_strife, //strife (-.5,0.5)
                            "z": 0
                        },
                        "angular": {
                            "x": 0,
                            "y": 0,
                            "z": turn_amount * turn_speed, //turn (-3,3)
                        }
                }

                // if (transmitting_type == 'TwistStamped') {
                //     msg = {
                //         header: {
                //             stamp: {
                //                 sec: sec,
                //                 nanosec: nanosec
                //             },
                //             frame_id: 'phntm'
                //         },
                //         twist: msg
                //     }
                // }

                break;
            default:
                console.error('Invalid transmitting_type val: '+transmitting_type)
                return;
        }

        let debug = {
            buttons: {},
            axis: {}
        }
        for (let i = 0; i < axes.length; i++) {
            debug.axis[i] = axes[i];
        }
        for (let i = 0; i < buttons.length; i++) {
            debug.buttons[i] = buttons[i].pressed;
        }

        $('#gamepad_debug_input').html('<b>Axes raw:</b><br>' + JSON.stringify(debug.axis, null, 2) + '<br><br>' +
                                       '<b>Btns raw:</b><br>' + JSON.stringify(debug.buttons, null, 2));

        if (capturing_gamepad_input) {
            CaptureGamepadInput(buttons, axes);
        } else  if (transmitting) {
            let that = window.gamepadController;
            let topic = null;
            let msg_type = null;
            switch (transmitting_type) {
                case 'Joy':
                    msg_type = that.joy_msg_type;
                    topic = that.joy_topic;
                    break;
                case 'Twist':
                    that.Write(that.twist_topic , that.twist_msg_type, msg);
                    break;
                // case 'TwistStamped':
                //     that.Write(that.twist_topic_stamped , that.twist_stamped_msg_type, msg);
                //     break;
            }
            $('#gamepad_debug_output').html('<b>'+msg_type+' -> '+topic+'</b><br>' + JSON.stringify(msg, null, 2));
            that.Write(topic, msg_type, msg);
        }

        if (gamepad_service_mapping) {
            for (const [service_name, service_mapping] of Object.entries(gamepad_service_mapping)) {
                //let  = gamepad_service_mapping[service_name];
                for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
                    //let  = gamepad_service_mapping[service_name][btn_name];
                    //console.log('btns_cond', btns_cond)
                    let btns_cond = btns_config.btns_cond;
                    let num_pressed = 0;
                    for (let i = 0; i < btns_cond.length; i++) {
                        let b = btns_cond[i];
                        if (buttons[b] && buttons[b].pressed)
                            num_pressed++;
                    }
                    if (btns_cond.length && num_pressed == btns_cond.length) {
                        if (!btns_config['needs_reset']) {

                            let btn_el = $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]');

                            if (btn_el.length) {
                                console.warn('Triggering '+service_name+' btn '+btn_name+' ('+num_pressed+' pressed)', btns_cond);
                                btn_el.click();
                            } else {
                                console.log('Not triggering '+service_name+' btn '+btn_name+'; btn not found (service not discovered yet?)');
                            }
                            gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;

                        }
                    } else if (btns_config['needs_reset']) {
                        gamepad_service_mapping[service_name][btn_name]['needs_reset'] = false;
                    }
                }
                // if (buttons[service.btn_id].pressed) {
                //     ServiceCall(window.gamepadController.id_robot, service_name, service.msg, window.gamepadController.socket);
                // }
            }
        }

        window.setTimeout(window.gamepadController.UpdateLoop, 33.3); //ms, 30Hz updates
    }

    // SampleLatency(decoded) {
    //     let sec = decoded.header.stamp.sec
    //     let nanosec = decoded.header.stamp.nanosec
    //     let msg_ms = (sec * 1000) + (nanosec / 1000000);
    //     let now_ms = Date.now(); //window.performance.now()
    //     let lat = now_ms - msg_ms;
    //     // let sec = Math.floor(now_ms / 1000)
    //     // let nanosec = (now_ms - sec*1000) * 1000000

    //     $('#gamepad_latency').html(lat+' ms')
    //     // console.log('Sampling joy lag: ', )
    // }
}

function CaptureGamepadInput(buttons, axes) {
    if (!capturing_gamepad_input) {
        return;
    }

    let something_pressed = false;
    for (let i = 0; i < buttons.length; i++) {
        if (buttons[i] && buttons[i].pressed) {
            something_pressed = true;
            if (captured_gamepad_input.indexOf(i) === -1) {
                captured_gamepad_input.push(i);
            }
        }
    }
    if (something_pressed) {
        for (let i = 0; i < captured_gamepad_input.length; i++) {
            let btn = captured_gamepad_input[i];
            if (!buttons[btn] || !buttons[btn].pressed) {
                captured_gamepad_input.splice(i, 1);
                i--;
            }
        }
    }

    $('#current-key').html(captured_gamepad_input.join(' + '));
}

$(document).ready(function() {

    $('#gamepad_status').click(() => {

        if ($('#gamepad').hasClass('debug_on')) {
            $('#gamepad').removeClass('debug_on');
        } else {
            $('#gamepad').addClass('debug_on');
        }
    });

    LoadGamepadServiceMapping(id_robot);
});

function MarkMappedServiceButtons() {
    if (!gamepad_service_mapping)
        return;

    $('.service_button').removeClass('mapped');
    $('.service_button').attr('title');
    for (const [service_name, service_mapping] of Object.entries(gamepad_service_mapping)) {
        for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
            console.log('MARKING MAPPED: ', service_name, btn_name, $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]'))
            let btns_print = [];
            for (let i = 0; i < btns_config.btns_cond.length; i++) {
                let b = btns_config.btns_cond[i];
                btns_print.push('['+b+']');
            }
            $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]')
                .addClass('mapped')
                .attr('title', 'Mapped to gamepad button(s): '+btns_print.join(' + '));
        }
    }
}

function SaveGamepadServiceMapping(id_robot) {

    MarkMappedServiceButtons();

    if (typeof(Storage) === "undefined") {
        console.warn('No Web Storage support, cannot save gamepad mapping');
        return;
    }

    let data = [];
    for (const [service_name, service_mapping] of Object.entries(gamepad_service_mapping)) {
        for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
            let service_data = {
                service_name: service_name,
                btn_name: btn_name,
                btns_cond: btns_config.btns_cond
            }
            data.push(service_data);
        }
    }
    let val = JSON.stringify(data);
    localStorage.setItem('gamepad_service_mapping:'+id_robot, val);
    console.log('Saved Gamepad Service Mapping for robot '+id_robot+':', val);
}

function LoadGamepadServiceMapping(id_robot) {
    if (typeof(Storage) === "undefined") {
        console.warn('No Web Storage support, cannot load gamepad mapping');
        return;
    }

    console.log('Loading Gamepad Service Mapping for robot '+id_robot+'...');

    gamepad_service_mapping = {};
    let json = localStorage.getItem('gamepad_service_mapping:'+id_robot);
    if (!json)
        return;
    let val = JSON.parse(json);

    for (let i = 0; i < val.length; i++) {
        let service_data = val[i];
        if (!gamepad_service_mapping[service_data.service_name])
            gamepad_service_mapping[service_data.service_name] = {};
        gamepad_service_mapping[service_data.service_name][service_data.btn_name] = {
            btns_cond: service_data.btns_cond,
            needs_reset: false
        };
    }
    console.log('Loaded Gamepad Service Mapping:', val, gamepad_service_mapping);
}

function MapServiceButton(button, id_robot) {

    let service_name = $(button).attr('data-service');
    let btn_name = $(button).attr('data-name');
    console.warn('Mapping '+service_name+' => ' + btn_name +' ...');

    $('#mapping-confirmation').attr('title', 'Mapping '+service_name+':'+btn_name);
    $('#mapping-confirmation').html('Press a gamepad button or combination...<br><br><span id="current-key"></span>');
    captured_gamepad_input = [];
    capturing_gamepad_input = true;
    $( "#mapping-confirmation" ).dialog({
        resizable: false,
        height: "auto",
        width: 400,
        modal: true,
        buttons: {
          Clear: function() {
            captured_gamepad_input = [];
            $('#current-key').html('');
            //$( this ).dialog( "close" );
          },
          Cancel: function() {
            capturing_gamepad_input = false;
            $( this ).dialog( "close" );
          },
          Save: function() {
            capturing_gamepad_input = false;
            if (!gamepad_service_mapping[service_name])
                gamepad_service_mapping[service_name] = {};
            if (!gamepad_service_mapping[service_name][btn_name])
                gamepad_service_mapping[service_name][btn_name] = { };

            if (captured_gamepad_input.length > 0) {
                gamepad_service_mapping[service_name][btn_name]['btns_cond'] = captured_gamepad_input;
                captured_gamepad_input = [];
                gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;
            } else {
                delete gamepad_service_mapping[service_name][btn_name];
                if (Object.keys(gamepad_service_mapping[service_name]).length == 0)
                    delete gamepad_service_mapping[service_name];
            }


            //console.log('Mapping saved: ', gamepad_service_mapping);
            $( this ).dialog( "close" );
            $('#service_controls.setting_shortcuts').removeClass('setting_shortcuts');
            $('#services_gamepad_mapping_toggle').html('[shortcuts]');

            SaveGamepadServiceMapping(id_robot);
          }
        }
    });
}