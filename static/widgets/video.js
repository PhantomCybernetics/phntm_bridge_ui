import { MultiTopicSource } from "./inc/multitopic.js";

export class VideoWidget {
	is_video = true;
	static default_width = 5;
	static default_height = 12;

	constructor(panel, id_source) {
		this.panel = panel;

		$("#panel_widget_" + panel.n)
			.addClass("enabled video")
			.html(
				'<video id="panel_video_' +
					panel.n +
					'" autoplay="true" playsinline="true" muted="true" preload="metadata"></video>' + //muted allows video autoplay in chrome before user interactions
					'<span id="video_stats_' +
					panel.n +
					'" class="video_stats"></span>' +
					// + '<span id="video_fps_'+panel.n+'" class="video_fps"></span>'
					'<div id="video_overlay_' +
					panel.n +
					'" class="video_overlay"></div>',
			); //muted allows video autoplay in chrome before user interactions

		this.el = $("#panel_video_" + panel.n);
		this.overlay_el = $("#video_overlay_" + panel.n);
		this.last_video_stats_string = "";
		this.last_video_packets_lost = 0;
		this.last_video_frames_dropped = 0;
		this.last_video_freeze_count = 0;
		this.video_stats_el = $("#video_stats_" + panel.n);
		// this.last_fps_string = '0 FPS';
		// this.video_fps_el = $('#video_fps_' + panel.n);

		this.videoWidth = -1;
		this.videoHeight = -1;

		this.display_overlay_input_crop = false;

		let that = this;
		// this.el.on('loadedmetadata', function(ev) {
		//     if (!this.videoWidth || !this.videoHeight) {
		//         console.error('Invalid video metadata loaded; w, h, ev = ', this.videoWidth, this.videoHeight, ev);
		//         return;
		//     }
		//     console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
		//     that.videoWidth = this.videoWidth;
		//     that.videoHeight = this.videoHeight;
		//     that.updateAllOverlays();
		// });

		let video_el = document.getElementById("panel_video_" + panel.n);

		video_el.onloadedmetadata = () => {
			video_el.play().catch((e) => console.error("Play failed:", e));
		};

		video_el.addEventListener("resize", () => {
			// Safari sometimes doesn't load meta properly => wait for actual dimensions
			if (that.videoWidth != -1 || that.videoHeight != -1) return;

			if (!video_el.videoWidth || !video_el.videoHeight) {
				console.log(
					"Invalid video metadata loaded, ignoring; w, h = ",
					video_el.videoWidth,
					video_el.videoHeight,
				);
				return;
			}

			console.log("Video meta loaded:", video_el.videoWidth, video_el.videoHeight);
			// console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
			that.videoWidth = video_el.videoWidth;
			that.videoHeight = video_el.videoHeight;
			that.updateAllOverlays();
		});

		// video_el.addEventListener('click', () => {
		//     console.log('Click > play');
		//     video_el.play();
		// });

		// this.el.on('resize', () => {
		//     let w = that.el

		//     if (!this.videoWidth || !this.videoHeight) {
		//         console.error('Invalid video metadata loaded; w, h, ev = ', this.videoWidth, this.videoHeight, ev);
		//         return;
		//     }
		//     console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
		//     that.videoWidth = this.videoWidth;
		//     that.videoHeight = this.videoHeight;
		//     that.updateAllOverlays();
		// });

		// this.el.on('loadedmetadata', function(ev) {
		//     if (!this.videoWidth || !this.videoHeight) {
		//         console.error('Invalid video metadata loaded; w, h, ev = ', this.videoWidth, this.videoHeight, ev);
		//         return;
		//     }
		//     console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
		//     that.videoWidth = this.videoWidth;
		//     that.videoHeight = this.videoHeight;
		//     that.updateAllOverlays();
		// });

		document
			.getElementById("panel_video_" + panel.n)
			.addEventListener("error", (ev) => {
				console.log("(Assigned) Stream error", ev);
			});

		// document.getElementById('panel_video_'+panel.n).addEventListener('error', (ev)=>{
		//     console.log('(Assigned) Stream error', ev);
		// });

		this.panel.setMediaStream();

		this.overlays = {};
		this.clear_overlays_timeout = {};
		this.next_overlay_id = 0;
		this.overlay_crop_display_control_menu_el = null;

		this.overlay_sources = new MultiTopicSource(this);
		this.overlay_sources.on("change", (topics) =>
			that.onOverlaySourcesChange(topics),
		);
		this.overlay_sources.add(
			"vision_msgs/msg/Detection2DArray",
			"Detection 2D Array",
			null,
			-1,
			(t, d) => {
				that.onOverlayData(t, d);
			},
			(t) => {
				that.clearOverlay(t);
			},
		);
		// this.overlay_sources.add('vision_msgs/msg/Detection3DArray', 'Detection 3D Array', null, -1,
		//                         (t, d) => { that.onOverlayData(t, d); },
		//                         (t) => { that.clearOverlay(t); });

		this.parseUrlParts(this.panel.custom_url_vars); //calls multisource.parseUrlParts
		this.onOverlaySourcesChange(this.overlay_sources.getSources());
	}

