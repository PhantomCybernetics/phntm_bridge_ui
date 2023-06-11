let idGamepad = null;
window.gamepadWriter = null;

$(document ).ready(function() {

    $('#gamepad_status').click(() => {

        if ($('#gamepad').hasClass('debug_on')) {
            $('#gamepad').removeClass('debug_on');
        } else {
            $('#gamepad').addClass('debug_on');
        }
    });

});

class GamepadWriter {
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
        if (transmitting && window.gamepadWriter.dc && window.gamepadWriter.dc.readyState == 'open')
            window.gamepadWriter.Write(msg);

        requestAnimationFrame(window.gamepadWriter.UpdateLoop);
    }
}

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

