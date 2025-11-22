import { GraphMenu } from "/static/graph-menu.js";
import { IsImageTopic, IsVideoTopic, IsFastVideoTopic } from "/static/browser-client.js";
import { Gamepad as TouchGamepad } from "/static/touch-gamepad/gamepad.js";
// import { QRCodeStyling } from '/static/qr-code-styling/qr-code-styling.common.js';

import { Panel } from "./panel.js";
import {
	isPortraitMode,
	isTouchDevice,
	isSafari,
	msToTime,
	formatBytes,
	nl2br,
} from "./inc/lib.js";
import { UserButtonsServiceInput, ServiceInput_Empty } from "./input/service-widgets.js";

import { ServiceInputDialog } from "./inc/service-input-dialog.js";
import { NodeParamsDialog } from "./inc/node-params-dialog.js";

export class PanelUI {
	panels = {};

	lastAP = null;
	lastESSID = null;

	// override or edit to customize topic panel defaults
	topic_widgets = {
		// '/robot_description' : { widget: URDFWidget, w:5, h:4 } ,
	};
	type_widgets = {};
	addTypeWidget(msg_type, widget_class, plugin_classes) {
		this.type_widgets[msg_type] = {
			widget: widget_class,
			w: widget_class.DEFAULT_WIDTH,
			h: widget_class.DEFAULT_HEIGHT,
			plugin_classes: plugin_classes
		};
	}

	widgets = {}; // custom and/or compound

	service_widgets = {};
	addServiceTypeWidget(srv_msg_type, widget_class) {
		this.service_widgets[srv_msg_type] = widget_class;
	}

	custom_service_widgets = {};
	addCustomServiceWidget(widget_class_name, widget_class) {
		if (this.custom_service_widgets[widget_class_name]) return; //only once per session

		console.log('Registering custom service widget with class name '+widget_class_name);
		this.custom_service_widgets[widget_class_name] = {
			class: widget_class,
		};

		this.servicesMenuFromNodes();
	}

	service_widget_map = {};
	addServiceWidgetMapping(id_service, widget_class_name) {
		console.log("Adding service widget mapping for " + id_service + ": " + widget_class_name);

		this.service_widget_map[id_service] = {
			class_name: widget_class_name,
			widget: null
		};
	}

	constructor(client, grid_cell_height, input_manager) {
		this.client = client;
		this.client.ui = this;

		this.is_visible = true;
		this.is_sleeping = false;
		this.run_in_background = false; // disconnects when backgrounded or computer goes to sleep
		this.reconnection_timer = null;
		this.disconnect_timer = null;
		this.reconnection_delay = 1000; // ms
		this.background_disconnect_delay = 1000 * 60 * 2; // 2 min
		// document.querySelector("body").requestFullscreen();
		this.grid_cell_height = grid_cell_height;

		let GridStack = window.exports.GridStack;
		GridStack.renderCB = (el, w) => {
  			el.innerHTML = w.content;
		};
		this.grid = GridStack.init({
			float: false,
			animate: false,
			cellHeight: grid_cell_height,
			handle: ".panel-title",
			columnOpts: {
				breakpoints: [{ w: 500, c: 1 }],
			},
		});

		this.panels = {};
		this.panel_menu_on = null; //touch only
		this.maximized_panel = null;

		this.input_manager = input_manager;
		this.input_manager.ui = this;

		this.latest_nodes = null;
		this.latest_cameras = null;

		this.last_pc_stats = null;

		let that = this;
		this.small_menu_width = 245;
		this.burger_menu_open_item = null;
		this.burger_menu_open = false;

		this.lastAP = null;
		this.lastESSID = null;
		this.wifi_scan_enabled = false;
		this.wifi_roam_enabled = false;

		let wifi_scan_warning_suppressed = localStorage.getItem(
			"wifi-scan-warning-suppressed:" + this.client.id_robot,
		);
		this.wifi_scan_warning_suppressed = wifi_scan_warning_suppressed == "true";

		this.graph_menu = new GraphMenu(this);

		this.num_services = 0;
		this.num_cameras = 0;
		this.num_docker_containers = 0;
		this.docker_hosts = {};
		this.num_widgets = 0;

		this.collapse_services = null; // str [] when received
		this.collapse_unhandled_services = false;
		this.service_input_dialog = new ServiceInputDialog(client);
		this.node_params_dialog = new NodeParamsDialog(client);
		this.default_service_btns = null; // from the robot
		this.service_btns = {}; //id srv => btn[]
		this.service_btns_edited = {}; // editor's working copy
		this.service_btn_els = {};

		this.conn_dot_els = [];
		for (let i = 0; i < 3; i++) {
			this.conn_dot_els.push($("#dot-" + i));
		}
		this.wifi_signal_el = $("#network-info #signal-monitor");
		this.network_peers_el = $("#network-info-peers");
		this.network_rtt_el = $("#network-info-rtt");
		this.webrtc_status_el = null; // made in updateWebrtcStatus()
		this.webrtc_uptime_el = null; // -//-
		this.webrtc_info_el = $("#webrtc_info");
		this.trigger_wifi_scan_el = $("#trigger_wifi_scan");
		this.robot_wifi_info_el = $("#robot_wifi_info");

		this.last_connected_time = null;
		this.connection_uptime_timer = null;
		this.last_connection_uptime = "";

		client.on("introspection", (state) => {
			if (state) {
				$("#introspection_state")
					.addClass("active")
					.removeClass("inactive")
					.attr("title", "Introspection running...");
			} else {
				$("#introspection_state")
					.addClass("inactive")
					.removeClass("active")
					.attr("title", "Run introspection...");
			}
		});

		client.on("error", (error, msg) => {
			that.showNotification("Client error (" + error + "): " + msg, "error");
		});

		client.on("update", () => {
			// from socket

			if (client.name) {
				$("#robot_name .label").html(client.name);
				that.saveLastRobotName();
				that.setDocumentTitle();
			}

			let ip_display = client.ip ? client.ip.replace("::ffff:", "") : null;
			$("#robot_info").html(
				'<span class="label">Robot ID:</span> ' +
					client.id_robot +
					"<br>" +
					'<span class="label">Robot IP (public):</span> ' +
					(client.robot_socket_online
						? '<span class="online">' + ip_display + "</span>"
						: '<span class="offline">' +
							(ip_display ? ip_display : "Offline") +
							"</span>"),
			);

			that.setDotState(
				1,
				client.robot_socket_online ? "green" : "red",
				"Robot " +
					(client.robot_socket_online ? "conected to" : "disconnected from") +
					" Bridge Server [Socket.io]",
			);
			if (!client.robot_socket_online) {
				that.updateWifiSignal(-1);
				that.updateNumPeers(-1);
				that.updateRTT(false);
			}
			that.updateWebrtcStatus();
			that.updateLayout(); // robot name length affects layout

			let client_version_info = client.client_version ? client.client_version : "N/A";
			if (client.ros_distro)
				client_version_info += " @ " + client.ros_distro.charAt(0).toUpperCase() + client.ros_distro.slice(1);
			if (client_version_info)
				client_version_info += " ";

			if (client.client_version && client.ros_distro) {
				$("#bridge-version-info").html(client_version_info);
				that.saveLastRobotClientVersionInfo(client_version_info);
			}
		});

		function reconnectSockerTimer() {
			if (that.is_visible || that.run_in_background) {
				console.log("Reconnecting... UI visible=" + that.is_visible);
				that.client.connect();
			}
		}

		client.on("socket_disconnect", () => {
			that.setDotState(
				1,
				client.robot_socket_online ? "green" : "red",
				"Robot " +
					(client.robot_socket_online ? "conected to" : "disconnected from") +
					" Bridge Server [Socket.io]",
			);
			console.log("UI got socket_disconnect, timer=", that.reconnection_timer);

			if (!that.reconnection_timer) {
				that.reconnection_timer = setInterval(
					reconnectSockerTimer,
					that.reconnection_delay,
				);
			}
		});

		client.on("socket_connect", () => {
			if (that.reconnection_timer) {
				clearInterval(that.reconnection_timer);
				that.reconnection_timer = null;
			}
		});

		client.on("media_stream", (id_src, stream) => {
			// console.warn('Client got a stream for ' + id_src, stream);

			let panel = that.panels[id_src];
			// console.log('id_panel: '+id_src+'; panel=', panel, that.panels)
			if (!panel) {
				console.error("Panel " + id_src + "not found for stream " + stream.id);
				return;
			}

			panel.setMediaStream(stream.id);
		});

		let last_saved_name = this.loadLastRobotName();
		if (last_saved_name) {
			client.name = last_saved_name;
			$("#robot_name .label").html(client.name);
		}

		let last_client_version_info = this.loadLastRobotClientVersionInfo();
		if (last_client_version_info)
			$("#bridge-version-info").html(last_client_version_info);

		window.addEventListener("resize", (event) => {
			that.updateLayout();
		});

		let batteryStatusWrapper = (msg) => {
			that.updateBatteryStatus(msg);
		};

		let iwStatusWrapper = (msg) => {
			that.updateWifiStatus(msg);
		};

		let dockerMonitorWrapper = (msg) => {
			that.dockerMenuFromMonitorMessage(msg);
		};

		this.robot_ui_config = {};
		this.battery_topic = null;
		this.docker_monitor_topic = null;
		this.docker_control_enabled = false;
		this.subscribed_docker_monitor_topic = null;
		this.wifi_topic = null;
		this.battery_shown = this.loadLastRobotBatteryShown();
		this.introspection_control_shown = this.loadLastRobotIntrospectionControlShown();
		// display ui elements as last time to prevent them moving around too much during init
		if (this.battery_shown) {
			$("#battery-info").css("display", "block");
		}
		if (this.loadLastRobotWifiSignalShown()) {
			$("#signal-monitor").css("display", "block");
			$("#network-details").css("display", "");
		}

		this.docker_monitor_shown = this.loadLastRobotDockerMonitorShown();
		$("#docker_controls").css("display", this.docker_monitor_shown ? "" : "none");

		this.updateLayout();

		// triggered before ui_config
		client.on("input_config", (drivers, default_profiles, robot_service_buttons) => {
			console.log("Got robot service buttons", robot_service_buttons);
			that.default_service_btns = robot_service_buttons; // {} if undefined on robot
			that.servicesMenuFromNodes();
		});

		// triggered after input_config
		client.on("ui_config", (robot_ui_config) => {

			that.robot_ui_config = robot_ui_config;

			// battery optional
			if (that.battery_topic && that.battery_topic != robot_ui_config["battery_topic"]) {
				client.offTopicData(that.battery_topic, batteryStatusWrapper);
				that.battery_topic = null;
			}
			if (robot_ui_config["battery_topic"]) {
				that.battery_topic = robot_ui_config["battery_topic"];
				client.onTopicData(that.battery_topic, batteryStatusWrapper);
				console.warn("battery topic is " + that.battery_topic);
				$("#battery-info").css("display", "block");
				that.battery_shown = true;
			} else {
				$("#battery-info").css("display", "none");
				that.battery_shown = false;
			}
			that.saveLastRobotBatteryShown(that.battery_shown);

            // about popup dialog
            if (robot_ui_config['about_dialog'] || robot_ui_config['about_dialog_header']) {
				that.makeAboutPopupDialog(robot_ui_config['about_dialog_header'], robot_ui_config['about_dialog']);
            }

			// introspection control
			if (robot_ui_config["introspection_control"] !== undefined) {
				that.introspection_control_shown = robot_ui_config["introspection_control"];
				if (that.introspection_control_shown) {
					$("#introspection_state").css("display", "block");
				} else {
					$("#introspection_state").css("display", "none");
				}
				that.saveLastRobotIntrospectionControlShown(robot_ui_config["introspection_control"]);
			} else {
				// python bridge doens't send introspection_control
				that.introspection_control_shown = true;
				$("#introspection_state").css("display", "block");
				that.saveLastRobotIntrospectionControlShown(that.introspection_control_shown);
			}

			// docker control optional
			if (robot_ui_config["docker_monitor_topic"]) {
				that.docker_monitor_topic = robot_ui_config["docker_monitor_topic"];
			}
			that.docker_control_enabled = robot_ui_config["enable_docker_control"] ? true : false; 
			let old_docker_monitor_shown = that.docker_monitor_shown;
			if (that.docker_monitor_topic) {
				that.docker_monitor_shown = true;
				that.subscribed_docker_monitor_topic = that.docker_monitor_topic;
				client.onTopicData(that.subscribed_docker_monitor_topic, dockerMonitorWrapper);
			} else if (that.docker_monitor_shown) {
				that.docker_monitor_shown = false;
				if (that.subscribed_docker_monitor_topic) {
					client.offTopicData(that.subscribed_docker_monitor_topic, dockerMonitorWrapper);
				}
				that.subscribed_docker_monitor_topic = null;
			}

			if (old_docker_monitor_shown != that.docker_monitor_shown) {
				$("#docker_controls").css("display", that.docker_monitor_shown ? "" : "none");
				that.updateLayout();
				that.saveLastRobotDockerMonitorShown(that.docker_monitor_shown);
			}

			// wifi status
			let wifi_shown = false;
			if (that.wifi_topic && that.wifi_topic != robot_ui_config["wifi_monitor_topic"]) {
				client.offTopicData(that.wifi_topic, iwStatusWrapper);
				that.wifi_topic = null;
				wifi_shown = false;
			}
			if (robot_ui_config["wifi_monitor_topic"]) {
				that.wifi_topic = robot_ui_config["wifi_monitor_topic"];
				client.onTopicData(that.wifi_topic, iwStatusWrapper);
				$("#signal-monitor").css("display", "block");
				$("#network-details").css("display", "");
				wifi_shown = true;
			} else {
				$("#signal-monitor").css("display", "none");
				$("#network-details").css("display", "none !important");
				wifi_shown = false;
			}
			that.saveLastRobotWifiSignalShown(wifi_shown);

			// wifi scan & roam
			if (robot_ui_config["enable_wifi_scan"])
				this.wifi_scan_enabled = robot_ui_config["enable_wifi_scan"];
			if (robot_ui_config["enable_wifi_roam"])
				this.wifi_roam_enabled = robot_ui_config["enable_wifi_roam"];

			// collapsed services
			if (robot_ui_config["collapse_services"]) {
				this.collapse_services = robot_ui_config["collapse_services"];
				this.servicesMenuFromNodes();
			}

			if (robot_ui_config["collapse_unhandled_services"])
				this.collapse_unhandled_services = robot_ui_config["collapse_unhandled_services"];

			that.input_manager.onUIConfig();
		});

		// we must open at least one webrtc channel to establish connection,
		// so this subscribes every time
		// client.on('/iw_status', iwStatusWrapper);

		this.topics_received = null;
		this.config_received = false;
		client.on("topics", (topics) => {
			that.topics_received = topics;
			that.initPanels();
		});

		client.on("ui_config", (ui_config) => { // prefixed configs trigger before this, so at this point we should have all the configs
			that.config_received = true;
			that.initPanels();
		});

		client.on("nodes", (nodes) => {
			setTimeout(() => {
				that.servicesMenuFromNodes();
			}, 0);
			setTimeout(() => {
				that.graphFromNodes(nodes);
				that.latest_nodes = nodes;
			}, 0);
			setTimeout(() => {
				that.camerasMenuFromNodesAndDevices();
			}, 0);
		});

		client.on("cameras", (cameras) => {
			that.latest_cameras = cameras;
			that.camerasMenuFromNodesAndDevices();
		});

		client.on("docker", (containers_by_host) => {
			that.dockerMenuFromAllHosts(containers_by_host);
		});

		client.on("peer_connected", () => {
			that.updateWebrtcStatus();

			that.last_connected_time = Date.now();

			if (that.connection_uptime_timer) clearInterval(that.connection_uptime_timer);
			that.connection_uptime_timer = setInterval(() => {
				if (that.webrtc_uptime_el) {
					let ms = Date.now() - that.last_connected_time;
					that.last_connection_uptime = msToTime(ms);
					that.webrtc_uptime_el.html(that.last_connection_uptime);
				}
			}, 1000);
		});

		client.on("peer_connection_changed", () => {
			that.updateWebrtcStatus();
			if (
				that.client.pc &&
				(that.client.pc.connectionState == "new" ||
					that.client.pc.connectionState == "connecting")
			) {
				clearInterval(that.connection_uptime_timer);
				that.connection_uptime_timer = null; // stop the timer but keep the last uptime displayed
				that.webrtc_uptime_el.empty();
			}
		});

		client.on("peer_disconnected", () => {
			clearInterval(that.connection_uptime_timer);
			that.connection_uptime_timer = null; // stop the timer but keep the last uptime displayed

			$("#introspection_state")
				.addClass("inactive")
				.removeClass("active")
				.attr("title", "Run introspection...");

			that.setDotState(
				2,
				"red",
				"Robot disconnected from Bridge Server [Socket.io]",
			);
			that.updateWifiSignal(-1);
			that.updateNumPeers(-1);
			that.updateRTT(false);
			// this.updateWifiStatus();
			that.trigger_wifi_scan_el.css("display", "none");
			that.robot_wifi_info_el.empty().css("display", "none");

			that.updateWebrtcStatus();
		});

		client.on("peer_service_call_broadcast", (data) => {
			let id_service = data.service;
			let msg = data.msg;
			console.log("Got peer service call data", id_service, msg);

			if (that.service_widget_map[id_service] && that.service_widget_map[id_service].widget) {
				that.service_widget_map[id_service].widget.onValueChanged(msg);
			}
		});

		client.on("robot_peers", (peers_data) => {
			setTimeout(() => {
				that.updateNumPeers(peers_data.num_connected);
			}, 0);
		});

		// browser's Socket.io connection to the Bridge Server's server
		client.socket.on("connect", () => {
			setTimeout(() => {
				$("#socketio_status").html(
					'<span class="label">Bridge Server:</span> <span class="online">Connected [Socket.io]</span>',
				);
				that.setDotState(
					0,
					"green",
					"This client is conected to Bridge Server [Socket.io]",
				);
			}, 0);
		});

		client.socket.on("disconnect", () => {
			setTimeout(() => {
				$("#socketio_status").html(
					'<span class="label">Bridge Server:</span> <span class="offline">Disconnected [Socket.io]</span>',
				);
				that.setDotState(
					0,
					"red",
					"This client is disconnected from Bridge Server [Socket.io]",
				);
			}, 0);
		});

		client.on("peer_stats", (stats) => {
			that.last_pc_stats = stats;
			setTimeout(() => {
				that.updateAllVideoStats(stats);
				that.updateRTT(that.client.pc ? that.client.pc.connected : false);
			}, 0);
		});

		this.grid.on("added removed change", function (e, items) {
			// console.log('grid changed', items);
			if (items) {
				items.forEach(function (item) {
					let id_src = $(item.el).find(".grid_panel").attr("data-source");
					if (that.panels[id_src]) {
						that.panels[id_src].autoMenuPosition();
						// that.panels[id_src].onResize();
						// window.setTimeout(() => {
						// 	// console.warn('Delayed resize '+id_src);
						// 	if (that.panels[id_src]) that.panels[id_src].onResize();
						// }, 300); // animaiton duration
					}
				});
			}

			// must be only called on user action
			if (e.type == "change") that.updateUrlHash();
		});

		this.grid.on("resizestart resize resizestop", function (e, el) {
			let id_source = $(el).find(".grid_panel").attr("data-source");
			that.panels[id_source].onResize();
		});

		$("#introspection_state").click((ev) => {
			let is_active = $("#introspection_state").hasClass("active");

			if (is_active) {
				$("#introspection_state").removeClass("active");
				$("#introspection_state").addClass("inactive");
			} else {
				$("#introspection_state").removeClass("inactive");
				$("#introspection_state").addClass("active");
			}

			client.runIntrospection(!is_active);
		});

		$("#fullscreen-toggle").click(() => {
			if (that.fullscreen_mode) {
				that.closeFullscreen();
			} else {
				that.openFullscreen();
			}
		});

		$("#trigger_wifi_scan").click(() => {
			that.triggerWifiScan(false);
		});

		$("#trigger_wifi_roam").click(() => {
			that.triggerWifiScan(true);
		});

		$("#graph_controls").on("mouseenter", (e) => {
			if ($("#graph_controls").hasClass("hover_waiting"))
				$("#graph_controls").removeClass("hover_waiting");
		});

		// hanburger menu handlers
		$("#menubar_hamburger, #menubar_hamburger_close").click(() => {
			that.setBurgerMenuState(!that.burger_menu_open);
		});
		$("#graph_controls_heading").click(() => {
			that.burgerMenuAction("#graph_display");
		});
		$("#services_heading").click(() => {
			that.burgerMenuAction("#service_list");
		});
		$("#cameras_heading").click(() => {
			that.burgerMenuAction("#cameras_list");
		});
		$("#docker_heading").click(() => {
			that.burgerMenuAction("#docker_list");
		});
		$("#widgets_heading").click(() => {
			that.burgerMenuAction("#widget_list");
		});

		$("#fixed-header").on("mouseenter", (ev) => {
			$("BODY").addClass("menu-cancels-scroll");
		});

		$("#fixed-header").on("mouseleave", (ev) => {
			$("BODY").removeClass("menu-cancels-scroll");
		});

		function delayedDisconnectSockerTimer() {
			if (that.is_visible) return;
			console.log("Delayed disconnect");
			that.is_sleeping = true;
			that.client.disconnect();
			that.setDocumentTitle();
		}

		const onUIVisibilityChange = async () => {
			console.log("document.visibilityState: " + document.visibilityState);
			let visibility = document.visibilityState === "visible";
			if (visibility && !that.is_visible) {
				clearTimeout(that.disconnect_timer);
				that.disconnect_timer = null;
				that.client.connect();
				that.is_sleeping = false;
				that.setDocumentTitle();
			} else if (!visibility && that.is_visible && !that.run_in_background) {
				clearTimeout(that.disconnect_timer);
				that.disconnect_timer = setTimeout(
					delayedDisconnectSockerTimer,
					that.background_disconnect_delay,
				);
			}
			that.is_visible = visibility;
		};

		document.addEventListener("visibilitychange", onUIVisibilityChange);

		$(window).on("scroll touchmove", { passive: false }, (ev) => {
			if (that.panel_menu_on) {
				if (that.menu_locked_scroll) {
					ev.preventDefault();
					ev.stopPropagation();
					console.log("ignoring win scroll", ev);
					// window.scrollTo(that.menu_locked_scroll.x, that.menu_locked_scroll.y);
					return;
				}
				console.log("win scroll", ev);

				that.panelMenuTouchToggle(); //off
			}
		});

		$(window).blur((ev) => {
			console.log("Window lost focus");
			if (that.input_manager.touch_gamepad_on) {
				that.toggleTouchGamepad(); // disable touch controls
			}
			if (that.maximized_panel) {
				that.maximized_panel.maximize(false); // minimize
			}
			if (that.fullscreen_mode) {
				that.closeFullscreen(); // reset fs
			}
		});

		// window.addEventListener('touchstart', (ev) => {
		//     // ev.preventDefault();
		//     // ev.stopPropagation();
		// }, { passive: false });

		$(window).on("resize", () => {
			if (that.panel_menu_on) {
				if ($("#touch-ui-selector").hasClass("src_selection")) {
					$("#touch-ui-dialog-underlay").trigger("click");
				}
				that.panelMenuTouchToggle(); //off
			}
		});

		// prevent screen dimming on touch devices
		if (isTouchDevice()) {
			$("#touch_ui").click((ev) => {
				that.toggleTouchGamepad();
			});

			// The wake lock sentinel.
			let wakeLock = null;

			// Function that attempts to request a screen wake lock
			const requestWakeLock = async () => {
				try {
					wakeLock = await navigator.wakeLock.request();
					wakeLock.addEventListener("release", () => {
						console.log("Screen Wake Lock released:", wakeLock.released);
					});
					console.log("Screen Wake Lock released:", wakeLock.released);
				} catch (err) {
					console.error(`Screen Wake Lock ${err.name}, ${err.message}`);
				}
			};

			requestWakeLock();

			const handleVisibilityChange = async () => {
				if (wakeLock !== null && document.visibilityState === "visible") {
					await requestWakeLock();
				}
			};

			document.addEventListener("visibilitychange", handleVisibilityChange);
		}
	}

