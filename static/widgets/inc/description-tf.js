import { lerpColor, linkifyURLs, lerp, deg2rad, rad2deg, signedAngle } from "/static/inc/lib.js";
import * as THREE from "three";
import { STLLoader } from "stl-loader";
import { ColladaLoader } from "collada-loader";
//import { OrbitControls } from "/static/input/OrbitControls.js";
import { TrackballControls } from "/static/input/TrackballControls.js";
import URDFLoader from "urdf-loader";
import { CSS2DRenderer, CSS2DObject } from "css-2d-renderer";
import { MultiTopicSource } from "./multitopic.js";
import { Vector3, Quaternion, LoadingManager } from "three";
import { CompositePanelWidgetBase } from './composite-widget-base.js'
import { SpaceMouse } from '../../input/space-mouse.js'

export class DescriptionTFWidget extends CompositePanelWidgetBase {
	static LABEL = "Robot description (URFD) + Transforms";
	static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 16;

	static L_VISUALS = 1;
	static L_COLLIDERS = 2;
	static L_JOINTS = 3;
	static L_JOINT_LABELS = 4;
	static L_LINKS = 5;
	static L_LINK_LABELS = 6;
	static L_POSE_GRAPH = 7;
	static L_ROS_ORIGIN_MARKER = 8;
	static L_ROS_ORIGIN_LABEL = 9;

	static INITIAL_CAMERA_POSITION = new THREE.Vector3(1, 0.5, 1); // will be multiplied by detected model scale * INITIAL_CAMERA_DISTANCE_MULTIPLIER
	static INITIAL_CAMERA_DISTANCE_MULTIPLIER = 3.0; // camera will start this times the detected model size away

	static ROS_SPACE_KEY = "ROS_SPACE";

	static GROUND_PLANES = [
		{ label: 'No ground plane' },
		{ label: 'Black ground plane', color: 'black' },
		{ label: 'White ground plane', color: 'white' },
		{ label: 'Gray ground plane', color: 'gray' },
		{ label: 'Gray ground tiles', url: '/static/grounds/tiles1.png' }, 
		{ label: 'Black ground tiles', url: '/static/grounds/tiles2.png' },
		{ label: 'White ground marks', url: '/static/grounds/marks1.png' },
		{ label: 'Black ground marks', url: '/static/grounds/marks2.png' },
		{ label: 'Blue ground marks', url: '/static/grounds/marks3.png' }, // default
		{ label: 'Hotel carpet', url: '/static/grounds/shining.png' },
		// TODO: custom
	];

	static SKYBOXES = [
		{ label: 'Black skybox', color: 'black', light_pos: [ 6, 6, -10] },
		{ label: 'White skybox', color: 'white', light_pos: [ 6, 6, -10] },
		{ label: 'Acid skybox', url: '/static/skyboxes/acid/', light_pos: [ 4, 7, -10] }, // skybox folders must contain cubemap_0.png - cubemap_5.png
		{ label: 'Dark skybox', url: '/static/skyboxes/dark/', light_pos: [ 4, 7, -10] }, 
		{ label: 'Mars skybox', url: '/static/skyboxes/mars/', light_pos: [ 5, 7, -10] }, // default
		{ label: 'Moon skybox', url: '/static/skyboxes/moon/', light_pos: [ 4, 7, -10] },
		// TODO: custom (e.g. https://skyboxgen.com/)
	];

	static LIGHT_WIDE_SPOTLIGHT   = 0;
	static LIGHT_NARROW_SPOTLIGHT = 1;
	static LIGHT_DIRECTIONAL      = 2;
	static LIGHT_FLASHLIGHT       = 3;
	static LIGHT_AMBIENT_ONLY     = 4;
	static LIGHTS = [
		'Spotlight',
		'Narrow spotlight',
		'Directional light',
		'Flashlight',
		'Ambient light (no shadows)'
	];

