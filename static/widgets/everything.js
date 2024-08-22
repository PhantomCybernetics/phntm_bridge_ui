import { DescriptionTFWidget } from './description-tf.js'
import { MultiTopicSource } from "./inc/multitopic.js";
import * as THREE from 'three';
import { lerpColor, deg2rad } from '../lib.js'

export class Everything3DWidget extends DescriptionTFWidget {

    static label = 'Everything (3D)';
    static default_width = 8;
    static default_height = 6;
    
    constructor(panel) {
        super(panel, false); // don't start rendering loop yet

        // this.laser_msg_type = 'sensor_msgs/msg/LaserScan';
        // this.rage_msg_type = 'sensor_msgs/msg/Range';
        // this.costmap_msg_type = '';

        let that = this;

        this.addEventListener('pg_updated', (e) => this.on_pg_updated(e));

        this.sources.add('sensor_msgs/msg/LaserScan', 'Lidar source', null, -1, (t, s) => this.on_laser_data(t, s), (t) => this.clear_laser(t));
        this.sources.add('sensor_msgs/msg/Range', 'Range source', null, -1, (t, r) => this.on_range_data(t, r), (t) => this.clear_range(t));
        this.sources.add('nav_msgs/msg/OccupancyGrid', 'Costmap source', null, 1, (t, c) => this.on_costmap_data(t, c));

        this.parseUrlParts(this.panel.custom_url_vars);

        this.range_visuals = {};
        this.laser_visuals = {};
        this.laser_geometry = {}; //topic => 
        this.laser_data_queue = {};
        this.latest_scan_data_stamps = {}; // topic => latest processed stamp
        this.scan_older_stamp_drops = {}; // topic => num
        this.laser_frames = {};
        this.dirty_laser_points = {}; // topic => vector3[]
        this.clear_laser_timeout = {}; // timer refs
        this.base_link_frame = null;
        
        panel.widget_menu_cb = () => {
            that.setupMenu();
        }

        this.rendering = true;
        this.renderDirty();
        requestAnimationFrame((t) => this.rendering_loop());  
    }
    
    async rendering_loop() {

        if (!this.rendering)
            return;
        
        let dirty_lasers = Object.keys(this.dirty_laser_points);

        let that = this;
        dirty_lasers.forEach((topic)=>{
            let laser_points = that.dirty_laser_points[topic];
            if (!laser_points)
                return;
            delete that.dirty_laser_points[topic];

            if (!this.sources.topicSubscribed(topic))
                return;

            if (!that.laser_visuals[topic]) {
    
                let color = new THREE.Color(0x00ffff);
                const material = new THREE.LineBasicMaterial( {
                    color: color,
                    transparent: true,
                    opacity: .85
                } );
              
                that.laser_geometry[topic] = new THREE.BufferGeometry().setFromPoints( laser_points );
    
                that.laser_visuals[topic] = new THREE.LineSegments(that.laser_geometry[topic], material);
                that.laser_visuals[topic].castShadow = false;
                that.laser_visuals[topic].receiveShadow = false;
                if (that.laser_frames[topic]) {
                    that.laser_frames[topic].add(that.laser_visuals[topic]);
                }
            } else {
                that.laser_geometry[topic].setFromPoints(laser_points);
            }
        });
        
        super.rendering_loop(); //description-tf render
    }

    on_model_removed() {
        super.on_model_removed();
        let that = this;
        let laser_topics = this.laser_visuals ? Object.keys(this.laser_visuals) : [];
        if (this.laser_frames)
            laser_topics = laser_topics.concat(Object.keys(this.laser_frames));
        this.base_link_frame = null;
        console.log('Robot removed, clearing laser topics', laser_topics)

        laser_topics.forEach((topic) => {
            that.clear_laser(topic);
        });
        let range_topics = this.range_visuals ? [].concat(Object.keys(this.range_visuals)) : [];
        console.log('Robot removed, clearing range topics', range_topics)
        range_topics.forEach((topic) => {
            that.clear_range(topic);
        });
    }