	setDocumentTitle() {
		if (!this.client.name) return;

		if (this.is_sleeping) {
			document.title = "{Zzz) " + this.client.name + " @ PHNTM Bridge";
		} else {
			document.title = this.client.name + " @ PHNTM Bridge";
		}
	}

	panelMenuAutosize(panel) {
		let l = panel.menu_el.offset().left - panel.menu_content_el.width() + 35;
		// let max_w = window.innerWidth-20; // screen offset & padding
		let w_cont = panel.menu_content_el.innerWidth(); //includes padding
		if (l < 5) {
			l = 5;
		}
		panel.menu_content_el.css("height", ""); //unset
		let h_cont = panel.menu_content_el.innerHeight(); //includes padding
		let max_h = window.innerHeight - 50 - 10; // screne offset & padding
		let scrolls = h_cont > max_h;
		let h = scrolls ? max_h : h_cont - 10; // unset on fitting
		let t = panel.menu_el.offset().top - h_cont / 2.0;
		if (panel.floating_menu_top !== null) t = panel.floating_menu_top;
		let min_top = $(window).scrollTop() + 0.0;
		let t0 = t;
		if (t < min_top) {
			t = min_top;
		} else if (t + h + 10 > $(window).scrollTop() + window.innerHeight - 10) {
			t = $(window).scrollTop() + window.innerHeight - 10 - h - 10;
		}
		// console.log('menu content='+h_cont+'; min-top='+min_top+'; scrolls='+scrolls+'; t='+t);

		panel.menu_content_el.css({
			left: l,
			top: t,
			height: scrolls ? h : "", //unset
		});
		panel.floating_menu_top = t;

		if (!scrolls)
			panel.menu_content_el.addClass("noscroll"); //stops body from scrolling through a non-scrolling menu
		else panel.menu_content_el.removeClass("noscroll");
	}

	panelMenuTouchToggle(panel) {
		if (!panel && this.panel_menu_on) {
			panel = this.panel_menu_on;
		}

		if (this.panel_menu_on && this.panel_menu_on != panel) {
			this.panelMenuTouchToggle(this.panel_menu_on); //turn off previous
		}

		if (!panel.menu_el.hasClass("open")) {
			this.panelMenuAutosize(panel);
			panel.menu_el.addClass("open");
			panel.menu_content_el.addClass("floating").appendTo("BODY");

			this.panel_menu_on = panel;
			let that = this;
			// $('BODY').addClass('no-scroll');
			$("#menu-underlay")
				.css("display", "block")
				.unbind()
				.on("click", (e) => {
					if (that.menu_blocking_element) {
						// multiselect uses this to cancel src remove on touch ui
						that.menu_blocking_element.trigger("cancel");
						return;
					}
					//console.log('overlay clicked')
					that.panelMenuTouchToggle();
				});
		} else {
			panel.menu_el.removeClass("open");
			panel.close_el.removeClass("warn");
			// $('BODY').removeClass('no-scroll');
			panel.menu_content_el
				.removeClass("floating")
				.removeClass("noscroll")
				.css({
					left: "",
					top: "",
					height: "",
				})
				.appendTo(panel.menu_el);
			this.panel_menu_on = null;

			$("#menu-underlay").css("display", "").unbind();

			panel.floating_menu_top = null;
		}
	}

