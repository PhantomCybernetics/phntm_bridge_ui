import { formatBytes } from "../inc/lib.js";
import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// System load ala htop

export class SystemLoadWidget extends SingleTypePanelWidgetBase {
	static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 7;
	static HANDLED_MSG_TYPES = [ 'phntm_interfaces/msg/SystemInfo' ];

	constructor(panel, topic) {
		super(panel, topic, 'system-load');

		this.initiated = false;
		this.cpu_els = [];
		this.cpu_total_labels = [];
		this.cpu_bars = [];

		this.mem_el = null;
		this.mem_total_label = null;
		this.mem_bars = {};

		this.swp_el = null;
		this.swp_total_label = null;
		this.swp_bars = {};

		this.disk_els = {};
		this.disk_total_labels = {};
		this.disk_bars = {};

		this.last_data = null;
		this.num_lines = 0;
		this.is_thin = null;
		this.is_narrow = null;
		this.is_narrower = null;
	}

	onResize() {
		this.initiated = false; // rebuild onData
		if (this.last_data)
			this.onData(this.last_data);
	}

	onData(msg) {
		let num_lines = Object.keys(msg.cpu).length + 2 // mem + swp
						+ Object.keys(msg.disk).length;

		this.last_data = msg;
		if (!this.initiated || num_lines != this.num_lines) {
			this.num_lines = num_lines;
			this.decideStyle();
			this.makeElements(msg);
		}

		// update
		this.updateValuesAndBars(msg);
	}

	decideStyle() {
		let w = this.panel.widget_width;
		let h = this.panel.widget_height;

		let line_h_px = h / this.num_lines;
		if (line_h_px < 20) {
			if (this.is_thin !== true) {
				this.widget_el.addClass("thin");
				this.is_thin = true;
			}
		} else {
			if (this.is_thin !== false) {
				this.widget_el.removeClass("thin");
				this.is_thin = false;
			}
		}

		if (w < 200) {
			if (this.is_narrow !== true) {
				this.widget_el.addClass("narrow");
				this.is_narrow = true;
			}
		} else {
			if (this.is_narrow !== false) {
				this.widget_el.removeClass("narrow");
				this.is_narrow = false;
			}
		}

		if (w < 125) {
			if (this.is_narrower !== true) {
				this.widget_el.addClass("narrower");
				this.is_narrower = true;
			}
		} else {
			if (this.is_narrower !== false) {
				this.widget_el.removeClass("narrower");
				this.is_narrower = false;
			}
		}
	}

	makeElements(msg) {
		let w = this.panel.widget_width;
		let h = this.panel.widget_height;

		this.widget_el.empty();
		this.cpu_els = [];
		this.cpu_total_labels = [];
		this.cpu_bars = [];

		this.mem_el = null;
		this.mem_total_label = null;
		this.mem_bars = {};

		this.swp_el = null;
		this.swp_total_label = null;
		this.swp_bars = {};

		this.disk_els = {};
		this.disk_total_labels = {};
		this.disk_bars = {};

		let line_h = Math.round(h / this.num_lines) + "px";
		if (this.is_thin) {
			line_h = Math.round((h - 3) / this.num_lines) + "px";
		}

		for (let i = 0; i < msg.cpu.length; i++) {
			let cpu_el = $('<div class="cpu-line" style="height: ' + line_h + '"><span class="cpu-label">' + i + "</span></div>");
			let total_label = $('<span class="total-label"></span>');
			total_label.appendTo(cpu_el);

			let bar_nice = $('<span class="bar cpu-nice" title="Low"></span>');
			let bar_user = $('<span class="bar cpu-user" title="User"></span>');
			let bar_system = $('<span class="bar cpu-system" title="System"></span>');
			// let bar_idle = $('<span class="bar cpu-idle" title="Idle"></span>');

			cpu_el.append([bar_nice, bar_user, bar_system /*, bar_idle */]);
			this.cpu_bars.push({
				nice: bar_nice,
				user: bar_user,
				system: bar_system,
				// 'idle': bar_idle,
			});

			this.widget_el.append(cpu_el);
			this.cpu_els.push(cpu_el);
			this.cpu_total_labels.push(total_label);
		}

		this.mem_el = $('<div class="mem-line" style="height: ' + line_h + '"><span class="label">Mem</span></div>');
		this.mem_total_label = $('<span class="total-label"></span>');
		this.mem_total_label.appendTo(this.mem_el);
		let mem_bar_used = $('<span class="bar mem-used" title="Used"></span>');
		let mem_bar_buffers = $('<span class="bar mem-buffers" title="Buffers"></span>');
		let mem_bar_shared = $('<span class="bar mem-shared" title="Shared"></span>');
		let mem_bar_cached = $('<span class="bar mem-cached" title="Cached"></span>');
		this.mem_el.append([
			mem_bar_used,
			mem_bar_buffers,
			mem_bar_shared,
			mem_bar_cached,
		]);
		this.mem_bars = {
			used: mem_bar_used,
			buffers: mem_bar_buffers,
			shared: mem_bar_shared,
			cached: mem_bar_cached,
		};
		this.widget_el.append(this.mem_el);

		this.swp_el = $('<div class="swp-line" style="height: ' + line_h + '"><span class="label">Swp</span></div>');
		this.swp_total_label = $('<span class="total-label"></span>');
		this.swp_total_label.appendTo(this.swp_el);
		let swp_bar_used = $('<span class="bar swp-used" title="Used"></span>');
		// let swp_bar_cache = $('<span class="bar swp-cache" title="Cache"></span>');
		this.swp_el.append([swp_bar_used /*, swp_bar_cache */]);
		this.swp_bars = {
			used: swp_bar_used,
			// 'cache': swp_bar_cache,
		};
		this.widget_el.append(this.swp_el);

		msg.disk.forEach((disk) => {
			let disk_el = $('<div class="disk-line" style="height: ' + line_h + '"><span class="disk-label">' + disk.path + "</span></div>");
			let total_label = $('<span class="total-label"></span>');
			total_label.appendTo(disk_el);

			let bar_used = $('<span class="bar disk-used" title="Used space"></span>');
			disk_el.append(bar_used);
			this.disk_bars[disk.path] = bar_used;

			this.widget_el.append(disk_el);
			this.disk_els[disk.path] = disk_el;
			this.disk_total_labels[disk.path] = total_label;
		});

		this.initiated = true;
	}

