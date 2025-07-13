import { isIOS, lerp, isTouchDevice } from "../inc/lib.js";
import * as THREE from "three";

export class InputManager {
	constructor(client) {
		this.client = client;
		this.client.input_manager = this;
		this.ui = null; // ui constructor assigms ref

		this.registered_drivers = {}; // id => class; all available
		this.enabled_drivers = {}; // gp_type => driver[]; enabled by robot

		this.controllers = {}; //id => ctrl
		this.edited_controller = null;

		this.robot_defaults = null; // defaults from robot

		this.profiles = null;
		this.current_profile = null;
		this.last_profile_notification = null;

		this.loop_delay = 33.3; // ms, 30Hz updates
		this.input_repeat_delay = 200; // ms between button/key triggers

		this.loop_running = false;
		this.controller_enabled_cb = $("#controller-enabled-cb");
		this.controller_enabled_cb.prop("checked", false);
		this.input_status_icon = $("#input-status-icon");
		this.debug_output_panel = $("#gamepad-output-panel");

		this.cooldown_drivers = {};
		this.topics_transmitted_last_frame = {};

		let that = this;
		this.zero2 = new THREE.Vector2(0, 0);

		this.last_touch_input = {};
		let last_robot_defaults = localStorage.getItem(
			"last-robot-input-defaults:" + this.client.id_robot,
		);
		if (last_robot_defaults != null)
			last_robot_defaults = JSON.parse(last_robot_defaults);
		this.enabled = last_robot_defaults != null;

		client.on("input_config", (drivers, defaults) => {
			that.setConfig(drivers, defaults);
		});
		client.on("services", (discovered_services) => {
			that.onServicesUpdated(discovered_services);
		});
		client.on("peer_connected", () => {
			that.unlockAllServices();
		});
		client.on("peer_disconnected", () => {
			that.unlockAllServices();
		});

		this.open = false;
		this.open_panel = "axes"; // axes, buttons, output, settings

		this.pressed_kb_keys = [];
		this.pressed_kb_mods = [];

		this.input_status_icon.click(() => {
			// if (!that.initiated)
			//     return; //wait
			$("#keyboard").removeClass("open");
			if (!$("#gamepad").hasClass("open")) {
				that.open = true;
				$("#gamepad").addClass("open");
				$("BODY").addClass("gamepad-editing");
				if (this.edited_controller && this.edited_controller.type == "touch") {
					$("#touch-gamepad-left").appendTo($("#gamepad-touch-left-zone"));
					$("#touch-gamepad-right").appendTo($("#gamepad-touch-right-zone"));
					$("#touch-gamepad-left > .Gamepad-anchor").css(
						"inset",
						"60% 50% 40% 50%",
					);
					$("#touch-gamepad-right > .Gamepad-anchor").css(
						"inset",
						"60% 50% 40% 50%",
					);
				}
				$("#input-underlay")
					.css("display", "block")
					.unbind()
					.click((ev) => {
						$(ev.target).unbind();
						that.input_status_icon.click();
					});
			} else {
				that.open = false;
				$("#gamepad").removeClass("open");
				$("BODY").removeClass("gamepad-editing");
				if (this.edited_controller && this.edited_controller.type == "touch") {
					$("#touch-gamepad-left").appendTo($("BODY"));
					$("#touch-gamepad-right").appendTo($("BODY"));
					$("#touch-gamepad-left > .Gamepad-anchor").css(
						"inset",
						"60% 50% 40% 50%",
					);
					$("#touch-gamepad-right > .Gamepad-anchor").css(
						"inset",
						"60% 50% 40% 50%",
					);
				}
				$("#input-underlay").css("display", "").unbind();
			}

			that.makeTouchButtonsEditable();
		});

		$(
			"#graph_controls, #service_controls, #camera_controls, #docker_controls, #widget_controls",
		).on("mouseenter", (ev) => {
			if (that.open) {
				console.log("hiding im");
				that.input_status_icon.click();
			}
		});

		window.addEventListener("gamepadconnected", (ev) => this.onGamepadConnected(ev));
		window.addEventListener("gamepaddisconnected", (ev) =>
			this.onGamepadDisconnected(ev),
		);

		$("#gamepad_settings .tab").click((ev) => {
			if ($(ev.target).hasClass("active")) return;
			$("#gamepad_settings .tab").removeClass("active");

			$("#gamepad_settings .panel").removeClass("active");
			let id_open_panel = "";
			let open_tab = ev.target;
			switch (ev.target.id) {
				case "gamepad-axes-tab":
					id_open_panel = "#gamepad-axes-panel";
					that.open_panel = "axes";
					break;
				case "gamepad-buttons-tab":
					id_open_panel = "#gamepad-buttons-panel";
					that.open_panel = "buttons";
					break;
				case "gamepad-output-tab":
					id_open_panel = "#gamepad-output-panel";
					that.open_panel = "output";
					break;
				case "gamepad-settings-tab":
				case "profile-unsaved-warn":
					id_open_panel = "#gamepad-settings-panel";
					open_tab = "#gamepad-settings-tab";
					that.open_panel = "settings";
					break;
				default:
					return;
			}
			$(open_tab).addClass("active");
			$(id_open_panel).addClass("active");

			that.makeTouchButtonsEditable();
		});
		$("#profile-unsaved-warn").click((ev) => {
			$("#gamepad-settings-tab").click();
		});

		this.controller_enabled_cb.change((ev) => {
			that.setControllerEnabled(
				that.edited_controller,
				$(ev.target).prop("checked"),
			);
		});

		this.editing_profile_basics = false;
		$("#profile-buttons > .icon, #profile-unsaved-warn").click((ev) => {
			if (that.editing_profile_basics) {
				that.closeProfileBasicsEdit();
				return;
			}

			if ($("#profile-buttons").hasClass("open")) {
				that.closeProfileMenu();
			} else {
				$("#profile-buttons").addClass("open");
				$("#input-manager-overlay")
					.css("display", "block")
					.unbind()
					.click((ev_u) => {
						that.closeProfileMenu();
					});
			}
		});

		$("#save-input-profile").click((ev) => {
			that.saveUserProfile(that.current_profile);
			that.closeProfileMenu();
		});

		$("#edit-input-profile").click(() => {
			that.closeProfileMenu();
			$("#gamepad-settings-container").addClass("editing_profile_basics");
			that.editing_profile_basics = true;
			$("#input-profile-edit-label")
				.val(that.profiles[that.current_profile].label)
				.unbind()
				// .on('contextmenu', that.preventContextMenu)
				.change((ev) => {
					that.profiles[that.current_profile].label = $(
						"#input-profile-edit-label",
					)
						.val()
						.trim();
					that.checkProfileBasicsSaved(that.current_profile, false);
					that.makeProfileSelectorUI();
				});
			$("#input-profile-edit-id")
				.val(that.current_profile)
				.unbind()
				// .on('contextmenu', that.preventContextMenu)
				.change((ev) => {
					let new_id = $("#input-profile-edit-id").val().trim();
					that.resetAll();
					let old_id = that.current_profile;
					if (old_id != new_id) {
						that.profiles[new_id] = that.profiles[old_id];
						that.profiles[new_id].id = new_id;
						delete that.profiles[old_id];
						that.current_profile = new_id;
						Object.values(that.controllers).forEach((c) => {
							c.profiles[new_id] = c.profiles[old_id];
							delete c.profiles[old_id];
						});
					}
					that.resetAll();
					that.checkProfileBasicsSaved(that.current_profile, false);
					that.makeUI();
				});
		});

		$("#delete-input-profile")
			.click((ev) => {
				console.log("clicked", ev.target);
				if ($("#delete-input-profile").hasClass("warn")) {
					that.deleteCurrentProfile();
					$("#delete-input-profile").removeClass("warn");
					that.closeProfileMenu();
					return;
				} else {
					$("#delete-input-profile").addClass("warn");
				}
			})
			.blur((ev) => {
				$("#delete-input-profile").removeClass("warn");
			});

		$("#duplicate-input-profile").click((ev) => {
			that.closeProfileMenu();
			that.closeProfileBasicsEdit();
			that.deleteCurrentProfile();
		});

		$("#input-profile-json").click((ev) => {
			that.profileJsonToClipboard(that.current_profile);
		});
		$("#full-input-json").click((ev) => {
			that.fullJsonToClipboard();
		});

		if (isTouchDevice()) {
			this.makeTouchGamepad();
			this.renderTouchButtons();
		}

		this.makeKeyboard();
		// this.last_keyboard_input = {};
		document.addEventListener("keydown", (ev) =>
			that.onKeyboardKeyDown(ev, that.controllers["keyboard"]),
		);
		document.addEventListener("keyup", (ev) =>
			that.onKeyboardKeyUp(ev, that.controllers["keyboard"]),
		);
		window.addEventListener("blur", (event) => {
			// reset all controllers
			// console.log('Window lost focus');
			that.resetAll();
		});

		this.makeUI();
	}

	onUIConfig() {
		if (!this.enabled) return;
		this.makeUI(); // ui config may arrive later, render again with current vals (like wifi_scan_enabled)
	}

	setConfig(enabled_drivers, robot_defaults) {
		if (!this.profiles) {
			// only once

			if (!enabled_drivers || !enabled_drivers.length) {
				// no drivers allowed => no input
				console.log("Input is disabled by the robot");
				// hide monkey and touch icon from UI
				this.enabled = false;
				localStorage.removeItem(
					"last-robot-input-defaults:" + this.client.id_robot,
				);
				this.ui.updateInputButtons();
				return;
			}

			this.enabled = true;
			localStorage.setItem(
				"last-robot-input-defaults:" + this.client.id_robot,
				JSON.stringify(robot_defaults),
			); // show icons & buttons right away next time to make the UI feel (more) solid

			this.profiles = {};

			console.info(
				`Input manager got robot config; enabled_drivers=[${enabled_drivers.join(", ")}]:`,
				robot_defaults,
			);

			this.enabled_drivers = enabled_drivers; // input_drivers array from the robot's config

			this.robot_defaults = robot_defaults; // json from the 'input_defaults' file on the robot

			this.user_defaults = {};

			//let user_defaults = {};
			//this.user_defaults = user_defaults ? JSON.parse(user_defaults) : {};

			// console.log('Loaded user input defaults: ', this.user_defaults);

			// robot defined profiles
			Object.keys(this.robot_defaults).forEach((id_profile) => {
				if (this.current_profile === null) this.current_profile = id_profile; // 1st is default
				if (!this.profiles[id_profile]) {
					let label = robot_defaults[id_profile].label
						? robot_defaults[id_profile].label
						: id_profile;
					this.profiles[id_profile] = {
						label: label,
						id: id_profile,
						id_saved: id_profile,
						label_saved: label,
						saved: true,
						basics_saved: true,
					};
				}
			});

			// overwrite with local
			this.saved_user_profiles = {};
			let saved_user_profile_ids = this.loadUserProfileIds();
			this.saved_user_profile_ids = [];
			if (saved_user_profile_ids) {
				saved_user_profile_ids.forEach((id_profile) => {
					let profile_data = this.loadUserProfile(id_profile);

					if (!profile_data) return;

					this.saved_user_profile_ids.push(id_profile);
					this.saved_user_profiles[id_profile] = profile_data;

					if (!this.profiles[id_profile]) {
						// user's own profile
						let label = this.saved_user_profiles[id_profile].label
							? this.saved_user_profiles[id_profile].label
							: id_profile;
						this.profiles[id_profile] = {
							label: label,
							saved: true,
							id_saved: id_profile,
							label_saved: label,
							saved: true,
							basics_saved: true,
						};
					} else {
						if (this.saved_user_profiles[id_profile].label) {
							this.profiles[id_profile].label =
								this.saved_user_profiles[id_profile].label;
							this.profiles[id_profile].label_saved =
								this.saved_user_profiles[id_profile].label;
						}
					}
				});
			}

			let last_user_profile = this.loadLastUserProfile();
			console.log("Loaded last input profile :", last_user_profile);

			if (last_user_profile && this.profiles[last_user_profile]) {
				this.current_profile = last_user_profile;
			}

			if (Object.keys(this.profiles).length == 0) {
				console.warn("No input profiles defined, making a new one...");
				this.current_profile = this.makeNewProfile();
			}
		} else {
			console.info(`Input manager got robot config, reload the page to update`); // ignoring input config updates
		}

		this.makeProfileSelectorUI();

		Object.values(this.controllers).forEach((c) => {
			this.initController(c);
		});

		this.ui.updateInputButtons();
	}

	showInputProfileNotification(force = false) {
		if (!this.current_profile) return;
		if (!force && Object.keys(this.profiles).length < 2) return;
		if (!force && this.current_profile == this.last_profile_notification) return;
		this.last_profile_notification = this.current_profile;
		this.ui.showNotification(
			"Input profile is " + this.profiles[this.current_profile].label,
		);
	}

	initController(c) {
		if (!this.enabled || this.robot_defaults === null)
			// wait for robot config & cookie overrides
			return;

		if (!c.profiles) {
			// only once

			c.profiles = {};

			Object.keys(this.profiles).forEach((id_profile) => {
				// robot defaults
				let profile_default_cfg = {};
				if (this.robot_defaults[id_profile]) {
					if (
						this.robot_defaults[id_profile][c.type] &&
						(c.type != "gamepad" || !c.likely_not_gamepad)
					)
						// robot defaults per type (ignoring suspicions non-gamepads on mobile devices)
						profile_default_cfg = this.robot_defaults[id_profile][c.type];
					if (this.robot_defaults[id_profile][c.id]) {
						// robot defaults per controller id
						profile_default_cfg = this.robot_defaults[id_profile][c.id];
					}
				}

				// overwrite with user's defaults
				if (
					this.saved_user_profiles[id_profile] &&
					this.saved_user_profiles[id_profile][c.id]
				) {
					let user_defaults = this.saved_user_profiles[id_profile][c.id];
					console.log(
						c.id + " loaded user defults for " + id_profile,
						user_defaults,
					);
					profile_default_cfg = user_defaults;
				}

				let driver = profile_default_cfg.driver;
				if (!driver || this.enabled_drivers.indexOf(driver) < 0) {
					driver = this.enabled_drivers[0];
					console.warn(
						"Controller profile " +
							id_profile +
							" for " +
							c.type +
							" missing driver " +
							"; falling back to" +
							driver,
					);
				}

				let c_profile = {
					driver: driver,
					default_driver_config: {},
					default_axes_config: profile_default_cfg.axes
						? profile_default_cfg.axes
						: [],
					default_buttons_config: profile_default_cfg.buttons
						? profile_default_cfg.buttons
						: [],
				};

				if (
					profile_default_cfg.driver_config &&
					driver == profile_default_cfg.driver
				) {
					//only using driver defaults if the driver matches
					c_profile.default_driver_config[driver] =
						profile_default_cfg.driver_config;
				}

				c.profiles[id_profile] = c_profile;

				this.initControllerProfile(c, c_profile);
				this.setSavedControllerProfileState(c, id_profile);
				c.profiles[id_profile].saved = true;

				// if (profile_default_cfg.default) { // default profile by robot
				//     c.current_profile = id_profile;
				// }
			});

			if (this.open) this.edited_controller = c; // autofocus latest

			this.setControllerEnabled(
				c,
				c.type == "touch" ? false : this.loadUserControllerEnabled(c.id),
				false,
			); // touch gets enabled by virtual gamepad

			console.log("Initiated profiles for gamepad " + c.id);
		}

		this.makeControllerIcons();

		if (this.edited_controller == c) {
			this.makeUI();
		}

		if (c.type == "touch") {
			this.renderTouchButtons();
		}

		if (!this.loop_running) {
			this.loop_running = true;
			requestAnimationFrame((t) => this.runInputLoop());
		}
	}

	setControllerEnabled(c, state, update_icons = true) {
		let report_change = c.enabled != state && (c.enabled !== undefined || state); // initial enabled = undefined (don't report on init, unless on)

		c.enabled = state;
		this.saveUserControllerEnabled(c);

		if (c === this.edited_controller) {
			this.controller_enabled_cb.prop("checked", c.enabled);
		}

		if (c.type == "touch") {
			if (c.enabled && !this.touch_gamepad_on) {
				this.ui.toggleTouchGamepad();
			} else {
				this.ui.updateTouchGamepadIcon();
			}
			this.renderTouchButtons();
		}

		// disable controllers producing into the same topic to avoid conflicsts
		if (state) {
			let c_ids = Object.keys(this.controllers);
			if (!c.profiles || !this.current_profile || !c.profiles[this.current_profile])
				return; // driver not loaded
			let d =
				c.profiles[this.current_profile].driver_instances[
					c.profiles[this.current_profile].driver
				];
			c_ids.forEach((cc_id) => {
				let cc = this.controllers[cc_id];
				if (cc_id == c.id) return;
				if (!cc.enabled) return;
				let dd =
					cc.profiles[this.current_profile].driver_instances[
						cc.profiles[this.current_profile].driver
					];
				if (dd.output_topic == d.output_topic) {
					this.setControllerEnabled(cc, false, false);
				}
			});
		}

		if (report_change) {
			let label = c.id;
			if (label == "touch") label = "Touch input";
			else if (label == "keyboard") label = "Keyboard";
			else label = label.split("(")[0]; // remove (Vendor: xxx)
			this.ui.showNotification(label + (state ? " enabled" : " disabled"));
			if (state) this.showInputProfileNotification();
		}

		if (update_icons) this.makeControllerIcons();
	}

