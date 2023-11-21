import { lerpColor, linkifyURLs, lerp, deg2rad } from "./lib.js";
import * as THREE from 'three';
import { OrbitControls } from 'orbit-controls';
import { LoadingManager } from 'three';
import URDFLoader from 'urdf-loader';
import { CSS2DRenderer, CSS2DObject } from 'css-2d-renderer';

export class DescriptionTFWidget {
    static label = 'Robot Description + TF';
    static default_width = 5;
    static default_height = 4;

    constructor(panel) {
        this.panel = panel;

        this.manager = new LoadingManager();
        this.loader = new URDFLoader(this.manager);
        this.loader.parseCollision = true;
        this.robot = null;

        // this.loader = 

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        $('#panel_widget_'+panel.n).data('gs-no-move', 'yes');

        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        panel.scene = new THREE.Scene();
        
        panel.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.1, 1000 );

        panel.renderer = new THREE.WebGLRenderer({
            antialias : false,
            
        });
        panel.renderer.shadowMap.enabled = true;
        panel.renderer.setSize(panel.widget_width, panel.widget_height);
        panel.renderer.setPixelRatio(window.devicePixelRatio);
        document.getElementById('panel_widget_'+panel.n).appendChild(panel.renderer.domElement);

        this.labelRenderer = new CSS2DRenderer();
        this.labelRenderer.setSize(panel.widget_width, panel.widget_height);
        this.labelRenderer.domElement.style.position = 'absolute';
        this.labelRenderer.domElement.style.top = '0px';
        document.getElementById('panel_widget_'+panel.n).appendChild(this.labelRenderer.domElement);

        // const geometry = new THREE.BoxGeometry( .1, .1, .1 );
        // const material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
        panel.model = new THREE.Object3D()
        panel.scene.add(panel.model);
        panel.model.position.y = .5

        panel.model.add(panel.camera)
        panel.camera.position.z = 2;
        panel.camera.position.x = 0;
        panel.camera.position.y = 1;
        panel.scene.add(panel.camera)
        panel.camera.lookAt(panel.model.position);

        panel.controls = new OrbitControls( panel.camera, this.labelRenderer.domElement );
        panel.renderer.domElement.addEventListener( 'pointerdown', (ev) => {
            ev.preventDefault(); //stop from moving the panel
        } );
        panel.controls.update();

        this.world = new THREE.Object3D();
        this.world.rotation.set(-Math.PI/2.0, 0.0, 0.0); //+z up
        panel.scene.add(this.world);


        // const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        // panel.scene.add( light );

        const light = new THREE.SpotLight( 0xffffff, 2.0 );
        light.castShadow = true; // default false
        panel.scene.add( light );
        light.position.set( 1, 2, 1 );
        light.lookAt(panel.model.position);
        light.shadow.mapSize.width = 2048; // default
        light.shadow.mapSize.height = 2048; // default
        panel.renderer.shadowMapType = THREE.PCFShadowMap; // options are THREE.BasicShadowMap | THREE.PCFShadowMap | THREE.PCFSoftShadowMap

        const ambience = new THREE.AmbientLight( 0x404040 ); // soft white light
        panel.scene.add( ambience );

        panel.camera.layers.enableAll();
        panel.camera.layers.disable(2); //colliders off by default
        panel.camera.layers.disable(3); //joints off by default
        panel.camera.layers.disable(4); //joint labels off by default
        panel.camera.layers.disable(6); //link labels off by default

        this.collider_mat = new THREE.MeshStandardMaterial({
            color: 0xffff00,
            emissive: 0xffff00,
            wireframe: true,
            // depthFunc: THREE.LessEqualDepth
        });

        this.render_collisions = false;
        this.render_visuals = true;
        this.render_labels = false;
        this.render_links = true;
        this.render_joints = false;

        // const axesHelper = new THREE.AxesHelper( 5 );
        // panel.scene.add( axesHelper );

        // const axesHelperCube = new THREE.AxesHelper( 5 );
        // axesHelperCube.scale.set(1, 1, 1); //show z forward like in ROS
        // panel.model.add( axesHelperCube );

        // const gridHelper = new THREE.GridHelper( 10, 10 );
        // const plane = new THREE.Plane( new THREE.Vector3( 0, 1, 0 ), 0);
        // const planeHelper = new THREE.PlaneHelper( plane, 10, 0xffff00 );
        // panel.scene.add( gridHelper );
        // panel.scene.add( planeHelper );

        const geometry = new THREE.PlaneGeometry( 10, 10 );
        const material = new THREE.MeshPhongMaterial( {color: 0x429000, side: THREE.BackSide } );
        const plane = new THREE.Mesh( geometry, material );
        plane.rotation.setFromVector3(new THREE.Vector3(Math.PI/2,0,0));
        plane.position.set(0,0,0);
        plane.receiveShadow = true;
        panel.scene.add( plane );

        // const boxGeometry = new THREE.BoxGeometry( 1, 1, 1 ); 
        // const boxMaterial = new THREE.MeshBasicMaterial( {color: 0x00ff00} ); 
        // const cube = new THREE.Mesh( boxGeometry, boxMaterial ); 
        // panel.scene.add( cube );
        // cube.castShadow = true;
        // cube.position.set(1,1,1);

