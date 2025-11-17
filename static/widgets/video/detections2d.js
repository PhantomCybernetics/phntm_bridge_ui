import * as THREE from "three";

export class VideoWidget_Detections2D {
    static source_topic_type = 'vision_msgs/msg/Detection2DArray';
    static source_description = 'Detection 2D Array';   
    static source_default_topic = null;
    static source_max_num = -1;

    constructor(video) {
        this.video = video;
		this.overlays = {}; // topic => { }
        this.display_overlay_input_crop = this.video.panel.getPanelVarAsBool('cr', false);
		this.display_labels = this.video.panel.getPanelVarAsBool('lbl', true);
		this.clear_overlays_timeout = {};
		this.detection_class_colors = {}; // topic => [ color, color, ... ]
		this.magenta = new THREE.Color(0xff00ff);
    }

	addTopic(topic) {
		this.detection_class_colors[topic] = [];
		let config = this.video.client.getTopicConfig(topic);

		if (!config)
			console.error('Detections2D got empty config for '+ topic);

		if (config && config.color_map !== undefined) {
			for (let class_id = 0; class_id < config.color_map.length; class_id++) {
				let c = config.color_map[class_id];
				if (!c || ['null', 'none', 'no', '', 'model'].indexOf(c.toLowerCase().trim()) != -1)
					c = this.magenta;
				else
					c = new THREE.Color(c);
				this.detection_class_colors[topic][class_id] = c;
			}
		}
			
		this.setupOverlay(topic, config);
	}

	setupOverlay(topic, config) {
		if (!this.overlays[topic])
			this.overlays[topic] = {};

		console.warn('SETUP OVERLAY for ' + topic, config);

		if (config) {
			if (config["input_width"] && config["input_height"]) {
				this.overlays[topic].nn_w = config["input_width"];
				this.overlays[topic].nn_h = config["input_height"];
				this.overlays[topic].overlay_aspect = config["input_width"] / config["input_height"];
			} else {
				this.overlays[topic].overlay_aspect = -1;
			}
			this.overlays[topic].config = config;
		} else if (!this.overlays[topic].config) {
			return;
		}

		if (this.video.videoWidth < 0 || this.video.videoHeight < 0)
			return; // wait, video dimenstions still unknown

		if (this.overlays[topic].overlay_aspect > -1) {
			let w = this.video.videoHeight * this.overlays[topic].overlay_aspect;
			if (w <= this.video.videoWidth) {
				this.overlays[topic].display_w = w;
				this.overlays[topic].display_h = this.video.videoHeight;
			} else {
				this.overlays[topic].display_w = this.video.videoWidth;
				this.overlays[topic].display_h =
					this.video.videoWidth / this.overlays[topic].overlay_aspect;
			}
		} else {
			this.overlays[topic].display_w = this.video.videoWidth;
			this.overlays[topic].display_h = this.video.videoHeight;
		}

		this.overlays[topic].xoff = (this.video.videoWidth - this.overlays[topic].display_w) / 2.0;

		if (this.overlays[topic].container_el) {
			// let svg = this.overlays[topic].svg.select(function() { return this.parentNode; })
			// svg.remove();
			this.overlays[topic].container_el.remove();
		}

		console.log("Making overlay from " + topic);
		let cont_id = "video_overlay_" + this.video.panel.n + "_" + this.video.next_overlay_id;
		this.video.next_overlay_id++;
		this.overlays[topic].container_el = $('<div class="video_overlay_cont" id="' + cont_id + '"></div>');
		this.overlays[topic].container_el.css("left", (this.overlays[topic].xoff / this.video.videoWidth) * 100 + "%");

		this.overlays[topic].container_el.appendTo(this.video.overlay_el);

		this.overlays[topic].svg = d3.select("#" + cont_id).append("svg");
		this.overlays[topic].svg
			.attr("width", (this.overlays[topic].display_w / this.video.videoWidth) * 100 + "%")
			.attr("viewBox", "0 0 " + this.overlays[topic].display_w + " " + this.overlays[topic].display_h)
			.append("g");
		if (this.display_overlay_input_crop)
			this.overlays[topic].container_el.addClass("display_crop");
	}

	onResize() {
		let topics = Object.keys(this.overlays);
		let that = this;
		topics.forEach((topic) => {
			that.setupOverlay(topic, null);
		});
	}

