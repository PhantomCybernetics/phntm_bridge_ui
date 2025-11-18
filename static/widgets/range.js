import { lerpColor } from "../inc/lib.js";
import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// Range visualization

export class RangeWidget extends SingleTypePanelWidgetBase {
	static DEFAULT_WIDTH = 1;
	static DEFAULT_HEIGHT = 5;
	static HANDLED_MSG_TYPES = [ 'sensor_msgs/msg/Range' ];

	constructor(panel, topic) {
		super(panel, topic, 'range');

		this.max_range = 0.0;
		this.val = 0.0;

		this.label_el = $('<div class="label"></div>');
		this.widget_el.append(this.label_el);
	}

	onData(msg) {
		let range = msg.range ? msg.range : msg.max_range;

		this.max_range = msg.max_range;

		//display gage pos
		this.val = range;

		let gage_val = 100.0 - (Math.min(Math.max(range, 0), msg.max_range) * 100.0) / msg.max_range;
		gage_val = gage_val / 100.0;
		let color = "";
		if (gage_val < 0.5) color = lerpColor("#ffffff", "#2696FB", gage_val * 2.0);
		else color = lerpColor("#2696FB", "#ff0000", (gage_val - 0.5) * 2.0);

		if (this.val > msg.max_range - 0.001)
			this.label_el.html("> " + this.max_range.toFixed(1) + " m");
		else this.label_el.html(this.val.toFixed(3) + " m"); //<br><span style=\"font-size:10px;\">("+gageVal.toFixed(1)+")</span>");

		this.widget_el.css("background-color", color);
		this.label_el.css("color", gage_val < 0.2 ? "black" : "white");
	}
}
