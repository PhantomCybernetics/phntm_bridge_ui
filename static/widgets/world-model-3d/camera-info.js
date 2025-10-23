import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";

export class WorldModel3DWidget_CameraInfo {
    static source_topic_type = 'sensor_msgs/msg/CameraInfo';
    static source_description = 'Camera Info';   
    static source_default_topic = null;
    static source_max_num = -1;

    constructor(world_model) {
        this.world_model = world_model;
        this.camera_frames = {};
		this.dirty_camera_frustums = {};
		this.camera_frustum_visuals = {};
		this.camera_frustum_geometry = {};
    }

    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused) return;

		if (!this.world_model.overlays[topic] || !this.world_model.overlays[topic].config) return; // always wait for config

		let frame_id = msg.header.frame_id;
		if (this.world_model.overlays[topic].config["force_frame_id"])
			frame_id = this.world_model.overlays[topic].config["force_frame_id"];
		let f = frame_id ? this.world_model.robot_model.getFrame(frame_id) : null;
		if (!frame_id || !f) {
			if (!this.camera_info_error_logged) this.camera_info_error_logged = {};
			if (!this.camera_info_error_logged[topic]) {
				this.camera_info_error_logged[topic] = true; //only log once
				let msg = !frame_id
					? "Missing frame_id in " + topic
					: 'Frame "' + frame_id + '" not found in camera info of ' + topic;
				this.panel.ui.showNotification(msg, "error");
				console.error(msg);
			}
			return;
		} else if (
			this.camera_info_error_logged &&
			this.camera_info_error_logged[topic]
		) {
			delete this.camera_info_error_logged[topic];
		}

		this.camera_frames[topic] = f;

		let near =
			this.world_model.overlays[topic].config && this.world_model.overlays[topic].config["frustum_near"]
				? this.world_model.overlays[topic].config["frustum_near"]
				: 0.01;
		let far =
			this.world_model.overlays[topic].config && this.world_model.overlays[topic].config["frustum_far"]
				? this.world_model.overlays[topic].config["frustum_far"]
				: 2.0;

		let frustum = this.calculatePinholeFrustum(msg, near, far);

		let frustum_pts = [];
		[	frustum.nearTopLeft,
			frustum.nearTopRight,
			frustum.nearTopRight,
			frustum.nearBottomRight,
			frustum.nearBottomRight,
			frustum.nearBottomLeft,
			frustum.nearBottomLeft,
			frustum.nearTopLeft,

			frustum.nearTopLeft,
			frustum.farTopLeft,
			frustum.nearTopRight,
			frustum.farTopRight,
			frustum.nearBottomLeft,
			frustum.farBottomLeft,
			frustum.nearBottomRight,
			frustum.farBottomRight,

			frustum.farTopLeft,
			frustum.farTopRight,
			frustum.farTopRight,
			frustum.farBottomRight,
			frustum.farBottomRight,
			frustum.farBottomLeft,
			frustum.farBottomLeft,
			frustum.farTopLeft ].forEach((v3)=>{
				frustum_pts.push(v3.x, v3.y, v3.z);
		});
		

		this.dirty_camera_frustums[topic] = frustum_pts;
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
        let dirty_camera_frustum_topics = Object.keys(this.dirty_camera_frustums);
        dirty_camera_frustum_topics.forEach((topic) => {
            let frustum_points = that.dirty_camera_frustums[topic];
            if (!frustum_points) return;
            delete that.dirty_camera_frustums[topic];

            if (!that.world_model.sources.topicSubscribed(topic)) return;

            if (!that.camera_frustum_visuals[topic]) {
                let color = new THREE.Color(
                    that.world_model.overlays[topic] &&
                    that.world_model.overlays[topic].config &&
                    that.world_model.overlays[topic].config["frustum_color"]
                        ? that.world_model.overlays[topic].config["frustum_color"]
                        : 0x00ffff,
                );
                const material = new LineMaterial({
                    color: color,
                    linewidth: 2,
                    transparent: true,
                    opacity: 0.85,
                });

                that.camera_frustum_geometry[topic] = new LineSegmentsGeometry2().setPositions(frustum_points);

                that.camera_frustum_visuals[topic] = new LineSegments2(
                    that.camera_frustum_geometry[topic],
                    material,
                );
                that.camera_frustum_visuals[topic].castShadow = false;
                that.camera_frustum_visuals[topic].receiveShadow = false;
                if (that.camera_frames[topic]) {
                    that.camera_frames[topic].add(that.camera_frustum_visuals[topic]);
                }
            } else {
                that.camera_frustum_geometry[topic].setPositions(frustum_points); // number never changes
            }
        });
    }

    // clear frustum for topic
    clearTopic(topic) {
        if (this.camera_frustum_visuals[topic]) {
			this.camera_frustum_visuals[topic].removeFromParent();
			delete this.camera_frustum_visuals[topic];
		}
    }

    // clear all camera frustums
    clearAllTopics() {
        let camera_frustum_visuals = this.camera_frustum_visuals
			? [].concat(Object.keys(this.camera_frustum_visuals))
			: [];
		console.log("Clearing all camera frustums", camera_frustum_visuals);
        let that = this;
		camera_frustum_visuals.forEach((topic) => {
			that.clearTopic(topic);
		});
    }
}
