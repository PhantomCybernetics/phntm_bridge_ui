import { DescriptionTFWidget } from './description-tf.js'
import { MultiTopicSource } from "./inc/multitopic.js";
import * as THREE from 'three';
import { lerpColor, deg2rad } from '../lib.js'
import { CSS2DRenderer, CSS2DObject } from 'css-2d-renderer';

export class Everything3DWidget extends DescriptionTFWidget {

    static label = 'Everything (3D)';
    static default_width = 8;
    static default_height = 6;
    
    constructor(panel) {
        super(panel, false); // don't start rendering loop yet

        let that = this;

        this.addEventListener('pg_updated', (e) => this.on_pg_updated(e));

        this.overlays = {};
        this.sources.on('change', (topics) => this.on_sources_change(topics));

        this.sources.add('sensor_msgs/msg/LaserScan', 'Lidar source', null, -1,
            (t, s) => this.on_laser_data(t, s),
            (t) => this.clear_laser(t)
        );
        this.sources.add('sensor_msgs/msg/Range', 'Range source', null, -1,
            (t, r) => this.on_range_data(t, r),
            (t) => this.clear_range(t)
        );
        // this.sources.add('nav_msgs/msg/OccupancyGrid', 'Costmap source', null, 1, (t, c) => this.on_costmap_data(t, c));
        this.sources.add('vision_msgs/msg/Detection3DArray', 'Detection 3D Array', null, -1,
            (t, d) => { that.on_detections_data(t, d); },
            (t) => { that.clear_detections(t); }
        );

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
        
        this.dirty_detection_results = {}; // topic => []
        this.detection_frames = {}; // topic => frame obj
        this.detection_labels = {}; // topic => []
        this.detection_labels = {}; // topic => []
        this.detection_lines = {}; // topic => []
        this.detection_lines_geometry = {};
        this.clear_detections_timeout = {}; // timer refs

        this.base_link_frame = null;
        
        panel.widget_menu_cb = () => {
            that.setupMenu();
        }

        this.on_sources_change(this.sources.getSources());

        this.rendering = true;
        this.renderDirty();
        requestAnimationFrame((t) => this.rendering_loop());  
    }
    
    on_sources_change(source_topics) {

        let that = this;
        let client = this.panel.ui.client;

        source_topics.forEach((topic)=>{
            if (!that.overlays[topic]) {
                that.overlays[topic] = {};
                that.overlays[topic].config_update_cb = (config) => {
                    console.warn('onTopicConfigUpdate', topic, config);
                    that.overlays[topic].config = config;
                }
                client.on_topic_config(topic, that.overlays[topic].config_update_cb);
            }
        });
    }

