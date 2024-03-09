import { BatteryStateWidget } from '/static/widgets/battery.js';
import { OccupancyGrid } from '/static/widgets/occupacy-grid.js';
import { VideoWidget } from '/static/widgets/video.js';
import { RangeWidget } from '/static/widgets/range.js';
import { LaserScanWidget } from '/static/widgets/laser-scan.js';
import { ImuWidget } from '/static/widgets/imu.js';
import { LogWidget } from '/static/widgets/log.js';
import { GraphMenu } from '/static/graph-menu.js';

import { ServiceCallInput_Empty, ServiceCallInput_Bool } from './input-widgets.js'

import { lerpColor, linkifyURLs, escapeHtml } from "./lib.js";

class Panel {

    ui = null;

    id_source = null;
    id_stream = null;
    msg_type = null; //str
    msg_type_class = null;

    static PANEL_NO = 0;

    // msg_reader = null;
    max_height = 0;

    display_widget = null;
    data_trace = [];
    widget_menu_cb = null;

    graph_menu = null;

    max_trace_length = 100;
    zoom = null;
    default_zoom = 1;

    grid_widget = null;

    initiated = false;
    init_data = null;
    resize_event_handler = null;
    src_visible = false;
    //const event = new Event("build");

    constructor(id_source, ui, w, h, x=null, y=null, src_visible=false, zoom, custom_url_vars) {
        this.ui = ui;
        let panels = ui.panels;
        let grid = ui.grid;

        this.id_source = id_source;
        this.src_visible = src_visible;
        this.paused = false;
        this.zoom = zoom;
        this.custom_url_vars = custom_url_vars;
        console.log('Panel created for '+this.id_source + ' src_visible='+this.src_visible)

        this.n = Panel.PANEL_NO++;
        //let display_source = false;

        let html =
            '<div class="grid_panel" data-source="'+id_source+'">' +
                '<h3 class="panel-title" id="panel_title_'+this.n+'" title="'+id_source+'">'+id_source+'</h3>' +
                '<span class="notes"></span>' +
                '<div class="monitor_menu" id="monitor_menu_'+this.n+'">' +
                    '<div class="monitor_menu_content" id="monitor_menu_content_'+this.n+'"></div>' +
                '</div>' +
                '<div class="panel_content_space">' +
                    '<div class="panel_widget'+(this.src_visible?' source_visible':'')+'" id="panel_widget_'+this.n+'"></div>' +
                    '<div class="panel_source'+(this.src_visible?' enabled':'')+'" id="panel_source_'+this.n+'">Waiting for data...</div>' +
                    '<div class="cleaner"></div>' +
                '</div>' +
                //'<div class="panel_msg_type" id="panel_msg_type_'+this.n+'"></div>' +
            '</div>'

        let widget_opts = {w: w, h:h, content: html};
        if (x != null && x != undefined) widget_opts.x = x;
        if (y != null && y != undefined) widget_opts.y = y;

        if (x == null && y == null) {
            x = 0;
            y = 0;
            // let cols = $('#grid-stack').attr('gs-column');
            // console.error('Cols='+cols)
            for (let _x = 0; _x < 12-w; _x++) {
                if (grid.isAreaEmpty(_x, y, w, h)) {
                    x = _x;
                    // console.log('Grid area empty at ['+x+'; '+y+'] for '+w+'x'+h+']');
                    break;
                }
            }
            widget_opts.x = x;
            widget_opts.y = y;
        }
        panels[id_source] = this;

        this.grid_widget = grid.addWidget(widget_opts);

        this.ui.client.on(id_source, this._on_data_context_wrapper);

        window.setTimeout(()=>{
            panels[id_source].onResize()
        }, 300); // resize at the end of the animation
    }

    // init with message type when it's known
    // might get called with null gefore we receive the message type
    init(msg_type=null) {

        let fallback_show_src = true;

        if (msg_type && !this.initiated) {

            console.log('Initiating panel '+this.id_source+' for '+msg_type)

            if (this.ui.widgets[msg_type]) {

                if (!this.display_widget) { //only once
                    // $('#display_panel_source_link_'+this.n).css('display', 'block');
                    this.display_widget = new this.ui.widgets[this.id_source].class(this); //no data yet
                    fallback_show_src = false;
                }

            } else {
                this.msg_type = msg_type;
                if (this.zoom === undefined || this.zoom === null) {
                    this.zoom = this.default_zoom;
                }
                if (msg_type != 'video') {
                    this.msg_type_class = msg_type ? this.ui.client.find_message_type(this.msg_type) : null;
                    $('#panel_msg_types_'+this.n).html(this.msg_type ? this.msg_type : '');
    
                    if (this.msg_type_class == null && this.msg_type != null) {
                        $('#panel_msg_types_'+this.n).addClass('err');
                        $('#panel_source_'+this.n).html('<span class="error">Message type '+ this.msg_type +' not loaded</span>');
                    }
    
                    // if (this.msg_type != null) {
                    //     let Reader = window.Serialization.MessageReader;
                    //     this.msg_reader = new Reader( [ this.msg_type_class ].concat(supported_msg_types) );
                    // }
                }
            }

            if (this.ui.topic_widgets[this.id_source] != undefined) {
                if (!this.display_widget) { //only once
                    // $('#display_panel_source_link_'+this.n).css('display', 'block');
                    this.display_widget = new this.ui.topic_widgets[this.id_source].widget(this, this.id_source); //no data yet
                    fallback_show_src = false;
                }
            } else if (this.ui.type_widgets[this.msg_type] != undefined) {
                if (!this.display_widget) { //only once
                    // $('#display_panel_source_link_'+this.n).css('display', 'block');
                    this.display_widget = new this.ui.type_widgets[this.msg_type].widget(this, this.id_source); //no data yet
                    fallback_show_src = false;
                }
            }
            
            if (fallback_show_src) {
                this.src_visible = true;
            }

            if (this.src_visible) {  //no widget, show source
                //console.error('no widget for '+this.id_source+" msg_type="+this.msg_type)
                $('#panel_source_'+this.n).addClass('enabled');
            }

            this.initiated = true;

            if (this.init_data != null) {
                this._on_data_context_wrapper(this.init_data[0], this.init_data[1]);
                this.init_data = null;
            }
            //use latest msg

            // let latest = this.ui.client.latest[this.id_source];
            // if (latest) {
            //     this._on_data_context_wrapper(latest.msg, latest.ev)
            // }

            let that = this;

            // pause panel updates
            //if (this.msg_type != 'video') {
            let pauseEl = $('<a href="#" id="pause_panel_'+this.n+'" class="pause-panel-button" title="Pause"></a>');
            if (that.paused) {
                pauseEl.addClass('paused');
                pauseEl.attr('title', 'Unpause');
            }
            pauseEl.click(function(e) {
                that.paused = !that.paused;
                console.log('Panel updates paused '+that.paused);
                if (that.paused) {
                    pauseEl.addClass('paused');
                    pauseEl.attr('title', 'Unpause');
                } else {
                    pauseEl.removeClass('paused');
                    pauseEl.attr('title', 'Pause');
                }
                if (that.display_widget && that.display_widget.is_video) {
                    that.display_widget.el.trigger(that.paused ? 'pause' : 'play');    
                }
                e.cancelBubble = true;
                return false;
            });
            pauseEl.insertBefore('#monitor_menu_'+that.n);
            // } else {
            //     $('#panel_title_'+this.n).addClass('no-pause');
            // }

        }

        this.setMenu()
        this.onResize();
    }

