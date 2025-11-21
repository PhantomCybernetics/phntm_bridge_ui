import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";
import { rad2deg } from "../../inc/lib.js";
import { WorldModel3DPluginBase } from "./world-model-plugin-base.js";

export class WorldModel3DWidget_CameraInfo extends WorldModel3DPluginBase {
    static SOURCE_TOPIC_TYPE = 'sensor_msgs/msg/CameraInfo';
    static SOURCE_DESCRIPTION = 'Camera Info';   
    static SOURCE_DEFAULT_TOPIC = null;
    static SOURCE_MAX_NUM = -1;

    constructor(world_model) {
		super(world_model);
        
        // this.camera_frames = {};
		// this.dirty_camera_frustums = {};
		// this.camera_frustum_visuals = {};
		// this.camera_frustum_geometry = {};
    }

	addTopic(topic) {
		super.addTopic(topic);
		console.warn('World Model CameraInfo adding topic ', topic);
		let config = this.client.getTopicConfig(topic);
		this.overlays[topic].config = config;

		 this.overlays[topic].config_change_cb = (new_config) => { // we need a wrapper for config change
            this.overlays[topic].config = new_config;
			this.clearVisuals(topic); //force re-render
        }
        this.client.onTopicConfig(topic, this.overlays[topic].config_change_cb); // rebuild from new config when the bridge node restarts (urdf model may not change)
	}

    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused) return;

		let overlay = this.overlays[topic];
        if (!overlay)
            return;

		// only update topic frustum once per sec
		if (!overlay.last_rendered || Date.now() - overlay.last_rendered > 1000)
			overlay.last_rendered = Date.now();
		else return;
		
		let config = overlay.config ? overlay.config : {};

		if (!overlay.camera_frame ) {
			let frame_id = config["force_frame_id"] ? config["force_frame_id"] : msg.header.frame_id;
			let f = frame_id ? this.world_model.robot_model.getFrame(frame_id) : null;
			if (!frame_id || !f) {
				if (!overlay.error_logged) {
					overlay.error_logged = true; //only log once
					let msg = !frame_id ? "Missing frame_id in " + topic : 'Frame "' + frame_id + '" not found in camera info of ' + topic;
					this.panel.ui.showNotification(msg, "error");
					console.error(msg);
				}
				return;
			} else if (overlay.error_logged) {
				delete overlay.error_logged;
			}

			overlay.camera_frame = f;
			overlay.near = config["frustum_near"] ? this.overlays[topic].config["frustum_near"] : 0.01;
			overlay.far = config["frustum_far"] ? config["frustum_far"] : 2.0;
		}
		
		let frustum = this.calculatePinholeFrustum(msg, overlay.near, overlay.far);

		let v_angle = frustum.farBottomRight.angleTo(frustum.farTopRight);
		let h_angle = frustum.farTopRight.angleTo(frustum.farTopLeft);
		let r_axis = new THREE.Vector3().crossVectors(frustum.farTopRight, frustum.farBottomRight).normalize();
		let l_axis = new THREE.Vector3().crossVectors(frustum.farTopLeft, frustum.farBottomLeft).normalize();
		let t_axis = new THREE.Vector3().crossVectors(frustum.farTopLeft, frustum.farTopRight).normalize();
		let b_axis = new THREE.Vector3().crossVectors(frustum.farBottomLeft, frustum.farBottomRight).normalize();
		const steps = 10;
		let v_angle_step = v_angle / steps;
		let h_angle_step = h_angle / steps;
		let r = []; let l = []; let t = []; let b = [];
		for (let j = 1; j < steps; j++) {
			r[j] = frustum.farTopRight.clone().applyAxisAngle(r_axis, v_angle_step * j);
			l[j] = frustum.farTopLeft.clone().applyAxisAngle(l_axis, v_angle_step * j);
			t[j] = frustum.farTopLeft.clone().applyAxisAngle(t_axis, h_angle_step * j);
			b[j] = frustum.farBottomLeft.clone().applyAxisAngle(b_axis, h_angle_step * j);
		}

		let frustum_pts = [];
		
		let frustum_pairs = [ frustum.nearTopLeft, frustum.nearTopRight,
							  frustum.nearTopRight, frustum.nearBottomRight,
							  frustum.nearBottomRight, frustum.nearBottomLeft,
							  frustum.nearBottomLeft, frustum.nearTopLeft,

							  frustum.nearTopLeft, frustum.farTopLeft,
							  frustum.nearTopRight, frustum.farTopRight,
							  frustum.nearBottomLeft, frustum.farBottomLeft,
							  frustum.nearBottomRight, frustum.farBottomRight,

							  frustum.farTopRight, r[1],
							  frustum.farTopLeft, l[1],
							  frustum.farTopLeft, t[1],
							  frustum.farBottomLeft, b[1]
							 ];
		for (let j = 1; j < steps-1; j++) {
			frustum_pairs.push(
				r[j], r[j+1],
				l[j], l[j+1],
				t[j], t[j+1],
				b[j], b[j+1]
			);
		}
		frustum_pairs.push(
			r[steps-1], frustum.farBottomRight,
			l[steps-1], frustum.farBottomLeft,
			t[steps-1], frustum.farTopRight,
			b[steps-1], frustum.farBottomRight
		);
		
		frustum_pairs.forEach((v3)=>{
			frustum_pts.push(v3.x, v3.y, v3.z);
		});
		
		
		overlay.dirty_frustum_pts = frustum_pts;
		this.world_model.renderDirty();
    }

    // this model ignores distorion (is it a problem or good enough?)
	calculatePinholeFrustum(msg, near, far) {
		const fx = msg.k[0];
		const fy = msg.k[4];
		const cx = msg.k[2];
		const cy = msg.k[5];

		const width = msg.width;
		const height = msg.height;

		const aspectRatio = width / height;
		const fovY = 2 * Math.atan(height / (2 * fy));
		const fovX = 2 * Math.atan((width * fy) / (2 * fx * height));

		const nearHeight = 2 * Math.tan(fovY / 2) * near;
		const nearWidth = nearHeight * aspectRatio;
		const farHeight = 2 * Math.tan(fovY / 2) * far;
		const farWidth = farHeight * aspectRatio;

		return {
			nearTopLeft: new THREE.Vector3(-nearWidth / 2, nearHeight / 2, near),
			nearTopRight: new THREE.Vector3(nearWidth / 2, nearHeight / 2, near),
			nearBottomLeft: new THREE.Vector3(-nearWidth / 2, -nearHeight / 2, near),
			nearBottomRight: new THREE.Vector3(nearWidth / 2, -nearHeight / 2, near),

			farTopLeft: new THREE.Vector3(-farWidth / 2, farHeight / 2, far),
			farTopRight: new THREE.Vector3(farWidth / 2, farHeight / 2, far),
			farBottomLeft: new THREE.Vector3(-farWidth / 2, -farHeight / 2, far),
			farBottomRight: new THREE.Vector3(farWidth / 2, -farHeight / 2, far),
		};
	}

    // render camera frustums
    onRender() {
        let that = this;
        let topics = Object.keys(this.overlays);
        topics.forEach((topic) => {
			let overlay = this.overlays[topic];
            let frustum_points = overlay.dirty_frustum_pts;
            if (!frustum_points) return;
            delete overlay.dirty_frustum_pts;

			let config = this.overlays[topic].config ? this.overlays[topic].config : {};

            if (!overlay.frustum_visual) {
				if (!overlay.camera_frame)
					return;
                let color = new THREE.Color(config["frustum_color"] ? config["frustum_color"] : 0x00ffff);
                const material = new LineMaterial({
            		color: color,
                    linewidth: 2,
                    transparent: true,
                    opacity: 0.85,
                });

                overlay.frustum_geometry = new LineSegmentsGeometry2().setPositions(frustum_points);

                overlay.frustum_visual = new LineSegments2(
                    overlay.frustum_geometry,
                    material,
                );
                overlay.frustum_visual.castShadow = false;
                overlay.frustum_visual.receiveShadow = false;
                if (overlay.camera_frame) {
                    overlay.camera_frame.add(overlay.frustum_visual);
                }
            } else {
                overlay.frustum_geometry.setPositions(frustum_points); // number never changes
            }
        });
    }

	clearVisuals(topic) {
		delete this.overlays[topic].camera_frame;
        if (this.overlays[topic].frustum_visual) {
			this.overlays[topic].frustum_visual.removeFromParent();
			delete this.overlays[topic].frustum_visual;
		}
	}

	clearTopic(topic) {
        this.client.offTopicConfig(topic, this.overlays[topic].config_change_cb);
        super.clearTopic(topic);
    }
}
