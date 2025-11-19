import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";
import { WorldModel3DPuginBase } from "./world-model-plugin-base.js";

export class WorldModel3DWidget_Laser extends WorldModel3DPuginBase {

    static laser_delay = 0; //150; // ms

    static SOURCE_TOPIC_TYPE = 'sensor_msgs/msg/LaserScan';
    static SOURCE_DESCRIPTION = 'Lidar source';
    static SOURCE_DEFAULT_TOPIC = null;
    static SOURCE_MAX_NUM = -1;
    static CLEAR_TIMEOUT_MS = 300; // clear if no new data received in this long

    constructor(world_model) {
        super(world_model);
        
        this.laser_delay_ms = this.world_model.panel.getPanelVarAsInt('lasd', 0); // experimental delay, didn't do much
        this.menu_line_el = null;
    }

    // on laser data
    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused)
            return;

        let overlay = this.overlays[topic];
        if (!overlay)
            return;

        let scan_ns_stamp = msg.header.stamp.sec * 1000000000 + msg.header.stamp.nanosec;

        if (!overlay.latest_scan_data_stamp)
            overlay.latest_scan_data_stamp = -1;
        
        if (overlay.latest_scan_data_stamp > scan_ns_stamp) {
            if (!overlay.scan_older_stamp_drops)
                overlay.scan_older_stamp_drops = 0;
            
            if (overlay.scan_older_stamp_drops > 10) {
                console.log(topic + " latest timestamp reset");
            } else {
                console.log(topic + " dropped older laser");
                overlay.scan_older_stamp_drops++;
                return;
            }
        }
        overlay.latest_scan_data_stamp = scan_ns_stamp;
        if (overlay.scan_older_stamp_drops) delete overlay.scan_older_stamp_drops;

        let frame_id = msg.header.frame_id;

        if (!overlay.laser_frame)
            overlay.laser_frame = this.world_model.robot_model.getFrame(frame_id);

        if (!overlay.laser_frame) {
            if (!overlay.error_logged) {
                overlay.error_logged = true; //only log once
                let err = 'Frame "' + frame_id + '" not found in robot model for laser data from ' + topic;
                this.world_model.panel.ui.showNotification(err, "error");
                console.error(err);
            }
            return;
        } else if (overlay.error_logged) {
            delete overlay.error_logged;
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
            overlay.dirty_laser_points = laser_points;
            overlay.dirty_laser_colors = laser_point_colors;
            that.world_model.renderDirty();
            that.clearLaserOnTimeout(topic);
        }, this.laser_delay_ms);
    }

    // render lasers
    onRender() {
        let that = this;
        let topics = Object.keys(this.overlays);
        topics.forEach((topic) => {
            let overlay = that.overlays[topic];

            let laser_points = overlay.dirty_laser_points;
            let laser_point_colors = overlay.dirty_laser_colors;
            if (!laser_points || !laser_point_colors) return;
            delete overlay.dirty_laser_points;
            delete overlay.dirty_laser_colors;

            // if number of verts in mesh too small, rebuild
            if (overlay.laser_visual && overlay.laser_visual.geometry
                && overlay.laser_visual.geometry.lastNumPositions < laser_points.length) {
                overlay.laser_visual.removeFromParent();
                delete overlay.laser_visual;
                overlay.laser_geometry.dispose();
                delete overlay.laser_geometry;
            }

            if (!overlay.laser_visual) {
                let color = new THREE.Color(0x00ffff);
                const material = new LineMaterial({
                    transparent: true,
                    linewidth: 2,
                    vertexColors: true,
                });

                overlay.laser_geometry = new LineSegmentsGeometry2()
                    .setPositions(laser_points)
                    .setColors(laser_point_colors);
                
                overlay.laser_visual = new LineSegments2(overlay.laser_geometry, material);
                overlay.laser_visual.castShadow = false;
                overlay.laser_visual.receiveShadow = false;
                overlay.laser_visual.renderOrder = 1;
                if (overlay.laser_frame) {
                    overlay.laser_frame.add(overlay.laser_visual);
                }
            } else {
                overlay.laser_geometry
                    .setPositions(laser_points)
                    .setColors(laser_point_colors);
            }
        });
    }

    setupMenu(menu_els) {

        // uncomment for delay controls
        // if (!this.world_model.sources.hasType(WorldModel3DWidget_Laser.SOURCE_TOPIC_TYPE)) 
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
		if (this.overlays[topic] && this.overlays[topic].clear_timeout)
			clearTimeout(this.overlays[topic].clear_timeout);

		let that = this;
		this.overlays[topic].clear_timeout = setTimeout(() => {
            if (!that.overlays[topic])
                return;

			if (that.world_model.panel.paused) {
				//don't clear while paused
				that.clearLaserOnTimeout(topic);
				return;
			}

			that.overlays[topic].dirty_laser_points = [];
			that.overlays[topic].dirty_laser_colors = [];
			that.world_model.renderDirty();
		}, WorldModel3DWidget_Laser.CLEAR_TIMEOUT_MS);
	}

    clearVisuals(topic) {
        if (this.overlays[topic].laser_visual) {
			this.overlays[topic].laser_visual.removeFromParent();
			delete this.overlays[topic].laser_visual;
		}
		if (this.overlays[topic].laser_frame) {
			delete this.overlays[topic].laser_frame;
		}
    }
}
