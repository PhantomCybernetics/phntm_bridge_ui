import * as THREE from "three";

export class Zoomable2DCanvasTiles {
	
	constructor(panel, widget_el, default_zoom = 2.0, default_rot = 0) {
		this.panel = panel;
		this.widget_el = widget_el;

		this.widget_el.addClass('zoomable-2d-tiles');

		this.tile_size = 500; //px x px one tile
		this.render_scale = 100;
		this.tiles = {}; // [ x,y ] => [ scan_canvas, overlay_canvas ]

		this.default_zoom = default_zoom;
		this.default_rot = default_rot;
        this.zoom = this.panel.getPanelVarAsFloat('z', this.default_zoom);
		this.rot = this.panel.getPanelVarAsInt('r', this.default_rot);
		this.follow_target = this.panel.getPanelVarAsFloat('ft', true);
		this.setFollowTarget(this.follow_target);

		this.canvas_container_el = $('<div class="canvas_container"></div>');
		this.arrow_el = $('<img title="Follow target" class="arrow" src="/static/graph/arrow.png">');
		this.canvas_container_el.append(this.arrow_el);
		this.widget_el.append(this.canvas_container_el);

		this.zoom_val_btn = null; // in setMenu
		this.follow_target_cb = null;

		let that = this;

		this.arrow_el.click((ev) => {
			ev.preventDefault(); // prevent from moving the panel
			that.follow_target = true;
			that.setFollowTarget(that.follow_target);
		});

		this.canvas_container_el.css({
			left: this.panel.widget_width / 2.0,
			top: this.panel.widget_height / 2.0,
			scale: this.zoom,
		});

		this.drag_mouse_offset = [];
		this.drag_frame_offset = [];
		this.dragging = false;

		this.widget_el.on("mousedown touchstart", (ev) => {
			if (ev.button === 0) {
				ev.preventDefault();
				that.drag_mouse_offset = [ev.originalEvent.pageX, ev.originalEvent.pageY];
				let cont_pos = that.canvas_container_el.position();
				that.drag_frame_offset = [cont_pos.left, cont_pos.top];
				that.dragging = true;
			}
		});

		this.widget_el.on("wheel", (ev) => {
			ev.preventDefault();
			let d = ev.originalEvent.deltaY;
			that.setZoom(that.zoom - d * 0.005);
		});

		$(window.document).on("mousemove touchmove", function (ev) {
			if (that.dragging) {
				ev.preventDefault();

				if (that.follow_target) {
					that.follow_target = false;
					that.setFollowTarget(that.follow_target);	
				}

				that.canvas_container_el.css({
					left: that.drag_frame_offset[0] + (ev.originalEvent.pageX - that.drag_mouse_offset[0]),
					top: that.drag_frame_offset[1] + (ev.originalEvent.pageY - that.drag_mouse_offset[1])
				});
			}
		});

		$(window.document).on("mouseup touchend", function (ev) {
			that.dragging = false;
		});
	}

	getTile(x, y, layer) {
		let t_half = this.tile_size / 2.0;
		let cx = Math.floor((x + t_half) / this.tile_size);
		let cy = Math.floor((y + t_half) / this.tile_size);

		if (!this.tiles[cx]) this.tiles[cx] = {};
		if (!this.tiles[cx][cy]) this.tiles[cx][cy] = {};

		if (!this.tiles[cx][cy][layer]) {
			// console.log('Adding canvas tile ['+cx+';'+cy+'] L='+layer, x, y)
			this.tiles[cx][cy][layer] = {};
			let base = [cx * this.tile_size - t_half, cy * this.tile_size - t_half];
			let canvas = $('<canvas class="canvas_tile" id="canvas_tile_' + cx + "x" + cy + "_" + layer + '" '
							+ 'width="' + this.tile_size + '" height="' + this.tile_size + '" '
							+ 'style="left: ' + base[0] + "px; top: " + base[1] + "px; z-index: " + layer +'">'
						 	+ '</canvas>');
			this.canvas_container_el.append(canvas);
			// console.log(canvas);
			this.tiles[cx][cy][layer].canvas = canvas;
			this.tiles[cx][cy][layer].ctx = canvas[0].getContext("2d");
			this.tiles[cx][cy][layer].x = base[0];
			this.tiles[cx][cy][layer].y = base[1];
			this.tiles[cx][cy][layer].cx = cx;
			this.tiles[cx][cy][layer].cy = cy;
		}

		return this.tiles[cx][cy][layer];
	}