    _on_data_context_wrapper = (msg, ev) => {

        if (!this.initiated) {
            this.init_data = [ msg, ev ]; //store for after init
            return;
        }

        if (['video', 'sensor_msgs/msg/Image'].indexOf(this.msg_type) > -1) {
            this.on_stream(stream);
        } else {
            this.on_data(msg, ev);
        }

    }

    setMenu() {

        let els = []
        let that = this;
        if (this.msg_type != null && this.msg_type != 'video') {

            // message type info dialog
            let msgTypesEl = $('<div class="menu_line panel_msg_types_line"><a href="#" id="panel_msg_types_'+this.n+'" class="msg_types" title="View message type definition">'+this.msg_type+'</a></div>');
            msgTypesEl.click(function(ev) {

                that.ui.message_type_dialog(that.msg_type)             
    
                ev.cancelBubble = true;
                ev.preventDefault();
            });
            els.push(msgTypesEl);

            // display source for widgets
            if (this.display_widget && this.msg_type != 'sensor_msgs/msg/Image') {
                let showSourceEl = $('<div class="menu_line" id="display_panel_source_link_'+this.n+'"><label for="display_panel_source_'+this.n+'" class="display_panel_source_label" id="display_panel_source_label_'+this.n+'"><input type="checkbox" id="display_panel_source_'+this.n+'" class="panel_display_source"'+(this.src_visible?' checked':'')+' title="Display source data"> Show source data</label></div>');
                let source_el = $('#panel_source_'+this.n);
                let widget_el = $('#panel_widget_'+this.n);
                let showSourceCB = showSourceEl.find('.panel_display_source');
                showSourceCB.change(function(ev) {
                    if ($(this).prop('checked')) {
                        
                        source_el.addClass('enabled');
                        widget_el.addClass('source_visible');
                        that.src_visible = true;
        
                        let w = parseInt($(that.grid_widget).attr('gs-w'));
                        if (w < 5) {
                            w *= 2;
                            that.ui.grid.update(that.grid_widget, {w : w}); //updates url hash, triggers onResize
                        } else {
                            that.onResize();
                            that.ui.update_url_hash();
                        }
        
                    } else {
        
                        source_el.removeClass('enabled');
                        widget_el.removeClass('source_visible');
                        let w = Math.floor(parseInt($(that.grid_widget).attr('gs-w'))/2);
                        that.src_visible = false;
                        that.ui.grid.update(that.grid_widget, {w : w});  //updates url hash, triggers onResize
        
                    }
                });
                els.push(showSourceEl);
            }
        } else if (this.msg_type == 'video') {
            // message type info dialog
            let msgTypesEl = $('<div class="menu_line panel_msg_types_line"><span class="msg_types">Video/H.264</span></div>');
            els.push(msgTypesEl);
        }

        let closeEl = $('<div class="menu_line" id="close_panel_menu_'+this.n+'"><a href="#" id="close_panel_link_'+this.n+'">Close</a></div>');
        closeEl.click(function(ev) {
            console.log('click '+that.n)

            /*let el = $('#panel_msg_type_'+that.n);
            if (el.css('display') != 'block')
                el.css('display', 'block');
            else if (!el.hasClass('err'))
                el.css('display', 'none');
                */

            that.close();
            if (that.ui.widgets[that.id_source])
                that.ui.widgets_menu();

            //that.Close();
            //delete panels[that.topic];

            ev.cancelBubble = true;
            ev.preventDefault();
        });
        els.push(closeEl);

        $('#monitor_menu_content_'+this.n).html('<div class="hover_keeper"></div>');
        let linesCont = $('<div class="menu_lines"></div>');
        for (let i = 0; i < els.length; i++) {
            $('#monitor_menu_content_'+this.n).append(els[i]);
        }

        if (this.widget_menu_cb != null) {
            this.widget_menu_cb(this);
        }

    }

    auto_menu_position() {
        let menu_el = $('#monitor_menu_content_'+this.n);
        if (!menu_el.length)
            return;
        let pos = menu_el.parent().offset();
        // console.log(this.id_source+' menuburger pos ', pos);
        if (pos.left < 150) {
            menu_el.addClass('right')   
        } else {
            menu_el.removeClass('right')
        }
    }

    getAvailableWidgetSize() {

        let ref = this.grid_widget;

        let w = $(ref).innerWidth();
        let h = parseInt($(ref).css('height'));

        // console.log('Max h', h);

        w -= 30;
        h -= 66;

        return [w, h];
    }

