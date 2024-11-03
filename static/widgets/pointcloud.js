import * as THREE from 'three';
import { OrbitControls } from 'orbit-controls';

//IMU VISUALIZATION
export class PointCloudWidget {

    static default_width = 4;
    static default_height = 4;

    constructor (panel, topic) {
        
        this.panel = panel;
        this.topic = topic;

        let that = this;

        $('#panel_widget_'+panel.n).addClass('enabled imu');
        // let q = decoded.orientation;
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera( 75, panel.widget_width / panel.widget_height, 0.1, 100000 );

        this.camera.position.z = 0;
        this.camera.position.x = 0.1;
        this.camera.position.y = 0.1;
        this.scene.add(this.camera)
        this.camera_target_pos = new THREE.Vector3(0,0,-1);
        this.camera.lookAt(this.camera_target_pos);

        this.renderer = new THREE.WebGLRenderer({
            antialias : false,
            precision : 'lowp'
        });
        this.renderer.setSize( panel.widget_width, panel.widget_height );
        document.getElementById('panel_widget_'+panel.n).appendChild( this.renderer.domElement );

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.addEventListener('change', this.controlsChanged);
        this.controls_dirty = false;
        this.controls.target = this.camera_target_pos;
        this.controls.update();

        // const gridHelper = new THREE.GridHelper( 10, 10 );
        // this.scene.add( gridHelper );

        this.ros_space = new THREE.Object3D();
        this.ros_space.rotation.set(-Math.PI, 0.0, 0.0); //+z up
        this.scene.add(this.ros_space);

        const axesHelper = new THREE.AxesHelper(1);
        this.ros_space.add(axesHelper);

        this.verts = null; //float32array
        this.geometry = new THREE.BufferGeometry();
        this.material = new THREE.PointsMaterial( {
            color: 0x00ff00,
            transparent: true,
            opacity: 0.9,
            size: 0.001,
            blendEquation: THREE.SubtractiveBlending,
            blendEquationAlpha: THREE.SubtractiveBlending 
        } );
        this.points = null;

       
    }

    onResize () {
        // ResizeWidget(panel);
        this.render();
    }

    onClose() {
    }

    controlsChanged = () => {
        this.render();
    }

    onData = (msg) => {
        if (this.panel.paused)
            return;

        // console.log('Got PC data', msg);
        const view = new DataView(msg.data.buffer, msg.data.byteOffset, msg.data.byteLength);
        // let pts = [];
        let b = 0;
        let length = msg.width*msg.height;
        if (!this.verts)
            this.verts = new Float32Array(length*3);
        const vertsView = new DataView(this.verts.buffer);
        let bOut = 0;
        this.nParsed = 0;
        while (b < view.byteLength-msg.point_step) {

            let pt = {};

            for (let i = 0; i < msg.fields.length; i++) {
                let f = msg.fields[i];

                for (let j = 0; j < f.count; j++) {
                    let val = undefined;

                    switch (f.datatype) {
                        case 1: val = view.getInt8(b+f.offset, !msg.is_bigendian); break;
                        case 2: val = view.getUint8(b+f.offset, !msg.is_bigendian); break;
                        case 3: val = view.getInt16(b+f.offset, !msg.is_bigendian); break;
                        case 4: val = view.getUint16(b+f.offset, !msg.is_bigendian); break;
                        case 5: val = view.getInt32(b+f.offset, !msg.is_bigendian); break;
                        case 6: val = view.getUint32(b+f.offset, !msg.is_bigendian); break;  
                        case 7: val = view.getFloat32(b+f.offset, !msg.is_bigendian); break;
                        case 8: val = view.getFloat64(b+f.offset, !msg.is_bigendian); break;
                        default: break;
                    }

                    pt[f.name] = val; // only works with count=1
                }
            }
            b += msg.point_step;

            if (pt.x !== undefined && !isNaN(pt.x) && pt.x !== null &&
                pt.y !== undefined && !isNaN(pt.y) && pt.y !== null &&
                pt.z !== undefined && !isNaN(pt.z) && pt.z !== null)
            {
                vertsView.setFloat32(bOut, pt.x, true); bOut += 4;
                vertsView.setFloat32(bOut, pt.y, true); bOut += 4;
                vertsView.setFloat32(bOut, pt.z, true); bOut += 4;
                this.nParsed++;
            }
        }

        console.log('Parsed '+(this.nParsed)+' pts');

        // LHS (ROS) => RHS (Three)
        // this.cube.quaternion.set(-decoded.orientation.y, decoded.orientation.z, -decoded.orientation.x, decoded.orientation.w);
        this.render();
    }

    render = () => {

        if (this.verts) {
            let trimmed_arr = new Float32Array(this.verts.buffer, 0, this.nParsed*3);
            let att = new THREE.Float32BufferAttribute(trimmed_arr, 3);
            if (!this.logged) {
                //this.logged = true;
                // console.warn('Rendering data:', att);
            }
            this.geometry.setAttribute( 'position', att);
            if (!this.points) {
                this.points = new THREE.Points( this.geometry, this.material );
                this.ros_space.add( this.points );
            }
        }

        this.renderer.render( this.scene, this.camera );
    }
}