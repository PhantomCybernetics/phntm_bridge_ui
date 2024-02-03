import { lerpColor, linkifyURLs, lerp, deg2rad } from "../lib.js";
import * as THREE from 'three';
import { OrbitControls } from 'orbit-controls';
import { LoadingManager } from 'three';
import URDFLoader from 'urdf-loader';
import { CSS2DRenderer, CSS2DObject } from 'css-2d-renderer';

export class DescriptionTFWidget {
    static label = 'Robot description (URFD) + Transforms';
    static default_width = 5;
    static default_height = 4;

    constructor(panel) {
        this.panel = panel;

        this.manager = new THREE.LoadingManager();
        this.manager.setURLModifier((url)=>{
            if (url.indexOf('file:/') !== 0)
                return url;
            let url_fw = panel.ui.client.get_bridge_file_url(url);
            console.log('URDF Loader requesting '+url+' > '+url_fw);
            return url_fw;
        });
        this.tex_loader = new THREE.TextureLoader(this.manager)
        this.loader = new URDFLoader(this.manager);
        this.loader.parseCollision = true;
        this.robot = null;

        // this.loader = 

        this.render_collisions = true;
        this.render_visuals = true;
        this.render_labels = false;
        this.render_links = true;
        this.render_joints = true;
        this.follow_target = true;

        this.pos_offset = null;
        this.rot_offset = null;

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        $('#panel_widget_'+panel.n).data('gs-no-move', 'yes');

        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.1, 1000 );

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
        this.model.position.y = .5

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


        // const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        // this.scene.add( light );

        const light = new THREE.SpotLight( 0xffffff, 2.0 );
        light.castShadow = true; // default false
        this.scene.add( light );
        light.position.set( 1, 2, 1 );
        light.lookAt(this.model.position);
        light.shadow.mapSize.width = 2048; // default
        light.shadow.mapSize.height = 2048; // default
        this.renderer.shadowMapType = THREE.PCFShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap
        this.light = light;

        const ambience = new THREE.AmbientLight( 0x404040 ); // soft white light
        this.scene.add( ambience );

        this.camera.layers.enableAll();
        if (!this.render_collisions)
            this.camera.layers.disable(2); //colliders off by default
        if (!this.render_joints)
            this.camera.layers.disable(3); //joints off by default
        if (!this.render_labels)
            this.camera.layers.disable(4); //joint labels off by default
        if (!this.render_labels)
            this.camera.layers.disable(6); //link labels off by default

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
        const plane_material = new THREE.MeshPhongMaterial( {color: 0x429000, side: THREE.BackSide } );
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

        this.transforms_queue = [];
        this.last_tf_stamps = {};
        this.fix_base = false;

        this.topic_tf_static = '/tf_static';
        this.topic_tf = '/tf';
        this.topic_desc = '/robot_description';

        // this.last_odo = null;
        panel.ui.client.on(this.topic_tf_static, this.on_tf_data);
        panel.ui.client.on(this.topic_tf, this.on_tf_data);
        panel.ui.client.on(this.topic_desc, this.on_description_data);

