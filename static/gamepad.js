
// browser => joy remapping
// const id_dead_man_switch_btn = 4; //will send this as true
// const browser2joy_mapping = {
//     //local btn => send as
//     buttons: {
//         9: 7, // fast mode
//         7: 5  // slow mode
//     },
//     //local axis => [ send_as, scale_factor ]
//     axes: {
//         // linear x (fw/back)
//         1 : [ 1, 1.0],

//         // left right steer
//         0 : [ 0, 1.0 ],

//         // strife w mecanum wheels
//         2 : [ 2, -1.0]
//     }
// }

export class GamepadController {

    constructor(client) {

        this.client = client;
        // this.ui = null;

        this.drivers = {}; //id -> driver
        this.default_shortcuts_config = {};
        this.shortcuts_config = null;
        this.last_buttons = [];
        this.editor_listening = false;
        // this.writers = {} // by topic
        //this.msg_classes = {} // by msg type
        //this.msg_writers = {} // by msg type

        // this.msg_writers[this.twist_stamped_msg_type] = new Writer( [ this.twist_stamped_msg_class ].concat(supported_msg_types) );

        this.loop_delay = 33.3; //ms, 30Hz updates

        this.gamepad = null;
        this.capturing_gamepad_input = false;
        this.captured_gamepad_input = [];
        this.gamepad_service_mapping = {}

        // this.axes_config = axes_config ? axes_config : {};

        // this.load_gamepad_service_mapping(); // from cookie

        let that = this;

        window.addEventListener('gamepadconnected', (event) => {
            console.warn('Gamepad connected:', event.gamepad.id);
            that.gamepad = event.gamepad;

            $('#gamepad').addClass('connected');
            $('#gamepad_id').html(that.gamepad.id);

            let enabled = that.load_gamepad_enabled(that.gamepad.id);
            $('#gamepad_enabled').prop('checked', enabled);
            if (enabled) {
                $('#gamepad').addClass('enabled');
            } else {
                $('#gamepad').removeClass('enabled');
            }

            Object.keys(that.drivers).forEach((id_driver)=>{
                if (that.drivers[id_driver].config !== null) {
                    return; //only load once
                }
                let cfg = that.load_driver_config(that.gamepad.id, id_driver);
                if (cfg)
                    that.drivers[id_driver].config = cfg;
                else
                    that.drivers[id_driver].config = that.drivers[id_driver].default_config;
            });

            let dri = that.load_gamepad_driver(that.gamepad.id);
            if (dri && that.drivers[dri]) {
                that.select_driver(dri);
            } else if (Object.keys(that.drivers).length > 0) {
                dri = Object.keys(that.drivers)[0]
                console.log('Gamepad defaulting to '+dri);
                that.select_driver(dri);
            }

            if (that.shortcuts_config == null) {
                let shortcuts = that.load_shortcuts(that.gamepad.id);
                if (shortcuts) {
                    that.shortcuts_config = shortcuts;
                } else {
                    that.shortcuts_config = that.default_shortcuts_config;
                }
                this.shortcuts_to_editor();
            }

            that.update_ui();

            if (that.client.supported_msg_types === null) {
                //wait for message defs to load
                console.log('Gamepad loop delayed')
                that.client.once('message_types_loaded', () => {
                    console.log('message_types_loaded');
                    that.run_loop();
                });
            } else {
                that.run_loop();
            }
        });

        window.addEventListener('gamepaddisconnected', (event) => {
            if (that.gamepad.id == event.gamepad.id) {
                that.gamepad = null; //kills the loop
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad').removeClass('connected');
            }
        });

        $('#gamepad_config_toggle').click(() =>{
            if ($('#gamepad_debug').hasClass('config')) {
                //disable config edit
                $('#gamepad_debug').removeClass('config');
                $('#gamepad_config_toggle').text('Config');
                $('#gamepad_config_save').css('display', 'none');
                $('#gamepad_config_default').css('display', 'none');
                $('#gamepad_shortcuts_toggle').css('display', 'inline');
            } else {
                //enable config edit
                $('#gamepad_debug').addClass('config');
                $('#gamepad_config_toggle').text('Close editor');
                $('#gamepad_config_save').css('display', 'inline');
                $('#gamepad_config_default').css('display', 'inline');
                $('#gamepad_shortcuts_toggle').css('display', 'none')
            }
        });

        $('#gamepad_shortcuts_toggle').click(() =>{
            if ($('#gamepad_debug').hasClass('shortcuts')) {
                //disable mapping edit
                $('#gamepad_debug').removeClass('shortcuts');
                $('#gamepad_shortcuts_toggle').text('Key mapping');
                $('#gamepad_config_toggle').css('display', 'inline');
            } else {
                //enable mapping edit
                $('#gamepad_debug').addClass('shortcuts');
                $('#gamepad_shortcuts_toggle').text('Close mapping');
                $('#gamepad_config_toggle').css('display', 'none')
            }
        });

        $('#gamepad_status').click(() => {
            $('#keyboard').removeClass('on');
            if ($('#gamepad').hasClass('on')) {
                $('#gamepad').removeClass('on');
            } else {
                $('#gamepad').addClass('on');
            }
        });

        $('#gamepad_driver').change((ev) => {
            if (that.select_driver($(ev.target).val())) {
                that.save_gamepad_driver();
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
                that.save_driver_config();
            }
        });

        $('#gamepad_enabled').change(function(ev) {
            let enabled = this.checked;
            that.save_gamepad_enabled(enabled)
            if (enabled) {
                $('#gamepad').addClass('enabled');
            } else {
                $('#gamepad').removeClass('enabled');
            }
        });

        $('#gamepad_shortcuts_listen').click((ev) => {
            if (!$('#gamepad_shortcuts_listen').hasClass('listening')) {
                $('#gamepad_shortcuts_listen').addClass('listening');
                that.editor_listening = true;
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
                that.save_shortcuts();
            }
        });
    }