    on_laser_data (topic, scan) {

        // console.log('Has laser!');

        if (!this.robot || this.panel.paused) {
            // console.log('!', this);
            return;
        }

        let scan_ns_stamp = scan.header.stamp.sec*1000000000 + scan.header.stamp.nanosec;

        if (!this.latest_scan_data_stamps[topic]) {
            this.latest_scan_data_stamps[topic] = -1;
        }
        if (this.latest_scan_data_stamps[topic] > scan_ns_stamp) {
            if (!this.scan_older_stamp_drops[topic]) {
                this.scan_older_stamp_drops[topic] = 0;
            }
            if (this.scan_older_stamp_drops[topic] > 10) {
                console.log(topic+ ' latest timestamp reset');
            } else {
                console.log(topic+ ' dropped older laser');
                this.scan_older_stamp_drops[topic]++;
                return;
            }
        }
        this.latest_scan_data_stamps[topic] = scan_ns_stamp;
        if (this.scan_older_stamp_drops[topic])
            delete this.scan_older_stamp_drops[topic];

        let frame_id = scan.header.frame_id;

        if (!this.laser_frames[topic]) 
            this.laser_frames[topic] = this.robot.getFrame(frame_id);

        if (!this.laser_frames[topic]) {
            if (!this.laser_frames_error_logged)
                this.laser_frames_error_logged = {};
            if (!this.laser_frames_error_logged[topic]) {
                this.laser_frames_error_logged[topic] = true;  //only log once
                console.error('Frame '+frame_id+' not found in robot model for laser data from '+topic);
            }
            return;
        }

        // if (!this.base_link_frame) 
        //     this.base_link_frame = this.robot.getFrame('base_link');

        // if (!this.base_link_frame) {
        //     console.error('Frame base_link not found in robot model for laser data');
        //     return;
        // }

        // let base_to_laser_mat = this.base_link_frame.matrixWorld.clone()
        //                             .invert()
        //                             .multiply(this.laser_frames[frame_id].matrixWorld);

        let laser_points = [];
        const rot_axis = new THREE.Vector3(0, 0, 1); // +z is up
        const center = new THREE.Vector3(0, 0, 0);

        let a = scan.angle_min;
        for (let i = 0; i < scan.ranges.length; i++)  {
            let dist = scan.ranges[i];
            
            a += scan.angle_increment;

            if (dist !== null && dist < scan.range_max && dist > scan.range_min) {
                let p = new THREE.Vector3(dist, 0, 0);
                p.applyAxisAngle(rot_axis, a);
                laser_points.push(p); // first the point, then the center, otherwise flickers a lot on android (prob. something with culling)
                laser_points.push(center);
                
            }
            
        };

        // if (!this.dirty_laser_points[topic])
        //     this.dirty_laser_points[topic] = 

        this.dirty_laser_points[topic] = laser_points;

        this.renderDirty();

        this.clear_laser_on_timeout(topic);
    }

    clear_laser_on_timeout(topic) {
        if (this.clear_laser_timeout[topic])
            clearTimeout(this.clear_laser_timeout[topic])

        let that = this;
        this.clear_laser_timeout[topic] = setTimeout(()=>{
            if (that.panel.paused) { //don't clear while paused
                that.clear_laser_on_timeout(topic);
                return;
            }

            that.dirty_laser_points[topic] = [];
            that.renderDirty();
        }, 300);
    }


    on_pg_updated(ev) {
        // console.log('on_pg_updated', e);
        // this.render_queued_laser_data(e.detail.topic, e.detail.pg_node.ns_stamp);
    }

    clear_laser(topic) {
        if (this.laser_visuals[topic]) {
            this.laser_visuals[topic].removeFromParent();
            delete this.laser_visuals[topic];
        }
        if (this.laser_frames[topic]) {
            delete this.laser_frames[topic];
        }
    }

    on_range_data (topic, range) {
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
            const material = new THREE.MeshBasicMaterial({
                color: color, transparent: true, opacity: .85
            } );
            const cone = new THREE.Mesh(geometry, material );
            cone.castShadow = false;
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
            this.range_visuals[topic].material.opacity = Math.max(1.0-gageVal, 0.2);
            this.range_visuals[topic].cone.scale.set(gageVal,gageVal,gageVal);
        } else {
            this.range_visuals[topic].cone.scale.set(0,0,0);
        }
        
        this.renderDirty();
        // console.log('got range for '+frame_id, range, f);
    }

    clear_range(topic) {
        if (this.range_visuals[topic]) {
            this.range_visuals[topic].cone.removeFromParent();
            delete this.range_visuals[topic];
        }
    }

    on_costmap_data(topic, costmap) {
        
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