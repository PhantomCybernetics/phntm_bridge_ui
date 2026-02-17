import * as THREE from "three";
import * as TDx from "3dconnexion";
import { DescriptionTFWidget } from '../widgets/inc/description-tf.js'

// const global = globalThis;
// global._3DCONNEXION_DEBUG = true;

export class SpaceMouse {
    constructor(widget) {
        this.widget = widget;
        this.animating = false;
        this.space_mouse = null;

        this.debug = false;

        this._camera_right = new THREE.Vector3();
        this._camera_world_position = new THREE.Vector3();

        this._pivot_base_world_position = new THREE.Vector3();
        this._pivot_world_position = new THREE.Vector3();
        this._pivot_position_diff = new THREE.Vector3();
        this._pivot_base_world_quaternion = new THREE.Quaternion();
        this._pivot_world_quaternion = new THREE.Quaternion();
        this._pivot_rotation_diff = new THREE.Quaternion();

        this._camera_matrix = new THREE.Matrix4();
        this._pos_local_space = new THREE.Vector3();
        this._rot_local_space = new THREE.Quaternion();
        this._scale_local_space = new THREE.Vector3();
        this.pivot_position = null;

        this._releaseTimeout = null;

        // hit test properties, these are used by getLookAt and set by the 3dconnexion navlib
        this.look = {
            origin: new THREE.Vector3(),
            direction: new THREE.Vector3(),
            aperture: 0.01,
            selection: false
        };

        this.space_mouse = new TDx._3Dconnexion(this);
        if (!this.space_mouse.connect()) {
            console.warn('Cannot connect to 3Dconnexion NL-Proxy');
        }
        window.addEventListener('focus', () => this.onFocus());
        window.addEventListener('blur', () => this.onBlur());
    }

    onFocus() {
        this.space_mouse.focus();
    }

    onBlur() {
        this.space_mouse.blur();
    }

    onConnect() {
        console.log('3Dconnexion NL-Proxy connected');
        let name = 'Phntm Bridge 3D View'; // name to identify the application for the 3D mouse property panels
        this.space_mouse.create3dmouse(window, name); // we need to pass in a focusable object, we can use the <div /> if it has a tabindex
    }

    on3dmouseCreated() {
        console.log('3Dconnexion mouse created');

        try {

            // set ourselves as the timing source for the animation frames
            this.space_mouse.update3dcontroller({
                'frame': {
                    'timingSource': 1
                }
            });

            let that = this;

            let actionImages = new TDx._3Dconnexion.ImageCache();
            actionImages.onload = function () {
                that.space_mouse.update3dcontroller({
                    'images': actionImages.images
                });
            };


            // An actionset can also be considered to be a buttonbank, a menubar, or a set of toolbars
            // Define a unique string for the action set to be able to specify the active action set
            // Because we only have one action set use the 'Default' action set id to not display the label
            const actionTree = new TDx._3Dconnexion.ActionTree();
            const buttonBank = actionTree.push(new TDx._3Dconnexion.ActionSet('PHMTM_BRIDGE_ACTIONS', 'Actions to control 3D view'));
            this._getApplicationCommands(buttonBank, actionImages);

            // Expose the commands to 3Dxware and specify the active buttonbank / action set
            this.space_mouse.update3dcontroller({
                'commands': {
                    'activeSet': 'PHMTM_BRIDGE_ACTIONS',
                    'tree': actionTree
                }
            });
            
        } catch (error) {
            console.error('Error in on3dmouseCreated:', error);
        }
    }

    onDisconnect(reason) {
        console.warn('3Dconnexion NL-Proxy disconnected ' + reason);
    }

