import { isIOS, lerp } from './lib.js';
import { Handle_Shortcut } from '/static/input-drivers.js';
import * as THREE from 'three';

export class GamepadController {

    constructor(client) {

        this.client = client;

        this.registered_drivers = {}; // id: driver class 

        this.default_shortcuts_config = {};
        this.shortcuts_config = null;
        this.last_buttons = [];
        this.editor_listening = false;

        // this.gamepad = null;
        // this.capturing_gamepad_input = false;
        // this.captured_gamepad_input = [];
        // this.gamepad_service_mapping = {}
        this.last_gp_loaded = null;
        this.loop_delay = 33.3; // ms, 30Hz updates

        this.initiated = false;
        this.enabled = false; 
        this.loop_running = false;
        $('#gamepad_enabled').prop('checked', this.enabled);

        let that = this;
        this.zero = new THREE.Vector2(0,0);

        this.show_icon = this.load_last_gp_shown(); //once you'be connected a gamepad, the icon will be on

        this.default_configs = {};
        this.profiles = {}; // type => id => profile[]
        this.enabled_drivers = {}; // type => driver[]

        // this.touch_gamepad = false;
        this.last_touch_input = {};
        this.connected_gamepads = {}; //id => gp ( touch)
        this.current_gamepad = null;

        client.on('gp_config', (drivers, defaults)=>{
            that.set_config('gamepad', drivers, defaults);
        });

        client.on('touch_config', (drivers, defaults)=>{
            that.set_config('touch', drivers, defaults);
        });

        $('#gamepad_status').click(() => {
            // if (!that.initiated)
            //     return; //wait 
            $('#keyboard').removeClass('open');
            if (!$('#gamepad').hasClass('open')) {
                $('#gamepad').addClass('open');
                $('BODY').addClass('gamepad-editing');
                if (this.current_gamepad && this.current_gamepad.isTouch) {
                    $('#touch-gamepad-left').appendTo($('#gamepad-touch-left-zone'));
                    $('#touch-gamepad-right').appendTo($('#gamepad-touch-right-zone'));
                    $('#touch-gamepad-left > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                    $('#touch-gamepad-right > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                }
            } else {
                $('#gamepad').removeClass('open');
                $('BODY').removeClass('gamepad-editing');
                if (this.current_gamepad && this.current_gamepad.isTouch) {
                    $('#touch-gamepad-left').appendTo($('BODY'));
                    $('#touch-gamepad-right').appendTo($('BODY'));
                    $('#touch-gamepad-left > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                    $('#touch-gamepad-right > .Gamepad-anchor').css('inset', '60% 50% 40% 50%');
                }
            }
        });

        window.addEventListener('gamepadconnected', (ev) => this.on_gamepad_connected(ev));

        const gps = navigator.getGamepads();
        console.log('Conected gamepads: ', gps);

        window.addEventListener('gamepaddisconnected', (event) => {

            if (that.connected_gamepads[event.gamepad.id]) {

                this.current_gamepad.id == event.gamepad.id;
                this.current_gamepad = null; // kills the loop

                that.connected_gamepads[event.gamepad.id].gamepad = null;

                this.make_ui();
            }

        });

        $('#gamepad_settings .tab').click((ev)=>{
            if ($(ev.target).hasClass('active'))
                return;
            $('#gamepad_settings .tab')
                .removeClass('active');
            $(ev.target).addClass('active')
            $('#gamepad_settings .panel')
                .removeClass('active');
            let open = '';
            console.log(ev.target.id);
            switch (ev.target.id) {
                case 'gamepad-axes-tab': open = '#gamepad-axes-panel'; break;
                case 'gamepad-buttons-tab': open = '#gamepad-buttons-panel'; break;
                case 'gamepad-output-tab': open = '#gamepad-output-panel'; break;
                case 'gamepad-settings-tab': open = '#gamepad-settings-panel'; break;
                default: return;
            }
            $(open)
                .addClass('active');
        });

        // $('#gamepad_config_toggle').click(() =>{
        //     if ($('#gamepad_debug').hasClass('config')) {
        //         //disable config edit
        //         $('#gamepad_debug').removeClass('config');
        //         $('#gamepad_config_toggle').removeClass('close');
        //         $('#gamepad_settings h3').removeClass('config');
        //     } else {
        //         //enable config edit
        //         $('#gamepad_debug').removeClass('shortcuts');
        //         $('#gamepad_debug').addClass('config');

        //         $('#gamepad_settings h3').removeClass('shortcuts');
        //         $('#gamepad_settings h3').addClass('config');
                
        //         $('#gamepad_shortcuts_toggle').removeClass('close');
        //         $('#gamepad_config_toggle').addClass('close');
            
        //         $('#gamepad_debug_output').css('display', 'block');
        //     }
        // });

        // $('#gamepad_shortcuts_toggle').click(() =>{
        //     if ($('#gamepad_debug').hasClass('shortcuts')) {
        //         //disable mapping edit
        //         $('#gamepad_debug').removeClass('shortcuts');
        //         $('#gamepad_shortcuts_toggle').removeClass('close')
        //         $('#gamepad_debug_output').css('display', 'block');
        //         $('#gamepad_settings h3').removeClass('shortcuts');
        //     } else {
        //         //enable mapping edit
        //         $('#gamepad_debug').removeClass('config');
        //         $('#gamepad_debug').addClass('shortcuts');

        //         $('#gamepad_settings h3').removeClass('config');
        //         $('#gamepad_settings h3').addClass('shortcuts');
                
        //         $('#gamepad_config_toggle').removeClass('close');
        //         $('#gamepad_shortcuts_toggle').addClass('close');

        //         $('#gamepad_debug_output').css('display', 'none');
        //     }
        // });

        $('#gamepad-profile').change((ev) => {
            // if (that.select_driver($(ev.target).val())) {
            //     that.save_user_gamepad_driver();
            // }
        });

        $('#gamepad_config_cancel').click((ev) => {
            $('#gamepad_config_toggle').click();
        });

        $('#gamepad_config_default').click((ev) => {
            that.set_default_config();
        });

        $('#gamepad_config_apply').click((ev) => {
            that.parse_driver_config();
        });

        $('#gamepad_config_save').click((ev) => {
            if (that.parse_driver_config()) {
                that.save_user_driver_config();
            }
        });

        $('#gamepad_enabled').change(function(ev) {
            that.enabled = this.checked;
            that.save_user_gamepad_enabled(that.enabled)            
            if (that.enabled) {
                $('#gamepad').addClass('enabled');
                that.disable_kb_on_conflict();
            } else {
                $('#gamepad').removeClass('enabled');
            }
        });

        $('#gamepad_shortcuts_listen').click((ev) => {
            if (!$('#gamepad_shortcuts_listen').hasClass('listening')) {
                $('#gamepad_shortcuts_listen').addClass('listening');
                that.editor_listening = true;
                $('#gamepad_shortcuts_input').focus();
            } else {
                $('#gamepad_shortcuts_listen').removeClass('listening');
                that.editor_listening = false;
            }
        });

        $('#gamepad_shortcuts_cancel').click((ev) => {
            $('#gamepad_shortcuts_toggle').click();
        });

        $('#gamepad_shortcuts_default').click((ev) => {
            that.set_default_shortcuts();
        });

        $('#gamepad_shortcuts_apply').click((ev) => {
            that.parse_shortcuts_config();
        });

        $('#gamepad_shortcuts_save').click((ev) => {
            if (that.parse_shortcuts_config()) {
                that.save_user_shortcuts();
            }
        });

        this.make_ui();
    }

    set_config(gp_type, enabled_drivers, defaults) {
        console.info(`Gamepad got ${gp_type} config; enabled_drivers=[${enabled_drivers.join(', ')}] defaults:`, defaults);

        this.enabled_drivers[gp_type] = enabled_drivers;

        this.profiles[gp_type] = [];

        if (!defaults || !defaults.profiles)
            return;
        
        let that = this;

        // init drivers enabled by the robot
        Object.keys(defaults.profiles).forEach((id_profile)=>{

            if (that.profiles[gp_type][id_profile])
                return; //only once

            console.warn('Setting up gp profile '+id_profile+' for '+gp_type);

            let id_driver = id_profile;
            let profile = defaults.profiles[id_profile];
            if (!profile)
                profile = {};
            if (profile['driver']) // ignoring user's override
                id_driver = profile['driver'];

            let driver_instance = that.registered_drivers[id_driver];
            if (!driver_instance) {
                console.error('Gp driver '+id_driver+' for '+gp_type+' not found (did you register it first?)');
                return;
            }
            profile['driver_instance'] = driver_instance;

            let label = id_profile;
            if (profile && profile['label'])
                label = profile['label'];
            profile['label'] = label;

            that.profiles[gp_type][id_profile] = profile;
            
            
            // new driver_class(id_driver, label);
            // if (default_cfg) {
            //     that.drivers[id_driver].default_gamepad_config = default_cfg;
            // }
            // that.drivers[id_driver].config = that.drivers[id_driver].default_gamepad_config; // overriden by user's gp settings (loaded on GP connect)
        });

        // if (gp_defaults && gp_defaults.shortcuts) {
        //     that.default_shortcuts_config = gp_defaults.shortcuts;
        // }
        // if (!that.initiated) {
        //     that.shortcuts_config = that.default_shortcuts_config; // overriden by user's gp settings (loaded on GP connect)

        //     console.log('Gamepad setting driver to default '+default_driver);
        //     that.select_driver(default_driver);
        // }
            
        // if (that.gamepad) {
        //     that.init_gamepad();
        // } else { // init without loading gp config
        //     that.shortcuts_to_editor();
        //     that.update_ui();
        // }

        // that.initiated = true;
    }

    // init_gamepad() {

    //     if (!this.gamepad)
    //         return;

    //     let was_enabled = this.enabled;

    //     let enabled_drivers = Object.keys(this.drivers);
    //     if (!enabled_drivers.length)
    //         return;

    //     if (this.last_gp_loaded != this.gamepad.id) { 
    //         // only load once for a gp (so we don't overwrite user's config on reconnects)
    //         this.last_gp_loaded = this.gamepad.id; 

    //         enabled_drivers.forEach((id_driver)=>{
    //             let user_driver_cfg = this.load_user_driver_config(this.gamepad.id, id_driver);
    //             if (user_driver_cfg) {
    //                 this.drivers[id_driver].config = user_driver_cfg;
    //                 if (user_driver_cfg['label'])
    //                     this.drivers[id_driver].label = user_driver_cfg['label'];
    //             }
    //         });
    
    //         let user_default_driver = this.load_user_gamepad_driver(this.gamepad.id);
    //         if (user_default_driver && this.drivers[user_default_driver]) {
    //             this.select_driver(user_default_driver);
    //         }

    //         let user_shortcuts = this.load_user_shortcuts(this.gamepad.id);
    //         if (user_shortcuts)
    //             this.shortcuts_config = user_shortcuts;
            
    //         this.enabled = this.load_user_gamepad_enabled(this.gamepad.id);
    //     }
        
    //     this.shortcuts_to_editor();
    //     this.update_ui();

    //     $('#gamepad_enabled').prop('checked', this.enabled);
    //     if (this.enabled) {
    //         $('#gamepad').addClass('enabled');
    //     } else {
    //         $('#gamepad').removeClass('enabled');
    //     }

    //     let that = this;
    //     if (!this.loop_running) {
    //         this.loop_running = true;
    //         this.client.when_message_types_loaded(()=>{
    //             that.run_loop();
    //         });
    //     }
    // }

    save_last_gp_shown(val) {
        localStorage.setItem('last-gamepad-shown:' + this.client.id_robot, val);
    }

    load_last_gp_shown() {
        let val = localStorage.getItem('last-gamepad-shown:' + this.client.id_robot) == 'true';
        return val;
    }

    disable_kb_on_conflict() {

        if (!this.enabled)
            return;

        let kb = this.client.ui.keyboard;
        if (kb && kb.enabled && kb.current_driver.id == this.current_driver.id) {
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

        console.log('Current profile is ', this.current_gamepad.current_profile);

        let profile_ids = Object.keys(this.current_gamepad.profiles);
        for (let i = 0; i < profile_ids.length; i++) {
            let id_profile = profile_ids[i];
            let label = this.current_gamepad.profiles[id_profile].label ? this.current_gamepad.profiles[id_profile].label : id_profile;
            profile_opts.push($('<option value="'+id_profile+'"' + (this.current_gamepad.current_profile == id_profile ? ' selected' : '') + '>'+label+'</option>'));
        }
        profile_opts.push($('<option value="+">New profile...</option>'));
        $('#gamepad-profile-select').empty().attr('disabled', false).append(profile_opts);
        
        $('#gamepad-profile-select').unbind().change((ev)=>{
            let val = $(ev.target).val()
            console.log('Selected profile val '+val);
            let current_profile = that.current_gamepad.profiles[that.current_gamepad.current_profile];
            if (val != '+') {
                current_profile.scroll_offset = $('#gamepad-axes-panel').scrollTop();
                that.current_gamepad.current_profile = $(ev.target).val();
                that.make_ui();
            } else {
                let id_new_profile = 'Profile-'+Date.now();
                that.current_gamepad.profiles[id_new_profile] = {
                    id: id_new_profile,
                    driver: current_profile.driver, // copy current as default
                    label: id_new_profile,
                }
                that.init_profile(that.current_gamepad.profiles[id_new_profile]);
                that.current_gamepad.current_profile = id_new_profile;

                that.make_ui();
                $('#gamepad_settings #gamepad-settings-tab').click();
            }
        });
    }

    make_profile_config_ui() {

        let that = this;

        if (!this.current_gamepad) {
            $('#gamepad-profile-config').html('<div class="line"><span class="label">Input source:</span><span id="connected-gamepad">N/A</span></div>');
            $('#gamepad-settings-panel .bottom-buttons').css('display', 'none');
        } else {
            
            let lines = [];

            let line_source = $('<div class="line"><span class="label">Input source:</span><span id="connected-gamepad">'
                            + (this.current_gamepad.isTouch ? 'Virtual Gamepad (Touch UI)' : this.current_gamepad.id)
                            + '</span></div>');
            lines.push(line_source);

            if (this.current_gamepad.current_profile) {
                let profile = this.current_gamepad.profiles[this.current_gamepad.current_profile];

                //profile id
                let line_id = $('<div class="line"><span class="label">Profile ID:</span></div>');
                let inp_id = $('<input type="text" inputmode="url" value="'+profile.id+'"/>');
                inp_id.change((ev)=>{
                    let val = $(ev.target).val();
                    if (this.current_gamepad.current_profile == profile.id) {
                        this.current_gamepad.current_profile = val;
                    }
                    this.current_gamepad.profiles[val] = this.current_gamepad.profiles[profile.id];
                    delete this.current_gamepad.profiles[profile.id];
                    profile.id = val;
                    console.log('Profile id changed to: '+profile.id);
                    that.make_profile_selector_ui();
                });

                inp_id.appendTo(line_id);
                lines.push(line_id);

                //profile name
                let line_name = $('<div class="line"><span class="label">Profile name:</span></div>');
                let inp_name = $('<input type="text" value="'+profile.label+'"/>');
                inp_name.change((ev)=>{
                    let val = $(ev.target).val();
                    profile.label = val;
                    console.log('Profile name changed to: '+profile.label);
                    that.make_profile_selector_ui();
                });

                inp_name.appendTo(line_name);
                lines.push(line_name);

                //driver
                let line_driver = $('<div class="line"><span class="label">Output driver:</span></div>');
                let driver_opts = [];
                
                if (!this.enabled_drivers[this.current_gamepad.type]) {
                    console.error('No enabled drivers fot '+this.current_gamepad.type+' (yet?)');
                    return;
                }

                let driver_keys = this.enabled_drivers[this.current_gamepad.type];
               
                for (let i = 0; i < driver_keys.length; i++) {
                    let id_driver = driver_keys[i];
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
                    profile.driver = val;
                    that.init_profile(profile);
                    that.make_ui();

                })
                lines.push(line_driver);
                
                let driver = profile.driver_instances[profile.driver];
                if (driver) {
                    let driver_lines = driver.make_cofig_inputs();
                    lines = lines.concat(driver_lines);
                    console.log('Driver config lines ', driver_lines);
                }

                $('#gamepad-settings-panel .bottom-buttons').css('display', 'block');
            } else {
                $('#gamepad-settings-panel .bottom-buttons').css('display', 'none');
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
    }

    make_ui() {

        let that = this;

        this.make_profile_config_ui();

        if (!this.current_gamepad) {
            $('#gamepad').removeClass('connected');
            $('#gamepad-axes-panel').html('Waiting for gamepad...');
            $('#gamepad-buttons-panel').html('Waiting for gamepad...');
            $('#gamepad-output-panel').html('{}');
            // $('#gamepad-profile-config').css('display', 'none');
            $('#gamepad_enabled').attr('disabled', true);
            $('#gamepad-profile-select')
                .empty()
                .attr('disabled', true)
                .append('<option disabled selected>No active gamepad</option>');
            return;
        }

        $('#gamepad').addClass('connected');
        console.log('Current gamepad is ', this.current_gamepad);

        this.make_profile_selector_ui();

        $('#gamepad_enabled').attr('disabled', false);

        // gamepad name

        let profile = this.current_gamepad.profiles[this.current_gamepad.current_profile];

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
                opts.push('<option value="'+id_axis+'"'+(axis.assigned_axis == id_axis ? ' selected' : '')+'>'+dri_axes[id_axis]+'</option>');
            }
            let assignment_sel_el = $('<select>'+opts.join('')+'</select>');
            assignment_sel_el.appendTo(line_1_el);

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
                let assigned_axis = axis.assigned_axis;

                if (!assigned_axis) {
                    conf_toggle_el.removeClass('open')
                    config_details_el.removeClass('open')
                    return;
                }

                // let default_axis_conf = this.current_gamepad.current_profile[assigned_axis];

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

                dead_zone_min_inp.change((ev)=>{axis.dead_min = parseFloat($(ev.target).val()); delete axis.dead_val; });
                dead_zone_max_inp.change((ev)=>{axis.dead_max = parseFloat($(ev.target).val()); delete axis.dead_val; });

                dead_zone_el.appendTo(config_details_el);

                // input offset
                let offset_el = $('<div class="config-row"><span class="label">Offset input:</span></div>');
                let offset_inp = $('<input type="text" class="inp-val"/>');
                offset_inp.val(axis.offset.toFixed(1));
                offset_inp.focus((ev)=>{ev.target.select();});
                offset_inp.change((ev)=>{axis.offset = parseFloat($(ev.target).val());});
                offset_inp.appendTo(offset_el);
                offset_el.appendTo(config_details_el);

                // input scale
                let scale_el = $('<div class="config-row"><span class="label">Scale input:</span></div>');
                let scale_inp = $('<input type="text" class="inp-val"/>');
                scale_inp.val(axis.scale.toFixed(1));
                scale_inp.focus((ev)=>{ev.target.select();});
                scale_inp.change((ev)=>{axis.scale = parseFloat($(ev.target).val());});
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
                        axis.mod_func = null;
                        mod_func_cont.empty().css('display', 'none');
                    }
                }
                set_mod_funct(axis.mod_func);
                mod_func_inp.change((ev)=>{
                    set_mod_funct($(ev.target).val());
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
                console.log('axis '+i_axis+' assigned to '+id_axis_assigned);
                if (id_axis_assigned) {
                    axis.assigned_axis = id_axis_assigned;
                    
                    render_axis_config();
                    row_el.removeClass('unused');
                } else {
                    axis.assigned_axis = null;                   
                    
                    render_axis_config();
                    row_el.addClass('unused');
                }
            });
            render_axis_config();
            if (axis.assigned_axis) {
                row_el.removeClass('unused');
            } else {
                row_el.addClass('unused');
            }

            line_1_el.appendTo(row_el);
            config_details_el.appendTo(row_el);

            axes_els.push(row_el);
        }

        $('#gamepad-axes-panel')
            .empty()
            .append(axes_els);

        if (driver.scroll_offset !== undefined) {
            $('#gamepad-axes-panel').scrollTop(profile.scroll_offset);
            delete profile.scroll_offset;
        }

        // let opts = [];
        // Object.keys(this.drivers).forEach((id_driver) => {
        //     let label = this.drivers[id_driver].label;
        //     let selected = this.current_driver == this.drivers[id_driver];
        //     opts.push(
        //         '<option value="'+id_driver+'"'+(selected ? ' selected="selected"' : '')+'>' +
        //         this.drivers[id_driver].label +
        //         '</option>')
        // })
        // $('#gamepad_driver').html(opts.join("\n"));
    }

    update_axes_ui_values () {
        if (!this.current_gamepad)
            return;
        
        let profile = this.current_gamepad.profiles[this.current_gamepad.current_profile];
        let driver = profile.driver_instances[profile.driver];

        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {

            let axis = driver.axes[i_axis];

            // if (this.current_gamepad.axes[i].val === undefined) {
            //     return;
            // }

            // let val_el = this.current_gamepad.axes[i].;
            axis.raw_val_el.html(axis.raw.toFixed(2));

            if (!axis.assigned_axis)
                continue;

            axis.out_val_el.html(axis.val.toFixed(2));
            if (axis.live) {
                axis.out_val_el.addClass('live');
            } else {
                axis.out_val_el.removeClass('live');
            }
            // if (val > 0.001 || val < -0.001) {
            //     if (!this.current_gamepad.axes[i].active_ui) {
            //         this.current_gamepad.axes[i].active_ui = true;
            //         val_el.addClass('active');
            //     }
            // } else if (this.current_gamepad.axes[i].active_ui ) {
            //     this.current_gamepad.axes[i].active_ui = false;
            //     val_el.removeClass('active');
            // }
        }
    }

    // select_profile(id_profile) {

    //     if (!this.drivers[id_driver]) {
    //         console.error('Gamepad driver not found: '+id_driver)
    //         return false;
    //     }

    //     console.info('Setting driver to ', id_driver);
    //     this.current_driver = this.drivers[id_driver];

    //     this.config_to_editor();
    //     this.update_output_info();

    //     this.disable_kb_on_conflict();

    //     return true;
    // }

    process_axes_input() {

        let profile = this.current_gamepad.profiles[this.current_gamepad.current_profile];
        let driver = profile.driver_instances[profile.driver];

        let combined_axes_vals = {}; // 1st pass, same axess added to single val
        let combined_axes_unscaled_vals = {}; // expected to be within [-1; +1] (offset added and scaling sign kept)

        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
            let axis = driver.axes[i_axis];
           
            if (!axis.assigned_axis)
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
            
            if (combined_axes_vals[axis.assigned_axis] === undefined) {
                combined_axes_vals[axis.assigned_axis] = axis.base_val;
                combined_axes_unscaled_vals[axis.assigned_axis] = out_unscaled;
            } else { // add multiple axes into one (use this for negative/positive split)
                combined_axes_vals[axis.assigned_axis] += axis.base_val;
                combined_axes_unscaled_vals[axis.assigned_axis] += out_unscaled;
            }
                
        }

        driver.axes_output = {}; // this goes to the driver

        // 2nd pass - modifiers that use base vals and split-axes added together
        for (let i_axis = 0; i_axis < driver.axes.length; i_axis++) {
            let axis = driver.axes[i_axis];

            if (!axis.assigned_axis || !axis.live) {
                continue;
            }

            if (!axis.mod_func) {
                if (driver.axes_output[axis.assigned_axis] === undefined)
                    driver.axes_output[axis.assigned_axis] = axis.val;
                else
                    driver.axes_output[axis.assigned_axis] += axis.val;
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
                    if (driver.axes_output[axis.assigned_axis] === undefined)
                        driver.axes_output[axis.assigned_axis] = axis.val;
                    else
                        driver.axes_output[axis.assigned_axis] += axis.val;

                    console.log('Scaling axis '+i_axis+' ('+axis.assigned_axis+') by '+abs_velocity_normalized+' ('+axis.scale_by_velocity_src+') m='+multiplier)

                    break;
                default:
                    break;
            }

        }

    }

