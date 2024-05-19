export class InputDriver {

    constructor(gamepad_controller) {
        // this.id = id;
        // this.label = label;
        // this.config = null;
        this.gamepad_controller = gamepad_controller;

        this.output_topic = '/user_input'; //override this
        this.output = null;
    }

    set_config(cfg) {
        if (cfg.output_topic)
            this.output_topic = cfg.output_topic;
    }

    get_header() {
        let now_ms = Date.now(); //window.performance.now()
        let sec = Math.floor(now_ms / 1000);
        let nanosec = (now_ms - sec*1000) * 1000000;
        return {
            stamp: {
                sec: sec,
                nanosec: nanosec
            },
            frame_id: 'gamepad'
        }
    }

    // override this for more input config options
    make_cofig_inputs() {
        let lines = [];

        // one output topic by default
        let line_topic = $('<div class="line"><span class="label">Output topic:</span></div>');
        let inp_topic = $('<input type="text" inputmode="url" autocomplete="off" value="' + this.output_topic + '"/>');
        let msg_type_hint = $('<span class="comment">'+this.msg_type+'</span>');
        
        inp_topic.appendTo(line_topic);
        msg_type_hint.appendTo(line_topic);
        
        let that = this;
        inp_topic.change((ev)=>{
            that.output_topic = $(ev.target).val();
            console.log('Driver output topic is: '+that.output_topic);
        });

        lines.push(line_topic);

        return lines;
    }

    transmit() {
        
    }
}