	onOverlaySourcesChange(overlay_topics) {
		//console.warn('onOverlaySourcesChange', overlay_topics)

		let client = this.panel.ui.client;
		let that = this;
		overlay_topics.forEach((topic) => {
			if (!that.overlays[topic]) {
				that.overlays[topic] = {};
				that.overlays[topic].configUpdateCb = (config) => {
					//console.warn("onTopicConfigUpdate", topic, config);
					that.overlays[topic].config = config;
					that.setupOverlay(topic, config);
				};
				client.onTopicConfig(topic, that.overlays[topic].configUpdateCb);
			}
		});
	}

	setupOverlay(topic, config) {
		if (config) {
			if (config["input_width"] && config["input_height"]) {
				this.overlays[topic].nn_w = config["input_width"];
				this.overlays[topic].nn_h = config["input_height"];
				this.overlays[topic].overlay_aspect =
					config["input_width"] / config["input_height"];
			} else {
				this.overlays[topic].overlay_aspect = -1;
			}
			this.overlays[topic].config = config;
		} else if (!this.overlays[topic].config) {
			return;
		}

		if (this.videoWidth < 0 || this.videoHeight < 0) return; //video dimenstions still unknown

		if (this.overlays[topic].overlay_aspect > -1) {
			let w = this.videoHeight * this.overlays[topic].overlay_aspect;
			if (w <= this.videoWidth) {
				this.overlays[topic].display_w = w;
				this.overlays[topic].display_h = this.videoHeight;
			} else {
				this.overlays[topic].display_w = this.videoWidth;
				this.overlays[topic].display_h =
					this.videoWidth / this.overlays[topic].overlay_aspect;
			}
		} else {
			this.overlays[topic].display_w = this.videoWidth;
			this.overlays[topic].display_h = this.videoHeight;
		}

		this.overlays[topic].xoff =
			(this.videoWidth - this.overlays[topic].display_w) / 2.0;

		if (this.overlays[topic].container_el) {
			// let svg = this.overlays[topic].svg.select(function() { return this.parentNode; })
			// svg.remove();
			this.overlays[topic].container_el.remove();
		}

		console.log("Making overlay from " + topic);
		let cont_id = "video_overlay_" + this.panel.n + "_" + this.next_overlay_id;
		this.next_overlay_id++;
		this.overlays[topic].container_el = $(
			'<div class="video_overlay_cont" id="' + cont_id + '"></div>',
		);
		this.overlays[topic].container_el.css(
			"left",
			(this.overlays[topic].xoff / this.videoWidth) * 100 + "%",
		);
		this.overlays[topic].container_el.appendTo(this.overlay_el);

		this.overlays[topic].svg = d3.select("#" + cont_id).append("svg");
		this.overlays[topic].svg
			.attr("width", (this.overlays[topic].display_w / this.videoWidth) * 100 + "%")
			.attr(
				"viewBox",
				"0 0 " +
					this.overlays[topic].display_w +
					" " +
					this.overlays[topic].display_h,
			)
			.append("g");
		if (this.display_overlay_input_crop) {
			this.overlays[topic].container_el.addClass("display_crop");
		}

		this.renderOverlayMenuControls();
	}

	updateAllOverlays() {
		let overlay_topics = Object.keys(this.overlays);
		overlay_topics.forEach((t) => {
			this.setupOverlay(t, null);
		});
	}

	onClose() {
		let overlay_topics = Object.keys(this.overlays);
		overlay_topics.forEach((topic) => {
			this.clearOverlay(topic);
		});
	}

