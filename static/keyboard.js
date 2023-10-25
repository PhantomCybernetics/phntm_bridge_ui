export class KeyboardController {

    constructor(client) {

        this.client = client;
        // this.ui = null;

        this.drivers = {}; //id -> driver
        this.default_shortcuts_config = {};
        this.shortcuts_config = null;
        this.last_pressed = [];
        this.editor_listening = false;

        this.loop_delay = 33.3; //ms, 30Hz updates

        let that = this;

        this.driver_to_select = this.load_driver();
        this.pressed_keys = {};

        this.enabled = this.load_keyboard_enabled();
        $('#keyboard_enabled').prop('checked', this.enabled);
        if (this.enabled) {
            $('#keyboard').addClass('enabled');
            this.run_loop();
        } else
            $('#keyboard').removeClass('enabled');

        $('#keyboard_status').click(() => {
            $('#gamepad').removeClass('on');
            if ($('#keyboard').hasClass('on')) {
                $('#keyboard').removeClass('on');
            } else {
                $('#keyboard').addClass('on');
            }
        });

        let shortcuts = this.load_shortcuts();
        if (shortcuts)
            this.shortcuts_config = shortcuts;
        else
            this.shortcuts_config = this.default_shortcuts_config;
        this.shortcuts_to_editor();

        document.addEventListener('keydown', (ev) => this._key_down_monitor(ev));
        document.addEventListener('keyup', (ev) => this._key_up_monitor(ev));
        window.addEventListener("blur", (event) => {
            // console.warn('Window lost focus');
            this.pressed_keys = {};
            this.update_input_ui();
        });

        $('#kb_config_input').on('focus', (ev) => {
            // console.warn('Editor focused');
            this.pressed_keys = {};
            this.update_input_ui();
        });

        $('#keyboard_enabled').change(function(ev) {
            let was_enabled = that.enabled;
            that.enabled = this.checked;
            that.save_keyboard_enabled(that.enabled)
            if (that.enabled) {
                $('#keyboard').addClass('enabled');
                if (!was_enabled) {
                    that.run_loop();
                }
            } else {
                $('#keyboard').removeClass('enabled');
            }
        });

        $('#keyboard_driver').change((ev) => {
            if (that.select_driver($(ev.target).val())) {
                that.save_driver();
            }
        });

        $('#kb_config_toggle').click(() =>{
            if ($('#keyboard_debug').hasClass('config')) {
                //disable config edit
                $('#keyboard_debug').removeClass('config');
                $('#kb_config_toggle').text('Config');
                $('#kb_shortcuts_toggle').css('display', 'inline');
            } else {
                //enable config edit
                $('#keyboard_debug').addClass('config');
                $('#kb_config_toggle').text('Close editor');
                $('#kb_shortcuts_toggle').css('display', 'none')
            }
        });

        $('#kb_shortcuts_toggle').click(() =>{
            if ($('#keyboard_debug').hasClass('shortcuts')) {
                //disable mapping edit
                $('#keyboard_debug').removeClass('shortcuts');
                $('#kb_shortcuts_toggle').text('Key mapping');
                $('#kb_config_toggle').css('display', 'inline');
                $('#keyboard_debug_output').css('display', 'block');
            } else {
                //enable mapping edit
                $('#keyboard_debug').addClass('shortcuts');
                $('#kb_shortcuts_toggle').text('Close mapping');
                $('#kb_config_toggle').css('display', 'none');
                $('#keyboard_debug_output').css('display', 'none');
            }
        });

        $('#kb_shortcuts_listen, #kb_config_listen').click((ev) => {
            if (!$(ev.target).hasClass('listening')) {
                $(ev.target).addClass('listening');
                that.editor_listening = true;

                if ($('#keyboard_debug').hasClass('shortcuts'))
                    $('#kb_shortcuts_input').focus();
                else
                    $('#kb_config_input').focus();

            } else {
                $(ev.target).removeClass('listening');
                that.editor_listening = false;
            }
        });

        $('#kb_shortcuts_cancel').click((ev) => {
            $('#kb_shortcuts_toggle').click();
        });

        $('#kb_config_cancel').click((ev) => {
            $('#kb_config_toggle').click();
        });

        $('#kb_config_default').click((ev) => {
            that.set_default_config();
        });

        $('#kb_shortcuts_default').click((ev) => {
            that.set_default_shortcuts();
        });

        $('#kb_config_apply').click((ev) => {
            that.parse_driver_config();
        });

        $('#kb_config_save').click((ev) => {
            if (that.parse_driver_config()) {
                that.save_driver_config();
            }
        });

        $('#kb_shortcuts_apply').click((ev) => {
            that.parse_shortcuts_config();
        });

        $('#kb_shortcuts_save').click((ev) => {
            if (that.parse_shortcuts_config()) {
                that.save_shortcuts();
            }
        });

    }

    _key_down_monitor(ev) {

        // console.log('dw', ev);
        // if (!this.editor_listening && ($("#kb_config_input").is(":focus") || $("#kb_shortcuts_input").is(":focus")))
        //     return;

        if($('#kb_shortcuts_input').is(':focus') || $('#kb_config_input').is(':focus')
          || $('#gamepad_shortcuts_input').is(':focus') || $('#gamepad_config_input').is(':focus')) {
            if (this.editor_listening) {
                $('#kb_config_listen').removeClass('listening');
                $('#kb_shortcuts_listen').removeClass('listening');
                this.editor_listening = false;

                let inp = "kb_shortcuts_input";
                if ($('#kb_config_input').is(':focus'))
                    inp = "kb_config_input";

                let pos = document.getElementById(inp).selectionStart;
                let curr_val = $('#'+inp).val();
                let insert = ''+ev.code+'';
                let val = curr_val.slice(0,pos)+insert+curr_val.slice(pos)
                $('#'+inp).val(val);
                let new_pos = pos+insert.length;
                document.getElementById(inp).setSelectionRange(new_pos, new_pos);
                // document.getElementById(inp).selectionEnd = document.getElementById(inp).selectionStart;
                ev.preventDefault();
                return;
            } else {
                //ognore here
                return;
            }
        }

        // if (this.shortcuts_config[ev.code]) {
        //     if (this.shortcuts_config[ev.code].mod) {
        //         console.log('Mod expected', ev);
        //     } else {
        //         console.log('No mod', ev);
        //     }
        //     // this.handle_shortcut(this.shortcuts_config[shortcut]);
        // }

        if (this.shortcuts_config && Object.keys(this.shortcuts_config).length > 0) {
            let shortcuts = Object.keys(this.shortcuts_config);
            shortcuts.forEach((shortcut) => {

                let keys = shortcut.split('_');

                if (ev.code == keys[0]) {

                    if (keys.length > 1) {
                        let mod = keys[1]
                        switch (mod.toLowerCase()) {
                            case 'alt': if (!ev.altKey) return; break;
                            case 'ctrl': if (!ev.ctrlKey) return; break;
                            case 'meta': if (!ev.metaKey) return; break;
                            case 'shift': if (!ev.shiftKey) return; break;
                        }
                    } else if (ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey){
                        //ensure no modifiers
                        return;
                    }

                    // console.log(ev);
                    this.handle_shortcut(this.shortcuts_config[shortcut]);
                    // if ()

                }

                // if (this.pressed_keys[key]) {

                //     if (this.pressed_keys[key].mod) {

                //     } else {
                //         //
                //     }

                //     //
                // }

            });
        }

        if (!this.pressed_keys[ev.code]) {

            this.pressed_keys[ev.code] = Date.now();
            this.update_input_ui();

            if (!this.enabled && this.current_driver) {
                let msg = this.current_driver.read_keyboard(this.pressed_keys);
                this.display_output(msg);
            }
        }

    }

    handle_shortcut(cfg) {
        console.log('handling shortcut', cfg);
        if (typeof cfg == 'string') {
            if (cfg[0] == '#') {
                //click UI element
                console.log('Kb clicking '+cfg);
                $(cfg).click()
            }
        } else if (cfg['service']) {
            let data = cfg['value'] ? cfg['value'] : null;
            console.log('Kb calling service '+cfg['service']+' with data: ', data);
            this.client.service_call(cfg['service'], data);
        }
    }

    _key_up_monitor(ev) {

        // console.log('up', ev);

        if (this.pressed_keys[ev.code]) {
            delete this.pressed_keys[ev.code]
            this.update_input_ui();

            if (!this.enabled && this.current_driver) {
                let msg = this.current_driver.read_keyboard(this.pressed_keys);
                this.display_output(msg);
            }
        }
    }

    set_default_config() {
        this.current_driver.config = this.current_driver.default_keyboard_config;
        $('#kb_config_input').removeClass('err');
        this.config_to_editor();
    }

    set_default_shortcuts() {
        this.shortcuts_config = this.default_shortcuts_config;
        $('#kb_shortcuts_input').removeClass('err');
        this.shortcuts_to_editor();
    }

    update_input_ui() {
        let keys_debug = {};
        Object.keys(this.pressed_keys).forEach((key)=>{
            // if (this.enabled) {
            //     let t = Date.now()- this.pressed_keys[key];
            //     keys_debug[key] = t;
            // } else {
            keys_debug[key] = true;
            // }
        });
        $('#keyboard_debug_input .p').html(
           this.unquote(JSON.stringify(keys_debug, null, 4))
        );
    }

    run_loop() {

        if (!this.enabled) {
            console.log('Keyboard loop stopped')
            // document.removeEventListener('keydown', this._key_down_monitor);
            // document.removeEventListener('keyup', this._key_up_monitor);
            return;
        }

        this.update_input_ui();

        if (!this.current_driver || this.client.supported_msg_types === null) { //wait for msg types
            window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
            return;
        }

        let msg_type = this.current_driver.msg_type;
        let topic = this.current_driver.config.topic;

        if (!this.client.topic_writers[topic]) {
            this.client.create_writer(topic, msg_type);
        }

        let msg = this.current_driver.read_keyboard(this.pressed_keys);
        if (this.client.topic_writers[topic].send(msg)) { // true when ready and written
            this.display_output(msg)
        }
        // console.log('Kb loop yo');

        window.setTimeout(() => { this.run_loop(); }, this.loop_delay);
    }

    add_driver(id_driver, label, msg_type, driver_class) {

        this.drivers[id_driver] = new driver_class(id_driver, msg_type, label);

        let cfg = this.load_driver_config(id_driver);
        if (cfg)
            this.drivers[id_driver].config = cfg;
        else
            this.drivers[id_driver].config = this.drivers[id_driver].default_keyboard_config;

        if (!this.driver_to_select)
            this.driver_to_select = id_driver; //select first

        if (this.driver_to_select == id_driver) {
            this.select_driver(id_driver);
        }

        this.update_ui();
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
        $('#keyboard_driver').html(opts.join("\n"));
    }



    select_driver(id_driver) {

        if (!this.drivers[id_driver]) {
            console.error('Gamepad driver not found: '+id_driver)
            return false;
        }

        console.info('Setting driver to ', id_driver);
        this.current_driver = this.drivers[id_driver];

        this.config_to_editor();

        this.display_output(this.current_driver.read_keyboard(this.pressed_keys));

        return true;
    }

    display_output(msg) {
        $('#keyboard_debug_output').html('<b>'+this.current_driver.msg_type+' -> '+this.current_driver.config.topic+'</b><br><div class="p">' + this.unquote(JSON.stringify(msg, null, 4))+'</div>');
    }

    save_driver() {
        localStorage.setItem('kb-gamepad-dri:' + this.client.id_robot, this.current_driver.id);
        console.log('Saved keyboard driver for robot '+this.client.id_robot+':', this.current_driver.id);
    }

    load_driver() {
        let dri = localStorage.getItem('kb-gamepad-dri:' + this.client.id_robot);
        console.log('Loaded keyboard driver for robot '+this.client.id_robot+':', dri);
        return dri;
    }

    unquote(str) {
        return str.replace(/"([^"]+)":/g, '$1:')
    }

    config_to_editor() {
        let cfg = JSON.stringify(this.current_driver.config, null, 4);
        cfg = this.unquote(cfg);
        $('#kb_config_input').val(cfg);
    }

    shortcuts_to_editor() {
        let cfg = JSON.stringify(this.shortcuts_config, null, 4);
        cfg = this.unquote(cfg);
        $('#kb_shortcuts_input').val(cfg);
    }

    parse_driver_config() {
        try {
            let src = $('#kb_config_input').val();
            src = src.replace("\n","")
            let config = null;
            eval('config = '+src);
            console.log('Parsed config: ', config);
            $('#kb_config_input').removeClass('err');

            this.current_driver.config = config;
            return true;
        } catch (error) {
            $('#kb_config_input').addClass('err');
            console.log('Error parsing JSON config', error);
            return false;
        }

    }

    parse_shortcuts_config() {
        try {
            let src = $('#kb_shortcuts_input').val();
            src = src.replace("\n","")
            let config = null;
            eval('config = '+src);
            console.log('Parsed keyboard shortcuts config: ', config);
            $('#kb_shortcuts_input').removeClass('err');

            this.shortcuts_config = config;
            return true;
        } catch (error) {
            $('#kb_shortcuts_input').addClass('err');
            console.log('Error parsing keyboard JSON shortcuts config', error);
            return false;
        }
    }

    save_keyboard_enabled(state) {
        localStorage.setItem('kb-enabled:' + this.client.id_robot, state);
        console.log('Saved keyboard enabled for robot '+this.client.id_robot+':', state);
    }

    load_keyboard_enabled() {
        let state = localStorage.getItem('kb-enabled:' + this.client.id_robot);

        state = state === 'true';
        console.log('Loaded keyboard enabled for robot '+this.client.id_robot+':', state);
        return state;
    }

    save_driver_config() {
        localStorage.setItem('kb-driver-cfg:' + this.client.id_robot + ':' + this.current_driver.id,
                            JSON.stringify(this.current_driver.config));
        console.log('Saved keyboard driver config for robot '+this.client.id_robot+', driver '+this.current_driver.id+':', this.current_driver.config);
    }

    load_driver_config(id_driver) {
        let cfg = localStorage.getItem('kb-driver-cfg:' + this.client.id_robot
                                        + ':' + id_driver);

        if (cfg) {
            try {
                cfg = JSON.parse(cfg);
            }
            catch {
                cfg = null;
            }
        }

        console.log('Loaded keyboard driver config for robot '+this.client.id_robot+', driver '+id_driver+':', cfg);
        return cfg;
    }

    save_shortcuts() {
        localStorage.setItem('kb-keys:' + this.client.id_robot,
                            JSON.stringify(this.shortcuts_config));
        console.log('Saved keyboard shortcuts keys for robot '+this.client.id_robot+':', this.shortcuts_config);
    }

    load_shortcuts() {
        let cfg = localStorage.getItem('kb-keys:' + this.client.id_robot);
        if (cfg) {
            try {
                cfg = JSON.parse(cfg);
            }
            catch {
                cfg = null;
            }
        }
        console.log('Loaded keybaord shortcuts keys for robot '+this.client.id_robot+':', cfg);
        return cfg;
    }

}