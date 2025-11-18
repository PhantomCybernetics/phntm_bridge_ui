import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// Log console for /rosout, etc

export class LogWidget extends SingleTypePanelWidgetBase {
	static DEFAULT_WIDTH = 10;
	static DEFAULT_HEIGHT = 8;
	static HANDLED_MSG_TYPES = [ 'rcl_interfaces/msg/Log' ];

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


	setupMenu(menu_els) {
		let that = this;

		// clear
		let clear_line_el = $('<div class="menu_line"></div>');
		let clear_btn = $('<a href="#" id="clear_panel_link_' + this.panel.n + '">Clear</a>');
		clear_btn.appendTo(clear_line_el);
		clear_btn.click((ev) => {
			ev.preventDefault(); //stop from moving the panel
			that.clear();
		});
		menu_els.push(clear_line_el);
	}


	clear() {
		if (this.animation != null) {
			//console.log('cancel animation ', panel.animation)
			this.widget_el.stop();
			this.animation = null;
		}
		this.widget_el.empty();
	}

	formatDuration(sec, nsec) {
		let total_ms = sec * 1000 + Math.floor(nsec / 1000000);

		let hours = Math.floor(total_ms / 3600000);
		let minutes = Math.floor((total_ms % 3600000) / 60000);
		let seconds = Math.floor((total_ms % 60000) / 1000);
		let milliseconds = total_ms % 1000;

		hours = hours % 24;

		let hh = String(hours).padStart(2, '0');
		let mm = String(minutes).padStart(2, '0');
		let ss = String(seconds).padStart(2, '0');
		let ms = String(milliseconds).padStart(3, '0');

		return `${hh}:${mm}:${ss}:${ms}`;
	}

	onData (msg) {

		let level_class = "";
		let level_label = msg.level;
		switch (msg.level) {
			case 10: level_class = 'debug'; level_label = 'DBG'; break;
			case 20: level_class = 'info'; level_label = 'INF'; break;
			case 40: level_class = 'error'; level_label = 'ERR'; break;
		}
		let line = '<div class="log_line">' +
				   '<span class="time">' + this.formatDuration(msg.stamp.sec, msg.stamp.nanosec) + "</span> " +
				   '<span class="name">[' + msg.name + "]</span> " +
				   '<span class="'+level_class+'">['+level_label+'] ' + msg.msg + '</span>'
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
