import { DescriptionTFWidget } from './description-tf.js'
import { MultiTopicSource } from "./inc/multitopic.js";

export class Everything3DWidget extends DescriptionTFWidget {

    static label = 'Everything (3D)';
    static default_width = 8;
    static default_height = 6;

    constructor(panel) {
        super(panel);

        this.laser_msg_type = 'sensor_msgs/msg/LaserScan';
        this.rage_msg_type = 'sensor_msgs/msg/Range';
        this.costmap_msg_type = 'nav_msgs/msg/OccupancyGrid';

        let that = this;

        this.sources = new MultiTopicSource(this);

        panel.widget_menu_cb = () => {
            that.setupMenu();
        }
    }

    setupMenu () {
        super.setupMenu();

        this.sources.makeEmptyButton('Lidar source', this.laser_msg_type);
        this.sources.makeEmptyButton('Range source', this.rage_msg_type,);
        this.sources.makeEmptyButton('Cost map source', this.costmap_msg_type);
    }
}