    on_gamepad_connected(ev) {
            
        let id_gamepad = ev.gamepad.id;

        if (!this.connected_gamepads[id_gamepad]) {

            console.warn('Gamepad connected:', id_gamepad, ev.gamepad);
            let gamepad = {
                isTouch: false,
                type: 'gamepad',
                id: id_gamepad,
                gamepad: ev.gamepad,
                profiles: {
                    'Twist_Forward': {
                        'id': 'Twist_Forward',
                        'label': "GP Twist Forward",
                        'driver_instances': null,
                        'default': true,
                        'driver': 'Twist',
                        'default_driver_config': {
                            'Twist': {
                                'output_topic': '/cmd_speed',
                                'stamped': false,
                            },
                        },
                    },
                    'Twist_Reverse': {
                        'id': 'Twist_Reverse',
                        'label': "GP Twist Reverse",
                        'driver_instances': null,
                        'driver': 'Twist',
                        'default_driver_config': {
                            'Twist': {
                                'output_topic': '/cmd_speed',
                                'stamped': true,
                            }
                        },
                    }
                },
                current_profile: 'Twist_Reverse',
            };
            this.connected_gamepads[id_gamepad] = gamepad;
            let profile_ids = Object.keys(gamepad.profiles);
            // let gamepad = this.connected_gamepads['touch']; // set before profile init
            profile_ids.forEach((id_profile)=>{
                this.init_profile(
                    gamepad.profiles[id_profile],
                    gamepad
                );
            });
            
        } else {
            this.connected_gamepads[id_gamepad].gamepad = ev.gamepad;
            console.info('Gamepad already connected:', id_gamepad);
        }

        if (this.current_gamepad && this.current_gamepad.isTouch)
            return; //touch ui has priority when on

        this.current_gamepad = this.connected_gamepads[id_gamepad];

        this.make_ui();

        if (!this.loop_running) {
            this.loop_running = true;
            this.run_loop();
        }
    }