	showPageError(msg_html) {
		// console.log('Showing error', msg, error);
		$("#page_message").html(msg_html).addClass("error");
		$("BODY").addClass("has-page-message");
		this.showing_page_message = true;
	}

	setBurgerMenuState(open, animate = true) {
		let that = this;

		if (this.input_manager.touch_gamepad_on) this.toggleTouchGamepad();

		if (open) {
			if (!this.burger_menu_open) {
				$("#menubar_hamburger_close").text("Close");
				this.body_scroll_was_disabled_before_burger_menu =
					$("BODY").hasClass("no-scroll");
				$("BODY").addClass("no-scroll");
				$("#modal-underlay")
					.css("display", "block")
					.unbind()
					.on("click", (e) => {
						//console.log('overlay clicked')
						that.setBurgerMenuState(false, false);
					});
			}

			this.setBurgerMenuWidth(this.small_menu_width, false); // no animation
			this.burger_menu_open = true;
			$("#menubar_content").addClass("open");

			// move in menu bg
			$("#menubar_items")
				.css({
					left: -this.small_menu_width + "px", // starting pos off screen
				})
				.stop()
				.animate(
					{
						left: "-16px" /* slide in from the left */,
					},
					200,
				);
			$("#notifications").css({ top: "60px" }).stop().animate(
				{
					top: "10px",
				},
				200,
			);
		} else {
			// back > close

			if (this.burger_menu_open_item) {
				// console.log('closing burger menu open item '+this.burger_menu_open_item);

				$("#menubar_hamburger_close").text("Close");
				$("#menubar_scrollable").removeClass("open"); // disable menu scrolling
				$("#hamburger_menu_label")
					.text("")
					.removeClass("graph_controls")
					.css("display", "none");

				let open_el = $(this.burger_menu_open_item);

				if (animate) {
					// move the opened items all the way out

					this.setBurgerMenuWidth(this.small_menu_width, true); // animates
					open_el.stop();

					// bring menu items back
					$("#menubar_items > DIV")
						.stop()
						.animate(
							{
								left: "0px",
							},
							200,
							() => {
								open_el.removeClass("hamburger-open").css({
									left: "", //unset
									top: "",
									width: "",
								});
							},
						);

					this.burger_menu_open_item = null;
					return; //next call closes
				} else {
					open_el
						.stop()
						.css({
							left: "", //unset
							top: "",
							width: "",
						})
						.removeClass("hamburger-open");
					$("#menubar_items > DIV").stop().css({
						left: "0px",
					});
					this.burger_menu_open_item = null;
				}
			}

			//console.log('closing burger menu');

			// close -> roll out to the left
			this.burger_menu_open = false;
			if (animate) {
				$("#menubar_items")
					.stop()
					.animate(
						{
							left: -this.small_menu_width + "px", //back to hidde
						},
						200,
						() => {
							$("#menubar_content").removeClass("open");
							$("#menubar_items").css({
								left: "", //unset
							});
						},
					);
				$("#notifications").stop().animate(
					{
						top: "60px",
					},
					200,
				);
			} else {
				$("#menubar_items").stop().css({
					left: "", //unset
					width: "",
				});
				$("#menubar_content").removeClass("open");
				$("#menubar_items > DIV").stop().css({
					left: "", //unset
				});
				$("#notifications").stop().css(
					{
						top: "60px",
					},
					200,
				);
			}

			if (!this.body_scroll_was_disabled_before_burger_menu) {
				$("BODY").removeClass("no-scroll");
			}

			$("#modal-underlay").css("display", "none");
		}
	}

	burgerMenuAction(what, h = null) {
		if (!$("BODY").hasClass("hamburger") || !this.burger_menu_open) return;

		let now_opening = this.burger_menu_open_item === null;
		// console.warn('Burger menu: '+what);
		this.burger_menu_open_item = what;
		// let small_menu_full_width = 255;

		$("#menubar_hamburger_close").text("Back");
		$("#menubar_scrollable").addClass("open"); // disable menu scrolling

		let el = $(what);
		let w_body = $("body").innerWidth();
		let min_cont_w = parseInt(el.data("min-width")); //?? +20; //+margin
		let max_cont_w = parseInt(el.data("max-width")); //?? +20; //+margin
		console.log(
			`setting burger menu w ${what} min_cont_w: ${min_cont_w} max_cont_w ${max_cont_w}`,
		);

		let menu_w = min_cont_w;
		if (menu_w < 1) {
			//no min
			menu_w = this.small_menu_width;
		} else {
			menu_w += 20; // add padding to min-width
		}

		if (what == "#graph_display") {
			if (menu_w > w_body - 20) {
				this.graph_menu.setNarrow(true);
				menu_w = 320; // only topics are shown on narrow screens
			} else {
				this.graph_menu.setNarrow(false);
			}
		}
		if (what == "#docker_list") {
			if (menu_w > w_body - 20) {
				el.addClass("narrow");
				// menu_w = 380; // only CPU is shown on narrow screens
			} else {
				el.removeClass("narrow");
			}
		}

		if (menu_w > w_body - 200) {
			menu_w = w_body - 40; //maximize if close to edge
		}

		if (what == "#graph_display") {
			this.graph_menu.setDimensions(menu_w, h); // h passed from updateLayout is graph height
		}

		this.setBurgerMenuWidth(menu_w);

		let el_w = menu_w - 20;
		if (what == "#cameras_list" || what == "#widget_list") el_w += 20; // these have less padding

		if (now_opening) {
			// console.log('Now opening '+what);

			// move menu items out to the left
			$("#menubar_items > DIV")
				.stop()
				.animate(
					{
						left: -(this.small_menu_width + 20) + "px",
					},
					200,
					() => {
						// finished
					},
				);

			let label = "";
			switch (what) {
				case "#graph_display":
					label =
						this.graph_menu.node_ids.length +
						" Nodes / " +
						this.graph_menu.topic_ids.length +
						" Topics";
					break;
				case "#service_list":
					label = this.num_services + " Services";
					break;
				case "#cameras_list":
					label = this.num_cameras + " Cameras";
					break;
				case "#docker_list":
					label = this.num_docker_containers + " Containers";
					break;
				case "#widget_list":
					label = this.num_widgets + " Widgets";
					break;
			}

			$("#hamburger_menu_label")
				.text(label)
				.addClass("graph_controls")
				.css("display", "block");

			let t =
				el.parent().parent().children(":visible").index(el.parent()) *
				-(15 + 15 + 21 + 1);
			t += $("#menubar_scrollable").scrollTop();
			el.css({
				width: el_w + "px", //10 is padding
				left: this.small_menu_width + 20 + "px", // top right of the parent (moving) item
				top: t + "px",
			})
				.addClass("hamburger-open")
				.stop();
			// .animate({
			//     left: this.small_menu_full_width + 'px', // compensate for moving parent menu item
			//     width: el_w +'px' //10 is padding
			// });
		} else {
			// console.log('Now updating '+what);
			el.css({
				width: el_w + "px", //10 is padding
			});
		}

		// // $('BODY').addClass('menu-overlay');
		// let w_body = screen.availWidth;
		// if (w_body > 820) {
		//     w_body = 820;
		// }

		// let h_body = screen.availHeight;
		// let that = this;
		// $('#menubar_items').animate({
		//     left: '-16px', /* left screen edge */
		//     width: (w_body-10)+'px',
		//     height: (h_body-61)+'px',
		//   }, 5100, function() {
		//     console.log('yo menubar_items!');
		//     // Animation complete.
		//   });
		// $('#menubar_items > DIV').animate({
		//     left: '-'+(small_menu_full_width)+'px',
		//   }, 5100, function() {
		//     that.hamburger_menu_full_width = true;
		//     console.log('yo menubar_items > DIV!');
		//     // Animation complete.
		//   });

		// this.menu_overlay_el = $(what);

		// this.menu_overlay_el.css({
		//     'width': (w_body-20)+'px',
		//     'left': (w_body+small_menu_full_width)+'px',
		//     'height': (h_body-76)+'px',
		//     'top': '0px',
		//     'display': 'block'
		// }).animate({
		//     left: (small_menu_full_width-5)+'px',
		//   }, 5100, function() {
		//     that.menu_overlay_el.addClass('menu-overlay');
		//     console.log('yo !');
		//     // Animation complete.
		//   });
	}

	setBurgerMenuWidth(content_width, animate = true) {
		// let requisted_min_width = min_content_width;

		// if (content_width <= this.small_menu_full_width)
		//     content_width = this.small_menu_full_width-10;
		// else {
		//     // min_content_width += 20;

		//     // let w_body = $('body').innerWidth();
		//     // if (min_content_width > w_body-200) {
		//     //     min_content_width = w_body-40; //expand to full if too close
		//     // }
		// }

		let current_w = parseInt($("#menubar_items").css("width"));
		// console.warn('set_min_burger_menu_width: '+min_width+'; current='+current_w);

		let w = content_width;

		if (current_w != w) {
			if (animate) {
				$("#menubar_items")
					.stop()
					.animate(
						{
							width: w + "px",
						},
						200,
						() => {
							// console.warn('set_min_burger_menu_width DONE');
						},
					);
			} else {
				$("#menubar_items")
					.stop()
					.css({
						width: w + "px",
					});
			}
		}

		// return content_width;
	}

	initPanels() {
		if (!this.topics_received || !this.config_received)
			return;
		let that = this;
		let topic_ids = Object.keys(this.topics_received);
		console.log('Initializing panels...');
		topic_ids.forEach((id_topic) => {
			if (!that.panels[id_topic] || that.panels[id_topic].initiated) return;
			let msg_type = this.topics_received[id_topic].msg_type;
			that.panels[id_topic].init(msg_type, false); //init w message type
		});
		let widget_ids = Object.keys(this.widgets);
		widget_ids.forEach((id_source)=>{
			if (topic_ids.indexOf(id_source) != -1)
				return; // topic already done
			if (!this.panels[id_source])
				return;
			this.panels[id_source].init(id_source, false);
		})
	}

	camerasMenuFromNodesAndDevices() {
		$("#cameras_list").empty();

		let cameras = [];

		// built in camera devices
		if (this.latest_cameras) {
			Object.values(this.latest_cameras).forEach((cam) => {
				cameras.push({
					src_id: cam.id,
					msg_type: "video",
				});
			});
		}

		// all other forwarded fast h.264 encoded topics for convenience
		if (this.latest_nodes) {
			let node_ids = Object.keys(this.latest_nodes);
			node_ids.forEach((id_node) => {
				let node = this.latest_nodes[id_node];
				if (node.publishers) {
					let topic_ids = Object.keys(node.publishers);
					topic_ids.forEach((id_topic) => {
						let msg_type = node.publishers[id_topic].msg_type;
						if (IsVideoTopic(msg_type)) {
							// all image topics minus compressed
							cameras.push({
								src_id: id_topic,
								msg_type: msg_type,
							});
						}
					});
				}
			});
		}

		this.num_cameras = cameras.length;

		$("#cameras_heading .full-w").html(cameras.length == 1 ? "Camera" : "Cameras");
		$("#cameras_heading B").html(cameras.length);

		if (cameras.length > 0) {
			$("#camera_controls").addClass("active");
		} else {
			$("#camera_controls").removeClass("active");
		}

		for (let i = 0; i < cameras.length; i++) {
			let camera = cameras[i];

			let row_el = $(
				'<label for="cb_camera_' +
					i +
					'" class="prevent-select camera" data-src="' +
					camera.src_id +
					'">' +
					camera.src_id +
					"</label>",
			);

			let cam_cb = $(
				'<input type="checkbox" class="enabled" id="cb_camera_' +
					i +
					'"' +
					(this.panels[camera.src_id] ? " checked" : "") +
					"/>",
			);

			let that = this;
			cam_cb.change((ev) => {
				// let id_cam = $(this).parent('DIV.camera').data('src');
				// let msg_type = $(this).parent('DIV.camera').data('msg-type');
				// data-src="' + camera.src_id + '" data-msg-type="' + camera.msg_type + '"
				let state = $(ev.target).prop("checked");

				let w = that.type_widgets[camera.msg_type].w;
				let h = that.type_widgets[camera.msg_type].h;

				that.togglePanel(camera.src_id, camera.msg_type, state, w, h);

				if (state && $("BODY").hasClass("hamburger")) {
					//close burger menu
					that.setBurgerMenuState(false, false);
				}
			});

			row_el.append(cam_cb);
			$("#cameras_list").append(row_el);
		}
	}

	onDockerCommandReply(req_data, reply_data) {
		if (reply_data.err) {
			reply_data._notification = {
				label: "Error (" + reply_data.err + "): " + reply_data.msg,
				style: "error",
			};
		} else {
			reply_data._notification = {
				label: reply_data.msg,
			};
		}
	}