    add_driver(id, label, msg_type, driver_class) {

        this.drivers[id] = new driver_class(id, msg_type, label);

        // let topic = this.drivers[id].config.topic;
        // console.warn('Registered gamepad driver: '+label+' '+topic+' '+msg_type);
        // this.update_ui();
    }

    update_ui() {
        let opts = [];
        Object.keys(this.drivers).forEach((id) => {
            let label = this.drivers[id].label;
            let selected = this.current_driver == this.drivers[id];
            opts.push(
                '<option value="'+id+'"'+(selected ? ' selected="selected"' : '')+'>' +
                this.drivers[id].label +
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

        return true;
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

    save_gamepad_enabled(state) {
        localStorage.setItem('gamepad-enabled:' + this.client.id_robot
                            + ':' + this.gamepad.id,
                            state);
        console.log('Saved gamepad enabled for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', state);
    }

    load_gamepad_enabled(id_gamepad) {
        let state = localStorage.getItem('gamepad-enabled:' + this.client.id_robot
                                        + ':' + id_gamepad);

        state = state === 'true';
        console.log('Loaded gamepad enabled for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', state);
        return state;
    }

    save_gamepad_driver() {
        localStorage.setItem('gamepad-dri:' + this.client.id_robot
                            + ':' + this.gamepad.id,
                            this.current_driver.id);
        console.log('Saved gamepad driver for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.current_driver.id);
    }

    load_gamepad_driver(id_gamepad) {
        let dri = localStorage.getItem('gamepad-dri:' + this.client.id_robot
                                        + ':' + id_gamepad);
        console.log('Loaded gamepad driver for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'":', dri);
        return dri;
    }

    save_driver_config() {
        localStorage.setItem('gamepad-cfg:' + this.client.id_robot
                                + ':' + this.gamepad.id
                                + ':' + this.current_driver.id,
                            JSON.stringify(this.current_driver.config));
        console.log('Saved gamepad config for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'", driver '+this.current_driver.id+':', this.current_driver.config);
    }

    load_driver_config(id_gamepad, id_driver) {
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

        console.log('Loaded gamepad config for robot '+this.client.id_robot+', gamepad "'+id_gamepad+'", driver '+id_driver+':', cfg);
        return cfg;
    }

    set_default_config() {
        this.current_driver.config = this.current_driver.default_config;
        $('#gamepad_config_input').removeClass('err');
        this.config_to_editor();
    }

    set_default_shortcuts() {
        this.shortcuts_config = this.default_shortcuts_config;
        $('#gamepad_shortcuts_input').removeClass('err');
        this.shortcuts_to_editor();
    }

    save_shortcuts() {
        localStorage.setItem('gamepad-keys:' + this.client.id_robot
                                + ':' + this.gamepad.id,
                            JSON.stringify(this.shortcuts_config));
        console.log('Saved gamepad shortcuts keys for robot '+this.client.id_robot+', gamepad "'+this.gamepad.id+'":', this.shortcuts_config);
    }

    load_shortcuts(id_gamepad) {
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

        if (this.gamepad == null) {
            console.log('Gamepad loop stopped')
            return;
        }

        let transmitting = $('#gamepad_enabled').is(':checked');

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

        // console.log(now)

        let msg = this.current_driver.read(this, axes, buttons);

        let debug = {
            buttons: {},
            axis: {}
        }
        for (let i = 0; i < axes.length; i++) {
            debug.axis[i] = axes[i];
        }
        for (let i = 0; i < buttons.length; i++) {
            debug.buttons[i] = buttons[i].pressed;
        }

        $('#gamepad_debug_input').html('<b>Raw Axes:</b><br><div class="p">' + this.unquote(JSON.stringify(debug.axis, null, 4)) + '</div>' +
                                       '<b>Raw Buttons:</b><br><div class="p">' + this.unquote(JSON.stringify(debug.buttons, null, 4)) + '</div>'
                                       );

        // if (this.capturing_gamepad_input) {
            // this.capture_gamepad_input(buttons, axes);
        // } else
        if (transmitting) {
            if (this.client.topic_writers[topic].send(msg)) { // true when ready and written
                $('#gamepad_debug_output').html('<b>'+msg_type+' -> '+topic+'</b><br><div class="p">' + this.unquote(JSON.stringify(msg, null, 4))+'</div>');
            }
        }

        if (this.editor_listening && $("#gamepad_shortcuts_input").is(":focus")) {

            for (let i = 0; i < buttons.length; i++) {
                if (buttons[i] && buttons[i].pressed && (!this.last_buttons[i] || !this.last_buttons[i].pressed)) {

                    this.editor_listening = false;
                    $('#gamepad_shortcuts_listen').removeClass('listening');

                    let pos = document.getElementById("gamepad_shortcuts_input").selectionStart;
                    let curr_val = $('#gamepad_shortcuts_input').val();
                    let insert = ''+i+': {}';
                    let val = curr_val.slice(0,pos)+insert+curr_val.slice(pos)
                    $('#gamepad_shortcuts_input').val(val);

                    break;
                    // let curr_val = $('#gamepad_shortcuts_input').val();
                    // let pos_start = curr_val.indexOf('{');
                    // let pos_end = curr_val.lastIndexOf('}');
                    // let line = '    '+i+': "#ui_element_to_click"\n}';
                    // let empty = pos_end-pos_start == 1;
                    // curr_val = curr_val.substr(0, empty?pos_end:pos_end-1) + (empty?'':',') + '\n' + line
                    //$('#gamepad_shortcuts_input').val(curr_val);

                }
            }

        } else if (transmitting) {

            for (let i = 0; i < buttons.length; i++) {
                if (buttons[i] && buttons[i].pressed && (!this.last_buttons[i] || !this.last_buttons[i].pressed)) {
                    if (this.shortcuts_config && this.shortcuts_config[i]) {
                        this.handle_shortcut(this.shortcuts_config[i]);
                    }
                }
            }

        }
        this.last_buttons = buttons;

        // if (this.gamepad_service_mapping) {
        //     for (const [service_name, service_mapping] of Object.entries(this.gamepad_service_mapping)) {
        //         //let  = gamepad_service_mapping[service_name];
        //         for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
        //             //let  = gamepad_service_mapping[service_name][btn_name];
        //             //console.log('btns_cond', btns_cond)
        //             let btns_cond = btns_config.btns_cond;
        //             let num_pressed = 0;
        //             for (let i = 0; i < btns_cond.length; i++) {
        //                 let b = btns_cond[i];
        //                 if (buttons[b] && buttons[b].pressed)
        //                     num_pressed++;
        //             }
        //             if (btns_cond.length && num_pressed == btns_cond.length) {
        //                 if (!btns_config['needs_reset']) {

        //                     let btn_el = $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]');

        //                     if (btn_el.length) {
        //                         console.warn('Triggering '+service_name+' btn '+btn_name+' ('+num_pressed+' pressed)', btns_cond);
        //                         btn_el.click();
        //                     } else {
        //                         console.log('Not triggering '+service_name+' btn '+btn_name+'; btn not found (service not discovered yet?)');
        //                     }
        //                     this.gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;

        //                 }
        //             } else if (btns_config['needs_reset']) {
        //                 this.gamepad_service_mapping[service_name][btn_name]['needs_reset'] = false;
        //             }
        //         }
        //         // if (buttons[service.btn_id].pressed) {
        //         //     ServiceCall(window.gamepadController.id_robot, service_name, service.msg, window.gamepadController.socket);
        //         // }
        //     }
        // }

        window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
    }

    handle_shortcut(cfg) {
        console.log('handling shortcut', cfg);
        if (typeof cfg == 'string') {
            if (cfg[0] == '#') {
                //click UI element
                console.log('Gamepad clicking '+cfg);
                $(cfg).click()
            }
        } else if (cfg['service']) {
            let data = cfg['value'] ? cfg['value'] : null;
            console.log('Gamepad calling service '+cfg['service']+' with data: ', data);
            this.client.service_call(cfg['service'], data);
        }
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