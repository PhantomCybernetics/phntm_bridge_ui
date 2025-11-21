import * as THREE from "three";
import { AxesHelper2 } from 'axes-helper2';
import { Line2 } from 'line2';
import { LineMaterial } from "line-material2";
import { LineGeometry } from 'line-geometry2';
import "/static/canvasjs-charts/canvasjs.min.js";
import { SingleTypePanelWidgetBase } from "./inc/single-type-widget-base.js";

// Imu rotation visualization with linear acceleration graph

export class ImuWidget extends SingleTypePanelWidgetBase {
	static DEFAULT_WIDTH = 4;
	static DEFAULT_HEIGHT = 14;
	static HANDLED_MSG_TYPES = [ 'sensor_msgs/msg/Imu' ];

	static RED = '#ff2c0cff';
	static GREEN = '#00ff00';
	static BLUE = '#00b3ff';

	static AXES = [
		{ label: '+X', c: ImuWidget.RED, v: new THREE.Vector3(1, 0, 0) },
		{ label: '+Y', c: ImuWidget.GREEN, v: new THREE.Vector3(0, 1, 0) },
		{ label: '+Z', c: ImuWidget.BLUE, v: new THREE.Vector3(0, 0, 1) },
		{ label: '-X', c: ImuWidget.RED, v: new THREE.Vector3(-1, 0, 0) },
		{ label: '-Y', c: ImuWidget.GREEN, v: new THREE.Vector3(0, -1, 0) },
		{ label: '-Z', c: ImuWidget.BLUE, v: new THREE.Vector3(0, 0, -1) },
	];