	dockerMenuFromAllHosts(msg_by_host) {
		console.log("Got Docker containers: ", msg_by_host);
		this.docker_hosts = {}; // always redraw completely
		this.num_docker_containers = 0;
		$("#docker_list").empty();

		if (!this.docker_monitor_shown) {
			return;
		}

		let that = this;
		function callDockerSrv(node_docker_srv, id_container, state, btn) {
			if ($(btn).hasClass("working")) return;
			$(btn).addClass("working");

			that.client.serviceCall(
				node_docker_srv,
				{ id_container: id_container, set_state: state },
				true,
				that.client.default_service_timeout_sec,
				(reply) => {
					$(btn).removeClass("working");
					that.serviceReplyNotification(null, node_docker_srv, true, reply);
				},
			);
		}

		let hosts = Object.keys(msg_by_host);
		hosts.sort(); //keep sorted aphabetically
		hosts.forEach((host) => {
			let node_docker_srv = "/" + host + "/docker_command";
			that.client.registerServiceReplyCallback(
				node_docker_srv,
				(req_data, reply_data) => {
					that.onDockerCommandReply(req_data, reply_data);
				},
			);

			let grp_el = $('<div class="host-group"></div>');
			let grp_containers_el = $('<div class="host-group-containers"></div>');
			grp_containers_el.appendTo(grp_el);
			if (msg_by_host[host].header.frame_id) {
				//actual host
				grp_el.prepend($("<h4>" + msg_by_host[host].header.frame_id + "</h4>"));
			}

			let container_els = {};

			msg_by_host[host].containers.forEach((cont) => {
				let status = "";
				switch (cont.status) {
					case 0:
						status = "exited";
						break;
					case 1:
						status = "running";
						break;
					case 2:
						status = "paused";
						break;
					case 3:
						status = "restarting";
						break;
				}

				let cont_el = $(
					'<div class="docker_cont ' +
						status +
						'" id="docker_cont_' +
						cont.id +
						'"></div>',
				);
				let cont_name_el = $(
					'<span class="docker_cont_name" title="' +
						cont.name +
						'">' +
						cont.name +
						"</span>",
				);
				let cont_status_el = $(
					'<span class="docker_cont_status">[' + status + "]</span>",
				);

				let cont_vars_el = $('<span class="docker_cont_vars"></span>');
				let cont_cpu_el = $(
					'<span class="docker_cpu" title="Container CPU"></span>',
				);
				let cont_io_el = $(
					'<span class="docker_io" title="Container Block IO"></span>',
				);
				let cont_pids_el = $(
					'<span class="docker_pids" title="Container PIDs"></span>',
				);
				cont_vars_el.append([cont_cpu_el, cont_io_el, cont_pids_el]);

				cont_el.append([cont_name_el, cont_status_el, cont_vars_el]);
				
				let btns_el = $('<div class="docker_btns"></div>');
				let btn_run = $('<button class="docker_run" title="Start"></button>');
				let btn_stop = $('<button class="docker_stop" title="Stop"></button>');
				let btn_restart = $(
					'<button class="docker_restart" title="Restart"></button>',
				);
				btns_el.append([btn_run, btn_stop, btn_restart]);

				btn_run.click(function (event) {
					callDockerSrv(node_docker_srv, cont.name, 1, this);
				});
				btn_stop.click(function (event) {
					callDockerSrv(node_docker_srv, cont.name, 0, this);
				});
				btn_restart.click(function (event) {
					callDockerSrv(node_docker_srv, cont.name, 2, this);
				});

				btns_el.appendTo(cont_el);
				
				cont_el.appendTo(grp_containers_el);

				container_els[cont.id] = {
					cpu_el: cont_cpu_el,
					io_el: cont_io_el,
					pids_el: cont_pids_el,
				};

				this.num_docker_containers++;
			});

			grp_el.appendTo($("#docker_list"));

			this.docker_hosts[host] = {
				grp_el: grp_el,
				grp_containers_el: grp_containers_el,
				containers_els: container_els,
			};

			this.dockerMenuFromMonitorMessage(msg_by_host[host]); // update vals
		});

		if (this.num_docker_containers > 0) $("#docker_controls").addClass("active");
		else $("#docker_controls").removeClass("active");

		if (!that.docker_control_enabled) $("#docker_controls").addClass("control-disabled");
		else $("#docker_controls").removeClass("control-disabled");

		$("#docker_heading .full-w").html(this.num_docker_containers == 1 ? "Container" : "Containers");
		$("#docker_heading B").html(this.num_docker_containers);
	}

	dockerMenuFromMonitorMessage(msg) {
		let host = msg.header.frame_id
			? "phntm_agent_" + msg.header.frame_id
			: "phntm_agent"; // agent host

		if (!this.docker_hosts[host]) {
			return; // wait for full update via socket
		}

		msg.containers.forEach((cont) => {
			if (!this.docker_hosts[host].containers_els[cont.id]) return;
			this.docker_hosts[host].containers_els[cont.id].cpu_el.text(
				cont.cpu_percent.toFixed(1) + "%",
			);
			this.docker_hosts[host].containers_els[cont.id].io_el.text(
				formatBytes(cont.block_io_read_bytes) +
					" / " +
					formatBytes(cont.block_io_write_bytes),
			);
			this.docker_hosts[host].containers_els[cont.id].pids_el.text(cont.pids);
		});
	}

	graphFromNodes(nodes) {
		this.graph_menu.update(nodes);

		$("#graph_nodes_label B").html(this.graph_menu.node_ids.length);
		$("#graph_topics_label B").html(this.graph_menu.topic_ids.length);
		$("#hamburger_menu_label.graph_controls").html(
			this.graph_menu.node_ids.length +
				" Nodes / " +
				this.graph_menu.topic_ids.length +
				" Topics",
		); //update when open
		$("#graph_controls").addClass("active");
	}

	getMessageDefs(msg_class) {
		if (!msg_class) return null;

		let out = {};

		for (let i = 0; i < msg_class.definitions.length; i++) {
			const field = msg_class.definitions[i];

			if (field.isConstant === true) {
				// out[field.name] = 'CONSTANT';
				continue;
			}

			if (field.name === "structure_needs_at_least_one_member") {
				continue; // ignore
			}

			if (field.isComplex === true) {
				// Complex type -> new block in recursion

				if (field.isArray === true) {
					// array of complex types
					out[field.name] = [];
					let arrayLength = Math.max(field.arrayLength ?? 0, 1);
					for (let j = 0; j < arrayLength; j++) {
						let nested_class = this.client.findMessageType(field.type);
						let nested_def = this.getMessageDefs(nested_class);
						out[field.name].push(nested_def);
					}
				} else {
					// only one of complex types

					let nested_class = this.client.findMessageType(field.type);
					let nested_def = this.getMessageDefs(nested_class);
					out[field.name] = nested_def;
				}
			} else {
				// Primitive types

				if (field.isArray === true) {
					// array of primitives

					out[field.name] = [];

					let arrayLength = Math.max(field.arrayLength ?? 0, 1);
					for (let j = 0; j < arrayLength; j++) {
						out[field.name].push(field.type);
					}
				} else {
					// single primitive type

					out[field.name] = field.type;
				}
			}
		}

		return out;
	}

	messageTypeDialog(msg_type) {
		let msg_type_class = msg_type ? this.client.findMessageType(msg_type) : null;

		let content = '<span class="error">Message type not loaded</span>';
		if (msg_type_class) {
			content = JSON.stringify(this.getMessageDefs(msg_type_class), null, 4);
		} else {
			let req_class = this.client.findMessageType(msg_type + "_Request");
			let res_class = this.client.findMessageType(msg_type + "_Response");
			if (req_class || res_class) {
				content = "Request:\n";
				content += JSON.stringify(this.getMessageDefs(req_class), null, 4);

				content += "\n\nResponse:\n";
				content += JSON.stringify(this.getMessageDefs(res_class), null, 4);
			}
		}

		[ "bool", "byte", "char", "float32", "float64", "int8", "uint8", "int16", "uint16", "int32", "uint32", "int64", "uint64", "string" ].forEach((t) => {
			content = content.replaceAll(
				'"' + t + '"',
				'<span class="type">' + t + "</span>",
			);
		});

		$("#msg-type-dialog .title").html("<span>" + msg_type + "</span>");
		$("#msg-type-dialog .content").html(content);
		let body_scroll_was_disabled = $("BODY").hasClass("no-scroll");
		$("BODY").addClass("no-scroll");
		$("#msg-type-dialog").css({
			display: "block",
		});
		$("#msg-type-dialog .content").scrollTop(0).scrollLeft(0);

		if (!$("BODY").hasClass("touch-ui")) {
			$("#msg-type-dialog").draggable({
				handle: ".title",
				cursor: "move",
			});
		}

		function closeDialog() {
			$("#msg-type-dialog").css("display", "none");
			$("#msg-type-dialog-underlay").css("display", "none");
			if (!body_scroll_was_disabled) $("BODY").removeClass("no-scroll");
		}

		$("#close-msg-type-dialog")
			.unbind()
			.click((e) => {
				closeDialog();
			});
		$("#msg-type-dialog-underlay")
			.unbind()
			.css("display", "block")
			.on("click", (e) => {
				//close
				closeDialog();
			});
	}

	topicSelectorDialog(
		msg_type,
		exclude_topics,
		on_select_cb,
		on_cancel_cb = null,
		align_with_el = null,
	) {
		let body_scroll_was_disabled = $("BODY").hasClass("no-scroll");
		$("BODY").addClass("no-scroll");

		// let d = !isTouchDevice() ? $('#topic-selector-dialog') : $('#touch-ui-selector .content');
		let d = $("#touch-ui-selector .content");
		let that = this;

		let offset = align_with_el.offset();
		let w_body = $("body").innerWidth();
		d.empty();

		const render_list = (discovered_topics) => {
			d.empty();

			let all_topics = Object.keys(discovered_topics);
			let some_match = false;
			all_topics.forEach((topic) => {
				if (
					exclude_topics &&
					exclude_topics.length &&
					exclude_topics.indexOf(topic) !== -1
				)
					return;

				if (
					!that.client.discovered_topics[topic].msg_type ||
					that.client.discovered_topics[topic].msg_type != msg_type
				)
					return;

				let l = $('<a href="#" class="topic-option">' + topic + "</a>");
				l.on("click", (e) => {
					on_select_cb(topic);
					e.cancelBubble = true;
					$("#touch-ui-dialog-underlay").trigger("click"); //close
					return false;
				});
				l.appendTo(d);
				some_match = true;
			});

			if (!some_match) {
				let l = $('<span class="empty">No matching topics foud</span>');

				$("#touch-ui-selector")
					.unbind()
					.click((ev) => {
						$("#touch-ui-dialog-underlay").trigger("click");
						ev.stopPropagation();
					});
				l.appendTo(d);
			}
			let w = d.parent().outerWidth();
			console.log(
				"inner w=" + w + "; offset=" + offset.left + "; w_body=" + w_body,
			);
			if (w + offset.left + 20 > w_body) {
				$("#touch-ui-selector").css("left", w_body - w - 20);
			}
		};

		this.client.on("topics", render_list); // update on new topics

		$("#touch-ui-selector")
			.addClass("src_selection")
			.css({
				display: "block",
				left: offset.left,
				top: offset.top - $(window).scrollTop() + 30,
			});
		align_with_el.addClass("selecting");

		render_list(this.client.discovered_topics);

		$("#touch-ui-dialog-underlay")
			.css("display", "block")
			.unbind()
			.on("click", (e) => {
				//close
				$("#touch-ui-selector").unbind();
				$("#touch-ui-selector")
					.css("display", "none")
					.removeClass("src_selection");
				d.empty();
				if (!body_scroll_was_disabled) $("BODY").removeClass("no-scroll");
				that.client.off("topics", render_list);
				$("#touch-ui-dialog-underlay").unbind().css("display", "none");
				// $('#close-touch-ui-dialog').unbind();
				align_with_el.removeClass("selecting");
				if (on_cancel_cb) {
					on_cancel_cb();
				}
			});
	}

	addCustomWidget(widget_class, plugin_classes) {
		this.widgets[widget_class.name] = {
			label: widget_class.label,
			class: widget_class,
			plugin_classes: plugin_classes
		};
		this.updateWidgetsMenu();
	}

	updateWidgetsMenu() {
		$("#widget_list").empty();
		this.num_widgets = Object.keys(this.widgets).length;

		if (this.num_widgets > 0) {
			$("#widget_controls").addClass("active");
		} else {
			$("#widget_controls").removeClass("active");
		}
		//  $('#widgets_heading').html('<b>'+num_widgets+'</b> '+(num_widgets == 1 ? 'Widget' : 'Widgets'));

		let that = this;

		let i = 0;
		// let subscribe_cameras = [];
		Object.keys(this.widgets).forEach((widget_class) => {
			let widget = that.widgets[widget_class];

			let row_el = $('<label for="cb_widget_' + i + '" class="prevent-select widget">' + widget.label + "</label>");
			let w_cb = $('<input type="checkbox" class="enabled" id="cb_widget_' + i + '"' + (that.panels[widget_class] ? " checked" : "") + "/>");
			w_cb.change((ev) => {
				let state = $(ev.target).prop("checked");

				let w = that.widgets[widget_class].class.DEFAULT_WIDTH;
				let h = that.widgets[widget_class].class.DEFAULT_HEIGHT;

				that.togglePanel(widget_class, widget_class, state, w, h);
				// client.SetCameraSubscription(id_robot, [ cam ], state);

				if (state && $("BODY").hasClass("hamburger")) {
					//close burger menu
					that.setBurgerMenuState(false, false);
				}
			});

			row_el.append(w_cb);
			$("#widget_list").append(row_el);

			i++;
		});
	}

	loadServiceBtns(nodes) {
		let that = this;

		console.log('Loading service btns...');

		this.service_btns = {};
		Object.values(nodes).forEach((node) => {
			Object.keys(node.services).forEach((service) => {
				// defaults from the robot
				if (that.default_service_btns[service]) {
					that.service_btns[service] = that.default_service_btns[service];
					// console.log('Loaded '+that.service_btns[service].length+' default btns for '+service);
				}

				// overwrite w local saved (edited version untouched here)
				let stored_btns = localStorage.getItem(
					"service-btns:" + that.client.id_robot + ":" + service,
				);
				if (stored_btns) {
					that.service_btns[service] = [];
					stored_btns = JSON.parse(stored_btns); //arr
					stored_btns.forEach((one_btn) => {
						that.service_btns[service].push(one_btn);
					});
					// console.log('Loaded '+stored_btns.length+' user btns for '+service);
				}
			});
		});
	}

