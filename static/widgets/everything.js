import { DescriptionTFWidget } from './description-tf.js'
import { MultiTopicSource } from "./inc/multitopic.js";
import * as THREE from 'three';
import { lerpColor } from '../lib.js'

export class Everything3DWidget extends DescriptionTFWidget {

    static label = 'Everything (3D)';
    static default_width = 8;
    static default_height = 6;
    
    constructor(panel) {
        super(panel);

        // this.laser_msg_type = 'sensor_msgs/msg/LaserScan';
        // this.rage_msg_type = 'sensor_msgs/msg/Range';
        // this.costmap_msg_type = '';

        let that = this;

        this.sources.add('sensor_msgs/msg/LaserScan', 'Lidar source', null, -1, this.on_laser_data);
        this.sources.add('sensor_msgs/msg/Range', 'Range source', null, -1, this.on_range_data);
        this.sources.add('nav_msgs/msg/OccupancyGrid', 'Costmap source', null, 1, this.on_costmap_data);

        // this.sources = new MultiTopicSource(this);

        this.range_visuals = {};

        panel.widget_menu_cb = () => {
            that.setupMenu();
        }
    }

    on_laser_data = (scan) => {

    }

    on_range_data = (range) => {

        let frame_id = range.header.frame_id;
        let f = this.robot.getFrame(frame_id);

        if (!this.range_visuals[frame_id]) {
            let a_tan = Math.tan(range.field_of_view/2.0);
            let r = a_tan * range.max_range * 2.0;
            const geometry = new THREE.ConeGeometry(r, range.max_range, 32); 
            geometry.rotateZ(90 * Math.PI/180);
            geometry.translate(range.max_range/2.0, 0, 0);
            let color = new THREE.Color(0xffff00);
            const material = new THREE.MeshBasicMaterial( {color: color} );
            const cone = new THREE.Mesh(geometry, material );
            this.range_visuals[frame_id] = {
                cone: cone,
                color: color,
                material: material
            };
            f.add(cone);
        }

        
        // let s = range.max_range / range.range;
        let gageVal = (Math.min(Math.max(range.range, 0), range.max_range) * 100.0 / range.max_range);
        gageVal = gageVal / 100.0;
        let color = null;
        if (gageVal < 0.5)
            color = lerpColor('#ff0000', '#2696FB', gageVal*2.0);
        else
            color = lerpColor('#2696FB', '#ffffff', (gageVal-0.5)*2.0); 

        if (range.range < range.max_range-0.001) {
            this.range_visuals[frame_id].material.color.set(color);
            this.range_visuals[frame_id].cone.scale.set(gageVal,gageVal,gageVal);
        } else {
            this.range_visuals[frame_id].cone.scale.set(0,0,0);
        }
        
        
        // console.log('got range for '+frame_id, range, f);
    }

    on_costmap_data = (costmap) => {
        
    }

    setupMenu () {
        super.setupMenu();

        // this.sources.makeEmptyButton('', this.laser_msg_type);
        // this.sources.makeEmptyButton('', this.rage_msg_type,);
        // this.sources.makeEmptyButton('', this.costmap_msg_type);
    }
}