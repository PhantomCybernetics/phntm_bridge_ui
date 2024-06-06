import { InputDriver } from './base-driver.js'

export class JoyInputDriver extends InputDriver {

    msg_type = 'sensor_msgs/msg/Joy';
    num_axes = 10;
    num_buttons = 10;

    get_axes() {
        // makes 10 axes
        let axes = {};
        for (let i = 0; i < this.num_axes; i++) {
            axes[`${i}`] = 'Joy: Axis '+i
        }
        return axes;
    }

    get_buttons() {
        // makes 10 axes
        let buttons = {};
        for (let i = 0; i < this.num_buttons; i++) {
            buttons[`${i}`] = 'Joy: Button '+i
        }
        return buttons;
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

        for (let i = 0; i < this.num_buttons; i++) {
            let id_btn = `${i}`;
            if (this.buttons_output[id_btn] === undefined)
                msg.buttons[i] = null;
            else
                msg.buttons[i] = this.buttons_output[id_btn];
        }
        
        this.output = msg;
        return this.output;
    }
}