    async rendering_loop() {

        if (!this.rendering)
            return;
        
        let that = this;
        let dirty_laser_topics = Object.keys(this.dirty_laser_points);
        dirty_laser_topics.forEach((topic)=>{
            let laser_points = that.dirty_laser_points[topic];
            if (!laser_points)
                return;
            delete that.dirty_laser_points[topic];

            if (!that.sources.topicSubscribed(topic))
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

        let dirty_detection_topics = Object.keys(this.dirty_detection_results);
        dirty_detection_topics.forEach((topic) => {
            let results = that.dirty_detection_results[topic];
            if (!results)
                return;
            delete that.dirty_detection_results[topic];

            if (!that.sources.topicSubscribed(topic))
                return;

            let detection_points = []; //all for this topic
            let frame_base = new THREE.Vector3(0.0,0.0,0.0);
            for (let i = 0; i < results.length; i++) {
                detection_points.push(frame_base);
                detection_points.push(results[i].points[0]);
                // detection_points.push(frame_base);
            }

            if (!that.detection_lines[topic]) {
    
                let color = new THREE.Color(0xff00ff);
                const material = new THREE.LineBasicMaterial( {
                    color: color,
                    transparent: true,
                    opacity: .95
                } );
              
                that.detection_lines_geometry[topic] = new THREE.BufferGeometry().setFromPoints(detection_points);
    
                that.detection_lines[topic] = new THREE.LineSegments(that.detection_lines_geometry[topic], material);
                that.detection_lines[topic].castShadow = false;
                that.detection_lines[topic].receiveShadow = false;
                if (that.detection_frames[topic]) {
                    that.detection_frames[topic].add(that.detection_lines[topic]);
                }
            } else {
                that.detection_lines_geometry[topic].setFromPoints(detection_points);
            }

            // console.log('Rendering '+results.length+' detections for '+topic, that.detection_lines[topic], detection_points);
        });
        
        super.rendering_loop(); //description-tf render
    }

    on_model_removed() {
        super.on_model_removed();
        let that = this;

        this.base_link_frame = null;

        let laser_topics = this.laser_visuals ? Object.keys(this.laser_visuals) : [];
        if (this.laser_frames)
            laser_topics = laser_topics.concat(Object.keys(this.laser_frames));
        console.log('Robot removed, clearing laser topics', laser_topics)
        laser_topics.forEach((topic) => {
            that.clear_laser(topic);
        });

        let range_topics = this.range_visuals ? [].concat(Object.keys(this.range_visuals)) : [];
        console.log('Robot removed, clearing range topics', range_topics)
        range_topics.forEach((topic) => {
            that.clear_range(topic);
        });

        let detection_topics = this.detection_lines ? [].concat(Object.keys(this.detection_lines)) : [];
        console.log('Robot removed, clearing detection topics', detection_topics)
        detection_topics.forEach((topic) => {
            that.clear_detections(topic);
        });


    }

    on_laser_data (topic, scan) {

        if (!this.robot || this.panel.paused) {
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
                this.panel.ui.show_notification('Frame '+frame_id+' not found in robot model for laser data from '+topic, 'error');
                console.error('Frame '+frame_id+' not found in robot model for laser data from '+topic);
            }
            return;
        } else if (this.laser_frames_error_logged && this.laser_frames_error_logged[topic]) {
            delete this.laser_frames_error_logged[topic]
        }

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

    clear_laser(topic) {
        if (this.laser_visuals[topic]) {
            this.laser_visuals[topic].removeFromParent();
            delete this.laser_visuals[topic];
        }
        if (this.laser_frames[topic]) {
            delete this.laser_frames[topic];
        }
    }

    on_pg_updated(ev) {
        // console.log('Pose grapth updated', e);
    }

    on_range_data (topic, range) {
        if (!this.robot || this.panel.paused)
            return;

        let frame_id = range.header.frame_id;
        let f = this.robot.getFrame(frame_id);
        if (!f) {
            this.panel.ui.show_notification('Frame '+frame_id+' not found in robot model for range data from '+topic, 'error');
            console.error('Frame '+frame_id+' not found in robot model for range data from '+topic);
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
    }

    clear_range(topic) {
        if (this.range_visuals[topic]) {
            this.range_visuals[topic].cone.removeFromParent();
            delete this.range_visuals[topic];
        }
    }

    on_detections_data(topic, data) {
        if (!this.robot || this.panel.paused)
            return;

        let frame_id = data.header.frame_id;
        let f = this.robot.getFrame(frame_id);
        if (!f) {
            if (!this.detection_frames_error_logged)
                this.detection_frames_error_logged = {};
            if (!this.detection_frames_error_logged[topic]) {
                this.detection_frames_error_logged[topic] = true;  //only log once
                this.panel.ui.show_notification('Frame '+frame_id+' not found in robot model for detection data from '+topic, 'error');
                console.error('Frame '+frame_id+' not found in robot model for detection data from '+topic);
            }
            return;
        } else if (this.detection_frames_error_logged && this.detection_frames_error_logged[topic]) {
            delete this.detection_frames_error_logged[topic]
        }
        this.detection_frames[topic] = f;

        // const center = new THREE.Vector3(0, 0, 0);

        this.dirty_detection_results[topic] = [];
        
        // console.log(data);

        for (let i = 0; i < data.detections.length; i++) {

            // console.log(data.detections[i]);

            let res = data.detections[i].results[0];
            let center = new THREE.Vector3(
                res['pose']['pose']['position']['x'],
                res['pose']['pose']['position']['y'],
                res['pose']['pose']['position']['z']
            );
            // console.log(res['pose']['pose']['position']);
            let d = {
                class_id: res.hypothesis.class_id,
                score: res.hypothesis.score,
                points: [ center ]
            }

            this.dirty_detection_results[topic].push(d);

            if (!this.detection_labels[topic])
                this.detection_labels[topic] = [];

            let l = 'Class '+d.class_id;
            if (this.overlays[topic] && this.overlays[topic].config && this.overlays[topic].config['nn_detection_labels']
                && this.overlays[topic].config['nn_detection_labels'][d.class_id])
                l = this.overlays[topic].config['nn_detection_labels'][d.class_id];
            l += ' (' + d.score.toFixed(2)+')';
            l += '\n['+center.x.toFixed(2)+';'+center.y.toFixed(2)+';'+center.z.toFixed(2)+']'
            // console.log(l);
            let label_el = null;
            if (!this.detection_labels[topic][i]) {
                const el = document.createElement('div');
                el.className = 'detection_label';
                // el.style.backgroundColor = 'rgba(0,0,0,0.5)';
                // el.style.color = '#ffffff';
                // el.style.fontSize = '12px';
                label_el = new CSS2DObject(el);
                label_el.center.set(0.5, 0);
                f.add(label_el);
                label_el.position.set(center.x, center.y, center.z);
                this.detection_labels[topic][i] = label_el;
            } else {
                label_el = this.detection_labels[topic][i];
            }
            label_el.element.textContent = l;
            label_el.element.hidden = false;
            label_el.position.set(center.x, center.y, center.z);
        }

        if (this.detection_labels[topic]) {
            for (let i = data.detections.length; i < this.detection_labels[topic].length; i++) {
                this.detection_labels[topic][i].element.hidden = true;
            }
        }
    
        // let a_tan = Math.tan(range.field_of_view/2.0);
        // let r = a_tan * range.max_range * 2.0;
        // const geometry = new THREE.ConeGeometry(r, range.max_range, 32); 
        // geometry.rotateZ(90 * Math.PI/180);
        // geometry.translate(range.max_range/2.0, 0, 0);
        // let color = new THREE.Color(0xffff00);
        // const material = new THREE.MeshBasicMaterial({
        //     color: color, transparent: true, opacity: .85
        // } );
        // const cone = new THREE.Mesh(geometry, material );
        // cone.castShadow = false;
        // this.range_visuals[topic] = {
        //     cone: cone,
        //     color: color,
        //     material: material
        // };
        // f.add(cone);
        
        // if (data.detections.length)
        //     console.log('Detection data for '+topic, data);

        this.clear_detections_on_timeout(topic);
    }

    clear_detections_on_timeout(topic) {
        if (this.clear_detections_timeout[topic])
            clearTimeout(this.clear_detections_timeout[topic])

        let that = this;
        this.clear_detections_timeout[topic] = setTimeout(()=>{
            if (that.panel.paused) { //don't clear while paused
                that.clear_detections_on_timeout(topic);
                return;
            }

            that.dirty_detection_results[topic] = [];
            if (this.detection_labels[topic]) {
                for (let i = 0; i < this.detection_labels[topic].length; i++) {
                    this.detection_labels[topic][i].element.hidden = true;
                }
            }
            that.renderDirty();
        }, 300);
    }

    clear_detections(topic) {
        if (this.detection_lines[topic]) {
            this.detection_lines[topic].removeFromParent();
            delete this.detection_lines[topic];
        }
        if (this.detection_frames[topic])
            delete this.detection_frames[topic];
        if (this.detection_lines_geometry[topic])
            delete this.detection_lines_geometry[topic];
        if (this.dirty_detection_results[topic])
            delete this.dirty_detection_results[topic];
        if (this.detection_labels[topic]) {
            for (let i = 0; i < this.detection_labels[topic].length; i++) {
                this.detection_labels[topic][i].removeFromParent();
            }
            delete this.detection_labels[topic];
        }
            
    }

    on_costmap_data(topic, costmap) {
        
    }

    setupMenu () {
        super.setupMenu();
    }
}