        panel.widget_menu_cb = () => {

            $('<div class="menu_line src_ctrl" id="src_ctrl_'+panel.n+'">'
                + '<button class="val" title="Static TF source">'+this.topic_tf_static+'</button>'
                + '<button class="val" title="TF source">'+this.topic_tf+'</button>'
                + '<button class="val" title="Description source">'+this.topic_desc+'</button>'
                + '</div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));

            $('<div class="menu_line"><label for="follow_target_'+panel.n+'"><input type="checkbox" '+(that.follow_target?'checked':'')+' id="follow_target_'+panel.n+'" title="Follow target"> Follow target</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#follow_target_'+panel.n).change(function(ev) {
                that.follow_target = $(this).prop('checked');
                if (that.follow_target) {
                    
                } else {
                    
                }                    
            });

            $('<div class="menu_line"><label for="render_joints_'+panel.n+'"><input type="checkbox" '+(that.render_joints?'checked':'')+' id="render_joints_'+panel.n+'" title="Render joints"> Render joints</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#render_joints_'+panel.n).change(function(ev) {
                that.render_joints = $(this).prop('checked');
                if (that.render_joints) {
                    this.camera.layers.enable(3);
                    if ($('#render_labels_'+panel.n).prop('checked'))
                        this.camera.layers.enable(4); //labels
                } else {
                    this.camera.layers.disable(3);
                    this.camera.layers.disable(4); //labels
                }                    
            });

            $('<div class="menu_line"><label for="render_links_'+panel.n+'"><input type="checkbox" '+(that.render_links?'checked':'')+' id="render_links_'+panel.n+'" title="Render links"> Render links</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#render_links_'+panel.n).change(function(ev) {
                that.render_links = $(this).prop('checked');
                if (that.render_links) {
                    this.camera.layers.enable(5);
                    if ($('#render_labels_'+panel.n).prop('checked'))
                        this.camera.layers.enable(6); //labels
                } else {
                    this.camera.layers.disable(5);
                    this.camera.layers.disable(6); //labels
                }
            });

            $('<div class="menu_line"><label for="render_labels_'+panel.n+'""><input type="checkbox" '+(that.render_labels?'checked':'')+' id="render_labels_'+panel.n+'" title="Render labels"> Show labels</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#render_labels_'+panel.n).change(function(ev) {
                that.render_labels = $(this).prop('checked');
                if (that.render_labels) {
                    if ($('#render_joints_'+panel.n).prop('checked'))
                        that.camera.layers.enable(4);
                    if ($('#render_links_'+panel.n).prop('checked'))
                        that.camera.layers.enable(6);
                } else {
                    that.camera.layers.disable(4);
                    that.camera.layers.disable(6);
                }
            });

            $('<div class="menu_line"><label for="render_visuals_'+panel.n+'""><input type="checkbox" '+(that.render_visuals?'checked':'')+' id="render_visuals_'+panel.n+'" title="Render visuals"> Show visuals</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#render_visuals_'+panel.n).change(function(ev) {
                that.render_visuals = $(this).prop('checked');
                if (that.render_visuals)
                    this.camera.layers.enable(1);
                else
                    this.camera.layers.disable(1);
            });

            $('<div class="menu_line"><label for="render_collisions_'+panel.n+'""><input type="checkbox" '+(that.render_collisions?'checked':'')+' id="render_collisions_'+panel.n+'" title="Render collisions"> Show collisions</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#render_collisions_'+panel.n).change(function(ev) {
                that.render_collisions = $(this).prop('checked');
                if (that.render_collisions)
                    this.camera.layers.enable(2);
                else
                    this.camera.layers.disable(2);
            });

            $('<div class="menu_line"><label for="fix_base_'+panel.n+'""><input type="checkbox" '+(that.fix_base?'checked':'')+' id="fix_base_'+panel.n+'" title="Fix robot base"> Fix base</label></div>')
                .insertBefore($('#pause_panel_menu_'+panel.n));
            $('#fix_base_'+panel.n).change(function(ev) {
                that.fix_base = $(this).prop('checked');
            });
        }
    }

    onClose() {
        console.warn('Closing desc/tf widget')
        this.rendering = false; //kills the loop
        this.panel.ui.client.off('/tf_static', this.on_tf_data);
        this.panel.ui.client.off('/tf', this.on_tf_data);
        this.panel.ui.client.off('/robot_description', this.on_description_data);
    }


    on_tf_data = (tf) => {
        if (this.panel.paused)
            return;

        for (let i = 0; i < tf.transforms.length; i++)
            this.transforms_queue.push(tf.transforms[i]); //processed in rendering_loop()
    }

    on_description_data = (desc) => {

        if (this.panel.paused)
            return;

        // console.log('got desc: ', desc.data);

        if (this.robot) {
            this.world.remove(this.robot);
            this.robot = null;
            while (this.labelRenderer.domElement.children.length > 0) {
                this.labelRenderer.domElement.removeChild(this.labelRenderer.domElement.children[0]); 
            }
        }

        this.robot = this.loader.parse(desc.data);
        this.robot.castShadow = true;
        console.log('parsed urdf robot', this.robot);
        this.world.clear();
        this.world.add(this.robot);
        this.world.position.set(0,0,0);

        let that = this;

        Object.keys(this.robot.joints).forEach((key)=>{
            that.make_mark(that.robot.joints[key], key, 3, 4);
        });

        Object.keys(this.robot.links).forEach((key)=>{
            that.make_mark(that.robot.links[key], key, 5, 6);
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
                                    ch.children[0].layers.set(1);
                                ch.children[0].castShadow = true;
                                // ch.children[0].renderOrder = 2;
                            }
                        } else if (ch.isURDFCollider) {
                            if (ch.children && ch.children.length > 0) { 
                                if (ch.children[0].layers)
                                    ch.children[0].layers.set(2);
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

    controls_changed() {
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
                    
                    if (this.pos_offset == null) {
                        this.pos_offset = new THREE.Vector3();
                        this.pos_offset.copy(t.translation);
                    }
                    if (this.rot_offset == null) {
                        this.rot_offset = new THREE.Quaternion();
                        this.rot_offset.copy(t.rotation);
                    }
                        
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