    on_gamepad_disconnected (ev) {

        if (this.connected_gamepads[ev.gamepad.id]) {

            this.connected_gamepads[ev.gamepad.id].gamepad = null;

            if (this.current_gamepad.id == ev.gamepad.id) {
                this.current_gamepad = null; // kills the loop
                this.make_ui();
            }
        }

    }

    set_touch(state) {
        

        if (state) {

            if (!this.connected_gamepads['touch']) {
                let touch_gamepad = {
                    isTouch: true,
                    type: 'touch',
                    id: 'touch',
                    profiles: {
                        'Twist_Forward': {
                            'id': 'Twist_Forward',
                            'label': "Twist Forward",
                            'driver_instances': null,
                            'default': true,
                            'driver': 'Twist',
                            'default_driver_config': {
                                'Twist': {
                                    'output_topic': '/cmd_speed',
                                    'stamped': false,
                                },
                            },
                        },
                        'Twist_Reverse': {
                            'id': 'Twist_Reverse',
                            'label': "Twist Reverse",
                            'driver_instances': null,
                            'driver': 'Twist',
                            'default_driver_config': {
                                'Twist': {
                                    'output_topic': '/cmd_speed',
                                    'stamped': false,
                                }
                            },
                        }
                    },
                    current_profile: 'Twist_Reverse',
                };
                this.connected_gamepads['touch'] = touch_gamepad;
                let profile_ids = Object.keys(touch_gamepad.profiles);
                profile_ids.forEach((id_profile)=>{
                    this.init_profile(
                        touch_gamepad.profiles[id_profile],
                        touch_gamepad
                    );
                });
            }

            if (this.current_gamepad != this.connected_gamepads['touch']) {
                this.current_gamepad = this.connected_gamepads['touch'];
            }

            this.make_ui();

            if (!this.loop_running) {
                this.loop_running = true;
                this.run_loop();
            }

        } else {

            this.current_gamepad = null; // kills the loop
            // console.log('Gamepad touch mode off')

            let that = this;
            Object.values(this.connected_gamepads).forEach((gp)=>{
                if (!gp.isTouch && gp.gamepad) { // physical gamepad connected => fall back
                    console.log('Falling back to '+gp.id);
                    that.current_gamepad = gp;
                    return;
                }
            })

            this.make_ui();

        }
        
    }

