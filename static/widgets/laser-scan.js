import { deg2rad } from "../inc/lib.js";
import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// Laser scan visualization

export class LaserScanWidget extends SingleTypePanelWidgetBase {
	static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 13;
	static HANDLED_MSG_TYPES = [ 'sensor_msgs/msg/LaserScan' ];

	static MAX_TRACE_LENGTH = 1

	constructor(panel, topic) {
		super(panel, topic, 'laser-scan');

		this.data_trace = [];
		this.default_zoom = 2.0;
		this.default_rot = 0;
		this.zoom = this.panel.getPanelVarAsFloat('z', this.default_zoom);
		this.rot = this.panel.getPanelVarAsInt('r', this.default_rot);

		this.canvas = this.widget_el
			.html('<canvas id="panel_canvas_' + panel.n + '" width="' + panel.widget_width + '" height="' + panel.widget_height +'"></canvas>')
			.find("canvas")[0];
		this.ctx = this.canvas.getContext("2d");

		let that = this;

		this.widget_el.on("mousewheel", (ev) => {
			ev.preventDefault();
			let d = ev.originalEvent.deltaY;
			that.setZoom(that.zoom - d * 0.005);
			// console.log('wheel', );
		});

		//pinch zoom
		const evCache = [];
		let prevDiff = -1;
		let offsetDiff = -1;
		let baseZoom = -1;

		function pointerdownHandler(ev) {
			// The pointerdown event signals the start of a touch interaction.
			// This event is cached to support 2-finger gestures
			evCache.push(ev);
			// console.log("pointerDown", ev);
			if (evCache.length > 1) {
				offsetDiff = -1; // reset
				ev.preventDefault();
			}
		}

		function pointermoveHandler(ev) {
			// This function implements a 2-pointer horizontal pinch/zoom gesture.
			//
			// If the distance between the two pointers has increased (zoom in),
			// the target element's background is changed to "pink" and if the
			// distance is decreasing (zoom out), the color is changed to "lightblue".
			//
			// This function sets the target element's border to "dashed" to visually
			// indicate the pointer's target received a move event.
			// console.log("pointerMove", ev);
			// ev.target.style.border = "dashed";

			// Find this event in the cache and update its record with this event
			const index = evCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			evCache[index] = ev;

			// If two pointers are down, check for pinch gestures
			if (evCache.length === 2 && evCache[0].touches.length === 2) {
				// Calculate the distance between the two pointers
				let curDiff = Math.sqrt(
					Math.pow(
						evCache[0].touches[0].clientX - evCache[0].touches[1].clientX,
						2,
					) +
						Math.pow(
							evCache[0].touches[0].clientY - evCache[0].touches[1].clientY,
							2,
						),
				);

				if (offsetDiff < 0) {
					offsetDiff = curDiff;
					baseZoom = that.zoom;
				}

				curDiff -= offsetDiff;

				// console.log('touch move curDiff='+curDiff)
				let zoom = baseZoom + curDiff / 10.0;
				that.setZoom(zoom);

				// Cache the distance for the next move event
				prevDiff = curDiff;

				ev.preventDefault();
			}
		}

		function removeEvent(ev) {
			// Remove this event from the target's cache
			const index = evCache.findIndex(
				(cachedEv) => cachedEv.pointerId === ev.pointerId,
			);
			evCache.splice(index, 1);
		}

		function pointerupHandler(ev) {
			// console.log(ev.type, ev);
			// Remove this pointer from the cache and reset the target's
			// background and border
			removeEvent(ev);
			// ev.target.style.background = "white";
			// ev.target.style.border = "1px solid black";

			// If the number of pointers down is less than two then reset diff tracker
			if (evCache.length < 2) {
				prevDiff = -1;
			}
		}

		const el = document.getElementById("panel_widget_" + panel.n);
		el.addEventListener("touchstart", pointerdownHandler, { passive: false });
		el.addEventListener("touchmove", pointermoveHandler, { passive: false });

		// Use same handler for pointer{up,cancel,out,leave} events since
		// the semantics for these events - in this app - are the same.
		el.onpointerup = pointerupHandler;
		el.onpointercancel = pointerupHandler;
		el.onpointerout = pointerupHandler;
		el.onpointerleave = pointerupHandler;

		this.rendering = true;
		requestAnimationFrame((t) => this.renderingLoop());
	}

