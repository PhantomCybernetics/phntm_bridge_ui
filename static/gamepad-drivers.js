import { lerp } from "./lib.js";

class Driver {

    constructor(id, msg_type, label) {
        this.id = id;
        this.msg_type = msg_type;
        this.label = label;
        this.config = null;
    }

    get_header() {
        let now_ms = Date.now(); //window.performance.now()
        let sec = Math.floor(now_ms / 1000);
        let nanosec = (now_ms - sec*1000) * 1000000;
        return {
            stamp: {
                sec: sec,
                nanosec: nanosec
            },
            frame_id: 'gamepad'
        }
    }

    apply_axis_deadzone(val, cfg) {

        if (!cfg || cfg['dead_min'] === undefined || cfg['dead_max'] === undefined)
            return val;

        let dead_val = cfg['dead_value'] ? cfg['dead_value'] : 0.0;
        if (val > cfg['dead_min'] && val < cfg['dead_max'])
            return dead_val;

        return val;
    }
}

export class JoyDriver extends Driver {

    static default_config = {
        topic : '/joy',
        axes: {
            0: {
                axis: 0,
                scale: 0.5
            },
            1: {
                axis: 1,
                scale: 1
            },
            2: {
                axis: 2,
                scale: 1
            }
        },
        buttons: {
            0: 0,
            1: 1,
            2: 2,
            3: 3,
            4: 4,
            5: 5,
            6: 6,
            7: 7,
            8: 8,
            9: 9,
        }
    }

    static default_keyboard_config = {
        topic : '/joy',
        axes: {
            0: { //side step
                key_0: 'KeyS',
                key_1: 'KeyF',
                scale: 0.5,
            },
            1: { //fw back
                key_0: 'KeyE',
                key_1: 'KeyD',
                scale: 1.0,
            },
            2: { //turn
                key_0: 'ArrowLeft',
                key_1: 'ArrowRight',
                scale: 1.0,
            }
        },
        buttons: {
            7: 'ShiftRight', // slow
            8: 'Any', // dead man switch trigerred with any key
            9: 'ShiftLeft'
        }
    }

    constructor(id, msg_type, label) {
        super(id, msg_type, label);
        this.default_config = JoyDriver.default_config;
        this.default_keyboard_config = JoyDriver.default_keyboard_config;
    }

    read(axes, buttons) {

        // sensor_msgs/msg/Joy
        let msg = {
            header: this.get_header(),
            axes: [],
            buttons: []
        }

        if (this.config.axes) { //remapping
            Object.keys(this.config.axes).forEach((axis) => {
                if (this.config.axes[axis].axis != undefined) {
                    msg.axes[axis] = axes[this.config.axes[axis].axis];

                    if (this.config.axes[axis].scale != undefined) {
                        msg.axes[axis] *= this.config.axes[axis].scale;
                    }
                }

            });
        } else { //as is
            for (let id_axis = 0; id_axis < axes.length; id_axis++) {
                // let val = this.apply_axis_deadzone(, this.cfg)
                msg.axes[id_axis] = axes[id_axis];
            }
        }

        if (this.config.buttons) { //remapping
            Object.keys(this.config.buttons).forEach((btn) => {
                if (this.config.buttons[btn] === true) {
                    msg.buttons[btn] = true;
                } else {
                    msg.buttons[btn] = buttons[this.config.buttons[btn]].pressed;
                }
            });
        } else { //as is
            for (let id_btn = 0; id_btn < buttons.length; id_btn++) {
                msg.buttons[id_btn] = buttons[id_btn].pressed;
            }
        }

        return msg;
    }

    read_keyboard(pressed_keys) {
        let msg = {
            header: this.get_header(),
            axes: [],
            buttons: []
        }

        Object.keys(this.config.axes).forEach((a) => {
            let val = 0;
            let scale = this.config.axes[a].scale !== undefined ? this.config.axes[a].scale : 1.0;
            let cfg = this.config.axes[a];
            if (pressed_keys[cfg.key_0])
                val -= scale;
            if (pressed_keys[cfg.key_1])
                val += scale;
            msg.axes[a] = val;
        });

        Object.keys(this.config.buttons).forEach((b) => {
            let cfg = this.config.buttons[b];
            if (cfg === true) {
                msg.buttons[b] = true;
            }
            else if (typeof cfg == 'string') {
                if (cfg.toLowerCase() == 'any') {
                    msg.buttons[b] = Object.keys(pressed_keys).length > 0;
                }
                else if (pressed_keys[cfg]) {
                    msg.buttons[b] = true;
                } else {
                    msg.buttons[b] = false;
                }
            }
            else if (cfg.key && cfg.key.toLowerCase() == 'any') {
                msg.buttons[b] = Object.keys(pressed_keys).length > 0;
            } else {
                if (pressed_keys[cfg.key]) {
                    msg.buttons[b] = true;
                    //console.log(cfg.key, msg.buttons[b], pressed_keys[cfg.key])
                } else {
                    msg.buttons[b] = false;
                }
            }
        });

        return msg;
    }
}

export class TwistMecanumDriver extends Driver {

    static default_config = {
        topic : '/cmd_vel',

        linear: {
            x: { // fw/back
                axis: 1,
                dead_min: -0.02,
                dead_max: 0.02,
                scale: 1
            },
            y: { // left/right strife
                axis_positive: 3,
                axis_negative: 4,
                offset: 1,
                scale: .25,
                dead_min: -10.0,
                dead_max: -0.98,
                dead_value: -10.0,
            }
        },
        angular: {
            z: { // left/right
                axis: 2,
                dead_min: -0.02,
                dead_max: 0.02,
                scale: -1.0,
                multiply_lerp: {
                    abs_value: 'linear.x',
                    min: 3.0, // fast turns on the spot
                    max: 0.7, // slower when going fast
                }
            }
        }
    }