	saveServiceButtons(service, btns) {
		let saved_btn_data = [];

		this.service_btns[service].length = 0;

		btns.forEach((btn) => {
			let one_btn_data = {
				//clear of el refs
				label: btn.label,
				color: btn.color,
				show_request: btn.show_request,
				show_reply: btn.show_reply,
				value: JSON.parse(JSON.stringify(btn.value)),
				sort_index: btn.sort_index,
			};
			saved_btn_data.push(one_btn_data);
			this.service_btns[service].push(one_btn_data);
		});
		let json_btns = JSON.stringify(saved_btn_data);
		localStorage.setItem(
			"service-btns:" + this.client.id_robot + ":" + service,
			json_btns,
		);
		console.log("Saved " + btns.length + " btns for " + service, btns);
	}

	renderNodeServicesMenu(node, node_cont_el) {
		node_cont_el.empty();
		let that = this;

		if (!node.services || !Object.keys(node.services).length) return [];

		let node_label_el = $('<div class="node">' + node.node + "</div>");
		let prefered_services = [];
		let collapsed_services = [];
		let service_ids = Object.keys(node.services);

		for (let i = 0; i < service_ids.length; i++) {
			let id_service = service_ids[i];
			let service = node.services[id_service];
			let msg_type = node.services[id_service].msg_type;

			let msg_class = this.client.findMessageType(service.msg_type + "_Request");
			let service_short = service.service.replace("/" + node.node, "");

			let service_content = $('<div class="service ' + (msg_class ? "handled" : "nonhandled") + '" data-service="' + service.service + '" data-msg_type="' + service.msg_type +'">' +
										'<div class="service_heading" title="' + service.service + '">' + service_short + '</div>' +
									"</div>");

			let msg_type_link = $('<div class="service_input_type" id="service_input_type_' + i + '" title="' + (msg_class ? msg_type : msg_type + " unsupported message type") + '">' + msg_type + "</div>");
			msg_type_link.click(() => {
				that.messageTypeDialog(msg_type);
			});
			msg_type_link.appendTo(service_content);

			let service_input_el = $('<div class="service_input" id="service_input_' + i + '"></div>');
			this.service_btn_els[service.service] = service_input_el;

			this.renderServiceMenuControls(service, msg_class, node, node_cont_el);

			service_content.append(service_input_el);

			let has_user_defs = this.service_btns[service.service] && this.service_btns[service.service].length;
			if (!has_user_defs && ((!msg_class && this.collapse_unhandled_services) || this.collapse_services.indexOf(msg_type) > -1 || this.collapse_services.indexOf(id_service) > -1))
				collapsed_services.push(service_content);
			else prefered_services.push(service_content);
		}

		if (prefered_services.length || collapsed_services.length) {
			node_cont_el.append(node_label_el);

			if (prefered_services.length) {
				let preferred_cont = $('<div class="preferred-cont"></div>');
				for (let i = 0; i < prefered_services.length; i++)
					preferred_cont.append(prefered_services[i]);
				node_cont_el.append(preferred_cont);
			}

			if (collapsed_services.length) {
				let collapsed_cont = $('<div class="collapsed-cont"></div>');
				for (let i = 0; i < collapsed_services.length; i++)
					collapsed_cont.append(collapsed_services[i]);
				let more_label = prefered_services.length ? "Show more" : "Show services";
				let cls = !prefered_services.length ? "only-collapsed" : "";
				let handle = $('<div class="collapse-handle ' + cls + '">' + more_label + "</div>");

				handle.click(() => {
					if (!handle.hasClass("open")) {
						handle.addClass("open");
						node_cont_el.addClass("uncollapsed");
						node_label_el.addClass("open");
						handle.removeClass(cls);
						collapsed_cont.addClass("open");
						handle.text("Show less");
					} else {
						handle.removeClass("open");
						handle.addClass(cls);
						node_cont_el.removeClass("uncollapsed");
						node_label_el.removeClass("open");
						collapsed_cont.removeClass("open");
						handle.text(more_label);
					}
				});
				if (node_cont_el.hasClass("uncollapsed")) {
					handle.trigger("click");
				}
				node_cont_el.append([ collapsed_cont, handle, $('<span class="cleaner"></span>') ]);

				if (!prefered_services.length) {
					node_label_el.addClass("only-collapsed");
					let compact_handle_el = $('<span class="collapse-compact-handle">Show services</span>');
					node_label_el.append(compact_handle_el);
					compact_handle_el.click(() => {
						handle.trigger("click");
					});
				}
			} else {
				node_cont_el.removeClass("uncollapsed");
			}
		}

		return service_ids;
	}

	renderServiceMenuControls(service, msg_class, node, node_cont) {
		if (!msg_class) return;

		let id_service = service.service;

		let service_input_controls_el = this.service_btn_els[id_service];
		if (!service_input_controls_el) return;

		service_input_controls_el.empty();
		let that = this;
		if (this.service_widget_map[id_service]) {
			if (!this.service_widget_map[id_service].widget) {
				let widget_class_name = this.service_widget_map[id_service]["class_name"];
				if (this.custom_service_widgets[widget_class_name]) {
					let widget_class = this.custom_service_widgets[widget_class_name]["class"];
					this.service_widget_map[id_service].widget = new widget_class(id_service, this.client);
					
					this.service_widget_map[id_service].widget.makeElements(service_input_controls_el);
					this.service_widget_map[id_service].widget.getCurrentValue(
						(val) => { // on success
							if (that.service_widget_map[id_service] && that.service_widget_map[id_service].widget)
								that.service_widget_map[id_service].widget.updateDisplay(val);
						},
						(err) => { // on err
							console.error(err);
							if (that.service_widget_map[id_service] && that.service_widget_map[id_service].widget)
								that.service_widget_map[id_service].widget.updateDisplay(null, true);
						}
					);
				}
			} else {
				this.service_widget_map[id_service].widget.makeElements(service_input_controls_el); // render first
				this.service_widget_map[id_service].widget.getCurrentValue(
					(val) => { // on success
						if (that.service_widget_map[id_service] && that.service_widget_map[id_service].widget)
							that.service_widget_map[id_service].widget.updateDisplay(val);
					},
					(err) => { // on err
						console.error(err);
						if (that.service_widget_map[id_service] && that.service_widget_map[id_service].widget)
							that.service_widget_map[id_service].widget.updateDisplay(null, true);
					}
				);
			}
			return; //handled by custom widget
		}

		let msg_type = msg_class.name.endsWith("_Request") ? msg_class.name.replace("_Request", "") : msg_class.name;
		if (msg_class.definitions && msg_class.definitions.length == 1 && msg_class.definitions[0].name == "structure_needs_at_least_one_member") {
			// ignore https://github.com/ros2/rosidl_python/pull/73
			ServiceInput_Empty.MakeMenuControls(
				service_input_controls_el,
				service,
				this.client
			);
		} else if (this.service_widgets[msg_type] != undefined) {
			// btn by known service type
			this.service_widgets[msg_type].MakeMenuControls(
				service_input_controls_el,
				service,
				this.client
			);
		} else {
			// custom user-defined btns
			UserButtonsServiceInput.MakeMenuControls(
				service_input_controls_el,
				service,
				this.client,
				node,
				node_cont
			);
		}
	}

	clearCustomServiceWidgets(all_current_service_ids) {
		let custom_widget_service_ids = Object.keys(this.service_widget_map);
		let that = this;
		custom_widget_service_ids.forEach((id_service) => {
			if (all_current_service_ids.indexOf(id_service) === -1) {
				console.warn("Removing widget for " + id_service);
				that.service_widget_map[id_service].widget = null; // delete ref so that next time it's re-created it needs to tead fresh value
			}
		});
	}

	servicesMenuFromNodes() {
		let nodes = this.client.discovered_nodes;
		if (!Object.keys(nodes).length) return;

		if (this.collapse_services === null)
			// empty, [] when loaded
			return;

		if (this.default_service_btns === null)
			// empty, [] when loaded
			return;

		this.loadServiceBtns(nodes); // reloads all, keeping edits untouched

		$("#service_list").empty();
		this.num_services = 0;

		let nodes_sorted = Object.values(nodes).sort((a, b) => {
			return a.node.toLowerCase().localeCompare(b.node.toLowerCase());
		});

		let all_current_service_ids = [];
		nodes_sorted.forEach((node) => {
			let node_cont_el = $('<div class="node-cont"></div>');
			let node_service_ids = this.renderNodeServicesMenu(node, node_cont_el);
			node_cont_el.appendTo($("#service_list"));
			this.num_services += node_service_ids.length;
			all_current_service_ids = all_current_service_ids.concat(node_service_ids);
		});
		this.clearCustomServiceWidgets(all_current_service_ids);

		$("#services_heading .full-w").html(
			this.num_services == 1 ? "Service" : "Services",
		);
		$("#services_heading B").html(this.num_services);

		if (this.num_services > 0) {
			$("#service_controls").addClass("active");
		} else {
			$("#service_controls").removeClass("active");
		}
	}

	confirmDialog(label, css_class, confirm_label, confirm_cb, cancel_label, cancel_cb) {
		function closeDialog() {
			$("BODY").removeClass("no-scroll");
			$("#dialog-modal-confirm").css("display", "none").removeClass(css_class).empty();
			$("#dialog-modal-confirm-underlay").css("display", "none").unbind();
		}

		$("BODY").addClass("no-scroll");
		let time_shown = Date.now();
		$("#dialog-modal-confirm-underlay")
			.css("display", "block")
			.unbind()
			.click((ev) => {
				if (Date.now() < time_shown + 300) return;
				closeDialog();
				cancel_cb();
			});

		let dialog = $("<div>" + label + "</div>");
		let btns = $('<div id="dialog-modal-confirm-buttons"></div>');

		let btn_ok = $('<button class="warn">' + confirm_label + "</button>");
		btn_ok.appendTo(btns);

		let btn_cancel = $("<button>" + cancel_label + "</button>");
		btn_cancel.appendTo(btns);

		let dont_show_inp = $('<input type="checkbox" id="dont_show_again"/>');
		let dont_show_label = $('<label for="dont_show_again">Don\'t show again</label>');
		dont_show_label.prepend(dont_show_inp);
		dont_show_label.prependTo(btns);

		btn_cancel.click(() => {
			closeDialog();
			cancel_cb();
		});
		btn_ok.click(() => {
			closeDialog();
			confirm_cb(dont_show_inp.prop("checked"));
		});

		btns.appendTo(dialog);
		$("#dialog-modal-confirm")
			.empty()
			.addClass(css_class)
			.append(dialog)
			.css("display", "block");
	}

	triggerWifiScan(attempt_roam) {
		if (!this.wifi_scan_service) {
			this.showNotification("Error: Wifi scan service unknown", "error");
			console.warn("Wifi scan node/service unknown");
			return;
		}

		let that = this;
		this.client.serviceCall(
			this.wifi_scan_service,
			{ attempt_roam: attempt_roam },
			true,
			this.client.default_service_timeout_sec,
			(reply) => {
				if (reply !== undefined)
					// undefined means service call was cancelled here (by a callback)
					that.serviceReplyNotification(
						null,
						this.wifi_scan_service,
						true,
						reply,
					);
			},
		);
	}

	onWifiScanRequest(req_data, cb) {
		if (!req_data) req_data = {};
		let dropdown_btn = req_data.attempt_roam ? $("#trigger_wifi_roam") : $("#trigger_wifi_scan");
		let action_enabled = req_data.attempt_roam ? this.wifi_roam_enabled : this.wifi_scan_enabled;
		let what = req_data.attempt_roam ? "roaming" : "scanning";
		let signal_monitor = $("#signal-monitor");
		if (!action_enabled || dropdown_btn.hasClass("working") || signal_monitor.hasClass("working")) {
			if (!action_enabled) {
				this.showNotification("Wifi " + what + " disabled by robot", "error");
				console.warn("Wi-fi " + what + " disabled by the robot");
			}
			return cb(false); // abort
		}

		function setWorkingState() {
			dropdown_btn.addClass("working");
			signal_monitor.addClass("working");
		}

		let that = this;
		if (!this.wifi_scan_warning_suppressed) {
			let btn_label = req_data.attempt_roam ? "Scan &amp; Roam" : "Scan Wi-Fi";
			this.confirmDialog(
				'<span class="warn-icon"></span>Depending on your hardware setup, ' +
					'this action can leave your machine offline. See <a href="https://docs.phntm.io/bridge/wifi-scanning-and-roaming.html" target="_blank">more info here</a><br><br>' +
					"Before attempting to scan or roam, make sure you have local console access and can reboot the system if necessary.",
				"warn",
				btn_label,
				(dont_show_again) => {
					// confirm
					if (dont_show_again) {
						that.wifi_scan_warning_suppressed = true;
						localStorage.setItem(
							"wifi-scan-warning-suppressed:" + that.client.id_robot,
							true,
						); // warning won't be shown any more
					}
					setWorkingState();
					cb(true); //proceed
				},
				"Cancel",
				() => {
					// cancel
					cb(false); // abort
				},
			);
			return;
		}

		setWorkingState();
		return cb(true); //proceed
	}

	onWifiScanReply(req_data, reply_data) {
		if (!req_data) req_data = {};
		let dropdown_btn = req_data.attempt_roam ? $("#trigger_wifi_roam") : $("#trigger_wifi_scan");
		let signal_monitor = $("#signal-monitor");

		dropdown_btn.removeClass("working");
		signal_monitor.removeClass("working");

		// override the default notification by passing
		// label, detail & style in reply_data._notification

		if (reply_data.err) {
			reply_data._notification = {
				label: "Error (" + reply_data.err + "): " + reply_data.msg, style: "error"
			};
		} else if (!req_data.attempt_roam) {
			if (reply_data.scan_results && reply_data.scan_results.length) {
				let val = JSON.stringify(reply_data.scan_results, null, 4);
				let num = reply_data.scan_results.length;
				reply_data._notification = {
					label: "Wi-Fi scan returned " + num + " result" + (num != 1 ? "s" : ""),
					detail: "<pre>" + val + "</pre>",
				};
			} else {
				reply_data._notification = {
					label: "Wi-Fi scan returned no results",
					detail: "error",
				};
			}
		} else if (req_data.attempt_roam) {
			if (reply_data.scan_results && reply_data.scan_results.length) {
				let val = JSON.stringify(reply_data.scan_results, null, 4);
				let num = reply_data.scan_results.length;
				reply_data._notification = {
					label: reply.msg,
					detail: "<pre>Scan results:\n" + val + "</pre>",
				};
			} else {
				reply_data._notification = {
					label: reply.msg,
				};
			}
		}
	}

