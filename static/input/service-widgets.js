

class ServiceInput {
    static MakeMenuControls(el, service, client) {};
    static MakeInputConfigControls(btn, on_change_cb) {};
}

export class FallbackServiceInput extends ServiceInput {

    static MakeMenuControls(el, service, client, node, node_cont) {

        if (!client.ui.service_btns[service.service])
            client.ui.service_btns[service.service] = [];

        let data_editor_btn = $('<button class="service_button data" title="Set service call data">{}</button>');
        data_editor_btn.click((ev)=>{
            client.ui.service_input_dialog.show(service, node, node_cont);
        });
        el.append(data_editor_btn);

        let btns = client.ui.service_btns[service.service];
        btns.sort((a, b)=>{
            return a.sort_index - b.sort_index;
        })
        btns.forEach((btn) => {
            let btn_val_hr = JSON.stringify(btn.value, null, 2).replaceAll("\n", '&#10;').replaceAll('"', '&quot;');
            let btn_el = $('<button class="service_button '+btn.color+'" title="'+btn_val_hr+'">'+btn.label+'</button>');
            btn_el.click((ev)=>{
                client.ui.serviceMenuBtnCall(service.service, btn, btn_el);
            });
            el.append(btn_el);
        });
    }

    static MakeInputConfigControls() {
        return $('<span class="static_val">{data}</span>');
    }

}

// std_srvs/srv/Empty & std_srvs/srv/Trigger
export class ServiceInput_Empty extends ServiceInput {

    static MakeMenuControls(el, service, client) {
        let btn = $('<button class="service_button blue">Call</button>');
    
        btn.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn, null);
        });
    
        el.append(btn);
    }

    static MakeInputConfigControls() {
        return $('<span class="static_val">None</span>');
    }

}
    
// std_srvs/srv/SetBool
export class ServiceInput_Bool extends ServiceInput  {
    
    static MakeMenuControls(el, service, client) {
    
        let btn_true = $('<button class="service_button green">True</button>');
        let btn_false = $('<button class="service_button red">False</button>');

        btn_true.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn_true, { data: true });
        });

        btn_false.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn_false, { data: false });
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