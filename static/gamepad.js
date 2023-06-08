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
        // this.dc = pc.createDataChannel(topic, {
        //     negotiated: false,
        //     //id:id
        // }); //wouldn't otherwise open chanels

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
                    }); //wouldn't otherwise open chanels


                    this.dc.addEventListener('open', (ev)=> {
                        console.warn('DC '+topic+'/W opened', this.dc)
                    });
                    this.dc.addEventListener('close', (ev)=> {
                        console.warn('DC '+topic+'/W closed')
                        this.dc = null;
                    });
                    this.dc.addEventListener('message', (ev)=> {
                        console.warn('DC '+topic+'/W message!!', ev)
                        // let panel = panels[topic];
                        // if (!panel)
                        //     return;

                        // if (!$('#update_panel_'+panel.n).is(':checked'))
                        //     return;

                        // panel.OnData(ev);
                    });
                    this.dc.addEventListener('error', (ev)=> {
                        console.error('DC '+topic+'/W error', ev)
                        dc = null;
                    });

                }
            } else {
                console.error('Write subscription err: ', res);
            }
        });
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
        for (let id_axis in gamepad_mapping.axes) {
            let sign = 1.0;
            if (gamepad_mapping.axes[id_axis].length > 2)
                sign = gamepad_mapping.axes[id_axis][2];

            let a = axes[gamepad_mapping.axes[id_axis][0]];
            msg.axes[gamepad_mapping.axes[id_axis][1]] = a * sign;
        }
        let dead_man_switch = false;
        for (let id_btn in gamepad_mapping.buttons) {
            let pressed = buttons[gamepad_mapping.buttons[id_btn][0]].pressed;
            msg.buttons[gamepad_mapping.buttons[id_btn][1]] = pressed;
            if (id_btn == 'dead_man_switch') {
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
            + '<br>' + JSON.stringify(debug, null, 2)
        );
        if (transmitting)
            window.gamepadWriter.Write(msg);

        requestAnimationFrame(window.gamepadWriter.UpdateLoop);
    }
}

const gamepad_mapping = {
    buttons: {
        'dead_man_switch': [ 8, 5 ], //browser => joy
        'fast_mode': [ 4, 3 ],
        'slow_mode': [ 1, 1 ],
    },
    axes: {
        'angular_z_axis': [ 0, 0, -1.0 ], //speed => fw back
        'linear_x_axis': [ 1, 1, -1.0 ], //turn l/r
        'linear_y_axis': [ 2, 4 ] //strafe
    }
}