	setupMenu(menu_els) {
		this.overlay_sources.setupMenu(menu_els, "Overlay");
		let that = this;

		//stats menu toggle
		let stats_menu_line_el = $('<div class="menu_line"></div>');
		let stats_cb_label_el = $(
			'<label for="video_stats_cb_' +
				this.panel.n +
				'" class="video_stats_cb_label" id="video_stats_cb_label_' +
				this.panel.n +
				'">Stats for nerds</label>',
		);
		let stats_cb = $(
			'<input type="checkbox" id="video_stats_cb_' +
				this.panel.n +
				'" class="video_stats_cb" title="Display video stats"/>',
		);
		stats_cb_label_el.append(stats_cb).appendTo(stats_menu_line_el);
		menu_els.push(stats_menu_line_el);

		stats_cb.change(function (ev) {
			if ($(this).prop("checked")) {
				that.video_stats_el.html(that.last_video_stats_string);
				that.video_stats_el.addClass("enabled");
			} else {
				that.video_stats_el.removeClass("enabled");
			}
		});

		this.overlay_crop_display_control_menu_el = null; //menu is empty here, force re-create
		this.renderOverlayMenuControls();
	}

	renderOverlayMenuControls() {
		let show_nn_crop_control = false;
		Object.keys(this.overlays).forEach((topic) => {
			if (this.overlays[topic].nn_w || this.overlays[topic].nn_h) {
				show_nn_crop_control = true;
				return;
			}
		});

		if (show_nn_crop_control && !this.overlay_crop_display_control_menu_el) {
			this.overlay_crop_display_control_menu_el = $(
				'<div class="menu_line overlay_menu_ctrl"><label for="video_overlay_input_crop_cb_' +
					this.panel.n +
					'">' +
					'<input type="checkbox"' +
					(this.display_overlay_input_crop ? " checked" : "") +
					' id="video_overlay_input_crop_cb_' +
					this.panel.n +
					'" title="Display overlay input cropping"> Highlight overlay input area</label></div>',
			);
			this.overlay_crop_display_control_menu_el.insertBefore(
				$("#close_panel_menu_" + this.panel.n),
			);

			let that = this;
			$("#video_overlay_input_crop_cb_" + this.panel.n).change((ev) => {
				if ($(ev.target).prop("checked")) {
					that.display_overlay_input_crop = true;
					that.panel.ui.updateUrlHash();
				} else {
					that.display_overlay_input_crop = false;
					that.panel.ui.updateUrlHash();
				}

				Object.keys(that.overlays).forEach((topic) => {
					if (that.overlays[topic].container_el) {
						if (that.display_overlay_input_crop)
							that.overlays[topic].container_el.addClass("display_crop");
						else
							that.overlays[topic].container_el.removeClass("display_crop");
					}
				});
			});
		} else if (!show_nn_crop_control && this.overlay_crop_display_control_menu_el) {
			this.overlay_crop_display_control_menu_el.remove();
			this.overlay_crop_display_control_menu_el = null;
		}
	}

