import { MultiTopicSource } from "../inc/multitopic.js";
import { SingleTypePanelWidgetBase } from "../inc/single-type-widget-base.js";

// Video panel with possible overlays

export class VideoWidget extends SingleTypePanelWidgetBase {
	
	static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 12;
	static HANDLED_MSG_TYPES = [ 'video',
								 'sensor_msgs/msg/Image',
								 'sensor_msgs/msg/CompressedImage',
								 'ffmpeg_image_transport_msgs/msg/FFMPEGPacket'
								];

	constructor(panel, topic, unused_widget_css_class, plugin_classes) {
		super(panel, topic, 'video');

		this.widget_el.html('<video id="panel_video_' + panel.n + '" autoplay="true" playsinline="true" muted="true" preload="metadata"></video>' + //muted allows video autoplay in chrome before user interactions
				  			'<span id="video_stats_' + panel.n + '" class="video_stats"></span>' +
				  			'<div id="video_overlay_' + panel.n + '" class="video_overlay"></div>'
				 			); // the muted flag allows video autoplay in chrome before any user interactions

		this.overlay_el = $("#video_overlay_" + panel.n);
		this.last_video_stats_string = "";
		this.last_video_packets_lost = 0;
		this.last_video_frames_dropped = 0;
		this.video_stats_enabled = this.panel.getPanelVarAsBool('st', false);
		this.last_video_freeze_count = 0;
		this.video_stats_el = $("#video_stats_" + panel.n);
		if (this.video_stats_enabled)
			this.video_stats_el.addClass("enabled");

		this.videoWidth = -1;
		this.videoHeight = -1;

		let that = this;

		let video_el = document.getElementById("panel_video_" + panel.n);

		video_el.onloadedmetadata = () => {
			video_el.play().catch((e) => console.error("Play failed:", e));
		};

		video_el.addEventListener("resize", () => {
			// Safari sometimes doesn't load meta properly => wait for actual dimensions
			if (that.videoWidth != -1 || that.videoHeight != -1) return;

			if (!video_el.videoWidth || !video_el.videoHeight) {
				console.log("Invalid video metadata loaded, ignoring; w, h = ", video_el.videoWidth, video_el.videoHeight);
				return;
			}

			console.log("Video meta loaded:", video_el.videoWidth, video_el.videoHeight);
			that.videoWidth = video_el.videoWidth;
			that.videoHeight = video_el.videoHeight;

			Object.values(this.plugins).forEach((p)=>{
				if (p.onResize)
					p.onResize();
			});
		});

		document.getElementById("panel_video_" + panel.n).addEventListener("error", (ev) => {
			console.log("(Assigned) Stream error", ev);
		});

		this.panel.setMediaStream();

		this.overlay_topics = {};
		this.next_overlay_id = 0;

		this.sources = new MultiTopicSource(this);
		this.sources.on("change", (topics) => that.onSourcesChange(topics));

		this.plugins = {};
		if (Array.isArray(plugin_classes)) { 
			plugin_classes.forEach((pluginClass)=>{
				console.log('Video loading plugin:', pluginClass.name);
				that.plugins[pluginClass.name] = new pluginClass(that);
				that.sources.add(
					pluginClass.SOURCE_TOPIC_TYPE,
					pluginClass.SOURCE_DESCRIPTION,
					pluginClass.SOURCE_DEFAULT_TOPIC,
					pluginClass.SOURCE_MAX_NUM,
					// onData
					(topic, msg) => {
						if (!that.overlay_topics[topic])
							return;
						that.plugins[pluginClass.name].onTopicData(topic, msg)
					},
					// onSourceRemoved
					(topic) => {
						that.plugins[pluginClass.name].clearTopic(topic);
						delete that.overlay_topics[topic];
					},
				);
			});
		}

		this.sources.loadAssignedTopicsFromPanelVars(); // init sources

		this.onSourcesChange(this.sources.getSources());		
	}

	onSourcesChange(source_topics) {
		console.log('Video sources changed: ', source_topics);
		let that = this;
		let client = this.panel.ui.client;

		source_topics.forEach((topic) => {
			if (that.overlay_topics[topic])
				return;
			
			Object.values(that.plugins).forEach((p) => {
				if (client.discovered_topics[topic] && p.constructor.SOURCE_TOPIC_TYPE == client.discovered_topics[topic].msg_type) {
					if (p.addTopic)
						p.addTopic(topic);
					that.overlay_topics[topic] = true;
				}
			});
		});	

		this.panel.setMenu();
	}

	setupMenu(menu_els) {

		this.sources.setupMenu(menu_els, "Overlay");

		//stats menu toggle
		let stats_menu_line_el = $('<div class="menu_line"></div>');
		let stats_cb_label_el = $('<label for="video_stats_cb_' + this.panel.n + '" class="video_stats_cb_label" id="video_stats_cb_label_' + this.panel.n + '">Stats for nerds</label>');
		let stats_cb = $('<input type="checkbox" id="video_stats_cb_' + this.panel.n + '" class="video_stats_cb" title="Display video stats"/>');
		stats_cb.attr('checked', this.video_stats_enabled);
		stats_cb_label_el.append(stats_cb).appendTo(stats_menu_line_el);
		menu_els.push(stats_menu_line_el);

		let that = this;
		stats_cb.change(function (ev) {
			that.video_stats_enabled = $(this).prop("checked")
			that.panel.storePanelVarAsBool('st', that.video_stats_enabled);
			if (that.video_stats_enabled) {
				that.video_stats_el.html(that.last_video_stats_string);
				that.video_stats_el.addClass("enabled");
			} else {
				that.video_stats_el.removeClass("enabled");
			}
		});	

		Object.values(this.plugins).forEach((p)=>{
			if (p.setupMenu)
				p.setupMenu(menu_els);
		});
	}

	getFpsString() {
		if (this.video_stats_el && this.video_stats_el.hasClass("enabled"))
			this.video_stats_el.html(this.last_video_stats_string);

		return this.panel.fps.toFixed(0) + " FPS"; // set in ui.updateAllVideoStats
	}

	onClose() {
		super.onClose();
		this.overlay_topics = {};
		Object.values(this.plugins).forEach((p)=>{
			if (p.clearAllTopics)
				p.clearAllTopics();
		});
	}
}