	updateValuesAndBars(msg) {
		let w = this.panel.widget_width;
		let h = this.panel.widget_height;

		let step_size = 6;

		for (let i = 0; i < msg.cpu.length; i++) {
			let total =
				msg.cpu[i].user_percent +
				msg.cpu[i].nice_percent +
				msg.cpu[i].system_percent;
				// + msg.cpu[i].idle_percent;
			this.cpu_total_labels[i].text(total.toFixed(1) + "%");

			if (total > 90.0) this.cpu_total_labels[i].addClass("warn");
			else this.cpu_total_labels[i].removeClass("warn");

			let ww = w - (!this.is_thin && !this.is_narrower ? 25 : 2) - 2;
			let nice_w =
				Math.ceil(((ww / 100.0) * msg.cpu[i].nice_percent) / step_size) *
				step_size;
			this.cpu_bars[i]["nice"].css("width", nice_w + "px");
			let user_w =
				Math.ceil(((ww / 100.0) * msg.cpu[i].user_percent) / step_size) *
				step_size;
			this.cpu_bars[i]["user"].css("width", user_w + "px");
			let system_w =
				Math.ceil(((ww / 100.0) * msg.cpu[i].system_percent) / step_size) *
				step_size;
			this.cpu_bars[i]["system"].css("width", system_w + "px");
			// this.cpu_bars[i]['idle'].css('width', msg.cpu[i].idle_percent+'%');
		}

		let mem_total_b = Number(msg.mem_total_bytes);
		this.mem_total_label.text(formatBytes(msg.mem_used_bytes, false, true) + " / " + formatBytes(mem_total_b, false, true));
		let mem_used_w = Math.ceil((w * (Number(msg.mem_used_bytes) / mem_total_b)) / step_size) * step_size;
		this.mem_bars["used"]
			.css("width", mem_used_w + "px")
			.attr("title", "Used " + formatBytes(msg.mem_used_bytes, false, true));
		let mem_buffers_w = Math.ceil((w * (Number(msg.mem_buffers_bytes) / mem_total_b)) / step_size) * step_size;
		this.mem_bars["buffers"]
			.css("width", mem_buffers_w + "px")
			.attr("title", "Buffers " + formatBytes(msg.mem_buffers_bytes, false, true));
		let mem_shared_w = Math.ceil((w * (Number(msg.mem_shared_bytes) / mem_total_b)) / step_size) * step_size;
		this.mem_bars["shared"]
			.css("width", mem_shared_w + "px")
			.attr("title", "Shared " + formatBytes(msg.mem_shared_bytes, false, true));
		let mem_cached_w = Math.ceil((w * (Number(msg.mem_cached_bytes) / mem_total_b)) / step_size) * step_size;
		this.mem_bars["cached"]
			.css("width", mem_cached_w + "px")
			.attr("title", "Cached " + formatBytes(msg.mem_cached_bytes, false, true));

		let swp_total_b = Number(msg.swp_total_bytes);
		this.swp_total_label.text(formatBytes(msg.swp_used_bytes, false, true) + " / " + formatBytes(msg.swp_total_bytes, false, true));
		let swp_used_w = Math.ceil((w * (Number(msg.swp_used_bytes) / swp_total_b)) / step_size) * step_size;
		this.swp_bars["used"]
			.css("width", swp_used_w + "px")
			.attr("title", "Used " + formatBytes(msg.swp_used_bytes, false, true));

		msg.disk.forEach((disk) => {
			let disk_total_b = Number(disk.total_bytes);
			let disk_used_b = Number(disk.used_bytes);
			this.disk_total_labels[disk.path].text(formatBytes(disk.free_bytes, false, true) + " / " + formatBytes(disk_total_b, false, true));
			let disk_used_w = Math.ceil((w * (disk_used_b / disk_total_b)) / step_size) * step_size;
			this.disk_bars[disk.path]
				.css("width", disk_used_w + "px")
				.attr("title", "Used " + formatBytes(disk_used_b, false, true));
		});
	}
}