    onResize() {

        [ this.widget_width, this.widget_height ] = this.getAvailableWidgetSize();

        // console.info('Resizing panel widget for '+ this.id_source+' to '+this.widget_width +' x '+this.widget_height);

        $('#panel_widget_'+this.n).parent()
            .css('height', this.widget_height)

        $('#panel_source_'+this.n)
            .css('height', this.widget_height-23)

        this.widget_width = this.src_visible ? (this.widget_width/2.0) : this.widget_width;

        let canvas = document.getElementById('panel_canvas_'+this.n);
        if (canvas && !$(canvas).hasClass('big_canvas') && !$(canvas).hasClass('canvas_tile')) {
            canvas.width = this.widget_width;
            canvas.height = this.widget_height;
            // let ctx = canvas.getContext('2d');

            // Event handler to resize the canvas when the document view is changed
           
            // canvas.width = window.innerWidth + 'px';
            // canvas.height = window.innerHeight;
        }

        //  auto scale canvas
        // if ($('#panel_widget_'+this.n+' CANVAS').length > 0) {

        //     $('#panel_widget_'+this.n+' CANVAS')
        //         .attr({
        //             'width': this.widget_width,
        //             'height' : this.widget_height
        //         });
        // }

        // auto scale THREE renderer & set camera aspect
        if (this.display_widget && this.display_widget.renderer) {

            this.display_widget.camera.aspect = parseFloat(this.widget_width) / parseFloat(this.widget_height);
            this.display_widget.camera.updateProjectionMatrix();

            this.display_widget.renderer.setSize( this.widget_width, this.widget_height );
            // console.log('resize', this.widget_width, this.widget_height)
        }

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

    on_data(msg, ev) {
        // console.log('Got data for '+this.id_source+': ', msg)

        if (this.paused)
            return;

        let raw_len = 0;
        let raw_type = "";
        if (ev.data instanceof ArrayBuffer) {
            raw_len = ev.data.byteLength;
            raw_type = 'ArrayBuffer';
        } else if (ev.data instanceof Blob) {
            raw_len = ev.data.size;
            raw_type = 'Blob';
        } else {
            raw_len = msg.length;
            raw_type = 'String';
        }

        let datahr = 'N/A';
        if ((this.msg_type == 'std_msgs/msg/String' && msg.data) || raw_type === 'String' ) {

            let str_val = null;
            if (this.msg_type == 'std_msgs/msg/String')
                str_val = msg.data;
            else
                str_val = msg;

            try{
                if (str_val == null || str_val == undefined) 
                    datahr = '';
                else if ((typeof str_val === 'string' || str_val instanceof String) && str_val.indexOf('xml') !== -1)  {
                    datahr = linkifyURLs(escapeHtml(window.xmlFormatter(str_val)), true);
                } else {
                    datahr = linkifyURLs(escapeHtml(str_val));
                }    
            } catch (e) {
                console.error('Err parsing str_val, this.msg_type='+this.msg_type+'; raw_type='+raw_type+'; ev.data='+(typeof ev.data), e, str_val);
                console.error('ev.data', ev.data);
                console.error('decoded msg', msg);
            }
            
            //console.log(window.xmlFormatter)

        } else if (msg && this.src_visible) {
            datahr = JSON.stringify(msg, null, 2);
        }

        // if (this.ui.topic_widgets[this.id_source] && this.ui.topic_widgets[this.id_source].widget)
        //     this.ui.topic_widgets[this.id_source].widget(this, msg);
        // else if (this.ui.type_widgets[this.msg_type] && this.ui.type_widgets[this.msg_type].widget)
        //     this.ui.type_widgets[this.msg_type].widget(this, msg);

        if (this.display_widget) {
            this.display_widget.onData(msg);
        }

        if (this.src_visible) {
            $('#panel_source_'+this.n).html(
                'Received: '+ev.timeStamp + '<br>' + // this is local stamp
                '&lt;'+raw_type+'&gt; '+raw_len+' '+(raw_type!='String'?'B':'chars')+'<br>' +
                '<br>' +
                datahr
            );
    
            let newh = $('#panel_source_'+this.n).height();
            //console.log('max_height='+this.max_height+' newh='+newh);
    
            if (newh > this.max_height) {
                this.max_height = newh;
            }
        }
    }

    on_stream(stream) {
        console.log('Got stream for '+this.id_source+': ', stream)
    }

    close() {

        if (this.ui.graph_menu.topics[this.id_source]) {
            // $('.topic[data-toppic="'+that.id_source+'"] INPUT:checkbox').click();
            // $('.topic[data-topic="'+this.id_source+'"] INPUT:checkbox').removeClass('enabled'); //prevent eventhandler
            // $('.topic[data-topic="'+this.id_source+'"] INPUT:checkbox').prop('checked', false);
            // $('.topic[data-topic="'+this.id_source+'"] INPUT:checkbox').addClass('enabled');
            this.ui.graph_menu.uncheck_topic(this.id_source);
    
            // SetTopicsReadSubscription(id_robot, [ this.id_source ], false);
        } // else { //topics not loaded
            // Panel.TogglePanel(that.id_source, null, false);
        // }

        // this.ui.client.off(this.id_source, this._on_stream_context_wrapper);
        this.ui.client.off(this.id_source, this._on_data_context_wrapper);

        if ($('.camera[data-camera="'+this.id_source+'"] INPUT:checkbox').length > 0) {
            // $('.topic[data-toppic="'+that.id_source+'"] INPUT:checkbox').click();
            $('.camera[data-camera="'+this.id_source+'"] INPUT:checkbox').removeClass('enabled'); //prevent eventhandler
            $('.camera[data-camera="'+this.id_source+'"] INPUT:checkbox').prop('checked', false);
            $('.camera[data-camera="'+this.id_source+'"] INPUT:checkbox').addClass('enabled');
        }

        if (this.display_widget && this.display_widget.onClose) {
            this.display_widget.onClose();
        }

        // let x = parseInt($(this.grid_widget).attr('gs-x'));
        // let y = parseInt($(this.grid_widget).attr('gs-y'));

        this.ui.grid.removeWidget(this.grid_widget);

        console.warn('Removing panel '+this.id_source, this.ui.panels[this.id_source]);
        delete this.ui.panels[this.id_source];

        $('.grid_panel[data-source="'+this.id_source+'"]').remove(); //updates url hash
        console.log('Panel closed for '+this.id_source)
    }

}

export class PanelUI {

    panels = {};

    lastAP = null;
    lastESSID = null;

    // override or edit to customize topic panel defaults
    topic_widgets = {
        // '/robot_description' : { widget: URDFWidget, w:5, h:4 } ,
    };
    type_widgets = {
        'sensor_msgs/msg/BatteryState' : { widget: BatteryStateWidget, w:4, h:2 } ,
        'sensor_msgs/msg/Range' : { widget: RangeWidget, w:1, h:1 },
        'sensor_msgs/msg/LaserScan' : { widget: LaserScanWidget, w:7, h:4 },
        'sensor_msgs/msg/Imu' : { widget: ImuWidget, w:2, h:2 },
        'rcl_interfaces/msg/Log' : { widget: LogWidget, w:10, h:2 },
        'sensor_msgs/msg/Image' : { widget: VideoWidget, w:5, h:4 },
        'video' : { widget: VideoWidget, w:5, h:4 },
        'nav_msgs/msg/OccupancyGrid' : { widget: OccupancyGrid, w:7, h:4 },
    };
    widgets = {}; // custom and/or compound

    input_widgets = {
        'std_srvs/srv/Empty' : ServiceCallInput_Empty,
        'std_srvs/srv/SetBool' : ServiceCallInput_Bool
    }

