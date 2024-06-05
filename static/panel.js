
import { IsImageTopic, IsFastVideoTopic} from '/static/browser-client.js';

import { lerpColor, linkifyURLs, escapeHtml, roughSizeOfObject, isTouchDevice, isSafari } from "./lib.js";

export class Panel {

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

    graph_menu = null;

    max_trace_length = 100;
    zoom = null;
    default_zoom = 1;

    grid_widget = null;

    initiated = false;
    init_data = null;
    resize_event_handler = null;
    src_visible = false;
    editing = false;
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

        this.widget_menu_cb = null;
        this.floating_menu_top = null;

        this.n = Panel.PANEL_NO++;
        //let display_source = false;

        let html =
            '<div class="grid_panel" data-source="'+id_source+'">' +
                '<h3 class="panel-title" id="panel_title_'+this.n+'" title="'+id_source+'">'+id_source+'</h3>' +
                '<span class="notes"></span>' +
                '<div class="monitor_menu prevent-select" id="monitor_menu_'+this.n+'">' +
                    '<div class="monitor_menu_content" id="monitor_menu_content_'+this.n+'"></div>' +
                '</div>' +
                '<div class="panel_content_space" id="panel_content_space_'+this.n+'">' +
                    '<div class="panel_widget'+(this.src_visible?' source_visible':'')+'" id="panel_widget_'+this.n+'"></div>' +
                    '<div class="panel_source'+(this.src_visible?' enabled':'')+'" id="panel_source_'+this.n+'">Waiting for data...</div>' +
                    '<div class="cleaner"></div>' +
                '</div>' +
                //'<div class="panel_msg_type" id="panel_msg_type_'+this.n+'"></div>' +
            '</div>'

        let widget_opts = {
            w: w,
            h: h,
            content: html
        };
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

        if (panels[id_source]) {
            console.error('PANEL ALREADY EXITED FOR '+id_source);
        }

        panels[id_source] = this;

        console.log('Adding widget '+id_source+': ', widget_opts);
        this.grid_widget = grid.addWidget(widget_opts);

        this.ui.client.on(id_source, this._on_data_context_wrapper);

        window.setTimeout(()=>{
            panels[id_source].onResize()
        }, 300); // resize at the end of the animation

        if (!this.editBtn) {
            // pause panel updates
            this.editBtn = $('<span id="edit_panel_'+this.n+'" class="edit-panel-button" title="Edit panel"></span>');
            this.editBtn.insertBefore('#monitor_menu_'+this.n);
        }

        let that = this;
        this.editBtn.click(function(e) {
            let w = $(that.grid_widget);
            console.log('Edit clicked, editing='+that.editing);
            if (!that.editing) {
                that.editing = true;
                w.addClass('editing');
                that.ui.grid.resizable(that.grid_widget, true);
                that.ui.grid.movable(that.grid_widget, true);
            } else {
                that.editing = false;
                w.removeClass('editing');
                that.ui.grid.resizable(that.grid_widget, false);
                that.ui.grid.movable(that.grid_widget, false);
            }
            
            e.cancelBubble = true;
            return false;
        });

        this.edit_timeout = null;
        let title_el = document.getElementById('panel_title_'+this.n);
        title_el.addEventListener('touchstart', (ev) => {
            if (that.editing)
                return;
            console.log('Touch start '+id_source);
            that.edit_timeout = window.setTimeout(()=>{
                if (!that.editing) {
                    let w = $(that.grid_widget);
                    that.editing = true;
                    w.addClass('editing');
                    that.ui.grid.resizable(that.grid_widget, true);
                    that.ui.grid.movable(that.grid_widget, true);
                }
            }, 2000); // hold panel label for 2s to edit
        }, {'passive':true});

        title_el.addEventListener('touchend', () => {
            if (that.editing)
                return;
            if (that.edit_timeout) {
                window.clearTimeout(that.edit_timeout);
                that.edit_timeout = null;
            }
            console.log('Touch end '+id_source);
        }, {'passive':true});

        this.last_content_space_click = null;
        this.maximized = false;

        $('#panel_content_space_'+this.n).on('touchstart', (ev) => {
            if (that.editing)
                return;

            if (ev.touches.length != 1) {
                that.last_content_space_click = null;
                return;
            }
        
            // if (that.edit_timeout) {
            //     window.clearTimeout(that.edit_timeout);
            //     that.edit_timeout = null;
            // }
            
            if (that.last_content_space_click &&
                Date.now() - that.last_content_space_click < 250) {
                // console.log('Duble Clicked '+id_source);
                that.last_content_space_click = null;
                that.maximize(!that.maximized);
                return;
            } 

            // console.log('Clicked '+id_source);
            that.last_content_space_click = Date.now();
        });

        
        let menu_content_el = document.getElementById('monitor_menu_'+this.n);
        this.menu_el = $(menu_content_el);
        this.menu_content_el = $('#monitor_menu_content_'+this.n);
        this.menu_el.on('click', () => {
            if (!isTouchDevice())
                return;
            that.ui.panel_menu_touch_toggle(that);
        });
        