	disableControllersWithConflictingDiver(active_driver) {
		let change = false;
		let c_ids = Object.keys(this.controllers);

		let c = null; // find controller by provided driver (driver has no ref)
		c_ids.forEach((cc_id) => {
			let cc = this.controllers[cc_id];
			if (!cc.enabled) return;
			if (!cc.profiles[this.current_profile]) return; // not loaded
			let d =
				cc.profiles[this.current_profile].driver_instances[
					cc.profiles[this.current_profile].driver
				];
			if (d == active_driver) {
				c = cc;
				return;
			}
		});

		if (!c) return;

		c_ids.forEach((cc_id) => {
			let cc = this.controllers[cc_id];
			if (!cc.enabled) return;
			let d =
				cc.profiles[this.current_profile].driver_instances[
					cc.profiles[this.current_profile].driver
				];
			if (d == active_driver) return;
			if (d.output_topic == active_driver.output_topic) {
				change = true;
				this.setControllerEnabled(cc, false, false);
			}
		});

		if (change) {
			this.makeControllerIcons();
		}
	}

	makeNewProfile() {
		this.resetAll(); // reset current input

		let id_new_profile = "Profile-" + Date.now();
		console.log("Making " + id_new_profile);
		this.profiles[id_new_profile] = {
			id: id_new_profile,
			label: id_new_profile,
		};
		let first_profile_created = false;
		Object.values(this.controllers).forEach((c) => {
			let initial_driver = this.enabled_drivers[0]; // must be at least one for input manager to be active
			let initial_driver_config = {};
			if (this.current_profile) {
				// copy current
				initial_driver = c.profiles[this.current_profile].driver;
				initial_driver_config = c.profiles[this.current_profile].driver_config;
			} else {
				first_profile_created = true;
			}
			let c_profile = {
				driver: initial_driver,
				default_driver_config: Object.assign({}, initial_driver_config),
				default_axes_config: [], //empty
				default_buttons_config: [], //empty
			};
			if (!c.profiles) c.profiles = {};
			c.profiles[id_new_profile] = c_profile;
			this.initControllerProfile(c, c_profile);
		});

		this.current_profile = id_new_profile;
		this.resetAll(); // new profile needs reset before triggering
		this.makeUI();
		this.renderTouchButtons();

		this.checkAllControllerProfilesSaved();

		// focus driver options first
		if (!first_profile_created) $("#gamepad_settings #gamepad-settings-tab").click();

		return id_new_profile;
	}

	// duplicate_current_profile() {

	//     this.resetAll(); // reset current input
	//     let id_new_profile = this.current_profile+'_copy_'+Date.now();
	//     let label_new_profile = this.profiles[this.current_profile].label + ' copy';

	//     console.log('Duplicating '+this.current_profile+' as '+id_new_profile);

	//     this.profiles[id_new_profile] = {
	//         id: id_new_profile,
	//         label: label_new_profile,
	//     }

	//     Object.keys(this.controllers).forEach((id_controller)=>{
	//         let c = this.controllers[id_controller];
	//         let d = c.profiles[this.current_profile].driver;
	//         let original_driver = c.profiles[this.current_profile].driver_instances[d];
	//         let original_profile_conf = {};
	//         this.get_controller_json(id_controller, this.current_profile, original_profile_conf);
	//         if (c.type == 'gamepad' && original_profile_conf['gamepad'])
	//             original_profile_conf[id_controller] = original_profile_conf['gamepad'];
	//         // let axes_config = [].concat(original_driver.axes);
	//         // axes_config.forEach((a)=>{
	//         //     a.axis = a.i;
	//         // })
	//         // let btns_config = [].concat(original_driver.buttons);
	//         // btns_config.forEach((b)=>{
	//         //     if (c.type == 'touch' || c.type == 'gamepad') {
	//         //         b.btn = b.id_src;
	//         //     } else if (c.type == 'keyboard') {
	//         //         b.key = b.id_src;
	//         //     }
	//         //     b.label = b.src_label;
	//         // });
	//         console.log('defaults for '+id_controller, original_profile_conf);
	//         let c_profile = {
	//             driver: d,
	//             default_driver_config: Object.assign({}, c.profiles[this.current_profile].default_driver_config),
	//             default_axes_config: original_profile_conf[id_controller].axes,
	//             default_buttons_config: original_profile_conf[id_controller].buttons,
	//         }
	//         console.log('c_profile', c_profile, original_profile_conf);
	//         c.profiles[id_new_profile] = c_profile;
	//         this.initControllerProfile(c, c_profile);
	//     });

	//     this.current_profile = id_new_profile;
	//     this.resetAll(); // new profile needs reset before triggering
	//     this.makeUI();
	//     this.renderTouchButtons();

	//     this.checkAllControllerProfilesSaved();

	//     // focus driver options first
	//     $('#gamepad_settings #gamepad-settings-tab').click();
	// }

	deleteCurrentProfile() {
		this.resetAll(); // stop repeats etc

		let id_delete = this.current_profile;
		let saved_id_delete = this.profiles[id_delete].id_saved;
		let old_profile_ids = Object.keys(this.profiles);
		let old_pos = old_profile_ids.indexOf(id_delete);

		console.log(
			"Deleting profile " + id_delete + " (saved id was " + saved_id_delete + ")",
		);

		if (this.saved_user_profiles[id_delete]) {
			localStorage.removeItem(
				"input-profile:" + this.client.id_robot + ":" + id_delete,
			);
			delete this.saved_user_profiles[id_delete];
		}
		let ids_pos = this.saved_user_profile_ids.indexOf(id_delete);
		if (ids_pos > -1) {
			this.saved_user_profile_ids.splice(ids_pos, 1);
		}
		this.saveUserProfileIds(this.saved_user_profile_ids);

		delete this.profiles[id_delete];
		let remaining_profile_ids = Object.keys(this.profiles);

		if (remaining_profile_ids.length == 0) {
			console.log("No profile to autoselect, making new");
			this.makeNewProfile();
		} else {
			let new_pos = old_pos;
			while (!remaining_profile_ids[new_pos] && new_pos > 0) {
				new_pos--;
			}
			let id_select = remaining_profile_ids[new_pos];

			console.log("Autoselecting " + id_select);
			this.current_profile = id_select;
			this.resetAll();
			this.makeUI();
			this.renderTouchButtons();

			this.checkAllControllerProfilesSaved();

			if (this.current_profile == this.profiles[this.current_profile].id_saved) {
				//new profile remembered when saved
				this.saveLastUserProfile(this.current_profile);
			}
		}

		this.showInputProfileNotification(true); //always
	}

