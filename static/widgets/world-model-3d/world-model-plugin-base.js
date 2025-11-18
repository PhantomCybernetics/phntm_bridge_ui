export class WorldModel3DPuginBase {

    /**
     * Source topic message type
     * @static
     * @type {string}
     */
    static SOURCE_TOPIC_TYPE = 'some_msgs/msg/TopicType';
    /**
     * Source description to show in the overlay selector
     * @static
     * @type {string}
     */
    static SOURCE_DESCRIPTION = 'Describe topic type';  
    /**
     * Default topic to select
     * @static
     * @type {string?}
     * @default null
     */
    static SOURCE_DEFAULT_TOPIC = null; // some default topic, maybe
    /**
     * The maximum number of topics this plugin can handle, -1=unlimited
     * @static
     * @type {int}
     * @default -1
     */
    static SOURCE_MAX_NUM = -1; // limit the number of sources to be allowed to use

    /** 
     * Plugin constructor, make sure to call super(world_model)
     * @constructs WorldModel3DPuginBase
     * @param {WorldModel3DWidget} world_model - widget instance reference
     */
    constructor(world_model) {
        /**
         * Widget reference
         * @type {WorldModel3DWidget}
         */
        this.world_model = world_model;
        /**
         * BridgeClient reference
         * @type {BridgeClient}
         */
        this.client = this.world_model.client;
        /**
         * Panel reference
         * @type {Panel}
         */
        this.panel = this.world_model.panel;
        /**
         * UI reference
         * @type {PanelUI}
         */
        this.ui = this.world_model.panel.ui;
        /**
         * Custom overlay data by topic
         * @type {Object}
         */
        this.overlays = {}; 
    }

    /** 
     * Add topic to this plugin.
     * Called when the user selects a new topic as overlay input.
     * @param {string} topic - topic id to add
     * @virtual
     */
    addTopic(topic) {
        if (!this.overlays[topic])
			this.overlays[topic] = {};
    }

    /** 
     * Setup menu items by adding new lines into the provided menu_els container.
     * @param {jQuery} menu_els - in/out menu elements
     */
    setupMenu(menu_els) {

    }

    /** 
     * Called when data for the topic is received.
     * @param {string} topic - topic id
     * @param {MsgType} msg - message data
     */
    onTopicData(topic, msg) {
        // you receive your data here
    }

    /** 
     * Called from the widget's rendering loop.
     */
    onRender() {
    }

    /** 
     * Called on panel/window resize
     */
    onResize() {
    }

    /** 
     * Remove all visuals for the topic here.
     * @param {string} topic - topic id
     */
    clearVisuals(topic) {
    }

    /** 
     * Clear one topic and all its visuals.
     * @param {string} topic - topic id
     */
    clearTopic(topic) {
        this.clearVisuals(topic);
        delete this.overlays[topic];
    }

    /** 
     * Clear all topics.
     */
    clearAllTopics() {
        let topics = Object.keys(this.overlays);
        let that = this;
        topics.forEach((topic)=>{
            that.clearTopic(topic);
        });
    }

    /** 
     * Called when robot's URDF model is removed of updated.
     */
    onModelRemoved() {
        let topics = Object.keys(this.overlays);
        topics.forEach((topic) => {
            this.clearVisuals(topic);
        });
    }
}