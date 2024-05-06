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

        this.transforms_queue = [];
        this.last_tf_stamps = {};

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
            return 'package://'+targetPkg+''; // puts back the url scheme removed by URDFLoader 
        }
        this.robot = null;
        
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
            console.info('All loaded');
            if (that.robot) {
                that.clear_model(that.robot); //clear after urdf  sets mats
                that.init_markers(that.robot); 
                that.world.add(this.robot);
                that.renderDirty();
            }
        };
       

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        $('#panel_widget_'+panel.n).data('gs-no-move', 'yes');

        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.01, 1000 );

        this.renderer = new THREE.WebGLRenderer({
            antialias : false,
            precision : 'highp' // med & low are really bad on some devices, there could be a switch for this in the menu
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

        // const geometry = new THREE.BoxGeometry( .1, .1, .1 );
        // const material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
        this.model = new THREE.Object3D()
        this.scene.add(this.model);
        this.model.position.y = 0

        this.initial_camera_pos = new THREE.Vector3(1,.5,1);
        this.model.add(this.camera);
        this.camera.position.copy(this.initial_camera_pos);
    
        this.scene.add(this.camera);
        this.camera_target_pos = new THREE.Vector3().copy(this.model.position);
        this.camera.lookAt(this.camera_target_pos);
        this.camera_anchor_joint = null;

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

        const light = new THREE.SpotLight( 0xffffff, 5.0 );
        light.castShadow = true; // default false
        this.scene.add( light );
        light.position.set( 1, 2, 1 );
        light.lookAt(this.model.position);
        light.shadow.mapSize.width = 2 * 1024; // default
        light.shadow.mapSize.height = 2 * 1024; // default
        
        light.shadow.bias= -0.002;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap
        this.light = light;

        const ambience = new THREE.AmbientLight( 0x606060 ); // soft white light
        this.scene.add( ambience );


        // const axesHelper = new THREE.AxesHelper( 5 );
        // this.scene.add( axesHelper );

        // const axesHelperCube = new THREE.AxesHelper( 5 );
        // axesHelperCube.scale.set(1, 1, 1); //show z forward like in ROS
        // this.model.add( axesHelperCube );

        // const gridHelper = new THREE.GridHelper( 10, 10 );
        // const plane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0);
        // const planeHelper = new THREE.PlaneHelper( plane, 10, 0xffff00 );
        // this.scene.add( gridHelper );
        // this.scene.add( planeHelper );

        // const boxGeometry = new THREE.BoxGeometry( 1, 1, 1 ); 
        // const boxMaterial = new THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
        // const cube = new THREE.Mesh( boxGeometry, boxMaterial ); 
        // this.scene.add( cube );
        // cube.castShadow = true;
        // cube.position.set(1,1,1);

        // panel.display_widget = this.renderer;

        // panel.animate();

        // window.addEventListener('resize', () => {
        //     ResizeWidget(panel);
        //     RenderImu(panel);
        // });
        // $('#display_panel_source_'+panel.n).change(() => {
        //     ResizeWidget(panel);
        //     RenderImu(panel);
        // });
        
        panel.resize_event_handler = () => {
            that.labelRenderer.setSize(panel.widget_width, panel.widget_height);
            that.renderDirty();
        };

        this.sources = new MultiTopicSource(this);
        this.sources.add('tf2_msgs/msg/TFMessage', 'Static transforms source', '/tf_static', 1, (topic, tf)=> { that.on_tf_data(topic, tf); });
        this.sources.add('tf2_msgs/msg/TFMessage', 'Real-time transforms source', '/tf', 1, (topic, tf) => { that.on_tf_data(topic, tf); });
        this.sources.add('std_msgs/msg/String', 'URDF description source', '/robot_description', 1, (topic, tf) => { that.on_description_data(topic, tf); });

        this.parseUrlParts(this.panel.custom_url_vars);

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
        
    
        this.camera.layers.enableAll();
        if (!this.render_visuals) this.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
        if (!this.render_collisions) this.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS); //colliders off by default
        if (!this.render_joints)  {
            this.camera.layers.disable(DescriptionTFWidget.L_JOINTS); //joints 
            this.camera.layers.disable(DescriptionTFWidget.L_JOINT_LABELS); //joint labels
        }
        if (!this.render_links) {
            this.camera.layers.disable(DescriptionTFWidget.L_LINKS); //links
            this.camera.layers.disable(DescriptionTFWidget.L_LINK_LABELS); //link labels

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
            // depthFunc: THREE.LessEqualDepth
        });
        

        // this.topic_tf_static = '/tf_static';
        // this.topic_tf = '/tf';
        // this.topic_desc = '/robot_description';

        // // this.last_odo = null;
        // panel.ui.client.on(this.topic_tf_static, this.on_tf_data);
        // panel.ui.client.on(this.topic_tf, this.on_tf_data);
        // panel.ui.client.on(this.topic_desc, this.on_description_data);

     
        panel.widget_menu_cb = () => { that.setupMenu(); }

        // console.log('constructor done; renderDirty()');
        
        if (start_loop) {
            this.rendering = true;
            this.renderDirty();
            this.rendering_loop();        
        }
    }

    setupMenu() {
       
        if (this.sources) {
            this.sources.setupMenu();
        }

        // this.sources.makeTopicButton('Static TF source', 'tf2_msgs/msg/TFMessage', this.topic_tf_static);
        // this.sources.makeTopicButton('TF source', 'tf2_msgs/msg/TFMessage', this.topic_tf);
        // this.sources.makeTopicButton('', '', this.topic_desc);

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
            // console.log('Visuals '+that.render_visuals);
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
        // console.warn('Closing desc/tf widget')
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
        // console.warn('DRF attrs after parse:', {
        //     follow_target: this.follow_target,
        //     render_joints: this.render_joints,
        //     render_links: this.render_links,
        //     render_labels: this.render_labels,
        //     render_visuals: this.render_visuals,
        //     render_collisions: this.render_collisions,
        //     fix_base: this.fix_base,
        // });
    }

    on_tf_data (topic, tf) {
        if (this.panel.paused)
            return;

        for (let i = 0; i < tf.transforms.length; i++) {
            this.transforms_queue.push(tf.transforms[i]); //processed in rendering_loop()

            let t = tf.transforms[i].transform;
            if (tf.transforms[i].child_frame_id == 'base_link') {

                // console.log('Got base_link, all transforms are:', tf.transforms);

                if (this.pos_offset == null) {
                    this.pos_offset = new THREE.Vector3();
                    this.pos_offset.copy(t.translation);
                }

                // trim pg
                while (this.pose_graph.length > this.pose_graph_size) { 
                    let rem = this.pose_graph.shift();
                    if (rem.visual) {
                        rem.visual.removeFromParent();
                    }
                }

                let ns_stamp = tf.transforms[i].header.stamp.sec*1000000000 + tf.transforms[i].header.stamp.nanosec;
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
                
                let e = new CustomEvent('pg_updated', { detail: { topic: topic, pg_node:pg_node } } );
                this.dispatchEvent(e);
            }

        }
    }

    get_latest_pg_ns_stamp() {
        if (!this.pose_graph || !this.pose_graph.length)
            return NaN;

        return this.pose_graph[this.pose_graph.length-1].ns_stamp;
    }

    // get_pg_offset (ns_stamp_search, pos_to_pg, rot_to_pg) {

    //     if (this.pose_graph.length < 1) {
    //         return false;
    //     }

    //     if (ns_stamp_search > this.pose_graph[this.pose_graph.length-1].ns_stamp) {
    //         console.log('Laser ns-delta is in the future, using latest pos. d_sec=+'+((ns_stamp_search-this.pose_graph[this.pose_graph.length-1].ns_stamp)/1000000000))    
    //         return false;
    //     }

    //     let lag = 0;
    //     for (let i = this.pose_graph.length-1; i >= 0; i--) {
    //         let d = ns_stamp_search - this.pose_graph[i].ns_stamp;
    //         if (d <= 0) {
    //             console.warn('Laser d_sec='+(d/1000000000)+'; rendering laser lag='+lag);
    //             return true; 
    //         }
    //         lag++;
    //     }

    //     return false;
    // }

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

            if (!obj.material) {
                obj.material = new THREE.MeshPhongMaterial({
                    color: 0xffffff,
                    side: THREE.DoubleSide,
                    depthWrite: true,
                    transparent: false
                });
                obj.material.needsUpdate = true;
            } else  {
                obj.material.depthWrite = true;
                obj.material.side = THREE.DoubleSide;
            }
            obj.material.needsUpdate = true;
            obj.castShadow = true;
            obj.renderOrder = -1;
            obj.layers.set(DescriptionTFWidget.L_VISUALS);
        
        // colliders
        } else if (obj.isMesh && inCollider) {

            obj.material = this.collider_mat;
            obj.scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
            obj.layers.set(DescriptionTFWidget.L_COLLIDERS);

        }

        if (!obj.children || !obj.children.length)
            return true;
        
        for (let i = 0; i < obj.children.length; i++) {
            let ch = obj.children[i];
            let res = this.clear_model(ch, lvl+1, inVisual, inCollider); // recursion
            if (!res) {
                obj.remove(ch);
                i--;
            }
        }

        return true;
    }

    on_model_removed() {
        console.warn('on_model_removed');
    }

    on_description_data (topic, desc) {

        if (this.panel.paused)
            return;

        if (desc == this.last_processed_desc) {
            console.warn('Ignoring identical robot description from '+topic);
            return false;
        }
        this.last_processed_desc = desc;

        if (this.robot) {
            console.warn('Removing old model')
            this.world.clear();//this.world.remove(this.robot);
            this.on_model_removed();
            this.robot = null;
            while (this.labelRenderer.domElement.children.length > 0) {
                this.labelRenderer.domElement.removeChild(this.labelRenderer.domElement.children[0]); 
            }
        }

        console.warn('Parsing robot description...');
        let robot = this.urdf_loader.parse(desc.data);
        // console.warn('Parsed robot:', robot);
        // this.clear_model(robot);
        this.init_camera(robot); 
        // robot.castShadow = true;
        
        this.world.clear();
        this.robot = robot;
        
        this.world.position.set(0,0,0);

        let that = this;
        
        // console.log('got desc: ', desc.data);

        console.log('model initiated...');
        this.renderDirty();
    }

    init_camera(robot) {
        let wp = new Vector3();
        let farthest_pt_dist = 0;
        let ji = 0;
        let that = this;

        Object.keys(robot.joints).forEach((key)=>{
            robot.joints[key].getWorldPosition(wp);
            let wp_magnitude = wp.length();
            if (wp_magnitude > farthest_pt_dist)
                farthest_pt_dist = wp_magnitude;

            if (ji == 0) {
                console.log('Focusing cam on 1st joint: '+key);      
                that.camera_anchor_joint = robot.joints[key];
                that.camera_anchor_joint.getWorldPosition(that.camera_target_pos);
            }
            ji++;
        });

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
            let initial_dist = farthest_pt_dist * 3.0;
            this.camera.position.copy(this.initial_camera_pos);
            this.camera.position.normalize().multiplyScalar(initial_dist);
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

        // let camera_target = null;
        Object.keys(robot.frames).forEach((key)=>{

            // if (robot.frames[key].children) {
            //     robot.frames[key].children.forEach((ch)=>{
            //         if (ch.isObject3D) {
            //             if (ch.isURDFVisual) {
            //                 if (ch.children && ch.children.length > 0) {
            //                     if (ch.children[0].layers)
            //                         ch.children[0].layers.set(DescriptionTFWidget.L_VISUALS);
            //                 }
            //             } else if (ch.isURDFCollider) {
            //                 if (ch.children && ch.children.length > 0) { 
            //                     if (ch.children[0].layers)
            //                         ch.children[0].layers.set(DescriptionTFWidget.L_COLLIDERS);
            //                     ch.children[0].material = this.collider_mat;
            //                     ch.children[0].scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
            //                 }
            //             }
            //         }
            //     });
            // }

            // that.make_mark(that.robot.joints[key], key)
            // that.robot.visual[key].castShadow = true;
            // that.robot.visual[key].receiveShadow = true;
            // that.robot.visual[key].material = new THREE.MeshPhongMaterial( {color: 0xffffff, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide} );
        });

        // update initial cam pos
        
    }

    make_mark(target, label_text, layer_axes, layer_labels) {

        let axis_size = .02;
        if (label_text == 'base_link') {
            axis_size = .15;
        }
        // const mat = new THREE.LineBasicMaterial();
       
        // mat.depthWrite = true;
        // mat.depthTest = false;
        // mat.transparent = true;
        // mat.blendDst = THREE.AddEquation;
        const axesHelper = new THREE.AxesHelper(axis_size);       
        axesHelper.material.transparent = true;
        axesHelper.material.opacity = 0.9;
        axesHelper.material.depthTest = false;
        axesHelper.material.depthWrite = false;

        target.add(axesHelper);
        axesHelper.layers.set(layer_axes);
        // axesHelper.renderOrder = 1000;

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
    }

    renderDirty() {
        if (!this.renderer)
            return;

        this.render_dirty = true;
    }

    rendering_loop() {

        if (!this.rendering)
            return;

        this.controls.update();

        if (this.robot && this.robot.links) {
            for (let i = 0; i < this.transforms_queue.length; i++) {
                this.renderDirty();
                let id_parent = this.transforms_queue[i].header.frame_id;
                let id_child = this.transforms_queue[i].child_frame_id;
                let t = this.transforms_queue[i].transform;
                let s = this.transforms_queue[i].header.stamp;
                let t_sec = (s.sec * 1000000000.0 + s.nanosec) / 1000000000.0;

                let tf_id = id_parent+'>'+id_child;
                if (this.last_tf_stamps[tf_id] && this.last_tf_stamps[tf_id] > t_sec) 
                    continue;

                this.last_tf_stamps[tf_id] = t_sec;
                let p = this.robot.frames[id_parent];
                let ch = this.robot.frames[id_child];
                if (!ch)
                    continue;
    
                if (id_child == this.robot.urdfName) {
                        
                    if (!this.fix_base) {
                        if (this.follow_target)
                            ch.attach(this.camera);

                        ch.position.set(t.translation.x, t.translation.y, t.translation.z).sub(this.pos_offset);
                        if (this.follow_target && this.camera_anchor_joint) {
                            this.scene.attach(this.camera);
                            this.camera_anchor_joint.getWorldPosition(this.camera_target_pos);
                        }
                    }
                        
                    ch.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w); //set rot always
    
                    this.light.target = ch;
                }
                    
                else if (this.robot && p && ch) {
                
                    let orig_p = ch.parent;
                    p.attach(ch);
                    ch.position.set(t.translation.x, t.translation.y, t.translation.z);
                    ch.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
    
                    orig_p.attach(ch);
    
                } else {
                    console.warn('tf not found: '+id_child+' < '+id_parent);
                }
            }
            this.transforms_queue = [];
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

        window.requestAnimationFrame((step)=>{
            this.rendering_loop()
        });

    }

}