	initControllerProfile(c, c_profile) {
		if (!c_profile.driver_instances) {
			c_profile.driver_instances = {};
		}

		if (!c_profile.driver_instances[c_profile.driver]) {
			if (!this.registered_drivers[c_profile.driver]) {
				return;
			}

			//init driver
			c_profile.driver_instances[c_profile.driver] = new this.registered_drivers[
				c_profile.driver
			](this);
			if (
				c_profile.default_driver_config &&
				c_profile.default_driver_config[c_profile.driver]
			) {
				c_profile.driver_instances[c_profile.driver].setConfig(
					c_profile.default_driver_config[c_profile.driver],
				);
			} else {
				c_profile.driver_instances[c_profile.driver].setConfig({}); // init writer
			}

			let driver = c_profile.driver_instances[c_profile.driver];
			let driver_axes_ids = Object.keys(driver.getAxes());

			driver.buttons = [];
			driver.axes = [];

			if (c.type == "touch") {
				for (let i_axis = 0; i_axis < 4; i_axis++) {
					let new_axis = this.makeAxis(
						c_profile,
						i_axis,
						driver_axes_ids,
						0.01,
					);
					if (new_axis) {
						driver.axes.push(new_axis);
					}
				}
				let empty_buttons_to_make = 3;
				if (
					c_profile.default_buttons_config &&
					c_profile.default_buttons_config.length
				) {
					empty_buttons_to_make = 0;
					let sort_indexes = []; // by placmenet
					for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
						let new_btn = this.makeButton(
							driver,
							c.type,
							c_profile.default_buttons_config[i],
						);
						if (new_btn.touch_ui_placement) {
							if (
								c_profile.default_buttons_config[i].sort_index !==
								undefined
							) {
								new_btn.sort_index =
									c_profile.default_buttons_config[i].sort_index;
							} else {
								if (
									sort_indexes[new_btn.touch_ui_placement] === undefined
								)
									sort_indexes[new_btn.touch_ui_placement] = 0;
								else sort_indexes[new_btn.touch_ui_placement]++;
								new_btn.sort_index =
									sort_indexes[new_btn.touch_ui_placement];
							}
						}
					}
				}
				for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) {
					//start with 3, users can add mode but space will be sometimes limitted
					let new_btn = this.makeButton(driver, c.type);
					new_btn.src_label = "Aux " + new_btn.i; // init label
				}
			} else if (c.type == "keyboard") {
				let empty_buttons_to_make = 5;
				if (
					c_profile.default_buttons_config &&
					c_profile.default_buttons_config.length
				) {
					empty_buttons_to_make = 0;
					for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
						let new_btn = this.makeButton(
							driver,
							c.type,
							c_profile.default_buttons_config[i],
						);
					}
				}
				for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) {
					// make some more
					let new_btn = this.makeButton(driver, c.type);
				}
			} else if (c.type == "gamepad") {
				for (let i_axis = 0; i_axis < c.num_gamepad_axes; i_axis++) {
					let new_axis = this.makeAxis(c_profile, i_axis, driver_axes_ids, 0.1); //default deadzone bigger than touch
					if (new_axis) {
						new_axis.needs_reset = true; //waits for 1st non-zero signals
						driver.axes.push(new_axis);
					}
				}

				let empty_buttons_to_make = 5;
				if (
					c_profile.default_buttons_config &&
					c_profile.default_buttons_config.length
				) {
					empty_buttons_to_make = 0;
					for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
						let new_btn = this.makeButton(
							driver,
							c.type,
							c_profile.default_buttons_config[i],
						);
					}
				}
				for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) {
					//start with 5, users can add more
					let new_btn = this.makeButton(driver, c.type);
				}
			}
		}
	}

	makeAxis(c_profile, i_axis, driver_axes_ids, default_dead_zone) {
		let axis_cfg = null;
		if (c_profile.default_axes_config) {
			c_profile.default_axes_config.forEach((cfg) => {
				if (
					cfg.axis === i_axis &&
					driver_axes_ids.indexOf(cfg.driver_axis) > -1
				) {
					axis_cfg = cfg;
					return;
				}
			});
		}

		let new_axis = {
			i: i_axis,
			raw: null,
			driver_axis: axis_cfg && axis_cfg.driver_axis ? axis_cfg.driver_axis : null,
			dead_min:
				axis_cfg && axis_cfg.dead_min !== undefined
					? axis_cfg.dead_min
					: -default_dead_zone,
			dead_max:
				axis_cfg && axis_cfg.dead_max !== undefined
					? axis_cfg.dead_max
					: default_dead_zone,
			offset: axis_cfg && axis_cfg.offset !== undefined ? axis_cfg.offset : 0.0,
			scale: axis_cfg && axis_cfg.scale !== undefined ? axis_cfg.scale : 1.0,
		};

		if (axis_cfg && axis_cfg.mod_func && axis_cfg.mod_func.type) {
			switch (axis_cfg.mod_func.type) {
				case "scale_by_velocity":
					new_axis.mod_func = axis_cfg.mod_func.type;
					new_axis.scale_by_velocity_src = axis_cfg.mod_func.velocity_src;
					new_axis.scale_by_velocity_mult_min =
						axis_cfg.mod_func.slow_multiplier !== undefined
							? axis_cfg.mod_func.slow_multiplier
							: 1.0;
					new_axis.scale_by_velocity_mult_max =
						axis_cfg.mod_func.fast_multiplier !== undefined
							? axis_cfg.mod_func.fast_multiplier
							: 1.0;
					break;
				default:
					break;
			}
		}

		return new_axis;
	}

	copyAxisConfig(a_src, a_dest) {
		a_dest.driver_axis = a_src.driver_axis;
		a_dest.dead_min = a_src.dead_min;
		a_dest.dead_max = a_src.dead_max;
		a_dest.offset = a_src.offset;
		a_dest.scale = a_src.scale;
		a_dest.mod_func = a_src.mod_func;
		a_dest.scale_by_velocity_src = a_src.scale_by_velocity_src;
		a_dest.scale_by_velocity_mult_min = a_src.scale_by_velocity_mult_min;
		a_dest.scale_by_velocity_mult_max = a_src.scale_by_velocity_mult_max;
	}

	switchAxesConfig(a1, a2) {
		console.log("Switching axes ", a1, a2);

		let _a1 = {};
		this.copyAxisConfig(a1, _a1);
		this.copyAxisConfig(a2, a1);
		this.copyAxisConfig(_a1, a2);
	}

	makeButton(driver, c_type, default_config = null, default_axis_dead_zone = 0.01) {
		if (driver.i_btn === undefined) driver.i_btn = -1;
		driver.i_btn++;

		let new_btn = {
			i: driver.i_btn,

			id_src: null, // btn id on gamepad, key code on kb, null on touch
			src_label: null, // hr key name on kb, button label on touch, unused on gp
			driver_btn: null, // map output as diver button
			driver_axis: null, // map output as driver axis
			action: null, // maps all other actions
			assigned: false,
			trigger: 1, // 0=touch (gp only), 1=press, 2=release
			repeat: undefined,
			touch_ui_placement: null, // 1=top, 2=bottom in touch gamepad overlay

			pressed: false,
			touched: false, // gamepad only
			raw: null,
			needs_reset: true,
		};

		if (default_config) {
			if (default_config.btn !== undefined && default_config.btn !== null) {
				//gp
				new_btn.id_src = parseInt(default_config.btn);
				new_btn.src_label = this.gamepadButtonLabel(new_btn.id_src);
			}
			if (default_config.key !== undefined && default_config.key !== null) {
				//kb
				new_btn.id_src = default_config.key.toLowerCase();
				if (default_config.key_mod !== undefined) {
					new_btn.key_mod = default_config.key_mod.toLowerCase();
				}
				new_btn.src_label = this.keyboardKeyLabel(
					new_btn.id_src,
					new_btn.key_mod,
				);
			}
			if (default_config.label) new_btn.src_label = default_config.label;
			if (default_config.driver_axis) {
				let dri_axes_ids = Object.keys(driver.getAxes());
				if (dri_axes_ids.indexOf(default_config.driver_axis) > -1) {
					new_btn.driver_axis = default_config.driver_axis;
					new_btn.assigned = true;
				}

				new_btn.dead_min =
					default_config.dead_min !== undefined
						? parseFloat(default_config.dead_min)
						: -default_axis_dead_zone;
				new_btn.dead_max =
					default_config.dead_max !== undefined
						? parseFloat(default_config.dead_max)
						: default_axis_dead_zone;
				new_btn.offset =
					default_config.offset !== undefined
						? parseFloat(default_config.offset)
						: 0.0;
				new_btn.scale =
					default_config.scale !== undefined
						? parseFloat(default_config.scale)
						: 1.0;

				if (default_config.mod_func) {
					switch (default_config.mod_func.type) {
						case "scale_by_velocity":
							new_btn.mod_func = default_config.mod_func.type;
							new_btn.scale_by_velocity_src =
								default_config.mod_func.velocity_src;
							new_btn.scale_by_velocity_mult_min =
								default_config.mod_func.slow_multiplier !== undefined
									? default_config.mod_func.slow_multiplier
									: 1.0;
							new_btn.scale_by_velocity_mult_max =
								default_config.mod_func.fast_multiplier !== undefined
									? default_config.mod_func.fast_multiplier
									: 1.0;
							break;
					}
				}
			}
			if (default_config.driver_btn) {
				new_btn.driver_btn = default_config.driver_btn;
				new_btn.assigned = true;
			}
			if (default_config.trigger) {
				switch (default_config.trigger) {
					case "touch":
						new_btn.trigger = 0;
						break;
					case "press":
						new_btn.trigger = 1;
						break;
					case "release":
						new_btn.trigger = 2;
						break;
				}
			}
			if (default_config.action) {
				switch (default_config.action) {
					case "ros-srv":
						new_btn.action = default_config.action;
						new_btn.ros_srv_id = default_config.ros_srv_id;
						new_btn.ros_srv_silent_req = default_config.ros_srv_silent_req
							? true
							: false;
						new_btn.ros_srv_silent_res = default_config.ros_srv_silent_res
							? true
							: false;
						new_btn.assigned = true;

						new_btn.ros_srv_msg_type = null;
						if (this.client.discovered_services[new_btn.ros_srv_id]) {
							new_btn.ros_srv_msg_type =
								this.client.discovered_services[
									new_btn.ros_srv_id
								].msg_type;
						} else {
							// otherwise checked on services update
							console.log(
								"ros-srv btn action missing message type, service " +
									new_btn.ros_srv_id +
									" not discovered yet?",
							);
							// this.client.runIntrospection();
						}

						if (default_config.ros_srv_val !== undefined) {
							new_btn.ros_srv_val = default_config.ros_srv_val;
						}
						break;
					case "ctrl-enabled":
						new_btn.action = default_config.action;
						new_btn.assigned = true;

						switch (default_config.ctrl_state) {
							case "on":
							case "true":
							case true:
								new_btn.set_ctrl_state = 1;
								break;
							case "off":
							case "false":
							case false:
								new_btn.set_ctrl_state = 0;
								break;
							default:
								new_btn.set_ctrl_state = 2; //toggle
								break;
						}
						break;
					case "input-profile":
						new_btn.action = default_config.action;
						new_btn.assigned = true;
						new_btn.set_ctrl_profile = default_config.profile;
						break;
				}
			}
			if (default_config.placement) {
				switch (default_config.placement) {
					case "top":
						new_btn.touch_ui_placement = 1;
						break;
					case "overlay":
					case "bottom":
						new_btn.touch_ui_placement = 2;
						break;
				}
			}
			if (default_config.style) {
				new_btn.touch_ui_style = default_config.style;
			}
			if (default_config.repeat !== undefined) {
				new_btn.repeat = default_config.repeat ? true : false;
			}

			//TODO validate something maybe?
		}

		if (c_type == "touch" && !new_btn.src_label) {
			new_btn.src_label = "Aux " + new_btn.i; // init label
		}

		driver.buttons.push(new_btn);
		return new_btn;
	}

	onServicesUpdated(discovered_services) {
		if (!this.enabled) return;

		console.log("Input Manager got services", discovered_services);
		let that = this;
		Object.values(this.controllers).forEach((c) => {
			if (!c.profiles) return;
			Object.keys(c.profiles).forEach((id_profile) => {
				let p = c.profiles[id_profile];
				Object.values(p.driver_instances).forEach((d) => {
					d.buttons.forEach((btn) => {
						if (btn.action == "ros-srv") {
							// update missing message type
							if (
								btn.ros_srv_id &&
								!btn.ros_srv_msg_type &&
								discovered_services[btn.ros_srv_id]
							) {
								btn.ros_srv_msg_type =
									discovered_services[btn.ros_srv_id].msg_type;
								console.log(
									"Message type discovered for " + btn.ros_srv_id,
								) +
									": " +
									btn.ros_srv_msg_type;
							}

							// update ros-srv btn config ui
							if (
								that.edited_controller == c &&
								that.current_profile == id_profile
							) {
								// console.log('Updating btn config ui (services changed)', btn);
								that.renderBtnConfig(d, btn);
							}
						}
					});
				});
			});
		});
	}

	resetAll() {
		let that = this;
		this.pressed_kb_keys = [];
		this.pressed_kb_mods = [];
		Object.values(this.controllers).forEach((c) => {
			if (!c.profiles || !that.current_profile) return;
			// Object.keys(c.profiles).forEach((id_profile)=>{
			let p = c.profiles[that.current_profile];
			if (!p || !p.driver_instances) return; // error, driver not loaded
			Object.values(p.driver_instances).forEach((d) => {
				d.axes.forEach((axis) => {
					axis.needs_reset = true; // (TODO: this does nothing, should we )
					axis.raw = 0.0;
				});
				d.buttons.forEach((btn) => {
					btn.pressed = false;
					btn.touched = false;
					btn.raw = 0.0;
					btn.needs_reset = true;
					clearInterval(btn.repeat_timer);
					delete btn.repeat_timer;
				});
			});
			// });
		});
	}

	getControllerProfileConfig(c, id_profile, only_assigned = false) {
		let profile = c.profiles[id_profile];
		let driver = profile.driver_instances[profile.driver];

		let data = {
			driver: profile.driver,
			driver_config: driver ? driver.getConfig() : {},
			axes: [],
			buttons: [],
		};

		if (!driver) return data;

		// axes stats => config
		for (let i = 0; i < driver.axes.length; i++) {
			if (only_assigned && !driver.axes[i].driver_axis) {
				continue;
			}
			let axis_data = {
				axis: i,
				driver_axis: driver.axes[i].driver_axis,
				dead_min: driver.axes[i].dead_min,
				dead_max: driver.axes[i].dead_max,
				offset: driver.axes[i].offset == 0.0 ? undefined : driver.axes[i].offset,
				scale: driver.axes[i].scale == 1.0 ? undefined : driver.axes[i].scale,
			};
			if (driver.axes[i].mod_func) {
				axis_data["mod_func"] = {
					type: driver.axes[i].mod_func,
					velocity_src: driver.axes[i].scale_by_velocity_src,
					slow_multiplier: driver.axes[i].scale_by_velocity_mult_min,
					fast_multiplier: driver.axes[i].scale_by_velocity_mult_max,
				};
			}
			data.axes.push(axis_data);
		}
		if (!data.axes.length) delete data.axes;

		// button states to => config
		for (let i = 0; i < driver.buttons.length; i++) {
			let btn = driver.buttons[i];
			if (only_assigned && !btn.assigned) {
				continue;
			}

			let btn_data = {
				driver_axis: btn.driver_axis ? btn.driver_axis : undefined,
				driver_btn: btn.driver_btn ? btn.driver_btn : undefined,
				action: btn.action ? btn.action : undefined,
				repeat: btn.repeat ? true : undefined,
			};

			if (c.type == "keyboard") {
				btn_data["key"] = btn.id_src;
				if (btn_data["key"]) btn_data["key"] = btn_data["key"].toUpperCase(); //saving upper case
				btn_data["key_mod"] = btn.key_mod ? btn.key_mod : undefined;
			} else if (c.type == "gamepad") {
				btn_data["btn"] = btn.id_src;
			} else if (c.type == "touch") {
				btn_data["style"] = btn.touch_ui_style ? btn.touch_ui_style : undefined;
				switch (btn.touch_ui_placement) {
					case 1:
						btn_data["placement"] = "top";
						break;
					case 2:
						btn_data["placement"] = "overlay";
						break;
				}
				btn_data["label"] = btn.src_label;
				btn_data["sort_index"] = btn.sort_index;
			}

			switch (btn.trigger) {
				case 0:
					btn_data.trigger = "touch";
					break;
				case 1:
					/* btn_data.trigger = 'press'; */ break; // press is default
				case 2:
					btn_data.trigger = "release";
					break;
			}

			if (btn.driver_axis) {
				btn_data["dead_min"] = btn.dead_min;
				btn_data["dead_max"] = btn.dead_max;
				if (btn.offset != 0.0)
					// ignore default
					btn_data["offset"] = btn.offset;
				if (btn.scale != 1.0)
					// ignore default
					btn_data["scale"] = btn.scale;

				if (btn.mod_func) {
					btn_data["mod_func"] = {
						type: btn.mod_func,
						velocity_src: btn.scale_by_velocity_src,
						slow_multiplier: btn.scale_by_velocity_mult_min,
						fast_multiplier: btn.scale_by_velocity_mult_max,
					};
				}
			}

			switch (btn.action) {
				case "ros-srv":
					btn_data["ros_srv_id"] = btn.ros_srv_id;
					btn_data["ros_srv_val"] = btn.ros_srv_val;
					btn_data["ros_srv_silent_req"] = btn.ros_srv_silent_req;
					btn_data["ros_srv_silent_res"] = btn.ros_srv_silent_res;
					break;
				case "ctrl-enabled":
					switch (btn.set_ctrl_state) {
						case 1:
							btn_data["ctrl_state"] = true;
							break;
						case 0:
							btn_data["ctrl_state"] = false;
							break;
						case 2:
							btn_data["ctrl_state"] = "toggle";
							break;
					}
					break;
				case "input-profile":
					btn_data["profile"] = btn.set_ctrl_profile;
					break;
			}

			data.buttons.push(btn_data);
		}
		if (!data.buttons.length) delete data.buttons;

		return data;
	}

	setSavedControllerProfileState(c, id_profile) {
		let c_profile = c.profiles[id_profile];
		let driver = c_profile.driver_instances[c_profile.driver];
		if (!driver) return;
		driver.setSavedState();

		let saved_data = this.getControllerProfileConfig(c, id_profile, true);
		c_profile.saved_state = saved_data;
	}

	checkProfileBasicsSaved(id_profile, update_ui = true) {
		let profile = this.profiles[id_profile];
		function compare() {
			if (id_profile != profile.id_saved) return false;
			if (profile.label != profile.label_saved) return false;
			return true;
		}
		profile.basics_saved = compare();

		if (update_ui) this.makeProfileSelectorUI();
	}

	checkControllerProfileSaved(c, id_profile, update_ui = true) {
		function compare(live, saved) {
			if (!live || !saved) return false;
			if (live.driver != saved.driver) return false;
			let driver = live.driver_instances[live.driver];
			if (!driver.checkSaved()) return false;

			if (
				(!live.axes && saved.axes) ||
				(live.axes && !saved.axes) ||
				(live.axes && saved.axes && live.axes.length != saved.axes.length)
			)
				return false;

			if (live.axes) {
				for (let i = 0; i < live.axes.length; i++) {
					if (live.axes[i].driver_axis != saved.axes[i].driver_axis)
						return false;

					if (live.axes[i].driver_axis) {
						if (live.axes[i].dead_min != saved.axes[i].dead_min) return false;
						if (live.axes[i].dead_max != saved.axes[i].dead_max) return false;
						if (live.axes[i].offset != saved.axes[i].offset) return false;
						if (live.axes[i].scale != saved.axes[i].scale) return false;

						let live_has_mod_func =
							live.axes[i].mod_func !== null &&
							live.axes[i].mod_func !== undefined;
						let saved_has_mod_func =
							saved.axes[i].mod_func !== null &&
							saved.axes[i].mod_func !== undefined;

						if (live_has_mod_func != saved_has_mod_func) {
							return false;
						} else if (live.axes[i].mod_func && saved.axes[i].mod_func) {
							if (live.axes[i].mod_func.type != saved.axes[i].mod_func.type)
								return false;
							if (
								live.axes[i].mod_func.velocity_src !=
								saved.axes[i].mod_func.velocity_src
							)
								return false;
							if (
								live.axes[i].mod_func.slow_multiplier !=
								saved.axes[i].mod_func.slow_multiplier
							)
								return false;
							if (
								live.axes[i].mod_func.fast_multiplier !=
								saved.axes[i].mod_func.fast_multiplier
							)
								return false;
						}
					}
				}
			}

			if (
				(!live.buttons && saved.buttons) ||
				(live.buttons && !saved.buttons) ||
				(live.buttons &&
					saved.buttons &&
					live.buttons.length != saved.buttons.length)
			)
				return false;

			if (live.buttons) {
				for (let i = 0; i < live.buttons.length; i++) {
					let btn_live = live.buttons[i];
					let btn_saved = saved.buttons[i];

					if (btn_live.driver_axis != btn_saved.driver_axis) return false;
					if (btn_live.driver_btn != btn_saved.driver_btn) return false;
					if (btn_live.action != btn_saved.action) return false;

					if (btn_live.driver_axis) {
						if (btn_live.dead_min != btn_saved.dead_min) return false;
						if (btn_live.dead_max != btn_saved.dead_max) return false;
						if (btn_live.offset != btn_saved.offset) return false;
						if (btn_live.scale != btn_saved.scale) return false;

						let line_has_mod_func =
							btn_live.mod_func !== null && btn_live.mod_func !== undefined;
						let saved_has_mod_func =
							btn_saved.mod_func !== null &&
							btn_saved.mod_func !== undefined;

						if (line_has_mod_func != saved_has_mod_func) {
							return false;
						}
						if (btn_live.mod_func && btn_saved.mod_func) {
							if (btn_live.mod_func.type != btn_saved.mod_func.type)
								return false;
							if (
								btn_live.mod_func.velocity_src !=
								btn_saved.mod_func.velocity_src
							)
								return false;
							if (
								btn_live.mod_func.slow_multiplier !=
								btn_saved.mod_func.slow_multiplier
							)
								return false;
							if (
								btn_live.mod_func.fast_multiplier !=
								btn_saved.mod_func.fast_multiplier
							)
								return false;
						}
					}

					if (c.type == "keyboard") {
						if (btn_live.key != btn_saved.key) return false;
						if (btn_live.key_mod != btn_saved.key_mod) return false;
					} else if (c.type == "gamepad") {
						if (btn_live.btn != btn_saved.btn) return false;
					}
					if (c.type == "touch") {
						if (btn_live.style != btn_saved.style) return false;
						if (btn_live.placement != btn_saved.placement) return false;
						if (btn_live.label != btn_saved.label) return false;
						if (btn_live.sort_index != btn_saved.sort_index) return false;
					}

					if (btn_live.trigger != btn_saved.trigger) return false;

					if (btn_live.repeat != btn_saved.repeat) return false;

					switch (btn_live.action) {
						case "ros-srv":
							if (btn_live.ros_srv_id != btn_saved.ros_srv_id) return false;
							if (
								JSON.stringify(btn_live.ros_srv_val) !=
								JSON.stringify(btn_saved.ros_srv_val)
							)
								return false;
							if (
								btn_live.ros_srv_silent_req !=
								btn_saved.ros_srv_silent_req
							)
								return false;
							if (
								btn_live.ros_srv_silent_res !=
								btn_saved.ros_srv_silent_res
							)
								return false;
							break;
						case "ctrl-enabled":
							if (btn_live.ctrl_state != btn_saved.ctrl_state) return false;
							break;
						case "input-profile":
							if (btn_live.profile != btn_saved.profile) return false;
							break;
					}
				}
			}

			return true; // all checks up
		}

		let live_c_profile_state = this.getControllerProfileConfig(c, id_profile, true); //filters unused
		live_c_profile_state.driver_instances = c.profiles[id_profile].driver_instances;
		let saved_c_profile_state = c.profiles[id_profile].saved_state; //unused filtered

		let match = compare(live_c_profile_state, saved_c_profile_state);

		// console.info(`Profile ${id_profile} saved: `, match, live_profile, saved_profile);

		if (!match && c.profiles[id_profile].saved) {
			c.profiles[id_profile].saved = false;
			this.profiles[id_profile].saved = false;
			console.log("Profile " + id_profile + " not saved");
			if (update_ui) this.makeProfileSelectorUI();
		} else if (match && !c.profiles[id_profile].saved) {
			c.profiles[id_profile].saved = true;
			if (!this.profiles[id_profile].saved) {
				let all_saved = true;
				Object.values(this.controllers).forEach((cc) => {
					if (cc == c) return;
					if (!cc.profiles[id_profile].saved) all_saved = false;
				});
				this.profiles[id_profile].saved = all_saved;
			}
			console.log(
				"Profile " + id_profile + " saved: " + this.profiles[id_profile].saved,
			);
			if (update_ui) this.makeProfileSelectorUI();
		}

		this.checkAllControllerProfilesSaved();
	}

	checkAllControllerProfilesSaved() {
		let all_saved = true;
		Object.values(this.profiles).forEach((p) => {
			if (!p.saved) all_saved = false;
		});

		if (all_saved) {
			$("#input-unsaved-warn").removeClass("unsaved");
		} else {
			$("#input-unsaved-warn").addClass("unsaved");
		}
	}

	closeProfileMenu() {
		$("#profile-buttons").removeClass("open");
		$("#input-manager-overlay").css("display", "none").unbind();
	}

	closeProfileBasicsEdit() {
		if (!this.editing_profile_basics) return;

		$("#gamepad-settings-container").removeClass("editing_profile_basics");
		this.editing_profile_basics = false;
		$("#input-profile-edit-label").unbind();
		$("#input-profile-edit-id").unbind();
		this.checkControllerProfileSaved(
			this.edited_controller,
			this.current_profile,
			true,
		);
	}

	saveLastUserProfile(id_profile) {
		localStorage.setItem("last-input-profile:" + this.client.id_robot, id_profile);
	}

	loadLastUserProfile() {
		return localStorage.getItem("last-input-profile:" + this.client.id_robot);
	}

	saveUserControllerEnabled(c) {
		localStorage.setItem(
			"controller-enabled:" + this.client.id_robot + ":" + c.id,
			c.enabled,
		);
		console.log(
			"Saved controller enabled for robot " +
				this.client.id_robot +
				', id="' +
				c.id +
				'": ' +
				c.enabled,
		);
	}

	loadUserControllerEnabled(id_controller) {
		let state = localStorage.getItem(
			"controller-enabled:" + this.client.id_robot + ":" + id_controller,
		);
		state = state === "true";
		console.log(
			"Loaded controller enabled for robot " +
				this.client.id_robot +
				', id="' +
				id_controller +
				'": ' +
				state,
		);
		return state;
	}

	loadUserProfile(id_profile) {
		let val = localStorage.getItem(
			"input-profile:" + this.client.id_robot + ":" + id_profile,
		);
		return val ? JSON.parse(val) : null;
	}

	loadUserProfileIds() {
		let val = localStorage.getItem("input-profiles:" + this.client.id_robot);
		return val ? JSON.parse(val) : null;
	}

	saveUserProfileIds(user_profiles) {
		//[ { id: 'id_profile', label: 'label'}, ... ]
		localStorage.setItem(
			"input-profiles:" + this.client.id_robot,
			JSON.stringify(user_profiles),
		);
	}

	saveUserProfile(id_profile) {
		let live_profile = this.profiles[id_profile];

		if (this.saved_user_profile_ids.indexOf(id_profile) === -1)
			this.saved_user_profile_ids.push(id_profile);

		this.saved_user_profiles[id_profile] = this.getProfileJsonData(id_profile);
		live_profile.label_saved = live_profile.label;

		Object.keys(this.controllers).forEach((c_id) => {
			let c = this.controllers[c_id];
			let c_profile = c.profiles[id_profile];
			if (c_profile) {
				this.setSavedControllerProfileState(c, id_profile);
				this.checkControllerProfileSaved(c, id_profile, false);
			}
		});

		if (live_profile.id_saved != id_profile) {
			// moving cookies on profile id change
			if (live_profile.id_saved) {
				console.warn(
					"Moving saved input profile from " +
						live_profile.id_saved +
						" => " +
						id_profile,
				);
				let old_pos = this.saved_user_profile_ids.indexOf(live_profile.id_saved);
				if (old_pos > -1) this.saved_user_profile_ids.splice(old_pos, 1);
				localStorage.removeItem(
					"input-profile:" + this.client.id_robot + ":" + live_profile.id_saved,
				);
			}
			live_profile.id_saved = id_profile;
		}

		localStorage.setItem(
			"input-profile:" + this.client.id_robot + ":" + id_profile,
			JSON.stringify(this.saved_user_profiles[id_profile]),
		);

		this.saveUserProfileIds(this.saved_user_profile_ids);

		if (id_profile == this.current_profile)
			this.saveLastUserProfile(this.current_profile); // new profile wasn't saved

		this.checkProfileBasicsSaved(id_profile, true);
	}

	getAllControllerIdsForProfile(id_profile_saved) {
		let all_controller_ids = ["keyboard", "touch", "gamepad"];
		if (this.robot_defaults && this.robot_defaults[id_profile_saved]) {
			// copy robot defaults
			Object.keys(this.robot_defaults[id_profile_saved]).forEach(
				(id_controller) => {
					if (
						all_controller_ids.indexOf(id_controller) < 0 &&
						id_controller != "label"
					)
						all_controller_ids.push(id_controller);
				},
			);
		}
		if (this.saved_user_profiles && this.saved_user_profiles[id_profile_saved]) {
			// overwrite with user setup
			Object.keys(this.saved_user_profiles[id_profile_saved]).forEach(
				(id_controller) => {
					if (id_controller == "label") return;
					if (
						all_controller_ids.indexOf(id_controller) < 0 &&
						id_controller != "label"
					)
						all_controller_ids.push(id_controller);
				},
			);
		}
		Object.keys(this.controllers).forEach((id_controller) => {
			if (all_controller_ids.indexOf(id_controller) < 0 && id_controller != "label")
				all_controller_ids.push(id_controller);
		});
		return all_controller_ids;
	}

	getProfileJsonData(id_profile) {
		let profile_data = {};

		if (this.profiles[id_profile].label)
			profile_data.label = this.profiles[id_profile].label;

		let id_profile_saved = this.profiles[id_profile].id_saved;

		let all_controller_ids = this.getAllControllerIdsForProfile(id_profile_saved);
		all_controller_ids.forEach((c_id) => {
			// pass on robot defaults
			if (
				this.robot_defaults &&
				this.robot_defaults[id_profile_saved] &&
				this.robot_defaults[id_profile_saved][c_id]
			) {
				profile_data[c_id] = Object.assign(
					{},
					this.robot_defaults[id_profile_saved][c_id],
				);
			}
			// overwrite with saved user config
			if (
				this.saved_user_profiles &&
				this.saved_user_profiles[id_profile_saved] &&
				this.saved_user_profiles[id_profile_saved][c_id]
			) {
				profile_data[c_id] = Object.assign(
					{},
					this.saved_user_profiles[id_profile_saved][c_id],
				);
			}
			// overwrite with live controller state
			if (this.controllers[c_id] && this.controllers[c_id].profiles[id_profile]) {
				profile_data[c_id] = this.getControllerProfileConfig(
					this.controllers[c_id],
					id_profile,
					true,
				); // filters assigned axes & buttons
			}
		});
		return profile_data;
	}

	profileJsonToClipboard(id_profile) {
		let profile_data = {};
		profile_data[id_profile] = this.getProfileJsonData(id_profile);
		let val = JSON.stringify(profile_data, null, 4);
		navigator.clipboard.writeText(val);
		console.log("Copied profile json:", val);
		this.closeProfileMenu();
		this.ui.showNotification("Profile JSON copied", null, "<pre>" + val + "</pre>");
	}

	fullJsonToClipboard() {
		let config_data = {};

		let that = this;
		Object.keys(this.profiles).forEach((id_profile) => {
			config_data[id_profile] = this.getProfileJsonData(id_profile);
		});

		let val = JSON.stringify(config_data, null, 4);
		navigator.clipboard.writeText(val);
		console.log("Copied full input json:", val);
		this.closeProfileMenu();
		this.ui.showNotification("Config JSON copied", null, "<pre>" + val + "</pre>");
	}

	registerDriver(id_driver, driver_class) {
		if (this.registered_drivers[id_driver]) return;

		this.registered_drivers[id_driver] = driver_class;
	}

	makeProfileSelectorUI() {
		setTimeout(() => {
			// profile selection
			let profile_opts = [];
			let that = this;

			console.log("Current profile is ", this.current_profile);

			if (!this.profiles) return;

			let profile_ids = Object.keys(this.profiles);
			for (let i = 0; i < profile_ids.length; i++) {
				let id_profile = profile_ids[i];
				let label = this.profiles[id_profile].label
					? this.profiles[id_profile].label
					: id_profile;
				if (
					!this.profiles[id_profile].saved ||
					!this.profiles[id_profile].basics_saved
				)
					label = label + " (edited)";
				profile_opts.push(
					$(
						'<option value="' +
							id_profile +
							'"' +
							(this.current_profile == id_profile ? " selected" : "") +
							">" +
							label +
							"</option>",
					),
				);
			}
			profile_opts.push($('<option value="+">New profile...</option>'));
			$("#input-profile-select")
				.empty()
				.attr({
					disabled: false,
					autocomplete: "off",
				})
				.removeClass("loading")
				.append(profile_opts);

			$("#input-profile-select")
				.unbind()
				.change((ev) => {
					let val = $(ev.target).val();
					console.log("Selected profile val " + val);

					that.closeProfileBasicsEdit();

					// let current_profile = that.current_gamepad.profiles[that.current_gamepad.current_profile];
					if (val == "+") {
						that.makeNewProfile();
						that.showInputProfileNotification();
					} else {
						that.resetAll(); //reset old
						that.current_profile = $(ev.target).val();
						that.showInputProfileNotification();
						that.resetAll(); //reset new
						that.makeUI();
						that.renderTouchButtons();
						if (
							that.current_profile ==
							that.profiles[that.current_profile].id_saved
						) {
							//new profile remembered when saved
							that.saveLastUserProfile(that.current_profile);
						}
					}
					// that.save_last_user_gamepad_profile(
					//     that.current_gamepad.id,
					//     that.current_gamepad.current_profile
					// );
				});

			if (
				this.profiles[this.current_profile].saved &&
				this.profiles[this.current_profile].basics_saved
			) {
				$("#gamepad_settings").removeClass("unsaved");
			} else {
				$("#gamepad_settings").addClass("unsaved");
			}
		}, 0);
	}

	makeControllerDriverConfigUI() {
		let that = this;

		setTimeout(() => {
			if (!this.edited_controller || !this.enabled_drivers) {
				$("#gamepad-settings-panel").html(
					'<div class="line"><span class="label">Input source:</span><span class="static_val">N/A</span></div>',
				);
				// $('#gamepad-settings-panel').removeClass('has-buttons');
			} else {
				let lines = [];

				let label = this.edited_controller.id;
				if (this.edited_controller.type == "touch")
					label = "Virtual Gamepad (Touch UI)";
				if (this.edited_controller.type == "keyboard") label = "Keyboard";

				let line_source = $(
					'<div class="line"><span class="label">Input source:</span><span class="static_val" title="' +
						label +
						'">' +
						label +
						"</span></div>",
				);
				lines.push(line_source);

				if (this.current_profile) {
					let c_profile = this.edited_controller.profiles[this.current_profile];

					//driver
					let line_driver = $(
						'<div class="line"><span class="label">Output driver:</span></div>',
					);
					let driver_opts = [];

					if (!this.enabled_drivers || !this.enabled_drivers.length) {
						console.error(
							"No enabled drivers for " +
								this.edited_controller.id +
								" (yet?)",
						);
						return;
					}

					for (let i = 0; i < this.enabled_drivers.length; i++) {
						let id_driver = this.enabled_drivers[i];
						driver_opts.push(
							'<option value="' +
								id_driver +
								'"' +
								(c_profile.driver == id_driver ? " selected" : "") +
								">" +
								id_driver +
								"</option>",
						);
					}
					let inp_driver = $(
						'<select id="gamepad-profile-driver-select">' +
							driver_opts.join("") +
							"</select>",
					);

					inp_driver.appendTo(line_driver);
					inp_driver.change((ev) => {
						let val = $(ev.target).val();
						console.log("Controller driver changed to " + val);
						c_profile.driver = val;
						that.initControllerProfile(that.edited_controller, c_profile);

						if (c_profile.driver_instances[c_profile.driver])
							c_profile.driver_instances[c_profile.driver].setupWriter();
						that.checkControllerProfileSaved(
							that.edited_controller,
							that.current_profile,
							false,
						);
						that.makeUI();
						that.renderTouchButtons();
					});
					lines.push(line_driver);

					let driver = c_profile.driver_instances[c_profile.driver];
					if (driver) {
						let driver_lines = driver.makeCofigInputs();
						lines = lines.concat(driver_lines);
						// console.log('Driver config lines ', driver_lines);
					}

					// $('#gamepad-settings-panel').addClass('has-buttons');
				} else {
					// $('#gamepad-settings-panel').removeClass('has-buttons');
				}

				$("#gamepad-settings-panel").empty().append(lines);
			}
		}, 0);
	}

	editController(c) {
		this.edited_controller = c;
		console.log("Editing controller " + c.id);
		this.makeUI();
		this.makeTouchButtonsEditable();
	}

	makeControllerIcons() {
		let icons = [];
		let that = this;

		let types_connected = [];
		Object.values(this.controllers).forEach((c) => {
			let icon = $('<span class="' + c.type + '"></span>');
			types_connected.push(c.type);
			icons.push(icon);
			icon.click((ev) => {
				that.editController(c);
				icon.addClass("editing");
			});

			c.icon = icon;
			c.icon_editing = false;
			c.icon_enabled = false;
			c.icon_transmitting = false;

			that.updateControllerIcon(c);
		});

		this.updateInputStatusIcon();

		// tease other controller types (blurred)
		if (types_connected.indexOf("touch") < 0 && isTouchDevice())
			icons.push($('<span class="touch disabled"></span>'));
		if (types_connected.indexOf("keyboard") < 0)
			icons.push($('<span class="keyboard disabled"></span>'));
		if (types_connected.indexOf("gamepad") < 0)
			icons.push($('<span class="gamepad disabled"></span>'));

		$("#input-controller-selection").empty().append(icons);
	}

	updateControllerIcon(c) {
		if (!c.icon) return;

		if (c.enabled && c.connected && !c.icon_enabled) {
			c.icon_enabled = true;
			c.icon.addClass("enabled");
		} else if ((!c.enabled || !c.connected) && c.icon_enabled) {
			c.icon_enabled = false;
			c.icon.removeClass("enabled");
		}

		if (c.transmitting_user_input && !c.icon_transmitting) {
			c.icon_transmitting = true;
			c.icon.addClass("transmitting");
		} else if (!c.transmitting_user_input && c.icon_transmitting) {
			c.icon_transmitting = false;
			c.icon.removeClass("transmitting");
		}

		if (c.show_error && !c.icon_error) {
			c.icon_error = true;
			c.icon.addClass("error");
		} else if (!c.show_error && c.icon_error) {
			c.icon_error = false;
			c.icon.removeClass("error");
		}

		if (c == this.edited_controller && !c.icon_editing) {
			c.icon_editing = true;
			c.icon.addClass("editing");
		} else if (c != this.edited_controller && c.icon_editing) {
			c.icon_editing = false;
			c.icon.removeClass("editing");
		}
	}

	updateInputStatusIcon() {
		let something_enabled = false;
		let something_transmitting = false;
		let error = false;

		Object.values(this.controllers).forEach((c) => {
			if (c.icon_enabled) something_enabled = true;
			if (c.icon_transmitting) something_transmitting = true;
			if (c.icon_error) error = true;
		});

		if (something_enabled && !this.input_status_icon_enabled) {
			this.input_status_icon_enabled = true;
			this.input_status_icon.addClass("enabled");
		} else if (!something_enabled && this.input_status_icon_enabled) {
			this.input_status_icon_enabled = false;
			this.input_status_icon.removeClass("enabled");
		}

		if (something_transmitting && !this.input_status_icon_transmitting) {
			this.input_status_icon_transmitting = true;
			this.input_status_icon.addClass("transmitting");
		} else if (!something_transmitting && this.input_status_icon_transmitting) {
			this.input_status_icon_transmitting = false;
			this.input_status_icon.removeClass("transmitting");
		}

		if (error && !this.input_status_icon_error) {
			this.input_status_icon_error = true;
			this.input_status_icon.addClass("error");
		} else if (!error && this.input_status_icon_error) {
			this.input_status_icon_error = false;
			this.input_status_icon.removeClass("error");
		}
	}

	makeUI() {
		if (!this.enabled) return;

		let that = this;

		this.makeProfileSelectorUI();

		if (!this.edited_controller) {
			// autoselect first controller
			let controller_keys = Object.keys(this.controllers);
			this.edited_controller = this.controllers[controller_keys[0]];
		}

		this.makeControllerIcons();

		this.makeControllerDriverConfigUI();

		this.debug_output_panel.html("{}");

		if (!this.edited_controller || !this.enabled_drivers || !this.current_profile) {
			$("#gamepad-axes-panel").html(
				'<span class="waiting-for-controller">Waiting for controllers...</a>',
			);
			$("#gamepad-buttons-panel").html(
				'<span class="waiting-for-controller">Waiting for controllers...</a>',
			);
			// $('#gamepad-profile-config').css('display', 'none');
			this.controller_enabled_cb.attr("disabled", true);
			$("#gamepad_settings").removeClass("unsaved");
			$("#save-gamepad-profile").addClass("saved");
			return;
		}

		// console.log('Editing controller is ', this.edited_controller);

		this.controller_enabled_cb
			.attr("disabled", false)
			.prop("checked", this.edited_controller.enabled);

		let profile = this.profiles[this.current_profile];
		let c_profile = this.edited_controller.profiles[this.current_profile];

		if (profile.saved && profile.basics_saved) {
			$("#gamepad_settings").removeClass("unsaved");
			$("#save-gamepad-profile").addClass("saved");
		} else {
			$("#gamepad_settings").addClass("unsaved");
			$("#save-gamepad-profile").removeClass("saved");
		}

		let driver = c_profile ? c_profile.driver_instances[c_profile.driver] : null;

		if (this.edited_controller.type == "keyboard") {
			$("#gamepad-buttons-tab").html("Key Mapping");
			$("#gamepad-axes-tab").css("display", "none"); // no separate axes for kb
			$("#gamepad-axes-panel").css("display", "none");
			if (this.open_panel == "axes") {
				// switch to buttons tab
				this.open_panel = "buttons";
				$("#gamepad-axes-panel").removeClass("active");
				$("#gamepad-axes-tab").removeClass("active");
				$("#gamepad-buttons-panel").addClass("active");
				$("#gamepad-buttons-tab").addClass("active");
			}
			this.makeButtonsUI(driver);
		} else {
			$("#gamepad-buttons-tab").html("Buttons");
			$("#gamepad-axes-tab").css("display", ""); //unset
			$("#gamepad-axes-panel").css("display", "");
			this.makeAxesUI(driver);
			this.makeButtonsUI(driver);
		}
	}

	renderAxisConfig(driver, axis, is_btn = false) {
		let that = this;

		if (!is_btn) axis.config_details_el.empty();

		let driver_axis = axis.driver_axis;

		if (!driver_axis) {
			axis.conf_toggle_el.removeClass("open");
			axis.config_details_el.removeClass("open");
			return;
		}

		// dead zone
		if (!is_btn || this.edited_controller.type == "gamepad") {
			let dead_zone_el = $(
				'<div class="config-row"><span class="label">Dead zone:</span></div>',
			);
			let dead_zone_wrapper_el = $('<div class="config-row2"></div>');
			let dead_zone_min_inp = $('<input type="text" class="inp-val inp-val2"/>');

			dead_zone_min_inp.val(axis.dead_min.toFixed(2));
			let dead_zone_max_label = $('<span class="label2">to</span>');
			let dead_zone_max_inp = $('<input type="text" class="inp-val"/>');
			dead_zone_max_inp.val(axis.dead_max.toFixed(2));
			dead_zone_min_inp.appendTo(dead_zone_wrapper_el);
			dead_zone_max_label.appendTo(dead_zone_wrapper_el);
			dead_zone_max_inp.appendTo(dead_zone_wrapper_el);
			dead_zone_wrapper_el.appendTo(dead_zone_el);

			dead_zone_min_inp.focus((ev) => {
				ev.target.select();
			});
			dead_zone_max_inp.focus((ev) => {
				ev.target.select();
			});

			dead_zone_min_inp.change((ev) => {
				axis.dead_min = parseFloat($(ev.target).val());
				delete axis.dead_val;
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});
			dead_zone_max_inp.change((ev) => {
				axis.dead_max = parseFloat($(ev.target).val());
				delete axis.dead_val;
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});

			dead_zone_el.appendTo(axis.config_details_el);

			if (!isIOS()) {
				// ios can't do numberic keyboard with decimal and minus signs => so default it is
				dead_zone_min_inp.attr("inputmode", "numeric");
				dead_zone_max_inp.attr("inputmode", "numeric");
			}

			dead_zone_min_inp.on("contextmenu", that.preventContextMenu);
			dead_zone_max_inp.on("contextmenu", that.preventContextMenu);
		}

		// input offset
		let offset_el = $(
			'<div class="config-row"><span class="label">Offset input:</span></div>',
		);
		let offset_inp = $('<input type="text" class="inp-val"/>');
		offset_inp.val(axis.offset.toFixed(1));
		offset_inp.focus((ev) => {
			ev.target.select();
		});
		offset_inp.change((ev) => {
			axis.offset = parseFloat($(ev.target).val());
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});
		offset_inp.appendTo(offset_el);
		offset_el.appendTo(axis.config_details_el);

		// input scale
		let scale_el = $(
			'<div class="config-row"><span class="label">Scale input:</span></div>',
		);
		let scale_inp = $('<input type="text" class="inp-val"/>');
		scale_inp.val(axis.scale.toFixed(1));
		scale_inp.focus((ev) => {
			ev.target.select();
		});
		scale_inp.change((ev) => {
			axis.scale = parseFloat($(ev.target).val());
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});
		scale_inp.appendTo(scale_el);
		scale_el.appendTo(axis.config_details_el);

		// modifier selection
		let mod_func_el = $(
			'<div class="config-row"><span class="label">Modifier:</span></div>',
		);
		let mod_func_opts = ['<option value="">None</option>'];
		mod_func_opts.push(
			'<option value="scale_by_velocity" ' +
				(axis.mod_func == "scale_by_velocity" ? " selected" : "") +
				">Scale by velocity</option>",
		);
		let mod_func_inp = $("<select>" + mod_func_opts.join("") + "</select>");
		mod_func_inp.appendTo(mod_func_el);
		mod_func_el.appendTo(axis.config_details_el);
		let mod_func_cont = $("<div></div>");
		mod_func_cont.appendTo(axis.config_details_el);

		let set_mod_funct = (mod_func) => {
			if (mod_func) {
				axis.mod_func = mod_func;
				let mod_func_config_els = [];
				if (mod_func == "scale_by_velocity") {
					let multiply_lerp_input_el = $(
						'<div class="config-row"><span class="label sublabel">Velocity source:</span></div>',
					);
					let multiply_lerp_input_opts = [
						'<option value="">Select axis</option>',
					];

					let dri_axes = driver.getAxes();
					let dri_axes_ids = Object.keys(dri_axes);
					for (let j = 0; j < dri_axes_ids.length; j++) {
						let id_axis = dri_axes_ids[j];
						multiply_lerp_input_opts.push(
							'<option value="' +
								id_axis +
								'"' +
								(axis.scale_by_velocity_src == id_axis
									? " selected"
									: "") +
								">" +
								dri_axes[id_axis] +
								"</option>",
						);
					}

					let multiply_lerp_input_inp = $(
						"<select>" + multiply_lerp_input_opts.join("") + "</select>",
					);
					multiply_lerp_input_inp.appendTo(multiply_lerp_input_el);
					mod_func_config_els.push(multiply_lerp_input_el);
					multiply_lerp_input_inp.change((ev) => {
						axis.scale_by_velocity_src = $(ev.target).val();
						that.checkControllerProfileSaved(
							that.edited_controller,
							that.current_profile,
						);
					});

					// multiplier min
					let multiply_lerp_min_el = $(
						'<div class="config-row"><span class="label sublabel">Slow multiplier:</span></div>',
					);
					let multiply_lerp_min_inp = $('<input type="text" class="inp-val"/>');
					multiply_lerp_min_inp.focus((ev) => {
						ev.target.select();
					});
					if (axis.scale_by_velocity_mult_min === undefined)
						axis.scale_by_velocity_mult_min = 1.0;
					multiply_lerp_min_inp.val(axis.scale_by_velocity_mult_min.toFixed(1));
					multiply_lerp_min_inp.change((ev) => {
						axis.scale_by_velocity_mult_min = parseFloat($(ev.target).val());
						that.checkControllerProfileSaved(
							that.edited_controller,
							that.current_profile,
						);
					});
					multiply_lerp_min_inp.appendTo(multiply_lerp_min_el);
					mod_func_config_els.push(multiply_lerp_min_el);

					// multiplier max
					let multiply_lerp_max_el = $(
						'<div class="config-row"><span class="label sublabel">Fast multiplier:</span></div>',
					);
					let multiply_lerp_max_inp = $('<input type="text" class="inp-val"/>');
					multiply_lerp_max_inp.focus((ev) => {
						ev.target.select();
					});
					if (axis.scale_by_velocity_mult_max === undefined)
						axis.scale_by_velocity_mult_max = 1.0;
					multiply_lerp_max_inp.val(axis.scale_by_velocity_mult_max.toFixed(1));
					multiply_lerp_max_inp.change((ev) => {
						axis.scale_by_velocity_mult_max = parseFloat($(ev.target).val());
						that.checkControllerProfileSaved(
							that.edited_controller,
							that.current_profile,
						);
					});
					multiply_lerp_max_inp.appendTo(multiply_lerp_max_el);
					mod_func_config_els.push(multiply_lerp_max_el);

					if (!isIOS()) {
						// ios can't do numberic keyboard with decimal and minus signs => so default it is
						multiply_lerp_min_inp.attr("inputmode", "numeric");
						multiply_lerp_max_inp.attr("inputmode", "numeric");
					}
					multiply_lerp_min_inp.on("contextmenu", that.preventContextMenu);
					multiply_lerp_max_inp.on("contextmenu", that.preventContextMenu);
				}
				mod_func_cont.empty().append(mod_func_config_els).css("display", "block");
			} else {
				delete axis.mod_func; // checkControllerProfileSaved expecs undefined (not null)
				mod_func_cont.empty().css("display", "none");
			}
		};
		set_mod_funct(axis.mod_func);
		mod_func_inp.change((ev) => {
			set_mod_funct($(ev.target).val());
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		if (!isIOS()) {
			// ios can't do numberic keyboard with decimal and minus signs => so default it is
			offset_inp.attr("inputmode", "numeric");
			scale_inp.attr("inputmode", "numeric");
		}

		offset_inp.on("contextmenu", that.preventContextMenu);
		scale_inp.on("contextmenu", that.preventContextMenu);
	}

	preventContextMenu(ev) {
		ev.preventDefault();
		ev.stopPropagation();
	}

	makeBtnTriggerSel(btn, allows_repeat) {
		// modifier selection
		let trigger_el = $(
			'<div class="config-row"><span class="label">Trigger:</span></div>',
		);

		let opts = {
			gamepad: {
				0: "Touch",
				1: "Press",
				2: "Release",
			},
			touch: {
				1: "Press",
				2: "Release",
			},
			keyboard: {
				1: "Key down",
				2: "Key up",
			},
		};
		let c_opts = opts[this.edited_controller.type];
		let vals = Object.keys(c_opts);
		let trigger_opts = [];
		vals.forEach((val) => {
			let val_int = parseInt(val);
			if (val_int === 2 && btn.driver_btn) return;
			trigger_opts.push(
				'<option value="' +
					val +
					'"' +
					(btn.trigger === val_int ? " selected" : "") +
					">" +
					c_opts[val] +
					"</option>",
			);
		});

		let trigger_inp = $(
			"<select" +
				(trigger_opts.length < 2 ? " disabled" : "") +
				">" +
				trigger_opts.join("") +
				"</select>",
		);
		trigger_inp.appendTo(trigger_el);
		let that = this;

		let repeat_el = null;
		if (allows_repeat) {
			let cb_id = btn.i + "_repeat_cb";
			repeat_el = $(
				'<div class="config-row"><label for="' +
					cb_id +
					'" class="small-settings-cb-label">Repeat</label></div>',
			);
			repeat_el.css("display", !btn.trigger || btn.trigger == 1 ? "block" : "none"); //repeat only shows for touch/press
			let repeat_inp = $(
				'<input type="checkbox" ' +
					(btn.repeat ? " checked" : "") +
					' id="' +
					cb_id +
					'" class="small-settings-cb"/>',
			);
			repeat_inp.prependTo(repeat_el);

			repeat_inp.change((ev) => {
				let val = $(ev.target).prop("checked") ? true : false;
				btn.repeat = val;
				if (!val && btn.repeat_timer) {
					clearInterval(btn.repeat_timer);
					delete btn.repeat_timer;
				}
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});
		}

		trigger_inp.change((ev) => {
			btn.trigger = parseInt($(ev.target).val());
			if (btn.repeat_timer) {
				clearInterval(btn.repeat_timer);
				delete btn.repeat_timer;
			}
			if (repeat_el)
				repeat_el.css(
					"display",
					btn.trigger == 0 || btn.trigger == 1 ? "block" : "none",
				);
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		if (repeat_el) {
			return [trigger_el, repeat_el];
		} else {
			return trigger_el;
		}
	}

	// makeBtnRepeatSel(btn) {

	//     let trigger_opts = [];
	//     if (this.edited_controller.type == 'gamepad') // gamepad has touch
	//         trigger_opts.push('<option value="0"'+(btn.trigger===0?' selected':'')+'>Touch</option>');
	//     trigger_opts.push('<option value="1"'+(btn.trigger===1?' selected':'')+'>Press</option>');
	//     if (!btn.driver_btn) // driver btn only trigerred by touch or press
	//         trigger_opts.push('<option value="2"'+(btn.trigger===2?' selected':'')+'>Release</option>')

	//     return trigger_el;
	// }

	renderDriverButtonConfig(driver, btn) {
		let that = this;

		btn.config_details_el.append(this.makeBtnTriggerSel(btn)); //no repeat (sending continuously)
	}

	renderROSSrvButtonConfig(driver, btn) {
		let that = this;

		btn.config_details_el.append(this.makeBtnTriggerSel(btn, true)); //+repeat

		let srv_el = $(
			'<div class="config-row"><span class="label">Service:</span></div>',
		);
		let srv_opts = ['<option value="">Select service...</option>'];

		let nodes = this.client.discovered_nodes;
		if (!Object.keys(nodes).length) return;

		let nodes_sorted = Object.values(nodes).sort((a, b) => {
			return a.node.toLowerCase().localeCompare(b.node.toLowerCase());
		});

		nodes_sorted.forEach((node) => {
			let service_ids = Object.keys(node.services);
			if (!service_ids.length) return;

			let node_opts = [];
			service_ids.forEach((id_srv) => {
				let msg_type = node.services[id_srv].msg_type;
				// if (that.ui.ignored_service_types.includes(msg_type))
				//     return; // not rendering ignored

				node_opts.push(
					'<option value="' +
						id_srv +
						":" +
						msg_type +
						'"' +
						(btn.ros_srv_id == id_srv ? " selected" : "") +
						">" +
						id_srv +
						"</option>",
				);
			});

			if (node_opts.length) {
				srv_opts.push('<optgroup label="' + node.node + '"></optgroup>');
				srv_opts = srv_opts.concat(node_opts);
				srv_opts.push("</optgroup>");
			}
		});

		let srv_id_inp = $("<select>" + srv_opts.join("") + "</select>");
		srv_id_inp.appendTo(srv_el);

		let srv_details_el = $('<div class="srv-settings"></div>');
		let render_srv_details = () => {
			srv_details_el.empty();
			if (btn.ros_srv_msg_type) {
				let srv_val_btn = $(
					'<button class="srv-val" title="Set service call data">{}</button>',
				);
				srv_val_btn.click(() => {
					that.ui.service_input_dialog.showInputManagerDialog(
						btn.ros_srv_id,
						btn.ros_srv_msg_type,
						btn.ros_srv_val,
						(srv_payload) => {
							console.warn(
								"Setting srv payload for " + btn.ros_srv_id + ":",
								srv_payload,
							);
							btn.ros_srv_val = srv_payload;
							that.checkControllerProfileSaved(
								that.edited_controller,
								that.current_profile,
							);
						},
					);
				});

				let silent_req_el = $(
					'<div class="config-row"><label for="' +
						btn.i +
						'_silent_req_cb" class="small-settings-cb-label">Silent request</label></div>',
				);
				let silent_req_inp = $(
					'<input type="checkbox" ' +
						(btn.ros_srv_silent_req ? " checked" : "") +
						' id="' +
						btn.i +
						'_silent_req_cb" class="small-settings-cb"/>',
				);
				silent_req_inp.prependTo(silent_req_el);
				silent_req_inp.change((ev) => {
					let val = $(ev.target).prop("checked") ? true : false;
					btn.ros_srv_silent_req = val;
					that.checkControllerProfileSaved(
						that.edited_controller,
						that.current_profile,
					);
				});

				let silent_res_el = $(
					'<div class="config-row"><label for="' +
						btn.i +
						'_silent_res_cb" class="small-settings-cb-label">Silent response</label></div>',
				);
				let silent_res_inp = $(
					'<input type="checkbox" ' +
						(btn.ros_srv_silent_res ? " checked" : "") +
						' id="' +
						btn.i +
						'_silent_res_cb" class="small-settings-cb"/>',
				);
				silent_res_inp.prependTo(silent_res_el);
				silent_res_inp.change((ev) => {
					let val = $(ev.target).prop("checked") ? true : false;
					btn.ros_srv_silent_res = val;
					that.checkControllerProfileSaved(
						that.edited_controller,
						that.current_profile,
					);
				});
				srv_details_el.append([
					srv_val_btn,
					silent_req_el,
					silent_res_el,
					$('<div class="cleaner"></div>'),
				]);
			}
		};
		render_srv_details();

		srv_id_inp.change((ev) => {
			let val = $(ev.target).val();
			if (val) {
				let vals = val.split(":");
				btn.ros_srv_id = vals[0];
				btn.ros_srv_msg_type = vals[1];
			} else {
				btn.ros_srv_id = null;
				btn.ros_srv_msg_type = null;
			}
			btn.ros_srv_val = null; // remove val
			console.log(
				"btn set to ros srv " +
					btn.ros_srv_id +
					" msg type=" +
					btn.ros_srv_msg_type,
			);
			render_srv_details();
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		btn.config_details_el.append(srv_el);
		btn.config_details_el.append(srv_details_el);
	}

	renderCtrlEnabledButtonConfig(driver, btn) {
		let that = this;

		btn.config_details_el.append(this.makeBtnTriggerSel(btn));

		// modifier selection
		let state_el = $(
			'<div class="config-row"><span class="label">Set state:</span></div>',
		);
		let state_opts = [
			'<option value="2"' +
				(btn.set_ctrl_state === 2 ? " selected" : "") +
				">Toggle</option>",
			'<option value="1"' +
				(btn.set_ctrl_state === 1 ? " selected" : "") +
				">Enabled</option>",
			'<option value="0"' +
				(btn.set_ctrl_state === 0 ? " selected" : "") +
				">Disabled</option>",
		];

		let state_inp = $("<select>" + state_opts.join("") + "</select>");
		state_inp.appendTo(state_el);

		state_inp.change((ev) => {
			// set_mod_funct();
			btn.set_ctrl_state = parseInt($(ev.target).val());
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		btn.config_details_el.append(state_el);
	}

	renderInputProfileButtonConfig(driver, btn) {
		let that = this;

		btn.config_details_el.append(this.makeBtnTriggerSel(btn));

		// profile selection
		let profile_el = $(
			'<div class="config-row"><span class="label">Set profile:</span></div>',
		);
		let profile_opts = [];
		Object.keys(this.profiles).forEach((id_profile) => {
			if (!btn.set_ctrl_profile) btn.set_ctrl_profile = id_profile;
			let label = this.profiles[id_profile].label
				? this.profiles[id_profile].label
				: id_profile;
			profile_opts.push(
				'<option value="' +
					id_profile +
					'"' +
					(btn.set_ctrl_profile == id_profile ? " selected" : "") +
					">" +
					label +
					"</option>",
			);
		});
		let profile_inp = $("<select>" + profile_opts.join("") + "</select>");
		profile_inp.appendTo(profile_el);

		profile_inp.change((ev) => {
			// set_mod_funct();
			btn.set_ctrl_profile = $(ev.target).val();
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		btn.config_details_el.append(profile_el);
	}

	renderUIProfileButtonConfig(driver, btn) {
		let that = this;

		btn.config_details_el.append(this.makeBtnTriggerSel(btn));

		// profile selection
		let profile_el = $(
			'<div class="config-row"><span class="label">Set profile:</span></div>',
		);
		let profile_opts = [];
		[].forEach((id_profile) => {
			// TODO
			let label = this.profiles[id_profile].label
				? this.profiles[id_profile].label
				: id_profile;
			profile_opts.push(
				'<option value="' +
					id_profile +
					'"' +
					(btn.set_ui_profile == id_profile ? " selected" : "") +
					">" +
					label +
					"</option>",
			);
		});
		profile_opts.push("<option>N/A (TODO)</option>");
		let profile_inp = $("<select disabled>" + profile_opts.join("") + "</select>");
		profile_inp.appendTo(profile_el);

		profile_inp.change((ev) => {
			// set_mod_funct();
			btn.set_ui_profile = $(ev.target).val();
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		btn.config_details_el.append(profile_el);
	}

	renderWifiScanButtonConfig(driver, btn) {
		btn.config_details_el.append(this.makeBtnTriggerSel(btn));
	}

	renderWifiRoamButtonConfig(driver, btn) {
		btn.config_details_el.append(this.makeBtnTriggerSel(btn));
	}

	makeAxesUI(driver) {
		if (!driver) {
			$("#gamepad-axes-panel")
				.empty()
				.append('<span class="error">Driver not loaded</span>');
			return;
		}

		let that = this;

		// all gamepad axes
		let axes_els = [];
		for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
			let axis = driver.axes[i_axis];

			let row_el = $('<div class="axis-row unused"></div>');

			// raw val
			let raw_val_el = $('<span class="axis-val" title="Raw axis value"></span>');
			raw_val_el.appendTo(row_el);
			axis.raw_val_el = raw_val_el;

			// 1st line
			let line_1_el = $('<div class="axis-config"></div>');

			// axis assignment selection
			let opts = ['<option value="">Not in use</option>'];
			// let dri = profile.driver_instance;
			let dri_axes = driver.getAxes();
			let dri_axes_ids = Object.keys(dri_axes);
			for (let j = 0; j < dri_axes_ids.length; j++) {
				let id_axis = dri_axes_ids[j];
				opts.push(
					'<option value="' +
						id_axis +
						'"' +
						(axis.driver_axis == id_axis ? " selected" : "") +
						">" +
						dri_axes[id_axis] +
						"</option>",
				);
			}
			opts.push('<option value="*">Switch with axis...</option>');

			let assignment_sel_el = $("<select>" + opts.join("") + "</select>");
			assignment_sel_el.appendTo(line_1_el);
			axis.assignment_sel_el = assignment_sel_el;

			// output val
			let out_val_el = $(
				'<span class="axis-output-val" title="Axis output">0.00</span>',
			);
			out_val_el.appendTo(line_1_el);
			axis.out_val_el = out_val_el;

			// config toggle
			axis.conf_toggle_el = $(
				'<span class="conf-toggle' +
					(axis.edit_open ? " open" : "") +
					'"></span>',
			);
			axis.conf_toggle_el.click((ev) => {
				if (!axis.conf_toggle_el.hasClass("open")) {
					axis.conf_toggle_el.addClass("open");
					axis.config_details_el.addClass("open");
					axis.edit_open = true;
				} else {
					axis.conf_toggle_el.removeClass("open");
					axis.config_details_el.removeClass("open");
					axis.edit_open = false;
				}
			});
			out_val_el.click((ev) => {
				axis.conf_toggle_el.click(); // because this happens a lot
			});
			axis.conf_toggle_el.appendTo(line_1_el);

			// collapsable details
			axis.config_details_el = $(
				'<div class="axis-config-details' +
					(axis.edit_open ? " open" : "") +
					'"></div>',
			);

			// let that = this;
			assignment_sel_el.change((ev) => {
				let val = $(ev.target).val();

				console.log("Axis " + axis.i + " selected val: " + val);

				let cancel_switch = (reset_selection) => {
					driver.axes.forEach((a) => {
						a.raw_val_el.unbind();
						a.row_el.removeClass("switch-target");
						if (driver.switching_axis === a) {
							a.row_el.removeClass("switch-source");
							if (reset_selection) {
								a.assignment_sel_el.val(a.driver_axis); //set not in use
								if (!a.driver_axis) a.row_el.addClass("unused");
								else a.row_el.removeClass("unused");
							}
						}
					});
					delete driver.switching_axis;
				};

				if (val == "*") {
					if (driver.switching_axis && axis !== driver.switching_axis) {
						cancel_switch(true); // another one was being switched, cancel first
					}
					driver.switching_axis = axis;

					row_el.addClass("unused switch-source");

					// let axes_ids = Object.keys()
					driver.axes.forEach((axis2) => {
						if (axis == axis2)
							//skip source
							return;
						axis2.row_el.addClass("switch-target");
						axis2.raw_val_el.unbind().click((ev) => {
							cancel_switch(false);
							that.switchAxesConfig(axis, axis2);

							axis.assignment_sel_el.val(axis.driver_axis);
							if (axis.driver_axis) axis.row_el.removeClass("unused");
							else axis.row_el.addClass("unused");
							that.renderAxisConfig(driver, axis);

							axis2.assignment_sel_el.val(axis2.driver_axis);
							if (axis2.driver_axis) axis2.row_el.removeClass("unused");
							else axis2.row_el.addClass("unused");
							that.renderAxisConfig(driver, axis2);

							// axis.driver_axis = a.driver_axis;
							//
							// if (axis.driver_axis) {
							//     axis.dead_min = a.dead_min;
							//     axis.dead_max = a.dead_max;
							//     axis.offset = a.offset;
							//     axis.scale = a.scale;
							//     axis.mod_func = a.mod_func;
							//     axis.scale_by_velocity_src = a.scale_by_velocity_src;
							//     axis.scale_by_velocity_mult_min = a.scale_by_velocity_mult_min;
							//     axis.scale_by_velocity_mult_max = a.scale_by_velocity_mult_max;
							//
							//
							that.checkControllerProfileSaved(
								that.edited_controller,
								that.current_profile,
							);
						});
					});
					return;
				} else if (driver.switching_axis) {
					cancel_switch(driver.switching_axis !== axis);
				}

				if (val) {
					axis.driver_axis = val;

					that.renderAxisConfig(driver, axis);
					row_el.removeClass("unused");

					axis.conf_toggle_el.addClass("open");
					axis.config_details_el.addClass("open");
				} else {
					axis.driver_axis = null;

					that.renderAxisConfig(driver, axis);
					row_el.addClass("unused");
				}

				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});

			that.renderAxisConfig(driver, axis);
			// console.log('axis '+i_axis+' assigned to ', axis.driver_axis);
			if (axis.driver_axis) {
				row_el.removeClass("unused");
			} else {
				row_el.addClass("unused");
			}

			line_1_el.appendTo(row_el);
			axis.config_details_el.appendTo(row_el);

			axis.row_el = row_el;
			axes_els.push(row_el);
		}

		$("#gamepad-axes-panel").empty().append(axes_els);

		if (driver.axes_scroll_offset !== undefined) {
			$("#gamepad-axes-panel").scrollTop(driver.axes_scroll_offset);
			delete driver.axes_scroll_offset;
		}
	}

	makeTouchButtonsRowEditable(cont, btn_placement) {
		let that = this;
		cont.sortable({
			axis: "x",
			handle: ".btn",
			cursor: "move",
			stop: () => {
				let c = that.controllers["touch"];
				if (!c || !c.profiles) return;
				let profile = c.profiles[that.current_profile];
				let driver = profile.driver_instances[profile.driver];

				for (let i = 0; i < driver.buttons.length; i++) {
					let btn = driver.buttons[i];
					if (btn.touch_ui_placement != btn_placement) continue;
					let index = btn.touch_btn_el.parent().index();
					btn.sort_index = index;
				}
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			},
		});
	}

	makeTouchButtonsEditable() {
		if (!isTouchDevice()) return;

		setTimeout(() => {
			let buttons_editable =
				this.open &&
				this.edited_controller &&
				this.edited_controller.type == "touch" &&
				this.open_panel == "buttons";

			this.touch_buttons_editable = buttons_editable;

			let top_btns_cont = $("#touch-ui-top-buttons");
			let bottom_btns_cont = $("#touch-ui-bottom-buttons");
			if (buttons_editable) {
				this.makeTouchButtonsRowEditable(top_btns_cont, 1);
				this.makeTouchButtonsRowEditable(bottom_btns_cont, 2);
			} else {
				[top_btns_cont, bottom_btns_cont].forEach((cont) => {
					if (cont.hasClass("ui-sortable")) cont.sortable("destroy");
				});
			}
		}, 0);
	}

	renderTouchButtons() {
		setTimeout(() => {
			let c = this.controllers["touch"];
			if (!c || !c.profiles) return;
			let profile = c.profiles[this.current_profile];
			let driver = profile.driver_instances[profile.driver];

			let top_btns_cont = $("#touch-ui-top-buttons");
			top_btns_cont.empty(); //.removeClass('ui-sortable');
			let bottom_btns_cont = $("#touch-ui-bottom-buttons");
			bottom_btns_cont.empty(); //.removeClass('ui-sortable');

			if (!driver) return; //not loaded

			let top_btns = [];
			let bottom_btns = [];

			for (let i = 0; i < driver.buttons.length; i++) {
				let btn = driver.buttons[i];
				if (!btn.touch_ui_placement || !btn.assigned) continue;
				if (btn.touch_ui_placement === 1) top_btns.push(btn);
				else if (btn.touch_ui_placement === 2) bottom_btns.push(btn);
			}

			let that = this;

			[top_btns, bottom_btns].forEach((btns) => {
				btns.sort((a, b) => {
					return a.sort_index - b.sort_index;
				});

				btns.forEach((btn) => {
					let wrap_el = $("<li></li>");
					let label = btn.src_label.trim();
					if (!label) label = "&nbsp;";
					let btn_el = $(
						'<span class="btn ' +
							(btn.touch_ui_style ? btn.touch_ui_style : "") +
							'" tabindex="-1">' +
							label +
							"</span>",
					);
					let cont = null;

					if ((btn.driver_axis || btn.driver_btn) && !c.enabled)
						btn_el.addClass("disabled");

					if (btn.repeat_timer) {
						clearInterval(btn.repeat_timer);
						btn.repeat_timer = null;
					}

					if (btn.touch_ui_placement == 1) {
						cont = top_btns_cont;
					} else {
						// bottom
						cont = bottom_btns_cont;
					}
					btn_el.appendTo(wrap_el);
					wrap_el.appendTo(cont);
					btn.touch_btn_el = btn_el;

					btn_el[0].addEventListener(
						"touchstart",
						(ev) => {
							if (that.touch_buttons_editable) return; // don't trigger when sorting

							btn.touch_started = Date.now();
							btn.pressed = true;
							btn.raw = 1.0;

							if (btn.repeat_timer) {
								clearInterval(btn.repeat_timer);
								delete btn.repeat_timer;
							}

							// down handlers & repeat
							if (btn.trigger == 1) {
								that.triggerBtnAction(c, btn);
								if (btn.repeat) {
									btn.repeat_timer = setInterval(() => {
										that.triggerBtnAction(c, btn);
									}, that.input_repeat_delay);
								}
							}
						},
						{ passive: true },
					);

					btn_el[0].addEventListener(
						"touchend",
						() => {
							if (that.touch_buttons_editable) return;

							btn.pressed = false;
							btn.raw = 0.0;

							if (btn.repeat_timer) {
								clearInterval(btn.repeat_timer);
								delete btn.repeat_timer;
							}

							// up handlers
							if (btn.trigger == 2) {
								that.triggerBtnAction(c, btn);
							}
						},
						{ passive: true },
					);

					btn_el.on("contextmenu", that.preventContextMenu);
					btn_el.on("contextmenu", that.preventContextMenu);
				});
			});

			if (top_btns.length && this.touch_buttons_editable) {
				this.makeTouchButtonsRowEditable(top_btns_cont, 1);
			}

			if (bottom_btns.length) {
				$("BODY").addClass("touch-bottom-buttons");
				if (this.touch_buttons_editable) {
					this.makeTouchButtonsRowEditable(bottom_btns_cont, 2);
				}
			} else {
				$("BODY").removeClass("touch-bottom-buttons");
			}
		}, 0);
	}

	renderTouchBtnConfig(driver, btn) {
		let that = this;

		setTimeout(() => {
			// ui placement
			let placement_el = $(
				'<div class="config-row"><span class="label">Placement:</span></div>',
			);
			let placement_opts = [];
			placement_opts.push('<option value="">None</option>');
			placement_opts.push(
				'<option value="1"' +
					(btn.touch_ui_placement === 1 ? " selected" : "") +
					">Top menu</option>",
			);
			placement_opts.push(
				'<option value="2"' +
					(btn.touch_ui_placement === 2 ? " selected" : "") +
					">Bottom overlay</option>",
			);
			let placement_inp = $("<select>" + placement_opts.join("") + "</select>");
			placement_inp.appendTo(placement_el);

			placement_inp.change((ev) => {
				let placement = parseInt($(ev.target).val());
				// set max sort index
				let max_sort_index = -1;
				for (let i = 0; i < driver.buttons.length; i++) {
					if (
						driver.buttons[i].touch_ui_placement == placement &&
						btn != driver.buttons[i] &&
						driver.buttons[i].touch_ui_placement > max_sort_index
					)
						max_sort_index = driver.buttons[i].touch_ui_placement;
				}
				btn.touch_ui_placement = placement;
				btn.sort_index = max_sort_index + 1;
				that.renderTouchButtons();
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});
			btn.config_details_el.append(placement_el);

			let label_el = $(
				'<div class="config-row"><span class="label">Label:</span></div>',
			);
			let label_inp = $(
				'<input type="text" value="' + btn.src_label + '" class="half"/>',
			);
			label_inp.appendTo(label_el);
			label_inp.change((ev) => {
				btn.src_label = $(ev.target).val();
				//btn.raw_val_el.html(btn.src_label);
				that.renderTouchButtons();
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});
			label_inp.on("contextmenu", that.preventContextMenu);
			btn.config_details_el.append(label_el);

			// color placement
			let color_el = $(
				'<div class="config-row"><span class="label">Style:</span></div>',
			);
			let color_opts = [];
			color_opts.push('<option value="">Default</option>');
			let styles = {
				red: "Red",
				green: "Green",
				blue: "Blue",
				yellow: "Yellow",
				orange: "Orange",
				magenta: "Magenta",
				cyan: "Cyan",
			};
			Object.keys(styles).forEach((style) => {
				color_opts.push(
					'<option value="' +
						style +
						'" ' +
						(btn.touch_ui_style == style ? "selected" : "") +
						">" +
						styles[style] +
						"</option>",
				);
			});
			let color_inp = $("<select>" + color_opts.join("") + "</select>");
			color_inp.appendTo(color_el);

			color_inp.change((ev) => {
				// set_mod_funct();
				btn.touch_ui_style = $(ev.target).val();
				that.renderTouchButtons();
				that.checkControllerProfileSaved(
					that.edited_controller,
					that.current_profile,
				);
			});
			btn.config_details_el.append(color_el);

			btn.config_details_el.append($('<span class="separator"></span>'));
		}, 0);
	}

	renderBtnConfig(driver, btn) {
		if (!btn.config_details_el) return;

		setTimeout(() => {
			btn.config_details_el.empty();

			if (this.edited_controller.type == "touch") {
				this.renderTouchBtnConfig(driver, btn);
			}

			if (btn.driver_axis) {
				if (btn.dead_min === undefined) btn.dead_min = -0.01;
				if (btn.dead_max === undefined) btn.dead_max = 0.01;
				if (btn.offset === undefined) btn.offset = 0.0;
				if (btn.scale === undefined) btn.scale = 1.0;

				this.renderAxisConfig(driver, btn, true); //render button as axis with input for trigger src
			} else if (btn.driver_btn) {
				if (btn.trigger === undefined) btn.trigger = 1; // press by default
				this.renderDriverButtonConfig(driver, btn); //render button as axis
			} else if (btn.action) {
				switch (btn.action) {
					case "ros-srv":
						this.renderROSSrvButtonConfig(driver, btn);
						break;
					case "ctrl-enabled":
						this.renderCtrlEnabledButtonConfig(driver, btn);
						break;
					case "input-profile":
						this.renderInputProfileButtonConfig(driver, btn);
						break;
					case "ui-profile":
						this.renderUIProfileButtonConfig(driver, btn);
						break;
					default:
						console.error("Button action type not supported: ", btn.action);
						btn.conf_toggle_el.removeClass("open");
						btn.config_details_el.removeClass("open");
						return;
				}
			} else {
				btn.conf_toggle_el.removeClass("open");
				btn.config_details_el.removeClass("open");
				return;
			}
		}, 0);
	}

	gamepadButtonLabel(btn_code) {
		return "B" + btn_code;
	}

	keyboardKeyLabel(key, mod) {
		let label = key ? key.toUpperCase() : key;
		switch (label) {
			case " ":
				label = "␣";
				break;
			case "ARROWLEFT":
				label = "←";
				break; // &#8592;
			case "ARROWRIGHT":
				label = "→";
				break; //&#8594;
			case "ARROWUP":
				label = "↑";
				break; // &#8593;
			case "ARROWDOWN":
				label = "↓";
				break; // &#8595;
			case "TAB":
				label = "Tab";
				break;
			case "ENTER":
				label = "Enter";
				break;
			case "SHIFT":
				label = "Shift";
				break;
			case "CONTROL":
				label = "Ctrl";
				break;
			// case 'META': label = 'Meta'; break;
			case "ALT":
				label = "Alt";
				break;
		}
		switch (mod) {
			case "alt":
				label = "Alt+" + label;
				break;
			case "ctrl":
				label = "Ctrl+" + label;
				break;
			// case 'meta': label = 'Meta+'+label; break;
			case "shift":
				label = "Shift+" + label;
				break;
		}
		return label;
	}

	modKeyFromKeyboardEvent(ev) {
		if (ev.shiftKey) return "shift";
		else if (ev.ctrlKey) return "ctrl";
		else if (ev.altKey) return "alt";
		return null;
	}

	modKeyFromKeyboardKey(key) {
		switch (key) {
			case "shift":
				return "shift";
			case "control":
				return "ctrl";
			case "alt":
				return "alt";
			default:
				return null;
		}
	}

	makeBtnRow(driver, btn) {
		let that = this;

		let row_el = $('<div class="button-row unused"></div>');
		btn.row_el = row_el;

		// raw val
		let raw_val_el = $('<span class="btn-val" title="Button input"></span>');
		raw_val_el.appendTo(row_el);

		let close_listening = () => {
			btn.listening = false;
			raw_val_el.removeClass("listening");
			raw_val_el.html(btn.src_label !== null ? btn.src_label : "n/a");
			if (btn.id_src !== null) raw_val_el.addClass("assigned");
			$("#input-manager-overlay").unbind().css("display", "none");
			delete driver.on_button_press;
			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		};
		raw_val_el.click(() => {
			if (that.edited_controller.type == "touch") return;

			if (!raw_val_el.hasClass("listening")) {
				raw_val_el.removeClass("assigned").addClass("listening");
				raw_val_el.html("?");
				$("#input-manager-overlay")
					.unbind()
					.css("display", "block")
					.click(() => {
						close_listening();
					});
				btn.listening = true;
				driver.on_button_press = (key_code, kb_ev) => {
					if (key_code == "Escape") {
						// cancel
						close_listening();
						return;
					} else if (key_code == "Delete" || key_code == "Backspace") {
						// clear
						btn.id_src = null;
						btn.src_label = null;
						btn.key_mod = null;
						close_listening();
						return;
					}

					if (that.edited_controller.type == "keyboard") {
						btn.key_mod = that.modKeyFromKeyboardEvent(kb_ev);
						btn.id_src = kb_ev.key.toLowerCase(); // comparing lower cases
						btn.src_label = that.keyboardKeyLabel(btn.id_src, btn.key_mod);
					} else if (that.edited_controller.type == "gamepad") {
						btn.src_label = that.gamepadButtonLabel(key_code);
						btn.id_src = key_code;
					}

					console.log(
						"Assigned: " +
							btn.id_src +
							(btn.key_mod ? "+" + btn.key_mod : ""),
					);

					close_listening();
				};
			} else {
				close_listening();
			}
		});

		btn.raw_val_el = raw_val_el;

		// 1st line
		let line_1_el = $('<div class="btn-config"></div>');

		// btn assignment selection
		let opts = [
			'<option value="">Not in use</option>',
			'<option value="ros-srv"' +
				(btn.action == "ros-srv" ? " selected" : "") +
				">Call ROS Service</option>",
			'<option value="ctrl-enabled"' +
				(btn.action == "ctrl-enabled" ? " selected" : "") +
				">Set Controller Enabled</option>",
			'<option value="input-profile"' +
				(btn.action == "input-profile" ? " selected" : "") +
				">Set Input Profile</option>",
			'<option value="ui-profile"' +
				(btn.action == "ui-profile" ? " selected" : "") +
				">Set UI Layout</option>",
		];

		// let dri = profile.driver_instance;
		let dri_btns = driver.getButtons();
		let dri_btns_ids = Object.keys(dri_btns);
		for (let j = 0; j < dri_btns_ids.length; j++) {
			let id_btn = dri_btns_ids[j];
			opts.push(
				'<option value="btn:' +
					id_btn +
					'"' +
					(btn.driver_btn == id_btn ? " selected" : "") +
					">" +
					dri_btns[id_btn] +
					"</option>",
			);
		}
		let dri_axes = driver.getAxes();
		let dri_axes_ids = Object.keys(dri_axes);
		for (let j = 0; j < dri_axes_ids.length; j++) {
			let id_axis = dri_axes_ids[j];
			opts.push(
				'<option value="axis:' +
					id_axis +
					'"' +
					(btn.driver_axis == id_axis ? " selected" : "") +
					">" +
					dri_axes[id_axis] +
					"</option>",
			);
		}
		let assignment_sel_el = $("<select>" + opts.join("") + "</select>");
		assignment_sel_el.appendTo(line_1_el);
		btn.assignment_sel_el = assignment_sel_el;

		// output val
		let out_val_el = $('<span class="btn-output-val" title="Button output"></span>');
		out_val_el.appendTo(line_1_el);
		btn.out_val_el = out_val_el;

		// config toggle
		btn.conf_toggle_el = $(
			'<span class="conf-toggle' + (btn.edit_open ? " open" : "") + '"></span>',
		);
		btn.conf_toggle_el.click((ev) => {
			if (!btn.conf_toggle_el.hasClass("open")) {
				btn.conf_toggle_el.addClass("open");
				btn.config_details_el.addClass("open");
				btn.edit_open = true;
			} else {
				btn.conf_toggle_el.removeClass("open");
				btn.config_details_el.removeClass("open");
				btn.edit_open = false;
			}
		});
		out_val_el.click((ev) => {
			btn.conf_toggle_el.click(); // because this happens a lot
		});
		btn.conf_toggle_el.appendTo(line_1_el);

		// collapsable details
		btn.config_details_el = $(
			'<div class="btn-config-details' +
				(btn.edit_open ? " open" : "") +
				'"></div>',
		);

		assignment_sel_el.change((ev) => {
			let val_btn_assigned = $(ev.target).val();

			if (val_btn_assigned) {
				if (val_btn_assigned.indexOf("axis:") === 0) {
					let id_axis_assigned = val_btn_assigned.substring(5);
					console.log("btn " + btn.i + " assigned axis: ", id_axis_assigned);
					btn.driver_btn = null;
					btn.action = null;
					btn.driver_axis = id_axis_assigned;
					btn.assigned = true;
				} else if (val_btn_assigned.indexOf("btn:") === 0) {
					let id_btn_assigned = val_btn_assigned.substring(4);
					console.log("btn " + btn.i + " assigned btn: ", id_btn_assigned);
					btn.driver_axis = null;
					btn.action = null;
					btn.driver_btn = id_btn_assigned;
					if (btn.trigger === undefined || btn.trigger === null)
						btn.trigger = 1; // press by default
					btn.assigned = true;
				} else {
					// actions
					console.log("btn " + btn.i + " assigned action: ", val_btn_assigned);
					btn.driver_axis = null;
					btn.driver_btn = null;
					btn.action = val_btn_assigned;
					if (btn.trigger === undefined || btn.trigger === null)
						btn.trigger = 1; // press by default
					switch (btn.action) {
						case "ctrl-enabled":
							if (
								btn.set_ctrl_state === undefined ||
								btn.set_ctrl_state === null
							)
								btn.set_ctrl_state = 2; //toggle by default

							break;
						default:
							break;
					}
					btn.assigned = true;
				}

				that.renderBtnConfig(driver, btn);
				row_el.removeClass("unused");

				btn.conf_toggle_el.addClass("open");
				btn.config_details_el.addClass("open");
				btn.edit_open = true;
			} else {
				btn.driver_axis = null;
				btn.driver_btn = null;
				btn.action = null;
				btn.assigned = false;
				btn.edit_open = false;

				that.renderBtnConfig(driver, btn);
				row_el.addClass("unused");
			}

			if (that.edited_controller.type == "touch") {
				that.renderTouchButtons();
			}

			that.checkControllerProfileSaved(
				that.edited_controller,
				that.current_profile,
			);
		});

		this.renderBtnConfig(driver, btn);

		if (assignment_sel_el.val()) {
			row_el.removeClass("unused");
		} else {
			row_el.addClass("unused");
		}

		line_1_el.appendTo(row_el);
		btn.config_details_el.appendTo(row_el);

		return row_el;
	}

	makeButtonsUI(driver) {
		let that = this;

		setTimeout(() => {
			if (!driver) {
				$("#gamepad-buttons-panel")
					.empty()
					.append('<span class="error">Driver not loaded</span>');
				return;
			}

			// all gamepad axes
			let button_els = [];
			for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
				let btn = driver.buttons[i_btn];
				let row_el = this.makeBtnRow(driver, btn);
				button_els.push(row_el);
			}

			let add_btn = null;
			if (this.edited_controller.type == "keyboard") {
				add_btn = $(
					'<button id="add-button-btn"><span class="icon"></span>Add key mapping</button>',
				);
			} else if (this.edited_controller.type == "touch") {
				add_btn = $(
					'<button id="add-button-btn"><span class="icon"></span>Add UI button</button>',
				);
			} else if (this.edited_controller.type == "gamepad") {
				add_btn = $(
					'<button id="add-button-btn"><span class="icon"></span>Add button</button>',
				);
			}

			if (add_btn) {
				add_btn.click((ev) => {
					let new_btn = that.makeButton(driver, that.edited_controller.type);
					if (that.edited_controller.type == "touch") {
						new_btn.src_label = "Aux " + new_btn.i; // init label
					}
					let row_el = that.makeBtnRow(driver, new_btn);
					row_el.insertBefore($("#add-button-btn"));
					$("#gamepad-buttons-panel").scrollTop(
						$("#gamepad-buttons-panel").prop("scrollHeight"),
					);
					that.checkControllerProfileSaved(
						that.edited_controller,
						that.current_profile,
					);
				});
				button_els.push(add_btn);
			}

			$("#gamepad-buttons-panel").empty().append(button_els);

			if (driver.buttons_scroll_offset !== undefined) {
				$("#gamepad-buttons-panel").scrollTop(driver.buttons_scroll_offset);
				delete driver.buttons_scroll_offset;
			}
		}, 0);
	}

	triggerBtnAction(c, btn) {
		if (!btn.assigned || btn.driver_axis || btn.driver_btn) return;

		console.warn("Btn " + btn.src_label + " trigerred");

		// btn.out_val_el.html('false').addClass('live');
		btn.val = true;
		btn.live = true;
		if (btn.reset_timer) clearTimeout(btn.reset_timer);
		btn.reset_timer = setTimeout(() => {
			btn.reset_timer = null;
			btn.val = false;
			btn.live = false;
		}, 100); // short flash
		let that = this;

		switch (btn.action) {
			case "ros-srv":
				let local_error = false;
				if (!btn.ros_srv_id) {
					this.ui.showNotification("ROS service not set", "error");
					console.warn("ROS service ID not set");
					local_error = true;
				} else if (!btn.ros_srv_msg_type) {
					console.error("Service msg_type not set");
					this.ui.showNotification(
						"Service " +
							btn.ros_srv_id +
							" not yet discovered, missing message type",
						"error",
					);
					local_error = true;
				} else if (btn.service_blocked) {
					this.ui.showNotification(
						"Skipping service " +
							btn.ros_srv_id +
							" call (previous call unfinished)",
						"error",
					);
					console.warn(
						"Skipping service " +
							btn.ros_srv_id +
							" call (previous call unfinished)",
					);
					local_error = true;
				}
				if (local_error) {
					if (btn.touch_btn_el) {
						// do the error btn wobble
						btn.touch_btn_el.addClass("btn_err");
						setTimeout(() => {
							btn.touch_btn_el.removeClass("btn_err");
						}, 600);
					}
					return;
				}

				if (btn.touch_btn_el) btn.touch_btn_el.addClass("working");

				btn.service_blocked = true;
				this.client.serviceCall(
					btn.ros_srv_id,
					btn.ros_srv_val ? btn.ros_srv_val : undefined,
					btn.ros_srv_silent_req,
					(reply) => {
						btn.service_blocked = false;
						if (reply !== undefined)
							// undefined means service call was cancelled here (by a callback)
							that.ui.serviceReplyNotification(
								btn.touch_btn_el,
								btn.ros_srv_id,
								!btn.ros_srv_silent_res,
								reply,
							);
					},
				);

				break;
			case "ctrl-enabled":
				let state = false;
				switch (btn.set_ctrl_state) {
					case 0:
						state = false;
						break;
					case 1:
						state = true;
						break;
					case 2:
						state = !c.enabled;
						break;
				}
				that.setControllerEnabled(c, state);
				break;
			case "input-profile":
				if (btn.set_ctrl_profile) {
					if (!that.profiles[btn.set_ctrl_profile]) {
						console.error(
							'Ignoring invalid input profile "' +
								btn.set_ctrl_profile +
								'"',
						);
						return;
					}
					console.log("Setting input profile to " + btn.set_ctrl_profile);

					that.closeProfileBasicsEdit();

					that.resetAll();
					that.current_profile = btn.set_ctrl_profile;
					that.saveLastUserProfile(that.current_profile);
					that.showInputProfileNotification();
					that.resetAll();
					that.makeUI();
					that.renderTouchButtons();
				}
				break;
			case "ui-profile":
				//TODO
				console.error("UI profiles TBD");
				break;
			default:
				break;
		}
	}

	unlockAllServices() {
		let that = this;
		Object.values(this.controllers).forEach((c) => {
			if (!c.profiles) return; //not yet configured

			Object.values(c.profiles).forEach((c_profile) => {
				Object.values(c_profile.driver_instances).forEach((driver) => {
					if (!driver) return; // not loaded

					for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
						let btn = driver.buttons[i_btn];
						if (btn.service_blocked) btn.service_blocked = false;
					}
				});
			});
		});
	}

	async updateAxesUIValues() {
		if (!this.open || !this.edited_controller || this.open_panel != "axes") return;

		setTimeout(() => {
			let profile = this.edited_controller.profiles[this.current_profile];

			if (!profile) return; // not loaded

			let driver = profile.driver_instances[profile.driver];

			if (!driver) return; // not loaded

			for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
				let axis = driver.axes[i_axis];

				if (axis.raw !== null && axis.raw !== undefined)
					axis.raw_val_el.html(axis.raw.toFixed(2));
				else axis.raw_val_el.html("0.00");

				if (!axis.driver_axis) continue;

				if (axis.val !== null && axis.val !== undefined)
					axis.out_val_el.html(axis.val.toFixed(2));
				else axis.out_val_el.html("0.00");

				if (axis.live) {
					axis.out_val_el.addClass("live");
				} else {
					axis.out_val_el.removeClass("live");
				}
			}
		}, 0);
	}

	async updateButtonsUIValues() {
		if (!this.open || !this.edited_controller || this.open_panel != "buttons") return;

		setTimeout(() => {
			let profile = this.edited_controller.profiles[this.current_profile];
			if (!profile) return; // not loaded

			let driver = profile.driver_instances[profile.driver];

			if (!driver) return; // not loaded

			for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
				let btn = driver.buttons[i_btn];
				if (btn.listening) continue;

				if (btn.raw_val_el) {
					if (this.edited_controller.type == "keyboard" && btn.id_src) {
						btn.raw_val_el.html(btn.src_label);

						if (btn.pressed) btn.raw_val_el.addClass("pressed");
						else btn.raw_val_el.removeClass("pressed");
					} else if (this.edited_controller.type == "touch" && btn.src_label) {
						btn.raw_val_el.html(btn.src_label);

						if (btn.pressed) btn.raw_val_el.addClass("pressed");
						else btn.raw_val_el.removeClass("pressed");
					} else if (Number.isInteger(btn.id_src)) {
						if (
							btn.driver_axis &&
							(btn.pressed || btn.touched) &&
							!(btn.raw === undefined || btn.raw === null)
						) {
							btn.raw_val_el.html(btn.raw.toFixed(2));
						} else if (btn.src_label) {
							btn.raw_val_el.html(btn.src_label);
						} else {
							btn.raw_val_el.html("none");
						}

						if (btn.touched) btn.raw_val_el.addClass("touched");
						else btn.raw_val_el.removeClass("touched");

						if (btn.pressed) btn.raw_val_el.addClass("pressed");
						else btn.raw_val_el.removeClass("pressed");
					} else {
						btn.raw_val_el.removeClass("touched");
						btn.raw_val_el.removeClass("pressed");
						btn.raw_val_el.html("none");
					}
				}

				if (btn.assigned && btn.out_val_el) {
					if (btn.driver_btn && (btn.val === true || btn.val === false))
						btn.out_val_el.html(btn.val.toString());
					else if (btn.driver_axis && btn.val !== null && btn.val !== undefined)
						btn.out_val_el.html(btn.val.toFixed(2));
					else btn.out_val_el.html(btn.val ? "true" : "false");

					if (btn.live) {
						btn.out_val_el.addClass("live");
					} else {
						btn.out_val_el.removeClass("live");
					}
				}
			}
		}, 0);
	}

	processAxesInput(c) {
		let profile = c.profiles[this.current_profile];
		let driver = profile.driver_instances[profile.driver];

		if (!driver) return; // not loaded

		let combined_axes_vals = {}; // 1st pass, same axess added to single val
		let combined_axes_unscaled_vals = {}; // expected to be within [-1; +1] (offset added and scaling sign kept)

		let some_axes_live = false;

		let axes_to_process = [].concat(driver.axes);
		for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
			if (driver.buttons[i_btn].driver_axis) {
				axes_to_process.push(driver.buttons[i_btn]); //button mapped as axis
			}
		}

		for (let i = 0; i < axes_to_process.length; i++) {
			let axis = axes_to_process[i];

			if (axis.dead_val === undefined)
				// unset on min/max change
				axis.dead_val = (axis.dead_min + axis.dead_max) / 2.0;

			if (!axis.driver_axis) continue;

			let raw = axis.raw;
			if (raw === null || raw === undefined) raw = axis.dead_val; //null => assign dead;

			let out = raw;

			let out_unscaled = raw;
			let live = true;
			if (raw > axis.dead_min && raw < axis.dead_max) {
				live = false;
				out = axis.dead_val;
				out_unscaled = axis.dead_val;
			} else {
				out += axis.offset;
				out_unscaled = out;
				if (axis.scale < 0)
					// sign matters (saving unsaled offset vals as normalized)
					out_unscaled = -1.0 * out_unscaled;
				out *= axis.scale;
			}

			axis.base_val = out;
			axis.val = out; // modifier might change this in 2nd pass
			axis.live = live;

			some_axes_live = some_axes_live || axis.live;

			if (combined_axes_vals[axis.driver_axis] === undefined) {
				combined_axes_vals[axis.driver_axis] = axis.base_val;
				combined_axes_unscaled_vals[axis.driver_axis] = out_unscaled;
			} else {
				// add multiple axes into one (use this for negative/positive split)
				combined_axes_vals[axis.driver_axis] += axis.base_val;
				combined_axes_unscaled_vals[axis.driver_axis] += out_unscaled;
			}
		}

		driver.axes_output = {}; // this goes to the driver

		// 2nd pass - modifiers that use base vals and split-axes added together
		for (let i = 0; i < axes_to_process.length; i++) {
			let axis = axes_to_process[i];

			if (!axis.driver_axis || !axis.live) {
				continue;
			}

			if (!axis.mod_func) {
				if (driver.axes_output[axis.driver_axis] === undefined)
					driver.axes_output[axis.driver_axis] = axis.val;
				else driver.axes_output[axis.driver_axis] += axis.val;
				continue; // all good
			}

			switch (axis.mod_func) {
				case "scale_by_velocity":
					if (
						!axis.scale_by_velocity_src ||
						combined_axes_unscaled_vals[axis.scale_by_velocity_src] ===
							undefined
					) {
						axis.val = axis.dead_val; // hold until fully configured
						axis.live = false;
						continue;
					}

					let velocity_normalized =
						combined_axes_unscaled_vals[axis.scale_by_velocity_src];
					let abs_velocity_normalized = Math.abs(
						Math.max(-1.0, Math.min(1.0, velocity_normalized)),
					); // clamp abs to [0.0; 1.0]

					let multiplier = lerp(
						axis.scale_by_velocity_mult_min,
						axis.scale_by_velocity_mult_max,
						abs_velocity_normalized,
					);

					axis.val *= multiplier;
					if (driver.axes_output[axis.driver_axis] === undefined)
						driver.axes_output[axis.driver_axis] = axis.val;
					else driver.axes_output[axis.driver_axis] += axis.val;

					// console.log('Scaling axis '+i_axis+' ('+axis.driver_axis+') by '+abs_velocity_normalized+' ('+axis.scale_by_velocity_src+') m='+multiplier)

					break;
				default:
					break;
			}
		}

		return some_axes_live;
	}

	processButtonsInput(c) {
		let profile = c.profiles[this.current_profile];
		let driver = profile.driver_instances[profile.driver];

		if (!driver) return; // not loaded

		let some_buttons_live = false;
		driver.buttons_output = {}; // this goes to the drive

		for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
			let btn = driver.buttons[i_btn];

			if (btn.driver_btn) {
				btn.val = false;
				if (btn.trigger === 0 && btn.touched) {
					btn.val = true;
				} else if (btn.trigger === 1 && btn.pressed) {
					btn.val = true;
				}
				btn.live = btn.val;
				some_buttons_live = btn.live || some_buttons_live;

				if (driver.buttons_output[btn.driver_btn] === undefined)
					driver.buttons_output[btn.driver_btn] = btn.val;
				else
					driver.buttons_output[btn.driver_btn] =
						btn.val || driver.buttons_output[btn.driver_btn]; // allow triggering with multiiple btns
			}
		}

		return some_buttons_live;
	}

	onGamepadConnected(ev) {
		let id_gamepad = ev.gamepad.id;
		const gp = navigator.getGamepads()[ev.gamepad.index];

		if (!gp) {
			console.warn("Error initiating gamepad", ev.gamepad);
			return;
		}

		if (!this.controllers[id_gamepad]) {
			let id_lowcase = id_gamepad.toLowerCase();
			let likely_not_gamepad =
				isTouchDevice() &&
				(id_lowcase.indexOf("keyboard") > -1 || // ¯\_(ツ)_/¯
					id_lowcase.indexOf("mouse") > -1); // not using gamepad defaults

			console.warn("Gamepad connected:", id_gamepad, ev.gamepad, gp, ev);
			let gamepad = {
				type: "gamepad",
				id: id_gamepad,
				gamepad: ev.gamepad,
				num_gamepad_axes: gp.axes.length,
				profiles: null,
				initiated: false, //this will wait for config
				connected: true,
				likely_not_gamepad: likely_not_gamepad,
			};
			this.controllers[id_gamepad] = gamepad;
			// this.save_gamepad_was_once_connected();
		} else {
			this.controllers[id_gamepad].gamepad = ev.gamepad;
			this.controllers[id_gamepad].num_gamepad_axes = gp.axes.length;
			this.controllers[id_gamepad].connected = true;
			console.info("Gamepad was already connected:", id_gamepad);
		}

		let label = id_gamepad.split("(")[0]; // remove (Vendor: xxx)
		this.ui.showNotification(label + " connected");

		this.initController(this.controllers[id_gamepad]);
	}

	onGamepadDisconnected(ev) {
		if (this.controllers[ev.gamepad.id]) {
			console.log("Gamepad disconnected " + ev.gamepad.id);
			this.controllers[ev.gamepad.id].gamepad = null;
			this.controllers[ev.gamepad.id].connected = false;

			this.makeControllerIcons();

			let label = ev.gamepad.id.split("(")[0]; // remove (Vendor: xxx)
			this.ui.showNotification(label + " disconnected");
		}
	}

	makeTouchGamepad() {
		if (!this.controllers["touch"]) {
			let touch_gamepad = {
				type: "touch",
				id: "touch",
				profiles: null,
				initiated: false, //this will wait for config
				connected: true,
			};
			this.controllers["touch"] = touch_gamepad;
			this.initController(touch_gamepad);
		}
	}

	makeKeyboard() {
		if (!this.controllers["keyboard"]) {
			let kb = {
				type: "keyboard",
				id: "keyboard",
				profiles: null,
				initiated: false, //this will wait for config
				connected: true,
			};
			this.controllers["keyboard"] = kb;
			this.edited_controller = kb;
			this.initController(kb);
		}
	}

	setTouchGamepadOn(state) {
		this.touch_gamepad_on = state;
		// this.controllers['touch'].connected = state;

		if (state) {
			if (this.edited_controller != this.controllers["touch"]) {
				this.edited_controller = this.controllers["touch"];
			}
			this.initController(this.controllers["touch"]);
		} else {
			this.makeControllerIcons();
		}
	}

	setTouchGamepadInput(joy_id, value, angle) {
		if (value) {
			if (!this.last_touch_input[joy_id]) {
				this.last_touch_input[joy_id] = new THREE.Vector2();
			}
			this.last_touch_input[joy_id].set(value, 0);
			this.last_touch_input[joy_id].rotateAround(this.zero2, angle);
		} else {
			delete this.last_touch_input[joy_id];
		}
	}

	runInputLoop() {
		if (!this.loop_running) {
			console.log("Input loop stopped");
			this.loop_running = false;
			return;
		}

		let topics_transmitted_this_frame = {};

		let that = this;
		Object.values(this.controllers).forEach((c) => {
			if (!c.profiles) return; //not yet configured

			let c_profile = c.profiles[that.current_profile];
			if (!c_profile) return; // driver not loaded
			let driver = c_profile.driver_instances[c_profile.driver];
			if (!driver) return; // not loaded

			if (c.type == "touch") {
				if (this.last_touch_input["left"]) {
					driver.axes[0].raw = this.last_touch_input["left"].x;
					driver.axes[1].raw = this.last_touch_input["left"].y;
				} else {
					driver.axes[0].raw = 0.0;
					driver.axes[1].raw = 0.0;
				}
				if (this.last_touch_input["right"]) {
					driver.axes[2].raw = this.last_touch_input["right"].x;
					driver.axes[3].raw = this.last_touch_input["right"].y;
				} else {
					driver.axes[2].raw = 0.0;
					driver.axes[3].raw = 0.0;
				}
			} else if (c.type == "keyboard") {
				// handle in onKeyboardKeyDown/up
			} else if (c.type == "gamepad") {
				if (c.gamepad) {
					try {
						let gps = navigator.getGamepads();
						let gp = c.gamepad ? gps[c.gamepad.index] : null;
						if (!gp) {
							return;
						}
						for (let i = 0; i < gp.axes.length; i++) {
							let read_val = gp.axes[i];
							if (driver.axes[i].needs_reset) {
								if (read_val != 0.0) {
									// wait for first non-zero signal because some gamepads are weird
									delete driver.axes[i].needs_reset;
									driver.axes[i].raw = read_val;
									// console.log('GP axis '+i+'; reset val='+read_val)
								} else {
									driver.axes[i].raw = null;
								}
							} else {
								driver.axes[i].raw = read_val;
							}
						}

						if (driver.on_button_press) {
							// user mapping
							for (let i = 0; i < gp.buttons.length; i++) {
								if (gp.buttons[i].pressed) {
									driver.on_button_press(i);
								}
							}
						} else {
							for (let j = 0; j < driver.buttons.length; j++) {
								let btn = driver.buttons[j];
								if (btn.id_src === null) continue;

								let gp_btn = gp.buttons[btn.id_src];
								if (!btn || !gp_btn) continue;

								let read_val = gp_btn.value;
								let was_pressed = btn.pressed;
								let was_touched = btn.touched;
								if (btn.needs_reset) {
									if (!gp_btn.pressed && !gp_btn.touched) {
										// wait for first non-zero signal because some gamepads are weird
										delete btn.needs_reset;
										btn.raw = read_val;
										btn.pressed = gp_btn.pressed;
										btn.touched = gp_btn.touched;
										// console.log('GP axis '+i+'; reset val='+read_val)
									} else {
										btn.raw = null;
										btn.pressed = false;
										btn.touched = false;
									}
								} else {
									btn.raw = read_val;
									btn.pressed = gp_btn.pressed;
									btn.touched = gp_btn.touched;
								}

								// down handlers & repeat
								if (btn.trigger == 0) {
									// touch
									if (btn.touched && !was_touched) {
										that.triggerBtnAction(c, btn);
										if (btn.repeat) {
											if (btn.repeat_timer)
												clearInterval(btn.repeat_timer);
											btn.repeat_timer = setInterval(() => {
												that.triggerBtnAction(c, btn);
											}, that.input_repeat_delay);
										}
									} else if (
										!btn.touched &&
										was_touched &&
										btn.repeat_timer
									) {
										clearInterval(btn.repeat_timer);
										delete btn.repeat_timer;
									}
								} else if (btn.trigger == 1) {
									// press
									if (btn.pressed && !was_pressed) {
										that.triggerBtnAction(c, btn);
										if (btn.repeat) {
											if (btn.repeat_timer)
												clearInterval(btn.repeat_timer);
											btn.repeat_timer = setInterval(() => {
												that.triggerBtnAction(c, btn);
											}, that.input_repeat_delay);
										}
									} else if (
										!btn.pressed &&
										was_pressed &&
										btn.repeat_timer
									) {
										clearInterval(btn.repeat_timer);
										delete btn.repeat_timer;
									}
								} else if (
									btn.trigger == 2 &&
									!btn.pressed &&
									!btn.touched &&
									(was_pressed || was_touched)
								) {
									// release
									that.triggerBtnAction(c, btn);
								}
							}
						}
					} catch (e) {
						console.error("Error reading gp; c.gp=", c.gamepad);
						console.log(e);
						return;
					}
				} else {
					for (let i = 0; i < driver.axes.length; i++) {
						driver.axes[i].raw = null;
						driver.axes[i].needs_reset = true;
					}
					for (let i = 0; i < driver.buttons.length; i++) {
						driver.buttons[i].raw = null;
						driver.buttons[i].needs_reset = true;
						driver.buttons[i].pressed = false;
						driver.buttons[i].touched = false;
					}
				}
			} else return; //nothing to do for this controller atm

			let axes_alive = this.processAxesInput(c) && c.connected;
			let buttons_alive = this.processButtonsInput(c) && c.connected;
			let cooldown = false;
			let transmitted_last_frame =
				this.topics_transmitted_last_frame[driver.output_topic];

			if (!axes_alive && !buttons_alive && transmitted_last_frame) {
				// cooldown for 1s to make sure zero values are received
				if (that.cooldown_drivers[driver.output_topic] === undefined) {
					that.cooldown_drivers[driver.output_topic] = {
						started: Date.now(),
						driver: driver,
					};
					cooldown = true;
				} else if (
					that.cooldown_drivers[driver.output_topic].started + 1000 >
					Date.now()
				) {
					cooldown = true;
				}
			} else if (that.cooldown_drivers[driver.output_topic] !== undefined) {
				delete that.cooldown_drivers[driver.output_topic]; // some axes alive => reset cooldown
			}

			let can_transmit = driver.canTransmit();
			let transmitting =
				c.enabled && (axes_alive || buttons_alive || cooldown) && can_transmit;

			driver.generate();

			if (this.open && this.edited_controller == c && this.open_panel == "output") {
				driver.displayOutput(this.debug_output_panel, transmitting);
			}

			// c.transmitted_last_frame = transmitting;
			c.transmitting_user_input = transmitting && !cooldown; // more intuitive user feedback

			let had_error = c.has_error;
			c.has_error =
				!can_transmit && c.enabled && (axes_alive || buttons_alive || cooldown);
			c.show_error = false;

			if (transmitting) {
				c.has_error = !driver.transmit();
				topics_transmitted_this_frame[driver.output_topic] = driver;
			}
			if (c.has_error && !cooldown) {
				if (!had_error) {
					driver.write_error_started = Date.now();
				}

				if (!can_transmit) {
					c.show_error = true; // writer failed to even set up
				} else if (
					!driver.first_write_error_resolved &&
					Date.now() > driver.write_error_started + 3000
				) {
					c.show_error = true; // wait 3s in case of the 1st error before reporting problem (writer needs to set up)
				} else if (driver.first_write_error_resolved) {
					c.show_error = true; // all further errors report immediately
				}
			} else if (!c.has_error && had_error) {
				driver.first_write_error_resolved = true;
			}

			that.updateControllerIcon(c);
			that.updateInputStatusIcon();
		});

		let topics_transmitted_last_frame = Object.keys(
			this.topics_transmitted_last_frame,
		);
		topics_transmitted_last_frame.forEach((topic) => {
			if (!topics_transmitted_this_frame[topic] && !this.cooldown_drivers[topic]) {
				let driver = that.topics_transmitted_last_frame[topic];
				that.cooldown_drivers[topic] = {
					started: Date.now(),
					driver: driver,
				};
				driver.reset_all_output(); //make sure we send all zeroes
			}
		});

		// cooldown topic even when driver was switched for a controller
		let cooldown_topics = Object.keys(this.cooldown_drivers);
		cooldown_topics.forEach((topic) => {
			if (topics_transmitted_this_frame[topic]) return;

			if (that.cooldown_drivers[topic].started + 1000 < Date.now()) {
				delete that.cooldown_drivers[topic];
			} else {
				that.cooldown_drivers[topic].driver.generate();
				that.cooldown_drivers[topic].driver.transmit();
			}
		});

		this.topics_transmitted_last_frame = topics_transmitted_this_frame;

		this.updateAxesUIValues();
		this.updateButtonsUIValues();

		requestAnimationFrame((t) => this.runInputLoop());
	}

	driverHasKeyBinding(driver, key) {
		for (let i = 0; i < driver.buttons.length; i++) {
			let btn = driver.buttons[i];
			if (btn.id_src == key) {
				return true;
			}
		}
		return false;
	}

	driverHasKeyModBinding(driver, key, mod) {
		for (let i = 0; i < driver.buttons.length; i++) {
			let btn = driver.buttons[i];
			if (btn.id_src == key && btn.key_mod == mod) {
				return true;
			}
		}
		return false;
	}

	debugPressedKeyboardKeys() {
		console.log(
			"Down: " +
				(this.pressed_kb_keys.length ? this.pressed_kb_keys.join(", ") : "-") +
				" Mods: " +
				(this.pressed_kb_mods.length ? this.pressed_kb_mods.join() : "-"),
		);
	}

	updatePressedKeybaordButtons(controller, driver) {
		for (let i = 0; i < driver.buttons.length; i++) {
			let btn = driver.buttons[i];

			let key_pass = this.pressed_kb_keys.indexOf(btn.id_src) > -1;
			let mod_pass = false;
			if (key_pass) {
				if (["shift", "control", "alt"].indexOf(btn.id_src) > -1) {
					mod_pass = true;
				} else if (!btn.key_mod) {
					let competing_with_mod_found = false;
					for (let j = 0; j < this.pressed_kb_mods.length; j++) {
						if (
							this.driverHasKeyModBinding(
								driver,
								btn.id_src,
								this.pressed_kb_mods[j],
							)
						) {
							competing_with_mod_found = true;
							break;
						}
					}
					mod_pass = !competing_with_mod_found;
				} else {
					mod_pass = this.pressed_kb_mods.indexOf(btn.key_mod) > -1;
				}
			}

			if (!btn.pressed && key_pass && mod_pass) {
				btn.pressed = true;
				btn.raw = 1.0;

				// down handlers & repeat
				if (btn.trigger == 1) {
					this.triggerBtnAction(controller, btn);
					if (btn.repeat) {
						btn.repeat_timer = setInterval(() => {
							this.triggerBtnAction(controller, btn);
						}, this.input_repeat_delay);
					}
				}
			} else if (btn.pressed && (!key_pass || !mod_pass)) {
				btn.pressed = false;
				btn.raw = 0.0;

				if (btn.repeat_timer) {
					clearInterval(btn.repeat_timer);
					delete btn.repeat_timer;
				}

				// up handlers
				if (btn.trigger == 2) {
					this.triggerBtnAction(controller, btn);
				}
			}
		}
	}

	onKeyboardKeyDown(ev, c) {
		if (
			ev.srcElement &&
			ev.srcElement.nodeName &&
			["input", "textarea"].indexOf(ev.srcElement.nodeName.toLowerCase()) > -1
		)
			return; // ignore input fields

		let key = ev.key.toLowerCase();
		let mod = this.modKeyFromKeyboardKey(key);

		if (ev.metaKey || key == "meta") return; // ignore all

		if (["Escape", "Delete", "Backspace"].indexOf(ev.code) > -1) {
			// kb cancel & del work for all controllers
			let that = this;
			Object.values(this.controllers).forEach((c) => {
				if (!c.profiles) return;
				let p = c.profiles[that.current_profile];
				let d = p.driver_instances[p.driver];
				if (d.on_button_press) {
					d.on_button_press(ev.code, ev);
				}
			});
			return;
		}

		if (!c || !c.profiles) return;
		let c_profile = c.profiles[this.current_profile];
		let driver = c_profile.driver_instances[c_profile.driver];
		if (!driver) return; // not loaded

		if (driver.on_button_press) {
			// user is mapping a key
			if (["shift", "control", "alt"].indexOf(key) > -1) {
				return; // ignore single modifiers here
			}
			driver.on_button_press(ev.code, ev);
			return;
		}

		let change = false;
		if (this.pressed_kb_keys.indexOf(key) === -1) {
			this.pressed_kb_keys.push(key);
			change = true;
		}
		if (mod && this.pressed_kb_mods.indexOf(mod) === -1) {
			this.pressed_kb_mods.push(mod);
			change = true;
		}

		if (change) {
			// this.debugPressedKeyboardKeys();
			this.updatePressedKeybaordButtons(c, driver);
		}

		if (this.driverHasKeyBinding(driver, key)) {
			ev.preventDefault();
		}
	}

	onKeyboardKeyUp(ev, c) {
		if (
			ev.srcElement &&
			ev.srcElement.nodeName &&
			["input", "textarea"].indexOf(ev.srcElement.nodeName.toLowerCase()) > -1
		)
			return; // ignore input fields

		let key = ev.key.toLowerCase();
		let mod = this.modKeyFromKeyboardKey(key);

		if (ev.metaKey || key == "meta") return; // ignore all

		if (!c || !c.profiles) return;
		let c_profile = c.profiles[this.current_profile];
		let driver = c_profile.driver_instances[c_profile.driver];
		if (!driver) return; // not loaded

		if (driver.on_button_press) {
			// user still mapping (if still listening for key up, this must be a single modifier)
			driver.on_button_press(ev.code, ev);
			return; // assigned
		}

		let change = false;
		let pos = this.pressed_kb_keys.indexOf(key);
		if (pos > -1) {
			this.pressed_kb_keys.splice(pos, 1);
			change = true;
		}
		if (mod) {
			pos = this.pressed_kb_mods.indexOf(mod);
			if (pos > -1) {
				this.pressed_kb_mods.splice(pos, 1);
				change = true;
			}
		}

		if (change) {
			// this.debugPressedKeyboardKeys();
			this.updatePressedKeybaordButtons(c, driver);
		}

		if (this.driverHasKeyBinding(driver, key)) {
			ev.preventDefault();
		}
	}
}
