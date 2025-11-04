import { InputDriver } from "./base-driver.js";

export class JoyInputDriver extends InputDriver {
	msg_type = "sensor_msgs/msg/Joy";
	id_driver = "Joy";
	
	num_axes = 10;
	num_buttons = 10;

	getAxes() {
		// makes 10 axes
		let axes = {};
		for (let i = 0; i < this.num_axes; i++) {
			axes[`axis.${i}`] = "Joy: Axis " + i;
		}
		return axes;
	}

	getButtons() {
		// makes 10 axes
		let buttons = {};
		for (let i = 0; i < this.num_buttons; i++) {
			buttons[`btn.${i}`] = "Joy: Button " + i;
		}
		return buttons;
	}

	generate() {
		// sensor_msgs/msg/Joy
		let msg = {
			header: this.getHeader(),
			axes: [],
			buttons: [],
		};

		for (let i = 0; i < this.num_axes; i++) {
			let id_axis = `axis.${i}`;
			if (!this.axes_output[id_axis]) msg.axes[i] = null;
			else msg.axes[i] = this.axes_output[id_axis];
		}

		for (let i = 0; i < this.num_buttons; i++) {
			let id_btn = `btn.${i}`;
			if (this.buttons_output[id_btn] === undefined) msg.buttons[i] = null;
			else msg.buttons[i] = this.buttons_output[id_btn];
		}

		this.output = msg;
		return this.output;
	}
}
