import { lerpColor, linkifyURLs, lerp, deg2rad } from "../lib.js";
import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ColladaLoader } from 'three/examples/jsm/loaders/ColladaLoader.js';
import { OrbitControls } from 'orbit-controls';
import { LoadingManager } from 'three';
import URDFLoader from 'urdf-loader';
import { CSS2DRenderer, CSS2DObject } from 'css-2d-renderer';
import { MultiTopicSource } from "./inc/multitopic.js";
import { Vector3 } from "three";
import { Quaternion } from "three";

export class DescriptionTFWidget extends EventTarget {
    static label = 'Robot description (URFD) + Transforms';
    static default_width = 5;
    static default_height = 4;

    static L_VISUALS      = 1;
    static L_COLLIDERS    = 2;
    static L_JOINTS       = 3;
    static L_JOINT_LABELS = 4;
    static L_LINKS        = 5;
    static L_LINK_LABELS  = 6;
    static L_POSE_GRAPH   = 7;

    constructor(panel, start_loop=true) {
        super();

        this.panel = panel;

        this.render_collisions = true;
        this.render_visuals = true;
        this.render_labels = false;
        this.render_links = true;
        this.render_joints = true;
        this.follow_target = true;

        this.pose_graph = [];
        this.pose_graph_size = 100; // keeps this many nodes in pg
        this.render_pose_graph = false;
        this.render_ground_plane = true;
        this.pos_offset = null;
        this.fix_base = false;

        // this.latest_tf_stamps = {};
        // this.transforms_queue = [];
        this.smooth_transforms_queue = {};
        // this.last_tf_stamps = {};

        let that = this;

        this.manager = new THREE.LoadingManager();
        this.manager.setURLModifier((url)=>{

            if (url.indexOf('http:/') === 0 || url.indexOf('https:/') === 0) 
                return url;

            if (url.indexOf('package:/') !== 0 && url.indexOf('file:/') !== 0) 
                return url;
                
            let url_fw = panel.ui.client.get_bridge_file_url(url);
            console.log('URDF Loader requesting '+url+' > '+url_fw);
            return url_fw;

        });
        this.tex_loader = new THREE.TextureLoader(this.manager)
        this.urdf_loader = new URDFLoader(this.manager);
        this.urdf_loader.parseCollision = true;
        this.urdf_loader.packages = (targetPkg) => {
            return 'package://' + targetPkg; // put back the url scheme removed by URDFLoader 
        }
        this.robot = null;
        this.last_robot_world_position = new THREE.Vector3();
        this.last_robot_world_rotation = new THREE.Quaternion();

        this.urdf_loader.loadMeshCb = (path, manager, done_cb) => {

            console.log('loaded mesh from '+path);

            if (/\.stl$/i.test(path)) {
    
                const loader = new STLLoader(manager);
                loader.load(path, (geom) => {
    
                    const stl_base_mat = new THREE.MeshPhongMaterial({
                        color: 0xffffff,
                        side: THREE.DoubleSide,
                        depthWrite: true,
                        transparent: false
                     } );
                   
                    const mesh = new THREE.Mesh(geom, stl_base_mat);
                    
                    done_cb(mesh);
                });
    
            } else if (/\.dae$/i.test(path)) {
    
                const loader = new ColladaLoader(manager);
                loader.load(path, dae => {
                    done_cb(dae.scene);
                });
    
            } else {
                console.error(`URDFLoader: Could not load model at ${path}.\nNo loader available`);
            }

        }
        this.manager.onLoad = () => {
            console.info('Robot URDF loaded', that.robot);
            if (that.robot) {
                that.clear_model(that.robot); //clear after urdf  sets mats
                that.init_markers(that.robot); 
                that.world.add(that.robot);

                // this.camera_target_robot_joint.getWorldPosition(this.camera_target_pos);

                // if (that.follow_target) {
                //     that.robot.attach(that.camera);
                //     console.log('Attached cam to robot', that.robot);
                // }

                that.renderDirty();
            }
        };
       
        $('#panel_widget_'+panel.n).addClass('enabled imu');
        $('#panel_widget_'+panel.n).data('gs-no-move', 'yes');

        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.01, 1000 );