    init_profile(profile, gamepad = null) {

        if (!gamepad) {
            gamepad = this.current_gamepad;
        }

        if (!profile.driver_instances) {
            profile.driver_instances = {};
        }

        if (!profile.driver_instances[profile.driver]) {
            profile.driver_instances[profile.driver] = new this.registered_drivers[profile.driver](this);
            if (profile.default_driver_config && profile.default_driver_config[profile.driver]) {
                profile.driver_instances[profile.driver].set_config(profile.default_driver_config[profile.driver]);
            }

            let driver = profile.driver_instances[profile.driver];

            driver.buttons = [];
            profile.buttons = [];

            if (!driver.axes) {
                
            }
            driver.axes = [];
            if (gamepad.isTouch) {
                for (let i_axis = 0; i_axis < 4; i_axis++) {
                    driver.axes.push({ 
                        dead_min: -0.01, // TODO load & override these from conf/user
                        dead_max: 0.01,
                        offset: 0.0,
                        scale: 1.0,
        
                        mod_func: null,
                        scale_by_velocity_src: null,
                        scale_by_velocity_mult_min: 1.0,
                        scale_by_velocity_mult_max: 1.0
                    });
                }
            } else if (gamepad && gamepad.gamepad) {

                const gp = navigator.getGamepads()[gamepad.gamepad.index];

                for (let i = 0; i < gp.axes.length; i++) {
                    driver.axes.push({ 
                        dead_min: -0.1, // TODO load & override these from conf/user
                        dead_max: 0.1,
                        offset: 0.0,
                        scale: 1.0,
        
                        mod_func: null,
                        scale_by_velocity_src: null,
                        scale_by_velocity_mult_min: 1.0,
                        scale_by_velocity_mult_max: 1.0
                    });
                }
            }
        }

    }
    
