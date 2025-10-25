import * as THREE from "three";
import { LineSegments2 } from "line-segments2";
import { LineMaterial } from "line-material2";
import { LineSegmentsGeometry as LineSegmentsGeometry2} from "line-segments-geometry2";
import { STLLoader } from "stl-loader";
import { ColladaLoader } from "collada-loader";
import { CSS2DRenderer, CSS2DObject } from "css-2d-renderer";

export class WorldModel3DWidget_Detections3D {
    
    static source_topic_type = 'vision_msgs/msg/Detection3DArray';
    static source_description = 'Detection 3D Array';
    static source_default_topic = null;
    static source_max_num = -1;
	static L_DETECTION_LABELS = 10; // unique layer for the labels

    constructor(world_model) {
        this.world_model = world_model;
        this.dirty_detection_results = {}; // topic => []
        this.detection_frames = {}; // topic => frame obj
        this.detection_labels = {}; // topic => { class => [ obj ] }
        this.detection_markers = {}; // topic => { class => [ obj ] }
        this.loaded_models = {}; // path => true (loading) || false (err) || object
        this.detection_models = {}; // topic => []
        this.detection_lines = {}; // topic => []
		this.detection_class_colors = {}; // topic => [ color, color, ... ]
        this.detection_lines_geometry = {};
        this.clear_detections_timeout = {}; // timer refs

		this.magenta = new THREE.Color(0xff00ff);
		this.detection_materials_by_color = {};

        this.clear_timeout_ms = 300; // clear if no new data received in this long
		this.display_labels = world_model.panel.getPanelVarAsBool('dl', true);

		this.setDisplayLabels(this.display_labels);
    }

    onTopicConfig(topic, config) {
        console.log('Got TOPIC CONF in detections!', topic, config);

		this.detection_class_colors[topic] = [];
		if (config && config["color_map"] !== undefined) {
			for (let class_id = 0; class_id < config["color_map"].length; class_id++) {
				let c = config["color_map"][class_id];
				if (!c || ['null', 'none', 'no', '', 'model'].indexOf(c.toLowerCase().trim()) != -1)
					c = null;
				let color = c ? new THREE.Color(c) : null;
				this.detection_class_colors[topic][class_id] = color;
			}
		}

        if (config && config["model_map"] !== undefined) {
            this.loadDetectionModels(topic, config["model_map"]);
        }
    }

    loadDetectionModels(topic, model_map) {
        let that = this;
        for (let class_id = 0; class_id < model_map.length; class_id++) {
            let model_path = model_map[class_id];
            if (this.loaded_models[model_path] !== undefined)
                continue;

            if (!model_path || ['none', 'null', 'default'].indexOf(model_path.toLowerCase()) != -1) {
                this.loaded_models[model_path] = false;
                continue;
            }

			let use_model_materials = this.detection_class_colors[topic][class_id] ? false : true;

			// console.warn('Detection model '+class_id+"; c=", color_map[class_id]);

            this.loaded_models[model_path] = true;
            let force_material = use_model_materials ? null : this.getMaterialForColor(this.detection_class_colors[topic][class_id]);
            this.loadDetectionModel(model_path, force_material, (clean_model) => {
                console.log("ModelLoader: Model loaded for " + model_path, clean_model);
                // that.scene.add(clean_model);
                // clean_model.position.set(i,1,1);

                that.loaded_models[model_path] = clean_model;

                // remove all temp bboxes so that the next update uses loaded model
                let all_topics_with_detections = Object.keys(that.detection_markers);
                all_topics_with_detections.forEach((topic) => {
                    if (that.detection_markers[topic] && that.detection_markers[topic][class_id]) {
                        that.detection_markers[topic][class_id].forEach((marker_el)=>{
                            marker_el.removeFromParent();
                        });
                        that.detection_markers[topic][class_id] = [];
                    }
                });
            });
        }
    }

