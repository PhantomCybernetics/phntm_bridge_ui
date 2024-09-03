

class ServiceInput {
    static MakeMenuControls(el, service, client) {};
    static MakeInputConfigControls(btn, on_change_cb) {};
}

export class FallbackServiceInput extends ServiceInput {

    static MakeMenuControls(el, service, client) {

        let last_call_data = client.get_last_srv_call_data(service.service);

        let data_btn = $('<button class="service_button data" title="Set service call data">{}</button>');

        let btns = [];

        if (!btns.length) {
            btns.push({
                label: 'Call',
                color: 'blue',
                value: {}
            });
            btns.push({
                label: 'Two',
                color: 'green',
                value: {}
            });
            btns.push({
                label: 'Three',
                color: 'red',
                value: {}
            });
        }

        data_btn.click((ev)=>{
            client.ui.service_input_dialog.show(service, btns);
        });
        if (last_call_data)
            data_btn.addClass('has-data').text('{msg}');

        // let btn = $('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');
    
        // btn.click((ev)=>{
        //     if (!last_call_data) {
        //         client.ui.service_input_dialog.show(service);
        //         return;
        //     }
        //     btn.addClass('working');
        //     let call_data = {};
        //     client.service_call(service.service, call_data, false, (reply) => {
        //         client.ui.service_reply_notification(btn, service.service, reply);
        //     });
        // });
    
        el.append([ data_btn ]);
    }

    static MakeInputConfigControls() {
        return $('<span class="static_val">{data}</span>');
    }

}

export class ServiceInput_Empty extends ServiceInput {

    static MakeMenuControls(el, service, client) {
        let btn = $('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');
    
        btn.click((ev)=>{
            btn.addClass('working');
            client.service_call(service.service, null, false, (reply) => {
                client.ui.service_reply_notification(btn, service.service, reply);
            });
        });
    
        el.append(btn);
    }

    static MakeInputConfigControls() {
        return $('<span class="static_val">None</span>');
    }

}
    

export class ServiceInput_Bool extends ServiceInput  {
    
    static MakeMenuControls(el, service, client) {
    
        let btn_true = $('<button class="service_button true" id="service_btn_'+service.n+'_true" data-service="'+service.service+'" data-name="Btn_True">True</button>');
        let btn_false = $('<button class="service_button false" id="service_btn_'+service.n+'_false" data-service="'+service.service+'" data-name="Btn_False">False</button>');

        btn_true.click((ev)=>{
            btn_true.addClass('working');
            client.service_call(service.service, { data: true }, false, (reply) => {
                client.ui.service_reply_notification(btn_true, service.service, reply);
            });
        });

        btn_false.click((ev)=>{
            btn_false.addClass('working');
            client.service_call(service.service, { data: false }, false, (reply) => {
                client.ui.service_reply_notification(btn_false, service.service, reply);
            });
        });

        el.append(btn_true);
        el.append(btn_false);

    }

    static MakeInputConfigControls(btn, on_change_cb) {
        let opts = [
            '<option value="1"'+(btn.ros_srv_val?' selected':'')+'>True</option>',
            '<option value="0"'+(!btn.ros_srv_val?' selected':'')+'>False</option>'
        ];
        let inp = $('<select>'+opts.join('')+'</select>');
        inp.change((ev)=>{
            let val = parseInt($(ev.target).val());
            on_change_cb(val ? true : false);
        });
        return inp;
    }

}

export class ServiceInput_Int extends ServiceInput  {
    
    static MakeMenuControls(el, service, client) {
    
        let inp = $('<input type="text" class="service_inp" value="'+'0'+'"/>');
        let btn_call = $('<button class="service_button">Call</button>');

        btn_call.click((ev)=>{
            btn_call.addClass('working');
            let int32_val = parseInt(inp.val());
            client.service_call(service.service, { data: int32_val}, false, (reply) => {
                client.ui.service_reply_notification(btn_call, service.service, reply);
            });
        });

        el.append(inp);
        el.append(btn_call);

    }

    static MakeInputConfigControls(btn, on_change_cb) {

        let init_val = btn.ros_srv_val === undefined || btn.ros_srv_val === null ? 0 : btn.ros_srv_val;
        let inp = $('<input type="text" value="'+init_val+'" class="half"/>');
        inp.change((ev)=>{
            let val = parseInt($(ev.target).val());
            on_change_cb(val);
        });
        return inp;
    }

}