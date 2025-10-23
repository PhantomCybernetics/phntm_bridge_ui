import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";

export class WorldModel3DWidget_Laser {

    static laser_delay = 0; //150; // ms

    static source_topic_type = 'sensor_msgs/msg/LaserScan';
    static source_description = 'Lidar source';
    static source_default_topic = null;
    static source_max_num = -1;

    constructor(world_model) {
        this.world_model = world_model;
        this.laser_frames = {};
        this.latest_scan_data_stamps = {}; // topic => latest processed stamp
		this.scan_older_stamp_drops = {}; // topic => num
		this.dirty_laser_points = {}; // topic => vector3[]
		this.dirty_laser_colors = {}; // topic => vector3[]
		this.clear_laser_timeout = {}; // timer refs
        this.laser_visuals = {}; // topic => visual
		this.laser_geometry = {}; //topic => geometry
        this.laser_frames_error_logged = {};
        this.laser_delay_ms = this.world_model.panel.getPanelVarAsInt('lasd', 0); // experimental delay, didn't do much
        this.clear_timeout_ms = 300; // clear if no new data received in this long
        this.menu_line_el = null;
    }

    // on laser data
    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused) {
            return;
        }

        let scan_ns_stamp = msg.header.stamp.sec * 1000000000 + msg.header.stamp.nanosec;

        if (!this.latest_scan_data_stamps[topic])
            this.latest_scan_data_stamps[topic] = -1;
        
        if (this.latest_scan_data_stamps[topic] > scan_ns_stamp) {
            if (!this.scan_older_stamp_drops[topic])
                this.scan_older_stamp_drops[topic] = 0;
            
            if (this.scan_older_stamp_drops[topic] > 10) {
                console.log(topic + " latest timestamp reset");
            } else {
                console.log(topic + " dropped older laser");
                this.scan_older_stamp_drops[topic]++;
                return;
            }
        }
        this.latest_scan_data_stamps[topic] = scan_ns_stamp;
        if (this.scan_older_stamp_drops[topic]) delete this.scan_older_stamp_drops[topic];

        let frame_id = msg.header.frame_id;

        if (!this.laser_frames[topic])
            this.laser_frames[topic] = this.world_model.robot_model.getFrame(frame_id);

        if (!this.laser_frames[topic]) {
            if (!this.laser_frames_error_logged[topic]) {
                this.laser_frames_error_logged[topic] = true; //only log once
                let err =
                    'Frame "' +
                    frame_id +
                    '" not found in robot model for laser data from ' +
                    topic;
                this.world_model.panel.ui.showNotification(err, "error");
                console.error(err);
            }
            return;
        } else if (this.laser_frames_error_logged && this.laser_frames_error_logged[topic]) {
            delete this.laser_frames_error_logged[topic];
        }

        let laser_points = [];
        let laser_point_colors = [];
        const rot_axis = new THREE.Vector3(0, 0, 1); // +z is up
        const center = new THREE.Vector3(0, 0, 0);
        const ray_dir = new THREE.Vector3();
        let a = msg.angle_min;
        for (let i = 0; i < msg.ranges.length; i++) {
            let dist = msg.ranges[i];

            a += msg.angle_increment;

            if (dist !== null && dist < msg.range_max && dist > msg.range_min) {
                let p = new THREE.Vector3(dist, 0, 0);
                p.applyAxisAngle(rot_axis, a);
                laser_points.push(p.x, p.y, p.z); // first the point, then the center, otherwise flickers a lot on android (prob. something with culling)
                ray_dir.copy(p.clone().sub(center)).normalize();
                // let d = dist / 2.0;
                // laser_points.push(center.clone().add(ray_dir.multiplyScalar(scan.range_min)));
                let p1 = p.clone().sub(ray_dir.multiplyScalar(0.15))
                laser_points.push(p1.x, p1.y, p1.z);

                laser_point_colors.push(0, 1, 1, 1);
                laser_point_colors.push(0, 0, 1, 0);
            }
        }

        let that = this;
        setTimeout(() => {
            that.dirty_laser_points[topic] = laser_points;
            that.dirty_laser_colors[topic] = laser_point_colors;
            that.world_model.renderDirty();
            that.clearLaserOnTimeout(topic);
        }, this.laser_delay_ms);
    }

    // render lasers
    onRender() {
        let that = this;
        let dirty_laser_topics = Object.keys(this.dirty_laser_points);
        dirty_laser_topics.forEach((topic) => {
            let laser_points = that.dirty_laser_points[topic];
            let laser_point_colors = that.dirty_laser_colors[topic];
            if (!laser_points || !laser_point_colors) return;
            delete that.dirty_laser_points[topic];
            delete that.dirty_laser_colors[topic];

            if (!that.world_model.sources.topicSubscribed(topic)) return;

            // if number of verts in mesh too small, rebuild
            if (that.laser_visuals[topic] && that.laser_visuals[topic].geometry
                && that.laser_visuals[topic].geometry.lastNumPositions < laser_points.length) {
                that.laser_visuals[topic].removeFromParent();
                delete that.laser_visuals[topic]
                that.laser_geometry[topic].dispose();
                delete that.laser_geometry[topic];
            }

            if (!that.laser_visuals[topic]) {
                let color = new THREE.Color(0x00ffff);
                const material = new LineMaterial({
                    // color: color,
                    transparent: true,
                    // opacity: .85,
                    linewidth: 2,
                    vertexColors: true,
                });

                that.laser_geometry[topic] = new LineSegmentsGeometry2()
                    .setPositions(laser_points)
                    .setColors(laser_point_colors);
                // let colors_buf = new Float32Array(laser_point_colors);
                // that.laser_geometry[topic].setAttribute(
                // 	"color",
                // 	new THREE.BufferAttribute(colors_buf, 4),
                // );
                that.laser_visuals[topic] = new LineSegments2(
                    that.laser_geometry[topic],
                    material,
                );
                that.laser_visuals[topic].castShadow = false;
                that.laser_visuals[topic].receiveShadow = false;
                that.laser_visuals[topic].renderOrder = 1;
                if (that.laser_frames[topic]) {
                    that.laser_frames[topic].add(that.laser_visuals[topic]);
                }
            } else {
                // that.laser_geometry[topic].dispose();
                that.laser_geometry[topic]
                    .setPositions(laser_points)
                    .setColors(laser_point_colors);

                // const colorAttribute = that.laser_geometry[topic].getAttribute("color");
                // if (colorAttribute.count != laser_point_colors.length / 4) {
                // 	let colors_buf = new Float32Array(laser_point_colors);
                // 	that.laser_geometry[topic].setAttribute(
                // 		"color",
                // 		new THREE.BufferAttribute(colors_buf, 4),
                // 	);
                // } else {
                // 	colorAttribute.copyArray(laser_point_colors);
                // }
                // colorAttribute.needsUpdate = true;
            }
        });
    }

    setupMenu(menu_els) {

        // uncomment for delay controls
        // if (!this.world_model.sources.hasType(WorldModel3DWidget_Laser.source_topic_type)) 
		// 	return; // only show when topics are subscribed to

        // let line_el = $('<div class="menu_line plus_minus_ctrl" id="laser_delay_ctrl_'+this.world_model.panel.n+'"></div>');
        // let minus_btn = $('<span class="minus">-</span>');
        // let val_btn = $('<button class="val" title="Reset delay">Laser delay: '+this.laser_delay_ms.toFixed(0)+'ms</button>');
        // let plus_btn = $( '<span class="plus">+</span>');
        // line_el.append([ minus_btn, val_btn, plus_btn]);

        // let that = this;

        // plus_btn.click(function(ev) {
        //     that.setLaserDelay(that.laser_delay_ms + 10);
        // });

        // minus_btn.click(function(ev) {
        //     let val = that.laser_delay_ms - 10;
        //     if (val < 0)
        //         val = 0;
        //     that.setLaserDelay(val);
        // });

        // val_btn.click(function(ev) {
        //     that.setLaserDelay(0);
        // });
        
        // menu_els.push(line_el);
        
    }

    setLaserDelay(val) {
		this.laser_delay_ms = val;
		$("#laser_delay_ctrl_" + this.world_model.panel.n + " .val").html(
			"Laser delay: " + this.laser_delay_ms.toFixed(0) + "ms",
		);
        this.world_model.panel.storePanelVarAsInt('lasd', val);
	}

    clearLaserOnTimeout(topic) {
		if (this.clear_laser_timeout[topic])
			clearTimeout(this.clear_laser_timeout[topic]);

		let that = this;
		this.clear_laser_timeout[topic] = setTimeout(() => {
			if (that.world_model.panel.paused) {
				//don't clear while paused
				that.clearLaserOnTimeout(topic);
				return;
			}

			that.dirty_laser_points[topic] = [];
			that.dirty_laser_colors[topic] = [];
			that.world_model.renderDirty();
		}, this.clear_timeout_ms);
	}

    // clear laser for topic
    clearTopic(topic) {
        if (this.laser_visuals[topic]) {
			this.laser_visuals[topic].removeFromParent();
			delete this.laser_visuals[topic];
		}
		if (this.laser_frames[topic]) {
			delete this.laser_frames[topic];
		}
    }

    // clear all lasers
    clearAllTopics() {
        let laser_topics = this.laser_visuals ? Object.keys(this.laser_visuals) : [];
		if (this.laser_frames)
			laser_topics = laser_topics.concat(Object.keys(this.laser_frames));
        
		console.log("Clearing all laser topics", laser_topics);
        let that = this;
		laser_topics.forEach((topic) => {
			that.clearTopic(topic);
		});
    }
}
