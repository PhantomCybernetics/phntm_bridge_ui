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
    }

    constructor(id, msg_type, label) {
        super(id, msg_type, label);
        this.default_config = JoyDriver.default_config;
    }

    read(gamepad, axes, buttons) {

        // sensor_msgs/msg/Joy
        let msg = {
            header: this.get_header(),
            axes: [],
            buttons: []
        }

        for (let id_axis = 0; id_axis < axes.length; id_axis++) {
            // let val = this.apply_axis_deadzone(, this.cfg)
            msg.axes[id_axis] = axes[id_axis];
        }

        for (let id_btn = 0; id_btn < buttons.length; id_btn++) {
            msg.buttons[id_btn] = buttons[id_btn].pressed;
        }

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

    constructor(id, msg_type, label) {
        super(id, msg_type, label);
        this.default_config = TwistMecanumDriver.default_config;
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

    lerp_abs(cfg, msg) {
        let by = cfg['abs_value'].split('.');
        let abs_val = Math.abs(msg[by[0]][[by[1]]]);

        let min = cfg['min'] === undefined ? 1.0 : cfg.min;
        let max = cfg['max'] === undefined ? 1.0 : cfg.max;

        return this.lerp(min, max, abs_val);
    }

    // set_output(val, msg, output) {
    //     let o = output.split('.');
    //     if (msg[o[0]]) {
    //         msg[o[0]][o[1]] = val;
    //     }
    // }

    lerp(a, b, alpha) {
        return a + alpha * (b-a)
    }

    read(gamepad, axes, buttons) {

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
}