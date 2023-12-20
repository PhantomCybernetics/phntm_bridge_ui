import * as THREE from 'three';

//IMU VISUALIZATION
export class ImuWidget {

    constructor (panel, topic) {
        
        this.panel = panel;
        this.topic = topic;

        let that = this;

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.1, 1000 );

        this.renderer = new THREE.WebGLRenderer({
            antialias : false,
            precision : 'lowp'
        });
        this.renderer.setSize( panel.widget_width, panel.widget_height );
        document.getElementById('panel_widget_'+panel.n).appendChild( this.renderer.domElement );

        const geometry = new THREE.BoxGeometry( 1, 1, 1 );
        const material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
        this.cube = new THREE.Mesh( geometry, material );
        this.scene.add( this.cube );
        this.cube.position.y = .5

        this.cube.add(this.camera)
        this.camera.position.z = 2;
        this.camera.position.x = 0;
        this.camera.position.y = 1;
        this.camera.lookAt(this.cube.position);

        // const light = new THREE.AmbientLight( 0x404040 ); // soft white light
        // panel.scene.add( light );

        const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.5 );
        this.scene.add( directionalLight );
        directionalLight.position.set( 1, 2, 1 );
        directionalLight.lookAt(this.cube.position);

        // const axesHelper = new THREE.AxesHelper( 5 );
        // panel.scene.add( axesHelper );

        const axesHelperCube = new THREE.AxesHelper( 5 );
        axesHelperCube.scale.set(1, 1, 1); //show z forward like in ROS
        this.cube.add( axesHelperCube );

        const gridHelper = new THREE.GridHelper( 10, 10 );
        this.scene.add( gridHelper );

        // this.display_widget = this.renderer;

        // panel.animate();

        // window.addEventListener('resize', () => {
        //     ResizeWidget(panel);
        //     RenderImu(panel);
        // });
        // $('#display_panel_source_'+panel.n).change(() => {
        //     ResizeWidget(panel);
        //     RenderImu(panel);
        // });
        this.panel.resize_event_handler = function () {
            // ResizeWidget(panel);
            that.render();
        };
    }

    onClose() {
    }

    onData = (decoded) => {

            // LHS (ROS) => RHS (Three)
        this.cube.quaternion.set(-decoded.orientation.y, decoded.orientation.z, -decoded.orientation.x, decoded.orientation.w);
        this.render();

    }

    //logger
    render = () => {
        this.renderer.render( this.scene, this.camera );
    }
}