    loadDetectionModel(path, force_material, done_cb) {
        let parts = path.split(' ');
        let loadPath = parts[0];

        let scale = new THREE.Vector3(1,1,1); // default scale
		// let color = new THREE.Color(1, 0, 1, 1); //magenta default
        for (let i = 1; i < parts.length; i++) { // parse custom scale
            if (parts[i].indexOf('scale=') !== -1) {
                let scale_str = parts[i].replace('scale=', '').trim();
                scale_str = scale_str.replace('[', ''); scale_str = scale_str.replace(']', '');
                let scale_parts = scale_str.split(',');
                if (scale_parts.length > 0) scale.x = parseFloat(scale_parts[0]);
                if (scale_parts.length > 1) scale.y = parseFloat(scale_parts[1]);
                if (scale_parts.length > 2) scale.z = parseFloat(scale_parts[2]);
                console.warn("Parsed scale: ", scale);
            }
            // else if (parts[i].indexOf('color=') !== -1) {
            //     let color_str = parts[i].replace('color=', '').trim();
            //     color = new THREE.Color(color_str); // '#001100' or 'green' works
            //     force_material = this.getMaterialForColor(color);
            //     console.warn("Parsed color: ", color);
            // }
        }
        console.warn("ModelLoader: Loading model from path: ", loadPath);
        let that = this;		
        if (/\.stl$/i.test(loadPath)) {
            const loader = new STLLoader(this.world_model.loading_manager);
            loader.load(loadPath, (geom) => {
                let stl_mat = force_material ? force_material : that.getMaterialForColor(that.magenta); // stl has no materials
                let clean_model = new THREE.Mesh(geom, stl_mat);
                that.world_model.cleanURDFModel(clean_model, true);
                clean_model.scale.copy(scale);
                let model = new THREE.Object3D();
                model.add(clean_model);
                done_cb(model);
            });
        } else if (/\.dae$/i.test(loadPath)) {
            const loader = new ColladaLoader(this.world_model.loading_manager);
            loader.load(loadPath, (dae) => {
                let clean_model = dae.scene;
                that.world_model.cleanURDFModel(clean_model, true, false, force_material); // dae might have materials
                clean_model.scale.copy(scale); // scale from config
                done_cb(clean_model);
            });
        } else if (loadPath.toLowerCase() == 'cylinder') {
            let mat = force_material ? force_material : that.getMaterialForColor(that.magenta);
            let primitive = new THREE.Mesh(new THREE.CylinderGeometry(.5,.5,1,32), mat);
            primitive.position.set(0,0,-0.5);
            primitive.rotation.set(Math.PI/2, 0, 0);
			primitive.castShadow = true;
            primitive.receiveShadow = true;
            let model = new THREE.Object3D();
            model.scale.copy(scale);
            model.add(primitive);
            done_cb(model);
        } else if (loadPath.toLowerCase() == 'sphere') {
            let mat = force_material ? force_material : that.getMaterialForColor(that.magenta);
            let primitive = new THREE.Mesh(new THREE.SphereGeometry(.5,32), mat);
			primitive.castShadow = true;
            primitive.receiveShadow = true;
            let model = new THREE.Object3D();
            model.scale.copy(scale);
            model.add(primitive);
            done_cb(model);
        } else {
            console.error(
                `ModelLoader: Could not load model at ${loadPath}.\nNo loader available`,
            );
        }
    }