	onOverlayData(topic, data) {
		if (this.panel.paused) return;

		if (!this.overlays[topic] || !this.overlays[topic].svg) return; //not yet initiated

		let svg = this.overlays[topic].svg;
		svg.selectAll("rect").remove();
		svg.selectAll("text").remove();

		if (!data || !data.detections || !data.detections.length) return;

		for (let i = 0; i < data.detections.length; i++) {
			let d = data.detections[i];
			let labels = [];
			let distances = [];
			for (let j = 0; j < d.results.length; j++) {
				let c = d.results[j].hypothesis.class_id;
				let l = "Class " + c;
				if (
					this.overlays[topic].config &&
					this.overlays[topic].config["label_map"] &&
					this.overlays[topic].config["label_map"][c]
				)
					l = this.overlays[topic].config["label_map"][c];
				l += " (" + d.results[j].hypothesis.score.toFixed(2) + ")";

				// 3d distance
				if (d.results[j]["pose"] && d.results[j]["pose"]["pose"] && d.results[j]["pose"]["pose"]["position"] && d.results[j]["pose"]["pose"]["position"]["z"] !== undefined)
					distances.push(d.results[j]["pose"]["pose"]["position"]["z"].toFixed(2) + "m");
				else distances.push(0.0);
				labels.push(l);
			}
			// let label = labels.join("<br/>\n");

			let sx = this.overlays[topic].display_w / this.overlays[topic].nn_w;
			let sy = this.overlays[topic].display_h / this.overlays[topic].nn_h;

			let bbcx = d.bbox.center.position.x * sx;
			let bbcy = d.bbox.center.position.y * sy;

			// console.log('d.bbox.center.position=['+d.bbox.center.position.x + ';'+ d.bbox.center.position.y+'] s=['+sx+';'+sy+']')

			let bb_size_x = d.bbox.size_x != undefined ? d.bbox.size_x : d.bbox.size.x; // 3d has size.x/y
			let bb_size_y = d.bbox.size_y != undefined ? d.bbox.size_y : d.bbox.size.y;

			let bbwidth = bb_size_x * sx;
			let bbheight = bb_size_y * sy;
			let bbleft = bbcx - bbwidth / 2.0;
			let bbtop = bbcy - bbheight / 2.0;

			// console.log('bb=['++']')

			let centerpath = svg
				.append("rect")
				.attr("x", bbcx - 5)
				.attr("y", bbcy - 5)
				.attr("width", 10)
				.attr("height", 10)
				.style("fill", "magenta");
			let boxpath = svg
				.append("rect")
				.attr("x", bbleft)
				.attr("y", bbtop)
				.attr("width", bbwidth)
				.attr("height", bbheight)
				.style("stroke", "magenta")
				.style("fill", "none")
				.style("stroke-width", 2);
			for (let j = 0; j < labels.length; j++) {
				svg.append("text")
					.attr("class", "detection-res")
					.attr("x", bbleft + 5.0)
					.attr("y", bbtop + 5.0 + 15.0)
					.style("stroke", "white")
					.style("fill", "white")
					.style("font-size", 20)
					.attr("dy", j * 2 + "em")
					.text(labels[j]);

				if (distances[j] > 0.0) {
					svg.append("text")
						.attr("class", "detection-res")
						.attr("x", bbleft + 5.0)
						.attr("y", bbtop + 5.0 + 15.0)
						.style("stroke", "yellow")
						.style("fill", "white")
						.style("font-size", 20)
						.attr("dy", j * 2 + 1 + "em")
						.text(distances[j]);
				}
			}
		}

		this.clearOverlayOnTimeout(topic);
	}

	clearOverlayOnTimeout(topic) {
		if (this.clear_overlays_timeout[topic])
			clearTimeout(this.clear_overlays_timeout[topic]);

		let that = this;
		this.clear_overlays_timeout[topic] = setTimeout(() => {
			if (that.panel.paused) {
				//don't clear while paused
				that.clearOverlayOnTimeout(topic);
				return;
			}

			if (that.overlays[topic]) {
				let svg = this.overlays[topic].svg;
				svg.selectAll("rect").remove();
				svg.selectAll("text").remove();
			}
		}, 300);
	}

	clearOverlay(topic) {
		if (this.overlays[topic]) {
			console.log("Removing overlay", this.overlays[topic]);
			let client = this.panel.ui.client;
			if (this.overlays[topic].container_el) {
				this.overlays[topic].container_el.remove();
			}
			if (this.overlays[topic].configUpdateCb) {
				client.removeTopicConfigHandler(
					topic,
					this.overlays[topic].configUpdateCb,
				);
			}
			delete this.overlays[topic];
		}
		this.renderOverlayMenuControls();
	}

	getUrlHashParts(out_parts) {
		this.overlay_sources.getUrlHashParts(out_parts);
		out_parts.push("crp=" + (this.display_overlay_input_crop ? "1" : "0"));
	}

	parseUrlParts(custom_url_vars) {
		if (!custom_url_vars) return;
		this.overlay_sources.parseUrlParts(custom_url_vars);

		custom_url_vars.forEach((kvp) => {
			let arg = kvp[0];
			let val = kvp[1];
			switch (arg) {
				case "crp":
					this.display_overlay_input_crop = parseInt(val) == 1;
					break;
			}
		});
	}

	updateFps() {
		if (this.video_stats_el && this.video_stats_el.hasClass("enabled"))
			this.video_stats_el.html(this.last_video_stats_string);

		return this.panel.fps.toFixed(0) + " FPS"; // set in ui.updateAllVideoStats
	}
}
