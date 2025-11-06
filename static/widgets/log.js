import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// Log console for /rosout, etc

export class LogWidget extends SingleTypePanelWidgetBase {
	static default_width = 10;
	static default_height = 8;
	static handled_msg_types = [ 'rcl_interfaces/msg/Log' ];

	constructor(panel, topic) {
		super(panel, topic, 'log');

		this.max_trace_length = 100;
		this.animation = null;

		this.widget_el.addClass("autoscroll");

		let that = this;
		this.widget_el.mouseenter(function () {
			that.widget_el.removeClass("autoscroll");
			if (that.animation != null) {
				that.widget_el.stop();
				that.animation = null;
			}
		});
		this.widget_el.mouseleave(function () {
			that.widget_el.addClass("autoscroll");
		});
	}

	onData (msg) {
		let line = '<div class="log_line">[<span class="name">' + msg.name + "</span>] " +
				   		'<span class="time">' + msg.stamp.sec + "." + msg.stamp.nanosec + "</span>: " +
						msg.msg +
					"</div>";
		this.widget_el.append(line);

		// trim lines
		if ($("#panel_widget_" + this.panel.n + ".autoscroll .log_line").length > this.max_trace_length) {
			$("#panel_widget_" + this.panel.n + ".autoscroll .log_line")
				.first()
				.remove();
		}

		if (this.animation != null) {
			//console.log('cancel animation ', panel.animation)
			this.widget_el.stop();
			this.animation = null;
		}

		let that = this;
		this.animation = $("#panel_widget_" + this.panel.n + ".autoscroll").animate({
			scrollTop: that.widget_el.prop("scrollHeight"),
		}, 300, "linear", () => {
			that.animation = null;
		});
	};
}
