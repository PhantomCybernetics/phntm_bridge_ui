let idGamepad = null;
window.gamepadWriter = null;

$(document ).ready(function() {

    $('#gamepad_status').click(() => {
        console.log('click');
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

    constructor(pc, topic, dc, supported_msg_types) {
        this.joy_msg_type = FindMessageType('sensor_msgs/msg/Joy', supported_msg_types);
        console.log('Gamnepad msg type', this.joy_msg_type);

        let Writer = window.Serialization.MessageWriter;
        this.msg_writer = new Writer( [ this.joy_msg_type ].concat(supported_msg_types) );

        this.dc = dc;
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
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            if (idGamepad == event.gamepad.index) {
                idGamepad = null;
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad').removeClass('connected');
            }
        });
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
            let a = axes[gamepad_mapping.axes[id_axis][0]];
            msg.axes[gamepad_mapping.axes[id_axis][1]] = a;
        }
        let dead_man_switch = false;
        for (let id_btn in gamepad_mapping.buttons) {
            let pressed = buttons[gamepad_mapping.buttons[id_btn][0]].pressed;
            msg.buttons[gamepad_mapping.buttons[id_btn][1]] = pressed;
            if (id_btn == 'dead_man_switch') {
                dead_man_switch = pressed;
            }
        }

        if (dead_man_switch)
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

        window.gamepadWriter.Write(msg);

        requestAnimationFrame(window.gamepadWriter.UpdateLoop);
    }

    Write(msg) {

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
}

const gamepad_mapping = {
    buttons: {
        'dead_man_switch': [ 8, 5 ], //browser => joy
        'fast_mode': [ 4, 3 ],
        'slow_mode': [ 1, 1 ],
    },
    axes: {
        'angular_z_axis': [ 1, 0 ], //speed => fw back
        'linear_x_axis': [ 0, 1 ], //turn l/r
        'linear_y_axis': [ 2, 4 ] //strafe
    }
}

