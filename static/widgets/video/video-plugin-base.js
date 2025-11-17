export class VideoPuginBase {
    static SOURCE_TOPIC_TYPE = 'some_msgs/msg/TopicType';
    static SOURCE_DESCRIPTION = 'Describe topic type';  
    static SOURCE_DEFAULT_TOPIC = null; // some default topic, maybe
    static SOURCE_MAX_NUM = -1; // limit the number of sources to be allowed to use

    constructor(video) {
        this.video = video;
        this.client = this.video.client;
        this.panel = this.video.panel;
        this.ui = this.video.panel.ui;

        this.overlays = {}; // topic => custom overlay data
    }

    addTopic(topic) {
        if (!this.overlays[topic])
			this.overlays[topic] = {};
    }

    setupMenu(menu_els) {

    }

    onResize() {

    }

    onTopicData(topic, msg) {

    }

    clearVisuals(topic) {
        // remove visuals 
        // make sure new ones are created in the correct frame and seup
        // on new config in onTopicData()
    }

    // clear one topic
    clearTopic(topic) {
        this.clearVisuals(topic);
        delete this.overlays[topic];
    }

    clearAllTopics() {
        let topics = Object.keys(this.overlays);
        let that = this;
        topics.forEach((topic)=>{
            that.clearTopic(topic);
        });
    }
}