    constructor(client, grid_cell_height, gamepad) {
        this.client = client;

        let GridStack = window.exports.GridStack;
        this.grid = GridStack.init({ float: false, cellHeight: grid_cell_height, handle: '.panel-title' });

        this.panels = {}
        this.gamepad = gamepad;
        this.gamepad.ui = this;

        this.last_pc_stats = null;

        let that = this;

        this.lastAP = null;
        this.lastESSID = null;

        client.on('introspection',  (state) => {
            if (state) {
                $('#introspection_state').addClass('active').removeClass('inactive').attr('title', 'Introspection running...');
            } else {
                $('#introspection_state').addClass('inactive').removeClass('active').attr('title', 'Run introspection...');
            }
        });
        client.on('peer_disconnected', ()=>{
            $('#introspection_state').addClass('inactive').removeClass('active').attr('title', 'Run introspection...');
        });

        window.addEventListener("resize", (event) => {
            that.update_layout_width()
        });
        this.update_layout_width();

        client.on('update', ()=>{

            if (client.name) {
                $('#robot_name').html(client.name);
                document.title = client.name + ' @ PHNTM bridge';
            }

            $('#robot_info').html('ID: '+ client.id_robot
                                + ' @ '
                                + (client.online ? '<span class="online">'+client.ip.replace('::ffff:', '')+'</span>':'<span class="offline">Offline</span>')+' '
                                + 'WebRTC: <span id="webrtc_status"></span> '
                                );

            that.set_webrtc_status_label()
        });

        client.on('media_stream', (id_src, stream)=>{
            console.warn('Client got a stream for '+id_src, stream);

            let panel = that.panels[id_src];
            // console.log('id_panel: '+id_src+'; panel=', panel, that.panels)
            if (!panel)
                return;

            panel.id_stream = stream.id;
            console.log('Found video panel for new media stream '+stream.id+' src='+id_src);
            if (document.getElementById('panel_video_'+panel.n)) {
                document.getElementById('panel_video_'+panel.n).srcObject = stream;
            }
        });

        client.on('/iw_status', (msg) => that.update_wifi_status(msg));

        client.on('topics', (topics)=>{
            that.init_panels(topics);
        });

        client.on('nodes', (nodes)=>{
            // that.topics_menu_from_nodes(nodes);
            
            that.services_menu_from_nodes(nodes);
            that.graph_from_nodes(nodes);
        });

        client.on('cameras', (cameras)=>{
            $('#cameras_list').empty();

            let num_cameras = Object.keys(cameras).length;

            if (num_cameras > 0) {
                $('#camera_controls').addClass('active');
            } else {
                $('#camera_controls').removeClass('active');
            }
            $('#cameras_heading').html(num_cameras+' '+(num_cameras == 1 ? 'Camera' : 'Cameras'));

            let i = 0;
            // let subscribe_cameras = [];
            Object.values(cameras).forEach((camera) => {

                $('#cameras_list').append('<div class="camera" data-camera="'+camera.id+'">'
                    + '<input type="checkbox" class="enabled" id="cb_camera_'+i+'"'
                    //+ (!topic.robotTubscribed?' disabled':'')
                    + (that.panels[camera.id] ? ' checked': '' )
                    + '/> '
                    + '<span '
                    + 'class="camera" '
                    + '>'
                    + '<label for="cb_camera_'+i+'" class="prevent-select">'+camera.id+'</label>'
                    + '</span>'
                    + '</div>'
                );

                // let subscribe = $('#cb_camera_'+i).is(':checked');

                if (that.panels[camera.id]) {
                    that.panels[camera.id].init('video');
                    // subscribe = true;
                }

                //if (!old_topics[topic.topic]) {

                // if (subscribe) {
                //     //console.warn('New topic: '+topic.topic+'; subscribe='+subscribe);
                //     subscribe_cameras.push(camera_data.id);
                // } else {
                //     //console.info('New topic: '+topic.topic+'; subscribe='+subscribe);
                // }

                //TogglePanel(topic.topic, true);
                //}

                i++;
            });


            // if (subscribe_cameras.length)
            //     SetCameraSubscription(id_robot, subscribe_cameras, true);

            $('#cameras_list INPUT.enabled:checkbox').change(function(event) {
                let id_cam = $(this).parent('DIV.camera').data('camera');
                let state = this.checked;

                let w = that.type_widgets['video'].w;
                let h = that.type_widgets['video'].h;

                that.toggle_panel(id_cam, 'video', state, w, h);
                // client.SetCameraSubscription(id_robot, [ cam ], state);
            });

        });

        client.on('docker', (containers)=>{

            $('#docker_list').empty();

            let num_containers = Object.keys(containers).length;

            if (num_containers > 0) {
                $('#docker_controls').addClass('active');
            } else {
                $('#docker_controls').removeClass('active');
            }
            $('#docker_heading').html(num_containers+' Docker '+(num_containers == 1 ? 'container' : 'containers'));

            let i = 0;
            Object.values(containers).forEach((container) => {

                $('#docker_list').append('<div class="docker_cont '+container.status+'" id="docker_cont_'+i+'" data-container="'+container.id+'">'
                    // + '<input type="checkbox" class="enabled" id="cb_cont_'+i+'"'
                    //+ (!topic.robotTubscribed?' disabled':'')
                    // + (panels[camera_data.id] ? ' checked': '' )
                    // + '/> '
                    + '<span '
                    + 'class="docker_cont_name" '
                    + '>'
                    + container.name
                    + '</span>' + ' ['+container.status+']'
                    + '<div class="docker_btns">'
                    + '<button class="docker_run" title="Start"></button>'
                    + '<button class="docker_stop" title="Stop"></button>'
                    + '<button class="docker_restart" title="Restart"></button>'
                    + '</div>'
                    + '</div>'
                );

                $('#docker_cont_'+i+' button.docker_run').click(function(event) {
                    if ($(this).hasClass('working'))
                        return;
                    $(this).addClass('working');
                    // console.log('Running '+cont_data.name);
                    let item = this;
                    client.docker_container_start(container.id, () => {
                        $(item).removeClass('working');
                    });
                });
                $('#docker_cont_'+i+' button.docker_stop').click(function(event) {
                    if ($(this).hasClass('working'))
                        return;
                    $(this).addClass('working');
                    // console.log('Stopping '+cont_data.name);
                    let item = this;
                    client.docker_container_stop(container.id, () => {
                        $(item).removeClass('working');
                    });
                });
                $('#docker_cont_'+i+' button.docker_restart').click(function(event) {
                    if ($(this).hasClass('working'))
                        return;
                    $(this).addClass('working');
                    // console.log('Restarting '+cont_data.name);
                    let item = this;
                    client.docker_container_restart(container.id, () => {
                        $(item).removeClass('working');
                    });
                });

                i++;
            });

        });

        // client.on('media_stream', (stream) => {
        //     for (let id_panel in Object.keys(that.panels)) {
        //         let panel = that.panels[id_panel];
        //         console.log('id_panel: '+id_panel+'; panel=', panel, that.panels)
        //         if (panel.id_stream == stream.id) {
        //             console.log('Found video panel for new media stream '+stream.id+' src='+id_panel);
        //             document.getElementById('panel_video_'+panel.n).srcObject = stream;
        //         }
        //     }
        // });

        client.on('peer_connected', () => {
            that.set_webrtc_status_label();
        })

        client.on('peer_disconnected', () => {
            that.set_webrtc_status_label();
        })

        // browsers Socket.io connection to the Cloud Bridge's server
        client.socket.on('connect',  () => {
            $('#socketio_status').html('Bridge: <span class="online">Connected</span>');
        });

        client.socket.on('disconnect',  () => {
            $('#socketio_status').html('Bridge: <span class="offline">Disconnected</span>');
        });

        setInterval(() => {
            if (client.pc) {
                client.pc.getStats(null).then((results)=>{
                    that.last_pc_stats = results;
                    that.update_video_stats(results)
                }, err => console.log(err))
            }
        }, 1000);

        this.grid.on('added removed change', function(e, items) {
            if (items) {
                items.forEach(function(item) {
                    let id_src = $(item.el).find('.grid_panel').attr('data-source');
                    if (that.panels[id_src])
                        that.panels[id_src].auto_menu_position();
                    // if (item.w < 3 && item.x == 0) {
                    //     
                });
            }
            that.update_url_hash();
        });

        this.grid.on('resize resizestop', function(e, el) {
            let id_source = $(el).find('.grid_panel').attr('data-source');
            that.panels[id_source].onResize();
        });

        $('#introspection_state').click((ev) => {

            let is_active = $('#introspection_state').hasClass('active')

            if (is_active) {
                $('#introspection_state').removeClass('active');
                $('#introspection_state').addClass('inactive');
            } else {
                $('#introspection_state').removeClass('inactive');
                $('#introspection_state').addClass('active');
            }

            // console.log('Starting discovery...');
            // SetDiscoveryState(true);
            client.socket.emit('introspection', { id_robot: client.id_robot, state:!is_active }, (res) => {
                if (!res || !res['success']) {
                    console.error('Introspection start err: ', res);
                    return;
                }
            });
        });

        $('#services_gamepad_mapping_toggle').click(function(event) {
            event.preventDefault();
            if (!$('#service_controls').hasClass('setting_shortcuts')) {
                $('#service_controls').addClass('setting_shortcuts');
                $('#services_gamepad_mapping_toggle').html('[cancel]');
            } else {
                $('#service_controls').removeClass('setting_shortcuts');
                $('#services_gamepad_mapping_toggle').html('[shortcuts]');
            }
        });


        $('#trigger_wifi_scan').click(() => {
            that.trigger_wifi_scan();
        });

        $('#graph_controls').on('mouseenter', (e) => {
            if ($('#graph_controls').hasClass('hover_waiting'))
                $('#graph_controls').removeClass('hover_waiting');
        });
    }