    onTopicData(topic, msg) {
        if (!this.world_model.robot_model || this.world_model.panel.paused) return;

		if (!this.world_model.overlays[topic] || !this.world_model.overlays[topic].config) return; // wait for config

		let frame_id = msg.header.frame_id;
		let f = this.world_model.robot_model.getFrame(frame_id);
		if (!f) {
			if (!this.detection_frames_error_logged)
				this.detection_frames_error_logged = {};
			if (!this.detection_frames_error_logged[topic]) {
				this.detection_frames_error_logged[topic] = true; //only log once
				let err = 'Frame "' + frame_id + '" not found in robot model for detection data from ' + topic;
				this.world_model.panel.ui.showNotification(err, "error");
				console.error(err);
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

		// console.log(msg);
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
				color: this.detection_class_colors[topic] && this.detection_class_colors[topic][res.hypothesis.class_id] ? this.detection_class_colors[topic][res.hypothesis.class_id] : this.magenta,
			};

			this.dirty_detection_results[topic].push(d);

			if (!this.detection_markers[topic]) this.detection_markers[topic] = [];
			if (!this.detection_markers[topic][d.class_id]) this.detection_markers[topic][d.class_id] = [];
			if (!this.detection_labels[topic]) this.detection_labels[topic] = [];
			if (!this.detection_labels[topic][d.class_id]) this.detection_labels[topic][d.class_id] = [];

			if (!num_detections_per_class[d.class_id]) num_detections_per_class[d.class_id] = 1;
			else num_detections_per_class[d.class_id]++;
			let i_class = num_detections_per_class[d.class_id] - 1;

			let l = "Class " + d.class_id;
			if (this.world_model.overlays[topic].config["label_map"] && this.world_model.overlays[topic].config["label_map"][d.class_id])
				l = this.world_model.overlays[topic].config["label_map"][d.class_id];
			l += " (" + d.score.toFixed(2) + ")\n";
			//+"[" + box_center.x.toFixed(2) + ";" + box_center.y.toFixed(2) + ";" + box_center.z.toFixed(2) + "]";

			if (!this.detection_labels[topic][d.class_id][i_class]) {
				const el = document.createElement("div");
				el.className = "detection_label";
				const label2d = new CSS2DObject(el);
				let that = this;
				el.addEventListener("pointerdown", function (ev) {
					// that.setCameraTargetPosition(box_center.clone().applyMatrix4(f.matrixWorld));
					let m = that.detection_markers[topic][d.class_id][i_class];
					//console.log(m, topic, i, that.detection_markers);
					let pos = new THREE.Vector3();
					m.getWorldPosition(pos);
					that.world_model.setCameraTargetPosition(pos);
					ev.preventDefault();
				});
				label2d.center.set(0.5, 0);
				f.add(label2d);
				this.detection_labels[topic][d.class_id][i_class] = label2d;
			}
			let label_el = this.detection_labels[topic][d.class_id][i_class];
			label_el.element.textContent = l;
			label_el.element.hidden = false;
			label_el.position.set(box_center.x, box_center.y, box_center.z);
			label_el.layers.set(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);

			let marker_el = null;
			if (!this.detection_markers[topic][d.class_id][i_class]) {
				
				if (this.world_model.overlays[topic].config["model_map"] && this.world_model.overlays[topic].config["model_map"][d.class_id]) {
				
					let model_path = this.world_model.overlays[topic].config["model_map"][d.class_id];
					if (this.loaded_models[model_path] instanceof THREE.Object3D) {
						let model = new THREE.Object3D();
						model.copy(this.loaded_models[model_path]);
						model.is_model = true;
						f.add(model);
						this.detection_markers[topic][d.class_id][i_class] = model;
					}
				}
				
				// make a fallback cube
				if (!this.detection_markers[topic][d.class_id][i_class]) {
					const geometry = new THREE.BoxGeometry(1, 1, 1);
					const cube = new THREE.Mesh(geometry, this.getMaterialForColor(d.color));
					cube.castShadow = true;
					cube.receiveShadow = true;
					f.add(cube);
					this.detection_markers[topic][d.class_id][i_class] = cube;
				}
			}

			marker_el = this.detection_markers[topic][d.class_id][i_class];
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
		if (this.detection_labels[topic]) {
			let class_ids = Object.keys(this.detection_labels[topic]);
			class_ids.forEach((class_id)=>{
				for (let i = num_detections_per_class[class_id] ? num_detections_per_class[class_id] : 0; i < this.detection_labels[topic][class_id].length; i++) {
					this.detection_labels[topic][class_id][i].element.hidden = true;
				}
			});
		}
		if (this.detection_markers[topic]) {
			let class_ids = Object.keys(this.detection_markers[topic]);
			class_ids.forEach((class_id)=>{
				for (let i = num_detections_per_class[class_id] ? num_detections_per_class[class_id] : 0; i < this.detection_markers[topic][class_id].length; i++) {
					this.detection_markers[topic][class_id][i].visible = false;
				}
			});
		}

		this.clearDetectionsOnTimeout(topic);
    }

    // render all detections
    onRender() {
        let that = this;
        let dirty_detection_topics = Object.keys(this.dirty_detection_results);
		dirty_detection_topics.forEach((topic) => {
			let detection_results = that.dirty_detection_results[topic];
			if (!detection_results) return;
			delete that.dirty_detection_results[topic];

			if (!that.world_model.sources.topicSubscribed(topic)) return;

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
			if (that.detection_lines[topic] && that.detection_lines[topic].geometry
				&& that.detection_lines[topic].geometry.lastNumPositions < detection_points.length) {
				that.detection_lines[topic].removeFromParent();
				delete that.detection_lines[topic]
				that.detection_lines_geometry[topic].dispose();
				delete that.detection_lines_geometry[topic];
			}

			if (!that.detection_lines[topic]) {
				//let color = new THREE.Color(0xff00ff);
				const material = new LineMaterial({
					//color: color,
					linewidth: 2,
					transparent: true,
					//opacity: 0.95,
					vertexColors: true,
				});

				that.detection_lines_geometry[topic] = new LineSegmentsGeometry2()
					.setPositions(detection_points)
					.setColors(detection_colors);

				that.detection_lines[topic] = new LineSegments2(
					that.detection_lines_geometry[topic],
					material,
				);
				that.detection_lines[topic].castShadow = false;
				that.detection_lines[topic].receiveShadow = false;
				if (that.detection_frames[topic]) {
					that.detection_frames[topic].add(that.detection_lines[topic]);
				}
			} else {
				that.detection_lines_geometry[topic]
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
		if (this.clear_detections_timeout[topic])
			clearTimeout(this.clear_detections_timeout[topic]);

		let that = this;
		this.clear_detections_timeout[topic] = setTimeout(() => {
			if (that.world_model.panel.paused) {
				//don't clear while paused
				that.clearDetectionsOnTimeout(topic);
				return;
			}

			that.dirty_detection_results[topic] = [];
			if (this.detection_labels[topic]) {
				let class_ids = Object.keys(this.detection_labels[topic]);
				class_ids.forEach((class_id)=>{
					for (let i = 0; i < this.detection_labels[topic][class_id].length; i++) {
						this.detection_labels[topic][class_id][i].element.hidden = true;
					}
				});
			}
			if (this.detection_markers[topic]) {
				let class_ids = Object.keys(this.detection_markers[topic]);
				class_ids.forEach((class_id)=>{
					for (let i = 0; i < this.detection_markers[topic][class_id].length; i++) {
						this.detection_markers[topic][class_id][i].visible = false;
					}
				});
			}
			that.world_model.renderDirty();
		}, this.clear_timeout_ms);
	}

    clearTopic(topic) {
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
			let class_ids = Object.keys(this.detection_labels[topic]);
			class_ids.forEach((class_id)=>{
				for (let i = 0; i < this.detection_labels[topic][class_id].length; i++) {
					this.detection_labels[topic][class_id][i].removeFromParent();
				}
				delete this.detection_labels[topic][class_id];
			});
			delete this.detection_labels[topic];
		}
		if (this.detection_markers[topic]) {
			let class_ids = Object.keys(this.detection_markers[topic]);
			class_ids.forEach((class_id)=>{
				for (let i = 0; i < this.detection_markers[topic][class_id].length; i++) {
					this.detection_markers[topic][class_id][i].removeFromParent();
				}
				delete this.detection_markers[topic][class_id];
			});
			delete this.detection_markers[topic];
		}
    }

    clearAllTopics() {
        let detection_topics = this.detection_lines
			? [].concat(Object.keys(this.detection_lines))
			: [];
		console.log("Clearing all detection topics", detection_topics);
		let that = this;
		detection_topics.forEach((topic) => {
			that.clearTopic(topic);
		});
    }

    setupMenu(menu_els) {
		if (!this.world_model.sources.hasType(WorldModel3DWidget_Detections3D.source_topic_type)) 
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

    setDisplayLabels(display_labels) {
        console.log('Display labels: ', display_labels);

		this.display_labels = display_labels;
		if (this.display_labels)
			this.world_model.camera.layers.enable(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);
		else
			this.world_model.camera.layers.disable(WorldModel3DWidget_Detections3D.L_DETECTION_LABELS);
    }
}
