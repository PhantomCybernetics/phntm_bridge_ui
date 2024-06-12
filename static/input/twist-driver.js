import { InputDriver } from './base-driver.js'

export class TwistInputDriver extends InputDriver {

    msg_type = 'geometry_msgs/msg/Twist';

    static axes = {
        'linear.x': 'Twist: Linear X',
        'linear.y': 'Twist: Linear Y',
        'linear.z': 'Twist: Linear Z',
        'angular.x': 'Twist: Angular X',
        'angular.y': 'Twist: Angular Y',
        'angular.z': 'Twist: Angular Z',
    }

    get_axes() {
        return TwistInputDriver.axes;
    }

    set_config(cfg) {
       
        if (cfg.stamped) {
            this.msg_type = 'geometry_msgs/msg/TwistStamped';
        } else {
            this.msg_type = 'geometry_msgs/msg/Twist';
        }

        super.set_config(cfg);
    }

    get_config() {
        let cfg = super.get_config();

        cfg.stamped = this.msg_type == 'geometry_msgs/msg/TwistStamped';

        return cfg;
    }

    make_cofig_inputs() {
        let lines = []

        // one output topic by default
        let line_msg_type = $('<div class="line"><span class="label">Type:</span></div>');
        let opts = [];
        [ 'geometry_msgs/msg/Twist', 'geometry_msgs/msg/TwistStamped' ].forEach((one_type)=>{
            opts.push('<option value="'+one_type+'"'+(this.msg_type==one_type?' selected':'')+'>'+one_type+'</option>',)
        });
        let inp_msg_type = $('<select>'+opts.join()+'</select>');
        
        inp_msg_type.appendTo(line_msg_type);
        
        let that = this;
        inp_msg_type.change((ev)=>{
            that.msg_type = $(ev.target).val();
            console.log('Driver msg type is: '+that.msg_type);
            that.setup_writer();
            that.input_manager.check_controller_profile_saved(that.input_manager.edited_controller, that.input_manager.current_profile);
            that.input_manager.make_controller_driver_config_ui(); // redraw
        });

        lines.push(line_msg_type);

        // one output topic 
        let line_topic = $('<div class="line"><span class="label">Output topic:</span></div>');
        this.inp_topic = $('<input type="text" inputmode="url" autocomplete="off" value="' + this.output_topic + '"/>');
        this.inp_topic.appendTo(line_topic);
        this.inp_topic.change((ev)=>{
            that.output_topic = $(ev.target).val();
            console.log('Driver output topic is: '+that.output_topic);
            that.setup_writer();
            that.input_manager.check_controller_profile_saved(that.input_manager.edited_controller, that.input_manager.current_profile);
        });

        lines.push(line_topic);

        this.error_label = $('<span class="driver-error"></span>');
        lines.push(this.error_label);

        this.handle_error_message();

        return lines;
    }

    generate() {
        // geometry_msgs/msg/Twist
        let msg = {
            "linear": {
                "x": 0,
                "y": 0,
                "z": 0
            },
            "angular": {
                "x": 0,
                "y": 0,
                "z": 0,
            }
        }

        Object.keys(msg).forEach ((grp) => {
            Object.keys(msg[grp]).forEach((axis) => {
                let id_axis = grp+'.'+axis;
                if (!this.axes_output || !this.axes_output[id_axis])
                    return;
                msg[grp][axis] = this.axes_output[id_axis];
            });
        });

        if (this.msg_type == 'geometry_msgs/msg/TwistStamped') {
            msg = {
                header: this.get_header(),
                twist: msg
            }
        }
        
        this.output = msg;
        return this.output;
    }
}