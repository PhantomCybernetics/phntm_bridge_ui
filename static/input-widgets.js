window.InputWidgets = {}

window.InputWidgets.ServiceCallInput_Empty = (el, service, client) => {

    $(el).html('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');

    $('#service_btn_'+service.n).click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }

        $('#service_btn_'+service.n).addClass('working');


        // let msg = client.find_message_type(service.msg_types[0]+'_Request');
        // console.log('Empty clicked '+service.service, msg);

        client.service_call(service.service, null, () => {
            $('#service_btn_'+service.n).removeClass('working');
        });
    });
}

window.InputWidgets.ServiceCallInput_Bool = (el, service, client) => {
    $(el).html(
        '<button class="service_button true" id="service_btn_'+service.n+'_true" data-service="'+service.service+'" data-name="Btn_True">True</button>' +
        '<button class="service_button false" id="service_btn_'+service.n+'_false" data-service="'+service.service+'" data-name="Btn_False">False</button>'
    );

    $('#service_btn_'+service.n+'_true').click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }

        $('#service_btn_'+service.n+'_true').addClass('working');
        // let msg = client.find_message_type(service.msg_types[0]+'_Request');
        // msg.data = true;
        // console.log('Bool clicked '+service.service, msg);

        client.service_call(service.service, true, () => {
            $('#service_btn_'+service.n+'_true').removeClass('working');
        });
    });

    $('#service_btn_'+service.n+'_false').click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }
        $('#service_btn_'+service.n+'_false').addClass('working');
        // let msg = client.find_message_type(service.msg_types[0]+'_Request');
        // msg.data = false;
        // console.log('Bool clicked '+service.service, msg);

        client.service_call(service.service, false, () => {
            $('#service_btn_'+service.n+'_false').removeClass('working');
        });
    });

}