	constructor(panel, topic) {
		super(panel, topic, 'imu');
		
		this.enable_rot = this.panel.getPanelVarAsBool('rot', true);
		this.enable_acc = this.panel.getPanelVarAsBool('acc', false);
		this.autoresize_renderer = false; // handling our own renderer resize here

		let config = this.client.getTopicConfig(topic);

		this.min_acc_m_s = config && config.min_acceleration !== undefined ? config.min_acceleration : 0;
		this.max_acc_m_s = config && config.max_acceleration !== undefined ? config.max_acceleration : 0;

		this.acc_trace_length = 200;

		this.fw_axis = this.panel.getPanelVarAsInt('fw', 0); // +X default
		this.up_axis = this.panel.getPanelVarAsInt('up', 2); // +Z default
		this.up_axis_rot_fix = new THREE.Quaternion();
		this.fw_axis_camera_fix = new THREE.Quaternion();

		this.rotation_el = $('<div class="rotation" id="imu_rotation_'+panel.n+'"></div>');
		this.acc_el = $('<div class="acceleration" id="imu_acc_'+panel.n+'"></div>');
		this.widget_el.append([this.rotation_el, this.acc_el]);
		[panel.widget_width, panel.widget_height] = panel.getAvailableWidgetSize();

		// make rotation renderer
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera(75, panel.widget_width / panel.widget_height, 0.1, 1000);

		this.renderer = new THREE.WebGLRenderer({
			antialias: false,
			precision: "lowp",
		});
		document.getElementById("imu_rotation_" + panel.n).appendChild(this.renderer.domElement);
		this.updateDisplay();

		this.imu_space = new THREE.Object3D();
		this.scene.add(this.imu_space);
		this.imu_space.position.set(0,1,0);

		const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
		this.scene.add(directionalLight);
		directionalLight.position.set(1, 2, 1);
		directionalLight.lookAt(this.imu_space.position);

		const ambience = new THREE.AmbientLight(0x202020); // soft white light
		this.scene.add(ambience);

		const gridHelper = new THREE.GridHelper(10, 10);
		this.scene.add(gridHelper);

		const cube_geometry = new THREE.BoxGeometry(1, 1, 1);
		const cube_material = new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent:true, opacity:0.8 });
		this.rot_cube = new THREE.Mesh(cube_geometry, cube_material);
		const axesHelper = new AxesHelper2(5, 2);
		axesHelper.scale.set(1, 1, 1); //show z forward like in ROS
		// axesHelper.material.depthTest = false;
		// axesHelper.material.depthWrite = false;
		this.rot_cube.add(axesHelper);
		this.imu_space.add(this.rot_cube);

		this.imu_space.add(this.camera);
		this.setRotationBase();
		this.setCameraTarget();

		// make accelration chart
		this.data_trace_x = [];
		this.data_trace_y = [];
		this.data_trace_z = [];
		
		this.render();
		this.makeAccChart();
	}

	makeAccChart() {
		if (this.chart) {
			console.log("Clearing old acc chart");
			this.chart.destroy();
			$("#imu_acc_" + this.panel.n).empty();
		}
		this.chart = new CanvasJS.Chart("imu_acc_" + this.panel.n, {
			backgroundColor: '#000000',
			toolTip: {
				contentFormatter: function (e) {
					return e.entries[0].dataPoint.y.toFixed(2) + " m/s²";
				},
			},
			axisX: {
				labelFormatter: function (e) {
					return "";
				},
				lineThickness: 0,
				tickThickness: 0,
			},
			axisY: {
				minimum: this.min_acc_m_s,
				maximum: this.max_acc_m_s,
				labelFontColor: '#ccc',
				gridColor: "#222222",
				labelFontSize: 12,
				lineThickness: 0,
				labelFormatter: function (e) {
					return e.value.toFixed(0) + " m/s²";
				},
				tickLength: 2,
			},
			data: [
				{
					type: "line",
					lineThickness: 2,
					dataPoints: this.data_trace_x,
				},
				{
					type: "line",
					lineThickness: 2,
					dataPoints: this.data_trace_y,
				},
				{
					type: "line",
					lineThickness: 2,
					dataPoints: this.data_trace_z,
				}
			],
		});
	}

	onData(msg) {
	
		let q = new THREE.Quaternion(msg.orientation.x, msg.orientation.y, msg.orientation.z, msg.orientation.w);

		q.premultiply(this.up_axis_rot_fix);		
		this.imu_space.quaternion.copy(q);

		this.data_trace_x.push({
			x: msg.header.stamp.nanosec / 1e9 + msg.header.stamp.sec,
			y: msg.linear_acceleration.x,
			label: 'X: ' + msg.linear_acceleration.x.toFixed(2) + ' m/s²',
			markerColor: ImuWidget.RED,
			lineColor: ImuWidget.RED,
			markerSize: 0,
		});

		this.data_trace_y.push({
			x: msg.header.stamp.nanosec / 1e9 + msg.header.stamp.sec,
			y: msg.linear_acceleration.y,
			label: 'Y: ' + msg.linear_acceleration.y.toFixed(2) + ' m/s²',
			markerColor: ImuWidget.GREEN,
			lineColor: ImuWidget.GREEN,
			markerSize: 0,
		});

		this.data_trace_z.push({
			x: msg.header.stamp.nanosec / 1e9 + msg.header.stamp.sec,
			y: msg.linear_acceleration.z,
			label: 'Z: ' + msg.linear_acceleration.z.toFixed(2) + ' m/s²',
			markerColor: ImuWidget.BLUE,
			lineColor: ImuWidget.BLUE,
			markerSize: 0,
		});

		if (this.data_trace_x.length > this.acc_trace_length) {
			this.data_trace_x.shift();
			this.data_trace_y.shift();
			this.data_trace_z.shift();
		}

		this.render();
	}

	render() {
		if (this.enable_rot && this.renderer)
			this.renderer.render(this.scene, this.camera);
		if (this.enable_acc && this.chart)
			this.chart.render();
	}

	setRotationBase() {
		this.up_axis_rot_fix.setFromUnitVectors(ImuWidget.AXES[this.up_axis].v, new THREE.Vector3(0,1,0)) ;
	}

	setCameraTarget() {
		
		let fw = ImuWidget.AXES[this.fw_axis].v.clone();
		let up = ImuWidget.AXES[this.up_axis].v.clone();

		let last_rot = this.imu_space.quaternion.clone();
		this.imu_space.quaternion.copy(this.up_axis_rot_fix);

		let right = new THREE.Vector3().crossVectors(fw, up);
		let cam_pos_offset = fw.multiplyScalar(-2)
							   .add(up.multiplyScalar(0.8))
							   .add(right.multiplyScalar(0.1));

		this.camera.position.copy(this.rot_cube.position.clone().add(cam_pos_offset));
		let target = this.rot_cube.position.clone()
						.add(ImuWidget.AXES[this.fw_axis].v.clone().multiplyScalar(1));
		target = this.imu_space.localToWorld(target);
		this.camera.lookAt(target);

		//this.imu_space.quaternion.copy(last_rot);
	}

	setupMenu(menu_els) {
		let that = this;

		//display rotation cube
		let enable_rot_line_el = $('<div class="menu_line"></div>');
		let enable_rot_label = $('<label for="enable_rot_' + this.panel.n + '">Display rotation</label>');
		let enable_rot_cb = $('<input type="checkbox" id="enable_rot_' + this.panel.n + '" ' + (this.enable_rot ? "checked " : "") + 'title="Display rotation"/> ');
		enable_rot_label.append(enable_rot_cb).appendTo(enable_rot_line_el);
		menu_els.push(enable_rot_line_el);

		//display acceleration graph
		let enable_acc_line_el = $('<div class="menu_line"></div>');
		let enable_acc_label = $('<label for="enable_acc_' + this.panel.n + '">Display acceleration</label>');
		let enable_acc_cb = $('<input type="checkbox" id="enable_acc_' + this.panel.n + '" ' + (this.enable_acc ? "checked " : "") + 'title="Display acceleration"/> ');
		enable_acc_label.append(enable_acc_cb).appendTo(enable_acc_line_el);
		menu_els.push(enable_acc_line_el);

		enable_rot_cb.change(function (ev) {
			that.enable_rot = $(this).prop("checked");
			that.panel.storePanelVarAsBool('rot', that.enable_rot);
			that.updateDisplay();
			that.render();
			if (!that.enable_acc && !that.enable_rot)
				enable_acc_cb.click();
			that.panel.updateMenu();
		});
		enable_acc_cb.change(function (ev) {
			that.enable_acc = $(this).prop("checked");
			that.panel.storePanelVarAsBool('acc', that.enable_acc);
			that.updateDisplay();
			that.render();
			if (!that.enable_acc && !that.enable_rot)
				enable_rot_cb.click();
		});

		if (this.enable_rot) {
			// up axis
			let up_axis_line_el = $('<div class="menu_line buttons_right"></div>');
			let up_axis_label = $('<label></label>');
			let up_axis_value = $('<span></span>');
			let up_axis_btn_left = $('<button class="left">&laquo;</button>');
			let up_axis_btn_right = $('<button class="right">&raquo;</button>');
			up_axis_label.append([ up_axis_value, up_axis_btn_right, up_axis_btn_left ]).appendTo(up_axis_line_el);
			menu_els.push(up_axis_line_el);

			function setUpAxisLabel() {
				let label =  'Up axis: <span style="color:' +  ImuWidget.AXES[that.up_axis].c + '">' +  ImuWidget.AXES[that.up_axis].label + '</span>';
				up_axis_value.html(label);
			}
			setUpAxisLabel();
			up_axis_btn_left.click(()=>{
				if (that.up_axis <= 0) that.up_axis = ImuWidget.AXES.length-1;
				else that.up_axis--;
				that.panel.storePanelVarAsInt('up', that.up_axis);
				setUpAxisLabel();
				that.setRotationBase();
				that.setCameraTarget();
			});
			up_axis_btn_right.click(()=>{
				if (that.up_axis >= ImuWidget.AXES.length-1) that.up_axis = 0;
				else that.up_axis++;
				that.panel.storePanelVarAsInt('up', that.up_axis);
				setUpAxisLabel();
				that.setRotationBase();
				that.setCameraTarget();
			});

			// fw axis
			let fw_axis_line_el = $('<div class="menu_line buttons_right"></div>');
			let fw_axis_label = $('<label></label>');
			let fw_axis_value = $('<span></span>');
			let fw_axis_btn_left = $('<button class="left">&laquo;</button>');
			let fw_axis_btn_right = $('<button class="right">&raquo;</button>');
			fw_axis_label.append([ fw_axis_value, fw_axis_btn_right, fw_axis_btn_left ]).appendTo(fw_axis_line_el);
			menu_els.push(fw_axis_line_el);

			function setFWAxisLabel() {
				let label =  'Forward axis: <span style="color: '+ ImuWidget.AXES[that.fw_axis].c + '">' + ImuWidget.AXES[that.fw_axis].label + '</span>';
				fw_axis_value.html(label);
			}
			setFWAxisLabel();
			fw_axis_btn_left.click(()=>{
				if (that.fw_axis <= 0) that.fw_axis = ImuWidget.AXES.length-1;
				else that.fw_axis--;
				that.panel.storePanelVarAsInt('fw', that.fw_axis);
				setFWAxisLabel();
				that.setCameraTarget();
			});
			fw_axis_btn_right.click(()=>{
				if (that.fw_axis >= ImuWidget.AXES.length-1) that.fw_axis = 0;
				else that.fw_axis++;
				that.panel.storePanelVarAsInt('fw', that.fw_axis);
				setFWAxisLabel();
				that.setCameraTarget();
			});
		}
	}

	updateDisplay() {

		if (this.enable_rot) {
			//this.widget_el.addClass('rotation-on');
			let w_px = this.enable_acc ? this.panel.widget_width / 2.0 : this.panel.widget_width;
			let h_px = this.panel.widget_height;
			let w_perc = this.enable_acc ? '50%' : 'auto'
			this.rotation_el.css({
				'display': 'block',
				'width' : w_perc,
				'float': this.enable_acc ? 'left' : 'auto'
			});
			this.renderer.setSize(w_px, h_px);
			this.camera.aspect = w_px / h_px;
			this.camera.updateProjectionMatrix();
		} else {
			this.rotation_el.css({'display': 'none'});
		}
		
		if (this.enable_acc) {
			let w_perc = this.enable_rot? '50%' : 'auto'
			this.acc_el.css({
				'display': 'block',
				'margin-left': 'auto',
				'width' : w_perc,
				'height': '100%'
			});
		} else {
			this.acc_el.css('display', 'none');
		}
	}

	onResize() {
		this.updateDisplay();
		this.render();
	}
}
