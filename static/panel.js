let panelNo = 0;


class Panel {
    topic = null;
    msg_types = [];
    n = ++panelNo;
    msg_type = null;
    msg_reader = null;
    max_height = 0;

    chart = null;
    chart_trace = [];
    max_trace_length = 100;

    grid_widget = null;

    initiated = false;
    resize_event_handler = null;
    //const event = new Event("build");

    constructor(topic, msg_types, w, h, x = null, y = null) {
        this.topic = topic;
        console.log('Panel created for '+this.topic)

        let display_source = false;

        let html =
            '<div class="monitor_panel" data-topic="'+topic+'">' +
                '<h3>'+topic+'</h3>' +
                '<a href="#" id="panel_msg_types_'+this.n+'" class="msg_types" title="Toggle message type definition"></a>' +
                '<input type="checkbox" id="update_panel_'+this.n+'" class="panel_update" checked title="Update"/>' +
                '<label for="display_panel_source_'+this.n+'" class="display_panel_source_label" id="display_panel_source_label_'+this.n+'"><input type="checkbox" id="display_panel_source_'+this.n+'" class="panel_display_source"'+(display_source?' checked':'')+' title="Display source data">Source</label>' +
                '<div class="panel_widget" id="panel_widget_'+this.n+'"></div>' +
                '<div class="panel_content" id="panel_content_'+this.n+'">Waiting for data...</div>' +
                '<div class="cleaner"></div>' +
                '<div class="panel_msg_type" id="panel_msg_type_'+this.n+'"></div>' +
            '</div>'

        let opts = {w: w, h:h, content: html};
        if (x != null && x != undefined) opts.x = x;
        if (y != null && y != undefined) opts.y = y;
        this.grid_widget = grid.addWidget(opts);

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

        $('#display_panel_source_'+this.n).change(function(ev) {
            let el = $('#panel_content_'+that.n);
            let widget = $('#panel_widget_'+that.n);
            if ($(this).prop('checked')) {
                el.addClass('enabled');
                widget.addClass('content_enabled');
            } else {
                el.removeClass('enabled');
                widget.removeClass('content_enabled');
            }
        });

        if (msg_types)
            this.Init(msg_types)
    }

    Init(msg_types) {

        if (this.initiated)
            return;
        this.initiated = true;

        this.msg_types = msg_types;
        this.msg_type = msg_types ? FindMessageType(msg_types[0], supported_msg_types) : null;
        $('#panel_msg_types_'+this.n).html(msg_types ? msg_types.join(', ') : '');
        $('#panel_msg_type_'+this.n).html((this.msg_type ? JSON.stringify(this.msg_type, null, 2) : 'Message type not loaded!'));

        if (this.msg_type == null && msg_types != null)
            $('#panel_msg_type_'+this.n).addClass('err');

        if (this.msg_type != null) {
            let Reader = window.Serialization.MessageReader;
            this.msg_reader = new Reader( [ this.msg_type ].concat(supported_msg_types) );
        }

        let hasWidget = (panel_widgets[this.msg_types[0]] != undefined);

        if (hasWidget) {
            $('#display_panel_source_label_'+this.n).addClass('enabled');
        } else {
            $('#panel_content_'+this.n).addClass('enabled');
        }

        this.OnResize();
    }

    OnResize() {
        // let h = $('#panel_content_'+this.n).parent().parent('.grid-stack-item-content').innerHeight();
        // let t = $('#panel_content_'+this.n).position().top;
        // let pt = parseInt($('#panel_content_'+this.n).css('padding-top'));
        // let pb = parseInt($('#panel_content_'+this.n).css('padding-bottom'));
        // let mt = parseInt($('#panel_content_'+this.n).css('margin-top'));
        // let mb = parseInt($('#panel_content_'+this.n).css('margin-bottom'));
        // console.log('resize ', h, t, pt, pb, mt, mb)
        //$('#panel_content_'+this.n).css('height', h-t-pt-pb-mt-mb);

       if (this.resize_event_handler != null)
           this.resize_event_handler();
    }

    OnData(ev) {

        let rawData = ev.data; //arraybuffer
        let decoded = null;

        //let oldh = $('#panel_content_'+this.n).height();
        //$('#panel_content_'+this.n).height('auto');
        if (rawData instanceof ArrayBuffer) {

            let datahr = '';
            if (this.msg_reader != null) {
                let v = new DataView(rawData)
                decoded = this.msg_reader.readMessage(v);
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

            if (panel_widgets[this.msg_types[0]])
                panel_widgets[this.msg_types[0]].widget(this, decoded);


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
        //$('#panel_content_'+this.n).height(this.max_height);


    }

    Close() {
        $('.monitor_panel[data-topic="'+this.topic+'"]').remove();
        console.log('Panel closed for '+this.topic)
    }

}