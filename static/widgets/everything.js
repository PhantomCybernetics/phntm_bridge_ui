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

    
    on_laser_data = (topic, scan) => {
        if (!this.robot || this.panel.paused)
            return;

        let scan_ns_stamp = scan.header.stamp.sec*1000000000 + scan.header.stamp.nanosec;

        //put scan to queue
        if (!this.laser_data_queue[topic])
            this.laser_data_queue[topic] = [];
        this.laser_data_queue[topic].push({
            ns_stamp: scan_ns_stamp,
            msg: scan
        });

        let latest_base_pg_stamp = this.get_latest_pg_ns_stamp();
        if (latest_base_pg_stamp !== NaN && scan_ns_stamp <= latest_base_pg_stamp) {
            this.render_queued_laser_data(topic, latest_base_pg_stamp); //render now with closest pg 
        }
    }

    render_queued_laser_data(topic, latest_base_pg_stamp) {

        // find closest pg
        
        if (!this.laser_data_queue || !this.laser_data_queue[topic]
            || !this.pose_graph || !this.pose_graph.length)
            return;

        // let remove_older_than = -1;
        let q = this.laser_data_queue[topic];
        let pg_node = null;
        let scan = null;
        for (let i = q.length-1; i >= 0; i--) {
            
            if (q[i].ns_stamp > latest_base_pg_stamp)
                continue;

            for (let j = this.pose_graph.length-1; j >= 0; j--) {

                if (this.pose_graph[j].ns_stamp <= q[i].ns_stamp) {
                    // first pg node older or marching scan
                    pg_node = this.pose_graph[j];
                    scan = q[i];
                    break;
                }
            }

            if (scan)
                break;
        }

        if (!scan || !pg_node)
            return;

        // delete older scans than current
        while (q.length && q[0].ns_stamp <= scan.ns_stamp) {
            q.shift();
        }

        // get offset to laser
        // if the laser iself is moving with ref to the base_link
        // this should be saved in the graph (ignoring for now as my laser is fixed to robot)
        let frame_id = scan.msg.header.frame_id;

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

        // console.log('base link', this.base_link_frame, this.base_link_frame.matrixWorld);
        // console.log('laser link', this.laser_frames[frame_id], this.laser_frames[frame_id].matrixWorld);
        let base_to_laser_mat = this.base_link_frame.matrixWorld.clone()
                                    .invert()
                                    .multiply(this.laser_frames[frame_id].matrixWorld);
        
        // let pg_pos_diff = new THREE.Vector3()
        // let pg_rot_diff = new THREE.Quaternion();




        // if (this.get_pg_offset(ns_stamp, pg_pos_diff, pg_rot_diff)) {
        //     return; //scan is in the future
        // }

        let laser_points = [];
        const rot_axis = new THREE.Vector3(0, 0, 1); // +z is up
        const center = new THREE.Vector3(0, 0, 0);

        for (let i = 0; i < scan.msg.ranges.length; i++)  {
            let dist = scan.msg.ranges[i];
            if (dist === null || dist > scan.msg.range_max || dist < scan.msg.range_min) 
                continue;

            let p = new THREE.Vector3( dist, 0, 0 );
            p.applyAxisAngle(rot_axis, scan.msg.angle_min + (i * scan.msg.angle_increment));

            laser_points.push(center);
            laser_points.push(p);
            // let ray = this.laser_visuals[topic].rays[i];
            // if (val === null || val > scan.range_max || val < scan.range_min) {
            //     ray.visible = false;
            // } else {
            //     let percent = (Math.min(Math.max(val, 0), scan.range_max) * 100.0 / scan.range_max);
            //     percent = percent / 100.0;
            //     ray.scale.set(percent,1,1);
            //     ray.visible = true;
            // }
        };


        if (!this.laser_visuals[topic]) {
    
            let color = new THREE.Color(0x00ffff);
            const material = new THREE.MeshBasicMaterial( {color: color, transparent: true, opacity: .85 } );
          
            this.laser_geometry = new THREE.BufferGeometry().setFromPoints( laser_points );

            this.laser_visuals[topic] = new THREE.LineSegments(this.laser_geometry, material);
            this.world.add(this.laser_visuals[topic]);
    
            // let rays = [];
            // const ray_geometry = new THREE.ConeGeometry(.003, scan.range_max, 4); 
            // ray_geometry.translate(0, -scan.range_max/2.0, 0);
            // ray_geometry.rotateZ(Math.PI/2.0);
            // // ray_geometry.rotateZ(90 * Math.PI/180);
            // let rot = scan.angle_min;
            // // let rot_step = (2.0*Math.PI) / scan.ranges.length;
            
            // for (let i = 0; i < scan.ranges.length; i++)  {
            //     const ray = new THREE.Mesh(ray_geometry, material);
            //     rays.push(ray);
            //     ray.rotation.set(0,0,rot);
            //     f.add(ray);
            //     // console.log('made laser ray '+i+'; a='+rot)
            //     rot += scan.angle_increment;
            // };

            // this.laser_visuals[topic] = {
            //     rays: rays
            // }
        } else {
            this.laser_geometry.setFromPoints( laser_points );
        }

        // let pos = THREE.Vector3();
        // let rot = THREE.Quaternion();
        // laser_frame.getWorldPosition(this.laser_visuals[topic].position);
        // laser_frame.getWorldQuaternion(this.laser_visuals[topic].quaternion);
        // let mat = new THREE.Matrix4().identity().multiplyMatrices(base_to_laser_mat, pg_node.mat);
        
        let mat = pg_node.mat.clone().multiply(base_to_laser_mat);

        let pos = new THREE.Vector3().setFromMatrixPosition(mat);
        let rot = new THREE.Quaternion().setFromRotationMatrix(mat);
        
        // console.log('laser world pos / rot:', pos, rot);

        this.laser_visuals[topic].quaternion.copy(rot);
        this.laser_visuals[topic].position.copy(pos);

        // for (let i = 0; i < scan.ranges.length; i++)  {
        //     let val = scan.ranges[i];
        //     let ray = this.laser_visuals[topic].rays[i];
        //     if (val === null || val > scan.range_max || val < scan.range_min) {
        //         ray.visible = false;
        //     } else {
        //         let percent = (Math.min(Math.max(val, 0), scan.range_max) * 100.0 / scan.range_max);
        //         percent = percent / 100.0;
        //         ray.scale.set(percent,1,1);
        //         ray.visible = true;
        //     }
        // };
    }

    on_pg_updated = (e) => {
        // console.log('on_pg_updated', e);
        this.render_queued_laser_data(e.detail.topic, e.detail.pg_node.ns_stamp);
    }

    clear_laser = (topic) => {
        if (this.laser_visuals[topic]) {
            this.laser_visuals[topic].removeFromParent();
            delete this.laser_visuals[topic];
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