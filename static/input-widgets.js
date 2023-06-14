let input_widgets = {
    'std_srvs/srv/Empty' : ServiceCallInput_Empty,
    'std_srvs/srv/SetBool' : ServiceCallInput_Bool
}

function ServiceCall(id_robot, service, msg, socket, cb) {
    let req = {
        id_robot: id_robot,
        service: service,
        msg: msg
    }
    console.warn('service request', req);
    socket.emit('service', req, (reply)=> {
        console.log('service reply', reply);
        if (cb)
            cb(reply);
    });
}

function ServiceCallInput_Empty(el, service, id_robot, socket, supported_msg_types) {

    $(el).html('<button class="service_button" id="service_btn_'+service.n+'" data-service="'+service.service+'" data-name="Btn_Call">Call</button>');

    $('#service_btn_'+service.n).click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }

        $('#service_btn_'+service.n).addClass('working');
        let msg = FindMessageType(service.msg_type+'_Request', supported_msg_types);
        console.log('clicked '+service.service, msg);

        ServiceCall(id_robot, service.service, null, socket, () => {
            $('#service_btn_'+service.n).removeClass('working');
        });

    });
}

function ServiceCallInput_Bool(el, service, id_robot, socket, supported_msg_types) {
    $(el).html(
        '<button class="service_button true" id="service_btn_'+service.n+'_true" data-service="'+service.service+'" data-name="Btn_True">True</button>' +
        '<button class="service_button false" id="service_btn_'+service.n+'_false" data-service="'+service.service+'" data-name="Btn_False">False</button>'
    );

    $('#service_btn_'+service.n+'_true').click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }

        $('#service_btn_'+service.n+'_true').addClass('working');
        let msg = FindMessageType(service.msg_type+'_Request', supported_msg_types);
        console.log('true clicked '+service.service, msg);

        ServiceCall(id_robot, service.service, true, socket, () => {
            $('#service_btn_'+service.n+'_true').removeClass('working');
        });
    });
    $('#service_btn_'+service.n+'_false').click((ev)=>{
        if ($('#service_controls').hasClass('setting_shortcuts')) {
            return MapServiceButton(ev.target, id_robot);
        }
        $('#service_btn_'+service.n+'_false').addClass('working');
        let msg = FindMessageType(service.msg_type+'_Request', supported_msg_types);
        console.log('false clicked '+service.service, msg);

        ServiceCall(id_robot, service.service, false, socket, () => {
            $('#service_btn_'+service.n+'_false').removeClass('working');
        });
    });
}