        if (!isTouchDevice()) {
            this.menu_el.on('mouseenter', () => {
                this.menu_el.removeClass('hover_waiting');
            });
        }


        menu_content_el.addEventListener('touchstart', (ev) => {
            console.log('menu touchstart', ev);
            // ev.preventDefault();
            that.ui.menu_locked_scroll = true;
        
            // ev.stopPropagation();
        }, { passive: true});

        // this.menu_content_el.on('touchmove', {passive: false}, (ev) => {
        //     console.log('menu touchmove', ev);
        //     ev.preventDefault();
        //     // that.ui.menu_locked_scroll = true;
        
        //     ev.stopPropagation();
        // });

        menu_content_el.addEventListener('touchend', (ev) => {
            console.log('menu touchend', ev);
            // ev.preventDefault();
            that.ui.menu_locked_scroll = null;
            // ev.stopPropagation();
        }, { passive: true });
    }

    // init with message type when it's known
    // might get called with null gefore we receive the message type
    init(msg_type=null) {

        console.log('Panel init '+this.id_source+'; msg_type='+msg_type);

        let fallback_show_src = true;

        if (!this.pauseEl) {
            // pause panel updates
            this.pauseEl = $('<span id="pause_panel_'+this.n+'" class="pause-panel-button paused" title="Waiting for data..."></span>');
            this.pauseEl.insertBefore('#monitor_menu_'+this.n);
        }

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
                console.log('Initiating display topic widget '+this.id_source, this.display_widget)
                if (!this.display_widget) { //only once
                    // $('#display_panel_source_link_'+this.n).css('display', 'block');
                    this.display_widget = new this.ui.topic_widgets[this.id_source].widget(this, this.id_source); //no data yet
                    fallback_show_src = false;
                }
            } else if (this.ui.type_widgets[this.msg_type] != undefined) {
                console.log('Initiating display type widget '+this.id_source+' w '+this.msg_type, this.display_widget)
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

            this.ui.update_url_hash();
            this.setMenu()

            if (this.paused) {
                this.pauseEl.addClass('paused');
                this.pauseEl.attr('title', 'Unpause');
            } else {
                this.pauseEl.removeClass('paused');
                this.pauseEl.attr('title', 'Pause');
            }
            let that = this;
            this.pauseEl.click(function(e) {
                that.pauseToggle();
                e.cancelBubble = true;
                return false;
            });
        } else if (!this.initiated) {
            this.setMenu(); //draw menu placeholder fast without type
        }
        
        this.onResize();
    }

    pauseToggle() {
        this.paused = !this.paused;
        console.log('Panel updates paused '+this.paused);
        if (this.paused) {
            this.pauseEl.addClass('paused');
            this.pauseEl.attr('title', 'Unpause');
        } else {
            this.pauseEl.removeClass('paused');
            this.pauseEl.attr('title', 'Pause');
        }
        if (this.display_widget && this.display_widget.is_video) {
            this.display_widget.el.trigger(this.paused ? 'pause' : 'play');    
        }
    }

    _on_data_context_wrapper = (msg, ev) => {

        if (!this.initiated) {
            this.init_data = [ msg, ev ]; //store for after init
            return;
        }

        if (['video', 'sensor_msgs/msg/Image', 'sensor_msgs/msg/CompressedImage', 'ffmpeg_image_transport_msgs/msg/FFMPEGPacket'].indexOf(this.msg_type) > -1) {
            this.on_stream(stream);
        } else {
            this.on_data(msg, ev);
        }

    }

    setMenu() {

        console.log('Setting up panel menu of ' + this.id_source)

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
            if (this.display_widget && !IsImageTopic(this.msg_type)) {
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

        let closeEl = $('<div class="menu_line" id="close_panel_menu_'+this.n+'"><a href="#" id="close_panel_link_'+this.n+'">Remove panel</a></div>');
        closeEl.click(function(ev) {
            that.close();
            if (that.ui.widgets[that.id_source])
                that.ui.widgets_menu();
            ev.cancelBubble = true;
            ev.preventDefault();
        });
        if (els.length == 0)
            closeEl.addClass('solo');
        els.push(closeEl);

        $('#monitor_menu_content_'+this.n).empty();
        $('#monitor_menu_content_'+this.n).html('<div class="hover_keeper"></div>');
        this.menu_content_underlay = $('<div class="menu_content_underlay"></div>');
        $('#monitor_menu_content_'+this.n).append(this.menu_content_underlay);

        // let linesCont = $('<div class="menu_lines"></div>');
        for (let i = 0; i < els.length; i++) {
            $('#monitor_menu_content_'+this.n).append(els[i]);
        }

        if (this.widget_menu_cb != null) {
            this.widget_menu_cb();
        }

    }

    auto_menu_position() {
        let menu_el = $('#monitor_menu_'+this.n);
        let content_el = $('#monitor_menu_content_'+this.n);
        if (!menu_el.length || !content_el.length)
            return;
        let pos = menu_el.offset();
        if (!isTouchDevice() && pos.left < 330 && !$('#grid-stack').hasClass('gs-1')) { //not in 1-col mode
            menu_el.addClass('right');
        } else {
            menu_el.removeClass('right');
        }
    }

    getAvailableWidgetSize() {

        let ref = this.grid_widget;

        let w = $(ref).innerWidth();
        let h = parseInt($(ref).css('height'));

        // console.log('Max h', h);

        if (!this.maximized) {
            w -= 20;
            h -= 56;
        }

        return [w, h];
    }

    onResize() {

        [ this.widget_width, this.widget_height ] = this.getAvailableWidgetSize();

        // console.info('Resizing panel widget for '+ this.id_source+' to '+this.widget_width +' x '+this.widget_height);

        $('#panel_widget_'+this.n).parent()
            .css('height', this.widget_height)

        $('#panel_source_'+this.n)
            .css('height', this.widget_height-24)

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

    maximize(state=true) {
        // if (state == this.maximized)
        //     return;
        if (state) {

            if (isTouchDevice())
                this.ui.openFullscreen();

            let h = window.innerHeight; //does not work on mobils afari (adddress bar is not included)
            if (isTouchDevice() && isSafari()) {
                h = '100dvh';
            }
            console.log(`Maximizing panel ${this.id_source} w.height=${h}`);
            $('BODY').addClass('no-scroll');
            this.ui.set_maximized_panel(this);
            $(this.grid_widget)
                .addClass('maximized')
                .css({
                    top: $(window).scrollTop()-60,
                    height: h
                });

            this.ui.grid.resizable(this.grid_widget, false);
            this.ui.grid.movable(this.grid_widget, false);
            
        } else {
            console.log(`Unmaximizing panel ${this.id_source}`);
            if (this.ui.maximized_panel == this) {
                this.ui.set_maximized_panel(null);
            }
            $(this.grid_widget)
                .removeClass('maximized')
                .css({
                    top: '',
                    height: ''
                });
            $('BODY').removeClass('no-scroll');

            if (!isTouchDevice()) {
                this.ui.grid.resizable(this.grid_widget, true);
                this.ui.grid.movable(this.grid_widget, true);
            }

            // if (isTouchDevice())
            //     this.ui.closeFullscreen();

        }
        this.maximized = state;
        let that = this;

        let start = Date.now();
        // console.log('animating onresize')
        let resize_timer = window.setInterval(()=>{
            that.onResize();
            let done_animating = start + 1000 < Date.now();
            if (done_animating) {
                // console.log('done animating, stopping onresize')
                window.clearInterval(resize_timer);
            }
        }, 10);
        // window.setTimeout(()=>{
        //     that.onResize()
        // }, 500); // resize at the end of the animation
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
            
            if (raw_len < 10000) {
                datahr = JSON.stringify(msg, null, 2);
            } else {
                datahr = '';
                let trimmed = {};
                if (msg.header)
                    trimmed.header = msg.header;
                if (msg.format)
                    trimmed.format = msg.format;
                
                datahr += JSON.stringify(trimmed, null, 2)+'\n\n';
                datahr += '-- trimmed --'
            }
            
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

    close() { // remove panel

        if (this.ui.panel_menu_on === this)
            this.ui.panel_menu_touch_toggle();  //remove open menu

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

        if ($('.camera[data-src="'+this.id_source+'"] INPUT:checkbox').length > 0) {
            // $('.topic[data-toppic="'+that.id_source+'"] INPUT:checkbox').click();
            $('.camera[data-src="'+this.id_source+'"] INPUT:checkbox').removeClass('enabled'); //prevent eventhandler
            $('.camera[data-src="'+this.id_source+'"] INPUT:checkbox').prop('checked', false);
            $('.camera[data-src="'+this.id_source+'"] INPUT:checkbox').addClass('enabled');
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