	togglePanel(id_source, msg_type, state, w, h, x = null, y = null) {
		let panel = this.panels[id_source];
		if (state) {
			if (!panel) {
				panel = new Panel(id_source, this, w, h, x, y);
				panel.init(msg_type, true);

				if (isTouchDevice()) {
					// place new in editing state
					this.grid.resizable(panel.grid_widget, true);
					this.grid.movable(panel.grid_widget, true);
					panel.editing = true;
					$(panel.grid_widget).addClass("editing");
				}
				this.updateUrlHash();
			}
		} else if (panel) {
			panel.close();
		}
	}

	makePanelFromConfig(
		id_source,
		w,
		h,
		x = null,
		y = null,
		panel_vars = {},
	) {
		if (this.panels[id_source]) return this.panels[id_source];

		//msg type unknown here
		let panel = new Panel(
			id_source,
			this,
			w, h,
			x, y,
			panel_vars,
		);
		panel.init(null, false);

		if (isTouchDevice()) {
			this.grid.resizable(panel.grid_widget, false);
			this.grid.movable(panel.grid_widget, false);
		}

		this.panels[id_source] = panel;
		return panel;
	}

	updateAllVideoStats(results) {
		let panel_ids = Object.keys(this.panels);
		let that = this;

		results.forEach((res) => {
			if (res.type != "inbound-rtp" || !res.trackIdentifier) return; // continue

			panel_ids.forEach((id_panel) => {
				let panel = that.panels[id_panel];

				if (id_panel == res.trackIdentifier) {
					let stats_string = "";
					stats_string += `${res.timestamp}<br>`;
					let fps = 0;
					Object.keys(res).forEach((k) => {
						if (k == "framesPerSecond") {
							fps = res[k];
						}
						let mark_change = false;
						if (k == "packetsLost") {
							mark_change = res[k] != panel.last_video_packets_lost;
							panel.last_video_packets_lost = res[k];
						}
						if (k == "framesDropped") {
							mark_change = res[k] != panel.last_video_frames_dropped;
							panel.last_video_frames_dropped = res[k];
						}
						if (k == "freezeCount") {
							mark_change = res[k] != panel.last_video_freeze_count;
							panel.last_video_freeze_count = res[k];
						}
						if (k !== "timestamp" && k !== "type" && k !== "id") {
							if (typeof res[k] === "object") {
								stats_string += `${k}: ${JSON.stringify(res[k])}<br>`;
							} else {
								if (mark_change) stats_string += `${k}: <span class="change">${res[k]}</span><br>`;
								else stats_string += `${k}: ${res[k]}<br>`;
							}
						}
					});

					if (panel.display_widget) {
						panel.display_widget.last_video_stats_string = stats_string;
					}

					panel.fps = fps;

					panel.updateFps();
				}
			});
		});
	}

	updateUrlHash() {
		let hash = [];

		// console.log('Hash for :', $('#grid-stack').children('.grid-stack-item'));
		let that = this;
		// console.error('Grid nodes:', this.grid.engine.nodes);

		this.grid.engine.nodes.forEach((node) => {
			
			let widget = node.el;

			let wl = null;
			if (node.grid && node.grid.engine && node.grid.engine._layouts) {
				let len = node.grid.engine._layouts.length;
				if (len && node.grid.engine.column !== len - 1) {
					let layout = node.grid.engine._layouts[len - 1];
					wl = layout.find((l) => l._id === node._id);
				}
			}

			let x, y, w, h;
			if (wl) { // prefer layout over node vals
				x = wl.x; y = wl.y;
				w = wl.w; h = node.h;
			} else {
				x = node.x; y = node.y;
				w = node.w; h = node.h;
			}

			let id_source = $(widget).find(".grid_panel").attr("data-source");

			let panel = that.panels[id_source];
			if (!panel) {
				return;
			}

			let panel_parts = [id_source, [x, y].join("x"), [w, h].join("x")];

			let vars = panel.getPanelVars();
			Object.keys(vars).forEach((var_name)=>{
				panel_parts.push(var_name + '=' + vars[var_name]);
			});

			hash.push(panel_parts.join(":"));
		});

		const max_safe_url_length = 2048; // chrome
		const hash_joined = hash.length > 0 ? hash.join(";") : "";
		const url_without_hash = window.location.href.split("#")[0];
		if (url_without_hash.length + 1 + hash_joined.length >= max_safe_url_length) {
			this.showNotification(
				"URL longer than max safe " +
					max_safe_url_length +
					" characters. Some clipping may occur",
				"error",
			);
		}

		if (hash_joined.length > 0)
			window.location.hash = hash_joined; //remove hash
		else
			history.pushState(
				"",
				document.title,
				window.location.pathname + window.location.search,
			);
	}

	panelsFromURLHash(hash) {
		if (!hash.length) {
			this.setDefaultPanels(); // don't start empty
			return;
		}

		hash = hash.substr(1);
		let hash_attrs = hash.split(";");
		let panels_to_make_sorted = [];
		let max_panel_x = 0;
		let max_panel_y = 0;
		for (let i = 0; i < hash_attrs.length; i++) {
			let hash_attr = hash_attrs[i].trim();
			if (!hash_attr) continue;
			let panel_attrs = hash_attr.split(":"); //#id_panel1:LxT:W:H:Var1=val1:Var2=val2;id_panel2:...

			let id_panel = panel_attrs[0];

			let x = null; let y = null;
			let panelPos = panel_attrs[1];
			if (panelPos) {
				panelPos = panelPos.split("x");
				x = parseInt(panelPos[0]);
				y = parseInt(panelPos[1]);
			}

			let panelSize = panel_attrs[2];
			let w = 2; let h = 2;
			if (panelSize) {
				panelSize = panelSize.split("x");
				w = parseInt(panelSize[0]);
				h = parseInt(panelSize[1]);
			}

			let panel_vars = {};
			for (let j = 3; j < panel_attrs.length; j++) {
				// if (src_vars[j] == "src") {
				// 	src_on = true;
				// } else if (src_vars[j].indexOf("z=") === 0) {
				// 	zoom = parseFloat(src_vars[j].substr(2));
				// 	console.log(
				// 		"Found zoom for " + id_source + ": " + src_vars[j] + " => ",
				// 		zoom,
				// 	);
				// } else if (src_vars[j].indexOf("r=") === 0) {
				// 	rot = parseFloat(src_vars[j].substr(2));
				// 	console.log(
				// 		"Found rot for " + id_source + ": " + src_vars[j] + " => ",
				// 		rot,
				// 	);
				// } else if (src_vars[j].indexOf("fps=") === 0) {
				// 	fps = parseInt(src_vars[j].substr(4)) == 1;
				// 	console.log(
				// 		"Found fps for " + id_source + ": " + src_vars[j] + " => ",
				// 		fps,
				// 	);
				// } else {
					
				// }
				let parts = panel_attrs[j].split("=");
				panel_vars[parts[0]] = parts[1]; // var value as string
			}

			//let msg_type = null; //unknown atm
			//console.info('Opening panel for '+topic+'; src_on='+src_on);
			max_panel_x = Math.max(max_panel_x, x);
			max_panel_y = Math.max(max_panel_y, y);
			panels_to_make_sorted.push({
				id_panel: id_panel,
				w: w, h: h,
				x: x, y: y,
				panel_vars: panel_vars,
			});
		}

		for (let y = 0; y <= max_panel_y; y++) {
			for (let x = 0; x <= max_panel_x; x++) {
				for (let j = 0; j < panels_to_make_sorted.length; j++) {
					let p = panels_to_make_sorted[j];
					if (p.x == x && p.y == y) {
						this.makePanelFromConfig(
							p.id_panel,
							p.w, p.h,
							p.x, p.y,
							p.panel_vars,
						);
						if (this.widgets[p.id_panel]) {
							this.panels[p.id_panel].init(p.id_panel, false);
						}
						break;
					}
				}
			}
		}

		this.grid.engine.sortNodes();

		this.updateWidgetsMenu();
		return this.panels;
	}

	setDefaultPanels() {
		let widget_classes = Object.keys(this.widgets);
		for (let i = 0; i < 1; i++) {
			let widget_class = widget_classes[i];
			let w = Math.round(this.grid.getColumn() * 0.7); // auto 70% with 
			let h = Math.round((window.innerHeight / this.grid.getCellHeight()) * 0.8); // auto 80% height 
			this.togglePanel(widget_class, widget_class, true, w, h);
		};
		this.updateWidgetsMenu();
	}

	updateWebrtcStatus() {
		let state = null;
		const [remote_type, remote_ip] = this.client.getPeerConnectionInfo();
		let pc = this.client.pc;
		if (pc) {
			state =
				pc.connectionState.charAt(0).toUpperCase() + pc.connectionState.slice(1);
		} else {
			state = "Offline";
		}

		let wrtc_info_lines = [
			'<span class="label">WebRTC:</span> <span id="webrtc_status"></span> <span id="webrtc_connection_uptime" title="Last connection uptime">' +
				this.last_connection_uptime +
				"</span>",
		];
		if (remote_ip && remote_ip.indexOf("redacted") === -1)
			wrtc_info_lines.push(
				'<span class="label">IP: </span> <span id="robot_ip">' +
					remote_ip +
					"</span>",
			);

		this.webrtc_info_el.html(wrtc_info_lines.join("<br>"));
		this.webrtc_status_el = $("#webrtc_status");
		this.webrtc_uptime_el = $("#webrtc_connection_uptime");

		if (state == "Connected") {
			let is_p2p = [ "host", "prflx", "srflx" ].indexOf(remote_type) > -1;
			this.webrtc_status_el.html(
				'<span class="online">' +
					state +
					"</span> " +
					(is_p2p
						? '<span class="online-p2p">[' + remote_type +' p2p]</span>'
						: '<span class="online-relay">[' + remote_type + "]</span>"),
			);
			this.trigger_wifi_scan_el.removeClass("working");
			if (is_p2p)
				this.setDotState(2, "green", "WebRTC connected to robot (p2p)");
			else
				this.setDotState(
					2,
					"yellow",
					"WebRTC connected to robot via relay (" + remote_type + ")",
				);
		} else if (state == "Connecting") {
			this.webrtc_status_el.html('<span class="connecting">' + state + "</span>");
			// $('#robot_wifi_info').addClass('offline')
			this.trigger_wifi_scan_el.removeClass("working");
			this.setDotState(2, "orange", "WebRTC connecting...");
		} else {
			this.webrtc_status_el.html('<span class="offline">' + state + "</span>");
			// $('#robot_wifi_info').addClass('offline')
			this.trigger_wifi_scan_el.removeClass("working");
			this.setDotState(2, "red", "WebRTC " + state);
		}
	}

	setDotState(dot_no, color, label) {
		this.conn_dot_els[dot_no]
			.removeClass(["green", "yellow", "orange", "red"])
			.addClass(color)
			.attr("title", label);
	}

	updateWifiSignal(percent) {
		if (percent < 0) {
			this.wifi_signal_el.attr("title", "Robot disconnected");
			this.wifi_signal_el.removeClass("working");
		} else {
			this.wifi_signal_el.attr(
				"title",
				"Robot's wi-fi signal quality: " + Math.round(percent) + "%",
			);
		}

		this.wifi_signal_el.removeClass(["q25", "q50", "q75", "q100"]);
		if (percent < 5) return;

		if (percent < 25) this.wifi_signal_el.addClass("q25");
		else if (percent < 50) this.wifi_signal_el.addClass("q50");
		else if (percent < 75) this.wifi_signal_el.addClass("q75");
		else this.wifi_signal_el.addClass("q100");
	}

	updateNumPeers(num) {
		if (num > 1) {
			// only show on more peers
			this.network_peers_el
				.html(num)
				.attr("title", "Multiple peers are connected to the robot")
				.css({
					display: "block",
					"background-color": num == 1 ? "white" : "yellow",
				});
		} else {
			this.network_peers_el.empty().css("display", "none");
		}
	}

	updateRTT(connected = true) {
		let rtt_sec = -1;

		if (connected && this.last_pc_stats) {
			// from timer

			this.last_pc_stats.forEach((report) => {
				if (report.type != "candidate-pair" || !report.nominated) return;
				Object.keys(report).forEach((statName) => {
					if (statName == "currentRoundTripTime") {
						if (rtt_sec < 0 || report[statName] < rtt_sec)
							rtt_sec = report[statName];
					}
				});
			});
		}

		if (rtt_sec > 0) {
			let rtt_ms = rtt_sec * 1000; //ms

			// TODO: customize these in config maybe?
			let rttc = "";
			if (rtt_ms > 250) rttc = "red";
			else if (rtt_ms > 50) rttc = "orange";
			else rttc = "lime";

			this.network_rtt_el.html(Math.floor(rtt_ms) + "ms").css({
				color: rttc,
				display: "block",
			});
		} else {
			this.network_rtt_el.empty().css("display", "none");
		}
	}

	setBodyClasses(enabled_classes) {
		let all_body_classes = [
			"full-width",
			"narrow",
			"narrower",
			"hamburger",
			"top-menu",
			"touch-ui",
			"desktop-ui",
			"portrait",
			"landscape",
		];
		let inactive_classes = [];

		for (let i = 0; i < all_body_classes.length; i++) {
			let c = all_body_classes[i];
			if (enabled_classes.indexOf(c) === -1) inactive_classes.push(c);
		}

		// console.log('Body removing/setting ', inactive_classes, enabled_classes);

		$("body").removeClass(inactive_classes).addClass(enabled_classes);
	}

