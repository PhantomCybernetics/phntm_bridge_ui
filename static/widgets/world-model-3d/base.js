import { DescriptionTFWidget } from "../inc/description-tf.js";
import { MultiTopicSource } from "../inc/multitopic.js";

export class WorldModel3DWidget extends DescriptionTFWidget {
	static label = "World Model 3D";
	static default_width = 5;
	static default_height = 18;

	constructor(panel, widget_conf) {
		super(panel, null, false); // don't start rendering loop yet

		let that = this;

		$("#panel_title_" + panel.n).text(WorldModel3DWidget.label);

		this.overlays = {};
		this.sources.on("change", (topics) => this.onSourcesChange(topics));

		// load plugins that add topic sources to multitopic
		this.plugins = {};
		if (Array.isArray(widget_conf)) { 
			widget_conf.forEach((pluginClass)=>{
				console.log('World Model loading plugin:', pluginClass.name);
				that.plugins[pluginClass.name] = new pluginClass(that);
				that.sources.add(
					pluginClass.source_topic_type,
					pluginClass.source_description,
					pluginClass.source_default_topic,
					pluginClass.source_max_num,
					(topic, msg) => that.plugins[pluginClass.name].onTopicData(topic, msg),
					(topic) => {
						that.plugins[pluginClass.name].clearTopic(topic);
						if (that.overlays[topic].configUpdateCb) {
							that.panel.ui.client.removeTopicConfigHandler(topic, that.overlays[topic].configUpdateCb);
						}
						delete that.overlays[topic];
					},
				);
			});
		}

		this.sources.loadAssignedTopicsFromPanelVars(); // init sources unhandled by parent

		this.base_link_frame = null;
		
		this.onSourcesChange(this.sources.getSources());

		this.rendering = true;
		this.renderDirty();
		requestAnimationFrame((t) => this.renderingLoop());
	}

	onSourcesChange(source_topics) {
		let that = this;
		let client = this.panel.ui.client;

		source_topics.forEach((topic) => {
			if (!that.overlays[topic]) { // add topic config listener
				that.overlays[topic] = {};
				that.overlays[topic].configUpdateCb = (config) => {
					console.warn("onTopicConfigUpdate", topic, config);
					that.overlays[topic].config = config;
					Object.values(that.plugins).forEach((p) => {
						if (client.discovered_topics[topic] && p.constructor.source_topic_type == client.discovered_topics[topic].msg_type) {
							if (p.onTopicConfig)
								p.onTopicConfig(topic, config);
						}
					});
					that.panel.setMenu();
				};
				client.onTopicConfig(topic, that.overlays[topic].configUpdateCb);
			}
			that.panel.setMenu();
		});	

		this.panel.setMenu();
	}

	renderingLoop() {
		if (!this.rendering) return;

		// render all plugins
		Object.values(this.plugins).forEach((p)=>{
			if (p.onRender)
				p.onRender();
		});

		super.renderingLoop(); //description-tf render
	}

	onModelRemoved() {
		super.onModelRemoved();

		this.base_link_frame = null;

		Object.values(this.plugins).forEach((p)=>{
			p.clearAllTopics();
		});
	}

	setupMenu(menu_els) {
		super.setupMenu(menu_els); // calls this.ources.setupMenu();

		Object.values(this.plugins).forEach((p)=>{
			if (p.setupMenu)
				p.setupMenu(menu_els);
		});
	}
}
