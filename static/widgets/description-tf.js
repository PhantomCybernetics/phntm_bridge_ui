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

    constructor(panel) {
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
        this.pos_offset = null;
        this.fix_base = false;

        this.transforms_queue = [];
        this.last_tf_stamps = {};

        this.sources = new MultiTopicSource(this);
        this.sources.add('tf2_msgs/msg/TFMessage', 'Static transforms source', '/tf_static', 1, this.on_tf_data);
        this.sources.add('tf2_msgs/msg/TFMessage', 'Real-time transforms source', '/tf', 1, this.on_tf_data);
        this.sources.add('std_msgs/msg/String', 'URDF description source', '/robot_description', 1, this.on_description_data);

        this.parseUrlParts(this.panel.custom_url_vars);

        this.manager = new THREE.LoadingManager();
        this.manager.setURLModifier((url)=>{
            // if (url.indexOf('wheel') !== -1)
            //     return url;
            if (url.indexOf('file:/') !== 0)
                return url;
            url = url.replace('file://', '');
            url = url.replace('file:/', '');
            if (url[0] != '/')
                url = '/'+url;
            let url_fw = panel.ui.client.get_bridge_file_url(url);
            console.log('URDF Loader requesting '+url+' > '+url_fw);
            return url_fw;
        });
        this.tex_loader = new THREE.TextureLoader(this.manager)
        this.urdf_loader = new URDFLoader(this.manager);
        this.urdf_loader.parseCollision = true;
        this.urdf_loader.loadMeshCb = this.load_mesh_cb;
        this.robot = null;

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        $('#panel_widget_'+panel.n).data('gs-no-move', 'yes');

        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.01, 1000 );

        this.renderer = new THREE.WebGLRenderer({
            antialias : false,
            precision : 'lowp'
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

        this.model.add(this.camera)
        this.camera.position.z = 2;
        this.camera.position.x = 0;
        this.camera.position.y = 1;
        this.scene.add(this.camera)
        this.camera_target_pos = new THREE.Vector3().copy(this.model.position);
        this.camera.lookAt(this.camera_target_pos);

        this.controls = new OrbitControls( this.camera, this.labelRenderer.domElement );
        this.renderer.domElement.addEventListener( 'pointerdown', (ev) => {
            ev.preventDefault(); //stop from moving the panel
        } );
        this.controls.addEventListener('change', this.controls_changed);
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
        light.shadow.mapSize.width = 2048; // default
        light.shadow.mapSize.height = 2048; // default
        this.renderer.shadowMapType = THREE.PCFShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap
        this.light = light;

        const ambience = new THREE.AmbientLight( 0x606060 ); // soft white light
        this.scene.add( ambience );

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

        const plane_geometry = new THREE.PlaneGeometry( 100, 100 );
        const plane_material = new THREE.MeshPhongMaterial( {color: 0xffffff, side: THREE.BackSide } );
        const plane_tex = this.tex_loader.load('/static/tiles.png');
        plane_tex.wrapS = THREE.RepeatWrapping;
        plane_tex.wrapT = THREE.RepeatWrapping;
        plane_tex.repeat.set(100, 100);
        // plane_material.map = plane_tex;
        plane_material.map = plane_tex;
        // plane_material.needsUpdate = true;
        const plane = new THREE.Mesh(plane_geometry, plane_material);
        plane.rotation.setFromVector3(new THREE.Vector3(Math.PI/2,0,0));
        plane.position.set(0,0,0);
        plane.receiveShadow = true;
        this.scene.add(plane);

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
        let that = this;
        panel.resize_event_handler = function () {
            // ResizeWidget(panel);
            // URDFWidget_Render(panel);
            that.labelRenderer.setSize(panel.widget_width, panel.widget_height);

        };

        this.rendering = true;
        this.rendering_loop();        

        // this.topic_tf_static = '/tf_static';
        // this.topic_tf = '/tf';
        // this.topic_desc = '/robot_description';

        // // this.last_odo = null;
        // panel.ui.client.on(this.topic_tf_static, this.on_tf_data);
        // panel.ui.client.on(this.topic_tf, this.on_tf_data);
        // panel.ui.client.on(this.topic_desc, this.on_description_data);

     
        panel.widget_menu_cb = () => {
            that.setupMenu();
        }
    }

    setupMenu () {
       
        this.sources.setupMenu();

        // this.sources.makeTopicButton('Static TF source', 'tf2_msgs/msg/TFMessage', this.topic_tf_static);
        // this.sources.makeTopicButton('TF source', 'tf2_msgs/msg/TFMessage', this.topic_tf);
        // this.sources.makeTopicButton('', '', this.topic_desc);

        let that = this;

        $('<div class="menu_line"><label for="follow_target_'+this.panel.n+'"><input type="checkbox" '+(this.follow_target?'checked':'')+' id="follow_target_'+this.panel.n+'" title="Follow target"> Follow target</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#follow_target_'+this.panel.n).change(function(ev) {
            that.follow_target = $(this).prop('checked');         
            that.panel.ui.update_url_hash();        
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
            that.panel.ui.update_url_hash();            
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
            that.panel.ui.update_url_hash();
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
            that.panel.ui.update_url_hash();
        });

        $('<div class="menu_line"><label for="render_visuals_'+this.panel.n+'""><input type="checkbox" '+(this.render_visuals?'checked':'')+' id="render_visuals_'+this.panel.n+'" title="Render visuals"> Show visuals</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_visuals_'+this.panel.n).change(function(ev) {
            that.render_visuals = $(this).prop('checked');
            console.log('Visuals '+that.render_visuals);
            if (that.render_visuals)
                that.camera.layers.enable(DescriptionTFWidget.L_VISUALS);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_VISUALS);
            that.panel.ui.update_url_hash();
        });

        $('<div class="menu_line"><label for="render_collisions_'+this.panel.n+'""><input type="checkbox" '+(this.render_collisions?'checked':'')+' id="render_collisions_'+this.panel.n+'" title="Render collisions"> Show collisions</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_collisions_'+this.panel.n).change(function(ev) {
            that.render_collisions = $(this).prop('checked');
            if (that.render_collisions)
                that.camera.layers.enable(DescriptionTFWidget.L_COLLIDERS);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_COLLIDERS);
            that.panel.ui.update_url_hash();
        });

        $('<div class="menu_line"><label for="fix_base_'+this.panel.n+'""><input type="checkbox" '+(this.fix_base?'checked':'')+' id="fix_base_'+this.panel.n+'" title="Fix robot base"> Fix base</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#fix_base_'+this.panel.n).change(function(ev) {
            that.fix_base = $(this).prop('checked');
            that.panel.ui.update_url_hash();
        });

        $('<div class="menu_line"><label for="render_pg_'+this.panel.n+'""><input type="checkbox" '+(this.render_pose_graph?'checked':'')+' id="render_pg_'+this.panel.n+'" title="Render pose trace"> Render trace</label></div>')
            .insertBefore($('#close_panel_menu_'+this.panel.n));
        $('#render_pg_'+this.panel.n).change(function(ev) {
            that.render_pose_graph = $(this).prop('checked');
            if (that.render_pose_graph)
                that.camera.layers.enable(DescriptionTFWidget.L_POSE_GRAPH);
            else
                that.camera.layers.disable(DescriptionTFWidget.L_POSE_GRAPH);
            that.panel.ui.update_url_hash();
        });
    }

    onClose() {
        console.warn('Closing desc/tf widget')
        this.rendering = false; //kills the loop
        this.sources.close();
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

    on_tf_data = (topic, tf) => {
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

    clear_model = (obj) => {

        // console.warn('clear_model:', obj);

        if (obj.isLight) {
            // console.error(obj+' isLight: ', obj);
            return false;
        }

        if (obj.isScene) {
            // console.error(obj+' isScene: ', obj);
            return false;
        }

        if (obj.isCamera) {
            // console.error(obj+' isCamera: ', obj);
            return false;
        }

        obj.renderOrder = -1;
        obj.layers.set(DescriptionTFWidget.L_VISUALS);
        obj.castShadow = true;

        if (!obj.children || !obj.children.length)
            return true;
        
        let that = this;

        for (let i = 0; i < obj.children.length; i++) {
            let ch = obj.children[i];
            let res = that.clear_model(ch); // recursion
            if (!res) {
                obj.remove(ch);
                i--;
            }
        }

        return true;
    }

    load_mesh_cb = (path, manager, done) => {

        let that = this;

        if (/\.stl$/i.test(path)) {

            const loader = new STLLoader(manager);
            loader.load(path, geom => {
                const mesh = new THREE.Mesh(geom, new THREE.MeshPhongMaterial());
                that.clear_model(mesh);
                done(mesh);
            });

        } else if (/\.dae$/i.test(path)) {

            const loader = new ColladaLoader(manager);
            loader.load(path, dae => {
                // console.warn('Dae loading done', dae.scene)
                that.clear_model(dae.scene);
                // dae.library.lights = {};
                console.log('cleared: ', dae.scene);
                done(dae.scene);
            });

        } else {

            console.warn(`URDFLoader: Could not load model at ${ path }.\nNo loader available`);

        }

    }

    on_description_data = (topic, desc) => {

        if (this.panel.paused)
            return;

        if (this.robot) {
            this.world.remove(this.robot);
            this.robot = null;
            while (this.labelRenderer.domElement.children.length > 0) {
                this.labelRenderer.domElement.removeChild(this.labelRenderer.domElement.children[0]); 
            }
        }

        this.robot = this.urdf_loader.parse(desc.data);
        this.clear_model(this.robot);
        this.robot.castShadow = true;

        console.log('parsed urdf robot', this.robot);
        this.world.clear();
        this.world.add(this.robot);
        this.world.position.set(0,0,0);

        let that = this;

        Object.keys(this.robot.joints).forEach((key)=>{
            that.make_mark(that.robot.joints[key], key, DescriptionTFWidget.L_JOINTS, DescriptionTFWidget.L_JOINT_LABELS);
        });

        Object.keys(this.robot.links).forEach((key)=>{
            that.make_mark(that.robot.links[key], key, DescriptionTFWidget.L_LINKS, DescriptionTFWidget.L_LINK_LABELS);
        });

        if (this.robot.links['base_footprint']) {
            let v = new THREE.Vector3();
            this.robot.links['base_footprint'].getWorldPosition(v);
            this.world.position.copy(v.negate());
        }
        
        Object.keys(this.robot.frames).forEach((key)=>{

            if (this.robot.frames[key].children) {
                this.robot.frames[key].children.forEach((ch)=>{
                    if (ch.isObject3D) {
                        if (ch.isURDFVisual) {
                            if (ch.children && ch.children.length > 0) {
                                if (ch.children[0].layers)
                                    ch.children[0].layers.set(DescriptionTFWidget.L_VISUALS);
                                ch.children[0].castShadow = true;
                                // ch.children[0].renderOrder = 2;
                            }
                        } else if (ch.isURDFCollider) {
                            if (ch.children && ch.children.length > 0) { 
                                if (ch.children[0].layers)
                                    ch.children[0].layers.set(DescriptionTFWidget.L_COLLIDERS);
                                ch.children[0].material = this.collider_mat;
                                ch.children[0].scale.multiplyScalar(1.005); //make a bit bigger to avoid z-fighting
                            }
                        }
                    }
                });
            }

            // that.make_mark(that.robot.joints[key], key)
            // that.robot.visual[key].castShadow = true;
            // that.robot.visual[key].receiveShadow = true;
            // that.robot.visual[key].material = new THREE.MeshPhongMaterial( {color: 0xffffff, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide} );
        });


        // console.log('got desc: ', desc.data);

        
    }

    make_mark(target, label_text, layer_axes, layer_labels) {

        let axis_size = .05;
        if (label_text == 'base_link') {
            axis_size = .15;
        }
        const axesHelper = new THREE.AxesHelper(axis_size);
        axesHelper.material.depthTest = false;
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

    controls_changed = () => {
        this.controls_dirty = true;
    }

    rendering_loop() {

        if (!this.rendering)
            return;

        let scene_changed = false;
        if (this.robot && this.robot.links) {
            for (let i = 0; i < this.transforms_queue.length; i++) {
                scene_changed = true;
                let id_parent = this.transforms_queue[i].header.frame_id;
                let id_child = this.transforms_queue[i].child_frame_id;
                let t = this.transforms_queue[i].transform;
                let s = this.transforms_queue[i].header.stamp;
                let t_sec = (s.sec * 1000000000.0 + s.nanosec) / 1000000000.0;

                let tf_id = id_parent+'>'+id_child;
                if (this.last_tf_stamps[tf_id] && this.last_tf_stamps[tf_id] > t_sec) 
                    continue;

                this.last_tf_stamps[tf_id] = t_sec;
                let p = this.robot.links[id_parent];
                let ch = this.robot.links[id_child];
    
                if (id_child == 'base_link') {
                        
                    if (!this.fix_base) {
                        if (this.follow_target)
                            ch.attach(this.camera);

                        ch.position.set(t.translation.x, t.translation.y, t.translation.z).sub(this.pos_offset);
                        if (this.follow_target) {
                            this.scene.attach(this.camera);
                            ch.getWorldPosition(this.camera_target_pos);
                            //console.log('looking at: ', this.camera_target_pos);
                            // this.camera.lookAt(ch.position);
                            //this.camera.updateProjectionMatrix();
                        }
                    }
                        
                    ch.quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w); //set rot always
    
                    this.light.target = this.robot.links['base_link'];
                }
                    
                else if (this.robot && this.robot.links[id_parent] && this.robot.links[id_child]) {
                
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
    
        this.controls.update();

        if (scene_changed || this.controls_dirty) {
            this.renderer.render(this.scene, this.camera);
            this.controls_dirty = false;
        }
            
        this.labelRenderer.render(this.scene, this.camera);
        window.requestAnimationFrame((step)=>{
            this.rendering_loop()
        });

    }

   
}


//IMU VISUALIZATION
// export function URDFWidget (panel, decoded) {

//     if (!panel.display_widget) {

//     }

//     if (panel.display_widget && decoded) {
//         // LHS (ROS) => RHS (Three)
//         // panel.cube.quaternion.set(-decoded.orientation.y, decoded.orientation.z, -decoded.orientation.x, decoded.orientation.w);
//         URDFWidget_Render(panel)
//     }
// }
