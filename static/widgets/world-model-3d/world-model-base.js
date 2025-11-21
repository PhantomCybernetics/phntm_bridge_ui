import { DescriptionTFWidget } from "../inc/description-tf.js";
import { MultiTopicSource } from "../inc/multitopic.js";

export class WorldModel3DWidget extends DescriptionTFWidget {
	static LABEL = "World Model 3D";
	static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 18;

	constructor(panel, unused_widget_css_class, plugin_classes) {
		super(panel, 'description-tf', false); // don't start rendering loop yet

		let that = this;

		//$("#panel_title_" + panel.n).text(WorldModel3DWidget.label);

		this.overlay_topics = {};
		this.sources.on("change", (topics) => this.onSourcesChange(topics));

		// load plugins that add topic sources to multitopic
		this.plugins = {};
		if (Array.isArray(plugin_classes)) { 
			plugin_classes.forEach((pluginClass)=>{
				console.log('World Model loading plugin:', pluginClass.name);
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

		this.sources.loadAssignedTopicsFromPanelVars(); // init sources unhandled by parent

		this.base_link_frame = null;
		
		this.onSourcesChange(this.sources.getSources());

		this.rendering = true;
		this.renderDirty();
		requestAnimationFrame((t) => this.renderingLoop());
	}

	onSourcesChange(source_topics) {
		console.log('WorldModel sources changed: ', source_topics);
		let that = this;
		let client = this.panel.ui.client;

		source_topics.forEach((topic) => {
			if (that.overlay_topics[topic])
				return;
			
			Object.values(that.plugins).forEach((p) => {
				if (client.discovered_topics[topic] && p.constructor.SOURCE_TOPIC_TYPE == client.discovered_topics[topic].msg_type) {
					if (p.addTopic)
						p.addTopic(topic);
					that.overlay_topics[topic] = {};
				}
			});
		});	

		this.panel.updateMenu();
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
			p.onModelRemoved();
		});
	}

	setupMenu(menu_els) {
		super.setupMenu(menu_els); // calls this.sources.setupMenu();

		Object.values(this.plugins).forEach((p)=>{
			if (p.setupMenu)
				p.setupMenu(menu_els);
		});
	}

	onClose() {
		super.onClose();
		this.overlay_topics = {};
		Object.values(this.plugins).forEach((p)=>{
			if (p.clearAllTopics)
				p.clearAllTopics();
		});
	}

	onResize() {
		super.onResize();

		Object.values(this.plugins).forEach((p)=>{
			if (p.onResize)
				p.onResize();
		});
	}
}
