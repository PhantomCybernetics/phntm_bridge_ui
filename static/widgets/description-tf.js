import { lerpColor, linkifyURLs, lerp, deg2rad, rad2deg } from "../inc/lib.js";
import * as THREE from "three";
import { STLLoader } from "stl-loader";
import { ColladaLoader } from "collada-loader";
import { OrbitControls } from "orbit-controls";
import URDFLoader from "urdf-loader";
import { CSS2DRenderer, CSS2DObject } from "css-2d-renderer";
import { MultiTopicSource } from "./inc/multitopic.js";
import { Vector3, Quaternion, LoadingManager } from "three";

export class DescriptionTFWidget extends EventTarget {
	static label = "Robot description (URFD) + Transforms";
	static default_width = 5;
	static default_height = 4;

	static L_VISUALS = 1;
	static L_COLLIDERS = 2;
	static L_JOINTS = 3;
	static L_JOINT_LABELS = 4;
	static L_LINKS = 5;
	static L_LINK_LABELS = 6;
	static L_POSE_GRAPH = 7;
	static L_ROS_ORIGIN_MARKER = 8;
	static L_ROS_ORIGIN_LABEL = 9;

	static ROS_SPACE_KEY = "ROS_SPACE";

	constructor(panel, start_loop = true) {
		super();

		this.panel = panel;

		// defaults overwritten by url params
		this.vars = {
			render_collisions: true,
			render_visuals: true,
			render_labels: false,
			render_links: true,
			render_joints: false,
			render_ros_origin: false,
			follow_target: true,
			perspective_camera: true,
			fix_robot_base: false, // robot will be fixed in place
			render_pose_graph: false,
			render_ground_plane: true,
			render_stats: false,
			// passthrough vars:
			_focus_target: "",
			_cam_position_offset: "",
		};

		this.panel.fps_el.addClass("rendering_stats");
		this.panel.show_fps_menu_label = "Show rendering stats";

		this.pose_graph = [];
		this.pose_graph_size = 500; // keeps this many nodes in pg (TODO: to robot's config?)

		// this.latest_tf_stamps = {};
		// this.transforms_queue = [];
		this.smooth_transforms_queue = {};
		this.camera_pose_initialized = false; // first hard set pose, then smooth lerp
		this.camera_distance_initialized = false; // determine distance to target if false; only once (if target autodetected)
		this.robot_pose_initialized = false; // true after 1st base transform
		this.camera_target_pose_initialized = false; // 1st cam to target will not lerp
		this.set_ortho_camera_zoom = -1; // if > 0, used on camera init
		this.set_camera_view = null; // animate to position if set
		// this.last_tf_stamps = {};

		this.stats_model_tris = 0;
		this.stats_model_verts = 0;

		let that = this;

		function LoadingManagerURLMofifier(url) {

			console.log("Loader requesting " + url);

			// if (url.indexOf(panel.ui.client.getBridgeFileUrlPrefix()) === 0) {
			// 	url = url.replace(panel.ui.client.getBridgeFileUrlPrefix(), '');
			// 	console.warn("Loader actually requesting " + url);
			// }

			if (url.indexOf("http:/") === 0 || url.indexOf("https:/") === 0) return url;

			if (url.indexOf("package:/") !== 0 && url.indexOf("file:/") !== 0)
				return url;

			let url_fw = panel.ui.client.getBridgeFileUrl(url);
			console.log(">> URDF Loader requesting " + url + " > " + url_fw);
			return url_fw;
		}

		this.loading_manager = new THREE.LoadingManager();
		this.loading_manager.setURLModifier(LoadingManagerURLMofifier);
		this.tex_loader = new THREE.TextureLoader(this.loading_manager);
		this.urdf_loader = new URDFLoader(this.loading_manager);
		this.urdf_loader.parseCollision = true;
		this.urdf_loader.packages = (targetPkg) => {
			return "package://" + targetPkg; // put back the url scheme removed by URDFLoader
		};
		this.robot_model = null; // urdf goes here
		this.robot = new THREE.Object3D();

		this.joint_markers = [];
		this.link_markers = [];

		this.missing_transform_error_logged = {};

		this.urdf_loader.loadMeshCb = (path, manager, done_cb) => {
			console.log("Loaded mesh from " + path);

			if (/\.stl$/i.test(path)) {
				const loader = new STLLoader(manager);
				loader.load(path, (geom) => {
					let stl_base_mat = new THREE.MeshStandardMaterial({
						color: 0xffffff,
						side: THREE.DoubleSide,
						depthWrite: true,
					});
					let clean_model = new THREE.Mesh(geom, stl_base_mat);
					that.cleanURDFModel(clean_model, true);
					done_cb(clean_model);
				});
			} else if (/\.dae$/i.test(path)) {
				const loader = new ColladaLoader(manager);
				loader.load(path, (dae) => {
					let clean_model = dae.scene;
					that.cleanURDFModel(clean_model, true);
					done_cb(clean_model);
				});
			} else {
				console.error(
					`Could not load model at ${path}.\nNo loader available`,
				);
			}
		};
		this.loading_manager.onLoad = () => {
			console.info("Robot URDF loader done loading", that.robot_model);
			that.renderDirty();
		};
		this.loading_manager.onError = (url) => {
			console.error("Error loading mesh for: " + url);
			that.panel.ui.showNotification("Error loading mesh", "error", url);
			that.renderDirty();
		};

		$("#panel_widget_" + panel.n).addClass("enabled imu");
		$("#panel_widget_" + panel.n).data("gs-no-move", "yes");

		// camera controls
		this.perspective_btn = $(
			'<span class="panel-btn perspective-btn" title="Perspective"></span>',
		);
		this.panel.panel_btns.append(this.perspective_btn);

		this.focus_btn = $(
			'<span class="panel-btn focus-btn" title="Focus camera on selection"></span>',
		);
		this.panel.panel_btns.append(this.focus_btn);

		let view_select = $('<span class="panel-select view-select"></span>');
		let view_select_content = $('<span class="panel-select-content"></span>');
		this.view_camera_top = $('<span data-focus="top">Top</span>');
		this.view_camera_left = $('<span data-focus="left">Left</span>');
		this.view_camera_right = $('<span data-focus="right">Right</span>');
		this.view_camera_front = $('<span data-focus="front">Front</span>');
		this.view_camera_back = $('<span data-focus="back">Back</span>');
		this.view_camera_bottom = $('<span data-focus="bottom">Bottom</span>');
		let view_btns = [
			this.view_camera_top,
			this.view_camera_left,
			this.view_camera_right,
			this.view_camera_front,
			this.view_camera_back,
			this.view_camera_bottom,
		];
		view_select_content.append(view_btns);
		view_btns.forEach((btn_el) => {
			$(btn_el).click(() => {
				that.moveCameraToView($(btn_el).attr("data-focus"));
			});
		});
		view_select.append(view_select_content);
		this.panel.panel_btns.append(view_select);

		this.labels_btn = $(
			'<span class="panel-btn labels-btn" title="Display model labels"></span>',
		);
		this.panel.panel_btns.append(this.labels_btn);

		[panel.widget_width, panel.widget_height] = panel.getAvailableWidgetSize();

		this.scene = new THREE.Scene();

		this.renderer = new THREE.WebGLRenderer({
			antialias: false,
			precision: "highp", // TODO: med & low are really bad on some devices, there could be a switch for this in the menu
		});
		this.renderer.localClippingEnabled = true;
		this.renderer.info.autoReset = false;
		this.renderer.shadowMap.enabled = true;
		this.renderer.setSize(panel.widget_width, panel.widget_height);
		this.renderer.setPixelRatio(window.devicePixelRatio);
		document
			.getElementById("panel_widget_" + panel.n)
			.appendChild(this.renderer.domElement);

		this.labelRenderer = new CSS2DRenderer();
		this.labelRenderer.setSize(panel.widget_width, panel.widget_height);
		this.labelRenderer.domElement.style.position = "absolute";
		this.labelRenderer.domElement.style.top = "0px";
		document
			.getElementById("panel_widget_" + panel.n)
			.appendChild(this.labelRenderer.domElement);

		// this.rendering_stats_el = $('<span id="rendering_stats_'+panel.n+'" class="rendering_stats"></span>');
		// $('#panel_widget_'+panel.n).append(this.rendering_stats_el);
		// this.stats_fps = 0;
		// this.stats_model_verts = 0;
		// this.stats_model_tris = 0;
		// this.stats_model_tris_rendered = 0;
		// this.stats_model_lines_rendered = 0;

		this.camera_pos = new THREE.Vector3(1, 0.5, 1);
		this.camera_target = null;
		this.camera_target_key = null;

		this.ros_space = new THREE.Object3D();
		this.ros_origin_axis_el = null;
		this.ros_origin_label_el = null;
		this.ros_space.add(this.robot);
		this.robot.position.set(0, 0, 0);
		this.robot.quaternion.set(0, 0, 0, 1);
		this.ros_space_default_rotation = new THREE.Quaternion().setFromEuler(
			new THREE.Euler(-Math.PI / 2.0, 0.0, 0.0),
		); // ROS uses +z up
		this.scene.add(this.ros_space);
		this.ros_space.quaternion.copy(this.ros_space_default_rotation);
		this.ros_space_offset_set = false; // will be set on 1st base tf data

		this.skybox_name = "acid";
		this.skybox_textures = {};
		this.cube_loader = new THREE.CubeTextureLoader();

		const light = new THREE.SpotLight(0xffffff, 30.0, 0, Math.PI / 10);
		light.castShadow = true; // default false
		this.scene.add(light);
		light.position.set(0, 5, 0); // will stay 5m above the model
		light.shadow.mapSize.width = 5 * 1024; // default
		light.shadow.mapSize.height = 5 * 1024; // default
		light.shadow.camera.near = 0.5; // default
		light.shadow.camera.far = 10; // default

		// light.shadow.bias= -0.002;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap
		this.light = light;

		const ambience = new THREE.AmbientLight(0x606060); // soft white light
		this.scene.add(ambience);

		// this.makeMark(this.scene, 'SCENE ORIGIN', 0, 0, 2.0, true, 1.0);

		panel.resizeEventHandler = () => {
			that.labelRenderer.setSize(panel.widget_width, panel.widget_height);
			if (panel.widget_width < 250) {
				$(panel.grid_widget).addClass("buttons-hidden");
			} else {
				$(panel.grid_widget).removeClass("buttons-hidden");
			}
			that.updateOrthoCameraAspect();
			that.renderDirty();
		};

		this.sources = new MultiTopicSource(this);
		this.sources.add(
			"tf2_msgs/msg/TFMessage",
			"Static transforms source",
			"/tf_static",
			1,
			(topic, tf) => {
				that.onTFData(topic, tf);
			},
		);
		this.sources.add(
			"tf2_msgs/msg/TFMessage",
			"Real-time transforms source",
			"/tf",
			-1,
			(topic, tf) => {
				that.onTFData(topic, tf);
			},
		);
		this.sources.add(
			"std_msgs/msg/String",
			"URDF description source",
			"/robot_description",
			1,
			(topic, tf) => {
				that.onDescriptionData(topic, tf);
			},
		);

		// this.set_camera_target_pos_on_description = null;
		// this.set_camera_target_offset_on_description = null;
		const camera_target_pos_geometry = new THREE.SphereGeometry(0.01, 32, 16);
		const camera_target_pos_material = new THREE.MeshBasicMaterial({
			color: 0xff00ff,
		});
		this.camera_target_pos = new THREE.Mesh(
			camera_target_pos_geometry,
			camera_target_pos_material,
		);
		this.camera_target_pos.position.set(0, 0, 0); // adjusted by url
		this.camera_target_pos.visible = false; //enable when debugging
		this.scene.add(this.camera_target_pos);

		this.parseUrlParts(this.panel.custom_url_vars);

		// - url vars parsed here - //

		// cam follow action
		this.last_camera_url_update = Number.NEGATIVE_INFINITY;
		if (this.vars.follow_target) {
			this.focus_btn.addClass("on");
		}
		this.focus_btn.click(function (ev) {
			that.vars.follow_target = !$(this).hasClass("on");
			if (that.vars.follow_target) {
				$(this).addClass("on");
				that.controls.enablePan = false;
			} else {
				$(this).removeClass("on");
				that.controls.enablePan = true;
				that.camera_target.getWorldPosition(that.camera_target_pos.position);
			}
			that.makeRobotMarkers();
			that.makeROSOriginMarker();
			that.panel.ui.updateUrlHash();
			that.renderDirty();
		});

		// labels toggle
		if (this.vars.render_labels) {
			this.labels_btn.addClass("on");
		}
		this.labels_btn.click(function (ev) {
			that.vars.render_labels = !$(this).hasClass("on");
			if (that.vars.render_labels) {
				$(this).addClass("on");
				if (that.vars.render_joints)
					that.camera.layers.enable(DescriptionTFWidget.L_JOINT_LABELS);
				if (that.vars.render_links)
					that.camera.layers.enable(DescriptionTFWidget.L_LINK_LABELS);
				if (that.vars.render_ros_origin)
					that.camera.layers.enable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
			} else {
				$(this).removeClass("on");
				that.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS);
				that.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);
				that.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
			}
			// that.makeRobotMarkers();
			that.panel.ui.updateUrlHash();
			that.renderDirty();
		});

		// camera type
		if (this.vars.perspective_camera) {
			this.perspective_btn.addClass("on");
		} else {
			this.perspective_btn.removeClass("on");
		}
		this.perspective_btn.click(function (ev) {
			that.vars.perspective_camera = !$(this).hasClass("on");
			if (that.vars.perspective_camera) {
				$(this).addClass("on");
			} else {
				$(this).removeClass("on");
			}
			that.makeCamera();
			that.panel.ui.updateUrlHash();
			that.renderDirty();
		});

		// make camera (persp/orto) when type, pos and focus is determined
		this.makeCamera();

		if (!this.camera_pose_initialized) {
			this.camera.position.copy(this.camera_pos);
			this.camera.lookAt(this.camera_target_pos);
		}

		this.controls = new OrbitControls(this.camera, this.labelRenderer.domElement);
		// this.controls = new TrackballControls(this.camera, this.labelRenderer.domElement);
		this.controls.enablePan = !this.vars.follow_target;
		this.renderer.domElement.addEventListener("pointerdown", (ev) => {
			ev.preventDefault(); // stop from moving the panel
		});
		this.controls.addEventListener("change", () => {
			this.controlsChanged();
		});
		this.controls.addEventListener("end", () => {
			that.panel.ui.updateUrlHash(); // saves camera pos in url
		});
		this.controls_dirty = false;

		this.controls.target = this.camera_target_pos.position; // panning moves the target
		if (!this.camera_pose_initialized) {
			this.controls.update();
		}

		light.lookAt(this.camera_target_pos);

		const plane_geometry = new THREE.PlaneGeometry(100, 100);

		// make ground plane
		this.tex_loader.load("/static/graph/tiles.png", (plane_tex) => {
			const plane_material = new THREE.MeshPhongMaterial({
				color: 0xffffff,
				side: THREE.BackSide,
			});
			plane_tex.wrapS = THREE.RepeatWrapping;
			plane_tex.wrapT = THREE.RepeatWrapping;
			plane_tex.repeat.set(100, 100);
			plane_material.map = plane_tex;

			that.ground_plane = new THREE.Mesh(plane_geometry, plane_material);
			that.ground_plane.rotation.setFromVector3(
				new THREE.Vector3(Math.PI / 2, 0, 0),
			);
			that.ground_plane.position.set(0, 0, 0);
			that.ground_plane.receiveShadow = true;
			that.ground_plane.visible = that.vars.render_ground_plane;
			that.scene.add(that.ground_plane);
		});

		this.makeROSOriginMarker();
		// this.makeMark(this.robot, 'ROBOT_ORIGIN', 0, 0, 1.0, true, 1.0);

		this.camera.layers.enableAll();
		if (!this.vars.render_visuals)
			this.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
		if (!this.vars.render_collisions)
			this.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS); //colliders off by default
		if (!this.vars.render_joints) {
			this.camera.layers.disable(DescriptionTFWidget.L_JOINTS);
			this.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS);
		}
		if (!this.vars.render_links) {
			this.camera.layers.disable(DescriptionTFWidget.L_LINKS);
			this.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);
		}
		if (!this.vars.render_ros_origin) {
			this.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_MARKER);
			this.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
		}
		if (!this.vars.render_labels) {
			this.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS);
			this.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);
			this.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
		}
		if (!this.vars.render_pose_graph) {
			this.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
		}
		this.collider_mat = new THREE.MeshStandardMaterial({
			color: 0xffff00,
			emissive: 0xffff00,
			wireframe: true,
		});

		if (start_loop) {
			this.rendering = true;
			this.renderDirty();
			requestAnimationFrame((t) => this.renderingLoop());
		}
	}

	makeCamera() {
		let old_camera = this.camera;

		let aspect = this.panel.widget_width / this.panel.widget_height;

		if (this.vars.perspective_camera) {
			this.camera = new THREE.PerspectiveCamera(75, aspect, 0.01, 1000);
		} else {
			const frustumSize = 1.0;
			this.camera = new THREE.OrthographicCamera(
				(frustumSize * aspect) / -2.0,
				(frustumSize * aspect) / 2.0,
				frustumSize / 2.0,
				frustumSize / -2.0,
				-1000,
				1000,
			); // negative near to prvent clipping while keeping the zoom functionality
			if (this.set_ortho_camera_zoom > 0) {
				//set zoom from url
				this.camera.zoom = this.set_ortho_camera_zoom;
				this.set_ortho_camera_zoom = -1;
			}
		}

		this.scene.add(this.camera);
		if (old_camera) {
			let old_type = old_camera.isOrthographicCamera ? "ORTHO" : "PERSP";
			console.log(
				"Old " +
					old_type +
					" camera pos was [" +
					old_camera.position.x +
					";" +
					old_camera.position.y +
					";" +
					old_camera.position.z +
					"]; zoom " +
					old_camera.zoom,
			);

			this.camera.position.copy(old_camera.position);
			this.camera.quaternion.copy(old_camera.quaternion);
			this.camera.zoom = 1.0;

			if (this.vars.perspective_camera) {
				if (old_camera.isOrthographicCamera) {
					// compensate for ortho > persp
					const targetDistance = this.camera.position.distanceTo(
						this.camera_target_pos.position,
					);
					const visibleHeight =
						(old_camera.top - old_camera.bottom) / old_camera.zoom;
					const fovRadians = THREE.MathUtils.degToRad(this.camera.fov);
					const requiredDistance = visibleHeight / 2 / Math.tan(fovRadians / 2);
					const moveDistance = requiredDistance - targetDistance;
					const forwardVector = new THREE.Vector3(0, 0, 1).applyQuaternion(
						this.camera.quaternion,
					);
					this.camera.position.add(forwardVector.multiplyScalar(moveDistance));
				}
			} else {
				if (old_camera.isOrthographicCamera) {
					this.camera.zoom = old_camera.zoom; // keep ortho zoom
				} else {
					// compensate for perp > ortho
					const targetDistance = this.camera.position.distanceTo(
						this.camera_target_pos.position,
					);
					const fovRadians = THREE.MathUtils.degToRad(old_camera.fov);
					const visibleHeight = 2 * Math.tan(fovRadians / 2) * targetDistance;

					// Calculate the zoom factor for the orthographic camera
					this.camera.zoom = (2 * this.camera.top) / visibleHeight;
				}
			}

			old_camera.removeFromParent();
			this.camera.updateProjectionMatrix();
			this.camera.layers = old_camera.layers;
			this.controls.object = this.camera;
			this.controls.update();
		}

		this.setSkybox();
	}

	updateOrthoCameraAspect() {
		if (this.camera.isOrthographicCamera) {
			const aspect = this.panel.widget_width / this.panel.widget_height;
			const frustumSize = 1.0;
			this.camera.left = (frustumSize * aspect) / -2.0;
			this.camera.right = (frustumSize * aspect) / 2.0;
			this.camera.top = frustumSize / 2.0;
			this.camera.bottom = frustumSize / -2.0;
			this.camera.updateProjectionMatrix();
			this.renderDirty();
		}
	}

	setSkybox(skybox_name) {
		if (this.vars.perspective_camera && this.skybox_name) {
			if (!this.skybox_textures[this.skybox_name]) {
				this.skybox_textures[this.skybox_name] = this.cube_loader.load([
					"/static/skyboxes/" + this.skybox_name + "/cubemap_0.png",
					"/static/skyboxes/" + this.skybox_name + "/cubemap_1.png",
					"/static/skyboxes/" + this.skybox_name + "/cubemap_2.png",
					"/static/skyboxes/" + this.skybox_name + "/cubemap_3.png",
					"/static/skyboxes/" + this.skybox_name + "/cubemap_4.png",
					"/static/skyboxes/" + this.skybox_name + "/cubemap_5.png",
				]);
			}
			this.scene.background = this.skybox_textures[this.skybox_name];
		} else {
			//skybox doesn't work with otrho cameras

			this.scene.background = new THREE.Color(0x000000); // Red color
		}
	}

	updateFps() {
		let dt = this.panel.last_fps_updated
			? Date.now() - this.panel.last_fps_updated
			: 0;
		let r = dt ? 1000 / dt : 0;
		this.panel.fps = this.last_frame_count
			? this.renderer.info.render.frame - this.last_frame_count
			: 0;
		this.panel.fps *= r;
		this.stats_model_tris_rendered = this.panel.fps
			? this.renderer.info.render.triangles / this.panel.fps
			: 0;
		this.stats_model_lines_rendered = this.panel.fps
			? this.renderer.info.render.lines / this.panel.fps
			: 0;

		this.last_frame_count = this.renderer.info.render.frame;
		this.renderer.info.reset(); // resets tris & lines but not frames

		return (
			this.panel.fps.toFixed(0) +
			" FPS<br>\n" +
			"Model: " +
			this.stats_model_verts.toLocaleString("en-US") +
			" verts, " +
			this.stats_model_tris.toLocaleString("en-US") +
			" tris<br>\n" +
			"Rendered: " +
			this.stats_model_lines_rendered.toLocaleString("en-US", {
				maximumFractionDigits: 0,
			}) +
			" lines, " +
			this.stats_model_tris_rendered.toLocaleString("en-US", {
				maximumFractionDigits: 0,
			}) +
			" tris"
		);
	}

	moveCameraToView(position) {
		let rwq = new THREE.Quaternion();
		if (
			this.vars.follow_target &&
			this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY
		)
			this.ros_space.getWorldQuaternion(rwq);
		else this.robot.getWorldQuaternion(rwq);

		let target_pos = new THREE.Vector3();
		let d = this.camera.position.distanceTo(this.camera_target_pos.position);
		let delta_rot = new THREE.Quaternion();
		const gl_offset = 0.0001; // avoiding gimbal lock of orbital controls with a tiny offset
		switch (position) {
			case "top":
				target_pos.set(-gl_offset, 0, d);
				delta_rot.setFromEuler(new THREE.Euler(0, 0, deg2rad(-90)));
				break; // in ros space
			case "left":
				target_pos.set(0, d, 0);
				delta_rot.setFromEuler(new THREE.Euler(deg2rad(-90), 0, deg2rad(180)));
				break;
			case "right":
				target_pos.set(0, -d, 0);
				delta_rot.setFromEuler(new THREE.Euler(deg2rad(90), 0, 0));
				break;
			case "front":
				target_pos.set(d, 0, 0);
				delta_rot.setFromEuler(new THREE.Euler(deg2rad(90), deg2rad(90), 0));
				break;
			case "back":
				target_pos.set(-d, 0, 0);
				delta_rot.setFromEuler(new THREE.Euler(deg2rad(90), deg2rad(-90), 0));
				break;
			case "bottom":
				target_pos.set(gl_offset, 0, -d);
				delta_rot.setFromEuler(new THREE.Euler(0, deg2rad(180), deg2rad(90)));
				break;
		}

		target_pos.applyQuaternion(rwq);
		this.controls.enableRotate = false;
		this.controls.enablePan = false;

		this.set_camera_view = {
			start: Date.now(),
			start_cam_position: new THREE.Vector3().copy(this.camera.position),
			start_cam_rotation: new THREE.Quaternion().copy(this.camera.quaternion),
			target_offset_pos: target_pos,
			target_rot: delta_rot,
		};
	}

	setupMenu(menu_els) {
		if (this.sources) {
			this.sources.setupMenu(menu_els);
		}

		let that = this;

		// render joints
		let render_joints_line_el = $('<div class="menu_line"></div>');
		let render_joints_label = $(
			'<label for="render_joints_' + this.panel.n + '">Render joints</label>',
		);
		let render_joints_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_joints ? "checked" : "") +
				' id="render_joints_' +
				this.panel.n +
				'" title="Render joints"/>',
		);
		render_joints_label.append(render_joints_cb).appendTo(render_joints_line_el);
		render_joints_cb.change(function (ev) {
			that.vars.render_joints = $(this).prop("checked");
			if (that.vars.render_joints) {
				that.camera.layers.enable(DescriptionTFWidget.L_JOINTS);
				if (that.vars.render_labels)
					that.camera.layers.enable(DescriptionTFWidget.L_JOINT_LABELS); //labels
			} else {
				that.camera.layers.disable(DescriptionTFWidget.L_JOINTS);
				that.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS); //labels
			}
			if (that.robot_model) that.makeRobotMarkers();
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(render_joints_line_el);

		// render links
		let render_links_line_el = $('<div class="menu_line"></div>');
		let render_links_label = $(
			'<label for="render_links_' + this.panel.n + '">Render links</label>',
		);
		let render_links_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_links ? "checked" : "") +
				' id="render_links_' +
				this.panel.n +
				'" title="Render links">',
		);
		render_links_label.append(render_links_cb).appendTo(render_links_line_el);
		render_links_cb.change(function (ev) {
			that.vars.render_links = $(this).prop("checked");
			if (that.vars.render_links) {
				that.camera.layers.enable(DescriptionTFWidget.L_LINKS);
				if (that.vars.render_labels)
					that.camera.layers.enable(DescriptionTFWidget.L_LINK_LABELS); //labels
			} else {
				that.camera.layers.disable(DescriptionTFWidget.L_LINKS);
				that.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS); //labels
			}
			if (that.robot_model) that.makeRobotMarkers();
			that.renderDirty();
		});
		menu_els.push(render_links_line_el);

		// render ros origin marker
		let render_ros_origin_line_el = $('<div class="menu_line"></div>');
		let render_ros_origin_label = $(
			'<label for="render_ros_origin_' + this.panel.n + '">Show ROS origin</label>',
		);
		let render_ros_origin_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_ros_origin ? "checked" : "") +
				' id="render_ros_origin_' +
				this.panel.n +
				'" title="Show ROS origin"/>',
		);
		render_ros_origin_label
			.append(render_ros_origin_cb)
			.appendTo(render_ros_origin_line_el);
		render_ros_origin_cb.change(function (ev) {
			that.vars.render_ros_origin = $(this).prop("checked");
			if (that.vars.render_ros_origin) {
				that.camera.layers.enable(DescriptionTFWidget.L_ROS_ORIGIN_MARKER);
				if (that.vars.render_labels)
					that.camera.layers.enable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
			} else {
				that.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_MARKER);
				that.camera.layers.disable(DescriptionTFWidget.L_ROS_ORIGIN_LABEL);
			}
			that.makeROSOriginMarker();
			that.renderDirty();
		});
		menu_els.push(render_ros_origin_line_el);

		// render visuals
		let render_visuals_line_el = $('<div class="menu_line"></div>');
		let render_visuals_label = $(
			'<label for="render_visuals_' + this.panel.n + '"">Show visuals</label>',
		);
		let render_visuals_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_visuals ? "checked" : "") +
				' id="render_visuals_' +
				this.panel.n +
				'" title="Render visuals"/>',
		);
		render_visuals_label.append(render_visuals_cb).appendTo(render_visuals_line_el);
		render_visuals_cb.change(function (ev) {
			that.vars.render_visuals = $(this).prop("checked");
			if (that.vars.render_visuals)
				that.camera.layers.enable(DescriptionTFWidget.L_VISUALS);
			else that.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(render_visuals_line_el);

		// render colliders
		let render_collisions_line_el = $('<div class="menu_line"></div>');
		let render_collisions_label = $(
			'<label for="render_collisions_' +
				this.panel.n +
				'"">Show collisions</label>',
		);
		let render_collisions_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_collisions ? "checked" : "") +
				' id="render_collisions_' +
				this.panel.n +
				'" title="Render collisions"/>',
		);
		render_collisions_label
			.append(render_collisions_cb)
			.appendTo(render_collisions_line_el);
		render_collisions_cb.change(function (ev) {
			that.vars.render_collisions = $(this).prop("checked");
			if (that.vars.render_collisions)
				that.camera.layers.enable(DescriptionTFWidget.L_COLLIDERS);
			else that.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS);
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(render_collisions_line_el);

		// fix base (robot will not move linearly, only rotate)
		let fix_base_line_el = $('<div class="menu_line"></div>');
		let fix_base_label = $(
			'<label for="fix_base_' + this.panel.n + '"">Fix robot base</label>',
		);
		let fix_base_cb = $(
			'<input type="checkbox" ' +
				(this.vars.fix_robot_base ? "checked" : "") +
				' id="fix_base_' +
				this.panel.n +
				'" title="Fix robot base"/>',
		);
		fix_base_label.append(fix_base_cb).appendTo(fix_base_line_el);
		fix_base_cb.change(function (ev) {
			that.vars.fix_robot_base = $(this).prop("checked");
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(fix_base_line_el);

		// render pose graph trail
		let render_pg_line_el = $('<div class="menu_line"></div>');
		let render_pg_label = $(
			'<label for="render_pg_' + this.panel.n + '"">Render trace</label>',
		);
		let render_pg_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_pose_graph ? "checked" : "") +
				' id="render_pg_' +
				this.panel.n +
				'" title="Render pose trace"/>',
		);
		render_pg_label.append(render_pg_cb).appendTo(render_pg_line_el);
		render_pg_cb.change(function (ev) {
			that.vars.render_pose_graph = $(this).prop("checked");
			if (that.vars.render_pose_graph)
				that.camera.layers.enable(DescriptionTFWidget.L_POSE_GRAPH);
			else that.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(render_pg_line_el);

		// render ground plane
		let render_grnd_line_el = $('<div class="menu_line"></div>');
		let render_grnd_label = $(
			'<label for="render_grnd_' + this.panel.n + '"">Ground plane</label>',
		);
		let render_grnd_cb = $(
			'<input type="checkbox" ' +
				(this.vars.render_ground_plane ? "checked" : "") +
				' id="render_grnd_' +
				this.panel.n +
				'" title="Render ground plane"/>',
		);
		render_grnd_label.append(render_grnd_cb).appendTo(render_grnd_line_el);
		render_grnd_cb.change(function (ev) {
			that.vars.render_ground_plane = $(this).prop("checked");
			that.ground_plane.visible = that.vars.render_ground_plane;
			// that.panel.ui.updateUrlHash();
			that.renderDirty();
		});
		menu_els.push(render_grnd_line_el);
	}

	onClose() {
		this.rendering = false; //kills the loop
		this.sources.close();

		this.controls.dispose();
		this.controls = null;
		this.scene.clear();
		this.scene = null;
		this.renderer.dispose();
		this.renderer = null;
	}

	getUrlHashParts(out_parts) {
		out_parts.push("f=" + (this.vars.follow_target ? "1" : "0"));

		// focus position or model node (in robot space)
		let focus_pos_robot_space;
		if (
			this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY &&
			this.vars.follow_target
		)
			focus_pos_robot_space = this.ros_space.worldToLocal(
				this.camera_target_pos.position.clone(),
			);
		else
			focus_pos_robot_space = this.robot.worldToLocal(
				this.camera_target_pos.position.clone(),
			);
		let focus_target = this.camera_target_key;
		if (!focus_target || !this.vars.follow_target) {
			// focus point in robot space
			focus_target =
				focus_pos_robot_space.x.toFixed(3) +
				"," +
				focus_pos_robot_space.y.toFixed(3) +
				"," +
				focus_pos_robot_space.z.toFixed(3);
		}
		this.vars._focus_target = focus_target;
		out_parts.push("ft=" + focus_target);

		// camera type
		out_parts.push("ct=" + (this.vars.perspective_camera ? "1" : "0"));

		// camera rotation and distance from focal target (in robot space)
		let cam_pos_robot_space;
		if (
			this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY &&
			this.vars.follow_target
		)
			cam_pos_robot_space = this.ros_space.worldToLocal(
				this.camera.position.clone(),
			);
		else cam_pos_robot_space = this.robot.worldToLocal(this.camera.position.clone());
		let cam_distance = cam_pos_robot_space.distanceTo(focus_pos_robot_space);
		let rwq = new THREE.Quaternion();
		if (focus_target == DescriptionTFWidget.ROS_SPACE_KEY)
			this.ros_space.getWorldQuaternion(rwq);
		else this.robot.getWorldQuaternion(rwq);
		let cam_rot_robot_space = rwq.invert().multiply(this.camera.quaternion.clone());

		const quat_precision = 10;
		let val =
			cam_rot_robot_space.x.toFixed(quat_precision) +
			"," +
			cam_rot_robot_space.y.toFixed(quat_precision) +
			"," +
			cam_rot_robot_space.z.toFixed(quat_precision) +
			"," +
			cam_rot_robot_space.w.toFixed(quat_precision) +
			"," +
			cam_distance.toFixed(3); // distance to target as 5th val
		if (!this.vars.perspective_camera)
			// cheaper to pass ortho zoom than to calculate respective offset on every change
			val += "," + this.camera.zoom.toFixed(3); // 6th val
		if (this.set_camera_target_offset) val = this.vars._cam_position_offset;
		this.vars._cam_position_offset = val;
		out_parts.push("cp=" + val);

		out_parts.push("jnt=" + (this.vars.render_joints ? "1" : "0"));
		out_parts.push("lnk=" + (this.vars.render_links ? "1" : "0"));
		out_parts.push("ro=" + (this.vars.render_ros_origin ? "1" : "0"));
		out_parts.push("lbl=" + (this.vars.render_labels ? "1" : "0"));
		out_parts.push("vis=" + (this.vars.render_visuals ? "1" : "0"));
		out_parts.push("col=" + (this.vars.render_collisions ? "1" : "0"));
		out_parts.push("fix=" + (this.vars.fix_robot_base ? "1" : "0"));
		out_parts.push("pg=" + (this.vars.render_pose_graph ? "1" : "0"));
		out_parts.push("grnd=" + (this.vars.render_ground_plane ? "1" : "0"));
		out_parts.push("s=" + (this.vars.render_stats ? "1" : "0"));
		this.sources.getUrlHashParts(out_parts);
	}

	parseUrlParts(custom_url_vars) {
		if (!custom_url_vars) return;
		custom_url_vars.forEach((kvp) => {
			let arg = kvp[0];
			let val = kvp[1];
			// console.warn('DRF got ' + arg +" > "+val);
			switch (arg) {
				case "f":
					this.vars.follow_target = parseInt(val) == 1;
					break;
				case "ft":
					this.vars._focus_target = val;
					if (val.indexOf(",") > 0) {
						let coords = val.split(",");
						let pos = new THREE.Vector3(
							parseFloat(coords[0]),
							parseFloat(coords[1]),
							parseFloat(coords[2]),
						);
						this.camera_target_pos.position.copy(
							this.robot.localToWorld(pos),
						);
						this.camera_target_key = null;
					} else {
						this.camera_target_key = val; // will be set on description
					}
					break;
				case "ct":
					this.vars.perspective_camera = parseInt(val) == 1;
					break;
				case "cp":
					this.vars._cam_position_offset = val;
					if (val.indexOf(",") > 0) {
						let coords = val.split(",");
						let cam_rot_robot_space = new THREE.Quaternion(
							parseFloat(coords[0]),
							parseFloat(coords[1]),
							parseFloat(coords[2]),
							parseFloat(coords[3]),
						).normalize();
						let dist_to_target = parseFloat(coords[4]);
						if (coords.length > 5)
							this.set_ortho_camera_zoom = parseFloat(coords[5]);

						this.set_camera_target_offset = {
							rotation: cam_rot_robot_space,
							distance: dist_to_target,
						};
						this.camera_distance_initialized = true; // don't autodetect
						this.camera_pose_initialized = true;
					}
					break;
				case "jnt":
					this.vars.render_joints = parseInt(val) == 1;
					break;
				case "lnk":
					this.vars.render_links = parseInt(val) == 1;
					break;
				case "ro":
					this.vars.render_ros_origin = parseInt(val) == 1;
					break;
				case "lbl":
					this.vars.render_labels = parseInt(val) == 1;
					break;
				case "vis":
					this.vars.render_visuals = parseInt(val) == 1;
					break;
				case "col":
					this.vars.render_collisions = parseInt(val) == 1;
					break;
				case "fix":
					this.vars.fix_robot_base = parseInt(val) == 1;
					break;
				case "pg":
					this.vars.render_pose_graph = parseInt(val) == 1;
					break;
				case "grnd":
					this.vars.render_ground_plane = parseInt(val) == 1;
					break;
				case "s":
					this.vars.render_stats = parseInt(val) == 1;
					break;
			}
		});
		this.sources.parseUrlParts(custom_url_vars);
	}

	onDescriptionData(topic, desc) {
		if (this.panel.paused)
			// TODO: process last received data on unpause
			return;

		if (desc.data == this.last_processed_desc) {
			console.warn("Ignoring identical robot description from " + topic);
			return false;
		}

		if (this.robot_model) {
			this.onModelRemoved();
		}

		this.last_processed_desc = desc.data;

		console.warn("Parsing robot description...");
		this.stats_model_tris = 0;
		this.stats_model_verts = 0;
		this.robot_model = this.urdf_loader.parse(desc.data);
		// this.robot_model.visible = false; // show when all loading is done and model cleaned
		this.cleanURDFModel(this.robot_model);
		this.robot.add(this.robot_model);
		this.robot_model.position.set(0, 0, 0); //reset pose, transform move with this.robot
		this.robot_model.quaternion.set(0, 0, 0, 1);
		console.log("Robot desc received, model: ", this.robot_model);

		this.getAutofocusTarget();
		this.renderDirty();
	}

	cleanURDFModel(obj, in_visual = false, in_collider = false, force_material = null) {
		if (obj.isLight || obj.isScene || obj.isCamera) {
			return false;
		}

		if (obj.isURDFVisual) {
			in_visual = true;
		} else if (obj.isURDFCollider) {
			in_collider = true;
		}

		obj.frustumCulled = true;

        // mesh visuals
        if (obj.isMesh && in_visual) {
			if (force_material) {
				obj.material = force_material;
			} else if (!obj.material) {
                console.log('Obj didn\t have material: ', obj);
                obj.material = new THREE.MeshStandardMaterial({
                    color: 0xffffff,
                    side: THREE.FrontSide,
                    depthWrite: true,
                });
                obj.material.needsUpdate = true;
            } else if (!force_material) {
                console.log('Obj "' + obj.name + '" had material: ', obj);
                obj.material.depthWrite = true;
                obj.material.side = THREE.FrontSide;
            }
			if (!force_material)
            	obj.material.needsUpdate = true;
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.renderOrder = -1;
            obj.layers.set(DescriptionTFWidget.L_VISUALS);
        
        // colliders
        } else if (obj.isMesh && in_collider) {
            obj.material = this.collider_mat;
            obj.scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
            obj.layers.set(DescriptionTFWidget.L_COLLIDERS);
        }

		// count vers & tris
		if (obj.isMesh && obj.geometry) {
			this.stats_model_verts += obj.geometry.attributes.position.count;
			if (obj.geometry.index)
				//indexed geometry
				this.stats_model_tris += obj.geometry.index.count / 3;
			else this.stats_model_tris += obj.geometry.attributes.position.count / 3;
		}

		if (obj.children && obj.children.length) {
			for (let i = 0; i < obj.children.length; i++) {
				let ch = obj.children[i];
				let res = this.cleanURDFModel(ch, in_visual, in_collider, force_material); // recursion
				if (!res) {
					obj.remove(ch);
					i--;
				}
			}
		}

		return true;
	}

	onModelRemoved() {
		console.warn("Removing robot model, clearing ros_space");
		// this.ros_space.clear(); // this.ros_space.remove(this.robot);
		// this.markRosOrigin(); //removed, put back
		this.robot_model.removeFromParent(); // not changing or moving this.robot
		this.robot_model = null;
		this.last_processed_desc = null;
		while (this.labelRenderer.domElement.children.length > 0) {
			this.labelRenderer.domElement.removeChild(
				this.labelRenderer.domElement.children[0],
			);
		}
	}

	getAutofocusTarget() {
		let robot = this.robot_model;

		if (this.camera_target_key && robot.joints[this.camera_target_key]) {
			this.setCameraTarget(
				robot.joints[this.camera_target_key],
				this.camera_target_key,
				false,
			);
			return;
		}
		if (this.camera_target_key && robot.links[this.camera_target_key]) {
			this.setCameraTarget(
				robot.links[this.camera_target_key],
				this.camera_target_key,
				false,
			);
			return;
		}

		if (this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY) {
			this.setCameraTarget(
				this.ros_space,
				DescriptionTFWidget.ROS_SPACE_KEY,
				false,
			);
			return;
		}

		let wp = new Vector3();
		let farthest_pt_dist = 0;
		let joints_avg = new Vector3(0, 0, 0);
		let joints_num = 0;
		let focus_joint = null;
		let focus_joint_key = null;

		// find the joint closest to avg center and set as target
		// also find the farthest for initial camera distance
		Object.keys(robot.joints).forEach((key) => {
			robot.joints[key].getWorldPosition(wp);
			let wp_magnitude = wp.length();
			if (wp_magnitude > farthest_pt_dist) farthest_pt_dist = wp_magnitude;
			joints_avg.add(wp);
			joints_num++;
		});
		if (joints_num) {
			joints_avg.divideScalar(joints_num);
			let closest_joint_dist = Number.POSITIVE_INFINITY;
			Object.keys(robot.joints).forEach((key) => {
				robot.joints[key].getWorldPosition(wp);
				let d = wp.distanceTo(joints_avg);
				if (d < closest_joint_dist) {
					closest_joint_dist = d;
					focus_joint = robot.joints[key];
					focus_joint_key = key;
				}
			});
		}
		Object.keys(robot.links).forEach((key) => {
			robot.links[key].getWorldPosition(wp);
			let wp_magnitude = wp.length();
			if (wp_magnitude > farthest_pt_dist) farthest_pt_dist = wp_magnitude;
		});
		Object.keys(robot.frames).forEach((key) => {
			robot.frames[key].getWorldPosition(wp);
			let wp_magnitude = wp.length();
			if (wp_magnitude > farthest_pt_dist) farthest_pt_dist = wp_magnitude;
		});

		if (focus_joint && focus_joint_key)
			this.setCameraTarget(focus_joint, focus_joint_key, false);

		// set initial distance proportional to model size
		if (this.vars.follow_target && !this.camera_distance_initialized) {
			this.camera_distance_initialized = true;
			let initial_dist = farthest_pt_dist * 3.0;
			this.camera_pos.normalize().multiplyScalar(initial_dist);
			this.camera.position.copy(this.camera_pos);
		}
	}

	setCameraTarget(new_target, new_target_key, force_follow = false) {
		console.log("Setting cam target to: " + new_target_key);
		this.camera_target = new_target;
		this.camera_target_key = new_target_key;

		if (!this.vars.follow_target && force_follow) {
			this.vars.follow_target = true;
			this.focus_btn.addClass("on");
		}

		if (force_follow)
			//only refresh on click
			this.panel.ui.updateUrlHash();

		this.makeRobotMarkers();
		this.makeROSOriginMarker();
	}

	setCameraTargetPosition(new_target_pos) {
		console.log(
			"Setting cam target positino to: [" +
				new_target_pos.x.toFixed(2) +
				";" +
				new_target_pos.y.toFixed(2) +
				";" +
				new_target_pos.z.toFixed(3) +
				"]",
		);
		this.camera_target_pos.position.copy(new_target_pos);
		this.camera.lookAt(this.camera_target_pos);
		this.controls.update();

		// this.camera_target = null;
		// this.camera_target_key = null;

		if (this.vars.follow_target) {
			this.vars.follow_target = false;
			this.focus_btn.removeClass("on");
			this.panel.ui.updateUrlHash();
			this.makeRobotMarkers();
			this.makeROSOriginMarker();
		}
	}

	makeRobotMarkers() {
		this.joint_markers.forEach((m) => {
			if (m.axis_el) m.axis_el.removeFromParent();
			if (m.label_el) m.label_el.removeFromParent();
		});
		this.joint_markers = [];

		this.link_markers.forEach((m) => {
			if (m.axis_el) m.axis_el.removeFromParent();
			if (m.label_el) m.label_el.removeFromParent();
		});
		this.link_markers = [];

		let h_center = !this.vars.render_joints || !this.vars.render_links; // when rendering only one type, make it centered
		if (this.vars.render_joints)
			this.joint_markers = this.makeMarkerGroup(
				this.robot_model.joints,
				DescriptionTFWidget.L_JOINTS,
				DescriptionTFWidget.L_JOINT_LABELS,
				h_center,
			);
		if (this.vars.render_links)
			this.link_markers = this.makeMarkerGroup(
				this.robot_model.links,
				DescriptionTFWidget.L_LINKS,
				DescriptionTFWidget.L_LINK_LABELS,
				h_center,
			);
	}

	makeROSOriginMarker() {
		if (this.ros_origin_axis_el) this.ros_origin_axis_el.removeFromParent();
		delete this.ros_origin_axis_el;
		if (this.ros_origin_label_el) this.ros_origin_label_el.removeFromParent();
		delete this.ros_origin_label_el;
		const [axis_el, label_el] = this.makeMark(
			this.ros_space,
			DescriptionTFWidget.ROS_SPACE_KEY,
			DescriptionTFWidget.L_ROS_ORIGIN_MARKER,
			DescriptionTFWidget.L_ROS_ORIGIN_LABEL,
			1.0,
			true,
			0.0,
		);
		this.ros_origin_axis_el = axis_el;
		this.ros_origin_label_el = label_el;
	}

	makeMarkerGroup(frames, layer_axes, layer_labels, h_center) {
		let that = this;

		let markers = [];
		Object.keys(frames).forEach((key) => {
			// robot.joints[key]
			let wp = new THREE.Vector3();
			frames[key].getWorldPosition(wp);
			markers.push({
				key: key,
				pos: wp,
				axis_el: null,
				label_el: null,
			});
		});

		markers.forEach((m) => {
			if (m.axis_el) return; // done already in cluster

			let cluster = [m];

			markers.forEach((mm) => {
				if (mm == m) return;
				if (mm.pos.distanceTo(m.pos) < 0.01) {
					cluster.push(mm);
				}
			});

			for (let i = 0; i < cluster.length; i++) {
				let mm = cluster[i];
				let v_center_offset = ((cluster.length - 1) / 2 - i) * 1.1; // 1 is height of one label, adding small margin
				const [axis_el, label_el] = that.makeMark(
					frames[mm.key],
					mm.key,
					layer_axes,
					layer_labels,
					0.02,
					h_center,
					v_center_offset,
				);
				mm.axis_el = axis_el;
				mm.label_el = label_el;
			}
		});

		return markers;
	}

	makeMark(
		target,
		label_text,
		layer_axes,
		layer_labels,
		axis_size = 0.02,
		h_center = true,
		v_center = 0,
	) {
		let is_selected = this.vars.follow_target && target == this.camera_target;

		if (
			!is_selected &&
			(layer_axes == DescriptionTFWidget.L_JOINTS ||
				layer_axes == DescriptionTFWidget.L_LINKS)
		) {
			axis_size = 0.015;
		}

		if (is_selected) {
			axis_size = 1.0; // big visual for robots coords frame, when base link is selected
		}

		const axesHelper = new THREE.AxesHelper(axis_size);
		axesHelper.material.transparent = true;
		axesHelper.material.opacity = 0.99;
		axesHelper.material.width = 1.0;
		axesHelper.material.depthTest = false;
		axesHelper.material.depthWrite = false;

		target.add(axesHelper);
		axesHelper.layers.set(layer_axes);

		let label_el = null;
		if (label_text) {
			const el = document.createElement("div");
			el.className = "marker_label";
			el.title = "Focus camera here";
			if (is_selected) el.className += " focused";
			if (!h_center)
				el.className +=
					layer_labels == DescriptionTFWidget.L_JOINT_LABELS
						? " joint"
						: " link";
			el.textContent = label_text;

			label_el = new CSS2DObject(el);
			let that = this;
			el.addEventListener("pointerdown", function (ev) {
				that.setCameraTarget(target, label_text, true); // label=key, turns on following
				ev.preventDefault();
			});
			target.add(label_el);
			label_el.center.set(
				h_center
					? 0.5
					: layer_labels == DescriptionTFWidget.L_JOINT_LABELS
						? 1.0
						: 0.0, // joints left, links right
				v_center,
			);
			label_el.position.set(0, 0, 0);
			label_el.layers.set(layer_labels);

			// console.log('Making label "'+label_text+'", type='+layer_labels+"; target=", target);
		}

		return [axesHelper, label_el];
	}

	onTFData(topic, tf) {
		if (this.panel.paused || !this.robot_model)
			//wait for the model
			return;

		for (let i = 0; i < tf.transforms.length; i++) {
			let ns_stamp =
				tf.transforms[i].header.stamp.sec * 1000000000 +
				tf.transforms[i].header.stamp.nanosec;
			let id_child = tf.transforms[i].child_frame_id;
			let t = tf.transforms[i].transform;

			// if (this.smooth_transforms_queue[id_child] !== undefined && this.smooth_transforms_queue[id_child].stamp > ns_stamp)
			//     continue; //throw out older transforms

			t.rotation = new Quaternion(
				t.rotation.x,
				t.rotation.y,
				t.rotation.z,
				t.rotation.w,
			).normalize();
			t.translation = new THREE.Vector3(
				t.translation.x,
				t.translation.y,
				t.translation.z,
			);

			this.smooth_transforms_queue[id_child] = {
				parent: tf.transforms[i].header.frame_id,
				transform: t,
				stamp: ns_stamp,
			};

			if (id_child == this.robot_model.name) {
				//this is the base link

				if (!this.ros_space_offset_set) {
					// moves ros space so that the initial ronot's position and rotation is aligned with the scene's origin
					// all furher transforms then take place in the ros space

					if (
						this.vars.follow_target &&
						this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY
					) {
						this.ros_space.attach(this.camera_target_pos);
						this.ros_space.attach(this.camera);
					}

					this.ros_space.quaternion.copy(
						this.ros_space_default_rotation
							.clone()
							.multiply(t.rotation.clone().invert()),
					); // robot aligned with scene
					let t_pos = t.translation
						.clone()
						.applyQuaternion(this.ros_space.quaternion);
					this.ros_space.position.copy(t_pos.clone().negate());

					if (
						this.vars.follow_target &&
						this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY
					) {
						this.scene.attach(this.camera_target_pos);
						this.scene.attach(this.camera);
						this.camera.getWorldPosition(this.camera_pos);
					}

					this.ros_space_offset_set = true;
				}

				// trim pg
				while (this.pose_graph.length > this.pose_graph_size) {
					let rem = this.pose_graph.shift();
					if (rem.visual) {
						rem.visual.removeFromParent();
					}
				}

				let pg_node = {
					pos: t.translation,
					rot: t.rotation,
					mat: new THREE.Matrix4(),
					ns_stamp: ns_stamp,
				};
				pg_node.mat.compose(pg_node.pos, pg_node.rot, new THREE.Vector3(1, 1, 1));

				if (this.vars.render_pose_graph) {
					pg_node.visual = new THREE.AxesHelper(0.05);
					pg_node.visual.material.depthTest = false;
					pg_node.visual.position.copy(pg_node.pos);
					pg_node.visual.quaternion.copy(pg_node.rot);
					pg_node.visual.layers.set(DescriptionTFWidget.L_POSE_GRAPH);
					this.ros_space.add(pg_node.visual); //+z up
				}

				this.pose_graph.push(pg_node);

				let e = new CustomEvent("pg_updated", {
					detail: { topic: topic, pg_node: pg_node },
				});
				this.dispatchEvent(e);
			}
		}
	}

	controlsChanged() {
		this.controls_dirty = true;
		this.camera_pos.copy(this.camera.position);
	}

	renderDirty() {
		if (!this.renderer) return;

		this.render_dirty = true;
	}

	renderingLoop() {
		if (!this.rendering || !this.robot_model) {
			requestAnimationFrame((t) => this.renderingLoop());
			return;
		}

		const lerp_amount = 0.2;
		const cam_lerp_amount = 1.0;
		let that = this;

		// set model transforms
		if (this.robot_model.frames) {
			let transform_ch_frames = Object.keys(this.smooth_transforms_queue);
			for (let i = 0; i < transform_ch_frames.length; i++) {
				let id_child = transform_ch_frames[i];
				let id_parent = this.smooth_transforms_queue[id_child].parent;
				let t = this.smooth_transforms_queue[id_child].transform;

				let t_parent = this.robot_model.frames[id_parent];
				let t_child = this.robot_model.frames[id_child];
				if (!t_child) {
					// child node not present in urdf
					if (!this.missing_transform_error_logged[t_child]) {
						this.missing_transform_error_logged[t_child] = true;
						let msg = id_child + " not found in the URDF model";
						this.panel.ui.showNotification(
							msg,
							"error",
							"<pre>Source: transform</pre>",
						);
						console.error(msg);
					}
					continue;
				} else if (this.missing_transform_error_logged[t_child]) {
					delete this.missing_transform_error_logged[t_child];
				}

				if (id_child == this.robot_model.name) {
					// robot base frame => move this.robot in ros_space

					let new_robot_world_position = new THREE.Vector3();

					let move_camera =
						this.vars.follow_target &&
						this.robot_pose_initialized &&
						this.camera_target_key != DescriptionTFWidget.ROS_SPACE_KEY;

					if (!this.vars.fix_robot_base) {
						// robot free to move around
						let pos = t.translation;

						let old_robot_world_position = new THREE.Vector3();
						this.robot.getWorldPosition(old_robot_world_position);

						if (this.robot_pose_initialized)
							this.robot.position.lerp(pos, lerp_amount);
						else this.robot.position.copy(pos); // 1st hard set without lerping

						this.robot.getWorldPosition(new_robot_world_position);

						let d_pos = new THREE.Vector3().subVectors(
							new_robot_world_position,
							old_robot_world_position,
						);

						if (move_camera) {
							this.camera_pos.add(d_pos); // move camera by d
							this.light.position.add(d_pos);
						}
					} else {
						// keeping robot fixes in place
						this.robot.getWorldPosition(new_robot_world_position); // only get world pos (to rotate around)
					}

					let old_robot_world_rotation = new THREE.Quaternion();
					this.robot.getWorldQuaternion(old_robot_world_rotation);

					// let rot = new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
					// rot = rot.multiply(this.rot_offset);

					// set robot rot (even when fixes)
					if (this.robot_pose_initialized)
						this.robot.quaternion.slerp(t.rotation, lerp_amount);
					else this.robot.quaternion.copy(t.rotation); // 1st hard set

					let new_robot_world_rotation = new THREE.Quaternion();
					this.robot.getWorldQuaternion(new_robot_world_rotation);

					// let d_rot_rad = old_robot_world_rotation.angleTo(new_robot_world_rotation);
					let d_rot = new_robot_world_rotation.multiply(
						old_robot_world_rotation.invert(),
					);

					// rotate camera with the robot
					if (move_camera) {
						this.camera_pos
							.sub(new_robot_world_position)
							.applyQuaternion(d_rot)
							.add(new_robot_world_position);
					}

					// saves new camera pos in relation to robot as it moves around
					if (
						!this.set_camera_target_offset &&
						!this.vars.follow_target &&
						this.last_camera_url_update + 1000 < Date.now()
					) {
						setTimeout(() => {
							this.last_camera_url_update = Date.now();
							that.panel.ui.updateUrlHash();
						}, 0);
					}

					this.robot_pose_initialized = true;
					this.light.target = this.robot;

					this.renderDirty();
				} else if (t_child && t_parent) {
					// animate all other model joints

					let orig_p = t_child.parent;
					t_parent.attach(t_child);
					if (this.robot_pose_initialized) {
						t_child.position.lerp(
							new THREE.Vector3(
								t.translation.x,
								t.translation.y,
								t.translation.z,
							),
							lerp_amount,
						);
						t_child.quaternion.slerp(
							new THREE.Quaternion(
								t.rotation.x,
								t.rotation.y,
								t.rotation.z,
								t.rotation.w,
							),
							lerp_amount,
						);
					} else {
						// 1st hard set
						t_child.position.copy(
							new THREE.Vector3(
								t.translation.x,
								t.translation.y,
								t.translation.z,
							),
						);
						t_child.quaternion.copy(
							new THREE.Quaternion(
								t.rotation.x,
								t.rotation.y,
								t.rotation.z,
								t.rotation.w,
							),
						);
					}
					orig_p.attach(t_child);

					this.renderDirty();
				}
			}
		}

		// set camera ros and offset from url (only once)
		if (this.set_camera_target_offset) {
			if (this.camera_target && this.vars.follow_target) {
				this.camera_target.getWorldPosition(this.camera_target_pos.position);
			}

			let rwq = new THREE.Quaternion();
			if (this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY)
				this.ros_space.getWorldQuaternion(rwq);
			else this.robot.getWorldQuaternion(rwq);
			let cam_rot = rwq.multiply(this.set_camera_target_offset.rotation);

			let v = new THREE.Vector3(0, 0, this.set_camera_target_offset.distance); // -z is fw
			v.applyQuaternion(cam_rot);

			this.camera_pos.copy(this.camera_target_pos.position.clone().add(v));
			this.camera.position.copy(this.camera_pos);
			this.camera.quaternion.copy(cam_rot);

			this.set_camera_target_offset = null;
			this.controls.update();
		}

		// move camera to position relative to target
		else if (this.set_camera_view) {
			const animation_duration = 1000;

			if (this.camera_target && this.vars.follow_target) {
				this.camera_target.getWorldPosition(this.camera_target_pos.position);
			}

			let lerp_amount =
				(Date.now() - this.set_camera_view.start) / animation_duration;
			let done = false;
			if (lerp_amount >= 1.0) {
				lerp_amount = 1.0;
				done = true;
			}

			let target_pos = this.camera_target_pos.position
				.clone()
				.add(this.set_camera_view.target_offset_pos); //update as the robor/target move
			this.camera.position.copy(
				this.set_camera_view.start_cam_position.lerp(target_pos, lerp_amount),
			);

			let rwq = new THREE.Quaternion();
			if (
				this.vars.follow_target &&
				this.camera_target_key == DescriptionTFWidget.ROS_SPACE_KEY
			)
				this.ros_space.getWorldQuaternion(rwq);
			else this.robot.getWorldQuaternion(rwq);
			let target_rot = rwq.multiply(this.set_camera_view.target_rot.clone()); //update as the robor/target move
			this.camera.quaternion.copy(
				this.set_camera_view.start_cam_rotation.slerp(target_rot, lerp_amount),
			);

			this.camera_pos.copy(this.camera.position);
			this.controls_dirty = true;

			if (done) {
				this.set_camera_view = null;
				this.controls.enableRotate = true;
				this.controls.enablePan = !this.vars.follow_target;
				this.controls.update();
				this.panel.ui.updateUrlHash();
			}
		}

		// move the camera if fixed to target
		else if (this.vars.follow_target && this.camera_pose_initialized) {
			let pos_to_maintain = new THREE.Vector3().copy(this.camera_pos);

			this.camera.position.lerp(this.camera_pos, cam_lerp_amount);

			if (this.camera_target) {
				let new_target_pos = new THREE.Vector3();
				this.camera_target.getWorldPosition(new_target_pos);
				if (this.camera_target_pose_initialized) {
					this.camera_target_pos.position.lerp(new_target_pos, cam_lerp_amount);
				} else {
					this.camera_target_pos.position.copy(new_target_pos);
					this.camera_target_pose_initialized = true;
				}
				// this.camera.lookAt(this.camera_target_pos);
				// console.log('Focusing on ['+new_target_pos.x+';'+new_target_pos.y+';'+new_target_pos.z+']');
			}

			this.controls.update();
			this.camera_pos = pos_to_maintain;
		}

		this.camera_pose_initialized = true; // lerp camera from now on

		// render the scene
		if (this.controls_dirty || this.render_dirty) {
			this.controls_dirty = false;
			this.render_dirty = false;
			try {
				this.renderer.render(this.scene, this.camera);
				this.labelRenderer.render(this.scene, this.camera);
				this.rendering_error_logged = false;
				this.panel.updateFps();
			} catch (e) {
				if (!this.rendering_error_logged) {
					this.rendering_error_logged = true;
					console.error("Error caught while rendering", e);
					this.scene.traverse(function (obj) {
						// add some debug data
						var s = "";
						var obj2 = obj;
						while (obj2 !== that.scene) {
							s += "-";
							obj2 = obj2.parent;
						}
						console.log(
							s + obj.type + " " + obj.name + " mat: " + obj.material,
						);
					});
				}
			}
		}

		requestAnimationFrame((t) => this.renderingLoop());
	}

	// get_latest_pg_ns_stamp() {
	//     if (!this.pose_graph || !this.pose_graph.length)
	//         return NaN;

	//     return this.pose_graph[this.pose_graph.length-1].ns_stamp;
	// }
}
