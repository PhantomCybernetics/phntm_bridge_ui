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

        // this.last_odo = null;
        panel.ui.client.on('/tf_static', this.on_tf_data);
        panel.ui.client.on('/tf', this.on_tf_data);
        panel.ui.client.on('/robot_description', this.on_description_data);
        
        this.rendering = true;
        this.rendering_loop();

        panel.widget_menu_cb = () => {

            $('<div class="menu_line"><label for="render_joints_'+panel.n+'"><input type="checkbox" id="render_joints_'+panel.n+'" checked title="Render joints"> Render joints</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line"><label for="render_labels_'+panel.n+'""><input type="checkbox" id="render_labels_'+panel.n+'" checked title="Render labels"> Show labels</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('#render_joints_'+panel.n).change(function(ev) {
                that.render_joints = $(this).prop('checked');
                if (that.render_joints)
                    panel.camera.layers.enable(2);
                else
                    panel.camera.layers.disable(2);
            });

            $('#render_labels_'+panel.n).change(function(ev) {
                that.render_labels = $(this).prop('checked');
                if (that.render_labels)
                    panel.camera.layers.enable(1);
                else
                    panel.camera.layers.disable(1);
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
        // console.log('got tf: ', tf);
    }

    on_description_data = (desc) => {
        // console.log('got desc: ', desc.data);
        this.robot = this.loader.parse(desc.data);
        this.robot.castShadow = true;
        console.log('parsed urdf robot', this.robot);
        this.world.clear();
        this.world.add(this.robot);
        this.world.position.set(0,0,0);

        let that = this;

        this.robot.layers.enableAll();

        if (this.robot.links['base_footprint']) {
            let v = new THREE.Vector3();
            this.robot.links['base_footprint'].getWorldPosition(v);
            console.log('base_footprint offset:', v);
            this.world.position.copy(v.negate());
        }
        if (this.robot.links['base_link']) {
            that.make_mark(that.robot.links['base_link'], 'base_link')
        }
        
        this.robot.children.forEach((ch)=>{
            if (ch.children && ch.children.length) {
                ch.children[0].castShadow = true;
            }
        });
        Object.keys(this.robot.joints).forEach((key)=>{
            console.log('joint:', that.robot.joints[key]);
            that.make_mark(that.robot.joints[key], key)
            // that.robot.visual[key].castShadow = true;
            // that.robot.visual[key].receiveShadow = true;
            // that.robot.visual[key].material = new THREE.MeshPhongMaterial( {color: 0xffffff, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide} );
        });

    }

    make_mark(target, label_text) {
        const axesHelper = new THREE.AxesHelper(.05);
        axesHelper.material.depthTest = false;
        target.add(axesHelper);
        axesHelper.layers.set(2);

        const el = document.createElement('div');
        el.className = 'label';
        el.textContent = label_text;
        el.style.backgroundColor = 'transparent';
        el.style.color = '#ffffff';
        el.style.fontSize = '12px';

        target.layers.enableAll();
        const label = new CSS2DObject(el);
        target.add(label);
        label.center.set(0.5, 0);
        label.position.set(0, 0, .02);
        label.layers.set(1);

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