	constructor(panel, widget_css_class, start_rendering_loop=true) {
		super(panel, widget_css_class);

		// defaults overwritten by url params
		this.vars = {
			render_collisions: true,
			render_visuals: true,
			render_labels: false,
			render_links: true,
			render_joints: false,
			render_ros_origin: false,
			camera_follows_selection: true,
			camera_lock_horizon: true,
			perspective_camera: true,
			fix_robot_base: false, // robot will be fixed in place
			render_pose_graph: false,
			render_ground_plane: 8, // blue marks
			render_skybox: 4, // mars skybox
			render_light: DescriptionTFWidget.LIGHT_WIDE_SPOTLIGHT // wide spot light
		};

		this.panel.fps_el.addClass("rendering_stats");
		this.panel.show_fps_menu_label = "Show rendering stats";

		this.pose_graph = [];
		this.pose_graph_size = 500; // keeps this many nodes in pg (TODO: to robot's config?)
		this.tf_static_to_apply = {}; //topic => msg

		this.transforms_queue = {};
		this.camera_pose_initialized = false; // first hard set pose, then smooth lerp
		//this.camera_distance_initialized = false; // determine distance to target if false; only once (if target autodetected)
		this.robot_pose_initialized = {}; // 'urdf_key': true after 1st transform
		this.animate_camera_cursor_to_target = false; // 1st set will not lerp
		this.set_ortho_camera_zoom = -1; // if > 0, used on camera init
		this.set_camera_view = null; // animate to position if set

		this.stats_model_tris = 0;
		this.stats_model_verts = 0;

		let that = this;

		function LoadingManagerURLMofifier(url) {

			if (url.indexOf("http:/") === 0 || url.indexOf("https:/") === 0)
				return url;

			if (url.indexOf("package:/") !== 0 && url.indexOf("file:/") !== 0)
				return url;

			let url_fw = panel.ui.client.getBridgeFileUrl(url);
			console.log(">> Loader requesting " + url + " > " + url_fw);

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
					that.cleanModel(clean_model, true);
					done_cb(clean_model);
				});
			} else if (/\.dae$/i.test(path)) {
				const loader = new ColladaLoader(manager);
				loader.load(path, (dae) => {
					let clean_model = dae.scene;
					that.cleanModel(clean_model, true);
					done_cb(clean_model);
				});
			} else {
				console.error(`Could not load model at ${path}.\nNo loader available`);
			}
		};
		this.loading_manager.onLoad = () => {
			console.info("Robot URDF loader done loading", that.robot_model);
			that.renderDirty();
		};
		this.loading_manager.onError = (url) => {
			console.error("Error loading resource for: " + url);
			that.panel.ui.showNotification("Error loading resource", "error", url);
			that.renderDirty();
		};

		this.widget_el.data("gs-no-move", "yes");

		// camera controls
		this.perspective_btn = $('<span class="panel-btn perspective-btn" title="Perspective"></span>');
		this.panel.panel_btns_el.append(this.perspective_btn);

		this.camera_follows_selection_btn = $('<span class="panel-btn camera-follows-selection-btn" title="Camera follows selection"></span>');
		this.panel.panel_btns_el.append(this.camera_follows_selection_btn);

		this.camera_lock_horizon_btn = $('<span class="panel-btn camera-lock-horizon-btn" title="Lock horizon"></span>');
		this.panel.panel_btns_el.append(this.camera_lock_horizon_btn);

		let view_select = $('<span class="panel-select view-select" title="Set camera position"></span>');
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
		this.panel.panel_btns_el.append(view_select);

		this.labels_btn = $('<span class="panel-btn labels-btn" title="Display model labels"></span>');
		this.panel.panel_btns_el.append(this.labels_btn);

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
		document.getElementById("panel_widget_" + panel.n).appendChild(this.renderer.domElement);

		this.labelRenderer = new CSS2DRenderer();
		this.labelRenderer.setSize(panel.widget_width, panel.widget_height);
		this.labelRenderer.domElement.style.position = "absolute";
		this.labelRenderer.domElement.style.top = "0px";
		document.getElementById("panel_widget_" + panel.n).appendChild(this.labelRenderer.domElement);

		//this.initial_camera_world_position = new THREE.Vector3(1, 0.5, 1);
		
		this.ros_space = new THREE.Object3D();
		this.ros_origin_axis_el = null;
		this.ros_origin_label_el = null;
		this.ros_space.add(this.robot);
		this.robot.position.set(0, 0, 0);
		this.robot.quaternion.set(0, 0, 0, 1);
		this.ros_space_default_rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2.0, 0.0, 0.0)); // ROS uses +z up
		this.scene.add(this.ros_space);
		this.ros_space.quaternion.copy(this.ros_space_default_rotation);
		this.ros_space_offset_set = false; // will be set on 1st base tf data

		this.skybox_textures = {};
		this.cube_loader = new THREE.CubeTextureLoader();

		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap

		// this.makeMark(this.scene, 'SCENE ORIGIN', 0, 0, 2.0, true, 1.0);

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

		this.DEBUG_CAMERA = false;

		this.camera_controls_target = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff00ff }));
		this.camera_controls_target.position.set(0, 0, 0); // adjusted by url
		this.camera_controls_target.visible = this.DEBUG_CAMERA; // enable when debugging
		this.scene.add(this.camera_controls_target);

		this.camera_selection = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 16), new THREE.MeshBasicMaterial({ color: 0x00ff00 }));
		this.camera_selection.position.set(0, 0, 0); // adjusted by url
		this.camera_selection.visible = this.DEBUG_CAMERA; // enable when debugging
		this.scene.add(this.camera_selection);

		this.camera_selection_key = null;
		this.camera_selection_ref = null;
		this.last_camera_selection_key = null;
		this.last_camera_selection_ref = null;
		
		this._camera_up = new THREE.Vector3();
		this._up_axis = new THREE.Vector3();
		this._camera_fw_axis = new THREE.Vector3();
		this._up_axis_projection = new THREE.Vector3();
		this._camera_selection_position_world_space = new THREE.Vector3();
		this._camera_controls_target_position_world_space = new THREE.Vector3();
		this._camera_position_world_space = new THREE.Vector3();
		this._camera_rotation_world_space = new THREE.Quaternion();
		this._ref_frame_rotation_world_space = new THREE.Quaternion();

		this._new_robot_world_position = new THREE.Vector3();
		this._old_robot_world_position = new THREE.Vector3();
		this._delta_robot_pos = new THREE.Vector3();

		this.loadPanelConfig();

		// - panel vars loaded here - //

		this.last_camera_url_update = Number.NEGATIVE_INFINITY;

		// follow target toggle
		if (this.vars.camera_follows_selection) {
			this.camera_follows_selection_btn.addClass("on");
		}
		this.camera_follows_selection_btn.click(function (ev) {
			that.vars.camera_follows_selection = !$(this).hasClass("on");
			that.panel.storePanelVarAsBool('f', that.vars.camera_follows_selection);
			if (that.vars.camera_follows_selection) {
				$(this).addClass("on");
				that.camera_selection_key = that.last_camera_selection_key;
				that.camera_selection_ref = that.last_camera_selection_ref;
			} else {
				$(this).removeClass("on");
			}
			that.makeRobotMarkers();
			that.makeROSOriginMarker();
			that.storeCameraPosePanelVars();
			that.renderDirty();
		});

		// lock horizon toggle
		if (this.vars.camera_lock_horizon) {
			this.camera_lock_horizon_btn.addClass("on");
		}
		this.camera_lock_horizon_btn.click(function (ev) {
			that.vars.camera_lock_horizon = !$(this).hasClass("on");
			that.controls.fixHorizon = that.vars.camera_lock_horizon;
			that.panel.storePanelVarAsBool('ch', that.vars.camera_lock_horizon);
			if (that.vars.camera_lock_horizon) {
				$(this).addClass("on");
				//that.controls.enablePan = false;
			} else {
				$(this).removeClass("on");
				//that.controls.enablePan = true;
				//that.camera_target.getWorldPosition(that.camera_controls_target.position);
			}
			that.storeCameraPosePanelVars();
			that.renderDirty();
		});

		// labels toggle
		if (this.vars.render_labels) {
			this.labels_btn.addClass("on");
		}
		this.labels_btn.click(function (ev) {
			that.vars.render_labels = !$(this).hasClass("on");
			that.panel.storePanelVarAsBool('lbl', that.vars.render_labels);
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
			that.panel.storePanelVarAsInt('ct', that.vars.perspective_camera ? 1 : 0);
			if (that.vars.perspective_camera) {
				$(this).addClass("on");
			} else {
				$(this).removeClass("on");
			}
			that.makeCamera();
			that.storeCameraPosePanelVars();
			that.renderDirty();
		});

		// make camera (persp/orto) when type, pos and focus is determined
		this.makeCamera();

		// if (!this.set_camera_view) {
		// 	this.camera.position.copy(this.INITIAL_CAMERA_POSITION);
		// 	this.camera.lookAt(this.camera_controls_target);
		// }

		this.controls = new TrackballControls(this.camera, this.labelRenderer.domElement);
		console.warn('controls', this.controls);
		this.controls.staticMoving = true; // no damping
		this.controls.keys = []; // disable ASD controls
		//this.controls.enablePan = !this.vars.camera_follows_selection;
		this.renderer.domElement.addEventListener("pointerdown", (ev) => {
			ev.preventDefault(); // stop from moving the panel
		});
		this.controls.addEventListener("change", () => {
			that.controlsChanged();
			//that.controls.update();
		});
		this.controls.addEventListener("end", () => {
			that.storeCameraPosePanelVars(); // saves camera pos in url
		});
		this.controls_dirty = false;

		this.controls.target = this.camera_controls_target.position; // panning moves the target
		this.controls.lookTarget = this.camera_controls_target.position;
		this.controls.fixHorizon = this.vars.camera_lock_horizon;
		// if (!this.set_camera_view) {
		// 	this.controls.update();
		// }

		this.setLight(this.vars.render_light);
		if (this.light)
			this.light.lookAt(this.camera_selection);

		this.ground_plane_geometry = new THREE.PlaneGeometry(100, 100);
		this.setGroundPlane(this.vars.render_ground_plane);

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

		if (start_rendering_loop) {
			this.rendering = true;
			this.renderDirty();
			requestAnimationFrame((t) => this.renderingLoop(t));
		}

		this.space_mouse = null; // set in child class (only one panel can be controlled by space mouse at the time)
	}

	onResize() {
		this.labelRenderer.setSize(this.panel.widget_width, this.panel.widget_height);
		if (this.panel.widget_width < 250) {
			$(this.panel.grid_widget).addClass("buttons-hidden");
		} else {
			$(this.panel.grid_widget).removeClass("buttons-hidden");
		}
		this.updateOrthoCameraAspect();
		this.renderDirty();
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
				-1000, // negative near to prvent clipping while keeping the zoom functionality
				1000,
			);
			if (this.set_ortho_camera_zoom > 0) {
				//set zoom from url
				this.camera.zoom = this.set_ortho_camera_zoom;
				this.set_ortho_camera_zoom = -1;
			}
		}

		this.scene.add(this.camera);
		if (old_camera) {
			let old_type = old_camera.isOrthographicCamera ? "ORTHO" : "PERSP";
			console.log("Old " + old_type + " camera pos was [" + old_camera.position.x + ";" + old_camera.position.y + ";" + old_camera.position.z + "]; zoom " + old_camera.zoom);

			this.camera.position.copy(old_camera.position);
			this.camera.quaternion.copy(old_camera.quaternion);
			this.camera.zoom = 1.0;

			if (this.vars.perspective_camera) {
				if (old_camera.isOrthographicCamera) {
					// compensate for ortho > persp
					const targetDistance = this.camera.position.distanceTo(this.camera_controls_target.position);
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
					const targetDistance = this.camera.position.distanceTo(this.camera_controls_target.position);
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

		this.setSkybox(this.vars.render_skybox);
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

	getFpsString() {
		let dt = this.panel.last_fps_updated ? Date.now() - this.panel.last_fps_updated : 0;
		let r = dt ? 1000 / dt : 0;
		this.panel.fps = this.last_frame_count ? this.renderer.info.render.frame - this.last_frame_count : 0;
		this.panel.fps *= r;
		this.stats_model_tris_rendered = this.panel.fps ? this.renderer.info.render.triangles / this.panel.fps : 0;
		this.stats_model_lines_rendered = this.panel.fps ? this.renderer.info.render.lines / this.panel.fps : 0;

		this.last_frame_count = this.renderer.info.render.frame;
		this.renderer.info.reset(); // resets tris & lines but not frames

		return (
			this.panel.fps.toFixed(0) + " FPS<br>\n" +
			"Model: " + this.stats_model_verts.toLocaleString("en-US") + " verts, " + this.stats_model_tris.toLocaleString("en-US") + " tris<br>\n" +
			"Rendered: " + this.stats_model_lines_rendered.toLocaleString("en-US", {maximumFractionDigits: 0}) + " lines, " +
			this.stats_model_tris_rendered.toLocaleString("en-US", {maximumFractionDigits: 0}) + " tris"
		);
	}

	moveCameraToView(position) {
		let rwq = new THREE.Quaternion();
		if (!this.vars.camera_follows_selection || this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY)
			this.ros_space.getWorldQuaternion(rwq);
		else
			this.robot.getWorldQuaternion(rwq);

		this.camera_controls_target.position.copy(this.camera_selection.position);

		let target_pos = new THREE.Vector3();
		let d = this.camera.position.distanceTo(this.camera_controls_target.position);
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
		this.controls.enabled = false;

		this.set_camera_view = {
			'start': Date.now(),
			'start_cam_position': new THREE.Vector3().copy(this.camera.position),
			'start_cam_rotation': new THREE.Quaternion().copy(this.camera.quaternion),
			'target_offset_pos': target_pos,
			'target_rot': delta_rot,
		};
	}

	setupMenu(menu_els) {
		super.setupMenu(menu_els);

		let that = this;

		// render joints
		let render_joints_line_el = $('<div class="menu_line"></div>');
		let render_joints_label = $('<label for="render_joints_' + this.panel.n + '">Render joints</label>');
		let render_joints_cb = $('<input type="checkbox" ' + (this.vars.render_joints ? "checked" : "") + ' id="render_joints_' + this.panel.n + '" title="Render joints"/>');
		render_joints_label.append(render_joints_cb).appendTo(render_joints_line_el);
		render_joints_cb.change(function (ev) {
			that.vars.render_joints = $(this).prop("checked");
			that.panel.storePanelVarAsBool('jnt', that.vars.render_joints);
			if (that.vars.render_joints) {
				that.camera.layers.enable(DescriptionTFWidget.L_JOINTS);
				if (that.vars.render_labels)
					that.camera.layers.enable(DescriptionTFWidget.L_JOINT_LABELS); //labels
			} else {
				that.camera.layers.disable(DescriptionTFWidget.L_JOINTS);
				that.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS); //labels
			}
			if (that.robot_model)
				that.makeRobotMarkers();
			that.renderDirty();
		});
		menu_els.push(render_joints_line_el);

		// render links
		let render_links_line_el = $('<div class="menu_line"></div>');
		let render_links_label = $('<label for="render_links_' + this.panel.n + '">Render links</label>');
		let render_links_cb = $('<input type="checkbox" ' + (this.vars.render_links ? "checked" : "") + ' id="render_links_' + this.panel.n + '" title="Render links">');
		render_links_label.append(render_links_cb).appendTo(render_links_line_el);
		render_links_cb.change(function (ev) {
			that.vars.render_links = $(this).prop("checked");
			that.panel.storePanelVarAsBool('lnk', that.vars.render_links);
			if (that.vars.render_links) {
				that.camera.layers.enable(DescriptionTFWidget.L_LINKS);
				if (that.vars.render_labels)
					that.camera.layers.enable(DescriptionTFWidget.L_LINK_LABELS); //labels
			} else {
				that.camera.layers.disable(DescriptionTFWidget.L_LINKS);
				that.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS); //labels
			}
			if (that.robot_model)
				that.makeRobotMarkers();
			that.renderDirty();
		});
		menu_els.push(render_links_line_el);

		// render ros origin marker
		let render_ros_origin_line_el = $('<div class="menu_line"></div>');
		let render_ros_origin_label = $('<label for="render_ros_origin_' + this.panel.n + '">Show ROS origin</label>');
		let render_ros_origin_cb = $('<input type="checkbox" ' + (this.vars.render_ros_origin ? "checked" : "") + ' id="render_ros_origin_' + this.panel.n + '" title="Show ROS origin"/>');
		render_ros_origin_label.append(render_ros_origin_cb).appendTo(render_ros_origin_line_el);
		render_ros_origin_cb.change(function (ev) {
			that.vars.render_ros_origin = $(this).prop("checked");
			that.panel.storePanelVarAsBool('ro', that.vars.render_ros_origin);
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
		let render_visuals_label = $('<label for="render_visuals_' + this.panel.n + '"">Show visuals</label>');
		let render_visuals_cb = $('<input type="checkbox" ' + (this.vars.render_visuals ? "checked" : "") + ' id="render_visuals_' + this.panel.n + '" title="Render visuals"/>');
		render_visuals_label.append(render_visuals_cb).appendTo(render_visuals_line_el);
		render_visuals_cb.change(function (ev) {
			that.vars.render_visuals = $(this).prop("checked");
			that.panel.storePanelVarAsBool('vis', that.vars.render_visuals);
			if (that.vars.render_visuals)
				that.camera.layers.enable(DescriptionTFWidget.L_VISUALS);
			else that.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
			that.renderDirty();
		});
		menu_els.push(render_visuals_line_el);

		// render colliders
		let render_collisions_line_el = $('<div class="menu_line"></div>');
		let render_collisions_label = $('<label for="render_collisions_' + this.panel.n + '"">Show collisions</label>');
		let render_collisions_cb = $('<input type="checkbox" ' + (this.vars.render_collisions ? "checked" : "") + ' id="render_collisions_' + this.panel.n + '" title="Render collisions"/>');
		render_collisions_label
			.append(render_collisions_cb)
			.appendTo(render_collisions_line_el);
		render_collisions_cb.change(function (ev) {
			that.vars.render_collisions = $(this).prop("checked");
			that.panel.storePanelVarAsBool('col', that.vars.render_collisions);
			if (that.vars.render_collisions)
				that.camera.layers.enable(DescriptionTFWidget.L_COLLIDERS);
			else that.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS);
			that.renderDirty();
		});
		menu_els.push(render_collisions_line_el);

		// fix base (robot will not move linearly, only rotate)
		let fix_base_line_el = $('<div class="menu_line"></div>');
		let fix_base_label = $('<label for="fix_base_' + this.panel.n + '"">Fix robot base</label>');
		let fix_base_cb = $('<input type="checkbox" ' + (this.vars.fix_robot_base ? "checked" : "") + ' id="fix_base_' + this.panel.n + '" title="Fix robot base"/>');
		fix_base_label.append(fix_base_cb).appendTo(fix_base_line_el);
		fix_base_cb.change(function (ev) {
			that.vars.fix_robot_base = $(this).prop("checked");
			that.panel.storePanelVarAsBool('fix', that.vars.fix_robot_base);
			that.renderDirty();
		});
		menu_els.push(fix_base_line_el);

		// render pose graph trail
		let render_pg_line_el = $('<div class="menu_line"></div>');
		let render_pg_label = $('<label for="render_pg_' + this.panel.n + '"">Render trace</label>');
		let render_pg_cb = $('<input type="checkbox" ' + (this.vars.render_pose_graph ? "checked" : "") + ' id="render_pg_' + this.panel.n + '" title="Render pose trace"/>');
		render_pg_label.append(render_pg_cb).appendTo(render_pg_line_el);
		render_pg_cb.change(function (ev) {
			that.vars.render_pose_graph = $(this).prop("checked");
			that.panel.storePanelVarAsBool('pg', that.vars.render_pose_graph);
			if (that.vars.render_pose_graph)
				that.camera.layers.enable(DescriptionTFWidget.L_POSE_GRAPH);
			else that.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
			that.renderDirty();
		});
		menu_els.push(render_pg_line_el);

		// ground plane type
		let render_grnd_line_el = $('<div class="menu_line buttons_right"></div>');
		let render_grnd_label = $('<label></label>');
		let render_grnd_label_value = $('<span></span>');
		let render_grnd_btn_left = $('<button class="left">&laquo;</button>');
		let render_grnd_btn_right = $('<button class="right">&raquo;</button>');
		render_grnd_label.append([ render_grnd_label_value, render_grnd_btn_right, render_grnd_btn_left ]).appendTo(render_grnd_line_el);
		menu_els.push(render_grnd_line_el);

		function setGroundMenuLabel() {
			let label = DescriptionTFWidget.GROUND_PLANES[that.vars.render_ground_plane].label;
			render_grnd_label_value.text(label);
		}
		setGroundMenuLabel();

		render_grnd_btn_left.click(()=>{
			if (that.vars.render_ground_plane <= 0) that.vars.render_ground_plane = DescriptionTFWidget.GROUND_PLANES.length-1;
			else that.vars.render_ground_plane--;

			that.panel.storePanelVarAsInt('grnd', that.vars.render_ground_plane);
			setGroundMenuLabel();
			that.setGroundPlane(that.vars.render_ground_plane);
			that.renderDirty();
		});
		render_grnd_btn_right.click(()=>{
			if (that.vars.render_ground_plane >= DescriptionTFWidget.GROUND_PLANES.length-1) that.vars.render_ground_plane = 0;
			else that.vars.render_ground_plane++;

			that.panel.storePanelVarAsInt('grnd', that.vars.render_ground_plane);
			setGroundMenuLabel();
			that.setGroundPlane(that.vars.render_ground_plane);
			that.renderDirty();
		});
		
		
		// ground plane type
		let render_skybox_line_el = $('<div class="menu_line buttons_right"></div>');
		let render_skybox_label = $('<label></label>');
		let render_skybox_label_value = $('<span></span>');
		let render_skybox_btn_left = $('<button class="left">&laquo;</button>');
		let render_skybox_btn_right = $('<button class="right">&raquo;</button>');
		render_skybox_label.append([ render_skybox_label_value, render_skybox_btn_right, render_skybox_btn_left ]).appendTo(render_skybox_line_el);
		menu_els.push(render_skybox_line_el);

		function setSkyboxMenuLabel() {
			let label =  DescriptionTFWidget.SKYBOXES[that.vars.render_skybox].label;
			render_skybox_label_value.text(label);
		}
		setSkyboxMenuLabel();

		render_skybox_btn_left.click(()=>{
			if (that.vars.render_skybox <= 0) that.vars.render_skybox = DescriptionTFWidget.SKYBOXES.length-1;
			else that.vars.render_skybox--;

			that.panel.storePanelVarAsInt('sky', that.vars.render_skybox);
			setSkyboxMenuLabel();
			that.setSkybox(that.vars.render_skybox);
			that.renderDirty();
		});
		render_skybox_btn_right.click(()=>{
			if (that.vars.render_skybox >= DescriptionTFWidget.SKYBOXES.length-1) that.vars.render_skybox = 0;
			else that.vars.render_skybox++;

			that.panel.storePanelVarAsInt('sky', that.vars.render_skybox);
			setSkyboxMenuLabel();
			that.setSkybox(that.vars.render_skybox);
			that.renderDirty();
		});


		// light type
		let render_light_line_el = $('<div class="menu_line buttons_right"></div>');
		let render_light_label = $('<label></label>');
		let render_light_label_value = $('<span></span>');
		let render_light_btn_left = $('<button class="left">&laquo;</button>');
		let render_light_btn_right = $('<button class="right">&raquo;</button>');
		render_light_label.append([ render_light_label_value, render_light_btn_right, render_light_btn_left ]).appendTo(render_light_line_el);
		menu_els.push(render_light_line_el);

		function setLightMenuLabel() {
			let label = DescriptionTFWidget.LIGHTS[that.vars.render_light];
			render_light_label_value.text(label);
		}
		setLightMenuLabel();

		render_light_btn_left.click(()=>{
			if (that.vars.render_light <= DescriptionTFWidget.LIGHT_WIDE_SPOTLIGHT) that.vars.render_light = DescriptionTFWidget.LIGHT_AMBIENT_ONLY;
			else that.vars.render_light--;

			that.panel.storePanelVarAsInt('lght', that.vars.render_light);
			setLightMenuLabel();
			that.setLight(that.vars.render_light);
			that.renderDirty();
		});
		render_light_btn_right.click(()=>{
			if (that.vars.render_light >= DescriptionTFWidget.LIGHT_AMBIENT_ONLY) that.vars.render_light = DescriptionTFWidget.LIGHT_WIDE_SPOTLIGHT;
			else that.vars.render_light++;

			that.panel.storePanelVarAsInt('lght', that.vars.render_light);
			setLightMenuLabel();
			that.setLight(that.vars.render_light);
			that.renderDirty();
		});
	}

	setGroundPlane(type_no) {
		// make ground plane
		let tex_url = DescriptionTFWidget.GROUND_PLANES[type_no].url;
		let color = DescriptionTFWidget.GROUND_PLANES[type_no].color ? new THREE.Color(DescriptionTFWidget.GROUND_PLANES[type_no].color) : null;

		if (this.ground_plane) {
			this.ground_plane.removeFromParent();
			this.ground_plane = null;
		}

		let that = this;
		function makeNewPlane(plane_material) {
			that.ground_plane = new THREE.Mesh(that.ground_plane_geometry, plane_material);
			that.ground_plane.rotation.setFromVector3(
				new THREE.Vector3(Math.PI / 2, 0, 0),
			);
			that.ground_plane.position.set(0, 0, 0);
			that.ground_plane.receiveShadow = true;
			that.ground_plane.visible = true;
			that.scene.add(that.ground_plane);
		}

		if (tex_url) {
			this.tex_loader.load(tex_url, (plane_tex) => {
				const plane_material = new THREE.MeshPhongMaterial({
					color: 0xffffff,
					side: THREE.BackSide,
				});
				plane_tex.wrapS = THREE.RepeatWrapping;
				plane_tex.wrapT = THREE.RepeatWrapping;
				plane_tex.repeat.set(100, 100);
				plane_material.map = plane_tex;

				makeNewPlane(plane_material);
			});
		} else if (color) {
			const plane_material = new THREE.MeshPhongMaterial({
				color: color,
				side: THREE.BackSide,
			});
			makeNewPlane(plane_material);
		}
	}

	setSkybox(type_no) {
		let url_base = DescriptionTFWidget.SKYBOXES[type_no].url;
		let color = DescriptionTFWidget.SKYBOXES[type_no].color ? new THREE.Color(DescriptionTFWidget.SKYBOXES[type_no].color) : new THREE.Color('black');

		if (this.vars.perspective_camera && url_base) { //skybox doesn't work with otrho cameras
			if (!this.skybox_textures[type_no]) {
				this.skybox_textures[type_no] = this.cube_loader.load([
					url_base + "/cubemap_0.png",
					url_base + "/cubemap_1.png",
					url_base + "/cubemap_2.png",
					url_base + "/cubemap_3.png",
					url_base + "/cubemap_4.png",
					url_base + "/cubemap_5.png",
				]);
			}
			this.scene.background = this.skybox_textures[type_no];
		} else {
			this.scene.background = color;
		}
		this.setLight(this.vars.render_light);
	}

	setLight(type_no) {
		if (this.light) {
			this.light.removeFromParent();
			this.light = null;
		}
		if (this.ambience) {
			this.ambience.removeFromParent();
			this.ambience = null;
		}

		// light pos matches the skybox
		let light_pos = DescriptionTFWidget.SKYBOXES[this.vars.render_skybox].light_pos ? new THREE.Vector3(DescriptionTFWidget.SKYBOXES[this.vars.render_skybox].light_pos[0], DescriptionTFWidget.SKYBOXES[this.vars.render_skybox].light_pos[1], DescriptionTFWidget.SKYBOXES[this.vars.render_skybox].light_pos[2]) : null;
		if (light_pos) {
			if (this.robot) {
				console.log('Adding light robot_pos = ', this.robot.position, 'light_pos=', light_pos);
				let rwp = new THREE.Vector3();
				this.robot.getWorldPosition(rwp);
				light_pos.add(rwp);
			}
		}

		if (type_no == DescriptionTFWidget.LIGHT_WIDE_SPOTLIGHT || type_no == DescriptionTFWidget.LIGHT_NARROW_SPOTLIGHT) {

			this.light = new THREE.SpotLight(0xffffff, 250, 0, type_no == 0 ? Math.PI / 10 : Math.PI / 35);
			this.scene.add(this.light);
			if (light_pos)
				this.light.position.copy(light_pos);
			else
				this.light.position.set(10, type_no == 0 ? 5 : 15, 0); // will stay 5m above the model
			
			this.ambience = new THREE.AmbientLight(0x606060); // soft white light
			this.scene.add(this.ambience);

		} else if (type_no == DescriptionTFWidget.LIGHT_DIRECTIONAL) {

			this.light = new THREE.DirectionalLight(0xffffff, 1.0, 0, Math.PI / 10);
			
			this.scene.add(this.light);
			if (light_pos)
				this.light.position.copy(light_pos);
			else
				this.light.position.set(10, 15, 0); // will stay 5m above the model

			this.ambience = new THREE.AmbientLight(0x606060); // soft white light
			this.scene.add(this.ambience);

		} else if (type_no == DescriptionTFWidget.LIGHT_FLASHLIGHT) {

			this.light = new THREE.SpotLight(0xffffff, 2, 0, Math.PI / 4, 0, 0.5);
			
			this.camera.add(this.light);
			this.light.position.set(0.001, .001, .01);
			//let cp = new THREE.Vector3();
			//this.camera.getWorldPosition(cp);
			this.light.target = this.camera;

			this.ambience = new THREE.AmbientLight(0x606060); // soft white light
			this.scene.add(this.ambience);
			
		} else if (type_no == DescriptionTFWidget.LIGHT_AMBIENT_ONLY) { // only ambinece, no shadows

			this.ambience = new THREE.AmbientLight(0xffffff, 1.0); // stronger white light
			this.scene.add(this.ambience);

		}

		if (this.light) {
			this.light.castShadow = true; // default false
			this.light.shadow.mapSize.width = 5 * 1024; // default
			this.light.shadow.mapSize.height = 5 * 1024; // default
			this.light.shadow.camera.near = 0.5; // default
			this.light.shadow.camera.far = 20; // default
		}
	}

	onClose() {
		super.onClose();

		if (this.space_mouse) {
			this.space_mouse.destroy();
			delete this.space_mouse;
		}

		this.rendering = false; //kills the loop
		this.controls.dispose();
		this.controls = null;
		this.scene.clear();
		this.scene = null;
		this.renderer.dispose();
		this.renderer = null;
	}

	storeCameraPosePanelVars() {

		if (this.set_camera_view)
			return; // don't store until done setting initial camera pose		
	
		let ref_frame = (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY || !this.vars.camera_follows_selection || !this.camera_selection_ref)
						? this.ros_space
						: this.camera_selection_ref;
		
		this.camera_selection.getWorldPosition(this._camera_selection_position_world_space);
		let camera_selection_pos = ref_frame.worldToLocal(this._camera_selection_position_world_space); 
		this.camera_controls_target.getWorldPosition(this._camera_controls_target_position_world_space);
		let camera_controls_target_pos = ref_frame.worldToLocal(this._camera_controls_target_position_world_space); 
		this.camera.getWorldPosition(this._camera_position_world_space);
		let camera_pos = ref_frame.worldToLocal(this._camera_position_world_space);
		this.camera.getWorldQuaternion(this._camera_rotation_world_space);
		ref_frame.getWorldQuaternion(this._ref_frame_rotation_world_space);
		let camera_rotation = this._camera_rotation_world_space.premultiply(this._ref_frame_rotation_world_space.invert());
		
		this._camera_fw_axis.subVectors(camera_pos, camera_controls_target_pos); // in ref_frame

		this._up_axis.set(0,0,1); // Z is up in ROS
		if (this._camera_fw_axis.angleTo(this._up_axis) < 0.25) this._up_axis.set(1,0,0); // dodge gimbal lock, X is fw in ROS
		this._up_axis_projection.copy(this._up_axis).projectOnPlane(this._camera_fw_axis.normalize());

		this._camera_up.set(0,1,0).applyQuaternion(camera_rotation).normalize();
		let cam_axis_angle = signedAngle(this._up_axis_projection, this._camera_up, this._camera_fw_axis);

		if (!this.camera_selection_key || !this.vars.camera_follows_selection)
			this.panel.storePanelVarAsVector3('cs', camera_selection_pos);
		else
			this.panel.storePanelVarAsString('cs', this.camera_selection_key);
		let cam_pos_arr = [ camera_controls_target_pos.x, camera_controls_target_pos.y, camera_controls_target_pos.z,
							camera_pos.x, camera_pos.y, camera_pos.z ];
		if (Math.abs(cam_axis_angle) > 0.0001) // in rad
			cam_pos_arr.push(cam_axis_angle);
		else
			cam_pos_arr.push('0'); // mandatory val, horizon locked
		if (!this.vars.perspective_camera) // add othro zoom, cheaper to pass zoom than to calculate respective offset on every change
			cam_pos_arr.push(this.camera.zoom.toFixed(3)); // 8th val optional
		this.panel.storePanelVarAsFloatArray('cp', cam_pos_arr);

		if (this.DEBUG_CAMERA) {
			if (!this.test_up)
				this.test_up = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
			ref_frame.attach(this.test_up);
			this.test_up.position.copy(this._up_axis);

			if (this.test_line_up_projection)
				this.test_line_up_projection.removeFromParent();
			this.test_line_up_projection = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
				camera_controls_target_pos, camera_controls_target_pos.clone().add(this._up_axis_projection)
			]), new THREE.LineBasicMaterial({ color: 0x00ff00 })); // green up axis
			ref_frame.add(this.test_line_up_projection);

			if (this.test_line_camera_dir)	
				this.test_line_camera_dir.removeFromParent();
			this.test_line_camera_dir = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
				camera_controls_target_pos, camera_pos
			]), new THREE.LineBasicMaterial({ color: 0xffffff })); // white fw fector
			ref_frame.add(this.test_line_camera_dir);

			if (this.test_line_camera_up)	
				this.test_line_camera_up.removeFromParent();
			this.test_line_camera_up = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
				camera_controls_target_pos, camera_controls_target_pos.clone().add(this._camera_up)
			]), new THREE.LineBasicMaterial({ color: 0xff00ff })); // magenta camera up in local space
			ref_frame.add(this.test_line_camera_up);
		}
	}

	loadPanelConfig() {
	
		this.vars.camera_follows_selection = this.panel.getPanelVarAsBool('f', this.vars.camera_follows_selection);
		this.vars.camera_lock_horizon = this.panel.getPanelVarAsBool('ch', this.vars.camera_lock_horizon);
		this.vars.perspective_camera = this.panel.getPanelVarAsInt('ct', this.vars.perspective_camera ? 1 : 0) == 1;
		this.vars.render_joints = this.panel.getPanelVarAsBool('jnt', this.vars.render_joints);
		this.vars.render_links = this.panel.getPanelVarAsBool('lnk', this.vars.render_links);
		this.vars.render_ros_origin = this.panel.getPanelVarAsBool('ro', this.vars.render_ros_origin);
		this.vars.render_labels = this.panel.getPanelVarAsBool('lbl', this.vars.render_labels);
		this.vars.render_visuals = this.panel.getPanelVarAsBool('vis', this.vars.render_visuals);
		this.vars.render_collisions = this.panel.getPanelVarAsBool('col', this.vars.render_collisions);
		this.vars.fix_robot_base = this.panel.getPanelVarAsBool('fix', this.vars.fix_robot_base);
		this.vars.render_pose_graph = this.panel.getPanelVarAsBool('pg', this.vars.render_pose_graph);
		this.vars.render_ground_plane = this.panel.getPanelVarAsInt('grnd', this.vars.render_ground_plane);
		this.vars.render_skybox = this.panel.getPanelVarAsInt('sky', this.vars.render_skybox);
		this.vars.render_light = this.panel.getPanelVarAsInt('lght', this.vars.render_light);

		let camera_selection_pos = this.panel.getPanelVarAsVector3('cs', undefined);
		if (camera_selection_pos) {
			this.camera_selection_key = null;
		} else {
			this.camera_selection_key = this.panel.getPanelVarAsString('cs', null); // camera will be set on description
		}

		let cam_pos_arr = this.panel.getPanelVarAsFloatArray('cp', undefined);
		if (cam_pos_arr && cam_pos_arr.length > 5) {

			let camera_controls_target_pos = new THREE.Vector3(cam_pos_arr[0], cam_pos_arr[1], cam_pos_arr[2]);
			let camera_pos = new THREE.Vector3(cam_pos_arr[3], cam_pos_arr[4], cam_pos_arr[5]);
			let cam_axis_angle = cam_pos_arr.length > 6 ? parseFloat(cam_pos_arr[6]) : 0.0;

			if (cam_pos_arr.length > 7)
				this.set_ortho_camera_zoom = parseFloat(cam_pos_arr[7]); // evaluated in makeCamera()

			//let cam_rot_robot_space = new THREE.Quaternion(cam_pos_arr[0], cam_pos_arr[1], cam_pos_arr[2], cam_pos_arr[3]).normalize();
			//let dist_to_target = cam_pos_arr[4];
			
			// evaluated in renderingLoop()
			this.set_camera_view = {
				'camera_selection_pos': camera_selection_pos,
				'camera_controls_target_pos': camera_controls_target_pos,
				'camera_pos': camera_pos,
				'cam_axis_angle': cam_axis_angle
			};
			//this.camera_distance_initialized = true; // don't autodetect
		}
			
		this.sources.loadAssignedTopicsFromPanelVars();
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
		this.cleanModel(this.robot_model);
		this.robot.add(this.robot_model);
		this.robot_model.position.set(0, 0, 0); //reset pose, transform move with this.robot
		this.robot_model.quaternion.set(0, 0, 0, 1);
		console.log("Robot desc received, model: ", this.robot_model);

		this.applyStoredTFStatic();
		this.getAutofocusTarget();
		this.renderDirty();
	}

	cleanModel(obj, in_visual = false, in_collider = false,
		       force_material = null,
			   visuals_layer = DescriptionTFWidget.L_VISUALS,
			   colliders_layer = DescriptionTFWidget.L_COLLIDERS)
	{
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
            obj.layers.set(visuals_layer);
        
        // colliders
        } else if (obj.isMesh && in_collider) {
            obj.material = this.collider_mat;
            obj.scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
            obj.layers.set(colliders_layer);
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
				let res = this.cleanModel(ch, in_visual, in_collider, force_material, visuals_layer, colliders_layer); // recursion
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
		this.robot_pose_initialized = {};
		while (this.labelRenderer.domElement.children.length > 0) {
			this.labelRenderer.domElement.removeChild(
				this.labelRenderer.domElement.children[0],
			);
		}
	}

	getAutofocusTarget() { // called in onDescriptionData()
		let robot = this.robot_model;

		if (this.camera_selection_key && robot.joints[this.camera_selection_key]) {
			this.setCameraSelectionObject(
				robot.joints[this.camera_selection_key],
				this.camera_selection_key,
				false,
			);
			return;
		}
		if (this.camera_selection_key && robot.links[this.camera_selection_key]) {
			this.setCameraSelectionObject(
				robot.links[this.camera_selection_key],
				this.camera_selection_key,
				false,
			);
			return;
		}

		if (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY) {
			this.setCameraSelectionObject(
				this.ros_space,
				DescriptionTFWidget.ROS_SPACE_KEY,
				false,
			);
			return;
		}

		let wp = new Vector3();
		let pt_distances = [];
		let joints_avg_world = new Vector3(0, 0, 0);
		let joints_num = 0;
		let central_joint = null;
		let central_joint_key = null;

		// find the joint closest to avg center and set as target
		// also find the farthest for initial camera distance
		Object.keys(robot.joints).forEach((key) => {
			robot.joints[key].getWorldPosition(wp);
			joints_avg_world.add(wp);
			joints_num++;
		});
		if (joints_num) {
			joints_avg_world.divideScalar(joints_num);
			let closest_joint_dist = Number.POSITIVE_INFINITY;
			Object.keys(robot.joints).forEach((key) => {
				robot.joints[key].getWorldPosition(wp);
				let d = wp.distanceTo(joints_avg_world);
				if (d < closest_joint_dist) {
					closest_joint_dist = d;
					central_joint = robot.joints[key];
					central_joint_key = key;
				}
			});
		}
		Object.keys(robot.joints).forEach((key) => {
			robot.joints[key].getWorldPosition(wp);
			pt_distances.push(wp.distanceTo(joints_avg_world));
		});
		Object.keys(robot.links).forEach((key) => {
			robot.links[key].getWorldPosition(wp);
			pt_distances.push(wp.distanceTo(joints_avg_world));
		});
		Object.keys(robot.frames).forEach((key) => {
			robot.frames[key].getWorldPosition(wp);
			pt_distances.push(wp.distanceTo(joints_avg_world));
		});

		pt_distances.sort((a, b) => a - b);
		let num_distances = pt_distances.length;
		let model_size_approx = num_distances ? pt_distances[Math.round(num_distances*0.9)] : 2.0; // use ~90th percentile to avoid outliers

		console.log('[AutofocusTarget] Model size estimated at '+model_size_approx+"; auto central joint is "+central_joint_key);
		if (central_joint && central_joint_key)
			this.setCameraSelectionObject(central_joint, central_joint_key, false); // saves last selection

		// set initial distance proportional to model size
		if (!this.set_camera_view) {

			let initial_dist = model_size_approx * DescriptionTFWidget.INITIAL_CAMERA_DISTANCE_MULTIPLIER;
			console.log('[AutofocusTarget] Setting initial camera distance to '+initial_dist);
			let camera_world_pos = DescriptionTFWidget.INITIAL_CAMERA_POSITION.clone()
								   .normalize()
								   .multiplyScalar(initial_dist)
								   .add(joints_avg_world);
			
			let ref_frame = (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY || !this.vars.camera_follows_selection || !this.camera_selection_ref)
						  ? this.ros_space
						  : this.camera_selection_ref;

			let camera_ref_frame_pos = ref_frame.worldToLocal(camera_world_pos);
			let selection_ref_frame_pos = ref_frame === this.ros_space ? ref_frame.worldToLocal(joints_avg_world) : new THREE.Vector3(0,0,0);

			this.set_camera_view = {
				'camera_selection_pos': selection_ref_frame_pos,
				'camera_controls_target_pos': selection_ref_frame_pos,
				'camera_pos': camera_ref_frame_pos,
				'cam_axis_angle': 0.0 // horizon level
			};
		}
	}

	setCameraSelectionObject(new_target, new_target_key, force_look_at = false) {
		console.log("Setting cam target to: " + new_target_key);

		let taget_world_pos = new THREE.Vector3();
		new_target.getWorldPosition(taget_world_pos);

		this.scene.attach(this.camera_selection);
		this.scene.attach(this.camera_controls_target);

		this.camera_selection.position.copy(taget_world_pos);
		this.camera_controls_target.position.copy(taget_world_pos);

		this.camera_selection_key = new_target_key;
		this.camera_selection_ref = new_target;

		this.last_camera_selection_key = new_target_key;
		this.last_camera_selection_ref = new_target;

		// if (!this.vars.camera_follows_selection && force_look_at) {
		// 	this.vars.camera_follows_selection = true;
		// 	this.panel.storePanelVarAsInt('f', 1);
		// 	this.camera_follows_selection_btn.addClass("on");
		// }
		
		if (force_look_at)
			this.storeCameraPosePanelVars();

		this.makeRobotMarkers();
		this.makeROSOriginMarker();
	}

	setCameraSelectionPosition(new_cursor_world_position) {
		console.log("Setting camera selection to: [" + new_cursor_world_position.x.toFixed(2) + ";" + new_cursor_world_position.y.toFixed(2) + ";" + new_cursor_world_position.z.toFixed(3) + "]");

		this.scene.attach(this.camera_selection);
		this.scene.attach(this.camera_controls_target);

		this.camera_selection.position.copy(new_cursor_world_position);
		this.camera_controls_target.position.copy(new_cursor_world_position);

		//this.camera.lookAt(this.camera_controls_target.position);
		this.controls.update();

		this.camera_selection_key = null;
		this.camera_selection_ref = null;

		if (this.vars.camera_follows_selection) {
			this.vars.camera_follows_selection = false;
			this.panel.storePanelVarAsInt('f', 0);
			this.camera_follows_selection_btn.removeClass("on");
			this.makeRobotMarkers();
			this.makeROSOriginMarker();
		}

		this.storeCameraPosePanelVars()
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

	makeMark(target, label_text, layer_axes, layer_labels, axis_size = 0.02, h_center = true, v_center = 0) {
		let is_selected = this.vars.camera_follows_selection && target === this.camera_selection_ref;

		if (!is_selected && (layer_axes == DescriptionTFWidget.L_JOINTS || layer_axes == DescriptionTFWidget.L_LINKS)) {
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
				el.className += layer_labels == DescriptionTFWidget.L_JOINT_LABELS
						? " joint"
						: " link";
			el.textContent = label_text;

			label_el = new CSS2DObject(el);
			let that = this;
			el.addEventListener("pointerdown", function (ev) {
				that.setCameraSelectionObject(target, label_text, true); // label=key, turns on following
				ev.preventDefault();
			});
			target.add(label_el);
			label_el.center.set(h_center ? 0.5 : layer_labels == DescriptionTFWidget.L_JOINT_LABELS
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
		if (this.panel.paused || !this.robot_model) {
			if (topic == '/tf_static') {
				console.log('Got /tf_static before model (or when paused):', tf);
				this.tf_static_to_apply[topic] = tf;
			}
			return; //wait for the model
		}

		if (topic == '/tf_static') {
			console.log('Got /tf_static:', tf);
		} else if (!this.tf_logged) {
			this.tf_logged = true;
			console.log('Got /tf:', tf);
		}

		for (let i = 0; i < tf.transforms.length; i++) {
			let ns_stamp = tf.transforms[i].header.stamp.sec * 1000000000 + tf.transforms[i].header.stamp.nanosec;
			let id_child = tf.transforms[i].child_frame_id;
			let t = tf.transforms[i].transform;

			// let filter = [ 'camera_link_top', 'camera_joint_top' ];
			// if (filter.indexOf(tf.transforms[i].header.frame_id) > -1 || filter.indexOf(id_child) > -1)
			// 	console.log('TF: "' + tf.transforms[i].header.frame_id + ' > ' + id_child + '" ('+topic+'):', tf);

			if (this.transforms_queue[id_child] !== undefined && this.transforms_queue[id_child].stamp >= ns_stamp)
				continue; //throw out older transforms

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

			this.transforms_queue[id_child] = {
				parent: tf.transforms[i].header.frame_id,
				transform: t,
				stamp: ns_stamp,
			};

			if (id_child == this.robot_model.name) {
				//this is the base link

				if (!this.ros_space_offset_set) {
					// moves ros space so that the initial robot's position and rotation is aligned with the scene's origin
					// all furher transforms then take place in the ros space

					let ref_frame = (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY || !this.vars.camera_follows_selection || !this.camera_selection_ref)
						? this.ros_space
						: this.camera_selection_ref;
					ref_frame.attach(this.camera_controls_target);
					ref_frame.attach(this.camera);
					ref_frame.attach(this.camera_selection);
					// if (this.vars.camera_follows_selection && this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY) {
					// 	this.ros_space.attach(this.camera_controls_target);
					// 	this.ros_space.attach(this.camera);
					// }

					this.ros_space.quaternion.copy(this.ros_space_default_rotation)
										     .multiply(t.rotation.clone().invert()); // robot aligned with scene
					let t_pos = t.translation
						.clone()
						.applyQuaternion(this.ros_space.quaternion);
					this.ros_space.position.copy(t_pos.clone().negate());

					this.scene.attach(this.camera_controls_target);
					this.scene.attach(this.camera);
					this.scene.attach(this.camera_selection);

					// if (this.vars.camera_follows_selection && this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY) {
					// 	this.scene.attach(this.camera_controls_target);
					// 	this.scene.attach(this.camera);
					// }

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

	onUnpaused() {
		this.applyStoredTFStatic();
	}

	applyStoredTFStatic() {
		let topics = Object.keys(this.tf_static_to_apply);
		topics.forEach((t)=>{
			let tf = this.tf_static_to_apply[t];
			delete this.tf_static_to_apply[t]
			this.onTFData(t, tf);
		});
	}

	controlsChanged() {
		this.controls_dirty = true;
	}

	renderDirty() {
		if (!this.renderer) return;

		this.render_dirty = true;
	}

	renderingLoop(now) {
		if (!this.rendering || !this.robot_model || (this.vars.camera_follows_selection && !this.camera_selection_ref)) {
			requestAnimationFrame((t) => this.renderingLoop(t));
			return;
		}

		const lerp_amount = 0.2;
		const cam_lerp_amount = 1.0;
		let that = this;

		//let d_pos = new THREE.Vector3();

		// move camera to position relative to target (animation after view is selected)
		if (this.set_camera_view && this.set_camera_view['camera_pos']) { // from panel vars or auto focus

			let camera_controls_target_pos = this.set_camera_view['camera_controls_target_pos']; // in ref_frame space
			let camera_pos = this.set_camera_view['camera_pos']; // in ref_frame space
			let cam_axis_angle = this.set_camera_view['cam_axis_angle'];
			let camera_selection_pos = this.set_camera_view['camera_selection_pos'];

			let ref_frame = (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY || !this.vars.camera_follows_selection || !this.camera_selection_ref)
					? this.ros_space
					: this.camera_selection_ref;
			
			let camera_fw_axis = new THREE.Vector3().subVectors(camera_pos, camera_controls_target_pos).normalize(); // in ref_frame

			let up_axis = new THREE.Vector3(0,0,1); // Z is up in ROS
			if (camera_fw_axis.angleTo(up_axis) < 0.25) up_axis.set(1,0,0); // dodge gimbal lock, X is fw in ROS
			let up_axis_projection = new THREE.Vector3().copy(up_axis).projectOnPlane(camera_fw_axis).normalize();
			
			ref_frame.attach(this.camera);
			ref_frame.attach(this.camera_controls_target);
			ref_frame.attach(this.camera_selection);

			if (this.DEBUG_CAMERA) {
				if (!this.test_up)
					this.test_up = new THREE.Mesh(new THREE.SphereGeometry(0.01, 32, 16), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
				ref_frame.attach(this.test_up);
				this.test_up.position.copy(up_axis);

				if (this.test_line_up_projection)
					this.test_line_up_projection.removeFromParent();
				this.test_line_up_projection = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
					camera_controls_target_pos, camera_controls_target_pos.clone().add(up_axis_projection)
				]), new THREE.LineBasicMaterial({ color: 0x00ff00 })); // green up axis
				ref_frame.add(this.test_line_up_projection);

				if (this.test_line_camera_dir)	
					this.test_line_camera_dir.removeFromParent();
				this.test_line_camera_dir = new THREE.Line(new THREE.BufferGeometry().setFromPoints([
					camera_controls_target_pos, camera_pos
				]), new THREE.LineBasicMaterial({ color: 0xffffff })); // white fw fector
				ref_frame.add(this.test_line_camera_dir);
			}

			this.camera_controls_target.position.copy(camera_controls_target_pos);
			this.camera.position.copy(camera_pos);
			if (camera_selection_pos)
				this.camera_selection.position.copy(camera_selection_pos);

			const camera_right = new THREE.Vector3().crossVectors(camera_fw_axis, up_axis_projection).normalize();
			const matrix = new THREE.Matrix4().set(
				camera_right.x, up_axis_projection.x, -camera_fw_axis.x, 0,
				camera_right.y, up_axis_projection.y, -camera_fw_axis.y, 0,
				camera_right.z, up_axis_projection.z, -camera_fw_axis.z, 0,
				0, 0, 0, 1
			);
			this.camera.setRotationFromMatrix(matrix.setPosition(0, 0, 0));  // apply rotation only
			this.camera.rotateOnWorldAxis(camera_fw_axis, cam_axis_angle);
			
			this.scene.attach(this.camera);
			this.scene.attach(this.camera_controls_target);
			this.scene.attach(this.camera_selection);

			this.controls.update();
			this.set_camera_view = null; // done
			this.camera_pose_initialized = true; // lerp camera from now on
		}

		else if (this.set_camera_view && this.set_camera_view['start']) { // slerp

			const animation_duration = 1000;

			if (this.camera_selection && this.vars.camera_follows_selection) {
				this.camera_selection.getWorldPosition(this.camera_controls_target.position);
			}

			let lerp_amount = (Date.now() - this.set_camera_view['start']) / animation_duration;
			let done = false;
			if (lerp_amount >= 1.0) {
				lerp_amount = 1.0;
				done = true;
			}

			let target_pos = this.camera_controls_target.position
				.clone()
				.add(this.set_camera_view['target_offset_pos']); //update as the robor/target move
			this.camera.position.copy(
				this.set_camera_view['start_cam_position'].lerp(target_pos, lerp_amount),
			);

			let rwq = new THREE.Quaternion();
			if (!this.vars.camera_follows_selection || this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY)
				this.ros_space.getWorldQuaternion(rwq);
			else this.robot.getWorldQuaternion(rwq);
			let target_rot = rwq.multiply(this.set_camera_view['target_rot'].clone()); //update as the robor/target move
			this.camera.quaternion.copy(
				this.set_camera_view['start_cam_rotation'].slerp(target_rot, lerp_amount),
			);

			//this.camera_world_pos.copy(this.camera.position);
			this.controls_dirty = true;

			if (done) {
				this.set_camera_view = null;
				this.controls.enabled = true;
				this.controls.update();
				this.storeCameraPosePanelVars();
				this.camera_pose_initialized = true; // lerp camera from now on
			}

		} else if (this.camera_pose_initialized) {
			if (this.space_mouse && this.space_mouse.animating) {
				this.space_mouse.space_mouse.update3dcontroller({
           			'frame': { 'time': now }
				});
			
			} else {
				this.controls.update();
			}			
		}

		// set model transforms
		if (this.robot_model.frames) {

			if (this.vars.camera_follows_selection && this.camera_selection_ref) {
				this.camera_selection_ref.attach(this.camera);
				this.camera_selection_ref.attach(this.camera_controls_target);
				this.camera_selection_ref.attach(this.camera_selection);
				this.camera_selection.position.set(0,0,0);
				if (this.space_mouse && this.space_mouse.pivot_position)
					this.camera_selection_ref.attach(this.space_mouse.pivot_position);
			}

			let transform_ch_frames = Object.keys(this.transforms_queue);
			for (let i = 0; i < transform_ch_frames.length; i++) {

				let id_child = transform_ch_frames[i];
				let id_parent = this.transforms_queue[id_child].parent;
				let t = this.transforms_queue[id_child].transform;

				let t_parent = this.robot_model.frames[id_parent];
				let t_child = this.robot_model.frames[id_child];
				if (!t_child) {
					// child node not present in urdf
					if (!this.missing_transform_error_logged[t_child]) {
						this.missing_transform_error_logged[t_child] = true;
						let msg = id_child + " not found in the URDF model";
						this.panel.ui.showNotification(msg, "error", "<pre>Source: transform</pre>");
						console.error(msg);
					}
					continue;
				} else if (this.missing_transform_error_logged[t_child]) {
					delete this.missing_transform_error_logged[t_child];
				}

				if (id_child == this.robot_model.name) {
					// robot base frame => move this.robot in ros_space

					if (!this.vars.fix_robot_base) { // robot moves around
						let pos = t.translation;

						this.robot.getWorldPosition(this._old_robot_world_position);

						if (!this.robot_pose_initialized[id_child])
							this.robot.position.copy(pos); // 1st hard set without lerping
						else
							this.robot.position.lerp(pos, lerp_amount);

						this.robot.getWorldPosition(this._new_robot_world_position);
						this._delta_robot_pos.subVectors(this._new_robot_world_position, this._old_robot_world_position);

						// move light
						if (this.light && this.vars.render_light != DescriptionTFWidget.LIGHT_FLASHLIGHT && this.robot_pose_initialized[id_child] &&
							this.vars.camera_follows_selection && this.camera_selection_key != DescriptionTFWidget.ROS_SPACE_KEY
						) this.light.position.add(this._delta_robot_pos);
					}

					// let old_robot_world_rotation = new THREE.Quaternion();
					// this.robot.getWorldQuaternion(old_robot_world_rotation);

					// let rot = new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
					// rot = rot.multiply(this.rot_offset);

					// set robot rot (even when fixes)
					if (!this.robot_pose_initialized[id_child])
						this.robot.quaternion.copy(t.rotation); // 1st hard set
					else
						this.robot.quaternion.slerp(t.rotation, lerp_amount);

					// let new_robot_world_rotation = new THREE.Quaternion();
					// this.robot.getWorldQuaternion(new_robot_world_rotation);

					// let d_rot_rad = old_robot_world_rotation.angleTo(new_robot_world_rotation);
					//let d_rot = new_robot_world_rotation.multiply(old_robot_world_rotation.invert());

					// saves new camera pos in relation to robot as it moves around
					if (!this.set_camera_view &&
						!this.vars.camera_follows_selection &&
						this.last_camera_url_update + 1000 < Date.now()
					) {
						setTimeout(() => {
							this.last_camera_url_update = Date.now();
							this.storeCameraPosePanelVars();
						}, 0);
					}

					this.robot_pose_initialized[id_child] = true;

					this.renderDirty();

				} else if (t_child && t_parent) {
					// animate all other model joints

					let orig_p = t_child.parent;
					t_parent.attach(t_child);
					if (!this.robot_pose_initialized[id_child]) {
						// 1st hard set
						t_child.position.set(
							t.translation.x,
							t.translation.y,
							t.translation.z
						);
						t_child.quaternion.set(
							t.rotation.x,
							t.rotation.y,
							t.rotation.z,
							t.rotation.w
						);
						this.robot_pose_initialized[id_child] = true;
					} else {
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
					}
					orig_p.attach(t_child);

					this.renderDirty();
				}
			}

			this.scene.attach(this.camera);
			this.scene.attach(this.camera_controls_target);
			this.scene.attach(this.camera_selection);
			if (this.space_mouse && this.space_mouse.pivot_position)
				this.scene.attach(this.space_mouse.pivot_position);
		}

		this.transforms_queue = {};


		// set camera rot and offset from url (only once on init)
		// if (this.set_camera_target_offset) {
		// 	if (this.camera_selection && this.vars.camera_follows_selection) {
		// 		this.camera_selection.getWorldPosition(this.camera_controls_target.position);
		// 	}

		// 	let rwq = new THREE.Quaternion();
		// 	if (this.camera_selection_key == DescriptionTFWidget.ROS_SPACE_KEY)
		// 		this.ros_space.getWorldQuaternion(rwq);
		// 	else this.robot.getWorldQuaternion(rwq);
		// 	let cam_rot = rwq.multiply(this.set_camera_target_offset.rotation);

		// 	let v = new THREE.Vector3(0, 0, this.set_camera_target_offset.distance); // -z is fw
		// 	v.applyQuaternion(cam_rot);

		// 	this.camera_world_pos.copy(this.camera_controls_target.position.clone().add(v));
		// 	this.camera.position.copy(this.camera_world_pos);
		// 	this.camera.quaternion.copy(cam_rot);

		// 	this.set_camera_target_offset = null;
		// 	this.controls.update();
		// }

		if (this.light && this.vars.render_light != DescriptionTFWidget.LIGHT_FLASHLIGHT)
			this.light.target = this.camera_selection;

		// render the scene
		if ((this.controls_dirty || this.render_dirty)) {
			try {

				this.controls_dirty = false;
				this.render_dirty = false;
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

		// if (this.light && this.vars.render_light == 3 && this.camera) {
		// 	let cp = this.camera.localToWorld(new THREE.Vector3(1,0,-1));
		// 	this.light.lookAt(cp);
		// }

		requestAnimationFrame((t) => this.renderingLoop(t));
	}
}
