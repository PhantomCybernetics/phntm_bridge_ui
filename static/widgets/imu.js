import * as THREE from "three";

//IMU VISUALIZATION
export class ImuWidget {
	static default_width = 2;
	static default_height = 2;

	constructor(panel, topic) {
		this.panel = panel;
		this.topic = topic;

		let that = this;

		this.display_rot = true;
		this.display_acc = true;
		this.display_gyro = true;

		$("#panel_widget_" + panel.n).addClass("enabled imu");
		// let q = decoded.orientation;
		[panel.widget_width, panel.widget_height] = panel.getAvailableWidgetSize();

		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(
			75,
			panel.widget_width / panel.widget_height,
			0.1,
			1000,
		);

		this.renderer = new THREE.WebGLRenderer({
			antialias: false,
			precision: "lowp",
		});
		this.renderer.setSize(panel.widget_width, panel.widget_height);
		document
			.getElementById("panel_widget_" + panel.n)
			.appendChild(this.renderer.domElement);

		this.zero = new THREE.Vector3(0, 0.5, 0);

		const geometry = new THREE.BoxGeometry(1, 1, 1);
		const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
		this.cube = new THREE.Mesh(geometry, material);
		this.scene.add(this.cube);
		this.cube.position.copy(this.zero);

		this.cube.add(this.camera);
		this.camera.position.z = 2;
		this.camera.position.x = 0;
		this.camera.position.y = 1;
		this.camera.lookAt(this.cube.position);

		const acc_material = new THREE.LineBasicMaterial({
			color: 0x0000ff,
		});

		const gyro_material = new THREE.LineBasicMaterial({
			color: 0xff00ff,
		});

		this.acc_vector_normalized = new THREE.Vector3().copy(this.zero);
		this.acc_geometry = new THREE.BufferGeometry().setFromPoints([
			this.zero,
			this.acc_vector_normalized,
		]);
		this.acc_vector = new THREE.Line(this.acc_geometry, acc_material);
		this.scene.add(this.acc_vector);

		this.gyro_vector_normalized = new THREE.Vector3().copy(this.zero);
		this.gyro_geometry = new THREE.BufferGeometry().setFromPoints([
			this.zero,
			this.gyro_vector_normalized,
		]);
		this.gyro_vector = new THREE.Line(this.gyro_geometry, gyro_material);
		this.scene.add(this.gyro_vector);

		// const light = new THREE.AmbientLight( 0x404040 ); // soft white light
		// panel.scene.add( light );

		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
		this.scene.add(directionalLight);
		directionalLight.position.set(1, 2, 1);
		directionalLight.lookAt(this.cube.position);

		// const axesHelper = new THREE.AxesHelper( 5 );
		// panel.scene.add( axesHelper );

		const axesHelperCube = new THREE.AxesHelper(5);
		axesHelperCube.scale.set(1, 1, 1); //show z forward like in ROS
		this.cube.add(axesHelperCube);

		const gridHelper = new THREE.GridHelper(10, 10);
		this.scene.add(gridHelper);

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

		this.updateDisplay();
	}

	setupMenu(menu_els) {
		let that = this;

		// display rotation as a cube
		let display_rot_line_el = $('<div class="menu_line"></div>');
		let display_rot_label = $(
			'<label for="display_rot_' + this.panel.n + '">Rotation</label>',
		);
		let display_ror_cb = $(
			'<input type="checkbox" id="display_rot_' +
				this.panel.n +
				'" ' +
				(this.display_rot ? "checked " : "") +
				'title="Display rotation"/>',
		);
		display_rot_label.append(display_ror_cb).appendTo(display_rot_line_el);
		display_ror_cb.change(function (ev) {
			that.display_rot = $(this).prop("checked");
			that.updateDisplay();
		});
		menu_els.push(display_rot_line_el);

		// display acceleration vector
		let display_acc_line_el = $('<div class="menu_line"></div>');
		let display_acc_label = $(
			'<label for="display_acc_' + this.panel.n + '">Linear acceleration</label>',
		);
		let display_acc_cb = $(
			'<input type="checkbox" id="display_acc_' +
				this.panel.n +
				'" ' +
				(this.display_acc ? "checked " : "") +
				'title="Display acceleration"/> ',
		);
		display_acc_label.append(display_acc_cb).appendTo(display_acc_line_el);
		display_acc_cb.change(function (ev) {
			that.display_acc = $(this).prop("checked");
			that.updateDisplay();
		});
		menu_els.push(display_acc_line_el);

		// display gyro vector
		let display_gyro_line_el = $('<div class="menu_line"></div>');
		let display_gyro_label = $(
			'<label for="display_gyro_' + this.panel.n + '">Angular velocity</label>',
		);
		let display_gyro_cb = $(
			'<input type="checkbox" id="display_gyro_' +
				this.panel.n +
				'" ' +
				(this.display_gyro ? "checked " : "") +
				'title="Display angular velocity"/>',
		);
		display_gyro_label.append(display_gyro_cb).appendTo(display_gyro_line_el);
		display_gyro_cb.change(function (ev) {
			that.display_gyro = $(this).prop("checked");
			that.updateDisplay();
		});
		menu_els.push(display_gyro_line_el);
	}

	updateDisplay() {
		this.cube.visible = this.display_rot;
		this.acc_vector.visible = this.display_acc;
		this.gyro_vector.visible = this.display_gyro;
		this.render();
	}

	onClose() {}

	onResize() {
		// ResizeWidget(panel);
		this.render();
	}

	onData = (decoded) => {
		this.acc_vector_normalized
			.set(
				decoded.linear_acceleration.x,
				decoded.linear_acceleration.y,
				decoded.linear_acceleration.z,
			)
			.normalize()
			.add(this.zero);

		this.acc_geometry.setFromPoints([this.zero, this.acc_vector_normalized]);

		this.gyro_vector_normalized
			.set(
				decoded.angular_velocity.x,
				decoded.angular_velocity.y,
				decoded.angular_velocity.z,
			)
			.add(this.zero);

		this.gyro_geometry.setFromPoints([this.zero, this.gyro_vector_normalized]);

		// LHS (ROS) => RHS (Three)
		this.cube.quaternion.set(
			-decoded.orientation.y,
			decoded.orientation.z,
			-decoded.orientation.x,
			decoded.orientation.w,
		);
		this.render();
	};

	render = () => {
		this.renderer.render(this.scene, this.camera);
	};
}
