class ServiceInput {
    static MakeMenuControls(target_el, service, client) {};
}

export class UserButtonsServiceInput extends ServiceInput {

    static MakeMenuControls(target_el, service, client, node, node_cont) {

        if (!client.ui.service_btns[service.service])
            client.ui.service_btns[service.service] = [];

        let data_editor_btn = $('<button class="service_button data" title="Set service call data">{}</button>');
        data_editor_btn.click((ev)=>{
            client.ui.service_input_dialog.show(service, node, node_cont);
        });
        target_el.append(data_editor_btn);

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
            target_el.append(btn_el);
        });
    }
}

// std_srvs/srv/Empty and std_srvs/srv/Trigger
export class ServiceInput_Empty extends ServiceInput {

    static MakeMenuControls(target_el, service, client) {
        let btn = $('<button class="service_button blue">Call</button>');
    
        btn.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn, null);
        });
    
        target_el.append(btn);
    }
}
    
// std_srvs/srv/SetBool
export class ServiceInput_Bool extends ServiceInput  {
    
    static MakeMenuControls(target_el, service, client) {
    
        let btn_true = $('<button class="service_button green">True</button>');
        let btn_false = $('<button class="service_button red">False</button>');

        btn_true.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn_true, { data: true });
        });

        btn_false.click((ev)=>{
            client.ui.serviceMenuAutoBtnCall(service.service, btn_false, { data: false });
        });

        target_el.append(btn_true);
        target_el.append(btn_false);
    }
}