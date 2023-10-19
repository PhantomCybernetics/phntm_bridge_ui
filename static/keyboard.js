export class KeyboardController {

    constructor(client) {

        this.client = client;
        // this.ui = null;

        this.drivers = {}; //id -> driver
        this.default_shortcuts_config = {};
        this.shortcuts_config = null;
        this.last_pressed = [];

        let that = this;

        this.enabled = this.load_keyboard_enabled();
        $('#keyboard_enabled').prop('checked', this.enabled);
        if (this.enabled)
            $('#keyboard').addClass('enabled');
        else
            $('#keyboard').removeClass('enabled');

        $('#keyboard_status').click(() => {
            $('#gamepad').removeClass('on');
            if ($('#keyboard').hasClass('on')) {
                $('#keyboard').removeClass('on');
            } else {
                $('#keyboard').addClass('on');
            }
        });

        $('#keyboard_enabled').change(function(ev) {
            that.enabled = this.checked;
            that.save_keyboard_enabled(that.enabled)
            if (that.enabled) {
                $('#keyboard').addClass('enabled');
            } else {
                $('#keyboard').removeClass('enabled');
            }
        });

    }

    add_driver(id, label, msg_type, driver_class) {

        this.drivers[id] = new driver_class(id, msg_type, label);

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

        return true;
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

}