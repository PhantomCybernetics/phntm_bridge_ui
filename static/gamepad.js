import { isIOS } from './lib.js';
import { Handle_Shortcut } from '/static/input-drivers.js';
import * as THREE from 'three';

export class GamepadController {

    constructor(client) {

        this.client = client;

        this.registered_drivers = {}; // id: class 

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

        window.addEventListener('gamepadconnected', (event) => {
            

            if (!that.connected_gamepads[event.gamepad.id]) {
                console.warn('Gamepad connected:', event.gamepad.id, event.gamepad);
                that.connected_gamepads[event.gamepad.id] = {
                    isTouch: false,
                    id: event.gamepad.id,
                    gamepad: event.gamepad,
                    axes: [],
                    buttons: [],
                };
                for (let i = 0; i < event.gamepad.axes.length; i++) {
                    that.connected_gamepads[event.gamepad.id].axes.push({});
                }
                for (let i = 0; i < event.gamepad.buttons.length; i++) {
                    that.connected_gamepads[event.gamepad.id].buttons.push({});
                }
                
            } else {
                that.connected_gamepads[event.gamepad.id].gamepad = event.gamepad;
                console.info('Gamepad already connected:', event.gamepad.id);
            }

            if (that.current_gamepad && that.current_gamepad.isTouch)
                return; //touch ui has priority when on

            that.current_gamepad = that.connected_gamepads[event.gamepad.id];

            that.make_ui();

            if (!that.loop_running) {
                that.loop_running = true;
                that.run_loop();
            }
        });

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

    make_ui() {

        if (!this.current_gamepad) {
            $('#gamepad').removeClass('connected');
            $('#connected-gamepad').html('Gamepad not connected');
            $('#gamepad-axes-panel').html('Waiting for gamepad...');
            $('#gamepad-buttons-panel').html('Waiting for gamepad...');
            $('#gamepad-output-panel').html('{}');
            return;
        }

        $('#gamepad').addClass('connected');
        console.log('Current gamepad is ', this.current_gamepad);

        if (this.current_gamepad.isTouch) {
            $('#connected-gamepad').html('Touch gamepad');
        } else {
            $('#connected-gamepad').html(this.current_gamepad.id);
        }   

        let axes_els = [];
        for (let i = 0; i < this.current_gamepad.axes.length; i++) {

            let row_el = $('<div class="axis-row unused"></div>');

            let val_el = $('<span class="axis-val"></span>');
            val_el.appendTo(row_el);

            //1st line
            let line_1_el = $('<div class="axis-config"></div>');

            let opts = [ '<option value="">Not in use</option>' ];
            opts.push('<option value="linear.x">Linear X</option>');
            opts.push('<option value="linear.x+">Linear X (positive)</option>');
            opts.push('<option value="linear.x-">Linear X (negative)</option>');
            opts.push('<option value="linear.y">Linear Y</option>');
            opts.push('<option value="linear.y+">Linear Y (positive)</option>');
            opts.push('<option value="linear.y-">Linear Y (negative)</option>');
            opts.push('<option value="linear.z">Linear Z</option>');
            opts.push('<option value="linear.z+">Linear Z (positive)</option>');
            opts.push('<option value="linear.z-">Linear Z (negative)</option>');
            opts.push('<option value="angular.x">Angular X</option>');
            opts.push('<option value="angular.y">Angular Y</option>');
            opts.push('<option value="angular.z">Angular Z</option>');
            let assignment_sel_el = $('<select id="">'+opts.join('')+'</select>');
            assignment_sel_el.appendTo(line_1_el);

            assignment_sel_el.change((ev)=>{
                let assign_val = $(ev.target).val();
                console.log(assign_val);
                if (assign_val) {
                    row_el.removeClass('unused');
                } else {
                    row_el.addClass('unused');
                }
            });

            let out_val_el = $('<span class="axis-output-val">0.00</span>');
            out_val_el.appendTo(line_1_el);

            let conf_toggle_el = $('<span class="conf-toggle"></span>');
            conf_toggle_el.appendTo(line_1_el);


            // collapsable
            let config_details_el = $('<div class="axis-config-details"></div>');

            conf_toggle_el.click((ev)=>{
                if (!conf_toggle_el.hasClass('open')) {
                    conf_toggle_el.addClass('open')
                    config_details_el.addClass('open')
                } else {
                    conf_toggle_el.removeClass('open')
                    config_details_el.removeClass('open')
                }
            });

            let dead_zone_min_el = $('<div class="config-row"><span class="label">Dead zone min:</span></div>');
            let dead_zone_min_inp = $('<input type="text" class="inp-val" value="-0.1"/>');
            dead_zone_min_inp.focus((ev)=>{ev.target.select();})
            dead_zone_min_inp.appendTo(dead_zone_min_el);
            dead_zone_min_el.appendTo(config_details_el);

            let dead_zone_max_el = $('<div class="config-row"><span class="label">Dead zone max:</span></div>');
            let dead_zone_max_inp = $('<input type="text" class="inp-val" value="0.1"/>');
            dead_zone_max_inp.focus((ev)=>{ev.target.select();})
            dead_zone_max_inp.appendTo(dead_zone_max_el);
            dead_zone_max_el.appendTo(config_details_el);

            let dead_zone_val_el = $('<div class="config-row"><span class="label">Dead zone value:</span></div>');
            let dead_zone_val_inp = $('<input type="text" class="inp-val" value="0.0"/>');
            dead_zone_val_inp.focus((ev)=>{ev.target.select();})
            dead_zone_val_inp.appendTo(dead_zone_val_el);
            dead_zone_val_el.appendTo(config_details_el);

            let scale_el = $('<div class="config-row"><span class="label">Scale input:</span></div>');
            let scale_inp = $('<input type="text" class="inp-val" value="1.0"/>');
            scale_inp.focus((ev)=>{ev.target.select();})
            scale_inp.appendTo(scale_el);
            dead_zone_val_inp.appendTo(dead_zone_val_el);
            scale_el.appendTo(config_details_el);

            if (!isIOS()) { // safari can't do keyboard with decimals and minus sign => so default it is
                dead_zone_min_inp.attr('inputmode', 'numeric');
                dead_zone_max_inp.attr('inputmode', 'numeric');
                dead_zone_val_inp.attr('inputmode', 'numeric');
                scale_inp.attr('inputmode', 'numeric');
            }

            line_1_el.appendTo(row_el);
            config_details_el.appendTo(row_el);

            axes_els.push(row_el);

            this.current_gamepad.axes[i].val_el = val_el;
            this.current_gamepad.axes[i].out_val_el = out_val_el;
        }

        $('#gamepad-axes-panel')
            .empty()
            .append(axes_els);

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
        
        for (let i = 0; i < this.current_gamepad.axes.length; i++) {
            // if (this.current_gamepad.axes[i].val === undefined) {
            //     return;
            // }
            let val = this.current_gamepad.axes[i].val;
            let val_el = this.current_gamepad.axes[i].val_el;
            val_el.html(val.toFixed(2));
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

    select_profile(id_profile) {

        if (!this.drivers[id_driver]) {
            console.error('Gamepad driver not found: '+id_driver)
            return false;
        }

        console.info('Setting driver to ', id_driver);
        this.current_driver = this.drivers[id_driver];

        this.config_to_editor();
        this.update_output_info();

        this.disable_kb_on_conflict();

        return true;
    }

    set_touch(state) {
        

        if (state) {
            console.log('Gamepad in touch mode')

            if (!this.connected_gamepads['touch']) {
                this.connected_gamepads['touch'] = {
                    isTouch: true,
                    id: 'touch',
                    axes: [ {}, {}, {}, {} ],
                    buttons: [ {}, {} ]
                }
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
            console.log('Gamepad touch mode off')

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

    
    debug_out(val) {
        let html = JSON.stringify(val, null, 4);
        $('#gamepad-output-panel').html(html);
    }

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

        if (!this.loop_running || !this.current_gamepad) {
            console.log('Gamepad loop stopped')
            this.loop_running = false;
            return;
        }

        if (this.current_gamepad.isTouch) {

            
            if (this.last_touch_input['left']) {
                this.current_gamepad.axes[0].val = this.last_touch_input['left'].x;
                this.current_gamepad.axes[1].val = this.last_touch_input['left'].y;
            } else {
                this.current_gamepad.axes[0].val = 0.0;
                this.current_gamepad.axes[1].val = 0.0;
            }
            if (this.last_touch_input['right']) {
                this.current_gamepad.axes[2].val = this.last_touch_input['right'].x;
                this.current_gamepad.axes[3].val = this.last_touch_input['right'].y;
            } else {
                this.current_gamepad.axes[2].val = 0.0;
                this.current_gamepad.axes[3].val = 0.0;
            }

            this.debug_out([
                this.current_gamepad.axes[0].val,
                this.current_gamepad.axes[1].val,
                this.current_gamepad.axes[2].val,
                this.current_gamepad.axes[3].val
            ]);

            this.update_axes_ui_values();

        } else if (this.current_gamepad.gamepad) {

            const gp = navigator.getGamepads()[this.current_gamepad.gamepad.index];

            for (let i = 0; i < gp.axes.length; i++) {
                this.current_gamepad.axes[i].val = gp.axes[i];
            }

            this.debug_out(gp.axes);

            this.update_axes_ui_values();

        }

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