	clearTiles(layers, destroy=false) {
		let that = this;
		Object.keys(this.tiles).forEach((x) => {
			Object.keys(that.tiles[x]).forEach((y) => {
				layers.forEach((l) => {
					if (that.tiles[x][y][l]) {
						if (destroy) {
							//$("#canvas_tile_" + x + "x" + y + "_" + l).remove();
							if (that.tiles[x][y][l]) {
								that.tiles[x][y][l].canvas.remove();
								delete that.tiles[x][y][l];
							}
						} else {
							if (ththatis.tiles[x][y][l]) {
								that.tiles[x][y][l].ctx.clearRect(
									0, 0,
									that.tile_size, that.tile_size,
								);
							}
						}
					}
				});
			});
		});
	}

	setFollowTarget(state) {
		if (this.follow_target_cb)
			this.follow_target_cb.prop("checked", state);
		this.panel.storePanelVarAsBool('ft', state); // store in panel vars

		if (state)
			this.widget_el.removeClass('scrollable');
		else
			this.widget_el.addClass('scrollable');
	}

	setZoom(zoom) {
		if (zoom < 0.1) {
			this.zoom = 0.1;
		} else if (zoom > 5.0) {
			this.zoom = 5.0;
		} else {
			this.zoom = zoom;
		}
		
		this.zoom_val_btn.text("Zoom: " + this.zoom.toFixed(1) + "x");
		this.panel.storePanelVarAsFloat('z', this.zoom); // store in panel vars
		let oldPos = this.arrow_el.offset();

		this.canvas_container_el.css({ scale: this.zoom });
		let newPos = this.arrow_el.offset();
		let pos = this.canvas_container_el.position();
		this.canvas_container_el.css({
			left: pos.left - (newPos.left - oldPos.left),
			top: pos.top - (newPos.top - oldPos.top),
		});
		this.render_dirty = true;
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
		// let rot_ctrl_line_el = $('<div class="menu_line rot_ctrl" id="rot_ctrl_' + this.panel.n + '"></div>');
		// let rot_left_btn = $('<span class="rot-left"><span class="icon"></span></span>');
		// this.rot_val_btn = $('<button class="val" title="Reset rotation">Rotate: ' + this.rot.toFixed(0) + "°</button>");
		// let rot_rigt_btn = $('<span class="rot-right"><span class="icon"></span></span>');
		// rot_ctrl_line_el.append([rot_left_btn, this.rot_val_btn, rot_rigt_btn]);
		// rot_rigt_btn.click(function (ev) {
		// 	that.setRot(that.rot + 45.0);
		// });
		// rot_left_btn.click(function (ev) {
		// 	that.setRot(that.rot - 45.0);
		// });
		// this.rot_val_btn.click(function (ev) {
		// 	that.setRot(that.default_rot);
		// });
		// menu_els.push(rot_ctrl_line_el);

		// follow target
		let follow_target_line_el = $('<div class="menu_line"></div>');
		let follow_target_label_el = $('<label for="follow_target_' + this.panel.n + '">Follow target</label>');
		this.follow_target_cb = $('<input type="checkbox" id="follow_target_' + this.panel.n + '" title="Follow target"/>');
		if (this.follow_target)
			this.follow_target_cb.prop('checked', true);
		follow_target_label_el.append(this.follow_target_cb);
		follow_target_line_el.append(follow_target_label_el);

		this.follow_target_cb.change(function (ev) {
			that.follow_target = $(this).prop("checked");
			that.setFollowTarget(that.follow_target);
		});

		menu_els.push(follow_target_line_el);
	}

	setArrowPosition(x, y, rot_rad) {
		let scaled_x = x * this.render_scale;
		let scaled_y = y * this.render_scale;

		this.arrow_el.css({
			left: scaled_x - 10 + "px",
			top: scaled_y - 10 + "px",
			transform: "rotate(" + (-rot_rad - Math.PI / 2) + "rad)",
			scale: 1.0 / this.zoom,
			display: "block",
		});

		if (this.follow_target) {
			this.canvas_container_el.css({
				left: (this.panel.widget_width / 2.0) - scaled_x * this.zoom,
				top: (this.panel.widget_height / 2.0) - scaled_y * this.zoom,
			});
		}
	}
}
