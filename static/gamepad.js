import { Handle_Shortcut } from '/static/input-drivers.js';

export class GamepadController {

    constructor(client) {

        this.client = client;

        this.registered_drivers = {}; // id: class 

        this.drivers = {}; //id -> driver
        this.default_shortcuts_config = {};
        this.shortcuts_config = null;
        this.last_buttons = [];
        this.editor_listening = false;

        this.gamepad = null;
        this.capturing_gamepad_input = false;
        this.captured_gamepad_input = [];
        this.gamepad_service_mapping = {}
        this.last_gp_loaded = null;
        this.loop_delay = 33.3; // ms, 30Hz updates

        this.initiated = false;
        this.enabled = false; 
        this.loop_running = false;
        $('#gamepad_enabled').prop('checked', this.enabled);

        this.touch_gamepad = false;
        this.last_touch_input = {};

        let that = this;

        client.on('gp_config', (gp_drivers, gp_defaults)=>{
            console.warn('GP GOT CONFIG driver=['+gp_drivers.join(', ')+'] defaults:', gp_defaults);

            let default_driver = null;

            // init drivers enabled by the robot
            gp_drivers.forEach((id_driver)=>{
                if (that.drivers[id_driver])
                    return; //only once

                if (default_driver === null)
                    default_driver = id_driver; //first is default

                console.warn('Setting up gp driver '+id_driver);

                let instance_driver = id_driver;
                let default_cfg = (gp_defaults && gp_defaults.drivers && gp_defaults.drivers[id_driver] ? gp_defaults.drivers[id_driver] : null);
                if (default_cfg && default_cfg['driver']) // ignoring user's override
                    instance_driver = default_cfg['driver'];
                let driver_class = that.registered_drivers[instance_driver];
                if (!driver_class) {
                    console.error('Gp driver '+instance_driver+' not found (did you register it first?)');
                    return;
                }
                let label = instance_driver;
                if (default_cfg && default_cfg['label'])
                    label = default_cfg['label'];
                that.drivers[id_driver] = new driver_class(id_driver, label);
                if (default_cfg) {
                    that.drivers[id_driver].default_gamepad_config = default_cfg;
                }
                that.drivers[id_driver].config = that.drivers[id_driver].default_gamepad_config; // overriden by user's gp settings (loaded on GP connect)
            });

            if (gp_defaults && gp_defaults.shortcuts) {
                that.default_shortcuts_config = gp_defaults.shortcuts;
            }
            if (!that.initiated) {
                that.shortcuts_config = that.default_shortcuts_config; // overriden by user's gp settings (loaded on GP connect)

                console.log('Gamepad setting driver to default '+default_driver);
                that.select_driver(default_driver);
            }
                
            if (that.gamepad) {
                that.init_gamepad();
            } else { // init without loading gp config
                that.shortcuts_to_editor();
                that.update_ui();
            }

            that.initiated = true;
        });

        $('#gamepad_status').click(() => {
            if (!that.initiated)
                return; //wait 
            $('#keyboard').removeClass('open');
            if ($('#gamepad').hasClass('open')) {
                $('#gamepad').removeClass('open');
            } else {
                $('#gamepad').addClass('open');
            }
        });

        window.addEventListener('gamepadconnected', (event) => {
            console.warn('Gamepad connected:', event.gamepad.id);
            that.gamepad = event.gamepad;

            $('#gamepad').addClass('connected');
            $('#gamepad_id').html(' / ' + that.gamepad.id);

            that.init_gamepad();
            that.client.ui.update_layout();
        });

        const gps = navigator.getGamepads();
        console.log('Conected gamepads: ', gps);

        window.addEventListener('gamepaddisconnected', (event) => {
            if (that.gamepad.id == event.gamepad.id) {
                that.gamepad = null; //kills the loop
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad_id').html('');
                $('#gamepad').removeClass('connected');
                that.client.ui.update_layout();
            }
        });

        $('#gamepad_config_toggle').click(() =>{
            if ($('#gamepad_debug').hasClass('config')) {
                //disable config edit
                $('#gamepad_debug').removeClass('config');
                $('#gamepad_config_toggle').removeClass('close');
                $('#gamepad_settings h3').removeClass('config');
            } else {
                //enable config edit
                $('#gamepad_debug').removeClass('shortcuts');
                $('#gamepad_debug').addClass('config');

                $('#gamepad_settings h3').removeClass('shortcuts');
                $('#gamepad_settings h3').addClass('config');
                
                $('#gamepad_shortcuts_toggle').removeClass('close');
                $('#gamepad_config_toggle').addClass('close');
            
                $('#gamepad_debug_output').css('display', 'block');
            }
        });

        $('#gamepad_shortcuts_toggle').click(() =>{
            if ($('#gamepad_debug').hasClass('shortcuts')) {
                //disable mapping edit
                $('#gamepad_debug').removeClass('shortcuts');
                $('#gamepad_shortcuts_toggle').removeClass('close')
                $('#gamepad_debug_output').css('display', 'block');
                $('#gamepad_settings h3').removeClass('shortcuts');
            } else {
                //enable mapping edit
                $('#gamepad_debug').removeClass('config');
                $('#gamepad_debug').addClass('shortcuts');

                $('#gamepad_settings h3').removeClass('config');
                $('#gamepad_settings h3').addClass('shortcuts');
                
                $('#gamepad_config_toggle').removeClass('close');
                $('#gamepad_shortcuts_toggle').addClass('close');

                $('#gamepad_debug_output').css('display', 'none');
            }
        });

        $('#gamepad_driver').change((ev) => {
            if (that.select_driver($(ev.target).val())) {
                that.save_user_gamepad_driver();
            }
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
    }

    init_gamepad() {

        if (!this.gamepad)
            return;

        let was_enabled = this.enabled;

        let enabled_drivers = Object.keys(this.drivers);
        if (!enabled_drivers.length)
            return;

        if (this.last_gp_loaded != this.gamepad.id) { 
            // only load once for a gp (so we don't overwrite user's config on reconnects)
            this.last_gp_loaded = this.gamepad.id; 

            enabled_drivers.forEach((id_driver)=>{
                let user_driver_cfg = this.load_user_driver_config(this.gamepad.id, id_driver);
                if (user_driver_cfg) {
                    this.drivers[id_driver].config = user_driver_cfg;
                    if (user_driver_cfg['label'])
                        this.drivers[id_driver].label = user_driver_cfg['label'];
                }
            });
    
            let user_default_driver = this.load_user_gamepad_driver(this.gamepad.id);
            if (user_default_driver && this.drivers[user_default_driver]) {
                this.select_driver(user_default_driver);
            }

            let user_shortcuts = this.load_user_shortcuts(this.gamepad.id);
            if (user_shortcuts)
                this.shortcuts_config = user_shortcuts;
            
            this.enabled = this.load_user_gamepad_enabled(this.gamepad.id);
        }
        
        this.shortcuts_to_editor();
        this.update_ui();

        $('#gamepad_enabled').prop('checked', this.enabled);
        if (this.enabled) {
            $('#gamepad').addClass('enabled');
        } else {
            $('#gamepad').removeClass('enabled');
        }

        let that = this;
        if (!this.loop_running) {
            this.loop_running = true;
            this.client.when_message_types_loaded(()=>{
                that.run_loop();
            });
        }
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

    update_ui() {
        let opts = [];
        Object.keys(this.drivers).forEach((id_driver) => {
            let label = this.drivers[id_driver].label;
            let selected = this.current_driver == this.drivers[id_driver];
            opts.push(
                '<option value="'+id_driver+'"'+(selected ? ' selected="selected"' : '')+'>' +
                this.drivers[id_driver].label +
                '</option>')
        })
        $('#gamepad_driver').html(opts.join("\n"));
    }

    select_driver(id_driver) {

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
        this.touch_gamepad = state;
       
        if (state) {
            console.log('Gamepad in touch mode')
            $('#gamepad').addClass('connected');
        } else {
            console.log('Gamepad touch mode off')
            $('#gamepad').removeClass('connected');
        }
        this.enabled = state;
    }

    
    touch_input(where, value, angle) {
        console.log('Touch GP '+where+' val='+value+'; a='+angle.toFixed(2));
        if (value)
            this.last_touch_input[where] = [ value, angle ];
        else
            delete this.last_touch_input[where];
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

        if (this.gamepad === null) {
            this.loop_running = false;
        }

        if (!this.loop_running) {
            console.log('Gamepad loop stopped')
            return;
        }

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