export class LogWidget {
	static default_width = 10;
	static default_height = 2;

	constructor(panel, topic) {
		this.panel = panel;
		this.topic = topic;
		this.max_trace_length = 100;
		this.animation = null;

		$("#panel_widget_" + panel.n).addClass("enabled log");

		$("#panel_widget_" + panel.n).addClass("autoscroll");
		// console.log('AUTOSCROLL START')
		$("#panel_widget_" + panel.n)
			.mouseenter(function () {
				$("#panel_widget_" + panel.n).removeClass("autoscroll");
				// console.log('AUTOSCROLL STOP')
				if (this.animation != null) {
					//console.log('cancel animation ', panel.animation)
					$("#panel_widget_" + panel.n + "").stop();
					this.animation = null;
				}
			})
			.mouseleave(function () {
				$("#panel_widget_" + panel.n).addClass("autoscroll");
				// console.log('AUTOSCROLL START')
			});
	}

	onClose() {}

	onData = (decoded) => {
		let line =
			'<div class="log_line">[<span class="name">' +
			decoded.name +
			"</span>] " +
			'<span class="time">' +
			decoded.stamp.sec +
			"." +
			decoded.stamp.nanosec +
			"</span>: " +
			decoded.msg +
			"</div>";

		$("#panel_widget_" + this.panel.n).append(line);

		if (
			$("#panel_widget_" + this.panel.n + ".autoscroll .log_line").length >
			this.max_trace_length
		) {
			$("#panel_widget_" + this.panel.n + ".autoscroll .log_line")
				.first()
				.remove();
		}

		if (this.animation != null) {
			//console.log('cancel animation ', panel.animation)
			$("#panel_widget_" + this.panel.n + "").stop();
			this.animation = null;
		}

		let that = this;
		this.animation = $("#panel_widget_" + this.panel.n + ".autoscroll").animate(
			{
				scrollTop: $("#panel_widget_" + this.panel.n).prop("scrollHeight"),
			},
			300,
			"linear",
			() => {
				that.animation = null;
			},
		);
	};
}