    // this function fills the action and images structures that are exposed
    // to the 3Dconnexion button configuration editor
    // THIS DOESN'T WORK with 3DConnexion driver
    _getApplicationCommands(buttonBank, images) {
        // Add a couple of categories / menus / tabs to the buttonbank/menubar/toolbar
        // Use the categories to group actions so that the user can find them easily
        let fileNode = buttonBank.push(new TDx._3Dconnexion.Action('PHNTM_ID_FILE', 'File'));
        let editNode = buttonBank.push(new TDx._3Dconnexion.Action('PHNTM_ID_EDIT', 'Edit'));

        // // Add menu items / actions
        // fileNode.push(new TDx._3Dconnexion.Action('ID_OPEN', 'Open', 'Open file'));
        // fileNode.push(new TDx._3Dconnexion.Action('ID_CLOSE', 'Close', 'Close file'));
        // fileNode.push(new TDx._3Dconnexion.Action('ID_EXIT', 'Exit', 'Exit program'));

        // // Add menu items / actions
        // editNode.push(new TDx._3Dconnexion.Action('ID_UNDO', 'Undo', 'Shortcut is Ctrl + Z'));
        // editNode.push(new TDx._3Dconnexion.Action('ID_REDO', 'Redo', 'Shortcut is Ctrl + Y'));
        // editNode.push(new TDx._3Dconnexion.Action('ID_CUT', 'Cut', 'Shortcut is Ctrl + X'));
        // editNode.push(new TDx._3Dconnexion.Action('ID_COPY', 'Copy', 'Shortcut is Ctrl + C'));
        // editNode.push(new TDx._3Dconnexion.Action('ID_PASTE', 'Paste', 'Shortcut is Ctrl + V'));

        // Now add the images to the cache and associate it with the menu item by using the same id as the menu item / action
        // These images will be shown in the 3Dconnexion properties editor and in the UI elements which display the
        // active button configuration of the 3dmouse
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_OPEN'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_CLOSE'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_EXIT'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_CUT'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_COPY'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_PASTE'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_UNDO'));
        images.push(TDx._3Dconnexion.ImageItem.fromURL('/static/graph/graph.png', 'ID_REDO'));
    }

    // this callback is called when a command, that was exported by setting the commands property,
    // is invoked by a button press on the 3dmouse
    // THIS DOESN'T WORK with 3DConnexion driver
    setActiveCommand(id) {
        if (this.debug)
            console.log("3Dconnexion Id of command to execute= ", id);
    }

    // getCoordinateSystem is queried to determine the coordinate system of the application
    // described as X to the right, Y-up and Z out of the screen
    // the cs has X to the right, Y-up, and Z out of the screen
    getCoordinateSystem() {            
        return [ 1, 0, 0, 0,
                 0, 1, 0, 0,
                 0, 0, 1, 0,
                 0, 0, 0, 1 ];
    }

    // front view corresponds to the world pose.
    getFrontView() {
        return [ 1, 0, 0, 0,
                0, 1, 0, 0,
                0, 0, 1, 0,
                0, 0, 0, 1 ];
    }

    // getConstructionPlane is queried in orthographic projections to distinguish between 3D and 2D projections
    // In an axes aligned projection with the camera looking down the normal of the construction plane.
    // Effectively this means that in the orthographic projection in this sample 3D mouse rotations will be disabled
    // when the top or bottom view is selected.
    getConstructionPlane() {
        const origin = new THREE.Vector3(0, 0, 0); // a point on the construction plane            
        const yAxis = new THREE.Vector3(0,1,0); // up-axis is the y-axis
        const d0 = yAxis.dot(origin);            
        return [ yAxis.x, yAxis.y, yAxis.z, -d0 ]; // return the plane equation as an array
    }

    // getFloorPlane is queried when the walk motion model is active.
    // The plane is used to allow the view point to remain a fixed height above the floor.
    getFloorPlane() {
        const point = new THREE.Vector3(0, 0, 0); // a point on the floor plane
        const yAxis = new THREE.Vector3(0, 1, 0); // up-axis is the y-axis
        const d0 = yAxis.dot(point);
        return [ yAxis.x, yAxis.y, yAxis.z, -d0 ]; // return the plane equation as an array
    }

    // getUnitsToMeters is queried to determine the conversion factor between model or world
    // units and the physical unit meters.
    getUnitsToMeters() {
        return 1.0; // 1 unit is 1m
    }

    // getFov is called when the navlib requests the fov
    // in three.js the fov is in degrees, the 3dconnexion lib uses radians
    // in three.js the fov is the vertical fov.
    // In this example we return the diagonal fov
    getFov() {
        const fov = 2.0 * Math.atan(Math.tan2(this.widget.camera.fov * Math.PI, 360.0) * Math.sqrt(1 + this.widget.camera.aspect * this.widget.camera.aspect));
        return fov;
    }

    setLookFrom(data) {
        if (this.debug)
            console.log('3Dconnexion seting look.origin to', data);
        this.look.origin.set(data[0], data[1], data[2]);
    }