    onTopicData(topic, msg) {
        if (this.video.panel.paused) return;

		if (!this.overlays[topic] || !this.overlays[topic].svg) return; //not yet initiated

		let svg = this.overlays[topic].svg;
		svg.selectAll("rect").remove();
		svg.selectAll("text").remove();

		if (!msg || !msg.detections || !msg.detections.length) return;

		for (let i = 0; i < msg.detections.length; i++) {
			let d = msg.detections[i];
			let labels = [];
			let distances = [];
			let class_id = -1;
			for (let j = 0; j < d.results.length; j++) {
				let c = d.results[j].hypothesis.class_id;
				if (class_id < 0)
					class_id = c;
				let l = "Class " + c;
				if (this.overlays[topic].config && this.overlays[topic].config["label_map"] && this.overlays[topic].config["label_map"][c])
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

			let c = this.detection_class_colors[topic][class_id] ? '#'+this.detection_class_colors[topic][class_id].getHexString() : 'magenta';

			// center square
			svg.append("rect")
			   .attr("x", bbcx - 5)
			   .attr("y", bbcy - 5)
			   .attr("width", 10)
			   .attr("height", 10)
			   .style("fill", c);
			// box
			svg.append("rect")
			   .attr("x", bbleft)
			   .attr("y", bbtop)
			   .attr("width", bbwidth)
			   .attr("height", bbheight)
			   .style("stroke", c)
			   .style("fill", "none")
			   .style("stroke-width", 3);
			
			if (this.display_labels) {
				for (let j = 0; j < labels.length; j++) {

					svg.append("rect")
						.attr('id', 'bg-'+i+'-'+j)
						.attr("class", "detection-res-bg")
						.attr("x", bbleft-5)
						.attr("y", bbtop-5)
						.attr("width", 0)
						.attr("height", 0)
						//.style("stroke", c)
						.style("fill", "#000000ad")
						//.style("stroke-width", 3);

					svg.append("text") // class label(s)
						.attr("class", "detection-res")
						.attr('id', 'label-'+i+'-'+j)
						.attr("x", bbleft + 5.0)
						.attr("y", bbtop + 5.0 + 15.0)
						.style("stroke", "white")
						.style("fill", "white")
						.style("font-size", 20)
						.attr("dy", j * 2 + "em")
						.text(labels[j]);
						
					// if (distances[j] > 0.0) { // z-distance, if present and non-zero
					// 	svg.append("text")
					// 		.attr("class", "detection-res")
					// 		.attr("x", bbleft + 5.0)
					// 		.attr("y", bbtop + 5.0 + 15.0)
					// 		.style("stroke", "yellow")
					// 		.style("fill", "white")
					// 		.style("font-size", 20)
					// 		.attr("dy", j * 2 + 1 + "em")
					// 		.text(distances[j]);
					// }
				}
			}
		}

		svg.selectAll("text").each(function(d) {
			//d.bbox = this.getBBox();
			let bbox = this.getBBox();
			let id = this.id;
			//console.log(id, bbox.width, bbox.height);
			svg.select('#'+id.replace('label', 'bg'))
				.attr("width", bbox.width+20)
            	.attr("height", bbox.height+10)
		});

		this.eraseOverlayOnTimeout(topic);
    }

    eraseOverlayOnTimeout(topic) {
		if (this.clear_overlays_timeout[topic])
			clearTimeout(this.clear_overlays_timeout[topic]);

		let that = this;
		this.clear_overlays_timeout[topic] = setTimeout(() => {
			if (that.video.panel.paused) {
				//don't clear while paused
				that.eraseOverlayOnTimeout(topic);
				return;
			}

			if (that.overlays[topic]) {
				let svg = this.overlays[topic].svg;
				svg.selectAll("rect").remove();
				svg.selectAll("text").remove();
			}
		}, 300);
	}

    clearTopic(topic) {
		if (this.overlays[topic]) {
			console.log("Removing overlay", this.overlays[topic]);
			if (this.overlays[topic].container_el) {
				this.overlays[topic].container_el.remove();
			}
			delete this.overlays[topic];
		}
	}

	clearAllTopics() {
        let detection_topics = Object.keys(this.overlays);
		console.log("Clearing all detection topics", detection_topics);
		let that = this;
		detection_topics.forEach((topic) => {
			that.clearTopic(topic);
		});
    }

	setupMenu(menu_els) {

		if (!this.video.sources.hasType(VideoWidget_Detections2D.source_topic_type)) 
			return; // only show when topics are subscribed to
		
		let that = this;

		//this.overlay_crop_display_control_menu_el = null; //menu is empty here, force re-create

		let show_nn_crop_control = false;
		Object.keys(this.overlays).forEach((topic) => {
			if (this.overlays[topic].nn_w || this.overlays[topic].nn_h) {
				show_nn_crop_control = true;
				return;
			}
		});

		if (show_nn_crop_control) {

			let crop_line_el = $('<div class="menu_line overlay_menu_ctrl"></div>');
			let crop_label_el = $('<label for="video_overlay_input_crop_cb_' + this.video.panel.n +'">Highlight overlay input area</label>');
			let crop_inp = $('<input type="checkbox"' + (this.display_overlay_input_crop ? " checked" : "") + ' id="video_overlay_input_crop_cb_' + this.video.panel.n + '" title="Display overlay input cropping">');
			crop_inp.appendTo(crop_label_el);
			crop_label_el.appendTo(crop_line_el);

			crop_inp.change((ev) => {
				that.display_overlay_input_crop = $(ev.target).prop("checked");
				that.video.panel.storePanelVarAsBool('cr', that.display_overlay_input_crop);

				console.log('that.display_overlay_input_crop '+that.display_overlay_input_crop);
				Object.keys(that.overlays).forEach((topic) => {
					if (that.overlays[topic].container_el) {
						if (that.display_overlay_input_crop)
							that.overlays[topic].container_el.addClass("display_crop");
						else
							that.overlays[topic].container_el.removeClass("display_crop");
					}
				});
			});
			menu_els.push(crop_line_el);
		}

		let labels_line_el = $('<div class="menu_line overlay_menu_ctrl"></div>');
		let labels_label_el = $('<label for="video_overlay_input_labels_cb_' + this.video.panel.n +'">Show detection labels</label>');
		let labels_inp = $('<input type="checkbox"' + (this.display_labels ? " checked" : "") + ' id="video_overlay_input_labels_cb_' + this.video.panel.n + '" title="Show detection labels">');
		labels_inp.appendTo(labels_label_el);
		labels_label_el.appendTo(labels_line_el);
		
		labels_inp.change((ev) => {
			that.display_labels = $(ev.target).prop("checked");
			that.video.panel.storePanelVarAsBool('lbl', that.display_labels);

			if (!that.display_labels) {
				Object.keys(that.overlays).forEach((topic) => {
					that.overlays[topic].svg.selectAll("text").remove();
				});
			}
		});
		menu_els.push(labels_line_el);
		
	}
}