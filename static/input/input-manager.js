import { isIOS, lerp, isTouchDevice } from '../lib.js';
import * as THREE from 'three';

export class InputManager {

    constructor(client) {

        this.client = client;
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
        this.controller_enabled_cb = $('#controller-enabled-cb');
        this.controller_enabled_cb.prop('checked', false);
        this.input_status_icon = $('#input-status-icon');
        this.debug_output_panel = $('#gamepad-output-panel');

        this.cooldown_drivers = {};
        this.topics_transmitted_last_frame = {};

        let that = this;
        this.zero2 = new THREE.Vector2(0,0);

        this.last_touch_input = {};
        let last_robot_defaults = localStorage.getItem('last-robot-input-defaults:'+this.client.id_robot);
        if (last_robot_defaults != null)
            last_robot_defaults = JSON.parse(last_robot_defaults);
        this.enabled = last_robot_defaults != null;

        client.on('input_config', (drivers, defaults)=>{ that.set_config(drivers, defaults); });
        client.on('services', (discovered_services)=>{ that.on_services_updated(discovered_services); });

        this.open = false;
        this.open_panel = 'axes'; // axes, buttons, output, settings

        this.input_status_icon.click(() => {
            // if (!that.initiated)
            //     return; //wait 
            $('#keyboard').removeClass('open');
            if (!$('#gamepad').hasClass('open')) {
                that.open = true;
                $('#gamepad').addClass('open');
                $('BODY').addClass('gamepad-editing');
                if (this.edited_controller && this.edited_controller.type == 'touch') {
                    $('#touch-gamepad-left').appendTo($('#gamepad-touch-left-zone'));
                    $('#touch-gamepad-right').appendTo($('#gamepad-touch-right-zone'));
                    $('#touch-gamepad-left > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                    $('#touch-gamepad-right > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                }
                $('#input-underlay').css('display', 'block')
                    .unbind()
                    .click((ev)=>{
                        $(ev.target).unbind();
                        that.input_status_icon.click();
                    })
            } else {
                that.open = false;
                $('#gamepad').removeClass('open');
                $('BODY').removeClass('gamepad-editing');
                if (this.edited_controller && this.edited_controller.type == 'touch') {
                    $('#touch-gamepad-left').appendTo($('BODY'));
                    $('#touch-gamepad-right').appendTo($('BODY'));
                    $('#touch-gamepad-left > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                    $('#touch-gamepad-right > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                }
                $('#input-underlay').css('display', '').unbind();
            }

            that.make_touch_buttons_editable();
        });

        $('#graph_controls, #service_controls, #camera_controls, #docker_controls, #widget_controls').on('mouseenter', (ev) => {
            if (that.open) {
                console.log('hiding im');
                that.input_status_icon.click();
            }
        });

        window.addEventListener('gamepadconnected', (ev) => this.on_gamepad_connected(ev));
        window.addEventListener('gamepaddisconnected', (ev) => this.on_gamepad_disconnected(ev));
    
        $('#gamepad_settings .tab').click((ev)=>{
            if ($(ev.target).hasClass('active'))
                return;
            $('#gamepad_settings .tab')
                .removeClass('active');
            
            $('#gamepad_settings .panel')
                .removeClass('active');
            let id_open_panel = '';
            let open_tab = ev.target;
            switch (ev.target.id) {
                case 'gamepad-axes-tab': id_open_panel = '#gamepad-axes-panel'; that.open_panel = 'axes'; break;
                case 'gamepad-buttons-tab': id_open_panel = '#gamepad-buttons-panel'; that.open_panel = 'buttons'; break;
                case 'gamepad-output-tab': id_open_panel = '#gamepad-output-panel'; that.open_panel = 'output'; break;
                case 'gamepad-settings-tab':
                case 'profile-unsaved-warn':
                    id_open_panel = '#gamepad-settings-panel';
                    open_tab = '#gamepad-settings-tab';
                    that.open_panel = 'settings';
                    break;
                default: return;
            }
            $(open_tab) 
                .addClass('active')
            $(id_open_panel)
                .addClass('active');

            that.make_touch_buttons_editable();
        });
        $('#profile-unsaved-warn').click((ev)=>{
            $('#gamepad-settings-tab').click();
        });

        this.controller_enabled_cb.change((ev) => {
            that.set_controller_enabled(that.edited_controller, $(ev.target).prop('checked'));
        });

        this.editing_profile_basics = false;
        $('#profile-buttons > .icon, #profile-unsaved-warn').click((ev)=>{
            if (that.editing_profile_basics) {
                that.close_profile_basics_edit();
                return;
            }

            if ($('#profile-buttons').hasClass('open')) {
                that.close_profile_menu();
            } else {
                $('#profile-buttons').addClass('open');
                $('#input-manager-overlay')
                    .css('display', 'block')
                    .unbind()
                    .click((ev_u)=>{
                        that.close_profile_menu();
                    });
            }
        });

        $('#save-input-profile').click((ev)=>{
            that.save_user_profile(that.current_profile);
            that.close_profile_menu();
        });

       
        $('#edit-input-profile').click(()=>{
            that.close_profile_menu();
            $('#gamepad-settings-container').addClass('editing_profile_basics');
            that.editing_profile_basics = true;
            $('#input-profile-edit-label')
                .val(that.profiles[that.current_profile].label)
                .unbind()
                // .on('contextmenu', that.prevent_context_menu)
                .change((ev)=>{
                    that.profiles[that.current_profile].label = $('#input-profile-edit-label').val().trim();
                    that.check_profile_basics_saved(that.current_profile, false);
                    that.make_profile_selector_ui();
                })
            $('#input-profile-edit-id')
                .val(that.current_profile)
                .unbind()
                // .on('contextmenu', that.prevent_context_menu)
                .change((ev)=>{
                    let new_id = $('#input-profile-edit-id').val().trim();
                    that.reset_all();
                    let old_id = that.current_profile;
                    if (old_id != new_id) {
                        that.profiles[new_id] = that.profiles[old_id];
                        that.profiles[new_id].id = new_id;
                        delete that.profiles[old_id];
                        that.current_profile = new_id;
                        Object.values(that.controllers).forEach((c)=>{
                            c.profiles[new_id] = c.profiles[old_id];
                            delete c.profiles[old_id];
                        });
                    }
                    that.reset_all();
                    that.check_profile_basics_saved(that.current_profile, false);
                    that.make_ui();
                });
        });

        $('#delete-input-profile')
            .click((ev)=>{
                console.log('clicked', ev.target);
                if ($('#delete-input-profile').hasClass('warn')) {
                    that.delete_current_profile();
                    $('#delete-input-profile').removeClass('warn');
                    that.close_profile_menu();
                    return;
                } else {
                    $('#delete-input-profile').addClass('warn');
                }
            })
            .blur((ev)=>{
                $('#delete-input-profile').removeClass('warn');
            });

        $('#duplicate-input-profile').click((ev)=>{
            that.close_profile_menu();
            that.close_profile_basics_edit();
            that.duplicate_current_profile();
        });

        $('#input-profile-json').click((ev)=>{
            that.profile_json_to_clipboard(that.current_profile);
        });
        $('#full-input-json').click((ev)=>{
            that.full_json_to_clipboard();
        });

        if (isTouchDevice()) {
            this.make_touch_gamepad();
            this.render_touch_buttons();
        }   
        
        this.make_keyboard();
        // this.last_keyboard_input = {};
        document.addEventListener('keydown', (ev) => that.on_keyboard_key_down(ev, that.controllers['keyboard']));
        document.addEventListener('keyup', (ev) => that.on_keyboard_key_up(ev, that.controllers['keyboard']));
        window.addEventListener("blur", (event) => {
            // reset all controllers
            console.log('Window lost focus');
            that.reset_all();
        });

        this.make_ui();
    }

    on_ui_config() {
        if (!this.enabled)
            return;
        this.make_ui(); // ui config may arrive later, render again with current vals (like wifi_scan_enabled)
    }

    set_config(enabled_drivers, robot_defaults) {
        
        if (!this.profiles) { // only once 

            if (!enabled_drivers || !enabled_drivers.length) { // no drivers allowed => no input
                console.log('Input is disabled by the robot');
                // hide monkey and touch icon from UI
                $('#gamepad').css('display', 'none');
                $('#touch_ui').css('display', 'none');
                this.enabled = false;
                localStorage.removeItem('last-robot-input-defaults:'+this.client.id_robot);
                return;
            }

            this.enabled = true;
            localStorage.setItem('last-robot-input-defaults:'+this.client.id_robot, JSON.stringify(robot_defaults)); // show icons & buttons right away next time to make the UI feel (more) solid

            this.profiles = {};

            console.info(`Input manager got robot config; enabled_drivers=[${enabled_drivers.join(', ')}]:`, robot_defaults);

            this.enabled_drivers = enabled_drivers; // input_drivers array from the robot's config

            this.robot_defaults = robot_defaults; // json from the 'input_defaults' file on the robot
                
            this.user_defaults = {};
           
            //let user_defaults = {};
            //this.user_defaults = user_defaults ? JSON.parse(user_defaults) : {};
    
            // console.log('Loaded user input defaults: ', this.user_defaults);

            // robot defined profiles
            Object.keys(this.robot_defaults).forEach((id_profile)=>{
                if (this.current_profile === null)
                    this.current_profile = id_profile; // 1st is default
                if (!this.profiles[id_profile]) {
                    let label = robot_defaults[id_profile].label ? robot_defaults[id_profile].label : id_profile;
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
            let saved_user_profile_ids = this.load_user_profile_ids();
            this.saved_user_profile_ids = [];
            if (saved_user_profile_ids) {
                saved_user_profile_ids.forEach((id_profile)=>{

                    let profile_data = this.load_user_profile(id_profile);
    
                    if (!profile_data)
                        return;
    
                    this.saved_user_profile_ids.push(id_profile);
                    this.saved_user_profiles[id_profile] = profile_data;
    
                    if (!this.profiles[id_profile]) { // user's own profile
                        let label = this.saved_user_profiles[id_profile].label ? this.saved_user_profiles[id_profile].label : id_profile;
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
                            this.profiles[id_profile].label = this.saved_user_profiles[id_profile].label;
                            this.profiles[id_profile].label_saved = this.saved_user_profiles[id_profile].label;
                        }
                    }
                });
            }

            let last_user_profile = this.load_last_user_profile();
            console.log('Loaded last input profile :', last_user_profile);

            if (last_user_profile && this.profiles[last_user_profile]) {
                this.current_profile = last_user_profile;
            }

            if (Object.keys(this.profiles).length == 0) {
                console.warn('No input profiles defined, making a new one...');
                this.current_profile = this.make_new_profile();
            }

        } else {
            console.info(`Input manager got robot config, reload the page to update`); // ignoring input config updates
        }
        
        this.make_profile_selector_ui();

        Object.values(this.controllers).forEach((c)=>{
            this.init_controller(c);
        });
    }

    show_input_profile_notification(force=false) {
        if (!this.current_profile)
            return;
        if (!force && Object.keys(this.profiles).length < 2)
            return;
        if (!force && this.current_profile == this.last_profile_notification)
            return;
        this.last_profile_notification = this.current_profile;
        this.ui.show_notification('Input profile is '+this.profiles[this.current_profile].label);
    }

    init_controller(c) {

        if (!this.enabled || this.robot_defaults === null) // wait for robot config & cookie overrides
            return;

        if (!c.profiles) { // only once

            c.profiles = {};
            
            Object.keys(this.profiles).forEach((id_profile)=>{

                // robot defaults
                let profile_default_cfg = {};
                if (this.robot_defaults[id_profile]) {
                    if (this.robot_defaults[id_profile][c.type] && (c.type != 'gamepad' || !c.likely_not_gamepad)) // robot defaults per type (ignoring suspicions non-gamepads on mobile devices)
                        profile_default_cfg = this.robot_defaults[id_profile][c.type];
                    if (this.robot_defaults[id_profile][c.id]) { // robot defaults per controller id
                        profile_default_cfg = this.robot_defaults[id_profile][c.id];
                    }
                }

                // overwrite with user's defaults
                if (this.saved_user_profiles[id_profile] && this.saved_user_profiles[id_profile][c.id]) {
                    let user_defaults = this.saved_user_profiles[id_profile][c.id];
                    console.log(c.id+' loaded user defults for '+id_profile, user_defaults);
                    profile_default_cfg = user_defaults;
                }

                let driver = profile_default_cfg.driver;
                if (!driver || this.enabled_drivers.indexOf(driver) < 0) {
                    driver = this.enabled_drivers[0];
                    console.warn('Controller profile '+id_profile+' for '+c.type+' missing driver, fallback='+driver+'; config=', profile_default_cfg)
                }

                let c_profile = {
                    driver: driver,
                    default_driver_config: {},
                    default_axes_config: profile_default_cfg.axes ? profile_default_cfg.axes : [],
                    default_buttons_config: profile_default_cfg.buttons ? profile_default_cfg.buttons : []
                }
                
                if (profile_default_cfg.driver_config && driver == profile_default_cfg.driver) { //only using driver defaults if the driver matches
                    c_profile.default_driver_config[driver] = profile_default_cfg.driver_config;
                }

                c.profiles[id_profile] = c_profile;

                this.init_controller_profile(c, c_profile);
                this.set_saved_controller_profile_state(c, id_profile);
                c.profiles[id_profile].saved = true;

                // if (profile_default_cfg.default) { // default profile by robot
                //     c.current_profile = id_profile;
                // }
            });

            if (this.open)
                this.edited_controller = c; // autofocus latest

            this.set_controller_enabled(c, c.type == 'touch' ? false : this.load_user_controller_enabled(c.id), false); // touch gets enabled by virtual gamepad

            console.log('Initiated profiles for gamepad '+c.id);
        }

        this.make_controller_icons();        

        if (this.edited_controller == c) {
            this.make_ui();
        }

        if (c.type == 'touch') {
            this.render_touch_buttons();
        }

        if (!this.loop_running) {
            this.loop_running = true;
            requestAnimationFrame((t) => this.run_input_loop());
        }
    }

    set_controller_enabled(c, state, update_icons=true) {
        let report_change = c.enabled != state && (c.enabled !== undefined || state); // initial enabled = undefined (don't report on init, unless on)

        c.enabled = state;
        this.save_user_controller_enabled(c);
        
        if (c === this.edited_controller) {
            this.controller_enabled_cb.prop('checked', c.enabled);
        }

        if (c.type == 'touch') {
            if (c.enabled && !this.touch_gamepad_on) {
                this.ui.toggleTouchGamepad();
            } else {
                this.ui.update_touch_gamepad_icon();
            }
            this.render_touch_buttons();
        }

        // disable controllers producing into the same topic to avoid conflicsts
        if (state) {
            let c_ids = Object.keys(this.controllers);
            let d = c.profiles[this.current_profile].driver_instances[c.profiles[this.current_profile].driver];
            c_ids.forEach((cc_id) => {
                let cc = this.controllers[cc_id];
                if (cc_id == c.id)
                    return;
                if (!cc.enabled)
                    return;
                let dd = cc.profiles[this.current_profile].driver_instances[cc.profiles[this.current_profile].driver];
                if (dd.output_topic == d.output_topic) {
                    this.set_controller_enabled(cc, false, false);
                }
            });
        }

        if (report_change) {
            let label = c.id;
            if (label == 'touch')
                label = 'Touch input';
            else if (label == 'keyboard')
                label = 'Keyboard';
            else 
                label = label.split('(')[0]; // remove (Vendor: xxx)
            this.ui.show_notification(label + (state ? ' enabled' : ' disabled'));
            if (state)
                this.show_input_profile_notification();
        }

        if (update_icons)
            this.make_controller_icons();
    }

    disable_controllers_with_conflicting_diver(active_driver) {
        
        let change = false;
        let c_ids = Object.keys(this.controllers);

        let c = null; // find controller by provided driver (driver has no ref)
        c_ids.forEach((cc_id) => {
            let cc = this.controllers[cc_id];
            if (!cc.enabled)
                return;
            let d = cc.profiles[this.current_profile].driver_instances[cc.profiles[this.current_profile].driver];
            if (d == active_driver) {
                c = cc;
                return;
            }
        });

        if (!c)
            return;

        c_ids.forEach((cc_id) => {
            let cc = this.controllers[cc_id];
            if (!cc.enabled)
                return;
            let d = cc.profiles[this.current_profile].driver_instances[cc.profiles[this.current_profile].driver];
            if (d == active_driver)
                return;
            if (d.output_topic == active_driver.output_topic) {
                change = true;
                this.set_controller_enabled(cc, false, false);
            }
        });
        
        if (change) {
            this.make_controller_icons();
        }
    }

    make_new_profile() {
        this.reset_all(); // reset current input

        let id_new_profile = 'Profile-'+Date.now();
        console.log('Making '+id_new_profile);
        this.profiles[id_new_profile] = {
            id: id_new_profile,
            label: id_new_profile,
        }
        let first_profile_created = false;
        Object.values(this.controllers).forEach((c)=>{
            let initial_driver = this.enabled_drivers[0]; // must be at least one for input manager to be active
            let initial_driver_config = {}
            if (this.current_profile) { // copy current
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
            }
            if (!c.profiles)
                c.profiles = {};
            c.profiles[id_new_profile] = c_profile;
            this.init_controller_profile(c, c_profile);
        });

        this.current_profile = id_new_profile;
        this.reset_all(); // new profile needs reset before triggering
        this.make_ui();
        this.render_touch_buttons();

        this.check_all_controller_profiles_saved();

        // focus driver options first
        if (!first_profile_created)
            $('#gamepad_settings #gamepad-settings-tab').click();

        return id_new_profile;
    }

    // duplicate_current_profile() {
        
    //     this.reset_all(); // reset current input
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
    //         this.init_controller_profile(c, c_profile);
    //     });

    //     this.current_profile = id_new_profile;
    //     this.reset_all(); // new profile needs reset before triggering
    //     this.make_ui();
    //     this.render_touch_buttons();

    //     this.check_all_controller_profiles_saved();

    //     // focus driver options first
    //     $('#gamepad_settings #gamepad-settings-tab').click();
    // }
    
    delete_current_profile() {
        
        this.reset_all(); // stop repeats etc

        let id_delete = this.current_profile;
        let saved_id_delete = this.profiles[id_delete].id_saved;
        let old_profile_ids = Object.keys(this.profiles);
        let old_pos = old_profile_ids.indexOf(id_delete);
        
        console.log('Deleting profile '+id_delete+' (saved id was '+saved_id_delete+')');

        if (this.saved_user_profiles[id_delete]) {
            localStorage.removeItem('input-profile:' + this.client.id_robot + ':' + id_delete);
            delete this.saved_user_profiles[id_delete];
        }
        let ids_pos = this.saved_user_profile_ids.indexOf(id_delete);
        if (ids_pos > -1) {
            this.saved_user_profile_ids.splice(ids_pos, 1);
        }
        this.save_user_profile_ids(this.saved_user_profile_ids);

        delete this.profiles[id_delete];
        let remaining_profile_ids = Object.keys(this.profiles);

        if (remaining_profile_ids.length == 0) {
            console.log('No profile to autoselect, making new');
            this.make_new_profile();
        } else {
            let new_pos = old_pos;
            while (!remaining_profile_ids[new_pos] && new_pos > 0) {
                new_pos--;
            }
            let id_select = remaining_profile_ids[new_pos];

            console.log('Autoselecting '+id_select);
            this.current_profile = id_select;
            this.reset_all();
            this.make_ui();
            this.render_touch_buttons();

            this.check_all_controller_profiles_saved();

            if (this.current_profile == this.profiles[this.current_profile].id_saved) { //new profile remembered when saved
                this.save_last_user_profile(this.current_profile);
            }
        }

        this.show_input_profile_notification(true); //always
    }

    init_controller_profile(c, c_profile) {

        if (!c_profile.driver_instances) {
            c_profile.driver_instances = {};
        }

        if (!c_profile.driver_instances[c_profile.driver]) {

            //init driver
            c_profile.driver_instances[c_profile.driver] = new this.registered_drivers[c_profile.driver](this);
            if (c_profile.default_driver_config && c_profile.default_driver_config[c_profile.driver]) {
                c_profile.driver_instances[c_profile.driver].set_config(c_profile.default_driver_config[c_profile.driver]);
            } else {
                c_profile.driver_instances[c_profile.driver].set_config({}); // init writer
            }

            let driver = c_profile.driver_instances[c_profile.driver];
            let driver_axes_ids = Object.keys(driver.get_axes());

            driver.buttons = [];
            driver.axes = [];

            if (c.type == 'touch') {
                for (let i_axis = 0; i_axis < 4; i_axis++) {
                    let new_axis = this.make_axis(c_profile, i_axis, driver_axes_ids, 0.01);
                    if (new_axis) {
                        driver.axes.push(new_axis);
                    }
                }
                let empty_buttons_to_make = 3;
                if (c_profile.default_buttons_config && c_profile.default_buttons_config.length) {
                    empty_buttons_to_make = 0
                    let sort_indexes = []; // by placmenet
                    for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
                        let new_btn = this.make_button(driver, c.type, c_profile.default_buttons_config[i]);
                        if (new_btn.touch_ui_placement) {
                            if (c_profile.default_buttons_config[i].sort_index !== undefined) {
                                new_btn.sort_index = c_profile.default_buttons_config[i].sort_index;
                            } else {
                                if (sort_indexes[new_btn.touch_ui_placement] === undefined)
                                    sort_indexes[new_btn.touch_ui_placement] = 0;
                                else
                                    sort_indexes[new_btn.touch_ui_placement]++;
                                new_btn.sort_index = sort_indexes[new_btn.touch_ui_placement];
                            }
                        }
                    }
                }
                for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) { //start with 3, users can add mode but space will be sometimes limitted
                    let new_btn = this.make_button(driver, c.type);
                    new_btn.src_label = 'Aux ' + new_btn.i; // init label
                }
            } else if (c.type == 'keyboard') {

                let empty_buttons_to_make = 5;
                if (c_profile.default_buttons_config && c_profile.default_buttons_config.length) {
                    empty_buttons_to_make = 0
                    for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
                        let new_btn = this.make_button(driver, c.type, c_profile.default_buttons_config[i]);
                    }
                }
                for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) { // make some more
                    let new_btn = this.make_button(driver, c.type);
                }


            } else if (c.type == 'gamepad') {
                for (let i_axis = 0; i_axis < c.num_gamepad_axes; i_axis++) {
                    let new_axis = this.make_axis(c_profile, i_axis, driver_axes_ids, 0.1); //default deadzone bigger than touch
                    if (new_axis) {
                        new_axis.needs_reset = true; //waits for 1st non-zero signals
                        driver.axes.push(new_axis);
                    }
                }

                let empty_buttons_to_make = 5;
                if (c_profile.default_buttons_config && c_profile.default_buttons_config.length) {
                    empty_buttons_to_make = 0
                    for (let i = 0; i < c_profile.default_buttons_config.length; i++) {
                        let new_btn = this.make_button(driver, c.type, c_profile.default_buttons_config[i]);
                    }
                }
                for (let i_btn = 0; i_btn < empty_buttons_to_make; i_btn++) { //start with 5, users can add more
                    let new_btn = this.make_button(driver, c.type);
                }
            }
        }

    }

    make_axis(c_profile, i_axis, driver_axes_ids, default_dead_zone) {
        let axis_cfg = null;
        if (c_profile.default_axes_config) {
            c_profile.default_axes_config.forEach((cfg)=>{
                if (cfg.axis === i_axis && driver_axes_ids.indexOf(cfg.driver_axis) > -1) {
                    axis_cfg = cfg;
                    return;
                }
            });
        }

        let new_axis = { 
            i: i_axis,
            raw: null,
            driver_axis: axis_cfg && axis_cfg.driver_axis ? axis_cfg.driver_axis : null,
            dead_min: axis_cfg && axis_cfg.dead_min !== undefined ? axis_cfg.dead_min : -default_dead_zone,
            dead_max: axis_cfg && axis_cfg.dead_max !== undefined ? axis_cfg.dead_max : default_dead_zone,
            offset: axis_cfg && axis_cfg.offset !== undefined ? axis_cfg.offset : 0.0,
            scale: axis_cfg && axis_cfg.scale !== undefined ? axis_cfg.scale : 1.0,                
        }

        if (axis_cfg && axis_cfg.mod_func && axis_cfg.mod_func.type) {
            switch (axis_cfg.mod_func.type) {
                case 'scale_by_velocity':
                    new_axis.mod_func = axis_cfg.mod_func.type;
                    new_axis.scale_by_velocity_src = axis_cfg.mod_func.velocity_src;
                    new_axis.scale_by_velocity_mult_min = axis_cfg.mod_func.slow_multiplier !== undefined ? axis_cfg.mod_func.slow_multiplier : 1.0;
                    new_axis.scale_by_velocity_mult_max = axis_cfg.mod_func.fast_multiplier !== undefined ? axis_cfg.mod_func.fast_multiplier : 1.0;
                    break;
                default:
                    break
            }
        }

        return new_axis;
    }

    copy_axis_config(a_src, a_dest) {
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

    switch_axes_config(a1, a2) {
        console.log('Switching axes ', a1, a2);

        let _a1 = {};
        this.copy_axis_config(a1, _a1);
        this.copy_axis_config(a2, a1)
        this.copy_axis_config(_a1, a2);
    }
    
    make_button(driver, c_type, default_config = null, default_axis_dead_zone = 0.01) {
        if (driver.i_btn === undefined)
            driver.i_btn = -1;
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
        }

        if (default_config) {
            if (default_config.btn !== undefined && default_config.btn !== null) { //gp
                new_btn.id_src = parseInt(default_config.btn);
                new_btn.src_label = this.gamepad_button_label(new_btn.id_src);
            }
            if (default_config.key !== undefined && default_config.key !== null) { //kb
                new_btn.id_src = default_config.key.toLowerCase();
                if (default_config.key_mod !== undefined) {
                    new_btn.key_mod = default_config.key_mod.toLowerCase();
                }
                new_btn.src_label = this.keyboard_key_label(new_btn.id_src, new_btn.key_mod);
            }
            if (default_config.label)
                new_btn.src_label = default_config.label;
            if (default_config.driver_axis) {
                let dri_axes_ids = Object.keys(driver.get_axes());
                if (dri_axes_ids.indexOf(default_config.driver_axis) > -1) {
                    new_btn.driver_axis = default_config.driver_axis;
                    new_btn.assigned = true;
                }

                new_btn.dead_min = default_config.dead_min !== undefined ? parseFloat(default_config.dead_min) : -default_axis_dead_zone;
                new_btn.dead_max = default_config.dead_max !== undefined ? parseFloat(default_config.dead_max) : default_axis_dead_zone;
                new_btn.offset = default_config.offset !== undefined ? parseFloat(default_config.offset) : 0.0;
                new_btn.scale = default_config.scale !== undefined ? parseFloat(default_config.scale) : 1.0;  

                if (default_config.mod_func) {
                    switch (default_config.mod_func.type) {
                        case 'scale_by_velocity':
                            new_btn.mod_func = default_config.mod_func.type;
                            new_btn.scale_by_velocity_src = default_config.mod_func.velocity_src;
                            new_btn.scale_by_velocity_mult_min = default_config.mod_func.slow_multiplier !== undefined ? default_config.mod_func.slow_multiplier : 1.0;
                            new_btn.scale_by_velocity_mult_max = default_config.mod_func.fast_multiplier !== undefined ? default_config.mod_func.fast_multiplier : 1.0;
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
                    case 'touch': new_btn.trigger = 0; break;
                    case 'press': new_btn.trigger = 1; break;
                    case 'release': new_btn.trigger = 2; break;
                }
            }
            if (default_config.action) {
                
                switch (default_config.action) {
                    case 'ros-srv':
                        new_btn.action = default_config.action;
                        new_btn.ros_srv_id = default_config.ros_srv_id;
                        new_btn.assigned = true;

                        new_btn.ros_srv_msg_type = null;
                        if (this.client.discovered_services[new_btn.ros_srv_id]) {
                            new_btn.ros_srv_msg_type = this.client.discovered_services[new_btn.ros_srv_id].msg_type;
                        } else { // otherwise checked on services update
                            console.log('ros-srv btn action missing message type, service '+new_btn.ros_srv_id+' not discovered yet?');
                            // this.client.run_introspection();
                        }

                        if (default_config.ros_srv_val !== undefined) {
                            new_btn.ros_srv_val = default_config.ros_srv_val;
                        }
                        break;
                    case 'ctrl-enabled':
                        new_btn.action = default_config.action;
                        new_btn.assigned = true;

                        switch (default_config.ctrl_state) {
                            case 'on':
                            case 'true':
                            case true:
                                new_btn.set_ctrl_state = 1;
                                break;
                            case 'off':
                            case 'false':
                            case false:
                                new_btn.set_ctrl_state = 0;
                                break;
                            default:
                                new_btn.set_ctrl_state = 2; //toggle
                            break;
                        }
                        break;
                    case 'input-profile':
                        new_btn.action = default_config.action;
                        new_btn.assigned = true;
                        new_btn.set_ctrl_profile = default_config.profile;
                        break;
                    case 'wifi-roam':
                        new_btn.action = default_config.action;
                        new_btn.assigned = true;
                        break;
                } 
            }
            if (default_config.placement) {
                switch (default_config.placement) {
                    case 'top': new_btn.touch_ui_placement = 1; break;
                    case 'overlay':
                    case 'bottom': new_btn.touch_ui_placement = 2; break;
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

        if (c_type == 'touch' && !new_btn.src_label) {
            new_btn.src_label = 'Aux ' + new_btn.i; // init label
        }
        
        driver.buttons.push(new_btn);
        return new_btn;
    }

    on_services_updated(discovered_services) {
        if (!this.enabled)
            return;

        console.log('input manager got services', discovered_services);
        let that = this;
        Object.values(this.controllers).forEach((c)=>{
            if (!c.profiles)
                return;
            Object.keys(c.profiles).forEach((id_profile)=>{
                let p = c.profiles[id_profile];
                Object.values(p.driver_instances).forEach((d)=>{
                    d.buttons.forEach((btn)=>{
                        if (btn.action == 'ros-srv') {

                            // update missing message type
                            if (btn.ros_srv_id && !btn.ros_srv_msg_type
                                && discovered_services[btn.ros_srv_id]) {
                                btn.ros_srv_msg_type = discovered_services[btn.ros_srv_id].msg_type;
                                console.log('Message type discovered for '+btn.ros_srv_id)+': '+btn.ros_srv_msg_type;
                            }

                            // update ros-srv btn config ui
                            if (that.edited_controller == c && that.current_profile == id_profile) {
                                console.log('Updating btn confid ui (services changed)', btn);
                                that.render_btn_config(d, btn);
                            }
                        }
                    });
                });
            });
        });
    }

    reset_all() {
        let that = this;
        Object.values(this.controllers).forEach((c)=>{
            if (!c.profiles || !that.current_profile)
                return;
            // Object.keys(c.profiles).forEach((id_profile)=>{
            let p = c.profiles[that.current_profile];
            Object.values(p.driver_instances).forEach((d)=>{
                d.axes.forEach((axis)=>{
                    axis.needs_reset = true; // (TODO: this does nothing, should we )
                    axis.raw = 0.0;
                });
                d.buttons.forEach((btn)=>{
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

    get_controller_profile_config(c, id_profile, only_assigned=false) {
        let profile = c.profiles[id_profile];
        let driver = profile.driver_instances[profile.driver];

        let data = {
            driver: profile.driver,
            driver_config: driver.get_config(),
            axes: [],
            buttons: [],
        };
        
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
            }
            if (driver.axes[i].mod_func) {
                axis_data['mod_func'] = {
                    type: driver.axes[i].mod_func,
                    velocity_src: driver.axes[i].scale_by_velocity_src,
                    slow_multiplier: driver.axes[i].scale_by_velocity_mult_min,
                    fast_multiplier: driver.axes[i].scale_by_velocity_mult_max,
                }
            }
            data.axes.push(axis_data);
        }
        if (!data.axes.length)
            delete data.axes;

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
            }

            if (c.type == 'keyboard') {
                btn_data['key'] = btn.id_src;
                if (btn_data['key'])
                    btn_data['key'] = btn_data['key'].toUpperCase(); //saving upper case
                btn_data['key_mod'] = btn.key_mod ? btn.key_mod : undefined;
            } else if (c.type == 'gamepad') {
                btn_data['btn'] = btn.id_src;
            } else if (c.type == 'touch') {
                btn_data['style'] = btn.touch_ui_style ? btn.touch_ui_style : undefined;
                switch (btn.touch_ui_placement) {
                    case 1: btn_data['placement'] = 'top'; break;
                    case 2: btn_data['placement'] = 'overlay'; break;
                }
                btn_data['label'] = btn.src_label;
                btn_data['sort_index'] = btn.sort_index;
            }

            switch (btn.trigger) {
                case 0: btn_data.trigger = 'touch'; break;
                case 1: /* btn_data.trigger = 'press'; */ break; // press is default
                case 2: btn_data.trigger = 'release'; break;
            }

            
            if (btn.driver_axis) {
                btn_data['dead_min'] = btn.dead_min;
                btn_data['dead_max'] = btn.dead_max;
                if (btn.offset != 0.0) // ignore default
                    btn_data['offset'] = btn.offset;
                if (btn.scale != 1.0) // ignore default
                    btn_data['scale'] = btn.scale;

                if (btn.mod_func) {
                    btn_data['mod_func'] = {
                        type: btn.mod_func,
                        velocity_src: btn.scale_by_velocity_src,
                        slow_multiplier: btn.scale_by_velocity_mult_min,
                        fast_multiplier: btn.scale_by_velocity_mult_max,
                    }
                }
            }

            switch (btn.action) {
                case 'ros-srv':
                    btn_data['ros_srv_id'] = btn.ros_srv_id;
                    btn_data['ros_srv_val'] = btn.ros_srv_val;
                    break;
                case 'ctrl-enabled':
                    switch (btn.set_ctrl_state) {
                        case 1: btn_data['ctrl_state'] = true; break;
                        case 0: btn_data['ctrl_state'] = false; break;
                        case 2: btn_data['ctrl_state'] = "toggle"; break;
                    }
                    break;
                case 'input-profile':
                    btn_data['profile'] = btn.set_ctrl_profile;
                    break;
            }

            data.buttons.push(btn_data);
        }
        if (!data.buttons.length)
            delete data.buttons;

        return data;
    }

    set_saved_controller_profile_state(c, id_profile) {
        let c_profile = c.profiles[id_profile];
        let driver = c_profile.driver_instances[c_profile.driver];
        driver.set_saved_state();
        
        let saved_data = this.get_controller_profile_config(c, id_profile, true);
        c_profile.saved_state = saved_data;
    }

    check_profile_basics_saved(id_profile, update_ui = true) {
        
        let profile = this.profiles[id_profile];
        function compare() {
            if (id_profile != profile.id_saved)
                return false;
            if (profile.label != profile.label_saved)
                return false;
            return true;
        }
        profile.basics_saved = compare();

        if (update_ui)
            this.make_profile_selector_ui();
    }
    
    check_controller_profile_saved(c, id_profile, update_ui = true) {

        function compare(live, saved) {
            if (!live || !saved)
                return false;
            if (live.driver != saved.driver)
                return false;
            let driver = live.driver_instances[live.driver];
            if (!driver.check_saved())
                return false;
            
            if ((!live.axes && saved.axes) || (live.axes && !saved.axes)
                || (live.axes && saved.axes && live.axes.length != saved.axes.length))
                return false;
            
            if (live.axes) {
                for (let i = 0; i < live.axes.length; i++) {
                    if (live.axes[i].driver_axis != saved.axes[i].driver_axis)
                        return false;
    
                    if (live.axes[i].driver_axis) {
                        if (live.axes[i].dead_min != saved.axes[i].dead_min)
                            return false;
                        if (live.axes[i].dead_max != saved.axes[i].dead_max)
                            return false;
                        if (live.axes[i].offset != saved.axes[i].offset)
                            return false;
                        if (live.axes[i].scale != saved.axes[i].scale)
                            return false;
        
                        let live_has_mod_func = live.axes[i].mod_func !== null && live.axes[i].mod_func !== undefined;
                        let saved_has_mod_func = saved.axes[i].mod_func !== null && saved.axes[i].mod_func !== undefined;
        
                        if (live_has_mod_func != saved_has_mod_func) { 
                            return false;
                        } else if (live.axes[i].mod_func && saved.axes[i].mod_func) {
                            if (live.axes[i].mod_func.type != saved.axes[i].mod_func.type) 
                                return false;
                            if (live.axes[i].mod_func.velocity_src != saved.axes[i].mod_func.velocity_src) 
                                return false;
                            if (live.axes[i].mod_func.slow_multiplier != saved.axes[i].mod_func.slow_multiplier) 
                                return false;
                            if (live.axes[i].mod_func.fast_multiplier != saved.axes[i].mod_func.fast_multiplier) 
                                return false;
                        }
                    }
                }
            }

            if ((!live.buttons && saved.buttons) || (live.buttons && !saved.buttons)
                || (live.buttons && saved.buttons && live.buttons.length != saved.buttons.length))
                return false;
            
            if (live.buttons) {
                for (let i = 0; i < live.buttons.length; i++) {
                    let btn_live = live.buttons[i];
                    let btn_saved = saved.buttons[i];
    
                    if (btn_live.driver_axis != btn_saved.driver_axis)
                        return false;
                    if (btn_live.driver_btn != btn_saved.driver_btn)
                        return false;
                    if (btn_live.action != btn_saved.action)
                        return false;
    
                    if (btn_live.driver_axis) {
                        if (btn_live.dead_min != btn_saved.dead_min)
                            return false;
                        if (btn_live.dead_max != btn_saved.dead_max)
                            return false;
                        if (btn_live.offset != btn_saved.offset)
                            return false;
                        if (btn_live.scale != btn_saved.scale)
                            return false;
    
                        let line_has_mod_func = btn_live.mod_func !== null && btn_live.mod_func !== undefined;
                        let saved_has_mod_func = btn_saved.mod_func !== null && btn_saved.mod_func !== undefined;
        
                        if (line_has_mod_func != saved_has_mod_func) { 
                            return false;
                        }
                        if (btn_live.mod_func && btn_saved.mod_func) {
                            if (btn_live.mod_func.type != btn_saved.mod_func.type) 
                                return false;
                            if (btn_live.mod_func.velocity_src != btn_saved.mod_func.velocity_src) 
                                return false;
                            if (btn_live.mod_func.slow_multiplier != btn_saved.mod_func.slow_multiplier) 
                                return false;
                            if (btn_live.mod_func.fast_multiplier != btn_saved.mod_func.fast_multiplier) 
                                return false;
                        }
                    }
    
                    if (c.type == 'keyboard') {
                        if (btn_live.key != btn_saved.key)
                            return false;
                        if (btn_live.key_mod != btn_saved.key_mod)
                            return false;
                    } else if (c.type == 'gamepad') {
                        if (btn_live.btn != btn_saved.btn) 
                            return false;
                    } if (c.type == 'touch') {
                        if (btn_live.style != btn_saved.style) 
                            return false;
                        if (btn_live.placement != btn_saved.placement) 
                            return false;
                        if (btn_live.label != btn_saved.label)
                            return false;
                        if (btn_live.sort_index != btn_saved.sort_index)
                            return false;
                    }
    
                    if (btn_live.trigger != btn_saved.trigger)
                        return false;
    
                    if (btn_live.repeat != btn_saved.repeat)
                        return false;
    
                    switch (btn_live.action) {
                        case 'ros-srv':
                            if (btn_live.ros_srv_id != btn_saved.ros_srv_id)
                                return false;
                            if (JSON.stringify(btn_live.ros_srv_val) != JSON.stringify(btn_saved.ros_srv_val)) {
                                return false;
                            }
                            break;
                        case 'ctrl-enabled':
                            if (btn_live.ctrl_state != btn_saved.ctrl_state)
                                return false;
                            break;
                        case 'input-profile':
                            if (btn_live.profile != btn_saved.profile)
                                return false;
                            break;
                    }
                  
                }
            }

            return true; // all checks up 
        }

        let live_c_profile_state = this.get_controller_profile_config(c, id_profile, true); //filters unused
        live_c_profile_state.driver_instances = c.profiles[id_profile].driver_instances;
        let saved_c_profile_state = c.profiles[id_profile].saved_state; //unused filtered

        let match = compare(live_c_profile_state, saved_c_profile_state);

        // console.info(`Profile ${id_profile} saved: `, match, live_profile, saved_profile);

        if (!match && c.profiles[id_profile].saved) {
            c.profiles[id_profile].saved = false;
            this.profiles[id_profile].saved = false;
            console.log('Profile '+id_profile+' not saved');
            if (update_ui)
                this.make_profile_selector_ui();
           
        } else if (match && !c.profiles[id_profile].saved) {
            c.profiles[id_profile].saved = true;
            if (!this.profiles[id_profile].saved) {
                let all_saved = true;
                Object.values(this.controllers).forEach((cc)=>{
                    if (cc == c)
                        return;
                    if (!cc.profiles[id_profile].saved)
                        all_saved = false;
                });
                this.profiles[id_profile].saved = all_saved;
            }
            console.log('Profile '+id_profile+' saved: '+this.profiles[id_profile].saved);
            if (update_ui)
                this.make_profile_selector_ui();
          
        }

        this.check_all_controller_profiles_saved();
    }

    check_all_controller_profiles_saved() {

        let all_saved = true;
        Object.values(this.profiles).forEach((p)=>{
            if (!p.saved)
                all_saved = false
        });

        if (all_saved) {
            $('#input-unsaved-warn').removeClass('unsaved');
        } else {
            $('#input-unsaved-warn').addClass('unsaved');
        }
    }

    close_profile_menu () {
        $('#profile-buttons').removeClass('open');
        $('#input-manager-overlay')
            .css('display', 'none')
            .unbind();
    }
    
    close_profile_basics_edit() {
        if (!this.editing_profile_basics) 
            return;

        $('#gamepad-settings-container').removeClass('editing_profile_basics');
        this.editing_profile_basics = false;
        $('#input-profile-edit-label').unbind();
        $('#input-profile-edit-id').unbind();
        this.check_controller_profile_saved(this.edited_controller, this.current_profile, true);
    }

    save_last_user_profile(id_profile) {
        localStorage.setItem('last-input-profile:' + this.client.id_robot, id_profile);
    }

    load_last_user_profile() {
        return localStorage.getItem('last-input-profile:' + this.client.id_robot);
    }

    save_user_controller_enabled(c) {
        localStorage.setItem('controller-enabled:' + this.client.id_robot+ ':' + c.id, c.enabled);
        console.log('Saved controller enabled for robot '+this.client.id_robot+', id="'+c.id+'": '+c.enabled);
    }

    load_user_controller_enabled(id_controller) {
        let state = localStorage.getItem('controller-enabled:' + this.client.id_robot + ':' + id_controller);    
        state = state === 'true';
        console.log('Loaded controller enabled for robot '+this.client.id_robot+', id="'+id_controller+'": '+state);
        return state;
    }

    load_user_profile(id_profile) {
        let val = localStorage.getItem('input-profile:' + this.client.id_robot + ':' + id_profile);
        return val ? JSON.parse(val) : null;
    }

    load_user_profile_ids() {
        let val = localStorage.getItem('input-profiles:' + this.client.id_robot);
        return val ? JSON.parse(val) : null;
    }

    save_user_profile_ids(user_profiles) { //[ { id: 'id_profile', label: 'label'}, ... ]
        localStorage.setItem('input-profiles:' + this.client.id_robot, JSON.stringify(user_profiles));
    }

    save_user_profile(id_profile) {

        let live_profile = this.profiles[id_profile];

        if (this.saved_user_profile_ids.indexOf(id_profile) === -1)
            this.saved_user_profile_ids.push(id_profile);

        this.saved_user_profiles[id_profile] = this.get_profile_json_data(id_profile);
        live_profile.label_saved = live_profile.label;

        Object.keys(this.controllers).forEach((c_id)=>{
            let c = this.controllers[c_id];
            let c_profile = c.profiles[id_profile];
            if (c_profile) {
                this.set_saved_controller_profile_state(c, id_profile);
                this.check_controller_profile_saved(c, id_profile, false);
            }
        });

        if (live_profile.id_saved != id_profile) { // moving cookies on profile id change
            if (live_profile.id_saved) {
                console.warn('Moving saved input profile from '+live_profile.id_saved+' => '+id_profile);
                let old_pos = this.saved_user_profile_ids.indexOf(live_profile.id_saved);
                if (old_pos > -1)
                    this.saved_user_profile_ids.splice(old_pos, 1);
                localStorage.removeItem('input-profile:' + this.client.id_robot + ':' + live_profile.id_saved);    
            }
            live_profile.id_saved = id_profile;
        }

        localStorage.setItem('input-profile:' + this.client.id_robot + ':' + id_profile, JSON.stringify(this.saved_user_profiles[id_profile]));

        this.save_user_profile_ids(this.saved_user_profile_ids);

        if (id_profile == this.current_profile)
            this.save_last_user_profile(this.current_profile); // new profile wasn't saved

        this.check_profile_basics_saved(id_profile, true);
    }


    get_all_controller_ids_for_profile(id_profile_saved) {
        let all_controller_ids = [ 'keyboard', 'touch', 'gamepad' ];
        if (this.robot_defaults && this.robot_defaults[id_profile_saved]) { // copy robot defaults
            Object.keys(this.robot_defaults[id_profile_saved]).forEach((id_controller)=>{
                if (all_controller_ids.indexOf(id_controller) < 0 && id_controller != 'label')
                    all_controller_ids.push(id_controller);
            });
        }
        if (this.saved_user_profiles && this.saved_user_profiles[id_profile_saved]) { // overwrite with user setup
            Object.keys(this.saved_user_profiles[id_profile_saved]).forEach((id_controller)=>{
                if (id_controller == 'label')
                    return;
                if (all_controller_ids.indexOf(id_controller) < 0 && id_controller != 'label')
                    all_controller_ids.push(id_controller);
            });
        }
        Object.keys(this.controllers).forEach((id_controller) => {
            if (all_controller_ids.indexOf(id_controller) < 0 && id_controller != 'label')
                all_controller_ids.push(id_controller);
        });
        return all_controller_ids;
    }

    get_profile_json_data(id_profile) {
        let profile_data = {};
       
        if (this.profiles[id_profile].label)
            profile_data.label = this.profiles[id_profile].label;

        let id_profile_saved = this.profiles[id_profile].id_saved;

        let all_controller_ids = this.get_all_controller_ids_for_profile(id_profile_saved);
        all_controller_ids.forEach((c_id)=>{
            // pass on robot defaults
            if (this.robot_defaults && this.robot_defaults[id_profile_saved] && this.robot_defaults[id_profile_saved][c_id]) {
                profile_data[c_id] = Object.assign({}, this.robot_defaults[id_profile_saved][c_id]); 
            }
            // overwrite with saved user config
            if (this.saved_user_profiles && this.saved_user_profiles[id_profile_saved] && this.saved_user_profiles[id_profile_saved][c_id]) {
                profile_data[c_id] = Object.assign({}, this.saved_user_profiles[id_profile_saved][c_id]);
            }
            // overwrite with live controller state
            if (this.controllers[c_id] && this.controllers[c_id].profiles[id_profile]) {
                profile_data[c_id] = this.get_controller_profile_config(this.controllers[c_id], id_profile, true); // filters assigned axes & buttons
            }
        });
        return profile_data;
    }

    profile_json_to_clipboard(id_profile) {
        let profile_data = {};
        profile_data[id_profile] = this.get_profile_json_data(id_profile);
        let val = JSON.stringify(profile_data, null, 4);
        navigator.clipboard.writeText(val);
        console.log('Copied profile json:', val);
        this.close_profile_menu();
        this.ui.show_notification('Profile JSON copied', null, '<pre>'+val+'</pre>');
    }

    full_json_to_clipboard() {
        let config_data = {};

        let that = this;
        Object.keys(this.profiles).forEach((id_profile) => {
            config_data[id_profile] = this.get_profile_json_data(id_profile);
        });

        let val = JSON.stringify(config_data, null, 4);
        navigator.clipboard.writeText(val);
        console.log('Copied full input json:', val);
        this.close_profile_menu();
        this.ui.show_notification('Config JSON copied', null, '<pre>'+val+'</pre>');
    }

    register_driver(id_driver, driver_class) {
        if (this.registered_drivers[id_driver])
            return;

        this.registered_drivers[id_driver] = driver_class;
    }

    make_profile_selector_ui() {
        setTimeout(()=>{
            // profile selection
            let profile_opts = [];
            let that = this;

            console.log('Current profile is ', this.current_profile);

            if (!this.profiles)
                return;

            let profile_ids = Object.keys(this.profiles);
            for (let i = 0; i < profile_ids.length; i++) {
                let id_profile = profile_ids[i];
                let label = this.profiles[id_profile].label ? this.profiles[id_profile].label : id_profile;
                if (!this.profiles[id_profile].saved || !this.profiles[id_profile].basics_saved)
                    label = label + ' (edited)';
                profile_opts.push($('<option value="'+id_profile+'"' + (this.current_profile == id_profile ? ' selected' : '') + '>'+label+'</option>'));
            }
            profile_opts.push($('<option value="+">New profile...</option>'));
            $('#input-profile-select')
                .empty().attr({
                    'disabled': false,
                    'autocomplete': 'off'
                })
                .append(profile_opts);
            
            $('#input-profile-select').unbind().change((ev)=>{
                let val = $(ev.target).val()
                console.log('Selected profile val '+val);
                
                that.close_profile_basics_edit();
                
                // let current_profile = that.current_gamepad.profiles[that.current_gamepad.current_profile];
                if (val == '+') {
                    that.make_new_profile();
                    that.show_input_profile_notification();
                } else {
                    that.reset_all(); //reset old
                    that.current_profile = $(ev.target).val();
                    that.show_input_profile_notification();
                    that.reset_all(); //reset new
                    that.make_ui();
                    that.render_touch_buttons();
                    if (that.current_profile == that.profiles[that.current_profile].id_saved) { //new profile remembered when saved
                        that.save_last_user_profile(that.current_profile);
                    }
                }
                // that.save_last_user_gamepad_profile(
                //     that.current_gamepad.id,
                //     that.current_gamepad.current_profile
                // );
            });

            if (this.profiles[this.current_profile].saved && this.profiles[this.current_profile].basics_saved) {
                $('#gamepad_settings').removeClass('unsaved');
            } else {
                $('#gamepad_settings').addClass('unsaved');
            }
        }, 0);
    }

    make_controller_driver_config_ui() {

        let that = this;

        setTimeout(()=>{
            if (!this.edited_controller || !this.enabled_drivers) {
                $('#gamepad-settings-panel').html('<div class="line"><span class="label">Input source:</span><span class="static_val">N/A</span></div>');
                // $('#gamepad-settings-panel').removeClass('has-buttons');
            } else {
                
                let lines = [];

                let label = this.edited_controller.id;
                if (this.edited_controller.type == 'touch')
                    label = 'Virtual Gamepad (Touch UI)';
                if (this.edited_controller.type == 'keyboard')
                    label = 'Keyboard';

                let line_source = $('<div class="line"><span class="label">Input source:</span><span class="static_val" title="'+label+'">'
                                + label
                                + '</span></div>');
                lines.push(line_source);

                if (this.current_profile) {
                    let c_profile = this.edited_controller.profiles[this.current_profile];

                    //driver
                    let line_driver = $('<div class="line"><span class="label">Output driver:</span></div>');
                    let driver_opts = [];
                    
                    if (!this.enabled_drivers || !this.enabled_drivers.length) {
                        console.error('No enabled drivers for '+this.edited_controller.id+' (yet?)');
                        return;
                    }
                
                    for (let i = 0; i < this.enabled_drivers.length; i++) {
                        let id_driver = this.enabled_drivers[i];
                        driver_opts.push('<option value="'+id_driver+'"'
                                        + (c_profile.driver == id_driver ? ' selected' : '')
                                        + '>'+id_driver+'</option>')
                    }
                    let inp_driver = $('<select id="gamepad-profile-driver-select">'
                                    + driver_opts.join('')
                                    + '</select>');
        
                    inp_driver.appendTo(line_driver);
                    inp_driver.change((ev)=>{
                        let val = $(ev.target).val();
                        console.log('Controller driver changed to '+val);
                        c_profile.driver = val;
                        that.init_controller_profile(that.edited_controller, c_profile);
                        
                        c_profile.driver_instances[c_profile.driver].setup_writer();
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile, false);
                        that.make_ui();
                        that.render_touch_buttons();
                    })
                    lines.push(line_driver);
                    
                    let driver = c_profile.driver_instances[c_profile.driver];
                    if (driver) {
                        let driver_lines = driver.make_cofig_inputs();
                        lines = lines.concat(driver_lines);
                        // console.log('Driver config lines ', driver_lines);
                    }

                    // $('#gamepad-settings-panel').addClass('has-buttons');
                } else {
                    // $('#gamepad-settings-panel').removeClass('has-buttons');
                }

                $('#gamepad-settings-panel').empty().append(lines);            
            }
        }, 0);
    }

    edit_controller(c) {
        this.edited_controller = c;
        console.log('Editing controller '+c.id);
        this.make_ui();
        this.make_touch_buttons_editable();
    }

    make_controller_icons() {
        let icons = [];
        let that = this;

        let types_connected = [];
        Object.values(this.controllers).forEach((c)=>{
            let icon = $('<span class="'+c.type+'"></span>');
            types_connected.push(c.type);
            icons.push(icon);
            icon.click((ev)=>{
                that.edit_controller(c);
                icon.addClass('editing');
            })

            c.icon = icon;
            c.icon_editing = false;
            c.icon_enabled = false;
            c.icon_transmitting = false;

            that.update_controller_icon(c);
        });

        this.update_input_status_icon();

        // tease other controller types (blurred)
        if (types_connected.indexOf('touch') < 0 && isTouchDevice())
            icons.push($('<span class="touch disabled"></span>'));
        if (types_connected.indexOf('keyboard') < 0)
            icons.push($('<span class="keyboard disabled"></span>'));
        if (types_connected.indexOf('gamepad') < 0)
            icons.push($('<span class="gamepad disabled"></span>'));

        $('#input-controller-selection')
            .empty().append(icons);
    }

    update_controller_icon(c) {
        if (!c.icon)
            return;

        if (c.enabled && c.connected && !c.icon_enabled) {
            c.icon_enabled = true;
            c.icon.addClass('enabled');
        } else if ((!c.enabled || !c.connected) && c.icon_enabled) {
            c.icon_enabled = false;
            c.icon.removeClass('enabled');
        }

        if (c.transmitting_user_input && !c.icon_transmitting) {
            c.icon_transmitting = true;
            c.icon.addClass('transmitting');
        } else if (!c.transmitting_user_input && c.icon_transmitting) {
            c.icon_transmitting = false;
            c.icon.removeClass('transmitting');
        }

        if (c.show_error && !c.icon_error) {
            c.icon_error = true;
            c.icon.addClass('error');
        } else if (!c.show_error && c.icon_error) {
            c.icon_error = false;
            c.icon.removeClass('error');
        }

        if (c == this.edited_controller && !c.icon_editing) {
            c.icon_editing = true;
            c.icon.addClass('editing');
        } else if (c != this.edited_controller && c.icon_editing) {
            c.icon_editing = false;
            c.icon.removeClass('editing');
        }
    }

    update_input_status_icon() {
        let something_enabled = false;
        let something_transmitting = false;
        let error = false;

        Object.values(this.controllers).forEach((c)=>{
            if (c.icon_enabled)
                something_enabled = true;
            if (c.icon_transmitting)
                something_transmitting = true;
            if (c.icon_error)
                error = true;
        });

        if (something_enabled && !this.input_status_icon_enabled) {
            this.input_status_icon_enabled = true;
            this.input_status_icon.addClass('enabled');
        } else if (!something_enabled && this.input_status_icon_enabled) {
            this.input_status_icon_enabled = false;
            this.input_status_icon.removeClass('enabled');
        }

        if (something_transmitting && !this.input_status_icon_transmitting) {
            this.input_status_icon_transmitting = true;
            this.input_status_icon.addClass('transmitting');
        } else if (!something_transmitting && this.input_status_icon_transmitting) {
            this.input_status_icon_transmitting = false;
            this.input_status_icon.removeClass('transmitting');
        }

        if (error && !this.input_status_icon_error) {
            this.input_status_icon_error = true;
            this.input_status_icon.addClass('error');
        } else if (!error && this.input_status_icon_error) {
            this.input_status_icon_error = false;
            this.input_status_icon.removeClass('error');
        }
    }

    make_ui() {

        if (!this.enabled)
            return;

        let that = this;
        
        this.make_profile_selector_ui();

        if (!this.edited_controller) { // autoselect first controller
            let controller_keys = Object.keys(this.controllers);
            this.edited_controller = this.controllers[controller_keys[0]]; 
        }

        this.make_controller_icons();

        this.make_controller_driver_config_ui();

        if (!this.edited_controller || !this.enabled_drivers || !this.current_profile) {
            $('#gamepad-axes-panel').html('Waiting for controllers...');    
            this.debug_output_panel.html('{}');
            // $('#gamepad-profile-config').css('display', 'none');
            this.controller_enabled_cb.attr('disabled', true);
            $('#gamepad_settings').removeClass('unsaved');
            $('#save-gamepad-profile').addClass('saved');
            return;
        }

        // console.log('Editing controller is ', this.edited_controller);

        this.controller_enabled_cb
            .attr('disabled', false)
            .prop('checked', this.edited_controller.enabled);

        let profile = this.profiles[this.current_profile];
        let c_profile = this.edited_controller.profiles[this.current_profile];

        if (profile.saved && profile.basics_saved) {
            $('#gamepad_settings').removeClass('unsaved');
            $('#save-gamepad-profile').addClass('saved');
        } else {
            $('#gamepad_settings').addClass('unsaved');
            $('#save-gamepad-profile').removeClass('saved');
        }

        let driver = c_profile.driver_instances[c_profile.driver];

        if (this.edited_controller.type == 'keyboard') {
            $('#gamepad-buttons-tab').html('Key Mapping');
            $('#gamepad-axes-tab').css('display', 'none'); // no separate axes for kb
            $('#gamepad-axes-panel').css('display', 'none');
            if (this.open_panel == 'axes') { // switch to buttons tab
                this.open_panel = 'buttons';
                $('#gamepad-axes-panel').removeClass('active');
                $('#gamepad-axes-tab').removeClass('active');
                $('#gamepad-buttons-panel').addClass('active');
                $('#gamepad-buttons-tab').addClass('active');
            }
            this.make_buttons_ui(driver);
        } else {
            $('#gamepad-buttons-tab').html('Buttons');
            $('#gamepad-axes-tab').css('display', ''); //unset
            $('#gamepad-axes-panel').css('display', '');
            this.make_axes_ui(driver);
            this.make_buttons_ui(driver);
        }
    }

    render_axis_config (driver, axis, is_btn = false) {
    
        let that = this;

        if (!is_btn)
            axis.config_details_el.empty();

        let driver_axis = axis.driver_axis;

        if (!driver_axis) {
            axis.conf_toggle_el.removeClass('open')
            axis.config_details_el.removeClass('open')
            return; 
        }

        // dead zone
        if (!is_btn || this.edited_controller.type == 'gamepad') {
            let dead_zone_el = $('<div class="config-row"><span class="label">Dead zone:</span></div>');
            let dead_zone_wrapper_el = $('<div class="config-row2"></div>');
            let dead_zone_min_inp = $('<input type="text" class="inp-val inp-val2"/>');
            
            dead_zone_min_inp.val(axis.dead_min.toFixed(2));
            let dead_zone_max_label = $('<span class="label2">to</span>');
            let dead_zone_max_inp = $('<input type="text" class="inp-val"/>');
            dead_zone_max_inp.val(axis.dead_max.toFixed(2));
            dead_zone_min_inp.appendTo(dead_zone_wrapper_el);
            dead_zone_max_label.appendTo(dead_zone_wrapper_el);
            dead_zone_max_inp.appendTo(dead_zone_wrapper_el);
            dead_zone_wrapper_el.appendTo(dead_zone_el)

            dead_zone_min_inp.focus((ev)=>{ev.target.select();});
            dead_zone_max_inp.focus((ev)=>{ev.target.select();});

            dead_zone_min_inp.change((ev)=>{
                axis.dead_min = parseFloat($(ev.target).val());
                delete axis.dead_val;
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });
            dead_zone_max_inp.change((ev)=>{
                axis.dead_max = parseFloat($(ev.target).val());
                delete axis.dead_val;
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });

            dead_zone_el.appendTo(axis.config_details_el);

            if (!isIOS()) { // ios can't do numberic keyboard with decimal and minus signs => so default it is
                dead_zone_min_inp.attr('inputmode', 'numeric');                
                dead_zone_max_inp.attr('inputmode', 'numeric');
            }
            
            dead_zone_min_inp.on('contextmenu', that.prevent_context_menu);
            dead_zone_max_inp.on('contextmenu', that.prevent_context_menu);
        }

        // input offset
        let offset_el = $('<div class="config-row"><span class="label">Offset input:</span></div>');
        let offset_inp = $('<input type="text" class="inp-val"/>');
        offset_inp.val(axis.offset.toFixed(1));
        offset_inp.focus((ev)=>{ev.target.select();});
        offset_inp.change((ev)=>{
            axis.offset = parseFloat($(ev.target).val());
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });
        offset_inp.appendTo(offset_el);
        offset_el.appendTo(axis.config_details_el);

        // input scale
        let scale_el = $('<div class="config-row"><span class="label">Scale input:</span></div>');
        let scale_inp = $('<input type="text" class="inp-val"/>');
        scale_inp.val(axis.scale.toFixed(1));
        scale_inp.focus((ev)=>{ev.target.select();});
        scale_inp.change((ev)=>{
            axis.scale = parseFloat($(ev.target).val());
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });
        scale_inp.appendTo(scale_el);
        scale_el.appendTo(axis.config_details_el);

        // modifier selection
        let mod_func_el = $('<div class="config-row"><span class="label">Modifier:</span></div>');
        let mod_func_opts = [ '<option value="">None</option>' ];
        mod_func_opts.push('<option value="scale_by_velocity" '+(axis.mod_func=='scale_by_velocity'?' selected':'')+'>Scale by velocity</option>');  
        let mod_func_inp = $('<select>'+mod_func_opts.join('')+'</select>');
        mod_func_inp.appendTo(mod_func_el);
        mod_func_el.appendTo(axis.config_details_el);
        let mod_func_cont = $('<div></div>');
        mod_func_cont.appendTo(axis.config_details_el);
        
        let set_mod_funct = (mod_func) => {
            if (mod_func) {
                axis.mod_func = mod_func;
                let mod_func_config_els = [];
                if (mod_func == 'scale_by_velocity') {

                    let multiply_lerp_input_el = $('<div class="config-row"><span class="label sublabel">Velocity source:</span></div>');
                    let multiply_lerp_input_opts = [ '<option value="">Select axis</option>' ];

                    let dri_axes = driver.get_axes();
                    let dri_axes_ids = Object.keys(dri_axes);
                    for (let j = 0; j < dri_axes_ids.length; j++) {
                        let id_axis = dri_axes_ids[j];
                        multiply_lerp_input_opts.push('<option value="'+id_axis+'"' + (axis.scale_by_velocity_src == id_axis ? ' selected':'') +'>'+dri_axes[id_axis]+'</option>');
                    }
                    
                    let multiply_lerp_input_inp = $('<select>'+multiply_lerp_input_opts.join('')+'</select>');
                    multiply_lerp_input_inp.appendTo(multiply_lerp_input_el);
                    mod_func_config_els.push(multiply_lerp_input_el);
                    multiply_lerp_input_inp.change((ev)=>{
                        axis.scale_by_velocity_src = $(ev.target).val();
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                    });
                    
                    // multiplier min
                    let multiply_lerp_min_el = $('<div class="config-row"><span class="label sublabel">Slow multiplier:</span></div>');
                    let multiply_lerp_min_inp = $('<input type="text" class="inp-val"/>');
                    multiply_lerp_min_inp.focus((ev)=>{ev.target.select();});
                    if (axis.scale_by_velocity_mult_min === undefined)
                        axis.scale_by_velocity_mult_min = 1.0;
                    multiply_lerp_min_inp.val(axis.scale_by_velocity_mult_min.toFixed(1));
                    multiply_lerp_min_inp.change((ev)=>{
                        axis.scale_by_velocity_mult_min = parseFloat($(ev.target).val());
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                    });
                    multiply_lerp_min_inp.appendTo(multiply_lerp_min_el);
                    mod_func_config_els.push(multiply_lerp_min_el);
                    

                    // multiplier max
                    let multiply_lerp_max_el = $('<div class="config-row"><span class="label sublabel">Fast multiplier:</span></div>');
                    let multiply_lerp_max_inp = $('<input type="text" class="inp-val"/>');
                    multiply_lerp_max_inp.focus((ev)=>{ev.target.select();});
                    if (axis.scale_by_velocity_mult_max === undefined)
                        axis.scale_by_velocity_mult_max = 1.0;
                    multiply_lerp_max_inp.val(axis.scale_by_velocity_mult_max.toFixed(1));
                    multiply_lerp_max_inp.change((ev)=>{
                        axis.scale_by_velocity_mult_max = parseFloat($(ev.target).val());
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                    });
                    multiply_lerp_max_inp.appendTo(multiply_lerp_max_el);
                    mod_func_config_els.push(multiply_lerp_max_el);

                    if (!isIOS()) { // ios can't do numberic keyboard with decimal and minus signs => so default it is
                        multiply_lerp_min_inp.attr('inputmode', 'numeric');
                        multiply_lerp_max_inp.attr('inputmode', 'numeric');
                    }
                    multiply_lerp_min_inp.on('contextmenu', that.prevent_context_menu);
                    multiply_lerp_max_inp.on('contextmenu', that.prevent_context_menu);

                }
                mod_func_cont.empty().append(mod_func_config_els).css('display', 'block');
            } else {
                delete axis.mod_func; // check_controller_profile_saved expecs undefined (not null)
                mod_func_cont.empty().css('display', 'none');
            }
            
        }
        set_mod_funct(axis.mod_func);
        mod_func_inp.change((ev)=>{
            set_mod_funct($(ev.target).val());
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });
        

        if (!isIOS()) { // ios can't do numberic keyboard with decimal and minus signs => so default it is
            offset_inp.attr('inputmode', 'numeric');
            scale_inp.attr('inputmode', 'numeric');
        }

        offset_inp.on('contextmenu', that.prevent_context_menu);
        scale_inp.on('contextmenu', that.prevent_context_menu);

    } 

    prevent_context_menu(ev) {
        ev.preventDefault();
        ev.stopPropagation();
    }

    make_btn_trigger_sel (btn, allows_repeat) {
        // modifier selection
        let trigger_el = $('<div class="config-row"><span class="label">Trigger:</span></div>');
    
        let opts = {
            'gamepad': {
                0: 'Touch',
                1: 'Press',
                2: 'Release',
            },
            'touch': {
                1: 'Press',
                2: 'Release',
            },
            'keyboard': {
                1: 'Key down',
                2: 'Key up',
            }
        }
        let c_opts = opts[this.edited_controller.type];
        let vals = Object.keys(c_opts);
        let trigger_opts = [];
        vals.forEach((val)=>{
            let val_int = parseInt(val);
            if (val_int === 2 && btn.driver_btn)
                return;
            trigger_opts.push('<option value="'+val+'"'+(btn.trigger===val_int?' selected':'')+'>'+c_opts[val]+'</option>');
        });

        let trigger_inp = $('<select'+(trigger_opts.length < 2 ? ' disabled' : '')+'>'+trigger_opts.join('')+'</select>');
        trigger_inp.appendTo(trigger_el);
        let that = this;
        
        let repeat_el = null;
        if (allows_repeat) {
            let cb_id = btn.i+'_repeat_cb';
            repeat_el = $('<div class="config-row"><label for="'+cb_id+'" class="small-settings-cb-label">Repeat</label></div>');
            repeat_el.css('display', !btn.trigger || btn.trigger==1 ? 'block' : 'none'); //repeat only shows for touch/press
            let repeat_inp = $('<input type="checkbox" '+(btn.repeat?' checked' : '')+' id="'+cb_id+'" class="small-settings-cb"/>');
            repeat_inp.prependTo(repeat_el);

            repeat_inp.change((ev)=>{
                let val = $(ev.target).prop('checked') ? true : false;
                btn.repeat = val;
                if (!val && btn.repeat_timer) {
                    clearInterval(btn.repeat_timer);
                    delete btn.repeat_timer;
                }
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });
        }
        
        trigger_inp.change((ev)=>{
            btn.trigger = parseInt($(ev.target).val());
            if (btn.repeat_timer) {
                clearInterval(btn.repeat_timer);
                delete btn.repeat_timer;
            }
            if (repeat_el)
                repeat_el.css('display', btn.trigger==0 || btn.trigger==1 ? 'block' : 'none');
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        if (repeat_el) {
            return [ trigger_el, repeat_el ];
        } else {
            return trigger_el;
        }
    }

    make_btn_repeat_sel(btn) {
        
        let trigger_opts = [];
        if (this.edited_controller.type == 'gamepad') // gamepad has touch
            trigger_opts.push('<option value="0"'+(btn.trigger===0?' selected':'')+'>Touch</option>');
        trigger_opts.push('<option value="1"'+(btn.trigger===1?' selected':'')+'>Press</option>');
        if (!btn.driver_btn) // driver btn only trigerred by touch or press
            trigger_opts.push('<option value="2"'+(btn.trigger===2?' selected':'')+'>Release</option>')

        
        return trigger_el;
    }

    render_driver_button_config (driver, btn) {
    
        let that = this;

        btn.config_details_el.append(this.make_btn_trigger_sel(btn)); //no repeat (sending continuously)
    }

    render_ros_srv_button_config (driver, btn) {
    
        let that = this;

        btn.config_details_el.append(this.make_btn_trigger_sel(btn, true)); //+repeat

        let srv_el = $('<div class="config-row"><span class="label">Service:</span></div>');
        let srv_opts = [
            '<option value="">Select service...</option>'
        ];
        
        Object.values(this.client.discovered_nodes).forEach((node)=>{
            let service_ids = Object.keys(node.services);
            if (!service_ids.length)
                return;
            
            let node_opts = [];
            service_ids.forEach((id_srv)=>{
                let msg_type = node.services[id_srv].msg_type;
                // if (that.ui.ignored_service_types.includes(msg_type))
                //     return; // not rendering ignored

                node_opts.push('<option value="'+id_srv+':'+msg_type+'"'+(btn.ros_srv_id == id_srv?' selected':'')+'>'+id_srv+'</option>');
            });

            if (node_opts.length) {
                srv_opts.push('<optgroup label="'+node.node+'"></optgroup>');   
                srv_opts = srv_opts.concat(node_opts);
                srv_opts.push('</optgroup>');
            }
        });
        
        let srv_inp = $('<select>'+srv_opts.join('')+'</select>');
        srv_inp.appendTo(srv_el);
        
        let srv_details_el = $('<div></div>');
        let rener_srv_details = () => {
            srv_details_el.empty();
            if (btn.ros_srv_msg_type) {
                srv_details_el.append($('<div class="config-row">' +
                                        '<span class="label">Message type:</span>' +
                                        '<span class="static_val msg_type">' + btn.ros_srv_msg_type + '</span>' +
                                        '</div>'));
                
                let srv_val_el = $('<div class="config-row"><span class="label">Send value:</span></div>');

                if (that.ui.input_widgets[btn.ros_srv_msg_type]) {
                    let srv_val_inp = that.ui.input_widgets[btn.ros_srv_msg_type].MakeInputConfigControls(btn, (val)=>{
                        console.log('btn service val set to ', val);
                        btn.ros_srv_val = val;
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                    });
                    srv_val_el.append(srv_val_inp);
                } else {
                    let val_json = JSON.stringify(btn.ros_srv_val === undefined ? {} : btn.ros_srv_val);
                    let srv_val_inp = $('<textarea>'+val_json+'</textarea>');
                    srv_val_el.append(srv_val_inp);
                    srv_val_el.append($('<div class="cleaner"></div>'));
                    srv_val_inp.change((ev) => {
                        let val = null;
                        try {
                            val = JSON.parse($(ev.target).val());
                        } catch (e) {
                            console.error('Failed parsing json val: ', $(ev.target).val());
                            srv_val_inp.addClass('error')
                            return;
                        }
                        srv_val_inp.removeClass('error');
                        btn.ros_srv_val = val;
                        that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                    });
                }

                srv_details_el.append(srv_val_el);
            }
        };
        rener_srv_details();

        srv_inp.change((ev)=>{
            let val = $(ev.target).val();
            if (val) {
                let vals = val.split(':');
                btn.ros_srv_id = vals[0];
                btn.ros_srv_msg_type = vals[1];
            } else {
                btn.ros_srv_id = null;
                btn.ros_srv_msg_type = null;
            }
            console.log('btn set to ros srv '+btn.ros_srv_id+' msg type='+btn.ros_srv_msg_type);
            rener_srv_details();
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        btn.config_details_el.append(srv_el);
        btn.config_details_el.append(srv_details_el);
    }

    render_ctrl_enabled_button_config (driver, btn) {
    
        let that = this;

        btn.config_details_el.append(this.make_btn_trigger_sel(btn));

        // modifier selection
        let state_el = $('<div class="config-row"><span class="label">Set state:</span></div>');
        let state_opts = [
            '<option value="2"'+(btn.set_ctrl_state===2?' selected':'')+'>Toggle</option>',
            '<option value="1"'+(btn.set_ctrl_state===1?' selected':'')+'>Enabled</option>',
            '<option value="0"'+(btn.set_ctrl_state===0?' selected':'')+'>Disabled</option>',
        ];

        let state_inp = $('<select>'+state_opts.join('')+'</select>');
        state_inp.appendTo(state_el);
        
        state_inp.change((ev)=>{
            // set_mod_funct();
            btn.set_ctrl_state = parseInt($(ev.target).val())
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        btn.config_details_el.append(state_el);
    }

    render_input_profile_button_config (driver, btn) {
    
        let that = this;
      
        btn.config_details_el.append(this.make_btn_trigger_sel(btn));

        // profile selection
        let profile_el = $('<div class="config-row"><span class="label">Set profile:</span></div>');
        let profile_opts = [];
        Object.keys(this.profiles).forEach((id_profile)=>{
            if (!btn.set_ctrl_profile)
                btn.set_ctrl_profile = id_profile;
            let label = this.profiles[id_profile].label ? this.profiles[id_profile].label : id_profile;
            profile_opts.push('<option value="'+id_profile+'"'+(btn.set_ctrl_profile==id_profile?' selected':'')+'>'+label+'</option>')
        })
        let profile_inp = $('<select>'+profile_opts.join('')+'</select>');
        profile_inp.appendTo(profile_el);
        
        profile_inp.change((ev)=>{
            // set_mod_funct();
            btn.set_ctrl_profile = $(ev.target).val();
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        btn.config_details_el.append(profile_el);
    }

    render_ui_profile_button_config (driver, btn) {
    
        let that = this;
      
        btn.config_details_el.append(this.make_btn_trigger_sel(btn));

        // profile selection
        let profile_el = $('<div class="config-row"><span class="label">Set profile:</span></div>');
        let profile_opts = [];
        [].forEach((id_profile)=>{ // TODO
            let label = this.profiles[id_profile].label ? this.profiles[id_profile].label : id_profile;
            profile_opts.push('<option value="'+id_profile+'"'+(btn.set_ui_profile==id_profile?' selected':'')+'>'+label+'</option>')
        })
        profile_opts.push('<option>N/A (TODO)</option>')
        let profile_inp = $('<select disabled>'+profile_opts.join('')+'</select>');
        profile_inp.appendTo(profile_el);
        
        profile_inp.change((ev)=>{
            // set_mod_funct();
            btn.set_ui_profile = $(ev.target).val();
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        btn.config_details_el.append(profile_el);
    }

    render_wifi_roam_button_config (driver, btn) {      
        btn.config_details_el.append(this.make_btn_trigger_sel(btn));
    }

    make_axes_ui(driver) {
        
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
            let opts = [ '<option value="">Not in use</option>' ];
            // let dri = profile.driver_instance;
            let dri_axes = driver.get_axes();
            let dri_axes_ids = Object.keys(dri_axes);
            for (let j = 0; j < dri_axes_ids.length; j++) {
                let id_axis = dri_axes_ids[j];
                opts.push('<option value="'+id_axis+'"'+(axis.driver_axis == id_axis ? ' selected' : '')+'>'+dri_axes[id_axis]+'</option>');
            }
            opts.push('<option value="*">Switch with axis...</option>');
        
            let assignment_sel_el = $('<select>'+opts.join('')+'</select>');
            assignment_sel_el.appendTo(line_1_el);
            axis.assignment_sel_el = assignment_sel_el;

            // output val
            let out_val_el = $('<span class="axis-output-val" title="Axis output">0.00</span>');
            out_val_el.appendTo(line_1_el);
            axis.out_val_el = out_val_el;
            
            // config toggle
            axis.conf_toggle_el = $('<span class="conf-toggle'+(axis.edit_open?' open' : '')+'"></span>');
            axis.conf_toggle_el.click((ev)=>{
                if (!axis.conf_toggle_el.hasClass('open')) {
                    axis.conf_toggle_el.addClass('open')
                    axis.config_details_el.addClass('open')
                    axis.edit_open = true;
                } else {
                    axis.conf_toggle_el.removeClass('open')
                    axis.config_details_el.removeClass('open')
                    axis.edit_open = false;
                }
            });
            out_val_el.click((ev)=>{
                axis.conf_toggle_el.click(); // because this happens a lot
            });
            axis.conf_toggle_el.appendTo(line_1_el);

            // collapsable details
            axis.config_details_el = $('<div class="axis-config-details'+(axis.edit_open?' open' : '')+'"></div>');

            // let that = this;
            assignment_sel_el.change((ev)=>{
                let val = $(ev.target).val();

                console.log('Axis '+axis.i+' selected val: '+val)

                let cancel_switch = (reset_selection) => {
                    driver.axes.forEach((a)=>{
                        a.raw_val_el.unbind();
                        a.row_el.removeClass('switch-target');
                        if (driver.switching_axis === a) {
                            a.row_el.removeClass('switch-source')
                            if (reset_selection) {
                                a.assignment_sel_el.val(a.driver_axis); //set not in use
                                if (!a.driver_axis)
                                    a.row_el.addClass('unused');
                                else
                                    a.row_el.removeClass('unused');
                            }
                        }
                    });
                    delete driver.switching_axis;
                }

                if (val == '*') {
                    if (driver.switching_axis && axis !== driver.switching_axis) {
                        cancel_switch(true); // another one was being switched, cancel first
                    }
                    driver.switching_axis = axis;

                    row_el.addClass('unused switch-source');

                    // let axes_ids = Object.keys()
                    driver.axes.forEach((axis2)=>{
                        if (axis == axis2) //skip source
                            return;
                        axis2.row_el.addClass('switch-target');
                        axis2.raw_val_el
                            .unbind()
                            .click((ev)=>{
                                cancel_switch(false);
                                that.switch_axes_config(axis, axis2);

                                axis.assignment_sel_el.val(axis.driver_axis);
                                if (axis.driver_axis)
                                    axis.row_el.removeClass('unused');
                                else
                                    axis.row_el.addClass('unused');
                                that.render_axis_config(driver, axis);

                                axis2.assignment_sel_el.val(axis2.driver_axis);
                                if (axis2.driver_axis)
                                    axis2.row_el.removeClass('unused');
                                else
                                    axis2.row_el.addClass('unused');
                                that.render_axis_config(driver, axis2);

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
                                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                            });
                    });
                    return;
                } else if (driver.switching_axis) {
                    cancel_switch(driver.switching_axis !== axis);
                }

                if (val) {
                    axis.driver_axis = val;
                    
                    that.render_axis_config(driver, axis);
                    row_el.removeClass('unused');

                    axis.conf_toggle_el.addClass('open');
                    axis.config_details_el.addClass('open');

                } else {
                    axis.driver_axis = null;                   
                    
                    that.render_axis_config(driver, axis);
                    row_el.addClass('unused');
                }

                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });

            that.render_axis_config(driver, axis);
            // console.log('axis '+i_axis+' assigned to ', axis.driver_axis);
            if (axis.driver_axis) {
                row_el.removeClass('unused');
            } else {
                row_el.addClass('unused');
            }

            line_1_el.appendTo(row_el);
            axis.config_details_el.appendTo(row_el);

            axis.row_el = row_el;
            axes_els.push(row_el);
           
        }

        $('#gamepad-axes-panel')
            .empty()
            .append(axes_els);

        if (driver.axes_scroll_offset !== undefined) {
            $('#gamepad-axes-panel').scrollTop(driver.axes_scroll_offset);
            delete driver.axes_scroll_offset;
        }
    }

    make_touch_buttons_row_editable(cont, btn_placement) {
        let that = this;
        cont.sortable({
            axis: "x",
            handle: '.btn',
            cursor: "move",
            stop: () => {
                let c = that.controllers['touch'];
                if (!c || !c.profiles) return;
                let profile = c.profiles[that.current_profile];
                let driver = profile.driver_instances[profile.driver]

                for (let i = 0; i < driver.buttons.length; i++) {
                    let btn = driver.buttons[i];
                    if (btn.touch_ui_placement != btn_placement)
                        continue;
                    let index = btn.touch_btn_el.parent().index();
                    btn.sort_index = index;
                }
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            }
        });
    }

    make_touch_buttons_editable() {

        if (!isTouchDevice())
            return;

        setTimeout(()=>{
            let buttons_editable = this.open && this.edited_controller &&
                                this.edited_controller.type == 'touch' &&
                                this.open_panel == 'buttons';

            this.touch_buttons_editable = buttons_editable;

            let top_btns_cont = $('#touch-ui-top-buttons');
            let bottom_btns_cont = $('#touch-ui-bottom-buttons');
            if (buttons_editable) {
                this.make_touch_buttons_row_editable(top_btns_cont, 1);
                this.make_touch_buttons_row_editable(bottom_btns_cont, 2);
            } else {
                [ top_btns_cont, bottom_btns_cont].forEach((cont)=>{
                    if (cont.hasClass('ui-sortable'))
                        cont.sortable('destroy');
                });
            }
        }, 0);
    }

    render_touch_buttons() {
        setTimeout(()=>{
            let c = this.controllers['touch'];
            if (!c || !c.profiles) return;
            let profile = c.profiles[this.current_profile];
            let driver = profile.driver_instances[profile.driver]
            
            let top_btns_cont = $('#touch-ui-top-buttons');
            top_btns_cont.empty();//.removeClass('ui-sortable');

            let bottom_btns_cont = $('#touch-ui-bottom-buttons');
            bottom_btns_cont.empty();//.removeClass('ui-sortable');

            let top_btns = [];
            let bottom_btns = [];

            for (let i = 0; i < driver.buttons.length; i++) {
                let btn = driver.buttons[i];
                if (!btn.touch_ui_placement || !btn.assigned)
                    continue;
                if (btn.touch_ui_placement === 1)
                    top_btns.push(btn);
                else if (btn.touch_ui_placement === 2)
                    bottom_btns.push(btn);
            }

            let that = this;

            [ top_btns, bottom_btns ].forEach((btns)=>{

                btns.sort((a, b) => {
                    return a.sort_index - b.sort_index;
                });

                btns.forEach((btn)=> {
                    let wrap_el = $('<li></li>'); 
                    let label = btn.src_label.trim();
                    if (!label)
                        label = '&nbsp;';
                    let btn_el = $('<span class="btn '+(btn.touch_ui_style?btn.touch_ui_style:'')+'" tabindex="-1">'+label+'</span>')
                    let cont = null;

                    if ((btn.driver_axis || btn.driver_btn) && !c.enabled)
                        btn_el.addClass('disabled');

                    if (btn.repeat_timer) {
                        clearInterval(btn.repeat_timer);
                        btn.repeat_timer = null;
                    }

                    if (btn.touch_ui_placement == 1) {
                        cont = top_btns_cont;
                    } else { // bottom
                        cont = bottom_btns_cont;
                    }
                    btn_el.appendTo(wrap_el);
                    wrap_el.appendTo(cont);
                    btn.touch_btn_el = btn_el;
                    
                    btn_el[0].addEventListener('touchstart', (ev) => {

                        if (that.touch_buttons_editable)
                            return; // don't trigger when sorting

                        btn.touch_started = Date.now();
                        btn.pressed = true;
                        btn.raw = 1.0;

                        if (btn.repeat_timer) {
                            clearInterval(btn.repeat_timer);
                            delete btn.repeat_timer;
                        }

                        // down handlers & repeat
                        if (btn.trigger == 1) {
                            that.trigger_btn_action(c, btn);
                            if (btn.repeat) {
                                btn.repeat_timer = setInterval(
                                    () => { that.trigger_btn_action(c, btn); }, that.input_repeat_delay
                                );
                            }
                        }
                        
                    }, {'passive':true});
            
                    btn_el[0].addEventListener('touchend', () => {

                        if (that.touch_buttons_editable)
                            return;

                        btn.pressed = false;
                        btn.raw = 0.0;

                        if (btn.repeat_timer) {
                            clearInterval(btn.repeat_timer);
                            delete btn.repeat_timer;
                        }

                        // up handlers
                        if (btn.trigger == 2) {
                            that.trigger_btn_action(c, btn);
                        }

                    }, {'passive':true});

                    btn_el.on('contextmenu', that.prevent_context_menu);
                    btn_el.on('contextmenu', that.prevent_context_menu);

                });

            });

            if (top_btns.length && this.touch_buttons_editable) {
                this.make_touch_buttons_row_editable(top_btns_cont, 1);
            }

            if (bottom_btns.length) {
                $('BODY').addClass('touch-bottom-buttons');
                if (this.touch_buttons_editable) {
                    this.make_touch_buttons_row_editable(bottom_btns_cont, 2);
                }
            } else {
                $('BODY').removeClass('touch-bottom-buttons');
            }
        }, 0);
    }

    render_touch_btn_config(driver, btn) {
        
        let that = this;

        setTimeout(()=>{
            // ui placement
            let placement_el = $('<div class="config-row"><span class="label">Placement:</span></div>');
            let placement_opts = [];
            placement_opts.push('<option value="">None</option>');
            placement_opts.push('<option value="1"'+(btn.touch_ui_placement===1?' selected':'')+'>Top menu</option>');
            placement_opts.push('<option value="2"'+(btn.touch_ui_placement===2?' selected':'')+'>Bottom overlay</option>');
            let placement_inp = $('<select>'+placement_opts.join('')+'</select>');
            placement_inp.appendTo(placement_el);
            
            placement_inp.change((ev)=>{
                let placement = parseInt($(ev.target).val());
                // set max sort index 
                let max_sort_index = -1;
                for (let i = 0; i < driver.buttons.length; i++) {
                    if (driver.buttons[i].touch_ui_placement == placement && btn != driver.buttons[i]
                        && driver.buttons[i].touch_ui_placement > max_sort_index)
                        max_sort_index = driver.buttons[i].touch_ui_placement;
                }
                btn.touch_ui_placement = placement;
                btn.sort_index = max_sort_index+1;
                that.render_touch_buttons();
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });
            btn.config_details_el.append(placement_el);

            let label_el = $('<div class="config-row"><span class="label">Label:</span></div>');
            let label_inp = $('<input type="text" value="'+btn.src_label+'" class="half"/>');
            label_inp.appendTo(label_el);
            label_inp.change((ev)=>{
                btn.src_label = $(ev.target).val();
                //btn.raw_val_el.html(btn.src_label);
                that.render_touch_buttons();
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });
            label_inp.on('contextmenu', that.prevent_context_menu);
            btn.config_details_el.append(label_el);

            // color placement
            let color_el = $('<div class="config-row"><span class="label">Style:</span></div>');
            let color_opts = [];
            color_opts.push('<option value="">Default</option>');
            let styles = {
                'red': 'Red',
                'green': 'Green',
                'blue': 'Blue',
                'yellow': 'Yellow',
                'orange': 'Orange',
                'magenta': 'Magenta',
                'cyan': 'Cyan',
            }
            Object.keys(styles).forEach((style)=>{
                color_opts.push('<option value="'+style+'" '+(btn.touch_ui_style==style?'selected':'')+'>'+styles[style]+'</option>');
            })
            let color_inp = $('<select>'+color_opts.join('')+'</select>');
            color_inp.appendTo(color_el);
            
            color_inp.change((ev)=>{
                // set_mod_funct();
                btn.touch_ui_style = $(ev.target).val();
                that.render_touch_buttons();
                that.check_controller_profile_saved(that.edited_controller, that.current_profile);
            });
            btn.config_details_el.append(color_el);

            btn.config_details_el.append($('<span class="separator"></span>'));
        }, 0);
    }

    render_btn_config(driver, btn) {
        
        if (!btn.config_details_el)
            return;

        setTimeout(()=>{
            btn.config_details_el.empty();
            
            if (this.edited_controller.type == 'touch') {
                this.render_touch_btn_config(driver, btn);
            }

            if (btn.driver_axis) {

                if (btn.dead_min === undefined) btn.dead_min = -0.01;
                if (btn.dead_max === undefined) btn.dead_max = 0.01;
                if (btn.offset === undefined) btn.offset = 0.0;
                if (btn.scale === undefined) btn.scale = 1.0;           

                this.render_axis_config(driver, btn, true); //render button as axis with input for trigger src
            } else if (btn.driver_btn) {

                if (btn.trigger === undefined) btn.trigger = 1; // press by default
                this.render_driver_button_config(driver, btn); //render button as axis

            } else if (btn.action) {

                switch (btn.action) {
                    case 'ros-srv':
                        this.render_ros_srv_button_config(driver, btn);
                        break;
                    case 'ctrl-enabled': 
                        this.render_ctrl_enabled_button_config(driver, btn);
                        break;
                    case 'input-profile': 
                        this.render_input_profile_button_config(driver, btn);
                        break;
                    case 'ui-profile': 
                        this.render_ui_profile_button_config(driver, btn);
                        break;
                    case 'wifi-roam': 
                        this.render_wifi_roam_button_config(driver, btn);
                        break;
                    default: 
                        console.error('Button action type not supported: ', btn.action)
                        btn.conf_toggle_el.removeClass('open');
                        btn.config_details_el.removeClass('open');
                        return; 
                }

            } else {
                btn.conf_toggle_el.removeClass('open')
                btn.config_details_el.removeClass('open')
                return; 
            }
        }, 0);
    };

    gamepad_button_label(btn_code) {
        return 'B' + btn_code;
    }

    keyboard_key_label(key, mod) {
        let label = key ? key.toUpperCase() : key;
        switch (label) {
            case ' ': label = '␣'; break;
            case 'ARROWLEFT': label = '←'; break; // &#8592;
            case 'ARROWRIGHT': label = '→'; break; //&#8594;
            case 'ARROWUP': label = '↑'; break; // &#8593;
            case 'ARROWDOWN': label = '↓'; break; // &#8595;
            case 'TAB': label = 'Tab'; break;
            case 'ENTER': label = 'Enter'; break;
            case 'SHIFT': label = 'Shift'; break;
            case 'CONTROL': label = 'Ctrl'; break;
            case 'META': label = 'Meta'; break;
            case 'ALT': label = 'Alt'; break;
        }
        switch (mod) {
            case 'alt': label = 'Alt+'+label; break;
            case 'ctrl': label = 'Ctrl+'+label; break;
            case 'meta': label = 'Meta+'+label; break;
            case 'shift': label = 'Shift+'+label; break;
        }
        return label;
    }

    make_btn_row(driver, btn) {

        let that = this;

        let row_el = $('<div class="button-row unused"></div>');
        btn.row_el = row_el;

        // raw val
        let raw_val_el = $('<span class="btn-val" title="Button input"></span>');
        raw_val_el.appendTo(row_el);

        let close_listening = () => {
            btn.listening = false;
            raw_val_el.removeClass('listening');
            raw_val_el.html(btn.src_label!==null?btn.src_label:'n/a');
            if (btn.id_src!==null)
                raw_val_el.addClass('assigned');
            $('#input-manager-overlay').unbind().css('display', 'none');
            delete driver.on_button_press;
            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        };
        raw_val_el.click(()=>{
            if (that.edited_controller.type == 'touch')
                return;

            if (!raw_val_el.hasClass('listening')) {
                raw_val_el.removeClass('assigned').addClass('listening');
                raw_val_el.html('?');
                $('#input-manager-overlay').unbind().css('display', 'block').click(()=>{
                    close_listening();
                });
                btn.listening = true;
                driver.on_button_press = (key_code, kb_ev) => {
                    
                    if (key_code == 'Escape') { // cancel 
                        close_listening();
                        return;
                    }
                    else if (key_code == 'Delete' || key_code == 'Backspace') { // clear
                        btn.id_src = null;
                        btn.src_label = null;
                        btn.key_mod = null;
                        close_listening();
                        return;
                    }

                    if (that.edited_controller.type == 'keyboard') {
                        btn.key_mod = null;
                        if (kb_ev.altKey)
                            btn.key_mod = 'alt';
                        else if (kb_ev.ctrlKey)
                            btn.key_mod = 'ctrl';
                        else if (kb_ev.metaKey)
                            btn.key_mod = 'meta';
                        else if (kb_ev.shiftKey)
                            btn.key_mod = 'shift';

                        btn.id_src = kb_ev.key.toLowerCase(); // comparing lower cases
                        btn.src_label = that.keyboard_key_label(btn.id_src, btn.key_mod);
                        
                    } else if (that.edited_controller.type == 'gamepad') {
                        btn.src_label = that.gamepad_button_label(key_code);
                        btn.id_src = key_code;
                    }
                        
                    console.log('Assigned: '+btn.id_src+(btn.key_mod?'+'+btn.key_mod:''));

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
            '<option value="ros-srv"'+(btn.action == 'ros-srv' ? ' selected': '')+'>Call ROS Service</option>',
            '<option value="ctrl-enabled"'+(btn.action == 'ctrl-enabled' ? ' selected': '')+'>Set Controller Enabled</option>',
            '<option value="input-profile"'+(btn.action == 'input-profile' ? ' selected': '')+'>Set Input Profile</option>',
            '<option value="ui-profile"'+(btn.action == 'ui-profile' ? ' selected': '')+'>Set UI Layout</option>',
        ];
        
        if (this.ui.wifi_scan_enabled) {
            opts.push('<option value="wifi-roam"'+(btn.action == 'wifi-roam' ? ' selected': '')+'>Wi-fi scan &amp; Roam</option>');
        }
        // let dri = profile.driver_instance;
        let dri_btns = driver.get_buttons();
        let dri_btns_ids = Object.keys(dri_btns);
        for (let j = 0; j < dri_btns_ids.length; j++) {
            let id_btn = dri_btns_ids[j];
            opts.push('<option value="btn:'+id_btn+'"'+(btn.driver_btn == id_btn ? ' selected' : '')+'>'+dri_btns[id_btn]+'</option>');
        }
        let dri_axes = driver.get_axes();
        let dri_axes_ids = Object.keys(dri_axes);
        for (let j = 0; j < dri_axes_ids.length; j++) {
            let id_axis = dri_axes_ids[j];
            opts.push('<option value="axis:'+id_axis+'"'+(btn.driver_axis == id_axis ? ' selected' : '')+'>'+dri_axes[id_axis]+'</option>');
        }
        let assignment_sel_el = $('<select>'+opts.join('')+'</select>');
        assignment_sel_el.appendTo(line_1_el);
        btn.assignment_sel_el = assignment_sel_el;

        // output val
        let out_val_el = $('<span class="btn-output-val" title="Button output"></span>');
        out_val_el.appendTo(line_1_el);
        btn.out_val_el = out_val_el;

        // config toggle
        btn.conf_toggle_el = $('<span class="conf-toggle'+(btn.edit_open?' open' : '')+'"></span>');
        btn.conf_toggle_el.click((ev)=>{
            if (!btn.conf_toggle_el.hasClass('open')) {
                btn.conf_toggle_el.addClass('open')
                btn.config_details_el.addClass('open')
                btn.edit_open = true;
            } else {
                btn.conf_toggle_el.removeClass('open')
                btn.config_details_el.removeClass('open')
                btn.edit_open = false;
            }
        });
        out_val_el.click((ev)=>{
            btn.conf_toggle_el.click(); // because this happens a lot
        });
        btn.conf_toggle_el.appendTo(line_1_el);

        // collapsable details
        btn.config_details_el = $('<div class="btn-config-details'+(btn.edit_open?' open' : '')+'"></div>');

        assignment_sel_el.change((ev)=>{
            let val_btn_assigned = $(ev.target).val();

            if (val_btn_assigned) {

                if (val_btn_assigned.indexOf('axis:') === 0) {
                    let id_axis_assigned = val_btn_assigned.substring(5);;
                    console.log('btn '+ btn.i +' assigned axis: ', id_axis_assigned)
                    btn.driver_btn = null;
                    btn.action = null;
                    btn.driver_axis = id_axis_assigned;
                    btn.assigned = true;
                } else if (val_btn_assigned.indexOf('btn:') === 0) {
                    let id_btn_assigned = val_btn_assigned.substring(4);;
                    console.log('btn '+ btn.i +' assigned btn: ', id_btn_assigned)
                    btn.driver_axis = null;
                    btn.action = null;
                    btn.driver_btn = id_btn_assigned;
                    if (btn.trigger === undefined || btn.trigger === null)
                        btn.trigger = 1; // press by default
                    btn.assigned = true;
                } else { // actions
                    console.log('btn '+ btn.i +' assigned action: ', val_btn_assigned)
                    btn.driver_axis = null;
                    btn.driver_btn = null;
                    btn.action = val_btn_assigned;
                    if (btn.trigger === undefined || btn.trigger === null)
                        btn.trigger = 1; // press by default
                    switch (btn.action) {
                        case 'ctrl-enabled': 
                            if (btn.set_ctrl_state === undefined || btn.set_ctrl_state === null)
                                btn.set_ctrl_state = 2; //toggle by default
                            
                            break;
                        default: break;
                    }
                    btn.assigned = true;
                }
                
                that.render_btn_config(driver, btn);
                row_el.removeClass('unused');

                btn.conf_toggle_el.addClass('open');
                btn.config_details_el.addClass('open');
                btn.edit_open = true;

            } else {
                btn.driver_axis = null;                   
                btn.driver_btn = null;
                btn.action = null;
                btn.assigned = false;
                btn.edit_open = false;
                
                that.render_btn_config(driver, btn);
                row_el.addClass('unused');
            }

            if (that.edited_controller.type == 'touch') {
                that.render_touch_buttons();
            }

            that.check_controller_profile_saved(that.edited_controller, that.current_profile);
        });

        this.render_btn_config(driver, btn);

        if (assignment_sel_el.val()) {
            row_el.removeClass('unused');
        } else {
            row_el.addClass('unused');
        }

        line_1_el.appendTo(row_el);
        btn.config_details_el.appendTo(row_el);

        return row_el;
    }

    make_buttons_ui(driver) {
        
        let that = this;

        setTimeout(()=>{
            // all gamepad axes
            let button_els = [];
            for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
                let btn = driver.buttons[i_btn];
                let row_el = this.make_btn_row(driver, btn);
                button_els.push(row_el);
            }

            let add_btn = null;
            if (this.edited_controller.type == 'keyboard') {
                add_btn = $('<button id="add-button-btn"><span class="icon"></span>Add key mapping</button>')
            }
            else if (this.edited_controller.type == 'touch') {
                add_btn = $('<button id="add-button-btn"><span class="icon"></span>Add UI button</button>')
            }
            else if (this.edited_controller.type == 'gamepad') {
                add_btn = $('<button id="add-button-btn"><span class="icon"></span>Add button</button>')
            }

            if (add_btn) {
                add_btn.click((ev)=>{
                    let new_btn = that.make_button(driver, that.edited_controller.type);
                    if (that.edited_controller.type == 'touch') {
                        new_btn.src_label = 'Aux ' + new_btn.i ; // init label
                    }
                    let row_el = that.make_btn_row(driver, new_btn); 
                    row_el.insertBefore($('#add-button-btn'));
                    $('#gamepad-buttons-panel').scrollTop($('#gamepad-buttons-panel').prop('scrollHeight'));
                    that.check_controller_profile_saved(that.edited_controller, that.current_profile);
                });
                button_els.push(add_btn);
            }

            $('#gamepad-buttons-panel')
                .empty()
                .append(button_els);

            if (driver.buttons_scroll_offset !== undefined) {
                $('#gamepad-buttons-panel').scrollTop(driver.buttons_scroll_offset);
                delete driver.buttons_scroll_offset;
            }
        }, 0);
    }

    trigger_btn_action(c, btn) {

        if (!btn.assigned || btn.driver_axis || btn.driver_btn)
            return;

        console.warn('Btn '+btn.src_label+' trigerred');

        // btn.out_val_el.html('false').addClass('live');
        btn.val = true;
        btn.live = true;
        if (btn.reset_timer)
            clearTimeout(btn.reset_timer);
        btn.reset_timer = setTimeout(()=>{
            btn.reset_timer = null;
            btn.val = false;
            btn.live = false;
        }, 100); // short flash
        let that = this;

        switch (btn.action) {
            case 'ros-srv':
                //TODO
                if (!btn.ros_srv_id) {
                    this.ui.show_notification('Service ID not set', 'error');
                    console.warn('Service ID not set');
                    return;
                }
                if (!btn.ros_srv_msg_type) {
                    console.error('Service msg_type not set');
                    this.ui.service_reply_notification(btn.touch_btn_el, btn.ros_srv_id, true, { err: 1, msg: 'Service not yet discovered, missing message type'});
                    return;
                }
                if (btn.service_blocked) {
                    this.ui.show_notification('Skipping service '+btn.ros_srv_id+' call (previous call unfinished)', 'error');
                    console.warn('Skipping service '+btn.ros_srv_id+' call (previous call unfinished)');
                    return;
                }
                let call_args = btn.ros_srv_val; // from widget or parsed json

                if (btn.touch_btn_el)
                    btn.touch_btn_el.addClass('working');

                btn.service_blocked = true;
                this.client.service_call(btn.ros_srv_id, call_args ? call_args : undefined, !btn.show_service_request, (reply) => {
                    btn.service_blocked = false;
                    that.ui.service_reply_notification(btn.touch_btn_el, btn.ros_srv_id, btn.show_service_reply, reply);
                });
                
                break;
            case 'ctrl-enabled': 
                let state = false; 
                switch (btn.set_ctrl_state) {
                    case 0: state = false; break;
                    case 1: state = true; break;
                    case 2: state = !c.enabled; break;
                }
                that.set_controller_enabled(c, state);
                break;
            case 'input-profile': 
                if (btn.set_ctrl_profile) {
                    if (!that.profiles[btn.set_ctrl_profile]) {
                        console.error('Ignoring invalid input profile "'+btn.set_ctrl_profile+'"');
                        return;
                    }
                    console.log('Setting input profile to '+btn.set_ctrl_profile);
                    
                    that.close_profile_basics_edit();
                    
                    that.reset_all();
                    that.current_profile = btn.set_ctrl_profile;
                    that.show_input_profile_notification();
                    that.reset_all();
                    that.make_ui();
                    that.render_touch_buttons();
                }
                break;
            case 'ui-profile': 
                //TODO
                console.error('UI profiles TBD')
                break;
            case 'wifi-roam': 
                console.log('WIFI SCAN & ROAM');
                if (btn.touch_btn_el)
                    btn.touch_btn_el.addClass('working');
                that.ui.trigger_wifi_scan(()=>{
                    if (btn.touch_btn_el)
                        btn.touch_btn_el.removeClass('working');
                });
                break;
            default: 
                break; 
        }
    }

    async update_axes_ui_values () {
        if (!this.open || !this.edited_controller || this.open_panel != 'axes')
            return;
        
        setTimeout(()=>{
            let profile = this.edited_controller.profiles[this.current_profile];
            let driver = profile.driver_instances[profile.driver];

            for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {

                let axis = driver.axes[i_axis];

                if (axis.raw !== null && axis.raw !== undefined)
                    axis.raw_val_el.html(axis.raw.toFixed(2));
                else 
                    axis.raw_val_el.html('0.00');

                if (!axis.driver_axis)
                    continue;
                
                if (axis.val !== null && axis.val !== undefined)
                    axis.out_val_el.html(axis.val.toFixed(2));
                else
                    axis.out_val_el.html('0.00');

                if (axis.live) {
                    axis.out_val_el.addClass('live');
                } else {
                    axis.out_val_el.removeClass('live');
                }
            }
        }, 0);
    }

    async update_buttons_ui_values () {
        if (!this.open || !this.edited_controller || this.open_panel != 'buttons')
            return;
        
        setTimeout(()=>{
            let profile = this.edited_controller.profiles[this.current_profile];
            let driver = profile.driver_instances[profile.driver];

            for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {

                let btn = driver.buttons[i_btn];
                if (btn.listening)
                    continue;

                if (btn.raw_val_el) {
                    if (this.edited_controller.type == 'keyboard' && btn.id_src) {

                        btn.raw_val_el.html(btn.src_label);
    
                        if (btn.pressed)
                            btn.raw_val_el.addClass('pressed');
                        else
                            btn.raw_val_el.removeClass('pressed');
    
                    } else if (this.edited_controller.type == 'touch' && btn.src_label) {
    
                        btn.raw_val_el.html(btn.src_label);
    
                        if (btn.pressed)
                            btn.raw_val_el.addClass('pressed');
                        else
                            btn.raw_val_el.removeClass('pressed');
    
                    } else if (Number.isInteger(btn.id_src)) {
    
                        if (btn.driver_axis && (btn.pressed || btn.touched) && !(btn.raw === undefined || btn.raw === null)) {
                            btn.raw_val_el.html(btn.raw.toFixed(2));
                        } else if (btn.src_label) {
                            btn.raw_val_el.html(btn.src_label);
                        } else {
                            btn.raw_val_el.html('none');
                        }
    
                        if (btn.touched)
                            btn.raw_val_el.addClass('touched');
                        else
                            btn.raw_val_el.removeClass('touched');
            
                        if (btn.pressed)
                            btn.raw_val_el.addClass('pressed');
                        else
                            btn.raw_val_el.removeClass('pressed');
    
                    } else {
                        btn.raw_val_el.removeClass('touched');
                        btn.raw_val_el.removeClass('pressed');
                        btn.raw_val_el.html('none');
                    }
                }

                if (btn.assigned) {

                    if (btn.driver_btn && (btn.val === true || btn.val === false))
                        btn.out_val_el.html(btn.val.toString());
                    else if (btn.driver_axis && btn.val !== null && btn.val !== undefined)
                        btn.out_val_el.html(btn.val.toFixed(2));
                    else
                        btn.out_val_el.html(btn.val ? 'true' : 'false');
        
                    if (btn.live) {
                        btn.out_val_el.addClass('live');
                    } else {
                        btn.out_val_el.removeClass('live');
                    }

                }
                
            }
        }, 0);
    }

    process_axes_input(c) {

        let profile = c.profiles[this.current_profile];
        let driver = profile.driver_instances[profile.driver];

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
           
            if (axis.dead_val === undefined) // unset on min/max change
                axis.dead_val = (axis.dead_min+axis.dead_max) / 2.0;

            if (!axis.driver_axis)
                continue;
        
            let raw = axis.raw;
            if (raw === null || raw === undefined)
                raw = axis.dead_val; //null => assign dead;

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
                if (axis.scale < 0) // sign matters (saving unsaled offset vals as normalized)
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
            } else { // add multiple axes into one (use this for negative/positive split)
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
                else
                    driver.axes_output[axis.driver_axis] += axis.val;
                continue; // all good
            }

            switch (axis.mod_func) {
                case 'scale_by_velocity':
                    if (!axis.scale_by_velocity_src || combined_axes_unscaled_vals[axis.scale_by_velocity_src] === undefined) {
                        axis.val = axis.dead_val; // hold until fully configured
                        axis.live = false;
                        continue;
                    }
                        
                    let velocity_normalized = combined_axes_unscaled_vals[axis.scale_by_velocity_src];
                    let abs_velocity_normalized = Math.abs(Math.max(-1.0, Math.min(1.0, velocity_normalized))); // clamp abs to [0.0; 1.0]
                    
                    let multiplier = lerp(axis.scale_by_velocity_mult_min, axis.scale_by_velocity_mult_max, abs_velocity_normalized);

                    axis.val *= multiplier;
                    if (driver.axes_output[axis.driver_axis] === undefined)
                        driver.axes_output[axis.driver_axis] = axis.val;
                    else
                        driver.axes_output[axis.driver_axis] += axis.val;

                    // console.log('Scaling axis '+i_axis+' ('+axis.driver_axis+') by '+abs_velocity_normalized+' ('+axis.scale_by_velocity_src+') m='+multiplier)

                    break;
                default:
                    break;
            }

        }

        return some_axes_live;
    }

    process_buttons_input(c) {

        let profile = c.profiles[this.current_profile];
        let driver = profile.driver_instances[profile.driver];

        let some_buttons_live = false;
        driver.buttons_output = {}; // this goes to the drive

        for (let i_btn = 0; i_btn < driver.buttons.length; i_btn++) {
            let btn = driver.buttons[i_btn];
    
            if (btn.driver_btn) {
                btn.val = false;
                if (btn.trigger === 0 && btn.touched) {
                    btn.val = true;
                }
                else if (btn.trigger === 1 && btn.pressed) {
                    btn.val = true;
                }
                btn.live = btn.val;
                some_buttons_live = btn.live || some_buttons_live;

                if (driver.buttons_output[btn.driver_btn] === undefined)
                    driver.buttons_output[btn.driver_btn] = btn.val;
                else
                    driver.buttons_output[btn.driver_btn] = btn.val || driver.buttons_output[btn.driver_btn]; // allow triggering with multiiple btns
            }
        }

        return some_buttons_live;
    }

    on_gamepad_connected(ev) {
            
        let id_gamepad = ev.gamepad.id;
        const gp = navigator.getGamepads()[ev.gamepad.index];

        if (!gp) {
            console.warn('Error initiating gamepad', ev.gamepad);
            return;
        }

        if (!this.controllers[id_gamepad]) {

            let id_lowcase = id_gamepad.toLowerCase();
            let likely_not_gamepad = isTouchDevice() && 
                                    (id_lowcase.indexOf('keyboard') > -1 // ¯\_(ツ)_/¯
                                    || id_lowcase.indexOf('mouse') > -1); // not using gamepad defaults

            console.warn('Gamepad connected:', id_gamepad, ev.gamepad, gp, ev);
            let gamepad = {
                type: 'gamepad',
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
            console.info('Gamepad was already connected:', id_gamepad);
        }

        let label = id_gamepad.split('(')[0]; // remove (Vendor: xxx)
        this.ui.show_notification(label + ' connected');

        this.init_controller(this.controllers[id_gamepad]);
    }

    on_gamepad_disconnected (ev) {

        if (this.controllers[ev.gamepad.id]) {

            console.log('Gamepad disconnected '+ev.gamepad.id);
            this.controllers[ev.gamepad.id].gamepad = null;
            this.controllers[ev.gamepad.id].connected = false;

            this.make_controller_icons();

            let label = ev.gamepad.id.split('(')[0]; // remove (Vendor: xxx)
            this.ui.show_notification(label + ' disconnected');
        }

    }

    make_touch_gamepad() {
        if (!this.controllers['touch']) {
            let touch_gamepad = {
                type: 'touch',
                id: 'touch',
                profiles: null,
                initiated: false, //this will wait for config
                connected: true,
            };
            this.controllers['touch'] = touch_gamepad;
            this.init_controller(touch_gamepad);
        }
    }

    make_keyboard() {
        if (!this.controllers['keyboard']) {
            let kb = {
                type: 'keyboard',
                id: 'keyboard',
                profiles: null,
                initiated: false, //this will wait for config
                connected: true,
            };
            this.controllers['keyboard'] = kb;
            this.init_controller(kb);
        }
    }

    set_touch_gamepad_on(state) {
        this.touch_gamepad_on = state;
        // this.controllers['touch'].connected = state;

        if (state) {
            if (this.edited_controller != this.controllers['touch']) {
                this.edited_controller = this.controllers['touch'];
            }
            this.init_controller(this.controllers['touch']);
        } else {
            this.make_controller_icons();        
        }
    }

    set_touch_gamepad_input(joy_id, value, angle) {
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

    run_input_loop() {

        if (!this.loop_running) {
            console.log('Input loop stopped')
            this.loop_running = false;
            return;
        }

        let topics_transmitted_this_frame = {};
        
        let that = this;
        Object.values(this.controllers).forEach((c)=>{
        
            if (!c.profiles)
                return; //not yet configured

            let c_profile = c.profiles[that.current_profile];
            let driver = c_profile.driver_instances[c_profile.driver];
    
            if (c.type == 'touch') {
    
                if (this.last_touch_input['left']) {
                    driver.axes[0].raw = this.last_touch_input['left'].x;
                    driver.axes[1].raw = this.last_touch_input['left'].y;
                } else {
                    driver.axes[0].raw = 0.0;
                    driver.axes[1].raw = 0.0;
                }
                if (this.last_touch_input['right']) {
                    driver.axes[2].raw = this.last_touch_input['right'].x;
                    driver.axes[3].raw = this.last_touch_input['right'].y;
                } else {
                    driver.axes[2].raw = 0.0;
                    driver.axes[3].raw = 0.0;
                }

            } else if (c.type == 'keyboard') {

               // handle in on_keyboard_key_down/up

            } else if (c.type == 'gamepad') {
                
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
                                if (read_val != 0.0) { // wait for first non-zero signal because some gamepads are weird
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
                        
                        if (driver.on_button_press) { // user mapping
                            for (let i = 0; i < gp.buttons.length; i++) {
                                if (gp.buttons[i].pressed) {
                                    driver.on_button_press(i);
                                }
                            }   
                        } else {
                            for (let j = 0; j < driver.buttons.length; j++) {
                                let btn = driver.buttons[j];
                                if (btn.id_src === null)
                                    continue;
    
                                let gp_btn = gp.buttons[btn.id_src];
                                if (!btn || !gp_btn)
                                    continue;
    
                                let read_val = gp_btn.value;
                                let was_pressed = btn.pressed;
                                let was_touched = btn.touched;
                                if (btn.needs_reset) {  
                                    if (!gp_btn.pressed && !gp_btn.touched) { // wait for first non-zero signal because some gamepads are weird
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
                                 if (btn.trigger == 0) { // touch
                                    if (btn.touched && !was_touched) {
                                        that.trigger_btn_action(c, btn);
                                        if (btn.repeat) {
                                            if (btn.repeat_timer)
                                                clearInterval(btn.repeat_timer);
                                            btn.repeat_timer = setInterval(
                                                () => { that.trigger_btn_action(c, btn); }, that.input_repeat_delay
                                            );
                                        }
                                    } else if (!btn.touched && was_touched && btn.repeat_timer) {
                                        clearInterval(btn.repeat_timer);
                                        delete btn.repeat_timer;
                                    }
                                }

                                else if (btn.trigger == 1) { // press
                                    if (btn.pressed && !was_pressed) {
                                        that.trigger_btn_action(c, btn);
                                        if (btn.repeat) {
                                            if (btn.repeat_timer)
                                                clearInterval(btn.repeat_timer);
                                            btn.repeat_timer = setInterval(
                                                () => { that.trigger_btn_action(c, btn); }, that.input_repeat_delay
                                            );
                                        }
                                    } else if (!btn.pressed && was_pressed && btn.repeat_timer) {
                                        clearInterval(btn.repeat_timer);
                                        delete btn.repeat_timer;
                                    }
                                }

                                else if (btn.trigger == 2 && !btn.pressed && !btn.touched && (was_pressed || was_touched)) { // release
                                    that.trigger_btn_action(c, btn);
                                }

                            }
                        }
    
                    } catch (e) {
                        console.error('Error reading gp; c.gp=', c.gamepad);
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
            } else
                return; //nothing to do for this controller atm
    
            let axes_alive = this.process_axes_input(c) && c.connected;
            let buttons_alive = this.process_buttons_input(c) && c.connected;
            let cooldown = false;
            let transmitted_last_frame = this.topics_transmitted_last_frame[driver.output_topic];
            
            if (!axes_alive && !buttons_alive && transmitted_last_frame) { // cooldown for 1s to make sure zero values are received
                if (that.cooldown_drivers[driver.output_topic] === undefined) {
                    that.cooldown_drivers[driver.output_topic] = {
                        started: Date.now(),
                        driver: driver,
                    }
                    cooldown = true;
                } else if (that.cooldown_drivers[driver.output_topic].started + 1000 > Date.now() ) {
                    cooldown = true;
                }
            } else if (that.cooldown_drivers[driver.output_topic] !== undefined) {
                delete that.cooldown_drivers[driver.output_topic]; // some axes alive => reset cooldown
            }
            
            let can_transmit = driver.can_transmit();
            let transmitting = c.enabled && (axes_alive || buttons_alive || cooldown) && can_transmit;
    
            driver.generate();
            
            if (this.open && this.edited_controller == c && this.open_panel == 'output') {
                driver.display_output(this.debug_output_panel, transmitting);
            }
    
            // c.transmitted_last_frame = transmitting;
            c.transmitting_user_input = transmitting && !cooldown; // more intuitive user feedback

            let had_error = c.has_error;
            c.has_error = !can_transmit && c.enabled && (axes_alive || buttons_alive || cooldown);
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
                } else if (!driver.first_write_error_resolved && Date.now() > driver.write_error_started+3000) { 
                    c.show_error = true; // wait 3s in case of the 1st error before reporting problem (writer needs to set up)
                } else if (driver.first_write_error_resolved) {
                    c.show_error = true; // all further errors report immediately
                }
                
            } else if (!c.has_error && had_error) {
                driver.first_write_error_resolved = true;
            }

            that.update_controller_icon(c);
            that.update_input_status_icon();

        });

        let topics_transmitted_last_frame = Object.keys(this.topics_transmitted_last_frame);
        topics_transmitted_last_frame.forEach((topic) => {
            if (!topics_transmitted_this_frame[topic] && !this.cooldown_drivers[topic]) {
                let driver = that.topics_transmitted_last_frame[topic];
                that.cooldown_drivers[topic] = {
                    started: Date.now(),
                    driver: driver
                }
                driver.reset_all_output(); //make sure we send all zeroes
            }
        });

        // cooldown topic even when driver was switched for a controller
        let cooldown_topics = Object.keys(this.cooldown_drivers);
        cooldown_topics.forEach((topic)=>{
            if (topics_transmitted_this_frame[topic])
                return;

            if (that.cooldown_drivers[topic].started + 1000 < Date.now()) {
                delete that.cooldown_drivers[topic];
            } else {
                that.cooldown_drivers[topic].driver.generate();
                that.cooldown_drivers[topic].driver.transmit();
            }
        });

        this.topics_transmitted_last_frame = topics_transmitted_this_frame;

        this.update_axes_ui_values();
        this.update_buttons_ui_values();
        
        requestAnimationFrame((t) => this.run_input_loop());
    }

    driver_has_key_mod_binding(driver, key, key_mod) {
        for (let i = 0; i < driver.buttons.length; i++) {
            let btn = driver.buttons[i];
            if (btn.id_src == key && btn.key_mod == key_mod) {
                return true;
            }
        }
        return false;
    }

    on_keyboard_key_down(ev, c) {
        
        if (ev.repeat)
            return;

        if (ev.srcElement && ev.srcElement.nodeName && ['input', 'textarea'].indexOf(ev.srcElement.nodeName.toLowerCase()) > -1) {
            return; // ignore input fields
        }

        if (['Escape', 'Delete', 'Backspace'].indexOf(ev.code) > -1) { // kb cancel / del work for all controllers
            let that = this;
            Object.values(this.controllers).forEach((c)=>{
                if (!c.profiles)
                    return;
                let p = c.profiles[that.current_profile];
                let d = p.driver_instances[p.driver];
                if (d.on_button_press) {
                    d.on_button_press(ev.code, ev);
                }
            });
            return;
        }

        if (!c || !c.profiles)
            return;

        let c_profile = c.profiles[this.current_profile];
        let driver = c_profile.driver_instances[c_profile.driver];

        let that = this;

        if (driver.on_button_press) { // user mapping
            if (['Shift', 'Control', 'Alt', 'Meta'].indexOf(ev.key) > -1) {
                return; // ignore single modifiers here
            }
            driver.on_button_press(ev.code, ev);
            return;
        }

        for (let i = 0; i < driver.buttons.length; i++) {
            let btn = driver.buttons[i];
            if (btn.pressed)
                continue;

            if (btn.id_src == ev.key.toLowerCase()) {
                if (btn.key_mod == 'shift' && !ev.shiftKey)
                    continue;
                if (ev.shiftKey && btn.key_mod != 'shift' && this.driver_has_key_mod_binding(driver, ev.key.toLowerCase(), 'shift'))
                    continue;
                if (btn.key_mod == 'meta' && !ev.metaKey)
                    continue;
                if (ev.metaKey && btn.key_mod != 'meta' && this.driver_has_key_mod_binding(driver, ev.key.toLowerCase(), 'meta'))
                    continue;
                if (btn.key_mod == 'ctrl' && !ev.ctrlKey)
                    continue;
                if (ev.ctrlKey && btn.key_mod != 'ctrl' && this.driver_has_key_mod_binding(driver, ev.key.toLowerCase(), 'ctrl'))
                    continue;
                if (btn.key_mod == 'alt' && !ev.altKey)
                    continue;
                if (ev.altKey && btn.key_mod != 'alt' && this.driver_has_key_mod_binding(driver, ev.key.toLowerCase(), 'alt'))
                    continue;
               
                btn.pressed = true;
                btn.raw = 1.0;

                // down handlers & repeat
                if (btn.trigger == 1) {
                    that.trigger_btn_action(c, btn);
                    if (btn.repeat) {
                        btn.repeat_timer = setInterval(
                            () => { that.trigger_btn_action(c, btn); }, that.input_repeat_delay
                        );
                    }
                }
            }
        }
    }

    on_keyboard_key_up(ev, c) {

        if (ev.srcElement && ev.srcElement.nodeName && ['input', 'textarea'].indexOf(ev.srcElement.nodeName.toLowerCase()) > -1) {
            return; // ignore input fields
        }

        if (!c || !c.profiles)
            return;

        let c_profile = c.profiles[this.current_profile];
        let driver = c_profile.driver_instances[c_profile.driver];
        let that = this;

        if (driver.on_button_press) { // if still listening on up, thus must be a single modifier
            driver.on_button_press(ev.code, ev); 
            return; // assigned
        }

        for (let i = 0; i < driver.buttons.length; i++) {
            let btn = driver.buttons[i];
            if (!btn.pressed)
                continue;

            if (btn.id_src == ev.key.toLowerCase() || 
                (ev.key == 'Shift' && btn.key_mod == 'shift') ||
                (ev.key == 'Alt' && btn.key_mod == 'alt') ||
                (ev.key == 'Ctrl' && btn.key_mod == 'ctrl') ||
                (ev.key == 'Meta' && btn.key_mod == 'meta')
            ) {
                btn.pressed = false;
                btn.raw = 0.0;

                if (btn.repeat_timer) {
                    clearInterval(btn.repeat_timer);
                    delete btn.repeat_timer;
                }

                // up handlers
                if (btn.trigger == 2) {
                    that.trigger_btn_action(c, btn);
                }
            }
        }
    }

}