    setLookDirection(data) {
        if (this.debug)
            console.log('3Dconnexion setting look.direction to', data);
        this.look.direction.set(data[0], data[1], data[2]);
    }

    setLookAperture(data) {
        if (this.debug)
            console.log('3Dconnexion setting look.aperture to', data);
        this.look.aperture = data;
    }

    setSelectionOnly(data) {
        if (this.debug)
            console.log('3Dconnexion setting look.selectionOnly to', data);
        this.look.selection = data;
    }

    // getLookAt is called when the navlib needs to know if a ray fired into the screen
    // hits a surface of the model.
    // origin: is the origin of the ray
    // direction: is the rays"s direction
    // aperture: is the diameter of the ray
    // onlySelection: true - only attempt hits on the selection set, false - everything
    getLookAt() {
        const raycaster = new THREE.Raycaster(this.look.origin, this.look.direction, this.widget.camera.near, this.widget.camera.far);
        raycaster.precision = this.look.aperture / 2.0;
        raycaster.linePrecision = this.look.aperture / 2.0;
        raycaster.camera = this.widget.camera;

        // do the hit-testing
        const intersects = raycaster.intersectObjects(this.widget.scene.children);
        if (intersects.length > 0) {
            for (let i = 0, l = intersects.length; i < l; ++i) {
                // skip the ground plane
                if (intersects[i].object === this.widget.ground_plane)
                    continue;
                // skip invisible objects
                if (!intersects[i].object.visible)
                    continue;

                const lookAt = new THREE.Vector3();
                lookAt.copy(this.look.direction);
                lookAt.multiplyScalar(intersects[0].distance);
                lookAt.add(this.look.origin);
                
                if (this.debug)
                    console.log("3Dconnexion getLookAt() looking at [" + lookAt.x + ", " + lookAt.y + ", " + lookAt.z + "]");
                return lookAt.toArray();
            }
        }
        if (this.debug)
            console.log("3Dconnexion getLookAt() looking at nothing");
        return null; // nothing was hit
    }

    getPerspective() {
        return !this.widget.camera.isOrthographicCamera;
    }

    // this property returns whether the view can be rotated using the 3dmouse
    getViewRotatable() {
        return true;
    }

    // getPointerPosition is called when the navlib needs to know where the
    // 2d mouse pointer is on the projection/near plane
    getPointerPosition() {
        const rect = this.widget.renderer.domElement.getBoundingClientRect();

        // position of the mouse in the canvas (windows [0,0] is at the top-left of the screen, opengl[0,0] is at the bottom-left)
        // the position is tracked relative to the window so we need to subtract the relative position of the canvas
        // Setting z=0 puts the mouse on the near plane.
        const pos_opengl = new THREE.Vector3(window.mouseX - rect.left, this.widget.panel.widget_height - (window.mouseY - rect.top), 0.0);
        
        // three.js has screen coordinates that are in normalized device coordinates (-1,-1) bottom left and (1,1) top right.
        const pos = new THREE.Vector3(pos_opengl.x / this.widget.panel.widget_height * 2.0 - 1.0, pos_opengl.y / this.widget.panel.widget_height * 2.0 - 1.0, pos_opengl.z * 2.0 - 1.);
        pos.unproject(this.widget.camera);
        return pos.toArray();
    }

    setPivotPosition(data) {
        if (this.debug)
            console.log('3Dconnexion setPivotPosition', data);
        //this.pivot_position_reported = true;
        if (!this.pivot_position) {
            this.pivot_position = new THREE.Mesh(new THREE.SphereGeometry(0.015, 32, 16), new THREE.MeshBasicMaterial({ color: 0xff0000, opacity: 0.6, transparent: true }));
            this.widget.scene.add(this.pivot_position);
            this.pivot_position.visible = this.widget.DEBUG_CAMERA; // enable when debugging
        }
        this.pivot_position.position.set(data[0], data[1], data[2]);
    }

    // getPivotPosition is called when the navlib needs to know where the application"s rotation pivot is located
    // in this example we return the center of the geometry's bounding box
    getPivotPosition() {
        if (this.debug)
            console.log('3Dconnexion getPivotPosition');
        if (!this.widget.camera_selection)
            return [0, 0, 0];    
        let pos = new THREE.Vector3();
        this.widget.camera_selection.getWorldPosition(pos);
        return pos.toArray();
    }

