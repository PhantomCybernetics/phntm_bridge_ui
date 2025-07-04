import { DescriptionTFWidget } from "./description-tf.js";
import { MultiTopicSource } from "./inc/multitopic.js";
import * as THREE from "three";
import { lerpColor, deg2rad } from "../inc/lib.js";
import { CSS2DRenderer, CSS2DObject } from "css-2d-renderer";

export class SceneView3DWidget extends DescriptionTFWidget {
	static label = "3D Scene View";
	static default_width = 8;
	static default_height = 6;

	constructor(panel) {
		super(panel, false); // don't start rendering loop yet

		let that = this;

		$("#panel_title_" + panel.n).text("Scene View");

		this.addEventListener("pg_updated", (e) => this.onPGUpdated(e));

		this.overlays = {};
		this.sources.on("change", (topics) => this.onSourcesChange(topics));

		this.laser_delay = 0; //150; // ms
		this.sources.add(
			"sensor_msgs/msg/LaserScan",
			"Lidar source",
			null,
			-1,
			(t, s) => this.onLaserData(t, s),
			(t) => this.clearLaser(t),
		);
		this.sources.add(
			"sensor_msgs/msg/Range",
			"Range source",
			null,
			-1,
			(t, r) => this.onRangeData(t, r),
			(t) => this.clearRange(t),
		);
		// this.sources.add('nav_msgs/msg/OccupancyGrid', 'Costmap source', null, 1, (t, c) => this.onCostmapData(t, c));
		this.sources.add(
			"vision_msgs/msg/Detection3DArray",
			"Detection 3D Array",
			null,
			-1,
			(t, d) => {
				that.onDetectionsData(t, d);
			},
			(t) => {
				that.clearDetections(t);
			},
		);

		this.sources.add(
			"sensor_msgs/msg/CameraInfo",
			"Camera Info",
			null,
			-1,
			(t, d) => {
				that.onCameraInfoData(t, d);
			},
			(t) => {
				that.clearCameraInfo(t);
			},
		);

		this.sources.parseUrlParts(this.panel.custom_url_vars); // init unparsed by parent

		this.range_visuals = {};
		this.laser_visuals = {};
		this.laser_geometry = {}; //topic =>
		this.laser_data_queue = {};
		this.latest_scan_data_stamps = {}; // topic => latest processed stamp
		this.scan_older_stamp_drops = {}; // topic => num
		this.laser_frames = {};
		this.dirty_laser_points = {}; // topic => vector3[]
		this.dirty_laser_colors = {}; // topic => vector3[]
		this.clear_laser_timeout = {}; // timer refs

		this.dirty_detection_results = {}; // topic => []
		this.detection_frames = {}; // topic => frame obj
		this.detection_labels = {}; // topic => []
		this.detection_markers = {}; // topic => []
		this.detection_lines = {}; // topic => []
		this.detection_lines_geometry = {};
		this.clear_detections_timeout = {}; // timer refs

		this.camera_frames = {};
		this.dirty_camera_frustums = {};
		this.camera_frustum_visuals = {};
		this.camera_frustum_geometry = {};

		this.base_link_frame = null;

		this.onSourcesChange(this.sources.getSources());

		this.rendering = true;
		this.renderDirty();
		requestAnimationFrame((t) => this.renderingLoop());
	}

	onSourcesChange(source_topics) {
		let that = this;
		let client = this.panel.ui.client;

		source_topics.forEach((topic) => {
			if (!that.overlays[topic]) {
				that.overlays[topic] = {};
				that.overlays[topic].configUpdateCb = (config) => {
					console.warn("onTopicConfigUpdate", topic, config);
					that.overlays[topic].config = config;
				};
				client.onTopicConfig(topic, that.overlays[topic].configUpdateCb);
			}
		});

		this.panel.setMenu();
	}

