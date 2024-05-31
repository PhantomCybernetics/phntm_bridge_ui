class ServiceInput {
    static MakeMenuControls(el, service, client) {};
    static MakeInputConfigControls(btn, on_change_cb) {};
}

export class ServiceInput_Empty extends ServiceInput {

    static MakeMenuControls(el, service, client) {
        let btn = $('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');
    
        btn.click((ev)=>{
            btn.addClass('working');
            client.service_call(service.service, null, () => {
                btn.removeClass('working');
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
            client.service_call(service.service, true, () => {
                btn_true.removeClass('working');
            });
        });

        btn_false.click((ev)=>{
            btn_false.addClass('working');
            client.service_call(service.service, false, () => {
                btn_false.removeClass('working');
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
            // btn_true.addClass('working');
            // client.service_call(service.service, true, () => {
            //     btn_true.removeClass('working');
            // });
        });

        el.append(inp);
        el.append(btn_call);

    }

    static MakeInputConfigControls(btn, on_change_cb) {

        let init_val = btn.ros_srv_val === undefined || btn.ros_srv_val === null ? 0 : btn.ros_srv_val;
        let inp = $('<input type="text" value="'+init_val+'" class="half"/>');
        inp.change((ev)=>{
            let val = parseInt($(ev.target).val());
            on_change_cb(val ? true : false);
        });
        return inp;
    }

}