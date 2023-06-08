let panelNo = 0;


class Panel {
    topic = null;
    msg_types = [];
    n = ++panelNo;
    msg_type = null;
    msg_reader = null;
    max_height = 0;

    constructor(topic, msg_types, supported_msg_types) {
        this.topic = topic;
        this.msg_types = msg_types;
        console.log('Panel created for '+this.topic)
        this.msg_type = FindMessageType(msg_types[0], supported_msg_types);
        $('#monitors').append(
            '<div class="monitor_panel" data-topic="'+topic+'">' +
            '<h3>'+topic+'</h3>' +
            '<a href="#" id="panel_msg_types_'+this.n+'" class="msg_types" title="Toggle message type definition">'+msg_types.join(', ')+'</a>' +
            '<input type="checkbox" id="update_panel_'+this.n+'" class="panel_update" checked title="Update"/>' +
            '<div class="panel_content" id="panel_content_'+this.n+'">Waiting for data...</div>' +
            '<div class="panel_msg_type'+ (this.msg_type == null ? ' err':'') + '" id="panel_msg_type_'+this.n+'">' +
            (this.msg_type ? JSON.stringify(this.msg_type, null, 2) : 'Message type not loaded!')+
            '</div>' +
            '</div>'
        );

        let that = this;
        $('#panel_msg_types_'+this.n).click(function(ev) {
            console.log('click '+that.n)
            let el = $('#panel_msg_type_'+that.n);
            if (el.css('display') != 'block')
                el.css('display', 'block');
            else if (!el.hasClass('err'))
                el.css('display', 'none');
            ev.cancelBubble = true;
            ev.preventDefault();
        });

        if (this.msg_type != null) {
            let Reader = window.Serialization.MessageReader;
            this.msg_reader = new Reader( [ this.msg_type ].concat(supported_msg_types) );
        }
    }


    OnData(ev) {

        let rawData = ev.data; //arraybuffer

        //let oldh = $('#panel_content_'+this.n).height();
        $('#panel_content_'+this.n).height('auto');
        if (rawData instanceof ArrayBuffer) {

            let datahr = '';
            if (this.msg_reader != null) {
                let v = new DataView(rawData)
                let decoded = this.msg_reader.readMessage(v);
                if (this.msg_types[0] == 'std_msgs/msg/String' && decoded.data) {
                    if (decoded.data.indexOf('xml') !== -1)  {
                        datahr = linkifyURLs(escapeHtml(window.xmlFormatter(decoded.data)), true);
                    } else {
                        datahr = linkifyURLs(escapeHtml(decoded.data));
                    }
                    //console.log(window.xmlFormatter)

                } else {
                    datahr = JSON.stringify(decoded, null, 2);
                }
                //datahr = rawData.
            } else {
                datahr = buf2hex(rawData)
            }

            $('#panel_content_'+this.n).html(
                'Stamp: '+ev.timeStamp + '<br>' +
                rawData+' '+rawData.byteLength+'B'+'<br>' +
                '<br>' +
                datahr
            );

        } else {
            let datahr = ev.data;
            $('#panel_content_'+this.n).html(
                'Stamp: '+ev.timeStamp + '<br>' +
                '<br>' +
                datahr
            );
        }

        let newh = $('#panel_content_'+this.n).height();
        //console.log('max_height='+this.max_height+' newh='+newh);

        if (newh > this.max_height) {
            this.max_height = newh;
        }
        $('#panel_content_'+this.n).height(this.max_height);


    }

    Close() {
        $('.monitor_panel[data-topic="'+this.topic+'"]').remove();
        console.log('Panel closed for '+this.topic)
    }

}