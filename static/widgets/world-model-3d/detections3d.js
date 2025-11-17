import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";
import { STLLoader } from "stl-loader";
import { ColladaLoader } from "collada-loader";
import { CSS2DRenderer, CSS2DObject } from "css-2d-renderer";
import { WorldModel3DPuginBase } from "./world-model-plugin-base.js";

export class WorldModel3DWidget_Detections3D extends WorldModel3DPuginBase {
    
    static SOURCE_TOPIC_TYPE = 'vision_msgs/msg/Detection3DArray';
    static SOURCE_DESCRIPTION = 'Detection 3D Array';
    static SOURCE_DEFAULT_TOPIC = null;
    static SOURCE_MAX_NUM = -1;
	static L_DETECTION_LABELS = 10; // unique layer for the labels
	static CLEAR_TIMEOUT_MS = 300; // clear if no new data received in this long
	static DEFAULT_DETECTION_COLOR = new THREE.Color(0xff00ff);

    constructor(world_model) {

        super(world_model);

		this.loaded_models = {}; // path => true (loading) || false (err) || object
		
		this.detection_materials_by_color = {};
		this.display_labels = world_model.panel.getPanelVarAsBool('dl', true);

		this.setDisplayLabels(this.display_labels);
    }
	
    addTopic(topic) {
		super.addTopic(topic);
		console.warn('World Model Detections3D adding topic ', topic);
		let config = this.client.getTopicConfig(topic);

		this.setTopicConfig(topic, config);

		this.overlays[topic].config_change_cb = (new_config) => { // we need a wrapper for config change
            this.setTopicConfig(topic, new_config);
        }
        this.client.onTopicConfig(topic, this.overlays[topic].config_change_cb);
    }

	setTopicConfig(topic, config) {
		let overlay = this.overlays[topic];
		overlay.config = config;

		overlay.detection_class_colors = [];
		if (config && config["color_map"] !== undefined) {
			for (let class_id = 0; class_id < config["color_map"].length; class_id++) {
				let c = config["color_map"][class_id];
				if (!c || ['null', 'none', 'no', '', 'model'].indexOf(c.toLowerCase().trim()) != -1)
					c = null;
				let color = c ? new THREE.Color(c) : null;
				overlay.detection_class_colors[class_id] = color;
			}
		}

		this.clearVisuals(topic); // force re-render

        if (config && config["model_map"] !== undefined) {

			for (let class_id = 0; class_id < config["model_map"].length; class_id++) {
            	let model_path = config["model_map"][class_id];
            	if (this.loaded_models[model_path] !== undefined)
                	continue;
			}

            this.loadDetectionModels(topic, config["model_map"]);
		}
	}

    loadDetectionModels(topic, model_map) {
        let that = this;
		let overlay = this.overlays[topic];
        for (let class_id = 0; class_id < model_map.length; class_id++) {
            let model_path = model_map[class_id];
            if (this.loaded_models[model_path] !== undefined)
                continue;

            if (!model_path || ['none', 'null', 'default'].indexOf(model_path.toLowerCase()) != -1) {
                this.loaded_models[model_path] = false; //
                continue;
            }

            this.loaded_models[model_path] = true;
		
            this.loadDetectionModel(model_path, (src_model) => {
                console.log("ModelLoader: Model loaded for " + model_path, src_model);
                that.loaded_models[model_path] = src_model; // original materials
				that.clearDetectionMarkersForModel(model_path);
            });

        }
    }

