import { InputDriver } from './base-driver.js'

export class TwistInputDriver extends InputDriver {

    msg_type = 'geometry_msgs/msg/Twist';

    static axes = {
        'linear.x': 'Linear X',
        'linear.y': 'Linear Y',
        'linear.z': 'Linear Z',
        'angular.x': 'Angular X',
        'angular.y': 'Angular Y',
        'angular.z': 'Angular Z',
    }

    get_axes() {
        return TwistInputDriver.axes;
    }

    set_config(cfg) {
        super.set_config(cfg);

        if (cfg.stamped) {
            this.msg_type = 'geometry_msgs/msg/TwistStamped';
        } else {
            this.msg_type = 'geometry_msgs/msg/Twist';
        }
    }

    make_cofig_inputs() {
        let lines = []

        // one output topic by default
        let line_msg_type = $('<div class="line"><span class="label">Type:</span></div>');
        let opts = [];
        [ 'geometry_msgs/msg/Twist', 'geometry_msgs/msg/TwistStamped' ].forEach((one_type)=>{
            opts.push('<option value="'+one_type+'"'+(this.msg_type==one_type?' selected':'')+'>'+one_type+'</option>',)
        });
        let inp_msg_type = $('<select>'+opts.join()+'</select>');
        
        inp_msg_type.appendTo(line_msg_type);
        
        let that = this;
        inp_msg_type.change((ev)=>{
            that.msg_type = $(ev.target).val();
            console.log('Driver msg type is: '+that.msg_type);
            that.gamepad_controller.make_profile_config_ui(); // redraw
        });

        lines.push(line_msg_type);

        // one output topic 
        let line_topic = $('<div class="line"><span class="label">Output topic:</span></div>');
        let inp_topic = $('<input type="text" inputmode="url" autocomplete="off" value="' + this.output_topic + '"/>');
        inp_topic.appendTo(line_topic);
        inp_topic.change((ev)=>{
            that.output_topic = $(ev.target).val();
            console.log('Driver output topic is: '+that.output_topic);
        });

        lines.push(line_topic);

        return lines;
    }

    generate() {
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
            Object.keys(msg[grp]).forEach((axis) => {
                let id_axis = grp+'.'+axis;
                if (!this.axes_output[id_axis])
                    return;
                msg[grp][axis] = this.axes_output[id_axis];
            });
        });

        if (this.msg_type == 'geometry_msgs/msg/TwistStamped') {
            msg = {
                header: this.get_header(),
                twist: msg
            }
        }
        
        this.output = msg;
        return this.output;
    }

    display_output(el, transmitting) {
        el.html('Message: <b>'+this.msg_type+'</b><br>'
                + 'Topic: <b>'+this.output_topic+'</b>'+ (transmitting ? '' : ' (not transmitting)')  +'<br><br>'
                + JSON.stringify(this.output, null, 4));
    }

    // read_axis(axes, cfg) {
    //     let offset = cfg.offset === undefined ? 0.0 : cfg.offset;
    //     // let scale = cfg.scale === undefined ? 1.0 : cfg.scale;

    //     if (cfg.axis !== undefined) {
    //         let val = this.apply_axis_deadzone(axes[cfg.axis], cfg);
    //         val += offset;
    //         // val *= scale;
    //         return val;
    //     } else if (cfg.axis_positive !== undefined && cfg.axis_negative !== undefined) {
    //         let val = 0.0;
    //         let val_positive = this.apply_axis_deadzone(axes[cfg.axis_positive], cfg)
    //         if (val_positive > -1) {
    //             val += (val_positive + offset);// * scale;
    //         }
    //         let val_negative = this.apply_axis_deadzone(axes[cfg.axis_negative], cfg)
    //         if (val_negative > -1) {
    //             val -= (val_negative + offset);// * scale; // (-.5,0)
    //         }
    //         return val;
    //     }
    // }

    // read_keyboard_axis(pressed_keys, cfg) {
    //     // let offset = cfg.offset === undefined ? 0.0 : cfg.offset;
    //     let scale = cfg.scale === undefined ? 1.0 : cfg.scale;

    //     ['shift', 'alt', 'ctrl', 'meta' ].forEach((mod)=>{
    //         if (cfg['_'+mod]) {
    //             let base = mod.charAt(0).toUpperCase() + mod.slice(1);
    //             let mod_keys = [ base+'Left', base+'Right' ];
    //             let mod_on = false;
    //             for (let i = 0; i < mod_keys.length; i++) {
    //                 if (pressed_keys[mod_keys[i]]) {
    //                     mod_on = true;
    //                     break;
    //                 }
    //             }

    //             if (mod_on) {
    //                 if (cfg['_'+mod].scale) {
    //                     scale = cfg['_'+mod].scale;
    //                 }
    //             }
    //         }
    //     });

    //     let val = 0;
    //     if (pressed_keys[cfg.key_0])
    //         val -= scale;
    //     if (pressed_keys[cfg.key_1])
    //         val += scale;
    //     return val;
    // }

    // lerp_abs(cfg, msg) {
    //     let by = cfg['abs_value'].split('.');
    //     let abs_val = Math.abs(msg[by[0]][[by[1]]]);

    //     let min = cfg['min'] === undefined ? 0.0 : cfg.min;
    //     let max = cfg['max'] === undefined ? 1.0 : cfg.max;

    //     return lerp(min, max, abs_val);
    // }

    // set_output(val, msg, output) {
    //     let o = output.split('.');
    //     if (msg[o[0]]) {
    //         msg[o[0]][o[1]] = val;
    //     }
    // }


    // read_keyboard(pressed_keys) {
    //     // geometry_msgs/msg/Twist
    //     let msg = {
    //         "linear": {
    //             "x": 0,
    //             "y": 0,
    //             "z": 0
    //         },
    //         "angular": {
    //             "x": 0,
    //             "y": 0,
    //             "z": 0,
    //         }
    //     }

    //     Object.keys(msg).forEach ((grp) => {
    //         if (!this.config[grp])
    //             return;
    //         Object.keys(msg[grp]).forEach((axis) => {
    //             if (!this.config[grp][axis])
    //                 return;
    //             msg[grp][axis] = this.read_keyboard_axis(pressed_keys, this.config[grp][axis]);
    //         });
    //     });

    //     Object.keys(msg).forEach ((grp) => {
    //         if (!this.config[grp])
    //             return;
    //         Object.keys(msg[grp]).forEach((axis) => {
    //             if (!this.config[grp][axis] || !this.config[grp][axis]['multiply_lerp'])
    //                 return;
    //             msg[grp][axis] = msg[grp][axis] * this.lerp_abs(this.config[grp][axis]['multiply_lerp'], msg);
    //         });
    //     });

    //     if (this.msg_type == 'geometry_msgs/msg/TwistStamped') {
    //         msg = {
    //             header: this.get_header(),
    //             twist: msg
    //         }
    //     }

    //     return msg;
    // }
}