    init_panels(topics) {
        let that = this;
        let topic_ids = Object.keys(topics);
        topic_ids.forEach((id_topic) => {
            if (!that.panels[id_topic] || that.panels[id_topic].initiated)
                return;
            console.log(topics[id_topic]);
            let msg_type = topics[id_topic].msg_types[0];
            that.panels[id_topic].init(msg_type); //init w message type
        });
    }

    graph_from_nodes(nodes) {

        if (!this.graph_menu) {
            this.graph_menu = new GraphMenu(this);
        } 

        this.graph_menu.update(nodes);        

        $('#graph_nodes_label').html(this.graph_menu.node_ids.length+' Nodes')
        $('#graph_topics_label').html(this.graph_menu.topic_ids.length+' Topics')
        $('#graph_controls').addClass('active');
        // var nodes = svg
        //     .selectAll("circle")
        //     .data(data.nodes)
        //     .enter()
        //     .append("circle")
        //     .attr("r", function(d){
        //         if (d.group == 1)
        //             return 20
        //         else
        //             return 10
        //     })
        //     .style("fill", function(d){
        //         if (d.group == 1)
        //             return 'red'
        //         else
        //             return 'blue'
        //     });


        // // Initialize the links
        // var link = svg
        //     .selectAll("line")
        //     .data(data.links)
        //     .enter()
        //     .append("line")
        //     .style("stroke", function(d){
        //         if (d.group == 1)
        //             return 'blue'
        //         else
        //             return 'green'
        //     });

        // // Initialize the nodes
        // var node = svg
        //     .selectAll("circle")
        //     .data(data.nodes)
        //     .enter()
        //     .append("circle")
        //     .attr("r", function(d){
        //         if (d.group == 1)
        //             return 20
        //         else
        //             return 10
        //     })
        //     .style("fill", function(d){
        //         if (d.group == 1)
        //             return 'red'
        //         else
        //             return 'blue'
        //     });

        // // Initialize the nodes
        // var label = svg
        //     .selectAll("text")
        //     .data(data.nodes)
        //     .enter()
        //     .append("text")
        //     .attr("text-anchor", 'middle')
        //     .style("font-size", (d) => {
        //         return d.group == 1 ? 15 : 12
        //     })
        //     .style("font-weight", (d) => {
        //         return d.group == 1 ? 'bold' : 'normal'
        //     })
        //     .style("flood-color", (d) => {
        //          return d.group == 1 ? 'red' : 'blue'
        //     })
        //     .text((d) => {return d.name})

        // // Let's list the force we wanna apply on the network
        // var simulation = d3.forceSimulation(data.nodes)                 // Force algorithm is applied to data.nodes
        //     .force("center", d3.forceCenter(width / 2, height / 2))     // This force attracts nodes to the center of the svg area  
        //     .force("link", d3.forceLink()                               // This force provides links between nodes
        //         .id(function(d) { return d.id; })                     // This provide  the id of a node
        //         .links(data.links)                                    // and this the list of links
        //     )
        //     .force('collide', d3.forceCollide((d) => d.r))
        //     .force("charge", d3.forceManyBody()
        //                         .strength(function(d) { return d.charge; })
        //                         .distanceMax(100)
        //     )         // This adds repulsion between nodes. Play with the -400 for the repulsion strength
        //     .on("end", ticked);

        // // This function is run at each iteration of the force algorithm, updating the nodes position.
        // function ticked() {
        //     link
        //         .attr("x1", function(d) { return d.source.x; })
        //         .attr("y1", function(d) { return d.source.y; })
        //         .attr("x2", function(d) { return d.target.x; })
        //         .attr("y2", function(d) { return d.target.y; });

        //     node
        //         .attr("cx", function (d) { return d.x; })
        //         .attr("cy", function(d) { return d.y; });

        //     label
        //         .attr("x", function (d) { return d.x; })
        //         .attr("y", function(d) { return d.group == 1 ? d.y : d.y-15; });
        // }

        // });
    }

    message_type_dialog(msg_type, onclose=null) {

        let msg_type_class = msg_type ? this.client.find_message_type(msg_type) : null;;

        // $('#msg_type-dialog').attr('title', );
        $('#msg_type-dialog').html((msg_type_class ? JSON.stringify(msg_type_class, null, 2) : '<span class="error">Message type not loaded!</span>'));
        $( "#msg_type-dialog" ).dialog({
            resizable: true,
            height: 700,
            width: 500,
            modal: true,
            title: msg_type,
            buttons: {
                Okay: function() {
                    $(this).dialog( "close" );
                    if (onclose)
                        onclose();
                },
            },
            close: function( event, ui ) {
                if (onclose)
                    onclose();
            }
        });
    }

    topic_selector_dialog(label, msg_type, exclude_topics, onselect) {

        let d = $('#topic-selector-dialog');
        let that = this;

        const render_list = (discovered_topics) => {
            d.empty();
            
            let all_topics = Object.keys(discovered_topics);
            let some_match = false;
            all_topics.forEach((topic) => {

                if (exclude_topics && exclude_topics.length && exclude_topics.indexOf(topic) !== -1)
                    return;

                if (!that.client.discovered_topics[topic].msg_types || that.client.discovered_topics[topic].msg_types[0] != msg_type)
                    return;

                let l = $('<a href="#" class="topic-option">'+topic+'</a>');
                l.on('click', (e) => {
                    onselect(topic);
                    e.cancelBubble = true;
                    d.dialog("close");
                    return false;
                });
                l.appendTo(d);
                some_match = true;
            });

            if (!some_match) {
                let l = $('<span class="empty">No matching topics foud</span>');
                l.appendTo(d);
            }
        }
        this.client.on('topics', render_list);
        render_list(this.client.discovered_topics);

        d.dialog({
            resizable: true,
            height: 700,
            width: 500,
            modal: true,
            title: label,
            buttons: {
                Cancel: function() {
                    $(this).dialog("close");
                },
            },
            close: function( event, ui ) {
                that.client.off('topics', render_list);
            }
        });
    }