	saveLastRobotName() {
		localStorage.setItem("last-robot-name:" + this.client.id_robot, this.client.name);
	}

	loadLastRobotName() {
		let name = localStorage.getItem("last-robot-name:" + this.client.id_robot);
		// console.log('Loaded keyboard driver for robot '+this.client.id_robot+':', dri);
		return name;
	}

	saveLastRobotIntrospectionControlShown(val) {
		localStorage.setItem("last-robot-introspection-shown:" + this.client.id_robot, val);
	}

	loadLastRobotIntrospectionControlShown() {
		let val = localStorage.getItem("last-robot-introspection-shown:" + this.client.id_robot) == "true";
		return val;
	}

	saveLastRobotBatteryShown(val) {
		localStorage.setItem("last-robot-battery-shown:" + this.client.id_robot, val);
	}

	loadLastRobotBatteryShown() {
		let val = localStorage.getItem("last-robot-battery-shown:" + this.client.id_robot) == "true";
		return val;
	}

	saveLastRobotClientVersionInfo(val) {
		localStorage.setItem("last-robot-client-version-info:" + this.client.id_robot, val);
	}

	loadLastRobotClientVersionInfo() {
		let val = localStorage.getItem("last-robot-client-version-info:" + this.client.id_robot);
		return val;
	}

	saveLastRobotDockerMonitorShown(val) {
		localStorage.setItem("last-robot-docker-monitor-shown:" + this.client.id_robot, val);
	}

	loadLastRobotDockerMonitorShown() {
		let val = localStorage.getItem("last-robot-docker-monitor-shown:" + this.client.id_robot) == "true";
		return val;
	}

	saveLastRobotWifiSignalShown(val) {
		localStorage.setItem("last-robot-wifi-shown:" + this.client.id_robot, val);
	}

	loadLastRobotWifiSignalShown() {
		let val = localStorage.getItem("last-robot-wifi-shown:" + this.client.id_robot) == "true";
		return val;
	}

    makeAboutPopupDialog(header, body) {
    
        let that = this;

        let header_el = $('<div id="about-dialog-header"></div>');
        if (header) {
			let is_html = header.indexOf('<') !== -1 && header.indexOf('>') !== -1;
			if (!is_html)
            	header_el.html('<h2>' + header + '</h2><div class="cleaner"/>');
			else
				header_el.html(header + '<div class="cleaner"/>');
            header_el.find('A').each(function(index, anchor) {
                $(anchor).on('click', (ev) => {
                    ev.preventDefault();
                    window.open($(this).attr('href'), '_blank');
                });
            });
        }

        let html_str = body;
        let content_el = $('<div id="about-dialog-content">').html(html_str);
        content_el.find('A').each(function(index, anchor) {
            $(anchor).on('click', (ev) => {
                ev.preventDefault();
                window.open($(this).attr('href'), '_blank');
            });
        });

		let btns_el = $('<div id="about-dialog-buttons"></div>');
		let remember_cb = $('<input type="checkbox" id="about-dialog-remember-close"/>');
		remember_cb.prop('checked', localStorage.getItem("about-dialog-closed:" + this.client.id_robot) == "true");
		let remember_label = $('<label for="about-dialog-remember-close" class="remember-close"><span class="long">Don\'t show this again</span><span class="short">Remember</span></label>');
		remember_label.append(remember_cb);
		let btn_close = $("<button>Close</button>");
		btn_close.click((ev) => {
			that.closeAboutDialog(remember_cb.prop('checked'));
		});
		btns_el.append([remember_label, btn_close]);

        $('#about-dialog').empty();
        if (header) {
            $('#about-dialog').append(header_el);
            $('#about-dialog').append($('<div class="cleaner"/>'));
        }
        $('#about-dialog').append([ content_el, btns_el ]);

		if (html_str) {
			$("#robot_name .label")
				.addClass("opens-about-dialog")
				.unbind()
				.click((ev) => {
					that.showAboutDialog();
					ev.stopPropagation();
				});
			if (localStorage.getItem("about-dialog-closed:" + this.client.id_robot) != "true") {
				this.showAboutDialog(true);
			}
		} else {
			$("#robot_name .label").addClass("opens-description").unbind();
		}
	}

	showAboutDialog(show_remember_checkbox=false) {

		let that = this;
		$("BODY").addClass("no-scroll");
		$('#about-dialog .remember-close').css('display', show_remember_checkbox ? 'block' : 'none');
		$("#about-dialog").css("display", "block");
		$("#dialog-modal-confirm-underlay")
			.css("display", "block")
			.click((ev) => {
				that.closeAboutDialog(false);
				ev.stopPropagation();
			});
	}

	closeAboutDialog(save) {
		if (save) {
			localStorage.setItem("about-dialog-closed:" + this.client.id_robot, "true");
		}
		$("#about-dialog").css("display", "none");
		$("#dialog-modal-confirm-underlay").css("display", "none").unbind();
		$("BODY").removeClass("no-scroll");
	}

	setMaximizedPanel(max_panel) {
		this.maximized_panel = max_panel;
		let panel_ids = Object.keys(this.panels);
		let that = this;
		panel_ids.forEach((id_panel) => {
			let p = that.panels[id_panel];
			if (p !== max_panel) {
				if (max_panel) {
					if (!p.paused) {
						p.pauseToggle();
					}
				} else {
					if (p.paused) {
						p.pauseToggle();
					}
				}
			}
		});
	}

	updateTouchGamepadIcon() {
		if (this.input_manager.touch_gamepad_on) {
			if (
				this.input_manager.controllers["touch"] &&
				this.input_manager.controllers["touch"].enabled
			) {
				$("#touch_ui").addClass("enabled").removeClass("active_disabled");
			} else {
				$("#touch_ui").removeClass("enabled").addClass("active_disabled");
			}
		} else {
			$("#touch_ui").removeClass("enabled").removeClass("active_disabled");
		}
	}

	toggleTouchGamepad() {
		if (!this.input_manager.touch_gamepad_on) {
			this.openFullscreen();

			// this.updateInputButtons();

			$("BODY").addClass("touch-gamepad");
			console.log("Touch Gamepad on");
			let that = this;
			if ($("BODY").hasClass("gamepad-editing")) {
				$("#touch-gamepad-left").appendTo($("#gamepad-touch-left-zone"));
				$("#touch-gamepad-right").appendTo($("#gamepad-touch-right-zone"));
			} else {
				$("#touch-gamepad-left").appendTo($("BODY"));
				$("#touch-gamepad-right").appendTo($("BODY"));
			}
			this.touch_gamepad = new TouchGamepad([
				{
					id: "touch-left-stick", // MANDATORY
					// type: "joystick", // Optional (Default is "joystick")
					parent: "#touch-gamepad-left", // Where to append the controller
					fixed: false, // Change position on touch-start
					position: {
						// Initial position on inside parent
						left: "50%",
						top: "60%",
					},
					onInput() {
						// triggered on angle or value change.
						that.input_manager.setTouchGamepadInput(
							"left",
							this.value,
							this.angle,
						);
					},
				},
				{
					id: "touch-right-stick", // MANDATORY
					// type: "button", // Since type is "joystick" by default
					parent: "#touch-gamepad-right",
					fixed: false,
					position: {
						// Anchor point position
						right: "50%",
						top: "60%",
					},
					onInput() {
						that.input_manager.setTouchGamepadInput(
							"right",
							this.value,
							this.angle,
						);
					},
				},
			]);

			this.input_manager.setTouchGamepadOn(true);
			if (
				this.input_manager.controllers["touch"] &&
				!this.input_manager.controllers["touch"].enabled
			) {
				this.input_manager.setControllerEnabled(
					this.input_manager.controllers["touch"],
					true,
					true,
				);
			}
			this.updateTouchGamepadIcon();
		} else {
			// if (!this.maximized_panel) {
			//     closeFullscreen();
			// }

			this.input_manager.setTouchGamepadOn(false);
			if (
				this.input_manager.controllers["touch"] &&
				this.input_manager.controllers["touch"].enabled
			) {
				this.input_manager.setControllerEnabled(
					this.input_manager.controllers["touch"],
					false,
					true,
				);
			}
			this.updateTouchGamepadIcon();

			this.touch_gamepad.destroy();
			console.log("Touch Gamepad off");
			$("BODY").removeClass("touch-gamepad");
		}
	}

	updateInputButtons() {
		if (this.introspection_control_shown) {
			$("#introspection_state").css("display", "block");
		} else {
			$("#introspection_state").css("display", "none");
		}

		let w_body = $("body").innerWidth();

		let min_only = w_body < 600 && isTouchDevice();
		let num_btns = 0;

		if (!this.input_manager.enabled) {
			$("#gamepad").css("display", "none");
			$("#touch-ui-top-buttons").css("display", "none");
			$("#touch_ui").css("display", "none");
			num_btns = 1;
		} else {
			if (!min_only) {
				$("#gamepad").css("display", "block");
				$("#touch-ui-top-buttons").css("display", "block");
				// num_btns++;
			} else {
				$("#gamepad").css("display", "none");
				$("#touch-ui-top-buttons").css("display", "none");
			}

			if (isTouchDevice()) {
				$("#touch_ui").css("display", "block");
				// num_btns++;
			} else {
				$("#touch_ui").css("display", "none");
			}

			num_btns = min_only ? 2 : isTouchDevice() ? 3 : 2;
		}

		$("#fixed-right")
			.removeClass(["btns-4", "btns-3", "btns-2", "btns-1"])
			.addClass("btns-" + num_btns);
	}

	//on resize, robot name update
	updateLayout() {
		this.service_input_dialog.updateLayout();
		this.node_params_dialog.updateLayout();

		let h_extra = 10 + 10 + 5; // 2x padding + margin right
		let menu_item_widths = {
			full: {
				graph_controls: 210,
				service_controls: 115,
				camera_controls: 95,
				docker_controls: 115,
				widget_controls: 10,
			},
			narrow: {
				graph_controls: 210,
				service_controls: 70,
				camera_controls: 60,
				docker_controls: 65,
				widget_controls: 10,
			},
			narrower: {
				graph_controls: 170,
				service_controls: 70,
				camera_controls: 60,
				docker_controls: 65,
				widget_controls: 10,
			},
		};

		let that = this;
		function sum(what) {
			let keys = Object.keys(menu_item_widths[what]);
			let res = 0;
			keys.forEach((key) => {
				if (key == "docker_controls" && !that.docker_monitor_shown) return;
				res += menu_item_widths[what][key] + h_extra;
			});
			return res;
		}

		let switch_margin = 20; // force switching to smaller variant this many px sooner
		const full_menubar_w = sum("full") + switch_margin;
		const narrow_menubar_w = sum("narrow") + switch_margin;
		const narrower_menubar_w = sum("narrower") + switch_margin;

		let w_body = $("body").innerWidth();

		this.updateInputButtons(); //changes #fixed-right
		let w_right = $("#fixed-right").innerWidth(); // right margin

		let label_el = $("h1 .label");
		label_el.removeClass("smaller");
		let w_left = $("#fixed-left").innerWidth() + 60;

		let w_battery = this.battery_shown ? 4 + 23 + 5 : 0;

		let w_netinfo = $("#network-info").innerWidth();

		let max_label_w = w_body - w_right - w_netinfo - w_battery - 50;

		label_el.css({
			"max-width": max_label_w + "px",
		});

		if (w_body < full_menubar_w + w_right + w_left) {
			label_el.addClass("smaller");
		}

		w_left = $("#fixed-left").innerWidth() + 60;

		$("#fixed-center").css({
			"margin-left": w_left + "px",
			"margin-right": w_right + "px",
		});

		let available_w_center = $("#fixed-center").innerWidth();

		let cls = [];
		let hamburger = false;

		let portrait = isPortraitMode();
		if (portrait) {
			cls.push("portrait");
			if (!$("body").hasClass("portrait") && this.input_manager.touch_gamepad_on)
				this.toggleTouchGamepad(); // off on rotate
		} else {
			cls.push("landscape");
			if (!$("body").hasClass("landscape") && this.input_manager.touch_gamepad_on)
				this.toggleTouchGamepad(); // off on rotate
		}

		let set_dimensions = null;

		if (portrait || available_w_center < narrower_menubar_w || isTouchDevice()) {
			// .narrower menubar
			cls.push("hamburger");
			hamburger = true;
			available_w_center = w_body; //uses full page width
		} else if (available_w_center < narrow_menubar_w) {
			// .narrow menubar
			cls.push("narrower");
			cls.push("top-menu");
			set_dimensions = "narrower";
		} else if (available_w_center < full_menubar_w) {
			// full menubar
			cls.push("narrow");
			cls.push("top-menu");
			set_dimensions = "narrow";
		} else {
			cls.push("full-width");
			cls.push("top-menu");
			set_dimensions = "full";
		}

		if (set_dimensions) {
			let widths = menu_item_widths[set_dimensions];
			Object.keys(widths).forEach((key) => {
				$("#" + key).css("width", widths[key] + "px");
			});
		} else {
			Object.keys(menu_item_widths["full"]).forEach((key) => {
				$("#" + key).css("width", "");
			});
		}

		if (hamburger) {
			let h = window.innerHeight; // does not work on mobils afari (adddress bar is not included)
			if (isTouchDevice() && isSafari()) {
				h = $(window).height(); // TODO: still not very good
			}
			if (this.showing_page_message) {
				h -= 50;
			}
			$("#menubar_items").css({
				height: h - 60 + "px", // bg fills screenheight
			});
			$("#menubar_scrollable").css("height", h - 74);

			let hh = h - 95;
			$("#service_list").css("height", hh);
			$("#cameras_list").css("height", hh + 10); // less padding
			$("#docker_list").css("height", hh);
			$("#widget_list").css("height", hh + 10); // less padding
			$("#graph_display").css("height", hh);

			if (this.burger_menu_open_item) {
				this.burgerMenuAction(this.burger_menu_open_item, hh); // only update
			}

			if (
				!$("BODY").hasClass("hamburger") ||
				$("#bottom-links").hasClass("hidden")
			) {
				// switched
				$("#bottom-links")
					.appendTo("#menubar_scrollable") // move to burger menu
					.removeClass("hidden");
			}

			if (h < 520) {
				$("#bottom-links").addClass("inline");
			} else {
				$("#bottom-links").removeClass("inline");
			}
		} else {
			// top menu on desktop

			if (this.burger_menu_open) {
				this.setBurgerMenuState(false, false); //no animations
			}
			$("#menubar_items").css({
				height: "", //unset
			});
			$("#menubar_scrollable").css("height", "");
			$("#graph_display").removeClass("narrow");
			$("#graph_display").css({
				height: "",
				width: "",
				left: "",
				top: "",
			}); // unset
			if (this.graph_menu) {
				// fixed desktop look
				this.graph_menu.setDimensions(805, 600); // defaults
			}

			$("#service_list").css("height", ""); //unset
			$("#cameras_list").css("height", ""); //unset
			$("#docker_list").css("height", ""); //unset
			$("#widget_list").css("height", ""); //unset

			if (
				$("BODY").hasClass("hamburger") ||
				$("#bottom-links").hasClass("hidden")
			) {
				$("#bottom-links")
					.appendTo("body") // move to body
					.css("display", "block")
					.removeClass(["inline", "hidden"]);
			}
		}

		$("BODY.touch-ui #msg-type-dialog .content").css({
			height:
				(portrait ? window.innerHeight - 160 : window.innerHeight - 90) + "px",
		});

		if (this.maximized_panel) {
			this.maximized_panel.maximize(true); //resize
		}

		if (isTouchDevice()) {
			cls.push("touch-ui");
		} else {
			cls.push("desktop-ui");
		}

		this.setBodyClasses(cls);

		$("body").addClass("initiated");

		let net_el = $("#network-info-wrapper #network-details");
		if (w_body < 600) {
			net_el.addClass("one-column").css("width", w_body - 20); //-padding
		} else {
			net_el.removeClass("one-column").css("width", ""); // unset
		}

		Object.values(this.panels).forEach((panel) => {
			panel.onResize();
		});
	}

