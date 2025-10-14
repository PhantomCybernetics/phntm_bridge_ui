export class Zoomable2DTiles {
	static label = null;
	static default_width = 5;
	static default_height = 12;

	constructor(panel) {
		this.panel = panel;

		this.panel.default_zoom = 1.0;

		if (this.panel.zoom === undefined || this.panel.zoom === null) {
			this.panel.zoom = this.panel.default_zoom;
		}

		this.tile_size = 500; //px x px one tile
		this.render_scale = 100;
		this.tiles = {}; // [x,y] => [ scan_canvas, overlay_canvas ]

		$("#panel_widget_" + panel.n).addClass("enabled laser_scan");

		$("#panel_widget_" + panel.n).html(
			'<div class="canvas_container" id="canvas_container_' +
				panel.n +
				'">' +
				// '<canvas id="panel_overlay_canvas_'+panel.n+'" class="big_canvas canvas_overlay" width="'+ this.canvas_size[0] +'" height="'+ this.canvas_size[1] +'"></canvas>' +
				// '<canvas id="panel_canvas_'+panel.n+'" class="big_canvas" width="'+ this.canvas_size[0] +'" height="'+ this.canvas_size[1] +'"></canvas>' +
				'<img id="panel_arrow_' +
				panel.n +
				'" title="Follow target" class="arrow" src="/static/graph/arrow.png">' +
				"</div>",
		);
		// this.canvas = canvases[0]
		// this.canvas_overlay = canvases[1];
		$("#panel_widget_" + panel.n).addClass("scrollable");

		this.img = $("#panel_arrow_" + panel.n);

		$(this.img).click((ev) => {
			ev.preventDefault(); //stop from moving the panel
			$("#follow_target_" + panel.n).prop("checked", true);
			that.follow_target = true;
		});

		this.canvas_container = $("#canvas_container_" + panel.n);
		[panel.widget_width, panel.widget_height] = panel.getAvailableWidgetSize();
		this.canvas_container.css({
			left: panel.widget_width / 2.0,
			top: panel.widget_height / 2.0,
			scale: panel.zoom,
		});

		this.base_offset_pos = null;
		this.base_offset_rot = null;
		this.render_dirty = false;

		this.drag_mouse_offset = [];
		this.drag_frame_offset = [];
		this.dragging = false;

		this.rendering = true; // loop runnig
		this.do_clear = false;

		this.follow_target = true;

		let that = this;

		panel.resizeEventHandler = function () {
			// [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()
			// that.render(true);
		};

		$("#panel_widget_" + panel.n).on("mousedown touchstart", (ev) => {
			// console.log(ev);
			if (ev.button === 0) {
				ev.preventDefault();

				that.drag_mouse_offset = [ev.originalEvent.pageX, ev.originalEvent.pageY];
				let cont_pos = $("#canvas_container_" + panel.n).position();
				that.drag_frame_offset = [cont_pos.left, cont_pos.top];
				that.dragging = true;
			}
		});

		$("#panel_widget_" + panel.n).on("wheel", (ev) => {
			ev.preventDefault();
			let d = ev.originalEvent.deltaY;
			that.setZoom(that.panel.zoom - d * 0.005);
			// console.log('wheel', );
		});

		$(window.document).on("mousemove touchmove", function (ev) {
			if (that.dragging) {
				ev.preventDefault();

				if (that.follow_target) {
					that.follow_target = false;
					$("#follow_target_" + that.panel.n).prop("checked", false);
				}

				$("#canvas_container_" + that.panel.n).css({
					left:
						that.drag_frame_offset[0] +
						(ev.originalEvent.pageX - that.drag_mouse_offset[0]),
					top:
						that.drag_frame_offset[1] +
						(ev.originalEvent.pageY - that.drag_mouse_offset[1]),
				});
				// panel.display_offset = [
				//     that.drag_frame_offset[0] + (ev.originalEvent.pageX - that.drag_mouse_offset[0]),
				//     that.drag_frame_offset[1] + (ev.originalEvent.pageY - that.drag_mouse_offset[1])
				// ]
				// that.render(true); //erase
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
			let canvas = $(this.canvas_container)
				.append(
					'<canvas class="canvas_tile" id="canvas_tile_' +
						cx +
						"x" +
						cy +
						"_" +
						layer +
						'" width="' +
						this.tile_size +
						'" height="' +
						this.tile_size +
						'" style="left: ' +
						base[0] +
						"px; top: " +
						base[1] +
						"px; z-index: " +
						layer +
						'"></canvas>',
				)
				.find("#canvas_tile_" + cx + "x" + cy + "_" + layer)[0];
			// console.log(canvas);
			this.tiles[cx][cy][layer].canvas = canvas;
			this.tiles[cx][cy][layer].ctx = canvas.getContext("2d");
			this.tiles[cx][cy][layer].x = base[0];
			this.tiles[cx][cy][layer].y = base[1];
			this.tiles[cx][cy][layer].cx = cx;
			this.tiles[cx][cy][layer].cy = cy;
		}

		return this.tiles[cx][cy][layer];
	}

	setZoom(zoom) {
		let panel = this.panel;
		if (zoom < 0.1) {
			zoom = 0.1;
		} else if (zoom > 5.0) {
			zoom = 5.0;
		}
		panel.zoom = zoom;
		$("#zoom_ctrl_" + panel.n + " .val").html("Zoom: " + panel.zoom.toFixed(1) + "x");
		panel.ui.updateUrlHash();
		let oldPos = $(this.img).offset();

		$(this.canvas_container).css({ scale: panel.zoom });
		let newPos = $(this.img).offset();
		let pos = $(this.canvas_container).position();
		// console.log('setZoom: this.img=', this.img);
		$(this.canvas_container).css({
			left: pos.left - (newPos.left - oldPos.left),
			top: pos.top - (newPos.top - oldPos.top),
		});
		this.render_dirty = true;
	}

	setupMenu() {
		let zoom =
			this.panel.zoom === null || this.panel.zoom === undefined
				? "?"
				: this.panel.zoom.toFixed(1);

		$(
			'<div class="menu_line zoom_ctrl" id="zoom_ctrl_' +
				this.panel.n +
				'">' +
				'<span class="minus">-</span>' +
				'<button class="val" title="Reset zoom">Zoom: ' +
				zoom +
				"x</button>" +
				'<span class="plus">+</span>' +
				"</div>",
		).insertBefore($("#close_panel_menu_" + this.panel.n));

		let that = this;
		$("#zoom_ctrl_" + this.panel.n + " .plus").click(function (ev) {
			that.setZoom(that.panel.zoom + that.panel.zoom / 2.0);
		});

		$("#zoom_ctrl_" + this.panel.n + " .minus").click(function (ev) {
			that.setZoom(that.panel.zoom - that.panel.zoom / 2.0);
		});

		$("#zoom_ctrl_" + this.panel.n + " .val").click(function (ev) {
			that.setZoom(1.0);
		});

		$(
			'<div class="menu_line"><label for="follow_target_' +
				this.panel.n +
				'" class="follow_target_label" id="follow_target_label_' +
				this.panel.n +
				'"><input type="checkbox" id="follow_target_' +
				this.panel.n +
				'" class="follow_target" checked title="Follow target"/> Follow target</label></div>',
		).insertBefore($("#close_panel_menu_" + this.panel.n));

		$("#follow_target_" + this.panel.n).change(function (ev) {
			that.follow_target = $(this).prop("checked");
			// if (that.follow_target)
			//     $('#panel_widget_'+panel.n).removeClass('scrollable');
			// else
			//     $('#panel_widget_'+panel.n).addClass('scrollable');
		});
	}

	clearTiles(layers, destroy = true) {
		let that = this;
		Object.keys(that.tiles).forEach((x) => {
			// console.log('tiles y['+x+']:', Object.keys(this.tiles[x]));
			Object.keys(that.tiles[x]).forEach((y) => {
				layers.forEach((l) => {
					if (that.tiles[x][y][l]) {
						if (destroy) {
							$("#canvas_tile_" + x + "x" + y + "_" + l).remove();
							delete that.tiles[x][y][l];
						} else {
							that.tiles[x][y][l].ctx.clearRect(
								0,
								0,
								that.tile_size,
								that.tile_size,
							);
						}
					}
				});
			});
		});
	}

	clear() {
		this.do_clear = true;
	}
}