    /*topics_menu_from_nodes(nodes) {

        $('#topic_list').empty();

        let node_ids = Object.keys(nodes);
        node_ids.sort();

        let unique_topics = [];

        let that = this;

        let i = 0;
        node_ids.forEach((node) => {

            if (nodes[node].publishers) {
                $('#topic_list').append('<div class="node" data-node="'+node+'">'+ node+ '</div>');

                let topic_ids = Object.keys(nodes[node].publishers);
                topic_ids.sort((a, b) => {
                    let _a = a.indexOf('/_') === 0;
                    let _b = b.indexOf('/_') === 0;
                    if (!_a && _b) return -1;
                    if (!_b && _a) return 1;
                    if (a < b) return -1;
                    if (a > b) return 1;
                    return 0;
                });

                topic_ids.forEach((id_topic)=>{

                    if (unique_topics.indexOf(id_topic) === -1)
                        unique_topics.push(id_topic)

                    let msg_type = nodes[node].publishers[id_topic].msg_types[0];

                    $('#topic_list').append('<div class="topic" data-topic="'+id_topic+'" data-msg_types="'+nodes[node].publishers[id_topic].msg_types.join(',')+'">'
                        + '<input type="checkbox" class="enabled" id="cb_topic_'+i+'"'
                        //+ (!topic.robotTubscribed?' disabled':'')
                        + (this.panels[id_topic] ? ' checked': '' )
                        + '/> '
                        + '<span '
                        + 'class="topic'+(nodes[node].publishers[id_topic].is_video?' image':'')+(!nodes[node].publishers[id_topic].msg_type_supported?' unsupported_message_type':'')+'" '
                        + 'title="'+(!nodes[node].publishers[id_topic].msg_type_supported?'Unsupported type: ':'')+nodes[node].publishers[id_topic].msg_types.join('; ')+'"'
                        + '>'
                        + '<label for="cb_topic_'+i+'" class="prevent-select">'+id_topic+'</label>'
                        + '</span>'
                        + '</div>'
                    );

                    // topic_data.msgTypes.forEach((msgType)=>{
                    //     if (msg_type_filters.indexOf(msgType) == -1)
                    //         msg_type_filters.push(msgType);
                    // });

                    // let subscribe = $('#cb_topic_'+i).is(':checked');

                    if (this.panels[id_topic]) {
                        this.panels[id_topic].init(msg_type); //init w message type
                        // subscribe = true;
                    }

                    //if (!old_topics[topic.topic]) {

                    // if (subscribe) {
                    //     //console.warn('New topic: '+topic.topic+'; subscribe='+subscribe);
                    //     subscribe_topics.push(topic_data.topic);
                    // } else {
                    //     //console.info('New topic: '+topic.topic+'; subscribe='+subscribe);
                    // }

                    //TogglePanel(topic.topic, true);
                    //}

                    i++;
                });
            }
        });

        $('#topic_list INPUT.enabled:checkbox').change(function(event) {
            let id_topic = $(this).parent('DIV.topic').data('topic');
            let state = this.checked;

            let w = 3; let h = 3; //defaults overridden by widgets
            let msg_type = that.client.discovered_topics[id_topic]['msg_types'][0];

            if (that.topic_widgets[id_topic]) {
                w = that.topic_widgets[id_topic].w;
                h = that.topic_widgets[id_topic].h;
            } else if (that.type_widgets[msg_type]) {
                w = that.type_widgets[msg_type].w;
                h = that.type_widgets[msg_type].h;
            }
            let trigger_el = this;

            // console.log('Clicker topic '+id_topic);

            $('#topic_list .topic[data-topic="'+id_topic+'"] INPUT:checkbox').each(function(index){
                if (this != trigger_el)
                    $(this).prop('checked', state)
                // console.log('Also '+id_topic, this);
            });

            that.toggle_panel(id_topic, msg_type, state, w, h);
            // client.SetTopicsReadSubscription(id_robot, [ topic ], state);
        });

        let num_topics = unique_topics.length;
        $('#topics_heading').html(num_topics+' '+(num_topics == 1 ? 'Topic' : 'Topics'));
        if (num_topics > 0) {
            $('#topic_controls').addClass('active');
        } else {
            $('#topic_controls').removeClass('active');
        }
    }*/

    add_widget(widget_class, conf) {
        this.widgets[widget_class.name] = {
            label: widget_class.label,
            class: widget_class,
        };
        this.widgets_menu();
    }

    widgets_menu() {
         $('#widget_list').empty();
         let num_widgets = Object.keys(this.widgets).length;

         if (num_widgets > 0) {
             $('#widget_controls').addClass('active');
         } else {
             $('#widget_controls').removeClass('active');
         }
         $('#widgets_heading').html(num_widgets+' '+(num_widgets == 1 ? 'Widget' : 'Widgets'));

         let that = this;

         let i = 0;
         // let subscribe_cameras = [];
         Object.keys(this.widgets).forEach((widget_class) => {
            let w = that.widgets[widget_class];
             $('#widget_list').append('<div class="widget" data-class="'+widget_class+'">'
                 + '<input type="checkbox" class="enabled" id="cb_widget_'+i+'"'
                 //+ (!topic.robotTubscribed?' disabled':'')
                 + (that.panels[widget_class] ? ' checked': '' )
                 + '/> '
                 + '<span '
                 + 'class="custom_widget" '
                 + '>'
                 + '<label for="cb_widget_'+i+'" class="prevent-select">'+w.label+'</label>'
                 + '</span>'
                 + '</div>'
             );

             // let subscribe = $('#cb_camera_'+i).is(':checked');

             if (that.panels[widget_class]) {
                that.panels[widget_class].init(widget_class);
             }

             //if (!old_topics[topic.topic]) {

             // if (subscribe) {
             //     //console.warn('New topic: '+topic.topic+'; subscribe='+subscribe);
             //     subscribe_cameras.push(camera_data.id);
             // } else {
             //     //console.info('New topic: '+topic.topic+'; subscribe='+subscribe);
             // }

             //TogglePanel(topic.topic, true);
             //}

             i++;
         });


         // if (subscribe_cameras.length)
         //     SetCameraSubscription(id_robot, subscribe_cameras, true);

         $('#widget_list INPUT.enabled:checkbox').change(function(event) {
             let widget_class = $(this).parent('DIV.widget').data('class');
             let state = this.checked;

             let w = that.widgets[widget_class].class.default_width;
             let h = that.widgets[widget_class].class.default_height;

             that.toggle_panel(widget_class, widget_class, state, w, h);
             // client.SetCameraSubscription(id_robot, [ cam ], state);
         });

    }

