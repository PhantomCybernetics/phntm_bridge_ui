import { BatteryStateWidget } from '/static/widgets/battery.js';
import { OccupancyGrid } from '/static/widgets/occupacy-grid.js';
import { VideoWidget } from '/static/widgets/video.js';
import { RangeWidget } from '/static/widgets/range.js';
import { LaserScanWidget } from '/static/widgets/laser-scan.js';
import { ImuWidget } from '/static/widgets/imu.js';
import { LogWidget } from '/static/widgets/log.js';
import { GraphMenu } from '/static/graph-menu.js';
import { PointCloudWidget } from '/static/widgets/pointcloud.js';
import { ServiceCallInput_Empty, ServiceCallInput_Bool } from './input-widgets.js'
import { IsImageTopic, IsFastVideoTopic} from '/static/browser-client.js';

import { Panel } from "./panel.js";
import { isPortraitMode, isTouchDevice } from "./lib.js";

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
        'sensor_msgs/msg/CompressedImage' : { widget: VideoWidget, w:5, h:4 },
        'ffmpeg_image_transport_msgs/msg/FFMPEGPacket' : { widget: VideoWidget, w:5, h:4 },
        'video' : { widget: VideoWidget, w:5, h:4 },
        'sensor_msgs/msg/PointCloud2' : { widget: PointCloudWidget, w:4, h:4 },
        'nav_msgs/msg/OccupancyGrid' : { widget: OccupancyGrid, w:7, h:4 },
    };
    widgets = {}; // custom and/or compound

    input_widgets = {
        'std_srvs/srv/Empty' : ServiceCallInput_Empty,
        'std_srvs/srv/SetBool' : ServiceCallInput_Bool
    }

    constructor(client, grid_cell_height, keyboard, gamepad) {
        this.client = client;
        this.client.ui = this;

        let GridStack = window.exports.GridStack;
        this.grid = GridStack.init({
            float: false,
            animate: true,
            cellHeight: grid_cell_height,
            handle: '.panel-title',
            columnOpts: {
                breakpoints: [{w:500, c:1}]
            }
        });

        this.panels = {}
        this.keyboard = keyboard;
        this.gamepad = gamepad;
        this.gamepad.ui = this;

        this.latest_nodes = null;
        this.latest_cameras = null;

        this.last_pc_stats = null;

        let that = this;
        this.small_menu_full_width = 255;
        this.burger_menu_open_item = null;
        this.burger_menu_open = false;
        
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

        let last_saved_name = this.load_last_robot_name();
        if (last_saved_name) {
            client.name = last_saved_name;
            $('#robot_name .label').html(client.name);
        }

        this.update_layout_width();

        window.addEventListener("resize", (event) => {
            that.update_layout_width()
        });
        
        client.on('update', ()=>{ // from socket

            if (client.name) {
                $('#robot_name .label').html(client.name);
                document.title = client.name + ' @ PHNTM bridge';
                that.save_last_robot_name();
            }

            $('#robot_info').html('<span class="label">Robot ID:</span> '+ client.id_robot + '<br>'
                                + '<span class="label">Robot IP:</span> ' + (client.online ? '<span class="online">'+client.ip.replace('::ffff:', '')+'</span>':'<span class="offline">Offline</span>')+'<br>'
                                + '<span class="label">WebRTC:</span> <span id="webrtc_status"></span> '
                                );

            that.set_dot_state(1, client.online ? 'green' : 'red', 'Robot ' + (client.online ? 'conected to' : 'disconnected from') +' Cloud Bridge (Socket.io)');
            if (!client.online) {
                that.update_wifi_signal(-1);
                that.update_num_peers(-1);
                that.update_rtt(-1);
            }
            that.update_webrtc_status()
            that.update_layout_width(); // robot name length affects layout
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
            that.services_menu_from_nodes(nodes);
            that.graph_from_nodes(nodes);
            this.latest_nodes = nodes;
            that.cameras_menu_from_nodes_and_devices();
        });

        client.on('cameras', (cameras)=>{
            this.latest_cameras = cameras;
            that.cameras_menu_from_nodes_and_devices();
        });

        client.on('docker', (containers)=>{

            $('#docker_list').empty();

            let num_containers = Object.keys(containers).length;

            if (num_containers > 0) {
                $('#docker_controls').addClass('active');
            } else {
                $('#docker_controls').removeClass('active');
            }

            $('#docker_heading .full-w').html(num_containers == 1 ? 'Container' : 'Containers');
            $('#docker_heading B').html(num_containers);

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

        client.on('peer_connected', () => {
            that.update_webrtc_status();
        })

        client.on('peer_disconnected', () => {
            that.update_webrtc_status();
        })

        // browser's Socket.io connection to the Cloud Bridge's server
        client.socket.on('connect',  () => {
            $('#socketio_status').html('<span class="label">Cloud Bridge:</span> <span class="online">Connected (Socket.io)</span>');
            that.set_dot_state(0, 'green', 'This client is conected to Cloud Bridge (Socket.io)')
        });

        client.socket.on('disconnect',  () => {
            $('#socketio_status').html('<span class="label">Cloud Bridge:</span> <span class="offline">Disconnected (Socket.io)</span>');
            that.set_dot_state(0, 'red', 'This client is disconnected from Cloud Bridge (Socket.io)')
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
            console.log('grid changed', items);
            if (items) {
                items.forEach(function(item) {
                    let id_src = $(item.el).find('.grid_panel').attr('data-source');
                    if (that.panels[id_src]) {
                        that.panels[id_src].auto_menu_position();
                        that.panels[id_src].onResize();
                        window.setTimeout(() => {
                            // console.warn('Delayed resize '+id_src);
                            that.panels[id_src].onResize();
                        }, 300); // animaiton duration
                    }
                });
            }
            that.update_url_hash();
        });

        this.grid.on('resizestart resize resizestop', function(e, el) {
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

        // hanburger menu handlers
        $('#menubar_hamburger, #menubar_hamburger_close').click(()=>{
            that.set_burger_menu_state(!that.burger_menu_open);
        });
        $('#graph_controls_heading').click(()=>{
            that.burger_menu_action('#graph_display');
        });
        $('#services_heading').click(()=>{
            that.burger_menu_action('#service_list');
        });
        $('#cameras_heading').click(()=>{
            that.burger_menu_action('#cameras_list');
        });
        $('#docker_heading').click(()=>{
            that.burger_menu_action('#docker_list');
        });
        $('#widgets_heading').click(()=>{
            that.burger_menu_action('#widget_list');
        });
    }

    set_burger_menu_state (open, animate=true) {

        let small_menu_w_inner = this.small_menu_full_width; - 50;
        let that = this;

        if (open) {

            if (!this.burger_menu_open) {
                $('#menubar_hamburger_close').text('Close');
                $('BODY').addClass('no-scroll');
                $('#modal-underlay')
                    .css('display', 'block')
                    .unbind()
                    .on('click', (e) => {
                        console.log('overlay clicked')
                        that.set_burger_menu_state(false, false);
                    });
            }

            let menu_w = this.set_min_burger_menu_width(small_menu_w_inner, false); // no animation
            this.burger_menu_open = true;
            $('#menubar_content')
                .addClass('open');

            // move in menu bg
            $('#menubar_items')
                .css({
                    left: -this.small_menu_full_width+'px' //starting pos off screen
                })
                .stop().animate({
                    left: '-16px' /* slide in from the left */
                }, 200);

        }
        else { // back > close
            
            if (this.burger_menu_open_item) {

                console.log('closing burger menu open item '+this.burger_menu_open_item);

                $('#menubar_hamburger_close').text('Close');
                $('#hamburger_menu_label')
                    .text('')
                    .removeClass('graph_controls')
                    .css('display','none');

                let open_el = $(this.burger_menu_open_item);
                if (animate) {
                     // move the opened item all the way out
                    
                    let menu_w = this.set_min_burger_menu_width(small_menu_w_inner); // animates
                    open_el.stop().animate({
                        left: menu_w+'px'
                    }, 200, () => {
                        // hide when done
                        open_el.removeClass('hamburger-open') 
                    });
                    
                    // bring menu items back
                    $('#menubar_items > DIV').stop().animate({
                        left: '0px'
                    }, 200, () => {
        
                    });
                    
                    this.burger_menu_open_item = null; //next click closes
                    return; 

                } else {

                    open_el.stop().css({
                        left: '', //unset
                        top: '',
                        width: ''
                    }).removeClass('hamburger-open') 
                    $('#menubar_items > DIV').stop().css({
                        left: '0px',
                    });
                    this.burger_menu_open_item = null;

                }
            }
            
            console.log('closing burger menu');

            // close -> roll out to the left
            this.burger_menu_open = false;
            if (animate) {
                $('#menubar_items')
                .stop().animate({
                    left:  -this.small_menu_full_width+'px' //back to hidde
                }, 200, () => {
                    $('#menubar_content').removeClass('open');
                    $('#menubar_items').css({
                        left: '' //unset 
                    });
                });    
            } else {
                $('#menubar_items')
                    .stop().css({
                        left: '', //unset 
                        width: ''
                    });
                $('#menubar_content').removeClass('open');
                $('#menubar_items > DIV').stop().css({
                    left: '', //unset
                });
            }
            
            $('BODY').removeClass('no-scroll');
            $('#modal-underlay').css('display', 'none');
        }       
    }

    burger_menu_action(what) {

        if (!$('BODY').hasClass('hamburger') || !this.burger_menu_open)
            return;

        let now_opening = this.burger_menu_open_item === null;
        console.warn('Burger menu: '+what);
        this.burger_menu_open_item = what;
        // let small_menu_full_width = 255;

        $('#menubar_hamburger_close').text('Back');

        if (what == '#graph_display') {
            let min_w = $('#graph_display').css('min-width'); //?? +20; //+margin
            let menu_w = this.set_min_burger_menu_width(min_w);

            let el_w = (menu_w-20);
            let el = $(what);
            if (now_opening) {
                console.log('Now opening '+what);

                // move menu items out to the left
                $('#menubar_items > DIV').stop().animate({
                    left: -(this.small_menu_full_width+20)+'px'
                }, 200, () => {

                });

                $('#hamburger_menu_label')
                    .text(this.graph_menu.node_ids.length + ' Nodes / ' + this.graph_menu.topic_ids.length + ' Topics')
                    .addClass('graph_controls')
                    .css('display','block');

                el.css({
                        width: el_w + 'px', //10 is padding
                        left: (this.small_menu_full_width+20)+'px', // top right of the parent (moving) item
                        top: '0px'
                    })
                    .addClass('hamburger-open')
                    .stop();
                    // .animate({
                    //     left: this.small_menu_full_width + 'px', // compensate for moving parent menu item
                    //     width: el_w +'px' //10 is padding
                    // });
            } else {
                console.log('Now updating '+what);
                el.css({
                    width: el_w + 'px' //10 is padding
                });
            }
            
        } else {


        }

        // // $('BODY').addClass('menu-overlay');
        // let w_body = screen.availWidth;
        // if (w_body > 820) {
        //     w_body = 820;
        // }

        // let h_body = screen.availHeight;
        // let that = this;
        // $('#menubar_items').animate({
        //     left: '-16px', /* left screen edge */
        //     width: (w_body-10)+'px',
        //     height: (h_body-61)+'px',
        //   }, 5100, function() {
        //     console.log('yo menubar_items!');
        //     // Animation complete.
        //   });
        // $('#menubar_items > DIV').animate({
        //     left: '-'+(small_menu_full_width)+'px',
        //   }, 5100, function() {
        //     that.hamburger_menu_full_width = true;
        //     console.log('yo menubar_items > DIV!');
        //     // Animation complete.
        //   });

        // this.menu_overlay_el = $(what);
        
        // this.menu_overlay_el.css({
        //     'width': (w_body-20)+'px',
        //     'left': (w_body+small_menu_full_width)+'px',
        //     'height': (h_body-76)+'px',
        //     'top': '0px',
        //     'display': 'block'
        // }).animate({
        //     left: (small_menu_full_width-5)+'px',
        //   }, 5100, function() {
        //     that.menu_overlay_el.addClass('menu-overlay');
        //     console.log('yo !');
        //     // Animation complete.
        //   });
    }

    set_min_burger_menu_width(min_content_width, animate=true) {

        min_content_width = parseInt(min_content_width);
        let requisted_min_width = min_content_width;

        if (min_content_width <= this.small_menu_full_width)
            min_content_width = this.small_menu_full_width-10;
        else {
            min_content_width += 20;

            let w_body = $('body').innerWidth(); 
            if (min_content_width > w_body-200) {
                min_content_width = w_body-40; //expand to full if too close
            }
        }
            
        let current_w = parseInt($('#menubar_items').css('width'));
        // console.warn('set_min_burger_menu_width: '+min_width+'; current='+current_w);

        if (current_w != min_content_width) {
            if (animate) {
                $('#menubar_items')
                    .stop()
                    .animate({
                            width: min_content_width+'px'
                        }, 200, () => {
                    // console.warn('set_min_burger_menu_width DONE');
                    });
            } else {
                $('#menubar_items')
                    .stop()
                    .css({
                        width: min_content_width+'px'
                    });
            }
        }

        return min_content_width;
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

    cameras_menu_from_nodes_and_devices() {

        $('#cameras_list').empty();

        let cameras = [];

        // built in camera devices
        if (this.latest_cameras) {
            Object.values(this.latest_cameras).forEach((cam) => {
                cameras.push({
                    src_id: cam.id,
                    msg_type: 'video'
                });
            });
        }
        // all other forwarded fast h.264 encoded topics for convenience
        if (this.latest_nodes) {
            let node_ids = Object.keys(this.latest_nodes);
            node_ids.forEach((id_node) => {
                let node = this.latest_nodes[id_node];
                if (node.publishers) {
                    let topic_ids = Object.keys(node.publishers);
                    topic_ids.forEach((id_topic)=>{
                        let msg_type = node.publishers[id_topic].msg_types[0];
                        if (IsFastVideoTopic(msg_type)) {
                            cameras.push({
                                src_id: id_topic,
                                msg_type: msg_type
                            });
                        }
                    });
                }
            });
        }

        $('#cameras_heading .full-w').html(cameras.length == 1 ? 'Camera' : 'Cameras');
        $('#cameras_heading B').html(cameras.length);

        if (cameras.length > 0) {
            $('#camera_controls').addClass('active');
        } else {
            $('#camera_controls').removeClass('active');
        }

        for (let i = 0; i < cameras.length; i++) {
            let camera = cameras[i];

            $('#cameras_list').append('<div class="camera" data-src="'+camera.src_id+'" data-msg-type="'+camera.msg_type+'">'
                + '<input type="checkbox" class="enabled" id="cb_camera_'+i+'"'
                + (this.panels[camera.src_id] ? ' checked': '' )
                + '/> '
                + '<span '
                + 'class="camera" '
                + '>'
                + '<label for="cb_camera_'+i+'" class="prevent-select">'+camera.src_id+'</label>'
                + '</span>'
                + '</div>'
            );

            if (this.panels[camera.src_id]) {
                this.panels[camera.src_id].init(camera.msg_type);
            }
        }

        let that = this;
        $('#cameras_list INPUT.enabled:checkbox').change(function(event) {
            let id_cam = $(this).parent('DIV.camera').data('src');
            let msg_type = $(this).parent('DIV.camera').data('msg-type');
            let state = this.checked;

            let w = that.type_widgets[msg_type].w;
            let h = that.type_widgets[msg_type].h;

            that.toggle_panel(id_cam, msg_type, state, w, h);
        });

    }

    graph_from_nodes(nodes) {

        if (!this.graph_menu) {
            this.graph_menu = new GraphMenu(this);
        } 

        this.graph_menu.update(nodes);        

        $('#graph_nodes_label B').html(this.graph_menu.node_ids.length);
        $('#graph_topics_label B').html(this.graph_menu.topic_ids.length);
        $('#hamburger_menu_label.graph_controls').html(this.graph_menu.node_ids.length + ' Nodes / ' + this.graph_menu.topic_ids.length + ' Topics'); //update when open
        $('#graph_controls').addClass('active');
    }

    message_type_dialog(msg_type, onclose=null) {

        let msg_type_class = msg_type ? this.client.find_message_type(msg_type) : null;;
        let isTouch = isTouchDevice();
        let content = (msg_type_class ? JSON.stringify(msg_type_class, null, 2) : '<span class="error">Message type not loaded!</span>');

        if (!isTouch) {
            $('#msg_type-dialog')
                .html(content);
            $( "#msg_type-dialog" ).dialog({
                resizable: true,
                draggable: true,
                height: 700,
                width: 700,
                top: 180,
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
        } else {

            $('#touch-ui-dialog .title').html(msg_type);
            $('#touch-ui-dialog .content').html(content);
            $('BODY').addClass('no-scroll');
            $('#touch-ui-dialog').addClass('msg_type').css({
                display: 'block'
            });
            $('#touch-ui-dialog .content').scrollTop(0).scrollLeft(0);
            $('#close-touch-ui-dialog').unbind().click((e)=>{
                $('#touch-ui-dialog').css('display', 'none').removeClass('msg_type');
                $('BODY').removeClass('no-scroll');
            });
                
        }
        
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
            height: 300,
            width: 700,
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
        //  $('#widgets_heading').html('<b>'+num_widgets+'</b> '+(num_widgets == 1 ? 'Widget' : 'Widgets'));

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
                    continue; // not rendering internals (?!)
                
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
        
        $('#services_heading .full-w').html(num_services == 1 ? 'Service' : 'Services');
        $('#services_heading B').html(num_services);

        if (num_services > 0) {
            $('#service_controls').addClass('active');
        } else {
            $('#service_controls').removeClass('active');
        }

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
        panel.init(null);

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
        // console.error('Grid nodes:', this.grid.engine.nodes);

        
        this.grid.engine.nodes.forEach((node) => {
            let widget = node.el;

            let wl = null;
            if (node.grid && node.grid.engine && node.grid.engine._layouts) {
                let len = node.grid.engine._layouts.length;
                if (len && node.grid.engine.column !== (len - 1)) {
                    let layout = node.grid.engine._layouts[len - 1];
                    wl = layout.find(l => l._id === node._id);
                }
            }

            let x, y, w, h;
            if (wl) { //use layout instead of node vals
                x = wl.x;
                y = wl.y;
                w = wl.w;
                h = node.h;
            } else {
                x = node.x;
                y = node.y;
                w = node.w;
                h = node.h;
            }
            
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
            console.log('update_url_hash for '+id_source+': ', that.panels[id_source].display_widget);
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
        let panels_to_make_sorted = [];
        let max_panel_x = 0;
        let max_panel_y = 0;
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
            max_panel_x = Math.max(max_panel_x, x);
            max_panel_y = Math.max(max_panel_y, y);
            panels_to_make_sorted.push({
                'id_source': id_source,
                'w': w,
                'h': h,
                'x': x,
                'y': y,
                'src_on': src_on,
                'zoom': zoom,
                'custom_vars': custom_vars
            });
        }

        for (let y = 0; y <= max_panel_y; y++) {
            for (let x = 0; x <= max_panel_x; x++) {
                for (let j = 0; j < panels_to_make_sorted.length; j++) {
                    let p = panels_to_make_sorted[j];
                    if (p.x == x && p.y == y) {

                        this.make_panel(p.id_source, p.w, p.h, p.x, p.y, p.src_on, p.zoom, p.custom_vars)
                        if (this.widgets[p.id_source]) {
                            this.panels[p.id_source].init(p.id_source);
                        } // else if (this.widgets[id_source]) {
                        //     this.panels[id_source].init(id_source);
                        // }

                        break;
                    }
                }
            }
        }
        console.log('Sorting...')
        this.grid.engine.sortNodes();
        console.log('Sorted: ', this.grid.engine.nodes);

        this.widgets_menu();
        return this.panels;
    }

    update_webrtc_status() {
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
            $('#webrtc_status').html('<span class="online">'+state+'</span>'+(via_turn?' <span class="turn">[TURN]</span>':'<span class="online"> [P2P]<//span>'));
            $('#trigger_wifi_scan').removeClass('working')
            if (via_turn)
                this.set_dot_state(2, 'yellow', 'WebRTC connected to robot (TURN)');
            else 
                this.set_dot_state(2, 'green', 'WebRTC connected to robot (P2P)');
        } else if (state == 'Connecting') {
            $('#webrtc_status').html('<span class="connecting">'+state+'</span>');
            // $('#robot_wifi_info').addClass('offline')
            $('#trigger_wifi_scan').removeClass('working')
            this.set_dot_state(2, 'orange', 'WebRTC connecting...')
        } else {
            $('#webrtc_status').html('<span class="offline">'+state+'</span>');
            // $('#robot_wifi_info').addClass('offline')
            $('#trigger_wifi_scan').removeClass('working')
            this.set_dot_state(2, 'red', 'WebRTC '+state)
        }

    }

    set_dot_state(no, color, label) {
        $('#dot-'+no)
            .removeClass('green')
            .removeClass('yellow')
            .removeClass('orange')
            .removeClass('red')
            .addClass(color)
            .attr('title', label);
    }

    update_wifi_signal(percent) {
        let el = $('#network-info #signal-monitor');
        if (percent < 0)
            el.attr('title', 'Robot disconnected');
        else
            el.attr('title', 'Robot\'s wi-fi signal quality: '+Math.round(percent)+'%');

        el.removeClass('q25')
          .removeClass('q50')
          .removeClass('q75')
          .removeClass('q100');
        if (percent < 5)
            return;

        if (percent < 25)
            el.addClass('q25')
        else if (percent < 50)
            el.addClass('q50')
        else if (percent < 75)
            el.addClass('q75')
        else 
            el.addClass('q100');
    }

    update_num_peers(num) {
        if (num > 1) { // only show on more peers
            $('#network-info-peers')
                .html(num)
                .attr('title', 'Multiple peers are connected to the robot')
                .css({
                    'display': 'block',
                    'background-color': (num == 1 ? 'white' : 'yellow')
                });
        } else {
            $('#network-info-peers')
                .empty()
                .css('display', 'none')
        }
    }

    update_rtt(rtt_sec) {

        if (rtt_sec > 0) {
            let rtt_ms = rtt_sec * 1000; //ms

            // TODO: customize these in config maybe?
            let rttc = '';
            if (rtt_ms > 100)
                rttc = 'red'
            else if (rtt_ms > 50)
                rttc = 'orange'
            else if (rtt_ms > 30)
                rttc = 'yellow'
            else
                rttc = 'lime'
            
            $('#network-info-rtt')
                .html(rtt_ms+'ms')
                .css({
                    'color': rttc,
                    'display': 'block'
                });
        } else {

            $('#network-info-rtt')
                .empty()
                .css('display', 'none');
        }
        
    }

    set_body_classes(enabled_classes) {

        let all_body_classes = ['full-width', 'narrow', 'narrower', 'hamburger', 'top-menu', 'touch-ui', 'portrait', 'landscape'];
        let inactive_classes = [];
        
        for (let i = 0; i < all_body_classes.length; i++) {
            let c = all_body_classes[i];
            if (enabled_classes.indexOf(c) === -1)
                inactive_classes.push(c);
        }

        // console.log('Body removing/setting ', inactive_classes, enabled_classes);

        $('body')
            .removeClass(inactive_classes)
            .addClass(enabled_classes);
    }
    
    save_last_robot_name() {
        localStorage.setItem('last-robot-name:' + this.client.id_robot, this.client.name);
    }

    load_last_robot_name() {
        let name = localStorage.getItem('last-robot-name:' + this.client.id_robot);
        // console.log('Loaded keyboard driver for robot '+this.client.id_robot+':', dri);
        return name;
    }


    //on resize, robot name update
    update_layout_width() {

        const full_menubar_w = 705;
        const narrow_menubar_w = 575;
        const narrower_menubar_w = 535;

        let w_body = $('body').innerWidth();
        let w_right = $('#fixed-right').innerWidth();

        let label_el = $('h1 .label');
        label_el.removeClass('smaller'); 
        let w_left = $('#fixed-left').innerWidth();

        let w_netinfo = $('#network-info').innerWidth();
        
        let max_label_w = w_body-w_right-w_netinfo;
        // w_left += w_netinfo;
        
        label_el.css({
            'max-width': max_label_w+'px' 
        });
        // let w_left_is_2rows = label_el.hasClass('hamburger');
        if (w_body < full_menubar_w+w_right+w_left) {
            label_el.addClass('smaller');
        }

        w_left = $('#fixed-left').innerWidth();
        
        $('#fixed-center')
            .css({
                'margin-left': w_left+'px',
                'margin-right': w_right+'px',
        });

        let available_w_center = $('#fixed-center').innerWidth();

        let cls = [];
        let hb = false;

        let portrait = isPortraitMode();
        if (portrait) {
            cls.push('portrait');
        } else {
            cls.push('landscape');
        }

        if (portrait || available_w_center < narrower_menubar_w) { // .narrower menubar
            cls.push('hamburger');
            hb = true;
            available_w_center = w_body; //uses full page width
            // if (this.menu_overlay_el) {
    
            // }
        } else if (available_w_center < narrow_menubar_w) { // .narrow menubar
            cls.push('narrower');
            cls.push('top-menu');
        }
        else if (available_w_center < full_menubar_w) { // full menubar
            cls.push('narrow');
            cls.push('top-menu');
        } else {
            cls.push('full-width');
            cls.push('top-menu');
        }

        let graph_w_full = 825;
        if (hb) {
            $('#menubar_items').css({
                height: (window.innerHeight-60)+'px' // bg fills screenheight
            });
            
            //  let graph_w = $('#graph_display').innerWidth();
            // console.log('HB is on, full_w='+graph_w_full+' w_body='+w_body);
            let h = window.innerHeight-110;
            $('#graph_display').css('height', h);
            if (graph_w_full+45 > w_body) {
                $('#graph_display').addClass('narrow');
                // console.log('HB > narrow');
            } else {
                $('#graph_display').removeClass('narrow');
                if (this.graph_menu) {
                    let available_w = window.innerWidth - 35;
                    this.graph_menu.set_dimensions(available_w, h); // defaults
                }
                    
                // console.log('HB > full');
            }
            if (this.burger_menu_open_item) {
                this.burger_menu_action(this.burger_menu_open_item);
            }
        } else {
            if (this.burger_menu_open) {
                this.set_burger_menu_state(false, false); //no animations
            }
            $('#menubar_items').css({
                height: '' //unset
            });
            $('#graph_display').removeClass('narrow');
            $('#graph_display').css('height', ''); // unset
            if (this.graph_menu)
                this.graph_menu.set_dimensions(graph_w_full, 600); // defaults

        };

        $('BODY.touch-ui #touch-ui-dialog .content').css({
            'height': (portrait ? window.innerHeight-160 : window.innerHeight-90) +'px'
        });

        //this.update_graph_menu_size();

        // let w_graph_menu = w_body+20;
        // let enough_room_for_graph = w_graph_menu > 800;

        // if (hb && !enough_room_for_graph && this.menu_overlay_el) {
        //     // let cnt = $('#menubar_content');
        //     $('#menubar_items')
        //         .addClass('narrow');
        //     // $('#service_list').appendTo(cnt);
        //     // $('#cameras_list').appendTo(cnt);
        //     // $('#docker_list').appendTo(cnt);
        //     // $('#widget_list').appendTo(cnt);
        // } else {
        //     $('#menubar_items')
        //         .removeClass('narrow');
        //     // $('#service_list').appendTo($('#service_controls'));
        //     // $('#cameras_list').appendTo($('#camera_controls'));
        //     // $('#docker_list').appendTo($('#docker_controls'));
        //     // $('#widget_list').appendTo($('#widget_controls'));
        // }

        // if (enough_room_for_graph) {
        //     w_graph_menu = 800;
        // }

        // if ($('#graph_display').hasClass('menu-overlay')) {
        //     $('#graph_display').css({
        //         'width': w_graph_menu+'px'
        //     });
        // } 
        
        // // if (this.hamburger_menu_full_width) {
        // if ($('#menubar_items').hasClass('narrow')) {
        //     $('#menubar_items').css({
        //         'width': (w_body+30)+'px', 
        //     });
        // } else {
        //     $('#menubar_items').css({
        //         'width': '', 
        //     });
        // }
        
        //}

        let direct_editing_enabled = true;
        if (isTouchDevice()) {
            direct_editing_enabled = false;
            cls.push('touch-ui');  //TEMP
        }
            

        Object.values(this.panels).forEach((p)=>{
            if (p.editing)
                return;

            if (direct_editing_enabled) 
                $(p.grid_widget).addClass('editing');
            else
                $(p.grid_widget).removeClass('editing');
            this.grid.resizable(p.grid_widget, direct_editing_enabled);
            this.grid.movable(p.grid_widget, direct_editing_enabled);
        });

        this.set_body_classes(cls);

        $('body').addClass('initiated');

        let net_el = $('#network-info-wrapper #network-details');
        if (w_body < 600) {
            net_el
                .addClass('one-column')
                .css('width', w_body+20); //+padding
        } else {
            net_el
                .removeClass('one-column') 
                .css('width', ''); // unset
        }

        // console.log('Layout: body='+w_body+'; left='+w_left+'; right='+w_right+'; net='+w_netinfo+'; av center='+available_w_center);

        // console.info('body.width='+w+'px');
        // if (w < 1500)
        //     $('#robot_wifi_info').addClass('narrow_screen')
        // else
        //     $('#robot_wifi_info').removeClass('narrow_screen')
        
        Object.values(this.panels).forEach((panel)=>{
            panel.onResize();
        });

    }

    update_wifi_status(msg) { // /iw_status in
        // console.warn('UpdateIWStatus', msg)
        
        let qPercent = (msg.quality / msg.quality_max) * 100.0;
        this.update_wifi_signal(qPercent);

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

        let html = '<div class="section-label">Connected to Wi-Fi</div>' +
                    '<span class="label space">SSID:</span> '+msg.essid+'<br>'+
                    '<span class="label">Access Point:</span> '+msg.access_point+'<br>'+
                    '<span class="label">Frequency:</span> '+(msg.frequency ? msg.frequency.toFixed(3) : null)+' GHz<br>' +
                    '<span class="label">BitRate:</span> '+(msg.bit_rate ? msg.bit_rate.toFixed(1) : null) + ' Mb/s<br> ' +
                    '<span class="label" title="'+msg.quality+'/'+msg.quality_max+'" style="cursor:help;">Quality:</span> '+(qPercent).toFixed(0)+'%<br> ' +
                    '<span class="label">Level:</span> '+ msg.level + '<br> ' +
                    '<span class="label">Noise:</span> ' + msg.noise + ' '
                    ;

        // $('#network-info-rtt').html();
        this.update_num_peers(msg.num_peers);
       
        // + ' ' + (msg.num_peers==1?'peer':'peers')

        $('#trigger_wifi_scan').css('display', msg.supports_scanning ? 'inline-block' : 'none')
        // $('#robot_wifi_info').removeClass('offline');

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
                this.update_rtt(min_rtt);
            }
        }

        $('#robot_wifi_info')
            .html(html)
            .css('display', 'block');
    }



}