	serviceMenuBtnCall(service, btn, btn_el) {
		let that = this;
		if (btn_el) btn_el.addClass("working");
		let show_request = btn.show_request;
		let show_reply = btn.show_reply;
		this.client.serviceCall(service, btn.value, !show_request, this.client.default_service_timeout_sec, (service_reply) => {
			that.serviceReplyNotification(btn_el, service, show_reply, service_reply);
		});
	}

	serviceButtonElementCall(service, value, btn_el, show_reply = null) { // show_reply = auto, only if err or reply data
		let that = this;
		if (btn_el) btn_el.addClass("working");
		let show_request = false;
		this.client.serviceCall(service, value, !show_request, this.client.default_service_timeout_sec, (service_reply) => {
			that.serviceReplyNotification(btn_el, service, show_reply, service_reply);
		});
	}

	serviceReplyNotification(btn_el, id_service, show_reply, service_reply) {
		let id_parts = id_service.split("/");
		let short_id = id_parts[id_parts.length - 1];

		if (btn_el) btn_el.removeClass("working");

		let is_err = false;

		if (service_reply._notification) {
			// prepared by reply callback

			if (show_reply)
				this.showNotification(
					service_reply._notification.label,
					service_reply._notification.style,
					service_reply._notification.detail,
				);

			if (service_reply._notification.style == "error") is_err = true;
		} else {
			// auto

			let err_in_resuls = false;
			if (
				service_reply &&
				service_reply.results &&
				Array.isArray(service_reply.results)
			) {
				service_reply.results.forEach((res) => {
					if (res.successful === false) {
						err_in_resuls = true;
						return;
					}
				});
			}
			if (
				service_reply &&
				service_reply.result &&
				service_reply.result.successful === false
			)
				err_in_resuls = true;

			const replacer = (key, value) => {
				// if (key == 'byte_array_value') return 'byte_array_value';

				if (key == "byte_array_value" && Array.isArray(value)) {
					let new_value = [];
					for (let i = 0; i < value.length; i++)
						if (value[i] instanceof ArrayBuffer) {
							let uint8arr = new Uint8Array(value[i]);
							new_value.push(uint8arr[0]);
						} else new_value.push(value[i]);
					return new_value;
				}
				// if (value instanceof ArrayBuffer) return '<ArrayBuffer>';
				return value;
			};

			if (service_reply && show_reply === null) {
				//auto (only show when there is something interesting in the reply)
				let reply_keys = Object.keys(service_reply);
				reply_keys = reply_keys.filter(
					(item) =>
						["success", "successful", "err", "error"].indexOf(item) === -1,
				);
				if (service_reply.message && service_reply.message.length) {
					show_reply = true;
				} else if (reply_keys.length) {
					show_reply = true;
				} else {
					show_reply = false;
				}
			}

			let message, detail;
			if (service_reply && service_reply.err) {
				// showing errors always
				message = "Service " + short_id + " returned error";
				detail = service_reply.msg;
				is_err = true;
			} else if (
				service_reply &&
				(service_reply.success === false ||
					service_reply.successful === false ||
					err_in_resuls ||
					service_reply.error)
			) {
				// showing errors always
				message = "Service " + short_id + " returned error";
				detail = JSON.stringify(service_reply, replacer, 2);
				is_err = true;
			} else if (service_reply && service_reply.success === true && show_reply) {
				//std set bool & trugger
				message = "Service " + short_id + " replied: Success";
				detail = JSON.stringify(service_reply, replacer, 2);
			} else if (show_reply) {
				message = "Service " + short_id + " replied";
				detail = JSON.stringify(service_reply, replacer, 2);
			}

			if (service_reply.message) {
				message = service_reply.message;
			}

			if (show_reply)
				this.showNotification(
					message,
					is_err ? "error" : null,
					id_service + "<br><pre>" + detail + "</pre>",
				);
		}

		if (is_err && btn_el) {
			// do the error btn wobble
			btn_el.addClass("btn_err");
			setTimeout(() => {
				btn_el.removeClass("btn_err");
			}, 600);
		}
	}

	showNotification(msg_html, css_class, detail_html = null) {
		let msg_el = $('<span class="msg' + (css_class ? " " + css_class : "") + '">' +
					       '<span class="icon"></span><span class="title">' + msg_html + '</span>' +
					   '</span>');

		$("#notifications").prepend(msg_el);

		let timer = setTimeout(() => {
			msg_el.remove();
		}, 4000); // remove after css fadeout

		msg_el.click((ev0) => {
			if (msg_el.hasClass("open")) return;
			clearTimeout(timer);
			msg_el.addClass("open");
			let closeEl = $('<span class="close" title="Close"></span>');
			closeEl.click((ev1) => {
				msg_el.remove();
			});
			let pinEl = $('<span class="pin" title="Unpin"></span>');
			pinEl.click((ev1) => {
				console.log("pin");
				let pos = msg_el.position();
				msg_el
					.css({
						width: msg_el.width(),
						height: msg_el.height(),
					})
					.addClass("unpinned")
					.draggable({
						handle: ".title",
						cursor: "move",
						snap: true,
						snapMode: "outer",
						containment: "document",
						snapTolerance: 20,
						grid: [20, 20],
					})
					.resizable({
						grid: [20, 20],
					})
					.animate(
						{
							left: pos.left + 10,
							top: pos.top + 10,
						},
						300,
					);
				// msg_el.remove();
			});
			msg_el.append([pinEl, closeEl]);

			if (detail_html) {
				msg_el.append($('<span class="detail">' + detail_html + "</span>"));
			}
		});
	}

	updateBatteryStatus(msg) {
		let topic = this.battery_topic;
		if (!topic) return;
	
		let topic_config = this.client.getTopicConfig(topic);
		if (!topic_config) return;

		let voltage_min = topic_config.min_voltage;
		let voltage_max = topic_config.max_voltage;

		if (!this.battery_samples) this.battery_samples = [];
		this.battery_samples.push(msg.voltage);
		if (this.battery_samples.length > 5) this.battery_samples.shift();
		let v_smooth = 0;
		for (let i = 0; i < this.battery_samples.length; i++)
			v_smooth += this.battery_samples[i];
		v_smooth /= this.battery_samples.length;

		let range = voltage_max - voltage_min;
		let percent = Math.round(
			Math.max(0, Math.min(100, ((v_smooth - voltage_min) / range) * 100.0)),
		);

		if (percent > 75) {
			let c = "lime";
			$("#battery-bar-0").css("background-color", c);
			$("#battery-bar-1").css("background-color", c);
			$("#battery-bar-2").css("background-color", c);
			$("#battery-bar-3").css("background-color", c);
		} else if (percent > 50) {
			let c = "cyan";
			$("#battery-bar-0").css("background-color", "transparent");
			$("#battery-bar-1").css("background-color", c);
			$("#battery-bar-2").css("background-color", c);
			$("#battery-bar-3").css("background-color", c);
		} else if (percent > 25) {
			let c = "orange";
			$("#battery-bar-0").css("background-color", "transparent");
			$("#battery-bar-1").css("background-color", "transparent");
			$("#battery-bar-2").css("background-color", c);
			$("#battery-bar-3").css("background-color", c);
		} else {
			let c = "red";
			$("#battery-bar-0").css("background-color", "transparent");
			$("#battery-bar-1").css("background-color", "transparent");
			$("#battery-bar-2").css("background-color", "transparent");
			$("#battery-bar-3").css("background-color", c);
		}

		$("#battery-info").attr("title", `Battery at ${percent}%`);
		$("#battery-details").html(
			'<span class="label">Battery:</span> <span id="battery-percent">' +
				percent +
				"%</span><br>" +
				'<span class="label">Voltage:</span> <span id="battery-voltage">' +
				msg.voltage.toFixed(2) +
				"V</span>",
		);
	}

	updateWifiStatus(msg) {
		let qPercent = (msg.quality / msg.quality_max) * 100.0;
		this.updateWifiSignal(qPercent);

		let apclass = "";
		if (this.lastAP != msg.access_point) {
			this.lastAP = msg.access_point;
			apclass = "new";
		}

		let essidclass = "";
		if (this.lastESSID != msg.essid) {
			this.lastESSID = msg.essid;
			essidclass = "new";
		}

		let html = '<div class="section-label">Connected to Wi-Fi</div>' +
				   '<span class="label space">SSID:</span> ' + msg.essid + "<br>" +
				   '<span class="label">Access Point:</span> ' + msg.access_point + "<br>" +
				   '<span class="label">Frequency:</span> ' + (msg.frequency ? msg.frequency.toFixed(3) : null) + " GHz<br>" +
				   '<span class="label">BitRate:</span> ' + (msg.bit_rate ? msg.bit_rate.toFixed(1) : null) + " Mb/s<br> " +
				   '<span class="label" title="' + msg.quality + "/" + msg.quality_max + '" style="cursor:help;">Quality:</span> ' + qPercent.toFixed(0) + "%<br> " +
				   '<span class="label">Level:</span> ' + msg.level + "<br> " +
				   '<span class="label">Noise:</span> ' + msg.noise + " ";
		$("#trigger_wifi_scan").css("display", msg.supports_scanning && this.wifi_scan_enabled ? "inline-block" : "none");
		$("#trigger_wifi_roam").css("display", msg.supports_scanning && this.wifi_roam_enabled ? "inline-block" : "none");

		if (msg.supports_scanning) {
			if (!this.wifi_scan_service) {
				let iw_node = msg.header.frame_id ? "phntm_agent_" + msg.header.frame_id : "phntm_agent";
				this.wifi_scan_service = "/" + iw_node + "/iw_scan";

				this.client.registerServiceRequestCallback(
					this.wifi_scan_service,
					(req_data, cb) => {
						this.onWifiScanRequest(req_data, cb);
					},
				);
				this.client.registerServiceReplyCallback(
					this.wifi_scan_service,
					(req_data, reply_data) => {
						this.onWifiScanReply(req_data, reply_data);
					},
				);
			}
		}

		this.updateRTT();

		this.robot_wifi_info_el.html(html).css("display", "block");
	}

	/* View in fullscreen */
	openFullscreen() {
		if (this.fullscreen_mode) return;

		/* Get the documentElement (<html>) to display the page in fullscreen */
		let elem = document.documentElement;

		try {
			if (elem.requestFullscreen) {
				elem.requestFullscreen().then(
					() => {
						console.log("Cool opening full screen");
					},
					() => {
						console.log("Err opening full screen?");
					},
				);
			} else if (elem.webkitRequestFullscreen) {
				/* Safari */
				elem.webkitRequestFullscreen();
			} else if (elem.msRequestFullscreen) {
				/* IE11 */
				elem.msRequestFullscreen();
			}
			this.fullscreen_mode = true;
			$("#fullscreen-toggle").addClass("enabled");
		} catch (e) {
			console.log("Err caught while opening full screen");
		}
	}

	/* Close fullscreen */
	closeFullscreen() {
		if (document.exitFullscreen) {
			document.exitFullscreen();
		} else if (document.webkitExitFullscreen) {
			/* Safari */
			document.webkitExitFullscreen();
		} else if (document.msExitFullscreen) {
			/* IE11 */
			document.msExitFullscreen();
		}
		this.fullscreen_mode = false;
		$("#fullscreen-toggle").removeClass("enabled");
	}
}
