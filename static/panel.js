let panelNo = 0;


class Panel {
    topic = null;
    id_stream = null;
    msg_types = [];
    n = ++panelNo;
    msg_type = null;
    msg_reader = null;
    max_height = 0;

    chart = null;
    chart_trace = [];
    max_trace_length = 100;
    zoom = 1;

    grid_widget = null;

    initiated = false;
    resize_event_handler = null;
    //const event = new Event("build");

    //widget_opts = {};

    constructor(topic, msg_types, w, h, x = null, y = null, src_visible = false) {
        this.topic = topic;
        console.log('Panel created for '+this.topic)

        //let display_source = false;

        let html =
            '<div class="monitor_panel" data-topic="'+topic+'">' +
                '<h3>'+topic+'</h3>' +
                '<div class="monitor_menu">' +
                    '<div class="hover_keeper"></div>' +
                    '<div class="monitor_menu_content" id="monitor_menu_content_'+this.n+'">' +
                        '<div class="menu_line panel_msg_types_line"><a href="#" id="panel_msg_types_'+this.n+'" class="msg_types" title="Toggle message type definition"></a></div>' +
                        '<div class="menu_line"><label for="update_panel_'+this.n+'" class="update_panel_label" id="update_panel_label_'+this.n+'"><input type="checkbox" id="update_panel_'+this.n+'" class="panel_update" checked title="Update"/> Update panel</label></div>' +
                        '<div class="menu_line" id="display_panel_source_link_'+this.n+'" style="display:none"><label for="display_panel_source_'+this.n+'" class="display_panel_source_label" id="display_panel_source_label_'+this.n+'"><input type="checkbox" id="display_panel_source_'+this.n+'" class="panel_display_source"'+(src_visible?' checked':'')+' title="Display source data"> Show source data</label></div>' +
                        '<div class="menu_line"><a href="#" id="close_panel_link_'+this.n+'">Close</a></div>' +
                    '</div>' +
                '</div>' +
                '<div class="panel_widget'+(src_visible?' content_enabled':'')+'" id="panel_widget_'+this.n+'"></div>' +
                '<div class="panel_content'+(src_visible?' enabled':'')+'" id="panel_content_'+this.n+'">Waiting for data...</div>' +
                '<div class="cleaner"></div>' +
                //'<div class="panel_msg_type" id="panel_msg_type_'+this.n+'"></div>' +
            '</div>'

        let widget_opts = {w: w, h:h, content: html};
        if (x != null && x != undefined) widget_opts.x = x;
        if (y != null && y != undefined) widget_opts.y = y;
        this.grid_widget = grid.addWidget(widget_opts);

        let that = this;
        $('#panel_msg_types_'+this.n).click(function(ev) {

            $('#msg_type-dialog').attr('title', that.msg_types[0]);
            $('#msg_type-dialog').html((that.msg_type ? JSON.stringify(that.msg_type, null, 2) : '<span class="error">Message type not loaded!</span>'));
            $( "#msg_type-dialog" ).dialog({
                resizable: true,
                height: 700,
                width: 500,
                modal: true,
                buttons: {
                    Okay: function() {
                        $(this).dialog( "close" );
                    },
                }
            });

            ev.cancelBubble = true;
            ev.preventDefault();
        });

        let source_el = $('#panel_content_'+this.n);
        let widget_el = $('#panel_widget_'+this.n);
        $('#display_panel_source_'+this.n).change(function(ev) {
            if ($(this).prop('checked')) {
                source_el.addClass('enabled');
                widget_el.addClass('content_enabled');

                let w = parseInt($(that.grid_widget).attr('gs-w'))*2;
                console.log('grid cell opts w=', w);
                grid.update(that.grid_widget, {w : w});
                that.OnResize();
            } else {
                source_el.removeClass('enabled');
                widget_el.removeClass('content_enabled');

                let w = Math.floor(parseInt($(that.grid_widget).attr('gs-w'))/2);
                console.log('grid cell opts w=', w);
                grid.update(that.grid_widget, {w : w});
                that.OnResize();
            }
        });



        $('#close_panel_link_'+this.n).click(function(ev) {
            /*console.log('click '+that.n)
            let el = $('#panel_msg_type_'+that.n);
            if (el.css('display') != 'block')
                el.css('display', 'block');
            else if (!el.hasClass('err'))
                el.css('display', 'none');
                */
            if ($('.topic[data-topic="'+topic+'"] INPUT:checkbox').length > 0) {
                $('.topic[data-topic="'+topic+'"] INPUT:checkbox').click();
            } else { //topics not loaded
                TogglePanel(topic, false);
            }


            //that.Close();
            //delete panels[that.topic];


            ev.cancelBubble = true;
            ev.preventDefault();
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

        if (this.msg_type == null && msg_types != null) {
            $('#panel_msg_types_'+this.n).addClass('err');
            $('#panel_content_'+this.n).html('<span class="error">Message type '+ msg_types.join(', ')+' not loaded</span>');
        }

        if (this.msg_type != null) {
            let Reader = window.Serialization.MessageReader;
            this.msg_reader = new Reader( [ this.msg_type ].concat(supported_msg_types) );
        }

        let hasWidget = (panel_widgets[this.msg_types[0]] != undefined);
        let is_image = msg_types[0] == 'sensor_msgs/msg/Image'

        if (is_image) {
            console.log('making video el')
            $('#panel_widget_'+this.n)
                .addClass('enabled video')
                .html('<video id="panel_video_'+this.n+'" autoplay="true" playsinline="true" muted></video>'
                    + '<span id="video_stats_'+this.n+'" class="video_stats"></span>'
                    + '<span id="video_fps_'+this.n+'" class="video_fps"></span>'
                    ); //muted allows video autoplay in chrome before user interactions

            let that = this;

            //fps menu toggle
            $('<div class="menu_line"><label for="video_fps_cb_'+this.n+'" class="video_fps_cb_label" id="video_fps_cb_label_'+this.n+'">'
                +'<input type="checkbox" id="video_fps_cb_'+this.n+'" checked class="video_fps_cb" title="Display video FPS"> FPS</label></div>'
                ).insertBefore($('#close_panel_link_'+this.n).parent());
            $('#video_fps_cb_'+this.n).change(function(ev) {
                if ($(this).prop('checked')) {
                    $('#video_fps_'+that.n).addClass('enabled');
                } else {
                    $('#video_fps_'+that.n).removeClass('enabled');
                }
            });
            $('#video_fps_'+that.n).addClass('enabled'); //on by default

            //stats menu toggle
            $('<div class="menu_line"><label for="video_stats_cb_'+this.n+'" class="video_stats_cb_label" id="video_stats_cb_label_'+this.n+'">'
                +'<input type="checkbox" id="video_stats_cb_'+this.n+'" class="video_stats_cb" title="Display video stats"> Stats for nerds</label></div>'
                ).insertBefore($('#close_panel_link_'+this.n).parent());
            $('#video_stats_cb_'+this.n).change(function(ev) {
                if ($(this).prop('checked')) {
                    $('#video_stats_'+that.n).addClass('enabled');
                } else {
                    $('#video_stats_'+that.n).removeClass('enabled');
                }
            });
        }
        else if (hasWidget) {
            $('#display_panel_source_link_'+this.n).css('display', 'block');
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

            if (panel_widgets[this.msg_types[0]] && panel_widgets[this.msg_types[0]].widget)
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
        let x = parseInt($(this.grid_widget).attr('gs-x'));
        let y = parseInt($(this.grid_widget).attr('gs-y'));

        grid.removeWidget(this.grid_widget);

        $('.monitor_panel[data-topic="'+this.topic+'"]').remove();
        console.log('Panel closed for '+this.topic)
    }



}