    static default_keyboard_config = {
        topic : '/cmd_vel',
        linear: {
            x: { // fw/back
                key_0: 'KeyE',
                key_1: 'KeyD',
                scale: 1
            },
            y: { // //side step
                key_0: 'KeyS',
                key_1: 'KeyF',
                scale: .5
            }
        },
        angular: {
            z: { // left/right
                key_0: 'ArrowLeft',
                key_1: 'ArrowRight',
                scale: -1.0,
                multiply_lerp: {
                    abs_value: 'linear.x',
                    min: 3.0, // fast turns on the spot
                    max: 0.7, // slower when going fast
                }
            }
        }
    }

    constructor(id, msg_type, label) {
        super(id, msg_type, label);
        this.default_config = TwistMecanumDriver.default_config;
        this.default_keyboard_config = TwistMecanumDriver.default_keyboard_config;
    }

    read_axis(axes, cfg) {
        let offset = cfg.offset === undefined ? 0.0 : cfg.offset;
        let scale = cfg.scale === undefined ? 1.0 : cfg.scale;

        if (cfg.axis !== undefined) {
            let val = this.apply_axis_deadzone(axes[cfg.axis], cfg);
            val += offset;
            val *= scale;
            return val;
        } else if (cfg.axis_positive !== undefined && cfg.axis_negative !== undefined) {
            let val = 0.0;
            let val_positive = this.apply_axis_deadzone(axes[cfg.axis_positive], cfg)
            if (val_positive > -1) {
                val += (val_positive + offset) * scale;
            }
            let val_negative = this.apply_axis_deadzone(axes[cfg.axis_negative], cfg)
            if (val_negative > -1) {
                val -= (val_negative + offset) * scale; // (-.5,0)
            }
            return val;
        }
    }

    read_keyboard_axis(pressed_keys, cfg) {
        // let offset = cfg.offset === undefined ? 0.0 : cfg.offset;
        let scale = cfg.scale === undefined ? 1.0 : cfg.scale;

        ['shift', 'alt', 'ctrl', 'meta' ].forEach((mod)=>{
            if (cfg['_'+mod]) {
                let base = mod.charAt(0).toUpperCase() + mod.slice(1);
                let mod_keys = [ base+'Left', base+'Right' ];
                let mod_on = false;
                for (let i = 0; i < mod_keys.length; i++) {
                    if (pressed_keys[mod_keys[i]]) {
                        mod_on = true;
                        break;
                    }
                }

                if (mod_on) {
                    if (cfg['_'+mod].scale) {
                        scale = cfg['_'+mod].scale;
                    }
                }
            }
        });

        let val = 0;
        if (pressed_keys[cfg.key_0])
            val -= scale;
        if (pressed_keys[cfg.key_1])
            val += scale;
        return val;
    }

    lerp_abs(cfg, msg) {
        let by = cfg['abs_value'].split('.');
        let abs_val = Math.abs(msg[by[0]][[by[1]]]);

        let min = cfg['min'] === undefined ? 1.0 : cfg.min;
        let max = cfg['max'] === undefined ? 1.0 : cfg.max;

        return lerp(min, max, abs_val);
    }

    // set_output(val, msg, output) {
    //     let o = output.split('.');
    //     if (msg[o[0]]) {
    //         msg[o[0]][o[1]] = val;
    //     }
    // }

    read(axes, buttons) {

        // geometry_msgs/msg/Twist
        let msg = {
            "linear": {
                "x": 0,
                "y": 0,
                "z": 0
            },
            "angular": {
                "x": 0,
                "y": 0,
                "z": 0,
            }
        }

        Object.keys(msg).forEach ((grp) => {
            if (!this.config[grp])
                return;
            Object.keys(msg[grp]).forEach((axis) => {
                if (!this.config[grp][axis])
                    return;
                msg[grp][axis] = this.read_axis(axes, this.config[grp][axis]);
            });
        });

        Object.keys(msg).forEach ((grp) => {
            if (!this.config[grp])
                return;
            Object.keys(msg[grp]).forEach((axis) => {
                if (!this.config[grp][axis] || !this.config[grp][axis]['multiply_lerp'])
                    return;
                msg[grp][axis] = msg[grp][axis] * this.lerp_abs(this.config[grp][axis]['multiply_lerp'], msg);
            });
        });

        if (this.msg_type == 'geometry_msgs/msg/TwistStamped') {
            msg = {
                header: this.get_header(),
                twist: msg
            }
        }

        return msg;
    }

    read_keyboard(pressed_keys) {
        // geometry_msgs/msg/Twist
        let msg = {
            "linear": {
                "x": 0,
                "y": 0,
                "z": 0
            },
            "angular": {
                "x": 0,
                "y": 0,
                "z": 0,
            }
        }

        Object.keys(msg).forEach ((grp) => {
            if (!this.config[grp])
                return;
            Object.keys(msg[grp]).forEach((axis) => {
                if (!this.config[grp][axis])
                    return;
                msg[grp][axis] = this.read_keyboard_axis(pressed_keys, this.config[grp][axis]);
            });
        });

        Object.keys(msg).forEach ((grp) => {
            if (!this.config[grp])
                return;
            Object.keys(msg[grp]).forEach((axis) => {
                if (!this.config[grp][axis] || !this.config[grp][axis]['multiply_lerp'])
                    return;
                msg[grp][axis] = msg[grp][axis] * this.lerp_abs(this.config[grp][axis]['multiply_lerp'], msg);
            });
        });

        if (this.msg_type == 'geometry_msgs/msg/TwistStamped') {
            msg = {
                header: this.get_header(),
                twist: msg
            }
        }

        return msg;
    }
}