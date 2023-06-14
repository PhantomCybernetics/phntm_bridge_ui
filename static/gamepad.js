let idGamepad = null;
window.gamepadController = null;

let capturing_gamepad_input = false;
let captured_gamepad_input = [];
let gamepad_service_mapping = {}

// browser => joy remapping
const id_dead_man_switch_btn = 8;
const browser2joy_mapping = {
    buttons: {
        8: 5, // dead man switch
        4: 3, // fast_mode
        1: 1  // slow_mode
    },
    axes: {
        0 : [ 0, -1.0], // angular_z_axiss (peed => fw back)
        1 : [ 1, -1.0], // linear_x_axis (turn l/r)
        2 : [ 4 ] // linear_y_axis (strafe)
    }
}

$(document ).ready(function() {

    $('#gamepad_status').click(() => {

        if ($('#gamepad').hasClass('debug_on')) {
            $('#gamepad').removeClass('debug_on');
        } else {
            $('#gamepad').addClass('debug_on');
        }
    });

    LoadGamepadServiceMapping(id_robot);
});

function SaveGamepadServiceMapping(id_robot) {
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
        gamepad_service_mapping[service_data.service_name] = {};
        gamepad_service_mapping[service_data.service_name][service_data.btn_name] = {
            btns_cond: service_data.btns_cond,
            needs_reset: false
        };
    }
    console.log('Loaded Gamepad Service Mapping:', val, gamepad_service_mapping);
}

class GamepadController {
    joy_msg_type = null;
    msg_writer = null;
    dc = null;
    socket = null;
    topic = null;
    id_robot = null;

    constructor(pc, topic, id_robot, socket, supported_msg_types) {

        this.joy_msg_type = FindMessageType('sensor_msgs/msg/Joy', supported_msg_types);
        this.socket = socket;
        this.topic = topic;
        this.id_robot = id_robot;

        console.log('Gamnepad msg type', this.joy_msg_type);

        let Writer = window.Serialization.MessageWriter;
        this.msg_writer = new Writer( [ this.joy_msg_type ].concat(supported_msg_types) );

        this.dc = null;

        let that = this;
        window.addEventListener('gamepadconnected', (event) => {
            console.warn('Gamepad connected:', event.gamepad);
            idGamepad = event.gamepad.index;

            $('#gamepad').addClass('connected');

            that.UpdateLoop();

            if (pc && pc.connectionState == 'connected')
                that.InitProducer();
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            if (idGamepad == event.gamepad.index) {
                idGamepad = null; //kills the loop
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad').removeClass('connected');

            }
        });
    }

    InitProducer () {

        if (this.dc)
            return;

        let subscription_data = {
            id_robot: this.id_robot,
            topics: [ [ this.topic, 1, 'sensor_msgs/msg/Joy' ] ]
        };
        this.socket.emit('subcribe:write', subscription_data, (res) => {

            if (res['success']) {
                for (let i = 0; i < res['subscribed'].length; i++) {

                    let topic = res['subscribed'][i][0];
                    let id = res['subscribed'][i][1];
                    let protocol = res['subscribed'][i][2];

                    console.log('locall DC '+topic+'/W id='+id+', protocol='+protocol)
                    this.dc = pc.createDataChannel(topic, {
                        negotiated: true,
                        id:id
                    });

                    this.dc.addEventListener('open', (ev)=> {
                        console.info('DC '+topic+'/W opened', this.dc)
                    });
                    this.dc.addEventListener('close', (ev)=> {
                        console.info('DC '+topic+'/W closed')
                        this.dc = null;
                    });
                    this.dc.addEventListener('message', (ev)=> {
                        console.warn('DC '+topic+'/W message!!', ev); //this should not be as we use separate r/w channels
                    });
                    this.dc.addEventListener('error', (ev)=> {
                        console.error('DC '+topic+'/W error', ev)
                        this.dc = null;
                    });

                }
            } else {
                console.warn('Error setting up gamepad publisher: ', res);
            }
        });
    }

    ClearProducer() {
        if (!this.dc)
            return;

        this.dc.close();
        this.dc = null;
    }

    Write (msg) {

        if (!this.dc)
            return;

        if (this.dc.readyState != 'open') {
            console.warn('/joy dc.readyState = '+this.dc.readyState)
            return;
        }

        let payload = this.msg_writer.writeMessage(msg);

        //console.log('writing', payload);

        this.dc.send(payload);
    }

    UpdateLoop () {
        if (idGamepad == null)
            return;

        const gp = navigator.getGamepads()[idGamepad];

        let buttons = gp.buttons;
        let axes = gp.axes;

        let msg = {
            header: {
                stamp: {
                    sec: 0,
                    nanosec: 0
                },
                frame_id: 'phntm'
            },
            axes: [],
            buttons: []
        }
        for (let id_axis = 0; id_axis < axes.length; id_axis++) { //sending all input regardless of mapping
            let scale = 1.0;
            let id_target_axis = id_axis;
            if (browser2joy_mapping.axes[id_axis]){
                id_target_axis = browser2joy_mapping.axes[id_axis][0];
                if (browser2joy_mapping.axes[id_axis].length > 1)
                    scale = browser2joy_mapping.axes[id_axis][1];
            }
            msg.axes[id_target_axis] = axes[id_axis] * scale;
        }
        let dead_man_switch = false;
        for (let id_btn = 0; id_btn < buttons.length; id_btn++) { //sending all input regardless of mapping
            let pressed = buttons[id_btn].pressed;
            let id_target_btn = id_btn;
            if (browser2joy_mapping.buttons[id_btn])
                id_target_btn = browser2joy_mapping.buttons[id_btn];
            msg.buttons[id_target_btn] = pressed;
            if (id_btn == id_dead_man_switch_btn) {
                dead_man_switch = pressed;
            }
        }

        let transmitting = $('#gamepad_enabled').is(':checked');

        if (dead_man_switch && transmitting)
            $('#gamepad_status').addClass('active')
        else
            $('#gamepad_status').removeClass('active')

        let debug = {
            buttons: {},
            axis: {}
        }
        for (let i = 0; i < buttons.length; i++) {
            debug.buttons[i] = buttons[i].pressed;
        }
        for (let i = 0; i < axes.length; i++) {
            debug.axis[i] = axes[i];
        }
        $('#gamepad_debug').html(
            JSON.stringify(msg, null, 2)
            //+ '<br>' + JSON.stringify(debug, null, 2)
        );


        if (capturing_gamepad_input) {
            CaptureGamepadInput(buttons, axes);
        } else {
            if (transmitting && window.gamepadController.dc && window.gamepadController.dc.readyState == 'open')
                window.gamepadController.Write(msg);
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
                            console.warn('service '+service_name+' triggering '+btn_name+' ('+num_pressed+' pressed)', btns_cond);
                            gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;

                            $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]').click();

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

        requestAnimationFrame(window.gamepadController.UpdateLoop);
    }
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

            gamepad_service_mapping[service_name][btn_name]['btns_cond'] = captured_gamepad_input;
            captured_gamepad_input = [];
            gamepad_service_mapping[service_name][btn_name]['needs_reset'] = false;

            //console.log('Mapping saved: ', gamepad_service_mapping);
            $( this ).dialog( "close" );
            $('#service_controls.setting_shortcuts').removeClass('setting_shortcuts');
            $('#services_gamepad_mapping_toggle').html('[shortcuts]');

            SaveGamepadServiceMapping(id_robot);
          }
        }
    });
}