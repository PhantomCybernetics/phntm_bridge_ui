import { isIOS, lerp, isTouchDevice } from './lib.js';
import { Handle_Shortcut } from '/static/input-drivers.js';
import * as THREE from 'three';

export class InputManager {

    constructor(client) {

        this.client = client;

        this.registered_drivers = {}; // id => class; all available
        this.enabled_drivers = {}; // gp_type => driver[]; enabled by robot

        this.controllers = {}; //id => gp ( touch)
        this.edited_controller = null;

        this.robot_defaults = null; // defaults from robot

        this.profiles = null;
        this.current_profile = null;

        // this.default_shortcuts_config = {};
        // this.shortcuts_config = null;
        // this.last_buttons = [];
        // this.editor_listening = false;

        // this.last_gp_loaded = null;
        this.loop_delay = 33.3; // ms, 30Hz updates
        
        // this.enabled = false; 
        this.loop_running = false;
        $('#gamepad_enabled').prop('checked', false);
        this.status_icon = $('#gamepad_status');
        this.debug_output_panel = $('#gamepad-output-panel');

        let that = this;
        this.zero = new THREE.Vector2(0,0);

        // this.show_icon = this.load_some_gamepad_once_connected(); // once you'be connected a gamepad, the icon will stay on
        
        // this.default_configs = {};
        // this.profiles = {}; // gp type => id => profile[]

        // this.touch_gamepad = false;
        this.last_touch_input = {};
       
        client.on('input_config', (drivers, defaults)=>{ that.set_config(drivers, defaults); });
        // client.on('touch_config', (drivers, defaults)=>{ that.set_config('touch', drivers, defaults); });
        // client.on('kb_config', (drivers, defaults)=>{ that.set_config('kb', drivers, defaults); });

        $('#gamepad_status').click(() => {
            // if (!that.initiated)
            //     return; //wait 
            $('#keyboard').removeClass('open');
            if (!$('#gamepad').hasClass('open')) {
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
                        $('#gamepad_status').click();
                    })
            } else {
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
            let open = '';
            let open_tab = ev.target;
            switch (ev.target.id) {
                case 'gamepad-axes-tab': open = '#gamepad-axes-panel'; break;
                case 'gamepad-buttons-tab': open = '#gamepad-buttons-panel'; break;
                case 'gamepad-output-tab': open = '#gamepad-output-panel'; break;
                case 'gamepad-settings-tab':
                case 'gamepad-profile-unsaved-warn':
                    open = '#gamepad-settings-panel';
                    open_tab = '#gamepad-settings-tab';
                    break;
                default: return;
            }
            $(open_tab) 
                .addClass('active')
            $(open)
                .addClass('active');
        });
        $('#gamepad-profile-unsaved-warn').click((ev)=>{
            $('#gamepad-settings-tab').click();
        });

        $('#gamepad_enabled').change((ev) => {
            that.edited_controller.enabled = $(ev.target).prop('checked');
            that.save_user_controller_enabled(that.edited_controller);
            that.make_controller_icons();
            // if (that.edited_controller.enabled) {
            //     // $('#gamepad').addClass('enabled');
            //     // that.disable_kb_on_conflict();
            // } else {
            //     // $('#gamepad').removeClass('enabled');
            // }
        });

        $('#profile-buttons > .icon, #profile-unsaved-warn').click((ev)=>{
            if ($('#profile-buttons').hasClass('open')) {
                $('#profile-buttons').removeClass('open');
            } else {
                $('#profile-buttons').addClass('open');
            }
        })

        // $('#gamepad_shortcuts_listen').click((ev) => {
        //     if (!$('#gamepad_shortcuts_listen').hasClass('listening')) {
        //         $('#gamepad_shortcuts_listen').addClass('listening');
        //         that.editor_listening = true;
        //         $('#gamepad_shortcuts_input').focus();
        //     } else {
        //         $('#gamepad_shortcuts_listen').removeClass('listening');
        //         that.editor_listening = false;
        //     }
        // });

        if (isTouchDevice())
            this.make_touch_gamepad();
        
        this.make_keyboard();
            
