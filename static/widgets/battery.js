import { lerpColor } from "./../inc/lib.js";
import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";
import "/static/canvasjs-charts/canvasjs.min.js";

// Battery visualisation

export class BatteryStateWidget extends SingleTypePanelWidgetBase {
	static default_width = 5;
	static default_height = 8;
	static handled_msg_types = [ 'sensor_msgs/msg/BatteryState' ];

	constructor(panel, topic) {
		super(panel, topic, 'battery');

		this.min_voltage = 0; // override these
		this.max_voltage = 0; // from topic config
	}

	// make chart when we have topic config
	onTopicConfig(config) {
		if (config) {
			this.min_voltage = config.min_voltage;
			this.max_voltage = config.max_voltage;
			this.makeChart();
		}
	};

	makeChart() {
		this.data_trace = [];
		if (this.chart) {
			console.log("clearing old battery chart");
			this.chart.destroy();
			this.widget_el.empty();
		}
		this.chart = new CanvasJS.Chart("panel_widget_" + this.panel.n, {
			//Chart Options - Check https://canvasjs.com/docs/charts/chart-options/
			// title:{
			//   text: "Basic Column Chart in JavaScript"
			// },
			// width: panel.widget_width,
			// height: panel.widget_height,
			toolTip: {
				contentFormatter: function (e) {
					return e.entries[0].dataPoint.y.toFixed(2) + " V";
				},
			},
			axisX: {
				labelFormatter: function (e) {
					return "";
				},
				lineThickness: 0,
				tickThickness: 0,
			},
			axisY: {
				minimum: this.min_voltage - 1.0,
				maximum: this.max_voltage + 1.0,
				// lineColor: "red",
				gridColor: "#dddddd",
				labelFontSize: 12,
				lineThickness: 0,
				labelFormatter: function (e) {
					return e.value.toFixed(1) + " V";
				},
				// tickLength: 2,
				stripLines: [
					{
						value: this.max_voltage,
						color: "#77AE23",
						label: "Full",
						labelFontColor: "white",
						labelBackgroundColor: "#77AE23",
						lineDashType: "dot",
						thickness: 2,
						labelFontSize: 12,
					},
					{
						// startValue: this.minVoltage-1.0,
						value: this.min_voltage,
						color: "#cc0000",
						label: "\ Empty",
						labelFontColor: "white",
						labelBackgroundColor: "#cc0000",
						lineDashType: "solid",
						thickness: 1,
						labelFontSize: 12,
					},
				],
			},
			data: [
				{
					type: "line",
					lineThickness: 3,
					dataPoints: this.data_trace,
				},
			],
		});

		this.chart.render();
	}

	onResize() {
		if (this.chart)
			this.chart.render();
	}

	onData(msg) {
		if (!this.chart) return;

		let c = "#2696FB";
		let range2 = (this.max_voltage - this.min_voltage) / 2.0;

		if (msg.voltage < this.min_voltage) c = "#ff0000";
		else if (msg.voltage > this.max_voltage) c = "#00ff00";
		else if (msg.voltage > this.min_voltage + range2) {
			let amount = (msg.voltage - this.min_voltage - range2) / range2;
			c = lerpColor("#2696FB", "#00ff00", amount);
		} else {
			let amount = (msg.voltage - this.min_voltage) / range2;
			c = lerpColor("#ff0000", "#2696FB", amount);
		}

		this.data_trace.push({
			x: msg.header.stamp.nanosec / 1e9 + msg.header.stamp.sec,
			y: msg.voltage,
			label: msg.voltage.toFixed(2) + "V",
			markerColor: c,
			lineColor: c,
			markerSize: 0,
		});

		if (this.data_trace.length > this.panel.max_trace_length) {
			this.data_trace.shift();
		}

		this.chart.render();
	};
}
