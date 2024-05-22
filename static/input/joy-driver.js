import { InputDriver } from './base-driver.js'

export class JoyInputDriver extends InputDriver {

    msg_type = 'sensor_msgs/msg/Joy';
    num_axes = 10;

    get_axes() {
        // makes 10 axes
        let axes = {};
        for (let i = 0; i < this.num_axes; i++) {
            axes[`${i}`] = 'Axis '+i
        }
        return axes;
    }
    
    generate() {
        // sensor_msgs/msg/Joy
        let msg = {
            header: this.get_header(),
            axes: [],
            buttons: []
        }

        for (let i = 0; i < this.num_axes; i++) {
            let id_axis = `${i}`;
            if (!this.axes_output[id_axis])
                msg.axes[i] = null;
            else
                msg.axes[i] = this.axes_output[id_axis];
        }
        
        this.output = msg;
        return this.output;
    }

    // read(axes, buttons) {



    //     if (this.config.axes) { //remapping
    //         Object.keys(this.config.axes).forEach((axis) => {
    //             if (this.config.axes[axis].axis != undefined) {
    //                 msg.axes[axis] = axes[this.config.axes[axis].axis];

    //                 if (this.config.axes[axis].scale != undefined) {
    //                     msg.axes[axis] *= this.config.axes[axis].scale;
    //                 }
    //             }

    //         });
    //     } else { //as is
    //         for (let id_axis = 0; id_axis < axes.length; id_axis++) {
    //             // let val = this.apply_axis_deadzone(, this.cfg)
    //             msg.axes[id_axis] = axes[id_axis];
    //         }
    //     }

    //     if (this.config.buttons) { //remapping
    //         Object.keys(this.config.buttons).forEach((btn) => {
    //             if (this.config.buttons[btn] === true) {
    //                 msg.buttons[btn] = true;
    //             } else {
    //                 msg.buttons[btn] = buttons[this.config.buttons[btn]].pressed;
    //             }
    //         });
    //     } else { //as is
    //         for (let id_btn = 0; id_btn < buttons.length; id_btn++) {
    //             msg.buttons[id_btn] = buttons[id_btn].pressed;
    //         }
    //     }

    //     return msg;
    // }

    // read_keyboard(pressed_keys) {
    //     let msg = {
    //         header: this.get_header(),
    //         axes: [],
    //         buttons: []
    //     }

    //     Object.keys(this.config.axes).forEach((a) => {
    //         let val = 0;
    //         let scale = this.config.axes[a].scale !== undefined ? this.config.axes[a].scale : 1.0;
    //         let cfg = this.config.axes[a];
    //         if (pressed_keys[cfg.key_0])
    //             val -= scale;
    //         if (pressed_keys[cfg.key_1])
    //             val += scale;
    //         msg.axes[a] = val;
    //     });

    //     Object.keys(this.config.buttons).forEach((b) => {
    //         let cfg = this.config.buttons[b];
    //         if (cfg === true) {
    //             msg.buttons[b] = true;
    //         }
    //         else if (typeof cfg == 'string') {
    //             if (cfg.toLowerCase() == 'any') {
    //                 msg.buttons[b] = Object.keys(pressed_keys).length > 0;
    //             }
    //             else if (pressed_keys[cfg]) {
    //                 msg.buttons[b] = true;
    //             } else {
    //                 msg.buttons[b] = false;
    //             }
    //         }
    //         else if (cfg.key && cfg.key.toLowerCase() == 'any') {
    //             msg.buttons[b] = Object.keys(pressed_keys).length > 0;
    //         } else {
    //             if (pressed_keys[cfg.key]) {
    //                 msg.buttons[b] = true;
    //                 //console.log(cfg.key, msg.buttons[b], pressed_keys[cfg.key])
    //             } else {
    //                 msg.buttons[b] = false;
    //             }
    //         }
    //     });

    //     return msg;
    // }
}