        this.renderer = new THREE.WebGLRenderer({
            antialias : false,
            precision : 'highp' // TODO: med & low are really bad on some devices, there could be a switch for this in the menu
        });
        this.renderer.shadowMap.enabled = true;
        this.renderer.setSize(panel.widget_width, panel.widget_height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('panel_widget_'+panel.n).appendChild(this.renderer.domElement);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(panel.widget_width, panel.widget_height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        document.getElementById('panel_widget_'+panel.n).appendChild(this.labelRenderer.domElement);

        // this.model = new THREE.Object3D()
        // this.scene.add(this.model);
        // this.model.position.y = 0

        this.camera_pos = new THREE.Vector3(1,.5,1);
        
        // this.camera_container = new THREE.Object3D();
        // this.scene.attach(this.camera_container);
        // this.camera_container.position.set(0,0,0);
        // this.camera_container.quaternion.set(0,0,0,1);
        
        this.scene.add(this.camera);
        this.camera.position.copy(this.camera_pos);
    
        this.camera_target_pos = new THREE.Vector3(0.0,0.0,0.0);
        this.camera.lookAt(this.camera_target_pos);
        this.camera_target_robot_joint = null;
        // this.camera_anchor_joint = null;

        this.controls = new OrbitControls( this.camera, this.labelRenderer.domElement );
        this.renderer.domElement.addEventListener( 'pointerdown', (ev) => {
            ev.preventDefault(); // stop from moving the panel
        } );
        this.controls.addEventListener('change', () => { this.controls_changed(); });
        this.controls_dirty = false;
        this.controls.target = this.camera_target_pos;
        this.controls.update();

        this.world = new THREE.Object3D();
        this.world.rotation.set(-Math.PI/2.0, 0.0, 0.0); //+z up
        this.scene.add(this.world);

        const light = new THREE.SpotLight( 0xffffff, 30.0, 0, Math.PI/10);
        light.castShadow = true; // default false
        this.scene.add(light);
        light.position.set(0, 5, 0); // will stay 5m above the model
        light.lookAt(this.camera_target_pos);
        light.shadow.mapSize.width = 5 * 1024; // default
        light.shadow.mapSize.height = 5 * 1024; // default
        light.shadow.camera.near = 0.5; // default
        light.shadow.camera.far = 10; // default

        // light.shadow.bias= -0.002;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap
        this.light = light;

        const ambience = new THREE.AmbientLight( 0x606060 ); // soft white light
        this.scene.add( ambience );
        
        panel.resize_event_handler = () => {
            that.labelRenderer.setSize(panel.widget_width, panel.widget_height);
            that.renderDirty();
        };

        this.sources = new MultiTopicSource(this);
        this.sources.add('tf2_msgs/msg/TFMessage', 'Static transforms source', '/tf_static', 1, (topic, tf)=> { that.on_tf_data(topic, tf); });
        this.sources.add('tf2_msgs/msg/TFMessage', 'Real-time transforms source', '/tf', 1, (topic, tf) => { that.on_tf_data(topic, tf); });
        this.sources.add('std_msgs/msg/String', 'URDF description source', '/robot_description', 1, (topic, tf) => { that.on_description_data(topic, tf); });

        this.parseUrlParts(this.panel.custom_url_vars);

        // if (this.follow_target)
        //     this.camera_container.attach(this.camera);

        const plane_geometry = new THREE.PlaneGeometry( 100, 100 );

        //ground plane
        this.tex_loader.load('/static/tiles.png', (plane_tex) => {
            const plane_material = new THREE.MeshPhongMaterial( {color: 0xffffff, side: THREE.BackSide } );
            plane_tex.wrapS = THREE.RepeatWrapping;
            plane_tex.wrapT = THREE.RepeatWrapping;
            plane_tex.repeat.set(100, 100);
            plane_material.map = plane_tex;

            that.ground_plane = new THREE.Mesh(plane_geometry, plane_material);
            that.ground_plane.rotation.setFromVector3(new THREE.Vector3(Math.PI/2,0,0));
            that.ground_plane.position.set(0,0,0);
            that.ground_plane.receiveShadow = true;
            that.ground_plane.visible = that.render_ground_plane;
            that.scene.add(that.ground_plane);
        });
        
        // if (this.follow_target)
        //     this.model.add(this.camera);
    
        this.camera.layers.enableAll();
        if (!this.render_visuals) this.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
        if (!this.render_collisions) this.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS); //colliders off by default
        if (!this.render_joints)  {
            this.camera.layers.disable(DescriptionTFWidget.L_JOINTS); 
            this.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS); 
        }
        if (!this.render_links) {
            this.camera.layers.disable(DescriptionTFWidget.L_LINKS);
            this.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);

        }
        if (!this.render_labels) {
            this.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS);
            this.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);
        }
        if (!this.render_pose_graph) {
            this.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
        }
        this.collider_mat = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            wireframe: true,
        });
        
        panel.widget_menu_cb = () => { that.setupMenu(); }
    
        if (start_loop) {
            this.rendering = true;
            this.renderDirty();
            requestAnimationFrame((t) => this.rendering_loop());  
        }
    }

    setupMenu() {
       
        if (this.sources) {
            this.sources.setupMenu();
        }

        let that = this;

        $('<div class="menu_line"><label for="follow_target_'+this.panel.n+'"><input type="checkbox" '+(this.follow_target?'checked':'')+' id="follow_target_'+this.panel.n+'" title="Follow target"> Follow target</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#follow_target_'+this.panel.n).change(function(ev) {
            that.follow_target = $(this).prop('checked');         
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_joints_'+this.panel.n+'"><input type="checkbox" '+(this.render_joints?'checked':'')+' id="render_joints_'+this.panel.n+'" title="Render joints"> Render joints</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_joints_'+this.panel.n).change(function(ev) {
            that.render_joints = $(this).prop('checked');
            if (that.render_joints) {
                that.camera.layers.enable(DescriptionTFWidget.L_JOINTS);
                if ($('#render_labels_'+that.panel.n).prop('checked'))
                    that.camera.layers.enable(DescriptionTFWidget.L_JOINT_LABELS); //labels
            } else {
                that.camera.layers.disable(DescriptionTFWidget.L_JOINTS);
                that.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS); //labels
            }        
            // that.panel.ui.update_url_hash(); 
            that.renderDirty();          
        });

        $('<div class="menu_line"><label for="render_links_'+this.panel.n+'"><input type="checkbox" '+(this.render_links?'checked':'')+' id="render_links_'+this.panel.n+'" title="Render links"> Render links</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_links_'+this.panel.n).change(function(ev) {
            that.render_links = $(this).prop('checked');
            if (that.render_links) {
                that.camera.layers.enable(DescriptionTFWidget.L_LINKS);
                if ($('#render_labels_'+that.panel.n).prop('checked'))
                    that.camera.layers.enable(DescriptionTFWidget.L_LINK_LABELS); //labels
            } else {
                that.camera.layers.disable(DescriptionTFWidget.L_LINKS);
                that.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS); //labels
            }
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_labels_'+this.panel.n+'""><input type="checkbox" '+(this.render_labels?'checked':'')+' id="render_labels_'+this.panel.n+'" title="Render labels"> Show labels</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_labels_'+this.panel.n).change(function(ev) {
            that.render_labels = $(this).prop('checked');
            if (that.render_labels) {
                if ($('#render_joints_'+that.panel.n).prop('checked'))
                    that.camera.layers.enable(DescriptionTFWidget.L_JOINT_LABELS);
                if ($('#render_links_'+that.panel.n).prop('checked'))
                    that.camera.layers.enable(DescriptionTFWidget.L_LINK_LABELS);
            } else {
                that.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS);
                that.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS);
            }
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_visuals_'+this.panel.n+'""><input type="checkbox" '+(this.render_visuals?'checked':'')+' id="render_visuals_'+this.panel.n+'" title="Render visuals"> Show visuals</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_visuals_'+this.panel.n).change(function(ev) {
            that.render_visuals = $(this).prop('checked');
            if (that.render_visuals)
                that.camera.layers.enable(DescriptionTFWidget.L_VISUALS);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_collisions_'+this.panel.n+'""><input type="checkbox" '+(this.render_collisions?'checked':'')+' id="render_collisions_'+this.panel.n+'" title="Render collisions"> Show collisions</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_collisions_'+that.panel.n).change(function(ev) {
            that.render_collisions = $(this).prop('checked');
            if (that.render_collisions)
                that.camera.layers.enable(DescriptionTFWidget.L_COLLIDERS);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS);
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="fix_base_'+this.panel.n+'""><input type="checkbox" '+(this.fix_base?'checked':'')+' id="fix_base_'+this.panel.n+'" title="Fix robot base"> Fix base</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#fix_base_'+this.panel.n).change(function(ev) {
            that.fix_base = $(this).prop('checked');
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_pg_'+this.panel.n+'""><input type="checkbox" '+(this.render_pose_graph?'checked':'')+' id="render_pg_'+this.panel.n+'" title="Render pose trace"> Render trace</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_pg_'+this.panel.n).change(function(ev) {
            that.render_pose_graph = $(this).prop('checked');
            if (that.render_pose_graph)
                that.camera.layers.enable(DescriptionTFWidget.L_POSE_GRAPH);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });

        $('<div class="menu_line"><label for="render_grnd_'+this.panel.n+'""><input type="checkbox" '+(this.render_ground_plane?'checked':'')+' id="render_grnd_'+this.panel.n+'" title="Render ground plane"> Ground plane</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_grnd_'+this.panel.n).change(function(ev) {
            that.render_ground_plane = $(this).prop('checked');
            that.ground_plane.visible = that.render_ground_plane;
            // that.panel.ui.update_url_hash();
            that.renderDirty();
        });
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

    getUrlHashParts (out_parts) {
        out_parts.push('f='+(this.follow_target ? '1' : '0'));
        out_parts.push('jnt='+(this.render_joints ? '1' : '0'));
        out_parts.push('lnk='+(this.render_links ? '1' : '0'));        
        out_parts.push('lbl='+(this.render_labels ? '1' : '0'));
        out_parts.push('vis='+(this.render_visuals ? '1' : '0'));
        out_parts.push('col='+(this.render_collisions ? '1' : '0'));
        out_parts.push('fix='+(this.fix_base ? '1' : '0'));
        out_parts.push('pg='+(this.render_pose_graph ? '1' : '0'));
        out_parts.push('grnd='+(this.render_ground_plane ? '1' : '0'));
        this.sources.getUrlHashParts(out_parts);
    }

    parseUrlParts (custom_url_vars) {
        if (!custom_url_vars)
            return;
        custom_url_vars.forEach((kvp)=>{
            let arg = kvp[0];
            let val = kvp[1];
            // console.warn('DRF got ' + arg +" > "+val);
            switch (arg) {
                case 'f':   this.follow_target = parseInt(val) == 1; break;
                case 'jnt': this.render_joints = parseInt(val) == 1; break;
                case 'lnk': this.render_links = parseInt(val) == 1; break;
                case 'lbl': this.render_labels = parseInt(val) == 1; break;
                case 'vis': this.render_visuals = parseInt(val) == 1; break;
                case 'col': this.render_collisions = parseInt(val) == 1; break;
                case 'fix': this.fix_base = parseInt(val) == 1; break;
                case 'pg': this.render_pose_graph = parseInt(val) == 1; break;
                case 'grnd': this.render_ground_plane = parseInt(val) == 1; break;
            }
        });
        this.sources.parseUrlParts(custom_url_vars);
    }

    async on_tf_data (topic, tf) {
        if (this.panel.paused)
            return;

        // console.log(tf);
        // debugger;

        for (let i = 0; i < tf.transforms.length; i++) {

            let ns_stamp = tf.transforms[i].header.stamp.sec * 1000000000 + tf.transforms[i].header.stamp.nanosec;
            let ch_id = tf.transforms[i].child_frame_id;
            let t = tf.transforms[i].transform;

            if (this.smooth_transforms_queue[ch_id] !== undefined && this.smooth_transforms_queue[ch_id].stamp > ns_stamp)
                continue; //throw out older transforms

            this.smooth_transforms_queue[ch_id] = {
                parent: tf.transforms[i].header.frame_id,
                transform: t,
                stamp: ns_stamp
            }

            //this.transforms_queue.push(tf.transforms[i]); //processed in rendering_loop()
            
            if (ch_id == 'base_link') {

                if (this.pos_offset == null) {
                    this.pos_offset = new THREE.Vector3();
                    this.pos_offset.copy(t.translation); // will be subtracted from all transforms
                }

                // trim pg
                while (this.pose_graph.length > this.pose_graph_size) { 
                    let rem = this.pose_graph.shift();
                    if (rem.visual) {
                        rem.visual.removeFromParent();
                    }
                }
                
                let pg_node = {
                    pos: new THREE.Vector3().copy(t.translation).sub(this.pos_offset),
                    rot: new THREE.Quaternion().copy(t.rotation),
                    mat: new THREE.Matrix4(),
                    ns_stamp: ns_stamp,
                };
                pg_node.mat.compose(pg_node.pos, pg_node.rot, new THREE.Vector3(1,1,1))

                if (this.render_pose_graph) {
                    pg_node.visual = new THREE.AxesHelper(.05);
                    pg_node.visual.material.depthTest = false;
                    pg_node.visual.position.copy(pg_node.pos);
                    pg_node.visual.quaternion.copy(pg_node.rot);
                    pg_node.visual.layers.set(DescriptionTFWidget.L_POSE_GRAPH);
                    this.world.add(pg_node.visual); //+z up
                }
                
                this.pose_graph.push(pg_node);
                
                let e = new CustomEvent('pg_updated', { detail: { topic: topic, pg_node: pg_node } } );
                this.dispatchEvent(e);
            }

        }
    }

    get_latest_pg_ns_stamp() {
        if (!this.pose_graph || !this.pose_graph.length)
            return NaN;

        return this.pose_graph[this.pose_graph.length-1].ns_stamp;
    }

    clear_model(obj, lvl=0, inVisual=false, inCollider=false) {

        if (obj.isLight || obj.isScene || obj.isCamera) {
            if (lvl==0) {
                console.error('Invalid model imported')
            }
            return false;
        }   

        if (obj.isURDFVisual) {
            inVisual = true;
        } else if (obj.isURDFCollider) {
            inCollider = true;
        }

        // mesh visuals
        if (obj.isMesh && inVisual) {

            console.log('Visual:', obj);

            if (!obj.material) {
                obj.material = new THREE.MeshBasicMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide,
                    depthWrite: true,
                    transparent: false
                });
                obj.material.needsUpdate = true;
            } else  {
                obj.material.depthWrite = true;
                obj.material.transparent = false;
                obj.material.side = THREE.FrontSide;
            }
            obj.material.needsUpdate = true;
            obj.castShadow = true;
            obj.receiveShadow = true;
            obj.renderOrder = -1;
            obj.layers.set(DescriptionTFWidget.L_VISUALS);
        
        // colliders
        } else if (obj.isMesh && inCollider) {

            console.log('Collider:', obj);

            obj.material = this.collider_mat;
            obj.scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
            obj.layers.set(DescriptionTFWidget.L_COLLIDERS);
        }

        if (obj.children && obj.children.length) {
            for (let i = 0; i < obj.children.length; i++) {
                let ch = obj.children[i];
                let res = this.clear_model(ch, lvl+1, inVisual, inCollider); // recursion
                if (!res) {
                    obj.remove(ch);
                    i--;
                }
            }
        }

        return true;
    }

    on_model_removed() {
        console.warn('on_model_removed');
    }

    async on_description_data (topic, desc) {

        if (this.panel.paused)
            return;

        if (desc == this.last_processed_desc) {
            console.warn('Ignoring identical robot description from '+topic);
            return false;
        }
        this.last_processed_desc = desc;

        if (this.robot) {
            console.warn('Removing old robot model')
            this.world.clear();//this.world.remove(this.robot);
            this.on_model_removed();
            this.robot = null;
            while (this.labelRenderer.domElement.children.length > 0) {
                this.labelRenderer.domElement.removeChild(this.labelRenderer.domElement.children[0]); 
            }
        }

        console.warn('Parsing robot description...');
        let robot = this.urdf_loader.parse(desc.data);
        this.init_camera_pose(robot); 
        
        this.world.clear();
        this.robot = robot;
        
        this.world.position.set(0,0,0);

        console.log('Robot model initiated...');
        this.renderDirty();
    }

    init_camera_pose(robot) {
        let wp = new Vector3();
        let farthest_pt_dist = 0;
        
        let that = this;

        let joints_avg = new Vector3();
        let joints_num = 0;
        Object.keys(robot.joints).forEach((key)=>{
            robot.joints[key].getWorldPosition(wp);
            let wp_magnitude = wp.length();
            if (wp_magnitude > farthest_pt_dist)
                farthest_pt_dist = wp_magnitude;

            joints_avg.add(wp);
            joints_num++;
        });

        if (joints_num) {
            // find the joint closest to avg center
            joints_avg.divideScalar(joints_num);
            let closest_joint_dist = Number.POSITIVE_INFINITY;
            let focus_joint = null;
            let focus_joint_key = null;
            Object.keys(robot.joints).forEach((key)=>{
                robot.joints[key].getWorldPosition(wp);
                let d = wp.distanceTo(joints_avg);
                if (d < closest_joint_dist) {
                    closest_joint_dist = d;
                    focus_joint = robot.joints[key];
                    focus_joint_key = key;
                }        
            });

            console.log('Focusing cam on joint: '+focus_joint_key);
            this.camera_target_robot_joint = focus_joint;
            // that.camera_anchor_joint = focus_joint;
            // that.camera_anchor_joint.getWorldPosition(that.camera_target_pos);
        }
        
        Object.keys(robot.links).forEach((key)=>{
            robot.links[key].getWorldPosition(wp);
            let wp_magnitude = wp.length();
            if (wp_magnitude > farthest_pt_dist)
                farthest_pt_dist = wp_magnitude;
        });

        if (robot.links['base_footprint']) {
            let v = new THREE.Vector3();
            robot.links['base_footprint'].getWorldPosition(v);
            this.world.position.copy(v.negate());
        }

        Object.keys(robot.frames).forEach((key)=>{
            robot.frames[key].getWorldPosition(wp);
            let wp_magnitude = wp.length();
            if (wp_magnitude > farthest_pt_dist)
                farthest_pt_dist = wp_magnitude;
        });

        if (this.follow_target) {
            let initial_dist = farthest_pt_dist * 3.0; // initial distance proportional to model size
            this.camera_pos.normalize().multiplyScalar(initial_dist);
            this.camera.position.copy(this.camera_pos);
        }
    }

    init_markers(robot) {
        let that = this; 

        Object.keys(robot.joints).forEach((key)=>{
            that.make_mark(robot.joints[key], key, DescriptionTFWidget.L_JOINTS, DescriptionTFWidget.L_JOINT_LABELS);
        });

        Object.keys(robot.links).forEach((key)=>{
            that.make_mark(robot.links[key], key, DescriptionTFWidget.L_LINKS, DescriptionTFWidget.L_LINK_LABELS);
        });
    }

    make_mark(target, label_text, layer_axes, layer_labels) {

        let axis_size = .02;
        if (label_text == 'base_link') {
            axis_size = .15;
        }
  
        const axesHelper = new THREE.AxesHelper(axis_size);       
        axesHelper.material.transparent = true;
        axesHelper.material.opacity = 0.9;
        axesHelper.material.depthTest = false;
        axesHelper.material.depthWrite = false;

        target.add(axesHelper);
        axesHelper.layers.set(layer_axes);

        if (label_text) {
            const el = document.createElement('div');
            el.className = 'label';
            el.textContent = label_text;
            el.style.backgroundColor = 'transparent';
            el.style.color = '#ffffff';
            el.style.fontSize = '12px';

            const label = new CSS2DObject(el);
            target.add(label);
            label.center.set(layer_labels == 4 ? 1.1 : -0.1, 0); // joints left, links right
            label.position.set(0, 0, .02);
            label.layers.set(layer_labels);
        }
    }

    controls_changed() {
        this.controls_dirty = true;
        this.camera_pos.copy(this.camera.position);
    }

    renderDirty() {
        if (!this.renderer)
            return;

        this.render_dirty = true;
    }

    async rendering_loop() {

        if (!this.rendering)
            return;

        const lerp_amount = 0.5;
        const cam_lerp_amount = 0.5;

        if (this.robot && this.robot.links) {

            let transform_ch_frames = Object.keys(this.smooth_transforms_queue);
            for (let i = 0; i < transform_ch_frames.length; i++) {

                let id_child = transform_ch_frames[i];
                let id_parent = this.smooth_transforms_queue[id_child].parent;
                let t = this.smooth_transforms_queue[id_child].transform;

                let p = this.robot.frames[id_parent];
                let ch = this.robot.frames[id_child];
                if (!ch)
                    continue; // child node not present in urdf

                if (id_child == this.robot.urdfName) { // robot base frame

                    let new_robot_world_position = new THREE.Vector3();

                    if (!this.fix_base) {
                        let pos = new THREE.Vector3(t.translation.x, t.translation.y, t.translation.z).sub(this.pos_offset);

                        let old_robot_world_position = new THREE.Vector3();
                        ch.getWorldPosition(old_robot_world_position);

                        ch.position.lerp(pos, lerp_amount);

                        ch.getWorldPosition(new_robot_world_position);

                        let d_pos = new THREE.Vector3().subVectors(new_robot_world_position, old_robot_world_position);

                        this.camera_pos.add(d_pos); // move camera by d
                        this.light.position.add(d_pos);

                    } else {
                        ch.getWorldPosition(new_robot_world_position); // only get world pos (to rotate around)
                    }
                    
                    let old_robot_world_rotation = new THREE.Quaternion();
                    ch.getWorldQuaternion(old_robot_world_rotation);

                    let rot = new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
                    ch.quaternion.slerp(rot, lerp_amount); //set rot always

                    let new_robot_world_rotation = new THREE.Quaternion();
                    ch.getWorldQuaternion(new_robot_world_rotation);

                    // let d_rot_rad = old_robot_world_rotation.angleTo(new_robot_world_rotation);
                    let d_rot = new_robot_world_rotation.multiply(old_robot_world_rotation.invert());
                    // console.log(d_rot_rad);

                    this.camera_pos.sub(new_robot_world_position)
                                    //    .applyAxisAngle(new THREE.Vector3(0,1,0), d_rot_rad)
                                   .applyQuaternion(d_rot)
                                   .add(new_robot_world_position);

                    this.light.target = ch;                    

                } else if (this.robot && ch && p) {
                    
                    let orig_p = ch.parent;

                    p.attach(ch);

                    ch.position.lerp(new THREE.Vector3(t.translation.x, t.translation.y, t.translation.z), lerp_amount);
                    ch.quaternion.slerp(new THREE.Quaternion(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w), lerp_amount);
    
                    orig_p.attach(ch);
    
                } else {
                    console.warn('tf transform not found: '+id_parent+' > '+id_child);
                }

                this.renderDirty();
            }

        }

        if (this.follow_target) {

            let pos_to_maintain = new THREE.Vector3().copy(this.camera_pos);
            this.camera.position.copy(this.camera.position.lerp(this.camera_pos, cam_lerp_amount));
            
            if (this.camera_target_robot_joint) {
                let new_target_pos = new THREE.Vector3();
                this.camera_target_robot_joint.getWorldPosition(new_target_pos);
                this.camera_target_pos.copy(this.camera_target_pos.lerp(new_target_pos, cam_lerp_amount));
                // this.camera.lookAt(this.camera_target_pos);
            }

            this.controls.update();
            this.camera_pos = pos_to_maintain;
            
            //this.camera_container.quaternion.copy(this.last_robot_world_rotation.slerp(this.camera_container.quaternion, 0.5));
        }

        let that = this;
        if ((this.controls_dirty || this.render_dirty) && this.robot) {
            this.controls_dirty = false;
            this.render_dirty = false;
            try {
                this.renderer.render(this.scene, this.camera);
                this.labelRenderer.render(this.scene, this.camera);

                if (this.error_logged) {
                    this.error_logged = false;

                    console.warn('All good here now, scene:');
                    this.scene.traverse(function(obj) {
                        var s = '';
                        var obj2 = obj;
                        while(obj2 !== that.scene) {
                            s += '-';
                            obj2 = obj2.parent;
                        }
                        console.log(s + obj.type + ' ' + obj.name+ ' mat: '+obj.material);
                    });
                }
            } catch (e) {

                if (!this.error_logged) {
                    this.error_logged = true;
                    console.error('Error caught while rendering', e);

                    this.scene.traverse(function(obj) {
                        var s = '';
                        var obj2 = obj;
                        while(obj2 !== that.scene) {
                            s += '-';
                            obj2 = obj2.parent;
                        }
                        console.log(s + obj.type + ' ' + obj.name+ ' mat: '+obj.material);
                    });

                } else {
                    console.error('Same error caught while rendering');
                }
                
            }
        }        

        requestAnimationFrame((t) => this.rendering_loop());
    }

}