    // [ORTHO]
    // getViewExtents is called when the navlib requests the bounding box
    // of the view. This occurs in orthographic view projections
    getViewExtents() {
        return [ this.widget.camera.left, this.widget.camera.bottom, -this.widget.camera.far,
                 this.widget.camera.right, this.widget.camera.top, -this.widget.camera.near ];
    }

    // [ORTHO]
    // setViewExtents is called when the navlib needs to zoom the view
    // in an orthographic view projection
    setViewExtents(data) {
        if (this.debug)
            console.log('3Dconnexion setViewExtents', data);
        this.widget.camera.left = data[0];
        this.widget.camera.bottom = data[1];
        this.widget.camera.right = data[3];
        this.widget.camera.top = data[4];
        this.widget.camera.updateProjectionMatrix();
    }

    // [PERSP]
    // getViewFrustum is called when the navlib requests the frustum of the view. This occurs in perspective view projections
    // three.js does not expose the frustum, so this needs to be calculated from the fov and the near plane.
    // Note the fov in three.js is the vertical fov.
    getViewFrustum() {
        const tan_halffov = Math.tan(this.widget.camera.fov * Math.PI / 360.0);
        const bottom = -this.widget.camera.near * tan_halffov;
        const left = bottom * this.widget.camera.aspect;
        return [ left, -left,
                 bottom, -bottom,
                 this.widget.camera.near, this.widget.camera.far ];
    }

    // [PERSP]
    // setFov is called when the navlib sets the fov
    setFov(data) {
        if (this.debug)
            console.log('3Dconnexion setFov', data);
        this.widget.camera.fov = data * 180.0 / Math.PI;
    }

    // getModelExtents is called when the navlib requests the bounding box of the model
    getModelExtents() {
        if (!this.widget.robot_model) {
            return [0, 0, 0, 0, 0, 0]; // return dummy bounds
        }
        const layers_selection = new THREE.Layers();
        layers_selection.disableAll();
        layers_selection.enable(DescriptionTFWidget.L_VISUALS);
        layers_selection.enable(DescriptionTFWidget.L_COLLIDERS);
        const boundingBox = this._computeFilteredBoundingBox(this.widget.robot_model, (obj) => {
            return obj.layers.test(layers_selection);
        });
        if (this.debug)
            console.log('3Dconnexion getModelExtents()', boundingBox);
        return [ boundingBox.min.x, boundingBox.min.y, boundingBox.min.z,
                 boundingBox.max.x, boundingBox.max.y, boundingBox.max.z ];
    }

    getSelectionExtents() {
        const boundingBox = new THREE.Box3();
        boundingBox.setFromObject(this.widget.camera_selection);
        return [ boundingBox.min.x, boundingBox.min.y, boundingBox.min.z,
                 boundingBox.max.x, boundingBox.max.y, boundingBox.max.z ];
    }

    // onStartMotion is called when the 3DMouse starts sending data
    onStartMotion() {
        if (this.animating)
            return;

        if (this.debug)
            console.log('3Dconnexion start motion');
        
        this.animating = true;
        this.widget.controls.enabled = false; // disable OrbitControls
        
        this.widget.camera.getWorldPosition(this._camera_world_position);
        this._camera_right.set(1,0,0).applyMatrix4(this.widget.camera.matrixWorld).sub(this._camera_world_position);
        this._disableHorizonLockOnYChange(this._camera_right.y);

        if (this.pivot_position) {
            this.pivot_position.getWorldPosition(this._pivot_base_world_position);
            this.pivot_position.getWorldQuaternion(this._pivot_base_world_quaternion);
        }        

        this.widget.renderDirty();
    }

    // getViewMatrix is called when the navlib requests the view matrix
    // THREE.js matrices are column major (same as openGL)
    getViewMatrix() {
        return this.widget.camera.matrixWorld.toArray();
    }