        this.make_ui();
    }

    set_config(enabled_drivers, defaults) {
        console.info(`Input manager got robot config; enabled_drivers=[${enabled_drivers.join(', ')}] defaults:`, defaults);

        this.enabled_drivers = enabled_drivers;

        this.robot_defaults = defaults;
        
        if (!this.profiles) {
            this.profiles = {};
            
            Object.keys(defaults).forEach((id_profile)=>{
                if (this.current_profile === null)
                    this.current_profile = id_profile; // 1st is default
                if (!this.profiles[id_profile]) {
                    let label = defaults[id_profile].label ? defaults[id_profile].label : id_profile;
                    this.profiles[id_profile] = label;
                }
            });

            // override from cookies
            let local_profiles = localStorage.getItem('user-input-profiles:'+this.client.id_robot);
            this.local_profiles = local_profiles ? JSON.parse(local_profiles) : {};
            console.log('Loaded local_profiles', this.local_profiles);
            Object.keys(this.local_profiles).forEach((id_profile)=>{
                if (!this.profiles[id_profile]) {
                    let label = this.local_profiles[id_profile].label ? this.local_profiles[id_profile].label : id_profile;
                    this.profiles[id_profile] = label;
                } else {
                    if (this.local_profiles[id_profile].label) 
                        this.profiles[id_profile] = this.local_profiles[id_profile].label;
                }
            });

            let last_user_profile = this.load_last_user_profile();
            console.log('Loaded last input profile :', last_user_profile);

            if (last_user_profile && this.profiles[last_user_profile]) {
                this.current_profile = last_user_profile;
            }

        }
        
        this.make_profile_selector_ui();

        Object.values(this.controllers).forEach((c)=>{
            this.init_controller(c);
        });
    }

    init_controller(c) {

        if (this.robot_defaults === null) // wait for robot config & cookie overrides
            return;

        if (!c.saved_profiles) 
            c.saved_profiles = {};

        if (!c.profiles) { // only once

            // let robot_defaults = this.robot_defaults[c.type];

            c.profiles = {};
            // c.current_profile = null;
            c.enabled = c.type == 'touch' ? true : this.load_user_controller_enabled(c.id);

            // let all_profile_ids = [].concat(this.saved_profile_ids); // shallow copy

            // let robot_defaults_by_id = {};
            // if (robot_defaults.profiles) {
            //     robot_defaults.profiles.forEach((profile_default_cfg)=>{
            //         let id_profile = profile_default_cfg.id;
            //         if (!id_profile) {
            //             console.error('Controller profile config for '+c.type+' missing id', profile_default_cfg)
            //             return;
            //         }
            //         robot_defaults_by_id[id_profile] = profile_default_cfg;
            //         if (all_profile_ids.indexOf(id_profile) < 0) {
            //             all_profile_ids.push(id_profile);
            //         }
            //     });
            // }

            // let saved_user_gamepad_config = this.load_user_gamepad_config(gamepad.id);
            // console.log('Loaded user config for gamepad "'+gamepad.id+'":', saved_user_gamepad_config);

            Object.keys(this.profiles).forEach((id_profile)=>{

                // let id_profile = profile_default_cfg.id;
                let profile_default_cfg = {};
                if (this.robot_defaults[id_profile] && this.robot_defaults[id_profile][c.type])
                    profile_default_cfg = this.robot_defaults[id_profile][c.type];
                let user_defaults = this.load_user_controller_profile_config(c, id_profile);
                if (user_defaults) {
                    console.log(c.id+' loaded user defults for '+id_profile, user_defaults);
                    profile_default_cfg = user_defaults;
                }

                if (!profile_default_cfg.driver) {
                    profile_default_cfg.driver = this.enabled_drivers[0];
                    console.warn('Controller profile '+id_profile+' for '+c.type+' missing driver, fallback='+profile_default_cfg.driver+'; config=', profile_default_cfg)
                }

                let profile = {
                    driver: profile_default_cfg.driver,
                    default_driver_config: {},
                    default_axes_config: profile_default_cfg.axes
                }
                
                if (profile_default_cfg.driver_config) {
                    profile.default_driver_config[profile_default_cfg.driver] = profile_default_cfg.driver_config;
                }

                c.profiles[id_profile] = profile;

                this.init_profile(c, profile);
                this.set_saved_profile_state(c, id_profile);
                c.profiles[id_profile].saved = true;

                // if (profile_default_cfg.default) { // default profile by robot
                //     c.current_profile = id_profile;
                // }
            });
        

            // if (last_user_gamepad_profile && gamepad.profiles[last_user_gamepad_profile]) {
            //     gamepad.current_profile = last_user_gamepad_profile;  // overrride default profile by user
            // }

            console.log('Initiated profiles for gamepad '+c.id);
        }

        this.make_controller_icons();        

        if (this.edited_controller == c) {
            this.make_ui();
        }

        if (!this.loop_running) {
            this.loop_running = true;
            this.run_loop();
        }
    }

    get_profile_config(c, id_profile, only_assigned=false) {
        let profile = c.profiles[id_profile];
        let driver = profile.driver_instances[profile.driver];

        let data = {
            // id: profile.id,
            // label: profile.label,
            driver: profile.driver,
            driver_config: driver.get_config(),
            axes: [],
            buttons: [],
        };
        
        for (let i = 0; i < driver.axes.length; i++) {
            if (only_assigned && !driver.axes[i].driver_axis) {
                continue;
            }
            let axis_data = {
                axis: i,
                driver_axis: driver.axes[i].driver_axis,
                dead_min: driver.axes[i].dead_min,
                dead_max: driver.axes[i].dead_max,
                offset: driver.axes[i].offset,
                scale: driver.axes[i].scale,
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

        return data;
    }

    set_saved_profile_state(c, id_profile) {
        let profile = c.profiles[id_profile];
        let driver = profile.driver_instances[profile.driver];
        driver.set_saved_state();
        
        let saved_data = this.get_profile_config(c, id_profile, false);
        profile.saved_state = saved_data;
    }

    
    check_profile_saved(c, id_profile, update_ui = true) {

        console.log('Checking profile '+id_profile+' saved:', c);

        let live_profile = c.profiles[id_profile];
        let saved_profile = live_profile.saved_state;

        function compare(profile, saved) {
            if (!profile || !saved)
                return false;
            // if (profile.id != saved.id)
            //     return false;
            // if (profile.label != saved.label)
            //     return false;
            if (profile.driver != saved.driver)
                return false;
            let driver = profile.driver_instances[profile.driver];
            if (!driver.check_saved())
                return false;
            
            if (driver.axes.length != saved.axes.length)
                return false;

            for (let i = 0; i < driver.axes.length; i++) {
                if (driver.axes[i].driver_axis != saved.axes[i].driver_axis)
                    return false;
                if (driver.axes[i].dead_min != saved.axes[i].dead_min)
                    return false;
                if (driver.axes[i].dead_max != saved.axes[i].dead_max)
                    return false;
                if (driver.axes[i].offset != saved.axes[i].offset)
                    return false;
                if (driver.axes[i].scale != saved.axes[i].scale)
                    return false;

                let has_mod_func = driver.axes[i].mod_func !== null && driver.axes[i].mod_func !== undefined && driver.axes[i].mod_func !== false && driver.axes[i].mod_func !== "";
                let has_saved_mod_func = saved.axes[i].mod_func !== null && saved.axes[i].mod_func !== undefined; //obj

                if (has_mod_func != has_saved_mod_func) { 
                    // console.warn('live v saved mod_func: ', driver.axes[i].mod_func, saved.axes[i].mod_func)
                    return false;
                } else if (driver.axes[i].mod_func && saved.axes[i].mod_func) {
                    if (driver.axes[i].mod_func != saved.axes[i].mod_func.type) 
                        return false;
                    if (driver.axes[i].scale_by_velocity_src != saved.axes[i].mod_func.velocity_src) 
                        return false;
                    if (driver.axes[i].scale_by_velocity_mult_min != saved.axes[i].mod_func.slow_multiplier) 
                        return false;
                    if (driver.axes[i].scale_by_velocity_mult_max != saved.axes[i].mod_func.fast_multiplier) 
                        return false;
                }
                
            }

            return true; // all checks up 
        }

        let match = compare(live_profile, saved_profile);

        // console.info(`Profile ${id_profile} saved: `, match, live_profile, saved_profile);

        if (!match && live_profile.saved) {
            live_profile.saved = false;
            if (update_ui)
                this.make_profile_selector_ui();
            $('#gamepad-profile-unsaved-warn').css('display', 'block');
            $('#save-gamepad-profile').removeClass('saved');
        } else if (match && !live_profile.saved) {
            live_profile.saved = true;
            if (update_ui)
                this.make_profile_selector_ui();

            $('#gamepad-profile-unsaved-warn').css('display', 'none');
            $('#save-gamepad-profile').addClass('saved');
        }
    }

    init_profile(c, profile) {

        if (!profile.driver_instances) {
            profile.driver_instances = {};
        }

        if (!profile.driver_instances[profile.driver]) {
            profile.driver_instances[profile.driver] = new this.registered_drivers[profile.driver](this);
            if (profile.default_driver_config && profile.default_driver_config[profile.driver]) {
                profile.driver_instances[profile.driver].set_config(profile.default_driver_config[profile.driver]);
            }

            let driver = profile.driver_instances[profile.driver];
            let driver_axes_ids = Object.keys(driver.get_axes());

            profile.buttons = []; 
            driver.buttons = []; // driver independent buttons
            driver.axes = [];

            function make_axis(i_axis, default_dead_zone) {
                let axis_cfg = null;
                if (profile.default_axes_config) {
                    profile.default_axes_config.forEach((cfg)=>{
                        if (cfg.axis === i_axis && driver_axes_ids.indexOf(cfg.driver_axis) > -1) {
                            axis_cfg = cfg;
                            return;
                        }
                    });
                }

                let new_axis = { 
                    i: i_axis,
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

            if (c.type == 'touch' || c.type == 'keyboard') {
                for (let i_axis = 0; i_axis < 4; i_axis++) {
                    let new_axis = make_axis(i_axis, 0.01);
                    if (new_axis) {
                        driver.axes.push(new_axis);
                    }
                }
            } else if (c.type == 'gamepad') {
                const gp = navigator.getGamepads()[c.gamepad.index];
                for (let i_axis = 0; i_axis < gp.axes.length; i_axis++) {
                    let new_axis = make_axis(i_axis, 0.1); //default deadzone bigger than touch
                    if (new_axis) {
                        driver.axes.push(new_axis);
                    }
                }
            }
        }

    }
    
    delete_current_profile() {
    
        let id_delete = this.current_gamepad.current_profile;
        let saved_id_delete = this.current_gamepad.profiles[id_delete].saved_state.id;
        let old_profile_ids = Object.keys(this.current_gamepad.profiles);
        let pos = old_profile_ids.indexOf(id_delete);
        
        console.log('Deleting profile '+id_delete+' (saved id was '+saved_id_delete+')');

        // remove profile conf from cookie
        let cookie_conf = 'gamepad-profile-config:'+this.client.id_robot+':'+this.current_gamepad.id+':'+saved_id_delete;
        localStorage.removeItem(cookie_conf);

        let cookie_conf_list = 'user-gamepad-profiles:'+this.client.id_robot+':'+this.current_gamepad.id;
        let custom_profile_ids = localStorage.getItem(cookie_conf_list);
        if (custom_profile_ids) {
            custom_profile_ids = JSON.parse(custom_profile_ids)
            let pos = custom_profile_ids.indexOf(saved_id_delete);
            if (pos > -1) {
                custom_profile_ids.splice(pos, 1);
            }
            console.log('saving updated custom_profile_ids', custom_profile_ids); 
            localStorage.setItem(cookie_conf_list, JSON.stringify(custom_profile_ids));
        }

        delete this.current_gamepad.profiles[id_delete];
        let remaining_profile_ids = Object.keys(this.current_gamepad.profiles);

        if (remaining_profile_ids.length == 0) {
            console.log('No profile to autoselect, making new');
            
            let id_new_profile = 'Profile-'+Date.now();
            this.current_gamepad.profiles[id_new_profile] = {
                // id: id_new_profile,
                driver: this.enabled_drivers[this.current_gamepad.type][0], // copy current as default
                // label: id_new_profile,
            }
            this.init_profile(this.current_gamepad.profiles[id_new_profile]);
            this.current_gamepad.current_profile = id_new_profile;

        } else {
            while (!remaining_profile_ids[pos] && pos > 0) {
                pos--;
            }
            let id_select = remaining_profile_ids[pos];
            console.log('Autoselecting '+id_select);
            this.current_gamepad.current_profile = id_select;
        }

        this.make_ui();
    }

    save_last_user_profile(id_profile) {
        localStorage.setItem('last-input-profile:' + this.client.id_robot, id_profile);
    }

    load_last_user_profile() {
        return localStorage.getItem('last-input-profile:' + this.client.id_robot);
    }

    copy_gamepad_profile_json(gamepad, id_profile) {
        let profile_data = this.get_profile_config(gamepad, id_profile, true);
        navigator.clipboard.writeText(JSON.stringify(profile_data, null, 4));
        console.log('Copied json:', profile_data);
        $('#gamepad-profile-json-bubble').css('display', 'block');
        window.setTimeout(()=>{
            $('#gamepad-profile-json-bubble').css('display', 'none');
        }, 3000);
    }

    save_edited_profile_ids() {
        
        //TODO
        let cookie_conf_list = 'user-input-profiles:'+this.client.id_robot;
        let custom_profile_ids = localStorage.getItem(cookie_conf_list);
        // if (!custom_profile_ids) {
        //     custom_profile_ids = [];
        // } else {
        //     custom_profile_ids = JSON.parse(custom_profile_ids)
        // }
    }

    save_user_controller_profile_config(c, id_profile) {
        let profile = c.profiles[id_profile];
        let profile_data = this.get_profile_config(c, id_profile, true); //filters assigned axes

        console.log('Saving profile '+id_profile+' for '+c.id, profile_data);
        let cookie_conf = 'controller-profile-config:'+this.client.id_robot+':'+c.id+':'+id_profile;
        localStorage.setItem(cookie_conf, JSON.stringify(profile_data));
       
        // console.log('loaded custom_profile_ids', custom_profile_ids);

        if (custom_profile_ids.indexOf(id_profile) === -1)
            custom_profile_ids.push(id_profile);
        if (profile.saved_state.id != id_profile) { // id changed, remove old
            let pos = custom_profile_ids.indexOf(profile.saved_state.id);
            if (pos > -1) {
                custom_profile_ids.splice(pos, 1);
            }
            let deleted_cookie_conf = 'controller-profile-config:'+this.client.id_robot+':'+c.id+':'+profile.saved_state.id;
            localStorage.removeItem(deleted_cookie_conf);
        }

        console.log('saving custom_profile_ids', custom_profile_ids); 
        localStorage.setItem(cookie_conf_list, JSON.stringify(custom_profile_ids));

        this.set_saved_profile_state(c, id_profile);
        this.check_profile_saved(c, id_profile);
    }

    load_user_controller_profile_config(c, id_profile) {
        let cookie_conf = 'controller-profile-config:'+this.client.id_robot+':'+c.id+':'+id_profile;
        let val = localStorage.getItem(cookie_conf);

        if (val)
            return JSON.parse(val);
        else
            return null;
    }

    disable_kb_on_conflict() {

        if (!this.current_gamepad.enabled)
            return;

        let kb = this.client.ui.keyboard;
        if (kb && kb.enabled && kb.current_driver.id == this.current_gamepad.profiles[this.current_gamepad.current_profile].driver) {
            $('#keyboard_enabled').click(); // avoid same driver coflicts
        }
    }

    register_driver(id_driver, driver_class) {
        if (this.registered_drivers[id_driver])
            return;

        this.registered_drivers[id_driver] = driver_class;
    }

    make_profile_selector_ui() {
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
            // if (!this.current_gamepad.profiles[id_profile].saved)
            //     label = label + ' (edited)';
            profile_opts.push($('<option value="'+id_profile+'"' + (this.current_profile == id_profile ? ' selected' : '') + '>'+label+'</option>'));
        }
        profile_opts.push($('<option value="+">New profile...</option>'));
        $('#gamepad-profile-select').empty().attr('disabled', false).append(profile_opts);
        
        $('#gamepad-profile-select').unbind().change((ev)=>{
            let val = $(ev.target).val()
            console.log('Selected profile val '+val);
            // let current_profile = that.current_gamepad.profiles[that.current_gamepad.current_profile];
            if (val != '+') {
                let current_profile = that.profiles[that.current_profile];
                current_profile.scroll_offset = $('#gamepad-axes-panel').scrollTop();
                that.current_profile = $(ev.target).val();
                that.make_ui();
            } else {
                let id_new_profile = 'Profile-'+Date.now();
                that.profiles[id_new_profile] = {
                    // id: id_new_profile,
                    // driver: current_profile.driver, // copy current as default
                    // label: id_new_profile,
                }
                that.init_profile(that.profiles[id_new_profile]);
                that.current_profile = id_new_profile;
                that.make_ui();
                $('#gamepad_settings #gamepad-settings-tab').click();
                // that.save_user_gamepad_config(); // save the new profile right away
            }
            // that.save_last_user_gamepad_profile(
            //     that.current_gamepad.id,
            //     that.current_gamepad.current_profile
            // );
        });
    }

    make_profile_config_ui() {

        let that = this;

        if (!this.edited_controller || !this.enabled_drivers) {
            $('#gamepad-profile-config').html('<div class="line"><span class="label">Input source:</span><span id="connected-gamepad">N/A</span></div>');
            // $('#gamepad-settings-panel').removeClass('has-buttons');
        } else {
            
            let lines = [];

            let line_source = $('<div class="line"><span class="label">Input source:</span><span id="connected-gamepad">'
                            + (this.edited_controller.type == 'touch' ? 'Virtual Gamepad (Touch UI)' : this.edited_controller.id)
                            + '</span></div>');
            lines.push(line_source);

            if (this.current_profile) {
                let profile = this.edited_controller.profiles[this.current_profile];

                //profile id
                // let line_id = $('<div class="line"><span class="label">Profile ID:</span></div>');
                // let inp_id = $('<input type="text" inputmode="url" value="'+profile.id+'"/>');
                // inp_id.change((ev)=>{
                //     let val = $(ev.target).val();
                //     if (this.current_gamepad.current_profile == profile.id) {
                //         this.current_gamepad.current_profile = val;
                //     }
                //     this.current_gamepad.profiles[val] = this.current_gamepad.profiles[profile.id];
                //     delete this.current_gamepad.profiles[profile.id];
                //     profile.id = val;
                //     console.log('Profile id changed to: '+profile.id);
                //     that.save_last_user_gamepad_profile( // id changed
                //         that.current_gamepad.id,
                //         val
                //     );
                //     that.check_profile_saved(that.current_gamepad, profile.id, false);
                //     that.make_profile_selector_ui();
                // });

                // inp_id.appendTo(line_id);
                // lines.push(line_id);

                // //profile name
                // let line_name = $('<div class="line"><span class="label">Profile name:</span></div>');
                // let inp_name = $('<input type="text" value="'+profile.label+'"/>');
                // inp_name.change((ev)=>{
                //     let val = $(ev.target).val();
                //     profile.label = val;
                //     console.log('Profile name changed to: '+profile.label);
                //     that.check_profile_saved(that.current_gamepad, profile.id, false);
                //     that.make_profile_selector_ui();
                // });

                // inp_name.appendTo(line_name);
                // lines.push(line_name);

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
                                      + (profile.driver == id_driver ? ' selected' : '')
                                      + '>'+id_driver+'</option>')
                }
                let inp_driver = $('<select id="gamepad-profile-driver-select">'
                                 + driver_opts.join('')
                                 + '</select>');
    
                inp_driver.appendTo(line_driver);
                inp_driver.change((ev)=>{
                    let val = $(ev.target).val();
                    console.log('profile driver changed to '+val);
                    profile.driver = val;
                    that.init_profile(profile);
                    profile.driver_instances[profile.driver].setup_writer();
                    that.check_profile_saved(that.edited_controller, that.current_profile, false);
                    that.make_ui();
                })
                lines.push(line_driver);
                
                let driver = profile.driver_instances[profile.driver];
                if (driver) {
                    let driver_lines = driver.make_cofig_inputs();
                    lines = lines.concat(driver_lines);
                    // console.log('Driver config lines ', driver_lines);
                }

                // $('#gamepad-settings-panel').addClass('has-buttons');
            } else {
                // $('#gamepad-settings-panel').removeClass('has-buttons');
            }

            $('#gamepad-profile-config').empty().append(lines);            
        }             

        $('#delete-gamepad-profile')
            .unbind()
            .click((ev)=>{
                if ($(ev.target).hasClass('warn')) {
                    that.delete_current_profile();
                    $(ev.target).removeClass('warn');
                    return;
                } else {
                    $(ev.target).addClass('warn');
                }
            })
            .blur((ev)=>{
                $(ev.target).removeClass('warn');
            });

        $('#save-gamepad-profile')
            .unbind()
            .click((ev)=>{
                that.save_user_gamepad_profile_config(that.edited_controller, that.current_profile);
            });

        $('#gamepad-profile-json')
            .unbind()
            .click((ev)=>{
                that.copy_gamepad_profile_json(that.edited_controller, that.current_gamepad.current_profile);
            });
    }

    make_buttons_ui() {

        // let touch_buttons = $('<div id="touch-buttons"></div>');
        // let bottom_buttons = $('<div id="bottom-buttons"></div>');

        let btn_els = [];

        let add_btn = $('<button id="add-button-btn"></button>')
        add_btn.click((ev)=>{

        });
        btn_els.push(add_btn);

        if (this.current_gamepad) {

        }

        $('#gamepad-buttons-panel').empty().append(btn_els);
    }

    edit_controller(c) {
        this.edited_controller = c;
        console.log('Editing controller '+c.id);
        this.make_ui();
    }

    collect_profiles() {
        Object.values(this.controllers).forEach(c=>{

        });
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
            if (c.enabled)
                icon.addClass('enabled');
            if (c == that.edited_controller)
                icon.addClass('editing');
        });

        if (types_connected.indexOf('touch') < 0 && isTouchDevice())
            icons.push($('<span class="touch disabled"></span>'));

        if (types_connected.indexOf('keyboard') < 0)
            icons.push($('<span class="keyboard disabled"></span>'));

        if (types_connected.indexOf('gamepad') < 0)
            icons.push($('<span class="gamepad disabled"></span>'));

        $('#input-controller-selection')
            .empty().append(icons);
    }

    make_ui() {

        let that = this;

        this.make_profile_selector_ui();

        if (!this.edited_controller) { // autoselect first controller
            let controller_keys = Object.keys(this.controllers);
            this.edited_controller = this.controllers[controller_keys[0]]; 
        }

        this.make_controller_icons();

        this.make_profile_config_ui();
        this.make_buttons_ui();

        if (!this.edited_controller || !this.enabled_drivers || !this.current_profile) {
            $('#gamepad-axes-panel').html('Waiting for controllers...');    
            this.debug_output_panel.html('{}');
            // $('#gamepad-profile-config').css('display', 'none');
            $('#gamepad_enabled').attr('disabled', true);
            $('#gamepad-profile-unsaved-warn').css('display', 'none');
            $('#save-gamepad-profile').addClass('saved');
            return;
        }

        $('#gamepad-buttons-tab').html(this.edited_controller.type == 'keyboard' ? 'Keys' : 'Buttons');

        // $('#gamepad').addClass('connected');
        console.log('Editing controller is ', this.edited_controller);

        $('#gamepad_enabled')
            .attr('disabled', false)
            .prop('checked', this.edited_controller.enabled);

        // gamepad name

        let profile = this.edited_controller.profiles[this.current_profile];

        if (profile.saved) {
            $('#gamepad-profile-unsaved-warn').css('display', 'none');
            $('#save-gamepad-profile').addClass('saved');
        } else {
            $('#gamepad-profile-unsaved-warn').css('display', 'block');
            $('#save-gamepad-profile').removeClass('saved');
        }

        let driver = profile.driver_instances[profile.driver];

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
            opts.push('<option value="=">Copy from axis...</option>');
            let assignment_sel_el = $('<select>'+opts.join('')+'</select>');
            assignment_sel_el.appendTo(line_1_el);
            axis.assignment_sel_el = assignment_sel_el;

            // output val
            let out_val_el = $('<span class="axis-output-val" title="Axis output">0.00</span>');
            out_val_el.appendTo(line_1_el);
            axis.out_val_el = out_val_el;
            

            // config toggle
            let conf_toggle_el = $('<span class="conf-toggle'+(axis.edit_open?' open' : '')+'"></span>');
            conf_toggle_el.click((ev)=>{
                if (!conf_toggle_el.hasClass('open')) {
                    conf_toggle_el.addClass('open')
                    config_details_el.addClass('open')
                    axis.edit_open = true;
                } else {
                    conf_toggle_el.removeClass('open')
                    config_details_el.removeClass('open')
                    axis.edit_open = false;
                }
            });
            out_val_el.click((ev)=>{
                conf_toggle_el.click(); // because this happens a lot
            });
            conf_toggle_el.appendTo(line_1_el);

            // collapsable details
            let config_details_el = $('<div class="axis-config-details'+(axis.edit_open?' open' : '')+'"></div>');

            let prevent_context_menu = (ev)=>{
                console.log('contex cancelled', ev.target);
                ev.preventDefault();
                ev.stopPropagation();
            };

            let render_axis_config = () => {

                config_details_el.empty();
                let driver_axis = axis.driver_axis;

                if (!driver_axis) {
                    conf_toggle_el.removeClass('open')
                    config_details_el.removeClass('open')
                    return; 
                }

                // let default_axis_conf = this.current_gamepad.current_profile[driver_axis];

                // dead zone
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
                    that.check_profile_saved(that.edited_controller, that.current_profile);
                });
                dead_zone_max_inp.change((ev)=>{
                    axis.dead_max = parseFloat($(ev.target).val());
                    delete axis.dead_val;
                    that.check_profile_saved(that.edited_controller, that.current_profile);
                });

                dead_zone_el.appendTo(config_details_el);

                // input offset
                let offset_el = $('<div class="config-row"><span class="label">Offset input:</span></div>');
                let offset_inp = $('<input type="text" class="inp-val"/>');
                offset_inp.val(axis.offset.toFixed(1));
                offset_inp.focus((ev)=>{ev.target.select();});
                offset_inp.change((ev)=>{
                    axis.offset = parseFloat($(ev.target).val());
                    that.check_profile_saved(that.edited_controller, that.current_profile);
                });
                offset_inp.appendTo(offset_el);
                offset_el.appendTo(config_details_el);

                // input scale
                let scale_el = $('<div class="config-row"><span class="label">Scale input:</span></div>');
                let scale_inp = $('<input type="text" class="inp-val"/>');
                scale_inp.val(axis.scale.toFixed(1));
                scale_inp.focus((ev)=>{ev.target.select();});
                scale_inp.change((ev)=>{
                    axis.scale = parseFloat($(ev.target).val());
                    that.check_profile_saved(that.edited_controller, that.current_profile);
                });
                scale_inp.appendTo(scale_el);
                scale_el.appendTo(config_details_el);

                // modifier selection
                let mod_func_el = $('<div class="config-row"><span class="label">Modifier:</span></div>');
                let mod_func_opts = [ '<option value="">None</option>' ];
                mod_func_opts.push('<option value="scale_by_velocity" '+(axis.mod_func=='scale_by_velocity'?' selected':'')+'>Scale by velocity</option>');  
                let mod_func_inp = $('<select>'+mod_func_opts.join('')+'</select>');
                mod_func_inp.appendTo(mod_func_el);
                mod_func_el.appendTo(config_details_el);
                let mod_func_cont = $('<div></div>');
                mod_func_cont.appendTo(config_details_el);
                
                let set_mod_funct = (mod_func) => {
                    if (mod_func) {
                        axis.mod_func = mod_func;
                        let mod_func_config_els = [];
                        if (mod_func == 'scale_by_velocity') {

                            let multiply_lerp_input_el = $('<div class="config-row"><span class="label sublabel">Velocity source:</span></div>');
                            let multiply_lerp_input_opts = [ '<option value="">Select axis</option>' ];

                            for (let j = 0; j < dri_axes_ids.length; j++) {
                                let id_axis = dri_axes_ids[j];
                                multiply_lerp_input_opts.push('<option value="'+id_axis+'"' + (axis.scale_by_velocity_src == id_axis ? ' selected':'') +'>'+dri_axes[id_axis]+'</option>');
                            }
                            
                            let multiply_lerp_input_inp = $('<select>'+multiply_lerp_input_opts.join('')+'</select>');
                            multiply_lerp_input_inp.appendTo(multiply_lerp_input_el);
                            mod_func_config_els.push(multiply_lerp_input_el);
                            multiply_lerp_input_inp.change((ev)=>{
                                axis.scale_by_velocity_src = $(ev.target).val();
                                that.check_profile_saved(that.edited_controller, that.current_profile);
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
                                that.check_profile_saved(that.edited_controller, that.current_profile);
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
                                that.check_profile_saved(that.edited_controller, that.current_profile);
                            });
                            multiply_lerp_max_inp.appendTo(multiply_lerp_max_el);
                            mod_func_config_els.push(multiply_lerp_max_el);

                            if (!isIOS()) { // ios can't do numberic keyboard with decimal and minus signs => so default it is
                                multiply_lerp_min_inp.attr('inputmode', 'numeric');
                                multiply_lerp_max_inp.attr('inputmode', 'numeric');
                            }
                            multiply_lerp_min_inp.on('contextmenu', prevent_context_menu);
                            multiply_lerp_max_inp.on('contextmenu', prevent_context_menu);

                        }
                        mod_func_cont.empty().append(mod_func_config_els).css('display', 'block');
                    } else {
                        delete axis.mod_func; // check_profile_saved expecs undefined (not null)
                        mod_func_cont.empty().css('display', 'none');
                    }
                    
                }
                set_mod_funct(axis.mod_func);
                mod_func_inp.change((ev)=>{
                    set_mod_funct($(ev.target).val());
                    that.check_profile_saved(that.edited_controller, that.current_profile);
                });
                

                if (!isIOS()) { // ios can't do numberic keyboard with decimal and minus signs => so default it is
                    dead_zone_min_inp.attr('inputmode', 'numeric');
                    dead_zone_max_inp.attr('inputmode', 'numeric');
                    offset_inp.attr('inputmode', 'numeric');
                    scale_inp.attr('inputmode', 'numeric');
                }

                dead_zone_min_inp.on('contextmenu', prevent_context_menu);
                dead_zone_max_inp.on('contextmenu', prevent_context_menu);
                offset_inp.on('contextmenu', prevent_context_menu);
                scale_inp.on('contextmenu', prevent_context_menu);

            } // render_axis_config
            // let that = this;
            assignment_sel_el.change((ev)=>{
                let id_axis_assigned = $(ev.target).val();

                console.log('Axis '+axis.i+' assigned to '+id_axis_assigned)

                let cancel_copy = () => {
                    driver.axes.forEach((a)=>{
                        a.raw_val_el
                            .unbind()
                            .removeClass('copy-source');
                        if (profile.copying_into_axis === a) {
                            a.assignment_sel_el.val(''); //set not in use
                            a.row_el
                                .removeClass('copy-destination')
                                .addClass('unused');
                        }
                    });
                    delete profile.copying_into_axis;
                }

                if (id_axis_assigned == '=') {
                    if (profile.copying_into_axis) {
                        // another one is waiting for input, close first
                        cancel_copy();
                    }
                    //console.log('Copy config for axis '+axis.id)
                    profile.copying_into_axis = axis;
                    row_el.addClass('unused copy-destination');

                    // let axes_ids = Object.keys()
                    driver.axes.forEach((a)=>{
                        if (axis == a) //skip self
                            return;
                        a.raw_val_el.addClass('copy-source')
                            .unbind()
                            .click((ev)=>{
                                cancel_copy();
                                console.log('Copying axis '+a.i, a);
                                axis.driver_axis = a.driver_axis;
                                axis.assignment_sel_el.val(a.driver_axis);
                                if (axis.driver_axis) {
                                    axis.dead_min = a.dead_min;
                                    axis.dead_max = a.dead_max;
                                    axis.offset = a.offset;
                                    axis.scale = a.scale;
                                    axis.mod_func = a.mod_func;
                                    axis.scale_by_velocity_src = a.scale_by_velocity_src;
                                    axis.scale_by_velocity_mult_min = a.scale_by_velocity_mult_min;
                                    axis.scale_by_velocity_mult_max = a.scale_by_velocity_mult_max;
                                    render_axis_config();
                                    row_el.removeClass('unused');
                                } else {
                                    row_el.addClass('unused');
                                }
                                that.check_profile_saved(that.edited_controller, that.current_profile);
                            });
                    });
                    return;
                } else if (profile.copying_into_axis) {
                    cancel_copy();
                }

                console.log('axis '+axis.i+' assigned to ', id_axis_assigned);
                if (id_axis_assigned) {
                    axis.driver_axis = id_axis_assigned;
                    
                    render_axis_config();
                    row_el.removeClass('unused');
                } else {
                    axis.driver_axis = null;                   
                    
                    render_axis_config();
                    row_el.addClass('unused');
                }

                that.check_profile_saved(that.edited_controller, that.current_profile);
            });

            render_axis_config();
            console.log('axis '+i_axis+' assigned to ', axis.driver_axis);
            if (axis.driver_axis) {
                row_el.removeClass('unused');
            } else {
                row_el.addClass('unused');
            }

            line_1_el.appendTo(row_el);
            config_details_el.appendTo(row_el);

            axis.row_el = row_el;
            axes_els.push(row_el);
           
        }

        $('#gamepad-axes-panel')
            .empty()
            .append(axes_els);

        if (driver.scroll_offset !== undefined) {
            $('#gamepad-axes-panel').scrollTop(profile.scroll_offset);
            delete profile.scroll_offset;
        }
    }

    update_axes_ui_values () {
        if (!this.edited_controller)
            return;
        
        let profile = this.edited_controller.profiles[this.current_profile];
        let driver = profile.driver_instances[profile.driver];

        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {

            let axis = driver.axes[i_axis];

            axis.raw_val_el.html(axis.raw.toFixed(2));

            if (!axis.driver_axis)
                continue;

            axis.out_val_el.html(axis.val.toFixed(2));
            if (axis.live) {
                axis.out_val_el.addClass('live');
            } else {
                axis.out_val_el.removeClass('live');
            }
        }
    }

    process_axes_input(c) {

        let profile = c.profiles[this.current_profile];
        let driver = profile.driver_instances[profile.driver];

        let combined_axes_vals = {}; // 1st pass, same axess added to single val
        let combined_axes_unscaled_vals = {}; // expected to be within [-1; +1] (offset added and scaling sign kept)

        let some_axes_live = false;

        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
            let axis = driver.axes[i_axis];
           
            if (!axis.driver_axis)
                continue;

            if (axis.dead_val === undefined) // unset on min/max change
                axis.dead_val = (axis.dead_min+axis.dead_max) / 2.0;

            let out = axis.raw;
            let out_unscaled = axis.raw;
            let live = true;
            if (axis.raw > axis.dead_min && axis.raw < axis.dead_max) {
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
        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
            let axis = driver.axes[i_axis];

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

    on_gamepad_connected(ev) {
            
        let id_gamepad = ev.gamepad.id;

        if (!this.controllers[id_gamepad]) {

            console.warn('Gamepad connected:', id_gamepad, ev.gamepad);
            let gamepad = {
                type: 'gamepad',
                id: id_gamepad,
                gamepad: ev.gamepad,
                profiles: null,
                saved_profiles: null,
                initiated: false, //this will wait for config
            };
            this.controllers[id_gamepad] = gamepad;
            // this.save_gamepad_was_once_connected();

        } else {
            this.controllers[id_gamepad].gamepad = ev.gamepad;
            console.info('Gamepad already connected:', id_gamepad);
        }

        // if (!(this.current_gamepad && this.current_gamepad.isTouch)) {
        //     //touch ui has priority when on
        //     this.current_gamepad = this.connected_gamepads[id_gamepad]; 
        // }

        this.init_controller(this.controllers[id_gamepad]);
    }

    on_gamepad_disconnected (ev) {

        if (this.controllers[ev.gamepad.id]) {

            console.log('Gamepad disconnected '+ev.gamepad.id);
            this.controllers[ev.gamepad.id].gamepad = null;

            if (this.edited_controller.id == ev.gamepad.id) {
                this.edited_controller = null;
                this.make_ui();
            }
        }

    }

    make_touch_gamepad() {
        if (!this.controllers['touch']) {
            let touch_gamepad = {
                type: 'touch',
                id: 'touch',
                profiles: null,
                saved_profiles: null,                
                initiated: false, //this will wait for config
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
                saved_profiles: null,
                initiated: false, //this will wait for config
            };
            this.controllers['keyboard'] = kb;
            this.init_controller(kb);
        }
    }

    set_touch(state) {
        
        this.touch_gamepad_on = state;

        if (state) {

            if (this.edited_controller != this.controllers['touch']) {
                this.edited_controller = this.controllers['touch'];
            }

            this.init_controller(this.controllers['touch']);

        } else {

            // this.current_gamepad = null; // kills the loop
            // console.log('Gamepad touch mode off')

            // let that = this;
            // Object.values(this.controllers).forEach((c)=>{
            //     if (!c.isTouch && gp.gamepad) { // physical gamepad connected => fall back
            //         console.log('Falling back to '+gp.id);
            //         that.current_gamepad = gp;
            //         return;
            //     }
            // })

            // if (this.current_gamepad) {
            //     this.init_gamepad(this.current_gamepad);
            // } else {
            //     this.make_ui();
            // }

        }
        
    }

    touch_input(where, value, angle) {
        if (value) {
            if (!this.last_touch_input[where]) {
                this.last_touch_input[where] = new THREE.Vector2();
            }
            this.last_touch_input[where].set(value, 0);
            this.last_touch_input[where].rotateAround(this.zero, angle);
        } else {
            delete this.last_touch_input[where];
        }
    }

    run_loop() {

        if (!this.loop_running) {
            console.log('Gamepad loop stopped')
            this.loop_running = false;
            return;
        }

        let that = this;
        Object.values(this.controllers).forEach((c)=>{
        
            if (!c.profiles)
                return; //not yet configured

            let profile = c.profiles[that.current_profile];
            let driver = profile.driver_instances[profile.driver];
    
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
    
                for (let i = 0; i < driver.axes.length; i++) {
                    driver.axes[i].raw = 0.0;
                }

            } else if (c.gamepad) {
    
                const gp = navigator.getGamepads()[c.gamepad.index];
                if (!gp) {
                    console.error('Error reading gp '+c.gamepad.index);
                    // this.loop_running = false;
                    return;
                }
    
                for (let i = 0; i < gp.axes.length; i++) {
                    driver.axes[i].raw = gp.axes[i];
                }
    
            } else
                return; //nothing to do for this controller atm
    
            let axes_alive = this.process_axes_input(c);
    
            if (!axes_alive && c.transmitted_last_frame) { // cooldown for 1s to make sure zero values are received
                if (c.cooldown_started === undefined) {
                    c.cooldown_started = Date.now();
                    axes_alive = true;
                } else if (c.cooldown_started + 1000 > Date.now() ) {
                    axes_alive = true;
                }
            } else if (c.cooldown_started !== undefined) {
                delete c.cooldown_started; // some axes alive => reset cooldown
            }
    
            let c_transmitting = c.enabled && axes_alive && driver.can_transmit();
    
            driver.generate();
            
            if (this.edited_controller == c) {
                driver.display_output(this.debug_output_panel, c_transmitting);
            }
    
            if (c_transmitting) {
                driver.transmit();
                c.transmitted_last_frame = true;
            } else {
                c.transmitted_last_frame = false;
            }

        });

        this.update_axes_ui_values();

        // if (transmitting && !this.transmitting) {
        //     this.transmitting = true;
        //     this.status_icon.addClass('transmitting');
        // } else if (!transmitting && this.transmitting) {
        //     this.transmitting = false;
        //     this.status_icon.removeClass('transmitting');
        // }
  
        return window.setTimeout(
            () => { this.run_loop(); },
            this.loop_delay
        );
    }







    save_user_controller_enabled(c) {
        if (c.type == 'touch')
            return; // touch ui starts always on

        localStorage.setItem('controller-enabled:' + this.client.id_robot+ ':' + c.id,
                            c.enabled);
        console.log('Saved controller enabled for robot '+this.client.id_robot+', gamepad "'+c.id+'":', c.enabled);
    }

    load_user_controller_enabled(id_controller) {
        let state = localStorage.getItem('controller-enabled:' + this.client.id_robot + ':' + id_controller);
        state = state === 'true';
        console.log('Loaded controller enabled for robot '+this.client.id_robot+', gamepad "'+id_controller+'":', state);
        return state;
    }

    // save_user_gamepad_driver() {
    //     if (!this.gamepad)
    //         return; // saving per gp

    //     localStorage.setItem('gamepad-dri:' + this.client.id_robot
    //                         + ':' + this.gamepad.id,
    //                         this.current_driver.id);
    //     console.log('Saved gamepad driver for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.current_driver.id);
    // }

    // load_user_gamepad_driver(id_gamepad) {
    //     let dri = localStorage.getItem('gamepad-dri:' + this.client.id_robot
    //                                     + ':' + id_gamepad);
    //     console.log('Loaded gamepad driver for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', dri);
    //     return dri;
    // }

    // save_user_driver_config() {
    //     localStorage.setItem('gamepad-cfg:' + this.client.id_robot
    //                             + ':' + this.gamepad.id
    //                             + ':' + this.current_driver.id,
    //                         JSON.stringify(this.current_driver.config));
    //     console.log('Saved gamepad config for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'", driver '+this.current_driver.id+':', this.current_driver.config);
    // }

    // load_user_driver_config(id_gamepad, id_driver) {
    //     let cfg = localStorage.getItem('gamepad-cfg:' + this.client.id_robot
    //                             + ':' + id_gamepad
    //                             + ':' + id_driver);

    //     if (cfg) {
    //         try {
    //             cfg = JSON.parse(cfg);
    //         }
    //         catch {
    //             cfg = null;
    //         }
    //     }

    //     console.log('Loaded gamepad user config for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'", driver '+id_driver+':', cfg);
    //     return cfg;
    // }

    // set_default_config() {
    //     this.current_driver.config = this.current_driver.default_gamepad_config;
    //     $('#gamepad_config_input').removeClass('err');
    //     this.config_to_editor();
    // }

    // set_default_shortcuts() {
    //     this.shortcuts_config = this.default_shortcuts_config;
    //     $('#gamepad_shortcuts_input').removeClass('err');
    //     this.shortcuts_to_editor();
    // }

    // save_user_shortcuts() {
    //     localStorage.setItem('gamepad-keys:' + this.client.id_robot
    //                             + ':' + this.gamepad.id,
    //                         JSON.stringify(this.shortcuts_config));
    //     console.log('Saved gamepad shortcuts keys for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.shortcuts_config);
    // }

    // load_user_shortcuts(id_gamepad) {
    //     let cfg = localStorage.getItem('gamepad-keys:' + this.client.id_robot
    //                                     + ':' + id_gamepad);
    //     if (cfg) {
    //         try {
    //             cfg = JSON.parse(cfg);
    //         }
    //         catch {
    //             cfg = null;
    //         }
    //     }
    //     console.log('Loaded gamepad shortcuts keys for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', cfg);
    //     return cfg;
    // }

    




        // // let transmitting = $('#gamepad_enabled').is(':checked');

        // if (!this.current_driver || !this.current_driver.config) {
        //     // wait for init
        //     return window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
        // }

        // let msg_type = this.current_driver.msg_type;
        // let topic = this.current_driver.config.topic;

        // if (!this.client.topic_writers[topic]) {
        //     this.client.create_writer(topic, msg_type);
        // }

        // const gp = navigator.getGamepads()[this.gamepad.index];

        // let buttons = gp.buttons;
        // let axes = gp.axes;

        // let axes_debug = {};
        // for (let i = 0; i < axes.length; i++) {
        //     axes_debug[i] = axes[i]
        // }

        // let buttons_debug = {};
        // for (let i = 0; i < buttons.length; i++) {
        //     buttons_debug[i] = buttons[i].pressed;
        // }

        // $('#gamepad_debug_input').html('<b>Raw Axes:</b><br><div class="p">' + this.unquote(JSON.stringify(axes_debug, null, 4)) + '</div>' +
        //                                '<b>Raw Buttons:</b><br><div class="p">' + this.unquote(JSON.stringify(buttons_debug, null, 4)) + '</div>'
        //                                );

        // if (this.enabled) {
        //     let msg = this.current_driver.read(axes, buttons);

        //     if (this.client.topic_writers[topic].send(msg)) { // true when ready and written
        //         this.display_output(msg);
        //     }
        // } else if (!this.enabled && $('#gamepad').hasClass('open')) {
        //     let msg = this.current_driver.read(axes, buttons);
        //     this.display_output(msg);
        // }

        // if (this.editor_listening && $("#gamepad_shortcuts_input").is(":focus")) {

        //     for (let i = 0; i < buttons.length; i++) {

        //         if (buttons[i] && buttons[i].pressed) {
        //             console.log('Btn pressed: '+i+'; last=', this.last_buttons[i])
        //         }

        //         if (buttons[i] && buttons[i].pressed && (this.last_buttons[i] == undefined || !this.last_buttons[i])) {

        //             this.editor_listening = false;
        //             $('#gamepad_shortcuts_listen').removeClass('listening');
                    
        //             let pos = document.getElementById("gamepad_shortcuts_input").selectionStart;
        //             let curr_val = $('#gamepad_shortcuts_input').val();
        //             let insert = ''+i+'';
        //             let val = curr_val.slice(0,pos)+insert+curr_val.slice(pos)
        //             $('#gamepad_shortcuts_input').val(val);
        //             let new_pos = pos+insert.length;
                    
        //             document.getElementById('gamepad_shortcuts_input').setSelectionRange(new_pos, new_pos);
        //             break;
        //         }
        //     }

        // } 

        // for (let i = 0; i < buttons.length; i++) {
        //     if (buttons[i] && buttons[i].pressed && !this.last_buttons[i]) {
        //         if (this.shortcuts_config && this.shortcuts_config[i]) {
        //             this.handle_shortcut(this.shortcuts_config[i]);
        //         }
        //     }
        // }
        // this.last_buttons = [];
        // for (let i = 0; i < buttons.length; i++) {
        //     this.last_buttons.push(buttons[i].pressed);
        // }
    
        // window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
    //}

    // update_output_info() {
    //     $('#gamepad_debug_output_label').html(' into '+this.current_driver.config.topic);
    //     $('#gamepad_debug_output B').html(this.current_driver.msg_type);
    // }

    // display_output(msg) {
    //     // this.update_output_info();
    //     $('#gamepad_debug_output .p').html(this.unquote(JSON.stringify(msg, null, 4)));
    // }

    // handle_shortcut = (cfg) => {
    //     console.log('handling gp shortcut', cfg);
    //     Handle_Shortcut(cfg, this.client);
    // }

    // init_writer (topic, msg_type) {



    //     this.dcs[topic] = this.client.create_dc(topic);

    //     return this.dcs[topic];
        // let subscription_data = {
        //     id_robot: this.id_robot,
        //     topics: []
        // };

        // if (!this.dcs[this.joy_topic])
        //     subscription_data.topics.push([ this.joy_topic, 1, this.joy_msg_type ])

        // if (!this.dcs[this.twist_topic])
        //     subscription_data.topics.push([ this.twist_topic, 1, this.twist_msg_type ])

        // if (!subscription_data.topics.length)
        //     return;

        // this.socket.emit('subcribe:write', subscription_data, (res) => {
        //     if (res['success']) {
        //         for (let i = 0; i < res['subscribed'].length; i++) {

        //             let topic = res['subscribed'][i][0];
        //             let id = res['subscribed'][i][1];
        //             let protocol = res['subscribed'][i][2];

        //             console.log('Making local DC for '+topic+', id='+id+', protocol='+protocol)
        //             this.dcs[topic] = pc.createDataChannel(topic, {
        //                 negotiated: true,
        //                 ordered: false,
        //                 maxRetransmits: null,
        //                 id:id
        //             });

        //             this.dcs[topic].addEventListener('open', (ev)=> {
        //                 console.info('DC '+topic+'/W opened', this.dcs[topic])
        //             });
        //             this.dcs[topic].addEventListener('close', (ev)=> {
        //                 console.info('DC '+topic+'/W closed')
        //                 delete this.dcs[topic];
        //             });
        //             this.dcs[topic].addEventListener('error', (ev)=> {
        //                 console.error('DC '+topic+'/W error', ev)
        //                 delete this.dcs[topic];
        //             });
        //             this.dcs[topic].addEventListener('message', (ev)=> {
        //                 console.warn('DC '+topic+'/W message!!', ev); //this should not be as we use separate r/w channels
        //             });
        //         }
        //     } else {
        //         console.warn('Error setting up gamepad publisher: ', res);
        //     }
        // });
    // }



    // clearProducers() {
        // for (const topic of Object.keys(this.dcs)) {
        //     if (this.dcs[topic])
        //         this.dcs[topic].close();
        // }
        // this.dcs = {}
    // }


    

    // SampleLatency(decoded) {
    //     let sec = decoded.header.stamp.sec
    //     let nanosec = decoded.header.stamp.nanosec
    //     let msg_ms = (sec * 1000) + (nanosec / 1000000);
    //     let now_ms = Date.now(); //window.performance.now()
    //     let lat = now_ms - msg_ms;
    //     // let sec = Math.floor(now_ms / 1000)
    //     // let nanosec = (now_ms - sec*1000) * 1000000

    //     $('#gamepad_latency').html(lat+' ms')
    //     // console.log('Sampling joy lag: ', )
    // }

    // capture_gamepad_input(buttons, axes) {
    //     if (!this.capturing_gamepad_input) {
    //         return;
    //     }

    //     let something_pressed = false;
    //     for (let i = 0; i < buttons.length; i++) {
    //         if (buttons[i] && buttons[i].pressed) {
    //             something_pressed = true;
    //             if (this.captured_gamepad_input.indexOf(i) === -1) {
    //                 this.captured_gamepad_input.push(i);
    //             }
    //         }
    //     }
    //     if (something_pressed) {
    //         for (let i = 0; i < this.captured_gamepad_input.length; i++) {
    //             let btn = this.captured_gamepad_input[i];
    //             if (!buttons[btn] || !buttons[btn].pressed) {
    //                 this.captured_gamepad_input.splice(i, 1);
    //                 i--;
    //             }
    //         }
    //     }

    //     $('#current-key').html(this.captured_gamepad_input.join(' + '));
    // }


    // MarkMappedServiceButtons() {
    //     if (!this.gamepad_service_mapping)
    //         return;

    //     $('.service_button').removeClass('mapped');
    //     $('.service_button').attr('title');
    //     for (const [service_name, service_mapping] of Object.entries(this.gamepad_service_mapping)) {
    //         for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
    //             console.log('MARKING MAPPED: ', service_name, btn_name, $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]'))
    //             let btns_print = [];
    //             for (let i = 0; i < btns_config.btns_cond.length; i++) {
    //                 let b = btns_config.btns_cond[i];
    //                 btns_print.push('['+b+']');
    //             }
    //             $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]')
    //                 .addClass('mapped')
    //                 .attr('title', 'Mapped to gamepad button(s): '+btns_print.join(' + '));
    //         }
    //     }
    // }

    // static SaveGamepadServiceMapping(id_robot) {

    //     MarkMappedServiceButtons();

    //     if (typeof(Storage) === "undefined") {
    //         console.warn('No Web Storage support, cannot save gamepad mapping');
    //         return;
    //     }

    //     let data = [];
    //     for (const [service_name, service_mapping] of Object.entries(gamepad_service_mapping)) {
    //         for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
    //             let service_data = {
    //                 service_name: service_name,
    //                 btn_name: btn_name,
    //                 btns_cond: btns_config.btns_cond
    //             }
    //             data.push(service_data);
    //         }
    //     }
    //     let val = JSON.stringify(data);
    //     localStorage.setItem('gamepad_service_mapping:'+id_robot, val);
    //     console.log('Saved Gamepad Service Mapping for robot '+id_robot+':', val);
    // }

    // load_gamepad_service_mapping() {
    //     if (typeof(Storage) === "undefined") {
    //         console.warn('No Web Storage support, cannot load gamepad mapping');
    //         return;
    //     }

    //     console.log('Loading Gamepad Service Mapping for robot '+this.client.id_robot+'...');

    //     this.gamepad_service_mapping = {};
    //     let json = localStorage.getItem('gamepad_service_mapping:'+this.client.id_robot);
    //     if (!json)
    //         return;
    //     let val = JSON.parse(json);

    //     for (let i = 0; i < val.length; i++) {
    //         let service_data = val[i];
    //         if (!this.gamepad_service_mapping[service_data.service_name])
    //             this.gamepad_service_mapping[service_data.service_name] = {};
    //         this.gamepad_service_mapping[service_data.service_name][service_data.btn_name] = {
    //             btns_cond: service_data.btns_cond,
    //             needs_reset: false
    //         };
    //     }
    //     console.log('Loaded Gamepad Service Mapping:', val, this.gamepad_service_mapping);
    // }

    // MapServiceButton(button, id_robot) {

    //     let service_name = $(button).attr('data-service');
    //     let btn_name = $(button).attr('data-name');
    //     console.warn('Mapping '+service_name+' => ' + btn_name +' ...');

    //     $('#mapping-confirmation').attr('title', 'Mapping '+service_name+':'+btn_name);
    //     $('#mapping-confirmation').html('Press a gamepad button or combination...<br><br><span id="current-key"></span>');
    //     this.captured_gamepad_input = [];
    //     this.capturing_gamepad_input = true;
    //     $( "#mapping-confirmation" ).dialog({
    //         resizable: false,
    //         height: "auto",
    //         width: 400,
    //         modal: true,
    //         buttons: {
    //           Clear: function() {
    //             this.captured_gamepad_input = [];
    //             $('#current-key').html('');
    //             //$( this ).dialog( "close" );
    //           },
    //           Cancel: function() {
    //             this.capturing_gamepad_input = false;
    //             $( this ).dialog( "close" );
    //           },
    //           Save: function() {
    //             capturing_gamepad_input = false;
    //             if (!gamepad_service_mapping[service_name])
    //                 gamepad_service_mapping[service_name] = {};
    //             if (!gamepad_service_mapping[service_name][btn_name])
    //                 gamepad_service_mapping[service_name][btn_name] = { };

    //             if (captured_gamepad_input.length > 0) {
    //                 gamepad_service_mapping[service_name][btn_name]['btns_cond'] = captured_gamepad_input;
    //                 captured_gamepad_input = [];
    //                 gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;
    //             } else {
    //                 delete gamepad_service_mapping[service_name][btn_name];
    //                 if (Object.keys(gamepad_service_mapping[service_name]).length == 0)
    //                     delete gamepad_service_mapping[service_name];
    //             }


    //             //console.log('Mapping saved: ', gamepad_service_mapping);
    //             $( this ).dialog( "close" );
    //             $('#service_controls.setting_shortcuts').removeClass('setting_shortcuts');
    //             $('#services_gamepad_mapping_toggle').html('[shortcuts]');

    //             SaveGamepadServiceMapping(id_robot);
    //           }
    //         }
    //     });
    // }
}