    services_menu_from_nodes(nodes) {

        $('#service_list').empty();
        let num_services = 0;

        // let nodes_with_handled_ui = [];
        // let unhandled_nodes = [];

        Object.values(nodes).forEach((node) => {
            if (!node.services || !Object.keys(node.services).length)
                return;

            let node_content = $('<div class="node" data-node="'+node.node+'">'+ node.node+ '</div>');
            let service_contents = [];
            let service_ids = Object.keys(node.services);
            // let some_ui_handled = false;
            for (let i = 0; i < service_ids.length; i++) {

                let id_service = service_ids[i];
                let service = node.services[id_service];
                let msg_type = node.services[id_service].msg_types[0];

                if (['rcl_interfaces/srv/DescribeParameters',
                     'rcl_interfaces/srv/GetParameterTypes',
                     'rcl_interfaces/srv/GetParameters',
                      'rcl_interfaces/srv/ListParameters',
                      'rcl_interfaces/srv/SetParameters',
                      'rcl_interfaces/srv/SetParametersAtomically'
                    ].includes(msg_type))
                    continue; // not rendering internals
                
                num_services++; // activates menu

                service.ui_handled = this.input_widgets[msg_type] != undefined;

                let service_content = $('<div class="service '+(service.ui_handled?'handled':'nonhandled')+'" data-service="'+service.service+'" data-msg_type="'+service.msg_types[0]+'">'
                                        + '<div '
                                        + 'class="service_heading" '
                                        + 'title="'+service.service+'\n'+msg_type+'"'
                                        + '>'
                                        + service.service
                                        + '</div>'
                                        + '<div class="service_input_type" id="service_input_type_'+i+'">' + msg_type + '</div>'
                                        + '</div>');
                service_contents.push(service_content);
                // node_content.append(service_content);
                
                let service_input = $('<div class="service_input" id="service_input_'+i+'"></div>');
                

                if (service.ui_handled) {
                    this.input_widgets[msg_type](service_input, service, this.client);
                }

                service_content.append(service_input);
            }

            if (service_contents.length) {
                $('#service_list').append(node_content);
                for (let i = 0; i < service_contents.length; i++)
                    $('#service_list').append(service_contents[i]);
            }
        });

        // let i = 0;

        // [ nodes_with_handled_ui, unhandled_nodes].forEach((node_list) => {

        //     let some_services_handled = node_list == nodes_with_handled_ui;

        //     node_list.sort((a, b) => {
        //         if (a.node < b.node) return -1;
        //         if (a.node > b.node) return 1;
        //         return 0;
        //     });

        //     node_list.forEach((node) => {

        //         let services_sorted = Object.values(node.services);
        //         services_sorted.sort((a, b) => {
        //             if (!a.ui_handled && b.ui_handled) return 1;
        //             if (!b.ui_handled && a.ui_handled) return -1;
        //             if (a.service < b.service) return -1;
        //             if (a.service > b.service) return 1;
        //             return 0;
        //         });

        //         $('#service_list').append('<div class="node" data-node="'+node.node+'">'+ node.node+ '</div>');
        //         let unhandled_block_html = [];
        //         services_sorted.forEach((service)=>{

        //             num_services++;

        //             let html = '<div class="service '+(service.ui_handled?'handled':'nonhandled')+'" data-service="'+service.service+'" data-msg_type="'+service.msg_types[0]+'">'
        //                      + '<div '
        //                      + 'class="service_heading" '
        //                      + 'title="'+service.service+'\n'+service.msg_types[0]+'"'
        //                      + '>'
        //                      + service.service
        //                      + '</div>'
        //                      + '<div class="service_input_type" id="service_input_type'+i+'">' + service.msg_types[0] + '</div>'
        //                      + '<div class="service_input" id="service_input_'+i+'"></div>'
        //                      + '</div>';

        //             if (service.ui_handled || !some_services_handled)
        //                 $('#service_list').append(html);
        //             else
        //                 unhandled_block_html.push(html);

        //             service.n = i;
        //             i++;

        //         });
        //         if (unhandled_block_html.length) {
        //             $('#service_list').append('<div class="expandable collapsed">'+unhandled_block_html.join('')+'<button>show more</button></div>');
        //         }

        //         services_sorted.forEach((service)=>{
        //             if (service.ui_handled) {
        //                 this.input_widgets[service.msg_types[0]]($('#service_input_'+service.n), service, this.client);
        //             }
        //         })

        //     });


        // });

        // $('#service_list .expandable').click((ev)=>{
        //     console.warn('CLICK', ev.target);
        //     let collapsed = $(ev.target).parent().hasClass('collapsed')
        //     if (collapsed) {
        //         $(ev.target).parent().removeClass('collapsed');
        //         $(ev.target).html('show less')
        //     } else {
        //         $(ev.target).parent().addClass('collapsed');
        //         $(ev.target).html('show more')
        //     }
        // });

        if (num_services > 0) {
            $('#service_controls').addClass('active');
        } else {
            $('#service_controls').removeClass('active');
        }
        $('#services_heading').html(num_services+' '+(num_services == 1 ? 'Service' : 'Services'));

        if (this.gamepad)
            this.gamepad.MarkMappedServiceButtons();
    }

    trigger_wifi_scan() {
        if ($('#trigger_wifi_scan').hasClass('working'))
            return;
        $('#trigger_wifi_scan').addClass('working');
        this.client.wifi_scan(true, (res) => {
            $('#trigger_wifi_scan').removeClass('working');
        })
    }

    //widget_opts = {};

    toggle_panel(id_source, msg_type, state, w, h, x=null, y=null, src_visible=false, zoom) {
        let panel = this.panels[id_source];
        if (state) {
            if (!panel) {
                panel = new Panel(id_source, this, w, h, x, y, src_visible, zoom);
                panel.init(msg_type);
            }
        } else if (panel) {
            panel.close();
        }
    }

    make_panel(id_source, w, h, x=null, y=null, src_visible=false, zoom, custom_url_vars) {
        if (this.panels[id_source])
            return this.panels[id_source];

        //msg type unknown here
        let panel = new Panel(id_source, this, w, h, x, y, src_visible, zoom, custom_url_vars);

        //panel.init(msg_type);

        // this.client.on(panel.id_source, panel._on_data_context_wrapper);

        this.panels[id_source] = panel;
        return panel;
    }

    update_video_stats(results) {
        let panel_ids = Object.keys(this.panels);
        let that = this;

        results.forEach(res => {
            if (res.type != 'inbound-rtp' || !res.trackIdentifier)
                return; //continue

            panel_ids.forEach((id_panel)=>{
                let panel = that.panels[id_panel];
                if (panel.id_stream == res.trackIdentifier) {
                    let statsString = ''
                    statsString += `${res.timestamp}<br>`;
                    let fps = 0;
                    Object.keys(res).forEach(k => {
                        if (k == 'framesPerSecond') {
                            fps = res[k];
                        }
                        if (k !== 'timestamp' && k !== 'type' && k !== 'id') {
                            if (typeof res[k] === 'object') {
                                statsString += `${k}: ${JSON.stringify(res[k])}<br>`;
                            } else {
                                statsString += `${k}: ${res[k]}<br>`;
                            }
                        }
                    });
                    $('#video_stats_'+panel.n).html(statsString);
                    $('#video_fps_'+panel.n).html(fps+' FPS');
                }
            });
        });
    }


    update_url_hash() {
        let hash = [];

        // console.log('Hash for :', $('#grid-stack').children('.grid-stack-item'));
        let that = this;

        $('#grid-stack').children('.grid-stack-item').each(function () {
            let widget = this;
            let x = $(widget).attr('gs-x');
            let y = $(widget).attr('gs-y');
            let w = $(widget).attr('gs-w');
            let h = $(widget).attr('gs-h');
            let id_source = $(widget).find('.grid_panel').attr('data-source');

            let parts = [
                id_source,
                [x, y].join('x'),
                [w, h].join('x'),
            ];
            if (that.panels[id_source].src_visible)
                parts.push('src');
            if (that.panels[id_source].zoom !== undefined
                && that.panels[id_source].zoom !== null
                && that.panels[id_source].zoom != that.panels[id_source].default_zoom) {
                    let z = Math.round(that.panels[id_source].zoom * 100) / 100;
                    parts.push('z='+z);
                }
            if (that.panels[id_source].display_widget && typeof that.panels[id_source].display_widget.getUrlHashParts !== 'undefined') {
                that.panels[id_source].display_widget.getUrlHashParts(parts);
            }

            hash.push(parts.join(':'));
        });

        if (hash.length > 0)
            window.location.hash = ''+hash.join(';');
        else //remove hash
            history.pushState("", document.title, window.location.pathname+window.location.search);
    }

