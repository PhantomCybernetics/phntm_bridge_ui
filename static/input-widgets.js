

export function ServiceCallInput_Empty (el, service, client) {
    let btn = $('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');

    btn.click((ev)=>{
        btn.addClass('working');
        client.service_call(service.service, null, () => {
            btn.removeClass('working');
        });
    });

    el.append(btn);
}

export function ServiceCallInput_Bool (el, service, client) {
    
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