    // setViewMatrix is called when the navlib sets the view matrix
    setViewMatrix(data) {

        if (this.debug)
            console.log('3Dconnexion setViewMatrix');

        this.widget.camera.attach(this.widget.camera_controls_target);

        // note data is a column major matrix
        this._camera_matrix.fromArray(data);
        this._camera_matrix.decompose(this.widget.camera.position, this.widget.camera.quaternion, this.widget.camera.scale);

        // Spacenavd driver doen't report pivot position (doesn't set it)
        // but it also queries modelExtends on every update so skipping this is okay
        if (this.widget.vars.camera_follows_selection && this.pivot_position) {
            this.pivot_position.getWorldPosition(this._pivot_world_position);
            this.pivot_position.getWorldQuaternion(this._pivot_world_quaternion);
            this._pivot_position_diff.subVectors(this._pivot_world_position, this._pivot_base_world_position);
            this._pivot_rotation_diff.copy(this._pivot_base_world_quaternion).invert().multiply(this._pivot_world_quaternion);
            
            this.widget.camera.position.add(this._pivot_position_diff);

            this.widget.camera.position.sub(this._pivot_world_position);
            this.widget.camera.position.applyQuaternion(this._pivot_rotation_diff);
            this.widget.camera.quaternion.multiplyQuaternions(this._pivot_rotation_diff, this.widget.camera.quaternion);
            this.widget.camera.position.add(this._pivot_world_position);
        }

        this.widget.scene.attach(this.widget.camera_controls_target);

        if (this.widget.controls.fixHorizon) {
            if (this.pivot_position) { //3dconnexion driver - horizon lock in settings
                this.widget.camera.getWorldPosition(this._camera_world_position);
                 this._camera_right.set(1,0,0).applyMatrix4(this.widget.camera.matrixWorld).sub(this._camera_world_position);
                this._disableHorizonLockOnYChange(this._camera_right.y);
            } else { // Spacenavd - fix horizon via controls, if enabled
                this.widget.controls.update();
            }
        }

        this._releaseOnTimeout();
    }

    // triggers onStopMotion motion after a delay (Spacenavd doens't trigger it)
    _releaseOnTimeout() {
        if (this._releaseTimeout)
			clearTimeout(this._releaseTimeout);

        let that = this;
        this._releaseTimeout = setTimeout(() => {
            if (that.animating)
                that.onStopMotion();
        }, 200); // ms
    }

    // onStopMotion is called when the 3DMouse stops sending data
    onStopMotion() {
        if (this.debug)
            console.log('3Dconnexion stop motion');
        this.animating = false;

        this.widget.controls.update();
        this.widget.controls.enabled = true;  // enable OrbitControls
        this.widget.storeCameraPosePanelVars(); // saves camera pos in url
    }

    setTarget(data) {
        if (this.debug)
            console.log('3Dconnexion setTarget', data);
    }

    // setTransaction is called twice per frame
    // transaction >0 at the beginning of a frame change
    // transaction ===0 at the end of a frame change
    setTransaction(transaction) {
        if (transaction === 0) {
            this.widget.renderDirty(); // request a redraw if not animating
        }
    }
    
    _disableHorizonLockOnYChange(y) {
        if (!this.widget.controls.fixHorizon || Math.abs(y) <= 0.001)
            return;
        
        if (this.debug)
            console.warn("Space mouse disabling horizon lock with y=", y);
        this.widget.controls.fixHorizon = false;
        this.widget.vars.camera_lock_horizon = false;
        this.widget.camera_lock_horizon_btn.removeClass('on');
        this.widget.panel.storePanelVarAsBool('ch', this.widget.vars.camera_lock_horizon);
    }

    setSettingsChanged(data) {
        //console.log('3Dconnexion setSettingsChanged', data);
    }

    getSelectionEmpty() {
        if (this.debug)
            console.log('3Dconnexion getSelectionEmpty', false);
        return false;
    }

    _computeFilteredBoundingBox(root, shouldInclude) {
        const box = new THREE.Box3();
        let hasAny = false;

        root.updateMatrixWorld(true); // ensure world matrices are up to date

        root.traverse(obj => {
            if (!obj.isMesh && !obj.isLine && !obj.isPoints) return;
            if (shouldInclude && !shouldInclude(obj)) return;

            const geom = obj.geometry;
            if (!geom) return;

            if (!geom.boundingBox) {
                geom.computeBoundingBox();
            }

            const tempBox = geom.boundingBox.clone();
            tempBox.applyMatrix4(obj.matrixWorld);

            if (!hasAny) {
                box.copy(tempBox);
                hasAny = true;
            } else {
                box.union(tempBox);
            }
        });

        if (!hasAny) {
            box.makeEmpty();
        }

        return box;
    }

    destroy() {
        if (this.space_mouse) {
            this.space_mouse.delete3dmouse();
            delete this.space_mouse;
        }
    }
}