	setupMenu(menu_els) {
		let that = this;

		// zoom control
		let zoom_ctrl_line_el = $('<div class="menu_line zoom_ctrl" id="zoom_ctrl_' + this.panel.n + '"></div>');
		let zoom_minus_btn = $('<span class="minus">-</span>');
		this.zoom_val_btn = $('<button class="val" title="Reset zoom">Zoom: ' + this.zoom.toFixed(1) + "x</button>",);
		let zoom_plus_btn = $('<span class="plus">+</span>');
		zoom_ctrl_line_el.append([zoom_minus_btn, this.zoom_val_btn, zoom_plus_btn]);
		zoom_plus_btn.click(function (ev) {
			that.setZoom(that.zoom + that.zoom / 2.0);
		});
		zoom_minus_btn.click(function (ev) {
			that.setZoom(that.zoom - that.zoom / 2.0);
		});
		this.zoom_val_btn.click(function (ev) {
			that.setZoom(that.default_zoom);
		});
		menu_els.push(zoom_ctrl_line_el);

		// rotation control
		let rot_ctrl_line_el = $('<div class="menu_line rot_ctrl" id="rot_ctrl_' + this.panel.n + '"></div>');
		let rot_left_btn = $('<span class="rot-left"><span class="icon"></span></span>');
		this.rot_val_btn = $('<button class="val" title="Reset rotation">Rotate: ' + this.rot.toFixed(0) + "°</button>");
		let rot_rigt_btn = $('<span class="rot-right"><span class="icon"></span></span>');
		rot_ctrl_line_el.append([rot_left_btn, this.rot_val_btn, rot_rigt_btn]);
		rot_rigt_btn.click(function (ev) {
			that.setRot(that.rot + 45.0);
		});
		rot_left_btn.click(function (ev) {
			that.setRot(that.rot - 45.0);
		});
		this.rot_val_btn.click(function (ev) {
			that.setRot(that.default_rot);
		});
		menu_els.push(rot_ctrl_line_el);
	}

	setZoom(zoom) {
		
		if (zoom < 0.1) {
			zoom = 0.1;
		} else if (zoom > 30.0) {
			zoom = 30.0;
		}
		this.zoom = zoom;
		this.zoom_val_btn.html("Zoom: " + this.zoom.toFixed(1) + "x");
		this.panel.storePanelVarAsFloat('z', this.zoom, 3);

		this.renderDirty();
	}

	setRot(rot) {
		
		if (rot < -1.0) {
			rot = 270.0;
		} else if (rot > 359.0) {
			rot = 0.0;
		}
		this.rot = rot;
		this.rot_val_btn.html("Rotate: " + this.rot.toFixed(0) + "°");
		this.panel.storePanelVarAsFloat('r', this.rot);

		this.renderDirty();
	}

	renderDirty() {
		this.render_dirty = true;
	}

	onClose() {
		super.onClose();
		this.rendering = false; //kills the loop
	}

	onResize() {
		this.renderDirty();
	}

	async onData(msg) {
		this.scale = (this.panel.widget_height / 2.0 - 20.0) / msg.range_max;

		let newScanPts = [];
		for (let i = 0; i < msg.ranges.length; i++) {
			if (msg.ranges[i] == null || msg.ranges[i] > msg.range_max || msg.ranges[i] < msg.range_min)
				continue;

			let pos = [0, msg.ranges[i] * this.scale];

			let arad = msg.angle_min + i * msg.angle_increment - deg2rad(this.rot);
			let p = [
				Math.cos(arad) * pos[0] - Math.sin(arad) * pos[1],
				Math.sin(arad) * pos[0] + Math.cos(arad) * pos[1],
			];

			newScanPts.push(p);
		}

		this.data_trace.push(newScanPts);

		if (this.data_trace.length > LaserScanWidget.MAX_TRACE_LENGTH) {
			this.data_trace.shift();
		}

		this.range_max = msg.range_max; //save for later

		this.renderDirty();
	}

	renderingLoop() {
		if (!this.rendering) return;

		if (this.render_dirty) {
			this.render_dirty = false;
			this.render();
		}

		requestAnimationFrame((t) => this.renderingLoop());
	}

	render() {
		let frame = [this.panel.widget_width / 2.0, this.panel.widget_height / 2.0];

		let range = this.range_max;

		this.ctx.clearRect(0, 0, this.panel.widget_width, this.panel.widget_height);

		for (let i = 0; i < this.data_trace.length; i++) {
			let pts = this.data_trace[i];

			for (let j = 0; j < pts.length; j++) {
				let p = [pts[j][0] * this.zoom, pts[j][1] * this.zoom]; //zoom applied here
				this.ctx.fillStyle =
					i == this.data_trace.length - 1 ? "#ff0000" : "#aa0000";
				this.ctx.beginPath();
				this.ctx.arc(frame[0] + p[0], frame[1] - p[1], 1.5, 0, 2 * Math.PI);
				this.ctx.fill();
			}
		}

		//lines
		let range_int = Math.floor(range);
		for (let x = -range_int; x < range_int + 1; x++) {
			this.ctx.beginPath();
			this.ctx.setLineDash(x == 0 ? [] : [this.scale / 20, this.scale / 10]);
			this.ctx.strokeStyle = x == 0 ? "rgba(100,100,100,0.3)" : "#0c315480";

			//vertical
			//panel.widget_height
			let dd =
				Math.sqrt(
					Math.pow(range_int * this.panel.scale, 2) -
						Math.pow(x * this.scale, 2),
				) * this.zoom;
			this.ctx.moveTo(frame[0] + x * this.scale * this.zoom, frame[1] - dd);
			this.ctx.lineTo(frame[0] + x * this.scale * this.zoom, frame[1] + dd);
			this.ctx.stroke();

			//horizontal
			this.ctx.moveTo(frame[0] - dd, frame[1] + x * this.scale * this.zoom);
			this.ctx.lineTo(frame[0] + dd, frame[1] + x * this.scale * this.zoom);
			this.ctx.stroke();
		}

		//frame dot on top
		this.ctx.fillStyle = "#26a0fc";
		this.ctx.beginPath();
		this.ctx.arc(frame[0], frame[1], 5, 0, 2 * Math.PI);
		this.ctx.fill();
	}
}
