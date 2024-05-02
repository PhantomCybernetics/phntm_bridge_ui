import { DescriptionTFWidget } from './description-tf.js'
import { MultiTopicSource } from "./inc/multitopic.js";
import * as THREE from 'three';
import { lerpColor, deg2rad } from '../lib.js'

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

        this.addEventListener('pg_updated', this.on_pg_updated);

        this.sources.add('sensor_msgs/msg/LaserScan', 'Lidar source', null, -1, this.on_laser_data, this.clear_laser);
        this.sources.add('sensor_msgs/msg/Range', 'Range source', null, -1, this.on_range_data, this.clear_range);
        this.sources.add('nav_msgs/msg/OccupancyGrid', 'Costmap source', null, 1, this.on_costmap_data);

        this.parseUrlParts(this.panel.custom_url_vars);
        
        // this.sources = new MultiTopicSource(this);

        this.range_visuals = {};
        this.laser_visuals = {};
        this.laser_data_queue = {};
        this.laser_frames = {};
        this.base_link_frame = null;
        
        panel.widget_menu_cb = () => {
            that.setupMenu();
        }
    }
    
    on_model_removed() {
        super.on_model_removed();
        let laser_topics = Object.keys(this.laser_visuals).concat(Object.keys(this.laser_frames));
        console.log('Robot removed, clearing laser topics', laser_topics)
        laser_topics.forEach((topic) => {
            this.clear_laser(topic);
        });
        let range_topics = Object.keys(this.range_visuals);
        range_topics.forEach((topic) => {
            this.clear_range(topic);
        });
    }

    on_laser_data = (topic, scan) => {

        // console.log('Has laser!');

        if (!this.robot || this.panel.paused) {
            // console.log('!');
            return;
        }

        let scan_ns_stamp = scan.header.stamp.sec*1000000000 + scan.header.stamp.nanosec;

        let frame_id = scan.header.frame_id;

        if (!this.laser_frames[frame_id]) 
            this.laser_frames[frame_id] = this.robot.getFrame(frame_id);

        if (!this.laser_frames[frame_id]) {
            console.error('Frame '+frame_id+' not found in robot model for laser data');
            return;
        }

        if (!this.base_link_frame) 
            this.base_link_frame = this.robot.getFrame('base_link');

        if (!this.base_link_frame) {
            console.error('Frame base_link not found in robot model for laser data');
            return;
        }

        // let base_to_laser_mat = this.base_link_frame.matrixWorld.clone()
        //                             .invert()
        //                             .multiply(this.laser_frames[frame_id].matrixWorld);

        let laser_points = [];
        const rot_axis = new THREE.Vector3(0, 0, 1); // +z is up
        const center = new THREE.Vector3(0, 0, 0);

        for (let i = 0; i < scan.ranges.length; i++)  {
            let dist = scan.ranges[i];
            if (dist === null || dist > scan.range_max || dist < scan.range_min) 
                continue;

            let p = new THREE.Vector3(dist, 0, 0);
            p.applyAxisAngle(rot_axis, scan.angle_min + (i * scan.angle_increment));

            laser_points.push(center);
            laser_points.push(p);
        };

        if (!this.laser_visuals[topic]) {
    
            let color = new THREE.Color(0x00ffff);
            const material = new THREE.LineBasicMaterial( {color: color, transparent: true, opacity: .85 } );
          
            this.laser_geometry = new THREE.BufferGeometry().setFromPoints( laser_points );

            this.laser_visuals[topic] = new THREE.LineSegments(this.laser_geometry, material);
            this.laser_frames[frame_id].add(this.laser_visuals[topic]);
    
        } else {
            
            this.laser_geometry.setFromPoints( laser_points );

        }
        
        // let mat = base_to_laser_mat;

        // let pos = new THREE.Vector3().setFromMatrixPosition(mat);
        // let rot = new THREE.Quaternion().setFromRotationMatrix(mat);

        // this.laser_visuals[topic].quaternion.copy(rot);
        // this.laser_visuals[topic].position.copy(pos);

        //put scan to queue
        // if (!this.laser_data_queue[topic])
        //     this.laser_data_queue[topic] = [];
        // this.laser_data_queue[topic].push({
        //     ns_stamp: scan_ns_stamp,
        //     msg: scan
        // });

        // let latest_base_pg_stamp = this.get_latest_pg_ns_stamp();
        // if (latest_base_pg_stamp !== NaN && scan_ns_stamp <= latest_base_pg_stamp) {
        //    this.render_queued_laser_data(topic, latest_base_pg_stamp); //render now with closest pg 
        // }

        // this.render_queued_laser_data(topic);

        // console.log('3d laser render dirty, this.rendering='+this.rendering)

        this.render_dirty = true;
    }


    on_pg_updated = (e) => {
        // console.log('on_pg_updated', e);
        // this.render_queued_laser_data(e.detail.topic, e.detail.pg_node.ns_stamp);
    }

    clear_laser = (topic) => {
        if (this.laser_visuals[topic]) {
            this.laser_visuals[topic].removeFromParent();
            delete this.laser_visuals[topic];
        }
        if (this.laser_frames[topic]) {
            delete this.laser_frames[topic];
        }
    }

    on_range_data = (topic, range) => {
        if (!this.robot || this.panel.paused)
            return;

        let frame_id = range.header.frame_id;
        let f = this.robot.getFrame(frame_id);
        if (!f) {
            console.error('Frame '+frame_id+' not found in robot model for range data');
            return;
        }
            
        if (!this.range_visuals[topic]) {
            let a_tan = Math.tan(range.field_of_view/2.0);
            let r = a_tan * range.max_range * 2.0;
            const geometry = new THREE.ConeGeometry(r, range.max_range, 32); 
            geometry.rotateZ(90 * Math.PI/180);
            geometry.translate(range.max_range/2.0, 0, 0);
            let color = new THREE.Color(0xffff00);
            const material = new THREE.MeshBasicMaterial( {color: color, transparent: true, opacity: .85 } );
            const cone = new THREE.Mesh(geometry, material );
            this.range_visuals[topic] = {
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
            this.range_visuals[topic].material.color.set(color);
            this.range_visuals[topic].cone.scale.set(gageVal,gageVal,gageVal);
        } else {
            this.range_visuals[topic].cone.scale.set(0,0,0);
        }
        
        this.render_dirty = true;
        // console.log('got range for '+frame_id, range, f);
    }

    clear_range = (topic) => {
        if (this.range_visuals[topic]) {
            this.range_visuals[topic].cone.removeFromParent();
            delete this.range_visuals[topic];
        }
    }

    on_costmap_data = (topic, costmap) => {
        
    }

    // getUrlHashParts (out_parts) {
    //     super.getUrlHashParts(out_parts);
    // }

    setupMenu () {
        super.setupMenu();

        // this.sources.makeEmptyButton('', this.laser_msg_type);
        // this.sources.makeEmptyButton('', this.rage_msg_type,);
        // this.sources.makeEmptyButton('', this.costmap_msg_type);
    }
}