        panel.display_widget = panel.renderer;

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

        this.applyTransforms = [];
        this.apply_tf = false;
        this.fix_base = true;

        // this.last_odo = null;
        panel.ui.client.on('/tf_static', this.on_tf_data);
        panel.ui.client.on('/tf', this.on_tf_data);
        panel.ui.client.on('/robot_description', this.on_description_data);

        panel.widget_menu_cb = () => {

            $('<div class="menu_line"><label for="render_joints_'+panel.n+'"><input type="checkbox" '+(that.render_joints?'checked':'')+' id="render_joints_'+panel.n+'" title="Render joints"> Render joints</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#render_joints_'+panel.n).change(function(ev) {
                that.render_joints = $(this).prop('checked');
                if (that.render_joints) {
                    panel.camera.layers.enable(3);
                    if ($('#render_labels_'+panel.n).prop('checked'))
                        panel.camera.layers.enable(4); //labels
                } else {
                    panel.camera.layers.disable(3);
                    panel.camera.layers.disable(4); //labels
                }                    
            });

            $('<div class="menu_line"><label for="render_links_'+panel.n+'"><input type="checkbox" '+(that.render_links?'checked':'')+' id="render_links_'+panel.n+'" title="Render links"> Render links</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#render_links_'+panel.n).change(function(ev) {
                that.render_links = $(this).prop('checked');
                if (that.render_links) {
                    panel.camera.layers.enable(5);
                    if ($('#render_labels_'+panel.n).prop('checked'))
                        panel.camera.layers.enable(6); //labels
                } else {
                    panel.camera.layers.disable(5);
                    panel.camera.layers.disable(6); //labels
                }
            });

            $('<div class="menu_line"><label for="render_labels_'+panel.n+'""><input type="checkbox" '+(that.render_labels?'checked':'')+' id="render_labels_'+panel.n+'" title="Render labels"> Show labels</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#render_labels_'+panel.n).change(function(ev) {
                that.render_labels = $(this).prop('checked');
                if (that.render_labels) {
                    if ($('#render_joints_'+panel.n).prop('checked'))
                        panel.camera.layers.enable(4);
                    if ($('#render_links_'+panel.n).prop('checked'))
                        panel.camera.layers.enable(6);
                } else {
                    panel.camera.layers.disable(4);
                    panel.camera.layers.disable(6);
                }
            });

            $('<div class="menu_line"><label for="render_visuals_'+panel.n+'""><input type="checkbox" '+(that.render_visuals?'checked':'')+' id="render_visuals_'+panel.n+'" title="Render visuals"> Show visuals</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#render_visuals_'+panel.n).change(function(ev) {
                that.render_visuals = $(this).prop('checked');
                if (that.render_visuals)
                    panel.camera.layers.enable(1);
                else
                    panel.camera.layers.disable(1);
            });

            $('<div class="menu_line"><label for="render_collisions_'+panel.n+'""><input type="checkbox" '+(that.render_collisions?'checked':'')+' id="render_collisions_'+panel.n+'" title="Render collisions"> Show collisions</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#render_collisions_'+panel.n).change(function(ev) {
                that.render_collisions = $(this).prop('checked');
                if (that.render_collisions)
                    panel.camera.layers.enable(2);
                else
                    panel.camera.layers.disable(2);
            });

            $('<div class="menu_line"><label for="apply_tf_'+panel.n+'""><input type="checkbox" '+(that.apply_tf?'checked':'')+' id="apply_tf_'+panel.n+'" title="Apply transforms"> Apply transforms</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            $('#apply_tf_'+panel.n).change(function(ev) {
                that.apply_tf = $(this).prop('checked');
            });

            $('<div class="menu_line"><label for="fix_base_'+panel.n+'""><input type="checkbox" '+(that.fix_base?'checked':'')+' id="fix_base_'+panel.n+'" title="Fix robot base"> Fix base</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
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

        //TODO: store unused or failed as dirty
        //TODO: are transforms local or offset from base_link?!

        // console.log('got tf: ', tf);
        if (!this.apply_tf)
            return; //ignore
        
        for (let i = 0; i < tf.transforms.length; i++) {
            let id_parent = tf.transforms[i].header.frame_id;
            let id_child = tf.transforms[i].child_frame_id;

            if (id_child == 'base_link' && this.fix_base)
                continue;

            let t = tf.transforms[i].transform;
            if (this.robot && this.robot.links[id_child]) {
                this.robot.links[id_child].position.set(t.translation.x, t.translation.y, t.translation.z);
                this.robot.links[id_child].quaternion.set(t.rotation.x, t.rotation.y, t.rotation.z, t.rotation.w);
            }
        }
    }

    on_description_data = (desc) => {
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
        const axesHelper = new THREE.AxesHelper(.05);
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

    rendering_loop() {

        if (!this.rendering)
            return;

        this.panel.controls.update();
        this.panel.renderer.render(this.panel.scene, this.panel.camera);
        this.labelRenderer.render(this.panel.scene, this.panel.camera);
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