    delete_current_profile() {
    
        let id_delete = this.current_gamepad.current_profile;
        let old_profile_ids = Object.keys(this.current_gamepad.profiles);
        let pos = old_profile_ids.indexOf(id_delete);
        
        console.log('Deleting profile '+id_delete);

        delete this.current_gamepad.profiles[id_delete];
        let remaining_profile_ids = Object.keys(this.current_gamepad.profiles);

        if (remaining_profile_ids.length == 0) {
            console.log('No profile to autoselect, making new');
            
            let id_new_profile = 'Profile-'+Date.now();
            this.current_gamepad.profiles[id_new_profile] = {
                id: id_new_profile,
                driver: this.enabled_drivers[this.current_gamepad.type][0], // copy current as default
                label: id_new_profile,
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
    

    // debug_out(val) {
    //     let html = JSON.stringify(val, null, 4);
    //     $('#gamepad-output-panel').html(html);
    // }

    touch_input(where, value, angle) {
        // console.log('Touch GP '+where+' val='+value+'; a='+angle.toFixed(2));
        if (value) {
            if (!this.last_touch_input[where]) {
                this.last_touch_input[where] = new THREE.Vector2();
            }
            this.last_touch_input[where].set(value, 0);
            this.last_touch_input[where].rotateAround(this.zero, angle);
            // console.log('Touch GP '+where+' val='+value+' ['+this.last_touch_input[where].x+';'+this.last_touch_input[where].y+']');
        } else {
            delete this.last_touch_input[where];
        }

        // TODO ?!?!?!
        // this flasing (good) v checkbox v pausing stream + make sure some 0s are delivered
        if (value || Object.keys(this.last_touch_input).length) {
            $('#gamepad').addClass('enabled'); 
        } else {
            $('#gamepad').removeClass('enabled');
        }
    }



    config_to_editor() {
        let cfg = JSON.stringify(this.current_driver.config, null, 4);
        cfg = this.unquote(cfg);
        $('#gamepad_config_input').val(cfg);
    }

    shortcuts_to_editor() {
        let cfg = JSON.stringify(this.shortcuts_config, null, 4);
        cfg = this.unquote(cfg);
        $('#gamepad_shortcuts_input').val(cfg);
    }

    parse_driver_config() {
        try {
            let src = $('#gamepad_config_input').val();
            src = src.replace("\n","")
            let config = null;
            eval('config = '+src);
            console.log('Parsed config: ', config);
            $('#gamepad_config_input').removeClass('err');

            this.current_driver.config = config;
            return true;
        } catch (error) {
            $('#gamepad_config_input').addClass('err');
            console.log('Error parsing JSON config', error);
            return false;
        }

    }

    parse_shortcuts_config() {
        try {
            let src = $('#gamepad_shortcuts_input').val();
            src = src.replace("\n","")
            let config = null;
            eval('config = '+src);
            console.log('Parsed shortcuts config: ', config);
            $('#gamepad_shortcuts_input').removeClass('err');

            this.shortcuts_config = config;
            return true;
        } catch (error) {
            $('#gamepad_shortcuts_input').addClass('err');
            console.log('Error parsing JSON shortcuts config', error);
            return false;
        }

    }

    save_user_gamepad_enabled(state) {
        if (!this.gamepad)
            return; // saving per gp

        localStorage.setItem('gamepad-enabled:' + this.client.id_robot
                            + ':' + this.gamepad.id,
                            state);
        console.log('Saved gamepad enabled for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', state);
    }

    load_user_gamepad_enabled(id_gamepad) {
        let state = localStorage.getItem('gamepad-enabled:' + this.client.id_robot
                                        + ':' + id_gamepad);

        state = state === 'true';
        console.log('Loaded gamepad enabled for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', state);
        return state;
    }

    save_user_gamepad_driver() {
        if (!this.gamepad)
            return; // saving per gp

        localStorage.setItem('gamepad-dri:' + this.client.id_robot
                            + ':' + this.gamepad.id,
                            this.current_driver.id);
        console.log('Saved gamepad driver for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.current_driver.id);
    }

    load_user_gamepad_driver(id_gamepad) {
        let dri = localStorage.getItem('gamepad-dri:' + this.client.id_robot
                                        + ':' + id_gamepad);
        console.log('Loaded gamepad driver for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', dri);
        return dri;
    }

    save_user_driver_config() {
        localStorage.setItem('gamepad-cfg:' + this.client.id_robot
                                + ':' + this.gamepad.id
                                + ':' + this.current_driver.id,
                            JSON.stringify(this.current_driver.config));
        console.log('Saved gamepad config for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'", driver '+this.current_driver.id+':', this.current_driver.config);
    }

    load_user_driver_config(id_gamepad, id_driver) {
        let cfg = localStorage.getItem('gamepad-cfg:' + this.client.id_robot
                                + ':' + id_gamepad
                                + ':' + id_driver);

        if (cfg) {
            try {
                cfg = JSON.parse(cfg);
            }
            catch {
                cfg = null;
            }
        }

        console.log('Loaded gamepad user config for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'", driver '+id_driver+':', cfg);
        return cfg;
    }

    set_default_config() {
        this.current_driver.config = this.current_driver.default_gamepad_config;
        $('#gamepad_config_input').removeClass('err');
        this.config_to_editor();
    }

    set_default_shortcuts() {
        this.shortcuts_config = this.default_shortcuts_config;
        $('#gamepad_shortcuts_input').removeClass('err');
        this.shortcuts_to_editor();
    }

    save_user_shortcuts() {
        localStorage.setItem('gamepad-keys:' + this.client.id_robot
                                + ':' + this.gamepad.id,
                            JSON.stringify(this.shortcuts_config));
        console.log('Saved gamepad shortcuts keys for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.shortcuts_config);
    }

    load_user_shortcuts(id_gamepad) {
        let cfg = localStorage.getItem('gamepad-keys:' + this.client.id_robot
                                        + ':' + id_gamepad);
        if (cfg) {
            try {
                cfg = JSON.parse(cfg);
            }
            catch {
                cfg = null;
            }
        }
        console.log('Loaded gamepad shortcuts keys for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', cfg);
        return cfg;
    }

    run_loop() {

        if (!this.loop_running || !this.current_gamepad || !this.current_gamepad.current_profile) {
            console.log('Gamepad loop stopped')
            this.loop_running = false;
            return;
        }

        let profile = this.current_gamepad.profiles[this.current_gamepad.current_profile];
        let driver = profile.driver_instances[profile.driver];

        if (this.current_gamepad.isTouch) {

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

            // this.debug_out([
            //     this.current_gamepad.axes[0].val,
            //     this.current_gamepad.axes[1].val,
            //     this.current_gamepad.axes[2].val,
            //     this.current_gamepad.axes[3].val
            // ]);           

        } else if (this.current_gamepad.gamepad) {

            const gp = navigator.getGamepads()[this.current_gamepad.gamepad.index];

            for (let i = 0; i < gp.axes.length; i++) {
                driver.axes[i].raw = gp.axes[i];
            }

            // this.debug_out(gp.axes);

        } else {
            console.log('Gamepad loop stopped')
            this.loop_running = false;
            return;
        }

        this.process_axes_input();

        this.update_axes_ui_values();
    
        return window.setTimeout(
            () => { this.run_loop(); },
            this.loop_delay
        );





        // let transmitting = $('#gamepad_enabled').is(':checked');

        if (!this.current_driver || !this.current_driver.config) {
            // wait for init
            return window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
        }

        let msg_type = this.current_driver.msg_type;
        let topic = this.current_driver.config.topic;

        if (!this.client.topic_writers[topic]) {
            this.client.create_writer(topic, msg_type);
        }

        const gp = navigator.getGamepads()[this.gamepad.index];

        let buttons = gp.buttons;
        let axes = gp.axes;

        let axes_debug = {};
        for (let i = 0; i < axes.length; i++) {
            axes_debug[i] = axes[i]
        }

        let buttons_debug = {};
        for (let i = 0; i < buttons.length; i++) {
            buttons_debug[i] = buttons[i].pressed;
        }

        $('#gamepad_debug_input').html('<b>Raw Axes:</b><br><div class="p">' + this.unquote(JSON.stringify(axes_debug, null, 4)) + '</div>' +
                                       '<b>Raw Buttons:</b><br><div class="p">' + this.unquote(JSON.stringify(buttons_debug, null, 4)) + '</div>'
                                       );

        if (this.enabled) {
            let msg = this.current_driver.read(axes, buttons);

            if (this.client.topic_writers[topic].send(msg)) { // true when ready and written
                this.display_output(msg);
            }
        } else if (!this.enabled && $('#gamepad').hasClass('open')) {
            let msg = this.current_driver.read(axes, buttons);
            this.display_output(msg);
        }

        if (this.editor_listening && $("#gamepad_shortcuts_input").is(":focus")) {

            for (let i = 0; i < buttons.length; i++) {

                if (buttons[i] && buttons[i].pressed) {
                    console.log('Btn pressed: '+i+'; last=', this.last_buttons[i])
                }

                if (buttons[i] && buttons[i].pressed && (this.last_buttons[i] == undefined || !this.last_buttons[i])) {

                    this.editor_listening = false;
                    $('#gamepad_shortcuts_listen').removeClass('listening');
                    
                    let pos = document.getElementById("gamepad_shortcuts_input").selectionStart;
                    let curr_val = $('#gamepad_shortcuts_input').val();
                    let insert = ''+i+'';
                    let val = curr_val.slice(0,pos)+insert+curr_val.slice(pos)
                    $('#gamepad_shortcuts_input').val(val);
                    let new_pos = pos+insert.length;
                    
                    document.getElementById('gamepad_shortcuts_input').setSelectionRange(new_pos, new_pos);
                    break;
                }
            }

        } 

        for (let i = 0; i < buttons.length; i++) {
            if (buttons[i] && buttons[i].pressed && !this.last_buttons[i]) {
                if (this.shortcuts_config && this.shortcuts_config[i]) {
                    this.handle_shortcut(this.shortcuts_config[i]);
                }
            }
        }
        this.last_buttons = [];
        for (let i = 0; i < buttons.length; i++) {
            this.last_buttons.push(buttons[i].pressed);
        }
    
        window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
    }

    update_output_info() {
        $('#gamepad_debug_output_label').html(' into '+this.current_driver.config.topic);
        $('#gamepad_debug_output B').html(this.current_driver.msg_type);
    }

    display_output(msg) {
        // this.update_output_info();
        $('#gamepad_debug_output .p').html(this.unquote(JSON.stringify(msg, null, 4)));
    }

    handle_shortcut = (cfg) => {
        console.log('handling gp shortcut', cfg);
        Handle_Shortcut(cfg, this.client);
    }

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






    unquote(str) {
        return str.replace(/"([^"]+)":/g, '$1:')
    }

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

    capture_gamepad_input(buttons, axes) {
        if (!this.capturing_gamepad_input) {
            return;
        }

        let something_pressed = false;
        for (let i = 0; i < buttons.length; i++) {
            if (buttons[i] && buttons[i].pressed) {
                something_pressed = true;
                if (this.captured_gamepad_input.indexOf(i) === -1) {
                    this.captured_gamepad_input.push(i);
                }
            }
        }
        if (something_pressed) {
            for (let i = 0; i < this.captured_gamepad_input.length; i++) {
                let btn = this.captured_gamepad_input[i];
                if (!buttons[btn] || !buttons[btn].pressed) {
                    this.captured_gamepad_input.splice(i, 1);
                    i--;
                }
            }
        }

        $('#current-key').html(this.captured_gamepad_input.join(' + '));
    }


    MarkMappedServiceButtons() {
        if (!this.gamepad_service_mapping)
            return;

        $('.service_button').removeClass('mapped');
        $('.service_button').attr('title');
        for (const [service_name, service_mapping] of Object.entries(this.gamepad_service_mapping)) {
            for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
                console.log('MARKING MAPPED: ', service_name, btn_name, $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]'))
                let btns_print = [];
                for (let i = 0; i < btns_config.btns_cond.length; i++) {
                    let b = btns_config.btns_cond[i];
                    btns_print.push('['+b+']');
                }
                $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]')
                    .addClass('mapped')
                    .attr('title', 'Mapped to gamepad button(s): '+btns_print.join(' + '));
            }
        }
    }

    static SaveGamepadServiceMapping(id_robot) {

        MarkMappedServiceButtons();

        if (typeof(Storage) === "undefined") {
            console.warn('No Web Storage support, cannot save gamepad mapping');
            return;
        }

        let data = [];
        for (const [service_name, service_mapping] of Object.entries(gamepad_service_mapping)) {
            for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
                let service_data = {
                    service_name: service_name,
                    btn_name: btn_name,
                    btns_cond: btns_config.btns_cond
                }
                data.push(service_data);
            }
        }
        let val = JSON.stringify(data);
        localStorage.setItem('gamepad_service_mapping:'+id_robot, val);
        console.log('Saved Gamepad Service Mapping for robot '+id_robot+':', val);
    }

    load_gamepad_service_mapping() {
        if (typeof(Storage) === "undefined") {
            console.warn('No Web Storage support, cannot load gamepad mapping');
            return;
        }

        console.log('Loading Gamepad Service Mapping for robot '+this.client.id_robot+'...');

        this.gamepad_service_mapping = {};
        let json = localStorage.getItem('gamepad_service_mapping:'+this.client.id_robot);
        if (!json)
            return;
        let val = JSON.parse(json);

        for (let i = 0; i < val.length; i++) {
            let service_data = val[i];
            if (!this.gamepad_service_mapping[service_data.service_name])
                this.gamepad_service_mapping[service_data.service_name] = {};
            this.gamepad_service_mapping[service_data.service_name][service_data.btn_name] = {
                btns_cond: service_data.btns_cond,
                needs_reset: false
            };
        }
        console.log('Loaded Gamepad Service Mapping:', val, this.gamepad_service_mapping);
    }

    MapServiceButton(button, id_robot) {

        let service_name = $(button).attr('data-service');
        let btn_name = $(button).attr('data-name');
        console.warn('Mapping '+service_name+' => ' + btn_name +' ...');

        $('#mapping-confirmation').attr('title', 'Mapping '+service_name+':'+btn_name);
        $('#mapping-confirmation').html('Press a gamepad button or combination...<br><br><span id="current-key"></span>');
        this.captured_gamepad_input = [];
        this.capturing_gamepad_input = true;
        $( "#mapping-confirmation" ).dialog({
            resizable: false,
            height: "auto",
            width: 400,
            modal: true,
            buttons: {
              Clear: function() {
                this.captured_gamepad_input = [];
                $('#current-key').html('');
                //$( this ).dialog( "close" );
              },
              Cancel: function() {
                this.capturing_gamepad_input = false;
                $( this ).dialog( "close" );
              },
              Save: function() {
                capturing_gamepad_input = false;
                if (!gamepad_service_mapping[service_name])
                    gamepad_service_mapping[service_name] = {};
                if (!gamepad_service_mapping[service_name][btn_name])
                    gamepad_service_mapping[service_name][btn_name] = { };

                if (captured_gamepad_input.length > 0) {
                    gamepad_service_mapping[service_name][btn_name]['btns_cond'] = captured_gamepad_input;
                    captured_gamepad_input = [];
                    gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;
                } else {
                    delete gamepad_service_mapping[service_name][btn_name];
                    if (Object.keys(gamepad_service_mapping[service_name]).length == 0)
                        delete gamepad_service_mapping[service_name];
                }


                //console.log('Mapping saved: ', gamepad_service_mapping);
                $( this ).dialog( "close" );
                $('#service_controls.setting_shortcuts').removeClass('setting_shortcuts');
                $('#services_gamepad_mapping_toggle').html('[shortcuts]');

                SaveGamepadServiceMapping(id_robot);
              }
            }
        });
    }
}