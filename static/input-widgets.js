let input_widgets = {
    'std_srvs/srv/Empty' : ServiceCallInput_Empty,
    'std_srvs/srv/SetBool' : ServiceCallInput_Bool
}


function ServiceCallInput_Empty(el, service, id_robot, socket, supported_msg_types) {

    $(el).html('<button class="service_button" id="service_btn_'+service.n+'">Call</button>');

    $('#service_btn_'+service.n).click(()=>{
        console.log('clicked '+service.service);
    });
}

function ServiceCallInput_Bool(el, service, id_robot, socket, supported_msg_types) {
    $(el).html(
        '<button class="service_button true" id="service_btn_'+service.n+'_true">True</button>' +
        '<button class="service_button false" id="service_btn_'+service.n+'_false">False</button>'
    );

    $('#service_btn_'+service.n+'_true').click(()=>{
        console.log('true clicked '+service.service);
    });
    $('#service_btn_'+service.n+'_false').click(()=>{
        console.log('false clicked '+service.service);
    });
}