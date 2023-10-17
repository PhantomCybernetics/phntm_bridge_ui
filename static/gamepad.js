
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

    constructor(client, axes_config) {

        this.client = client;
        // this.ui = null;

        this.drivers = [];

        this.writers = {} // by topic
        this.msg_classes = {} // by msg type
        this.msg_writers = {} // by msg type

        // this.msg_writers[this.twist_stamped_msg_type] = new Writer( [ this.twist_stamped_msg_class ].concat(supported_msg_types) );

        this.loop_delay = 33.3; //ms, 30Hz updates

        this.id_gamepad = null;
        this.capturing_gamepad_input = false;
        this.captured_gamepad_input = [];
        this.gamepad_service_mapping = {}

        this.axes_config = axes_config ? axes_config : {};

        this.load_gamepad_service_mapping(); // from cookie

        let that = this;
        window.addEventListener('gamepadconnected', (event) => {
            console.warn('Gamepad connected:', event.gamepad);
            that.id_gamepad = event.gamepad.index;

            $('#gamepad').addClass('connected');

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
            if (that.id_gamepad == event.gamepad.index) {
                that.id_gamepad = null; //kills the loop
                console.warn('Gamepad disconnected:', event.gamepad);
                $('#gamepad').removeClass('connected');
            }
        });


    }

    add_driver(label, topic, msg_type, handler, is_default) {
        this.drivers.push({
            label: label,
            topic: topic,
            msg_type: msg_type,
            handler: handler,
            is_default: is_default
        });
        console.warn('Registered gamepad driver: '+label+' '+topic+' '+msg_type);
        this.update_ui();
    }

    update_ui() {
        let opts = [];
        for (let i = 0; i < this.drivers.length; i++) {
            let d = this.drivers[i];
            opts.push(
                '<option value="'+i+'"'+(d['is_default'] ? ' selected="selected"' : '')+'>' +
                d['label'] +
                '</option>')
        }
        $('#gamepad_driver').html(opts.join("\n"));
    }

    run_loop() {

        if (this.id_gamepad == null) {
            console.log('Gamepad loop failed, this=', this)
            return; //stop loop
        }

        // console.log('Gamepad loop running')

        let id_driver = $('#gamepad_driver').val();
        let transmitting = $('#gamepad_enabled').is(':checked');

        if (!this.drivers[id_driver]) {
            console.warn('Gamepad has no driver, waiting...');
            return window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
        }

        let msg_type = this.drivers[id_driver].msg_type;
        let topic = this.drivers[id_driver].topic;

        if (!this.writers[topic]) {
            this.writers[topic] = this.client.create_writer(topic, msg_type);
            if (!this.writers[topic])
                return window.setTimeout(this.run_loop, this.loop_delay); //try again
        }

        const gp = navigator.getGamepads()[this.id_gamepad];

        let buttons = gp.buttons;
        let axes = gp.axes;

        // console.log(now)

        let msg = this.drivers[id_driver]['handler'](this, axes, buttons);

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

        $('#gamepad_debug_input').html('<b>Axes raw:</b><br>' + JSON.stringify(debug.axis, null, 2) + '<br><br>' +
                                       '<b>Btns raw:</b><br>' + JSON.stringify(debug.buttons, null, 2));

        if (this.capturing_gamepad_input) {
            this.capture_gamepad_input(buttons, axes);
        } else  if (transmitting) {
            if (this.writers[topic].send(msg)) { // true when ready and written
                $('#gamepad_debug_output').html('<b>'+msg_type+' -> '+topic+'</b><br>' + JSON.stringify(msg, null, 2));
            }
        }

        if (this.gamepad_service_mapping) {
            for (const [service_name, service_mapping] of Object.entries(this.gamepad_service_mapping)) {
                //let  = gamepad_service_mapping[service_name];
                for (const [btn_name, btns_config] of Object.entries(service_mapping)) {
                    //let  = gamepad_service_mapping[service_name][btn_name];
                    //console.log('btns_cond', btns_cond)
                    let btns_cond = btns_config.btns_cond;
                    let num_pressed = 0;
                    for (let i = 0; i < btns_cond.length; i++) {
                        let b = btns_cond[i];
                        if (buttons[b] && buttons[b].pressed)
                            num_pressed++;
                    }
                    if (btns_cond.length && num_pressed == btns_cond.length) {
                        if (!btns_config['needs_reset']) {

                            let btn_el = $('.service_button[data-service="'+service_name+'"][data-name="'+btn_name+'"]');

                            if (btn_el.length) {
                                console.warn('Triggering '+service_name+' btn '+btn_name+' ('+num_pressed+' pressed)', btns_cond);
                                btn_el.click();
                            } else {
                                console.log('Not triggering '+service_name+' btn '+btn_name+'; btn not found (service not discovered yet?)');
                            }
                            this.gamepad_service_mapping[service_name][btn_name]['needs_reset'] = true;

                        }
                    } else if (btns_config['needs_reset']) {
                        this.gamepad_service_mapping[service_name][btn_name]['needs_reset'] = false;
                    }
                }
                // if (buttons[service.btn_id].pressed) {
                //     ServiceCall(window.gamepadController.id_robot, service_name, service.msg, window.gamepadController.socket);
                // }
            }
        }

        window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
    }


    init_writer (topic, msg_type) {



        this.dcs[topic] = this.client.create_dc(topic);

        return this.dcs[topic];
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
    }



    clearProducers() {
        for (const topic of Object.keys(this.dcs)) {
            if (this.dcs[topic])
                this.dcs[topic].close();
        }
        this.dcs = {}
    }




    lerp(a, b, alpha) {
        return a + alpha * (b-a)
    }

    apply_axis_deadzone(val, id_axis) {
        if (this.axes_config[id_axis] && this.axes_config[id_axis]['dead_zone']
            && val > this.axes_config[id_axis]['dead_zone'][0] && val < this.axes_config[id_axis]['dead_zone'][1]
        )
            return this.axes_config[id_axis]['dead_zone'][2] // return dead val

        return val;
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