	renderingLoop() {
		if (!this.rendering) return;

		let that = this;

		// laser from LaserScan
		let dirty_laser_topics = Object.keys(this.dirty_laser_points);
		dirty_laser_topics.forEach((topic) => {
			let laser_points = that.dirty_laser_points[topic];
			let laser_point_colors = that.dirty_laser_colors[topic];
			if (!laser_points || !laser_point_colors) return;
			delete that.dirty_laser_points[topic];
			delete that.dirty_laser_colors[topic];

			if (!that.sources.topicSubscribed(topic)) return;

			if (!that.laser_visuals[topic]) {
				let color = new THREE.Color(0x00ffff);
				const material = new THREE.LineBasicMaterial({
					// color: color,
					transparent: true,
					// opacity: .85,
					vertexColors: true,
				});

				that.laser_geometry[topic] = new THREE.BufferGeometry().setFromPoints(
					laser_points,
				);
				let colors_buf = new Float32Array(laser_point_colors);
				that.laser_geometry[topic].setAttribute(
					"color",
					new THREE.BufferAttribute(colors_buf, 4),
				);
				that.laser_visuals[topic] = new THREE.LineSegments(
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
				that.laser_geometry[topic].setFromPoints(laser_points);

				const colorAttribute = that.laser_geometry[topic].getAttribute("color");
				if (colorAttribute.count != laser_point_colors.length / 3) {
					let colors_buf = new Float32Array(laser_point_colors);
					that.laser_geometry[topic].setAttribute(
						"color",
						new THREE.BufferAttribute(colors_buf, 4),
					);
				} else {
					colorAttribute.copyArray(laser_point_colors);
				}
				colorAttribute.needsUpdate = true;
			}
		});

		//cam frustums from CameraInfo
		let dirty_camera_frustum_topics = Object.keys(this.dirty_camera_frustums);
		dirty_camera_frustum_topics.forEach((topic) => {
			let frustum_points = that.dirty_camera_frustums[topic];
			if (!frustum_points) return;
			delete that.dirty_camera_frustums[topic];

			if (!that.sources.topicSubscribed(topic)) return;

			if (!that.camera_frustum_visuals[topic]) {
				let color = new THREE.Color(
					that.overlays[topic] &&
					that.overlays[topic].config &&
					that.overlays[topic].config["frustum_color"]
						? that.overlays[topic].config["frustum_color"]
						: 0x00ffff,
				);
				const material = new THREE.LineBasicMaterial({
					color: color,
					linewidth: 1,
					transparent: true,
					opacity: 0.85,
				});

				that.camera_frustum_geometry[topic] =
					new THREE.BufferGeometry().setFromPoints(frustum_points);

				that.camera_frustum_visuals[topic] = new THREE.LineSegments(
					that.camera_frustum_geometry[topic],
					material,
				);
				that.camera_frustum_visuals[topic].castShadow = false;
				that.camera_frustum_visuals[topic].receiveShadow = false;
				if (that.camera_frames[topic]) {
					that.camera_frames[topic].add(that.camera_frustum_visuals[topic]);
				}
			} else {
				that.camera_frustum_geometry[topic].setFromPoints(frustum_points);
			}
		});

		// detections from Detection3DArray
		let dirty_detection_topics = Object.keys(this.dirty_detection_results);
		dirty_detection_topics.forEach((topic) => {
			let results = that.dirty_detection_results[topic];
			if (!results) return;
			delete that.dirty_detection_results[topic];

			if (!that.sources.topicSubscribed(topic)) return;

			let detection_points = []; //all for this topic
			let frame_base = new THREE.Vector3(0.0, 0.0, 0.0);
			for (let i = 0; i < results.length; i++) {
				detection_points.push(frame_base);
				detection_points.push(results[i].points[0]);
			}

			if (!that.detection_lines[topic]) {
				let color = new THREE.Color(0xff00ff);
				const material = new THREE.LineBasicMaterial({
					color: color,
					linewidth: 1,
					transparent: true,
					opacity: 0.95,
				});

				that.detection_lines_geometry[topic] =
					new THREE.BufferGeometry().setFromPoints(detection_points);

				that.detection_lines[topic] = new THREE.LineSegments(
					that.detection_lines_geometry[topic],
					material,
				);
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

		super.renderingLoop(); //description-tf render
	}

	onModelRemoved() {
		super.onModelRemoved();
		let that = this;

		this.base_link_frame = null;

		let laser_topics = this.laser_visuals ? Object.keys(this.laser_visuals) : [];
		if (this.laser_frames)
			laser_topics = laser_topics.concat(Object.keys(this.laser_frames));
		console.log("Robot removed, clearing laser topics", laser_topics);
		laser_topics.forEach((topic) => {
			that.clearLaser(topic);
		});

		let range_topics = this.range_visuals
			? [].concat(Object.keys(this.range_visuals))
			: [];
		console.log("Robot removed, clearing range topics", range_topics);
		range_topics.forEach((topic) => {
			that.clearRange(topic);
		});

		let detection_topics = this.detection_lines
			? [].concat(Object.keys(this.detection_lines))
			: [];
		console.log("Robot removed, clearing detection topics", detection_topics);
		detection_topics.forEach((topic) => {
			that.clearDetections(topic);
		});

		let camera_frustum_visuals = this.camera_frustum_visuals
			? [].concat(Object.keys(this.camera_frustum_visuals))
			: [];
		console.log("Robot removed, clearing camera frustums", camera_frustum_visuals);
		camera_frustum_visuals.forEach((topic) => {
			that.clearCameraInfo(topic);
		});
	}

	onLaserData(topic, scan) {
		if (!this.robot_model || this.panel.paused) {
			return;
		}

		let scan_ns_stamp =
			scan.header.stamp.sec * 1000000000 + scan.header.stamp.nanosec;

		if (!this.latest_scan_data_stamps[topic]) {
			this.latest_scan_data_stamps[topic] = -1;
		}
		if (this.latest_scan_data_stamps[topic] > scan_ns_stamp) {
			if (!this.scan_older_stamp_drops[topic]) {
				this.scan_older_stamp_drops[topic] = 0;
			}
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

		let frame_id = scan.header.frame_id;

		if (!this.laser_frames[topic])
			this.laser_frames[topic] = this.robot_model.getFrame(frame_id);

		if (!this.laser_frames[topic]) {
			if (!this.laser_frames_error_logged) this.laser_frames_error_logged = {};
			if (!this.laser_frames_error_logged[topic]) {
				this.laser_frames_error_logged[topic] = true; //only log once
				let msg =
					'Frame "' +
					frame_id +
					'" not found in robot model for laser data from ' +
					topic;
				this.panel.ui.showNotification(msg, "error");
				console.error(msg);
			}
			return;
		} else if (
			this.laser_frames_error_logged &&
			this.laser_frames_error_logged[topic]
		) {
			delete this.laser_frames_error_logged[topic];
		}

		let laser_points = [];
		let laser_point_colors = [];
		const rot_axis = new THREE.Vector3(0, 0, 1); // +z is up
		const center = new THREE.Vector3(0, 0, 0);
		const ray_dir = new THREE.Vector3();
		let a = scan.angle_min;
		for (let i = 0; i < scan.ranges.length; i++) {
			let dist = scan.ranges[i];

			a += scan.angle_increment;

			if (dist !== null && dist < scan.range_max && dist > scan.range_min) {
				let p = new THREE.Vector3(dist, 0, 0);
				p.applyAxisAngle(rot_axis, a);
				laser_points.push(p); // first the point, then the center, otherwise flickers a lot on android (prob. something with culling)
				ray_dir.copy(p.clone().sub(center)).normalize();
				// let d = dist / 2.0;
				// laser_points.push(center.clone().add(ray_dir.multiplyScalar(scan.range_min)));
				laser_points.push(p.clone().sub(ray_dir.multiplyScalar(0.15)));
				laser_point_colors.push(0, 1, 1, 1);
				laser_point_colors.push(0, 0, 1, 0);
			}
		}

		let that = this;
		setTimeout(() => {
			that.dirty_laser_points[topic] = laser_points;
			that.dirty_laser_colors[topic] = laser_point_colors;
			that.renderDirty();
			that.clearLaserOnTimeout(topic);
		}, this.laser_delay);
	}

	clearLaserOnTimeout(topic) {
		if (this.clear_laser_timeout[topic])
			clearTimeout(this.clear_laser_timeout[topic]);

		let that = this;
		this.clear_laser_timeout[topic] = setTimeout(() => {
			if (that.panel.paused) {
				//don't clear while paused
				that.clearLaserOnTimeout(topic);
				return;
			}

			that.dirty_laser_points[topic] = [];
			that.dirty_laser_colors[topic] = [];
			that.renderDirty();
		}, 300);
	}

	clearLaser(topic) {
		if (this.laser_visuals[topic]) {
			this.laser_visuals[topic].removeFromParent();
			delete this.laser_visuals[topic];
		}
		if (this.laser_frames[topic]) {
			delete this.laser_frames[topic];
		}
	}

	onPGUpdated(ev) {
		// console.log('Pose grapth updated', e);
	}

	onRangeData(topic, range) {
		if (!this.robot_model || this.panel.paused) return;

		let frame_id = range.header.frame_id;
		let f = this.robot_model.getFrame(frame_id);
		if (!f) {
			let msg =
				'Frame "' +
				frame_id +
				'" not found in robot model for range data from ' +
				topic;
			this.panel.ui.showNotification(msg, "error");
			console.error(msg);
			return;
		}

		if (!this.range_visuals[topic]) {
			let a_tan = Math.tan(range.field_of_view / 2.0);
			let r = a_tan * range.max_range * 2.0;
			const geometry = new THREE.ConeGeometry(r, range.max_range, 32);
			geometry.rotateZ((90 * Math.PI) / 180);
			geometry.translate(range.max_range / 2.0, 0, 0);
			let color = new THREE.Color(0xffff00);
			const material = new THREE.MeshBasicMaterial({
				color: color,
				transparent: true,
				opacity: 0.85,
			});
			const cone = new THREE.Mesh(geometry, material);
			cone.castShadow = false;
			cone.renderOrder = 2;
			this.range_visuals[topic] = {
				cone: cone,
				color: color,
				material: material,
			};
			f.add(cone);
		}

		let gageVal =
			(Math.min(Math.max(range.range, 0), range.max_range) * 100.0) /
			range.max_range;
		gageVal = gageVal / 100.0;
		let color = null;
		if (gageVal < 0.5) color = lerpColor("#ff0000", "#2696FB", gageVal * 2.0);
		else color = lerpColor("#2696FB", "#ffffff", (gageVal - 0.5) * 2.0);

		if (range.range < range.max_range - 0.001) {
			this.range_visuals[topic].material.color.set(color);
			this.range_visuals[topic].material.opacity = Math.max(0.99 - gageVal, 0.2);
			this.range_visuals[topic].cone.scale.set(gageVal, gageVal, gageVal);
		} else {
			this.range_visuals[topic].cone.scale.set(0, 0, 0);
		}

		this.renderDirty();
	}

	clearRange(topic) {
		if (this.range_visuals[topic]) {
			this.range_visuals[topic].cone.removeFromParent();
			delete this.range_visuals[topic];
		}
	}

	onDetectionsData(topic, data) {
		if (!this.robot_model || this.panel.paused) return;

		if (!this.overlays[topic] || !this.overlays[topic].config) return; // wait for config

		let frame_id = data.header.frame_id;
		let f = this.robot_model.getFrame(frame_id);
		if (!f) {
			if (!this.detection_frames_error_logged)
				this.detection_frames_error_logged = {};
			if (!this.detection_frames_error_logged[topic]) {
				this.detection_frames_error_logged[topic] = true; //only log once
				let msg =
					'Frame "' +
					frame_id +
					'" not found in robot model for detection data from ' +
					topic;
				this.panel.ui.showNotification(msg, "error");
				console.error(msg);
			}
			return;
		} else if (
			this.detection_frames_error_logged &&
			this.detection_frames_error_logged[topic]
		) {
			delete this.detection_frames_error_logged[topic];
		}
		this.detection_frames[topic] = f;

		// const center = new THREE.Vector3(0, 0, 0);

		this.dirty_detection_results[topic] = [];

		// console.log(data);

		for (let i = 0; i < data.detections.length; i++) {
			let res = data.detections[i].results[0];
			let center = new THREE.Vector3(
				res["pose"]["pose"]["position"]["x"],
				res["pose"]["pose"]["position"]["y"],
				res["pose"]["pose"]["position"]["z"],
			);
			let scale = new THREE.Vector3(
				data.detections[i]["bbox"]["size"]["x"],
				data.detections[i]["bbox"]["size"]["y"],
				data.detections[i]["bbox"]["size"]["z"],
			);
			let rotation = new THREE.Quaternion(
				res["pose"]["pose"]["orientation"]["x"],
				res["pose"]["pose"]["orientation"]["y"],
				res["pose"]["pose"]["orientation"]["z"],
				res["pose"]["pose"]["orientation"]["w"],
			);
			let d = {
				class_id: res.hypothesis.class_id,
				score: res.hypothesis.score,
				points: [center],
			};

			this.dirty_detection_results[topic].push(d);

			if (!this.detection_labels[topic]) this.detection_labels[topic] = [];

			let l = "Class " + d.class_id;
			if (
				this.overlays[topic].config["nn_detection_labels"] &&
				this.overlays[topic].config["nn_detection_labels"][d.class_id]
			)
				l = this.overlays[topic].config["nn_detection_labels"][d.class_id];
			l += " (" + d.score.toFixed(2) + ")\n";
			+"[" +
				center.x.toFixed(2) +
				";" +
				center.y.toFixed(2) +
				";" +
				center.z.toFixed(2) +
				"]";
			if (!this.detection_labels[topic][i]) {
				const el = document.createElement("div");
				el.className = "detection_label";
				const label2d = new CSS2DObject(el);
				let that = this;
				el.addEventListener("pointerdown", function (ev) {
					// that.setCameraTargetPosition(center.clone().applyMatrix4(f.matrixWorld));
					let m = that.detection_markers[topic][i];
					console.log(m, topic, i, that.detection_markers);
					let pos = new THREE.Vector3();
					m.getWorldPosition(pos);
					that.setCameraTargetPosition(pos);
					ev.preventDefault();
				});
				label2d.center.set(0.5, 0);
				f.add(label2d);
				this.detection_labels[topic][i] = label2d;
			}
			let label_el = this.detection_labels[topic][i];
			label_el.element.textContent = l;
			label_el.element.hidden = false;
			label_el.position.set(center.x, center.y, center.z);

			if (!this.detection_markers[topic]) this.detection_markers[topic] = [];

			let marker_el = null;
			if (!this.detection_markers[topic][i]) {
				const geometry = new THREE.BoxGeometry(1, 1, 1);
				const material = new THREE.MeshBasicMaterial({
					color: 0xff00ff,
					transparent: true,
					opacity: 0.5,
				});
				const cube = new THREE.Mesh(geometry, material);
				f.add(cube);
				this.detection_markers[topic][i] = cube;
			}
			marker_el = this.detection_markers[topic][i];
			marker_el.visible = true;
			marker_el.position.copy(center);
			marker_el.quaternion.copy(rotation);
			marker_el.scale.copy(scale);
		}

		// hide excess instances of labels and markers rather than destroying them
		if (this.detection_labels[topic]) {
			for (
				let i = data.detections.length;
				i < this.detection_labels[topic].length;
				i++
			) {
				this.detection_labels[topic][i].element.hidden = true;
			}
		}
		if (this.detection_markers[topic]) {
			for (
				let i = data.detections.length;
				i < this.detection_markers[topic].length;
				i++
			) {
				this.detection_markers[topic][i].visible = false;
			}
		}

		this.clearDetectionsOnTimeout(topic);
	}

	clearDetectionsOnTimeout(topic) {
		if (this.clear_detections_timeout[topic])
			clearTimeout(this.clear_detections_timeout[topic]);

		let that = this;
		this.clear_detections_timeout[topic] = setTimeout(() => {
			if (that.panel.paused) {
				//don't clear while paused
				that.clearDetectionsOnTimeout(topic);
				return;
			}

			that.dirty_detection_results[topic] = [];
			if (this.detection_labels[topic]) {
				for (let i = 0; i < this.detection_labels[topic].length; i++) {
					this.detection_labels[topic][i].element.hidden = true;
				}
			}
			if (this.detection_markers[topic]) {
				for (let i = 0; i < this.detection_markers[topic].length; i++) {
					this.detection_markers[topic][i].visible = false;
				}
			}
			that.renderDirty();
		}, 300);
	}

	clearDetections(topic) {
		if (this.detection_lines[topic]) {
			this.detection_lines[topic].removeFromParent();
			delete this.detection_lines[topic];
		}
		if (this.detection_frames[topic]) delete this.detection_frames[topic];
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
		if (this.detection_markers[topic]) {
			for (let i = 0; i < this.detection_markers[topic].length; i++) {
				this.detection_markers[topic][i].removeFromParent();
			}
			delete this.detection_markers[topic];
		}
	}

	// this model ignores distorion (is it a problem or good enough?)
	calculatePinholeFrustum(cameraInfo, near, far) {
		const fx = cameraInfo.k[0];
		const fy = cameraInfo.k[4];
		const cx = cameraInfo.k[2];
		const cy = cameraInfo.k[5];

		const width = cameraInfo.width;
		const height = cameraInfo.height;

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

	onCameraInfoData(topic, data) {
		if (!this.robot_model || this.panel.paused) return;

		if (!this.overlays[topic] || !this.overlays[topic].config) return; // always wait for config

		let frame_id = data.header.frame_id;
		if (this.overlays[topic].config["force_frame_id"])
			frame_id = this.overlays[topic].config["force_frame_id"];
		let f = frame_id ? this.robot_model.getFrame(frame_id) : null;
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
			this.overlays[topic].config && this.overlays[topic].config["frustum_near"]
				? this.overlays[topic].config["frustum_near"]
				: 0.01;
		let far =
			this.overlays[topic].config && this.overlays[topic].config["frustum_far"]
				? this.overlays[topic].config["frustum_far"]
				: 2.0;

		let frustum = this.calculatePinholeFrustum(data, near, far);

		let frustum_pts = [
			frustum.nearTopLeft,
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
			frustum.farTopLeft,
		];
		this.dirty_camera_frustums[topic] = frustum_pts;
		this.renderDirty();
	}

	clearCameraInfo(topic) {
		if (this.camera_frustum_visuals[topic]) {
			this.camera_frustum_visuals[topic].removeFromParent();
			delete this.camera_frustum_visuals[topic];
		}
	}

	onCostmapData(topic, costmap) {
		// TODO
	}

	setLaserDelay(val) {
		this.laser_delay = val;
		$("#laser_delay_ctrl_" + this.panel.n + " .val").html(
			"Laser delay: " + this.laser_delay.toFixed(0) + "ms",
		);
	}

	setupMenu(menu_els) {
		super.setupMenu(menu_els);

		let that = this;

		// experimental laser delay control (doesn't seem to synchronize laser and odometry)
		// if (this.sources.hasType('sensor_msgs/msg/LaserScan')) {

		//     let line_el = $('<div class="menu_line plus_minus_ctrl" id="laser_delay_ctrl_'+this.panel.n+'"></div>');
		//     let minus_btn = $('<span class="minus">-</span>');
		//     let val_btn = $('<button class="val" title="Reset delay">Laser delay: '+this.laser_delay.toFixed(0)+'ms</button>');
		//     let plus_btn = $( '<span class="plus">+</span>');
		//     line_el.append([ minus_btn, val_btn, plus_btn]);

		//     plus_btn.click(function(ev) {
		//         that.setLaserDelay(that.laser_delay + 10);
		//     });

		//     minus_btn.click(function(ev) {
		//         let val = that.laser_delay - 10;
		//         if (val < 0)
		//             val = 0;
		//         that.setLaserDelay(val);
		//     });

		//     val_btn.click(function(ev) {
		//         that.setLaserDelay(0);
		//     });

		//     menu_els.push(line_el);
		// }
	}
}