    loadDetectionModel(path, done_cb) {
        let parts = path.split(' ');
        let loadPath = parts[0];

        let scale = new THREE.Vector3(1,1,1); // default scale
        for (let i = 1; i < parts.length; i++) { // parse custom scale
            if (parts[i].indexOf('scale=') !== -1) {
                let scale_str = parts[i].replace('scale=', '').trim();
                scale_str = scale_str.replace('[', ''); scale_str = scale_str.replace(']', '');
                let scale_parts = scale_str.split(',');
                if (scale_parts.length > 0) scale.x = parseFloat(scale_parts[0]);
                if (scale_parts.length > 1) scale.y = parseFloat(scale_parts[1]);
                if (scale_parts.length > 2) scale.z = parseFloat(scale_parts[2]);
            }
        }

        console.warn("ModelLoader: Loading model from path: ", loadPath);
        let that = this;		
        if (/\.stl$/i.test(loadPath)) {
            const loader = new STLLoader(this.world_model.loading_manager);
            loader.load(loadPath, (geom) => {
                let stl_mat = that.getMaterialForColor(WorldModel3DWidget_Detections3D.DEFAULT_DETECTION_COLOR); // stl has no materials
                let mesh = new THREE.Mesh(geom, stl_mat);
				mesh.scale.copy(scale);
                //that.world_model.cleanModel(clean_model, true);
                let src_model = new THREE.Object3D();
                src_model.add(mesh);
                done_cb(src_model);
            });
        } else if (/\.dae$/i.test(loadPath)) {
            const loader = new ColladaLoader(this.world_model.loading_manager);
            loader.load(loadPath, (dae) => {
                let src_model = dae.scene; // has materials
				src_model.scale.copy(scale); // scale from config
                //that.world_model.cleanModel(clean_model, true, false, force_material); // dae might have materials
                done_cb(src_model);
            });
        } else if (loadPath.toLowerCase() == 'cylinder') {
            let mat = that.getMaterialForColor(WorldModel3DWidget_Detections3D.DEFAULT_DETECTION_COLOR);
            let primitive = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1,32), mat);
            primitive.position.set(0,0,-0.5);
            primitive.rotation.set(Math.PI/2, 0, 0);
			primitive.castShadow = true;
            primitive.receiveShadow = true;
            let src_model = new THREE.Object3D();
            src_model.scale.copy(scale);
            src_model.add(primitive);
            done_cb(src_model);
        } else if (loadPath.toLowerCase() == 'sphere') {
            let mat = that.getMaterialForColor(WorldModel3DWidget_Detections3D.DEFAULT_DETECTION_COLOR);
            let primitive = new THREE.Mesh(new THREE.SphereGeometry(.5,32), mat);
			primitive.castShadow = true;
            primitive.receiveShadow = true;
            let src_model = new THREE.Object3D();
            src_model.scale.copy(scale);
            src_model.add(primitive);
            done_cb(src_model);
        } else {
            console.error(`ModelLoader: Could not load model at ${loadPath}.\nNo loader available`);
        }
    }

	clearDetectionMarkersForModel(model_path) {
		// remove all temp bboxes so that the next update uses loaded model
		let topics = Object.keys(this.overlays);
		let that = this;
		topics.forEach((topic) => {
			let overlay = that.overlays[topic];
			let config = overlay.config;
			if (!config) return;
			let model_map = config['model_map'];
			if (overlay.detection_markers && overlay.detection_markers.length) {
				for (let class_id = 0; class_id < overlay.detection_markers.length; class_id++) {
					if (!model_map || model_map[class_id] == model_path) {
						if (!overlay.detection_markers[class_id])
							continue;
						overlay.detection_markers[class_id].forEach((marker_el)=>{
							marker_el.removeFromParent();
						});
						overlay.detection_markers[class_id] = [];
					}
				}
			}
		});
	}

    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused)
			return;

		let overlay = this.overlays[topic];
		if (!overlay)
			return;

		if (!overlay.config)
			return; // wait for config

		let frame_id = msg.header.frame_id;
		let f = this.world_model.robot_model.getFrame(frame_id);
		if (!f) {
			if (!overlay.error_logged) {
				overlay.error_logge = true; //only log once
				let err = 'Frame "' + frame_id + '" not found in robot model for detection data from ' + topic;
				this.ui.showNotification(err, "error");
				console.error(err);
			}
			return;
		} else if (overlay.error_logged) {
			delete overlay.error_logged;
		}
		overlay.detection_frame = f;

		overlay.dirty_detection_results = [];

		let num_detections_per_class = {};

		for (let i = 0; i < msg.detections.length; i++) {

			let res = msg.detections[i].results[0];
			let box_center = new THREE.Vector3(
				msg.detections[i]["bbox"]["center"]["position"]["x"],
				msg.detections[i]["bbox"]["center"]["position"]["y"],
				msg.detections[i]["bbox"]["center"]["position"]["z"],
			);
			let box_scale = new THREE.Vector3(
				msg.detections[i]["bbox"]["size"]["x"],
				msg.detections[i]["bbox"]["size"]["y"],
				msg.detections[i]["bbox"]["size"]["z"],
			);
			let position = new THREE.Vector3(
				res["pose"]["pose"]["position"]["x"],
				res["pose"]["pose"]["position"]["y"],
				res["pose"]["pose"]["position"]["z"],
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
				points: [ box_center ],
				color: overlay.detection_class_colors[res.hypothesis.class_id] ? overlay.detection_class_colors[res.hypothesis.class_id] : WorldModel3DWidget_Detections3D.DEFAULT_DETECTION_COLOR
			};

			overlay.dirty_detection_results.push(d);

			if (!overlay.detection_markers) overlay.detection_markers = [];
			if (!overlay.detection_markers[d.class_id]) overlay.detection_markers[d.class_id] = [];
			if (!overlay.detection_labels) overlay.detection_labels = [];
			if (!overlay.detection_labels[d.class_id]) overlay.detection_labels[d.class_id] = [];

			if (!num_detections_per_class[d.class_id]) num_detections_per_class[d.class_id] = 1;
			else num_detections_per_class[d.class_id]++;
			let i_class = num_detections_per_class[d.class_id] - 1;

			let l = "Class " + d.class_id;
			if (overlay.config["label_map"] && overlay.config["label_map"][d.class_id])
				l = overlay.config["label_map"][d.class_id];
			l += " (" + d.score.toFixed(2) + ")\n";
			//+"[" + box_center.x.toFixed(2) + ";" + box_center.y.toFixed(2) + ";" + box_center.z.toFixed(2) + "]";

			if (!overlay.detection_labels[d.class_id][i_class]) {
				const el = document.createElement("div");
				el.className = "detection_label";
				const label2d = new CSS2DObject(el);
				let that = this;
				el.addEventListener("pointerdown", function (ev) {
					let m = overlay.detection_markers[d.class_id][i_class];
					let pos = new THREE.Vector3();
					m.getWorldPosition(pos);
					that.world_model.setCameraTargetPosition(pos);
					ev.preventDefault();
				});
				label2d.center.set(0.5, 0);
				f.add(label2d);
				overlay.detection_labels[d.class_id][i_class] = label2d;
			}
			let label_el = overlay.detection_labels[d.class_id][i_class];
			label_el.element.textContent = l;
			label_el.element.hidden = false;
			label_el.position.set(box_center.x, box_center.y, box_center.z);
			label_el.layers.set(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);

			let marker_el = null;
			if (!overlay.detection_markers[d.class_id][i_class]) {
				
				if (overlay.config["model_map"] && overlay.config["model_map"][d.class_id]) {
				
					let model_path = overlay.config["model_map"][d.class_id];
					if (this.loaded_models[model_path] instanceof THREE.Object3D) {
						let model = new THREE.Object3D();
						model.copy(this.loaded_models[model_path]); // src with original materials
						let use_model_materials = overlay.detection_class_colors[d.class_id] ? false : true;
						this.world_model.cleanModel(model, true, false, use_model_materials ? null : this.getMaterialForColor(overlay.detection_class_colors[d.class_id]));
						model.is_model = true; // not a bbox
						f.add(model);
						overlay.detection_markers[d.class_id][i_class] = model;
					}
				}
				
				// make a fallback bbox cube
				if (!overlay.detection_markers[d.class_id][i_class]) {
					const geometry = new THREE.BoxGeometry(1, 1, 1);
					const cube = new THREE.Mesh(geometry, this.getMaterialForColor(d.color));
					cube.castShadow = true;
					cube.receiveShadow = true;
					f.add(cube);
					overlay.detection_markers[d.class_id][i_class] = cube;
				}
			}

			marker_el = overlay.detection_markers[d.class_id][i_class];
			marker_el.visible = true;
			
			marker_el.quaternion.copy(rotation);
			if (!marker_el.is_model) { // bbox scale/pos
				marker_el.scale.copy(box_scale);
				marker_el.position.copy(box_center);
			} else { // model scale pos
				marker_el.position.copy(position);
			}
		}

		// hide excess instances of labels and markers rather than destroying them
		if (overlay.detection_labels) {
			let class_ids = Object.keys(overlay.detection_labels);
			class_ids.forEach((class_id)=>{
				for (let i = num_detections_per_class[class_id] ? num_detections_per_class[class_id] : 0; i < overlay.detection_labels[class_id].length; i++) {
					overlay.detection_labels[class_id][i].element.hidden = true;
				}
			});
		}
		if (overlay.detection_markers) {
			let class_ids = Object.keys(overlay.detection_markers);
			class_ids.forEach((class_id)=>{
				for (let i = num_detections_per_class[class_id] ? num_detections_per_class[class_id] : 0; i < overlay.detection_markers[class_id].length; i++) {
					overlay.detection_markers[class_id][i].visible = false;
				}
			});
		}

		this.clearDetectionsOnTimeout(topic);
    }

    // render all detections
    onRender() {
        let that = this;
        let topics = Object.keys(this.overlays);
		topics.forEach((topic) => {
			let overlay = that.overlays[topic];
			if (!overlay)
				return;
			let detection_results = overlay.dirty_detection_results;
			if (!detection_results)
				return;
			delete overlay.dirty_detection_results;

			let detection_points = []; //all for this topic
			let detection_colors = [];
			let frame_base = new THREE.Vector3(0.0, 0.0, 0.0);
			for (let i = 0; i < detection_results.length; i++) {
				detection_points.push(frame_base.x, frame_base.y, frame_base.z);
				detection_points.push(detection_results[i].points[0].x, detection_results[i].points[0].y, detection_results[i].points[0].z);
				let c = detection_results[i].color;
				detection_colors.push(c.r, c.g, c.b, 0.7);
				detection_colors.push(c.r, c.g, c.b, 0.7);
			}
			
			// if number of verts in mesh too small, rebuild
			if (overlay.detection_lines && overlay.detection_lines.geometry && overlay.detection_lines.geometry.lastNumPositions < detection_points.length) {
				overlay.detection_lines.removeFromParent();
				delete overlay.detection_lines;
				overlay.detection_lines_geometry.dispose();
				delete overlay.detection_lines_geometry;
			}

			if (!overlay.detection_lines) {
				const material = new LineMaterial({
					linewidth: 2,
					transparent: true,
					vertexColors: true,
				});

				overlay.detection_lines_geometry = new LineSegmentsGeometry2()
					.setPositions(detection_points)
					.setColors(detection_colors);

				overlay.detection_lines = new LineSegments2(
					overlay.detection_lines_geometry,
					material,
				);
				overlay.detection_lines.castShadow = false;
				overlay.detection_lines.receiveShadow = false;
				if (overlay.detection_frame) {
					overlay.detection_frame.add(overlay.detection_lines);
				}
			} else {
				overlay.detection_lines_geometry
					.setPositions(detection_points)
					.setColors(detection_colors);
			}
		});
    }

    
    getMaterialForColor(color) {
        let id = color.getHexString();
        if (!this.detection_materials_by_color[id]) {
            this.detection_materials_by_color[id] = new THREE.MeshBasicMaterial({
				color: color,
				transparent: true,
				opacity: 0.5
			});
        }
        return this.detection_materials_by_color[id];
    }

    clearDetectionsOnTimeout(topic) {
		let overlay = this.overlays[topic];

		if (overlay.clear_detections_timeout)
			clearTimeout(overlay.clear_detections_timeout);

		let that = this;
		overlay.clear_detections_timeout = setTimeout(() => {
			if (that.world_model.panel.paused) {
				//don't clear while paused
				that.clearDetectionsOnTimeout(topic);
				return;
			}

			overlay.dirty_detection_results = [];
			if (overlay.detection_labels) {
				let class_ids = Object.keys(overlay.detection_labels);
				class_ids.forEach((class_id)=>{
					for (let i = 0; i < overlay.detection_labels[class_id].length; i++) {
						overlay.detection_labels[class_id][i].element.hidden = true;
					}
				});
			}
			if (overlay.detection_markers) {
				let class_ids = Object.keys(overlay.detection_markers);
				class_ids.forEach((class_id)=>{
					for (let i = 0; i < overlay.detection_markers[class_id].length; i++) {
						overlay.detection_markers[class_id][i].visible = false;
					}
				});
			}
			that.world_model.renderDirty();
		}, WorldModel3DWidget_Detections3D.CLEAR_TIMEOUT_MS);
	}

    setupMenu(menu_els) {
		if (!this.world_model.sources.hasType(WorldModel3DWidget_Detections3D.SOURCE_TOPIC_TYPE)) 
			return; // only show when topics are subscribed to
		
        let line_el = $('<div class="menu_line"></div>');
        let label = $('<label for="show_detection_labels_'+this.world_model.panel.n+'">Show detection labels</label>');
        let inp = $('<input type="checkbox" id="show_detection_labels_'+this.world_model.panel.n+'" title="Show detection labels"/>');
		if (this.display_labels)
			inp.prop('checked', true);
        label.append(inp);
        line_el.append([ label ]);

        let that = this;

        inp.change(function(ev) {
			let state = inp.prop('checked');
            that.setDisplayLabels(state);
			that.world_model.panel.storePanelVarAsBool('dl', state);
        });
        
        menu_els.push(line_el);
    }

    setDisplayLabels(state) {
		this.display_labels = state;
		if (this.display_labels)
			this.world_model.camera.layers.enable(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);
		else
			this.world_model.camera.layers.disable(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);
    }

	clearVisuals(topic) {
		let overlay = this.overlays[topic];

		if (overlay.detection_lines) {
			overlay.detection_lines.removeFromParent();
			delete overlay.detection_lines;
		}

		if (overlay.detection_frame)
			delete overlay.detection_frame;

		if (overlay.detection_lines_geometry)
			delete overlay.detection_lines_geometry;

		if (overlay.dirty_detection_results)
			delete overlay.dirty_detection_results;

		if (overlay.detection_labels) {
			let class_ids = Object.keys(overlay.detection_labels);
			class_ids.forEach((class_id)=>{
				for (let i = 0; i < overlay.detection_labels[class_id].length; i++) {
					overlay.detection_labels[class_id][i].removeFromParent();
				}
				delete overlay.detection_labels[class_id];
			});
			delete overlay.detection_labels;
		}

		if (overlay.detection_markers) {
			let class_ids = Object.keys(overlay.detection_markers);
			class_ids.forEach((class_id)=>{
				for (let i = 0; i < overlay.detection_markers[class_id].length; i++) {
					overlay.detection_markers[class_id][i].removeFromParent();
				}
				delete overlay.detection_markers[class_id];
			});
			delete overlay.detection_markers;
		}
    }

	clearTopic(topic) {
    	this.client.offTopicConfig(topic, this.overlays[topic].config_change_cb);
        super.clearTopic(topic);
    }
}