    panels_from_url_hash(hash) {
        if (!hash.length) {
            return
        }

        hash = hash.substr(1);
        let hashArr = hash.split(';');
        for (let i = 0; i < hashArr.length; i++) {
            let src_vars = hashArr[i].trim();
            if (!src_vars)
                continue;
            src_vars = src_vars.split(':');
            let id_source = src_vars[0];
            let x = null; let y = null;
            let panelPos = src_vars[1];
            if (panelPos) {
                panelPos = panelPos.split('x');
                x = panelPos[0];
                y = panelPos[1];
            }
            let panelSize = src_vars[2];
            let w = 2; let h = 2;
            if (panelSize) {
                panelSize = panelSize.split('x');
                w = panelSize[0];
                h = panelSize[1];
            }

            //opional vars follow
            let src_on = false;
            let zoom = null;
            let custom_vars = [];
            for (let j = 3; j < src_vars.length; j++) {
                if (src_vars[j] == 'src') {
                    src_on = true;
                }
                else if (src_vars[j].indexOf('z=') === 0) {
                    zoom = parseFloat(src_vars[j].substr(2));
                    console.log('Found zoom for '+id_source+': '+src_vars[j] + ' => ', zoom);
                } else {
                    custom_vars.push(src_vars[j].split('='));
                }
            }

            //let msg_type = null; //unknown atm
            //console.info('Opening panel for '+topic+'; src_on='+src_on);
            this.make_panel(id_source, w, h, x, y, src_on, zoom, custom_vars)
            if (this.widgets[id_source]) {
                this.panels[id_source].init(id_source);
            }

        }

        this.widgets_menu();
        return this.panels;
    }

    set_webrtc_status_label() {
        let state = null;
        let via_turn = null;
        let pc = this.client.pc;
        if (pc) {
            state = pc.connectionState
            // console.log('pc.sctp:', pc.sctp)
            if (pc.sctp && pc.sctp.transport && pc.sctp.transport.iceTransport) {
                // console.log('pc.sctp.transport:', pc.sctp.transport)
                // console.log('pc.sctp.transport.iceTransport:', pc.sctp.transport.iceTransport)
                let selectedPair = pc.sctp.transport.iceTransport.getSelectedCandidatePair()
                if (selectedPair && selectedPair.remote) {
                    via_turn = selectedPair.remote.type == 'relay' ? true : false;
                }
            }
        }

        if (state != null)
            state = state.charAt(0).toUpperCase() + state.slice(1);
        else
            state = 'n/a'

        if (state == 'Connected') {
            $('#webrtc_status').html('<span class="online">'+state+'</span>'+(via_turn?' <span class="turn">[TURN]</span>':'<span class="online"> [p2p]<//span>'));
            $('#trigger_wifi_scan').removeClass('working')
        } else if (state == 'Connecting') {
            $('#webrtc_status').html('<span class="connecting">'+state+'</span>');
            $('#robot_wifi_info').addClass('offline')
            $('#trigger_wifi_scan').removeClass('working')
        } else {
            $('#webrtc_status').html('<span class="offline">'+state+'</span>');
            $('#robot_wifi_info').addClass('offline')
            $('#trigger_wifi_scan').removeClass('working')
        }

    }

    //on resize
    update_layout_width() {
        let w = $('body').innerWidth();
        // console.info('body.width='+w+'px');
        if (w < 1500)
            $('#robot_wifi_info').addClass('narrow_screen')
        else
            $('#robot_wifi_info').removeClass('narrow_screen')
        
        Object.values(this.panels).forEach((panel)=>{
            panel.onResize();
        });

    }

    update_wifi_status(msg) { // /iw_status in
        // console.warn('UpdateIWStatus', msg)
        let qc = '#00ff00';
        let qPercent = (msg.quality / msg.quality_max) * 100.0;
        if (qPercent < 40)
            qc = 'red';
        else if (qPercent < 50)
            qc = 'orange';
        else if (qPercent < 70)
            qc = 'yellow';

        let nc = ''
        if (msg.noise > 0)
            nc = 'yellow'

        let brc = ''
        if (msg.bit_rate < 100)
            brc = 'yellow'

        let apclass = '';
        if (this.lastAP != msg.access_point) {
            this.lastAP = msg.access_point;
            apclass = 'new'
        }

        let essidclass= ''
        if (this.lastESSID != msg.essid) {
            this.lastESSID = msg.essid;
            essidclass = 'new'
        }

        let html = '// <span class="eeid '+essidclass+'">'+msg.essid+' <b class="ap_id '+apclass+'">'+msg.access_point+'</b> @ '+(msg.frequency ? msg.frequency.toFixed(3) : null)+' GHz, </span> ' +
                    '<span style="color:'+brc+'">BitRate: '+(msg.bit_rate ? msg.bit_rate.toFixed(1) : null) + ' Mb/s</span> ' +
                    '<span class="quality" style="color:'+qc+'" title="'+msg.quality+'/'+msg.quality_max+'">Quality: '+(qPercent).toFixed(0)+'%</span> ' +
                    'Level: '+ msg.level + ' ' +
                    '<span style="color:'+nc+'">Noise: ' + msg.noise + '</span> ' +
                    '<span class="connected_peers">Peers: ' + msg.num_peers + '</span> '
                    ;

        $('#trigger_wifi_scan').css('display', msg.supports_scanning ? 'inline-block' : 'none')
        $('#robot_wifi_info').removeClass('offline');

        // let selected_pair = this.client.pc.sctp.transport.iceTransport.getSelectedCandidatePair();
        // console.log('Selected pair', selected_pair);

        if (this.last_pc_stats) { // from timer
            // this.last_pc_stats.forEach((report) => {

            //     if (report.type == 'local-candidate') {
            //         console.warn('Report local-candidate', report);
            //         // return;
            //     }
                
            //     if (report.type == 'remote-candidate') {
            //         console.warn('Report remote-candidate', report);
            //         // return;
            //     }

            // });
            
            let min_rtt = -1;

            this.last_pc_stats.forEach((report) => {
                if (report.type != 'candidate-pair' || !report.nominated)
                    return;
                Object.keys(report).forEach((statName) => {
                    if (statName == 'currentRoundTripTime') {
                        if (min_rtt < 0 || report[statName] < min_rtt)
                            min_rtt = report[statName];
                    }
                });
            });

            if (min_rtt > 0) {
                let rtt_ms = min_rtt * 1000; //ms
                let rttc = ''
                if (rtt_ms > 100)
                    rttc = 'red'
                else if (rtt_ms > 50)
                    rttc = 'orange'
                else if (rtt_ms > 30)
                    rttc = 'yellow'
                else
                    rttc = 'lime'
                html += '<span style="color:'+rttc+'">RTT: ' + rtt_ms+'ms</span> ';
            }
        }

        $('#robot_wifi_stats').html(html)
    }



}