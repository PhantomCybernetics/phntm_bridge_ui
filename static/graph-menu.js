
import { IsImageTopic} from '/static/browser-client.js';
import { isTouchDevice } from './inc/lib.js'

export class GraphMenu {

    constructor(ui) {

        this.ui = ui;

        this.graph_display_el = $('#graph_display')
        this.node_container_el = $('<div id="graph_nodes"></div>');

        this.topic_container_el = $('<div id="graph_topics"></div>');
        this.topic_scrolling_el = $('<div id="graph_topics_scrolling"></div>');
        this.topic_container_el.appendTo(this.topic_scrolling_el);

        this.tooltip_el = $('<div class="tooltip"></div>');

        this.graph_display_el.empty();
        this.pointer_coords = [0, 0];
        let that = this;

        this.graph_display_el.on('mousemove touchstart', (ev) => {
            let off = that.graph_display_el.offset();
            if (ev.targetTouches)
                that.pointer_coords = [ev.targetTouches[0].pageX-off.left, ev.targetTouches[0].pageY-off.top];
            else
                that.pointer_coords = [ev.pageX-off.left, ev.pageY-off.top];
        });

        this.graph_display_el
            .append(this.node_container_el)
            .append(this.topic_scrolling_el)
            .append(this.tooltip_el);
        
        this.topics = {};
        this.nodes = {};
        this.links = [];
        this.node_ids = [];
        this.topic_ids = [];
        
        this.focused_id_node = null;
        this.focused_topic = null;
        this.hovered_id_node = null;
        this.hovered_topic = null;

        this.color_read = 'rgb(19 144 255)'; //blue
        this.color_write = 'magenta';
        this.color_hover = 'orange';    
        this.color_err = 'red';

        this.margin = {top: 0, right: 0, bottom: 0, left: 0};
        this.width_svg = 0;
        this.height = 0;
        this.is_narrow = false;

        let available_w = 825; // top menu defauls
        let available_h = 600; //
        if ($('BODY').hasClass('hamburger')) {
            available_w = window.innerWidth - 35;
            available_h = $(window).height()-110;
        }
        this.set_dimensions(available_w, available_h);

        // append the svg object to the body of the page
        this.svg = d3.select("#graph_topics_scrolling")
            .append("svg")
            .attr("id","svg-graph")
            .attr("width", this.width_svg)
            .attr("height", this.height)
            .append("g")
                .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        function createMarker(id_marker, color, size) {
            that.svg.append('defs')
            .append("marker")
                .attr("id", id_marker)
                .attr("orient", 'auto-start-reverse')
                .attr("viewBox", '0 0 5 5')
                .attr("markerWidth", size)
                .attr("markerHeight", size)
                .attr("refX",2.5)
                .attr("refY",2.5)
                .append('polygon')
                    .attr('points', '0,5 1.6666666666666667,2.5 0,0 5,2.5')
                    .style("fill", color);
        }

        createMarker('marker-read', this.color_read, 4);
        createMarker('marker-write', this.color_write, 8);

        createMarker('marker-err-read', this.color_err, 4);
        createMarker('marker-hover-read', this.color_hover, 4);
        createMarker('marker-hover-write', this.color_hover, 8);

        this.svg_el = this.graph_display_el.find('svg');

        this.topic_scrolling_el.on('scroll', (e) => {
            that.force_link_unfocus();
            that.redraw_links();
        });
        this.node_container_el.on('scroll', (e) => {
            that.force_link_unfocus();
            that.redraw_links();
        });
        // document.getElementById('svg-graph').addEventListener('wheel', (ev) => {
        //     console.log(ev);
        // });
        // $(this.svg_el)[0].addEventListener('wheel', (ev) => {
        //     ev.preventDefault();
        //     let curr = that.topic_scrolling_el.scrollTop();
        //     that.topic_scrolling_el.scrollTop(curr+ev.deltaY);
        // });

        // let touchStartY;
        // $(this.svg_el)[0].addEventListener('touchstart', (ev) => {
        //     touchStartY = ev.touches[0].clientY;
        // });
        // $(this.svg_el)[0].addEventListener('touchmove', (ev) => {
        //     const touchEndY = ev.touches[0].clientY;
        //     const deltaY = touchStartY - touchEndY;
        //     let curr = that.topic_scrolling_el.scrollTop();
        //     that.topic_scrolling_el.scrollTop(curr+deltaY);
        //     touchStartY = touchEndY;
        // });
    }

    set_narrow(state=true) {
        if (state) {
            if (!this.is_narrow) {
                this.graph_display_el.addClass('narrow');
                this.reset_focus();
            }
        } else if (this.is_narrow) {
            this.graph_display_el.removeClass('narrow');
        }
        this.is_narrow = state;
    }

    set_dimensions(available_w, h) {
        
        if (h === null) {
            h = this.graph_display_el.innerHeight()-20;
            // console.log('h was null, is '+h+'; is_narrow'+this.is_narrow);
        }

        // console.log('set_dimensions w='+available_w+' h='+h+'; is_narrow='+this.is_narrow);

        if (this.is_narrow) {
            this.graph_display_el.css({
                'width': available_w
            });
            // this.topic_scrolling_el.css({
            //     // 'padding-left': 0,
            //     'width': available_w-20
            // });
        } else {
            let old_w = this.width_svg;
            let old_h = this.height;
    
            let w_svg = available_w - 300 - 300 - 20;
            // console.log('Setting GM dimentions for available w: '+full_w+' => svg='+w_svg);
            this.width_svg = w_svg - this.margin.left - this.margin.right;
            this.height = h - this.margin.top - this.margin.bottom;
    
            if (this.width_svg < 0)
                this.width_svg = 0;
            // if (this.width > )
    
            if (this.height < 0)
                this.height = 0;
    
            // this.topic_scrolling_el.css('padding-left', this.width_svg);
            if (this.svg) {
                // console.log('updating svg dimenstions to ' + this.width + 'x' + this.height +'');
                $('#graph_display svg').attr({
                    "width": this.width_svg,
                    "height": this.height
                });
                this.svg
                    .attr("width", this.width_svg)
                    .attr("height", this.height);
                if (old_w != this.width_svg || old_h != this.height) {
                    this.force_link_unfocus();
                    this.redraw_links();
                }
            }
        } 
    }

    set_link_tooltip (link, el, topic=false) {

        const NS_TO_SEC = 1000000000.0;

        let durability = '';
        switch (link.qos.durability) {
            case 0: durability = 'SYSTEM_DEFAULT'; break;
            case 1: durability = 'TRANSIENT_LOCAL'; break;
            case 2: durability = 'VOLATILE'; break;
            case 3: durability = 'UNKNOWN'; break;
        }

        let reliability = '';
        switch (link.qos.reliability) {
            case 0: reliability = 'SYSTEM_DEFAULT'; break;
            case 1: reliability = 'RELIABLE'; break;
            case 2: reliability = 'BEST_EFFORT'; break;
            case 3: reliability = 'UNKNOWN'; break;
        }

        let history = '';
        switch (link.qos.history) {
            case 0: history = 'SYSTEM_DEFAULT'; break;
            case 1: history = 'KEEP_LAST'; break;
            case 2: history = 'KEEP_ALL'; break;
            case 3: history = 'UNKNOWN'; break;
        }

        let tooltip = (link.group == 1 ? 'Publisher QoS:' : 'Subscriber QoS:');
    
        if (link.qos_error || link.qos_warning) {
            el.addClass('error');
        } else {
            el.removeClass('error');
        }

        if (topic)
            tooltip += '<br>Topic: \n'+link.topic+'<br>\n';

        tooltip += "<br>\n"
            + 'Reliability: ' + reliability + "<br>\n"
            + 'Durability: ' + durability + "<br>\n"
            + 'Lifespan: ' + (link.qos.lifespan < 0 ? 'INFINITE' : (link.qos.lifespan / NS_TO_SEC) + 's') + "<br>\n"
            + 'Deadline: ' + (link.qos.deadline < 0 ? 'INFINITE' : (link.qos.deadline / NS_TO_SEC) + 's') + "<br>\n"
            + 'History: ' + history + "<br>\n"
            + 'Depth: ' + link.qos.depth;

        if (link.qos_error) {
            tooltip += '<br><span class="err">';
            let lines = link.qos_error.split(';');
            lines.forEach((l)=>{
                tooltip += '<br>' + l;
            });
            tooltip += '</span>';
        }
        if (link.qos_warning) {
            tooltip += '<br><span class="warn">';
            let lines = link.qos_warning.split(';');
            lines.forEach((l)=>{
                tooltip += '<br>' + l;
            });
            tooltip += '</span>';
        }

        el.html(tooltip);
    }

    update(nodes) {
        
        this.node_ids = Object.keys(nodes);
        this.node_ids.sort();
        
        this.nodes = {};
        this.links = [];
        this.topics = {};

        this.node_container_el.empty();
        this.topic_container_el.empty();
        
        this.svg.selectAll("path").remove();

        // console.log('Graphing ', nodes);
        let that = this;

        let node_offset = 0;
        this.node_ids.forEach((id_node) => {

            if (!this.nodes[id_node]) {
                this.nodes[id_node] = {
                    connections: 0,
                    connections_drawn: [],
                    offset: node_offset,
                    focused: false,
                    focused_connection: false,
                };
            }

            let node_links = [];
            if (nodes[id_node].publishers) {
                let topic_ids = Object.keys(nodes[id_node].publishers);
                topic_ids.forEach((id_topic)=>{
                    if (this.topics[id_topic] === undefined) {
                        this.topics[id_topic] = {
                            connections: 1,
                            msg_type: nodes[id_node].publishers[id_topic].msg_type
                        };
                    } else {
                        this.topics[id_topic]['connections']++;
                    }
                    this.nodes[id_node]['connections']++;
                    node_links.push({
                        node: id_node,
                        topic: id_topic,
                        group: 1, // write
                        qos: nodes[id_node].publishers[id_topic].qos
                    });
                });
            }

            if (nodes[id_node].subscribers) {
                let topic_ids = Object.keys(nodes[id_node].subscribers);
                topic_ids.forEach((id_topic)=>{
                    if (this.topics[id_topic] === undefined) {
                        this.topics[id_topic] = {
                            connections: 1,
                            msg_type: nodes[id_node].subscribers[id_topic].msg_type
                        };
                    } else {
                        this.topics[id_topic]['connections']++;
                    }
                    this.nodes[id_node]['connections']++;
                    node_links.push({
                        node: id_node,
                        topic: id_topic,
                        group: 2, // read
                        qos: nodes[id_node].subscribers[id_topic].qos,
                        qos_error: nodes[id_node].subscribers[id_topic].qos_error,
                        qos_warning: nodes[id_node].subscribers[id_topic].qos_warning
                    });
                });
            }

            //sort node connectinos by topic asc (connections will go top to bottom without crossing)
            node_links.sort((a, b) => {
                if (a.topic < b.topic) return -1;
                if (a.topic > b.topic) return 1;
                return 0;
            });
            node_links.forEach((new_link)=>{
                this.links.push(new_link)
            });

            let h = 20+5*(this.nodes[id_node]['connections']-1);
            node_offset += h + 2 + 16;
            let node_el = $('<div class="graph_node"></div>');
            let box_el = $('<div class="box" style="height:'+h+'px;">'+id_node+'</div>')
            
            if (this.ui.client.discovered_nodes[id_node] && this.ui.client.discovered_nodes[id_node].params_editable) {  
                let params_icon_el = $('<span class="params-edit-icon" title="Edit runtime ROS parameters"></span>')
                params_icon_el.click((e)=>{
                    e.cancelBubble = true;
                    e.stopPropagation();
                    that.ui.node_params_dialog.show(this.ui.client.discovered_nodes[id_node]);
                });
                let node_icons_el = $('<div class="icons"></div>');
                node_el.append(node_icons_el);
                params_icon_el.appendTo(node_icons_el);

                node_links.forEach((node_link)=>{
                    if (node_link.qos_error || node_link.qos_warning) {
                        let icon_err = $('<span class="link-err-icon" tabindex="0"></span>');
                        let icon_tooltip_el = $('<span class="tooltip"></span>');
                        icon_tooltip_el.appendTo(icon_err);
                        icon_err.appendTo(node_icons_el);
                        that.set_link_tooltip(node_link, icon_tooltip_el, true);
                        icon_err.on('click', (ev) => {
                            if (isTouchDevice()) {
                                if (!icon_err.hasClass('active')) {
                                    icon_err.addClass('active');
                                } else {
                                    icon_err.removeClass('active');
                                }
                            }
                            if (that.focused_id_node == id_node) {
                                ev.stopPropagation(); // only select, no unselect
                            }
                        });
                        icon_err.on('blur', (ev) => {
                            if (isTouchDevice()) {
                                icon_err.removeClass('active');
                            }
                        });
                    }
                });
            }
            
            node_el.prepend(box_el);
            this.nodes[id_node].el = box_el;
            this.node_container_el.append(node_el);

            if (!isTouchDevice()) {
                node_el.on('mouseenter', (e) => {
                    that.hoverNode(id_node, true); 
                });
                node_el.on('mouseleave', (e) => {
                    that.hoverNode(id_node, false); 
                });
            }
            node_el.on('click', (e) => {
                that.nodeFocusToggle(id_node); 
            });
        });
    
        this.topic_ids = Object.keys(this.topics);
        this.topic_ids.sort();

        let topic_offset = 0;
        let n = 0;
        this.topic_ids.forEach((topic) => {

            this.topics[topic].connections_drawn = [];
            this.topics[topic].focused = false;
            this.topics[topic].focused_connection = false;
            this.topics[topic].offset = topic_offset;
            let h = 40+5*(this.topics[topic]['connections']-1);
            topic_offset += h + 2 + 16;
            let topic_el = $('<div class="graph_topic"></div>');
            let msg_type_classes = [ 'msg_type' ];
            let title = this.topics[topic].msg_type;
            if (IsImageTopic(this.topics[topic].msg_type)) {
                msg_type_classes.push('video');
                title += ' transported as H.264 video';
            }
            if (!this.ui.client.findMessageType(this.topics[topic].msg_type)) {
                msg_type_classes.push('err');
                title += ' unsupported message type';
            }
            
            let box_el = $('<div class="box" style="height:'+h+'px;">'
                        + '<label for="topic_'+n+'" title="'+topic+'" class="prevent-select">' + topic + '</label><br>'
                        + '<a href="#" class="'+msg_type_classes.join(' ')+'" '
                            + 'title="'+title+'">'+this.topics[topic].msg_type+'<span class="icon"></span></a>'
                        + '</div>');
            let chb = $('<input type="checkbox" id="topic_'+n+'"/>');
            if (this.ui.panels[topic])
                chb.attr('checked', true);
            box_el.prepend(chb);
            topic_el.prepend(box_el);
            let lbl = box_el.find('label');

            n++;
            this.topics[topic].el = box_el;
            this.topics[topic].chb = chb;
            this.topic_container_el.append(topic_el);

            if (!isTouchDevice()) {
                topic_el.on('mouseenter', (e) => {
                    that.hover_topic(topic, true); 
                });
     
                topic_el.on('mouseleave', (e) => {
                    that.hover_topic(topic, false); 
                });
            }

            topic_el.on('click', (e) => {
                if (that.is_narrow)
                    return;
                
                that.topicFocusToggle(topic); 
            });

            chb.on('click', (e) => {
                e.stopPropagation();
            });

            lbl.on('click', (e) => {
                e.stopPropagation();
            });

            chb.on('change', (e) => {

                if (chb.hasClass('disabled'))
                    return;

                let state = chb.prop('checked');
                // console.log('CB '+topic+': '+state);

                let w = 3; let h = 3; //defaults overridden by widgets
                let msg_type = that.topics[topic].msg_type;

                if (that.ui.topic_widgets[topic]) {
                    w = that.ui.topic_widgets[topic].w;
                    h = that.ui.topic_widgets[topic].h;
                } else if (that.ui.type_widgets[msg_type]) {
                    w = that.ui.type_widgets[msg_type].w;
                    h = that.ui.type_widgets[msg_type].h;
                }

                that.ui.togglePanel(topic, msg_type, state, w, h);

                if (state && $('BODY').hasClass('hamburger')) {
                    //close burger menu
                    that.ui.setBurgerMenuState(false, false);
                }
            });

            box_el.find('.msg_type').on('click', (e)=>{
                
                e.cancelBubble = true;
                e.stopPropagation();

                $('#graph_controls').addClass('hover_waiting'); //this will keep menu open (removed on next mouse enter)

                that.ui.messageTypeDialog(that.topics[topic].msg_type);

                return false;
            });

        });

        this.links.forEach((link) => {

            let n = this.nodes[link.node];
            let t = this.topics[link.topic];
            
            link.focused_connection = false;
            link.node_conn_no = n.connections_drawn.length;
            link.topic_conn_no = t.connections_drawn.length;
            
            n.connections_drawn.push(link);
            t.connections_drawn.push(link);

            link.node_num_conns = n.connections_drawn.length;
            link.topic_num_conns = t.connections_drawn.length;
            
            link.path = this.svg
                .append("path")
                .attr("d", this.get_link_path(link))
                .style("stroke", link.qos_error || link.qos_warning ? this.color_err : (link.group == 1 ? this.color_write : this.color_read))
                .style("class", link.group == 1 ? 'write-link' : 'read-link')
                .style("cursor", 'help')
                .attr('fill', 'none')
                .style('stroke-width', link.group == 1 ? 1 : 2)
                .attr('pointer-events', 'visible');
            
            link.path.on("mouseenter click", function () {
                if (link.path.attr('class') && link.path.attr('class').indexOf('dimmed') > -1)
                    return;
                let c = that.color_hover;
                that.hovered_path = link.path;
                d3.select(this).style("stroke", c)
                link.path.attr(link.group == 1 ? 'marker-end' : 'marker-start', link.group == 1 ? 'url(#marker-hover-write)' : 'url(#marker-hover-read)')
                that.set_link_tooltip(link, that.tooltip_el);
                that.tooltip_el
                    .css({
                        display: 'block',
                        left: that.pointer_coords[0] + "px",
                        top: that.pointer_coords[1] + "px"
                    });
            });

            link.path.on("mousemove", function() {
                if (link.path.attr('class') && link.path.attr('class').indexOf('dimmed') > -1)
                    return;
                that.tooltip_el
                    .css({
                        left: that.pointer_coords[0] + "px",
                        top: that.pointer_coords[1] + "px"
                    });
            });

            link.path.on("mouseout", function() {
                if (link.path.attr('class') && link.path.attr('class').indexOf('dimmed') > -1)
                    return;
                that.hovered_path = null;
                let c = link.qos_error || link.qos_warning ? that.color_err : (link.group == 1 ? that.color_write : that.color_read);
                d3.select(this).style("stroke", c)
                if (link.group == 1) {
                    link.path.attr('marker-end', 'url(#marker-write)')
                } else {
                    link.path.attr('marker-start', link.qos_error || link.qos_warning ? 'url(#marker-err-read)' : 'url(#marker-read)')
                }
                that.tooltip_el.css('display', 'none');
            });

            if (link.qos_error || link.qos_warning) {
                link.path.style('stroke-dasharray', '3,5');
            }

            if (link.group == 1) {
                link.path.attr('marker-end', 'url(#marker-write)')
            } else {
                link.path.attr('marker-start', link.qos_error || link.qos_warning ? 'url(#marker-err-read)' : 'url(#marker-read)')
            }
            
        });

        if (this.focused_id_node) {
            let node = this.nodes[this.focused_id_node]
            if (!node) {
                this.focused_id_node = null;
            } else if (!node.focused) {
                this.nodeFocusToggle(this.focused_id_node);
            }
        }
        if (this.focused_topic) {
            let topic = this.topics[this.focused_topic]
            if (!topic) {
                this.focused_topic = null;
            } else if (!topic.focused) {
                this.topicFocusToggle(this.focused_topic); 
            }
        }
    }    

    redraw_links() {
        // this.svg_el.css('top', (this.topic_scrolling_el.scrollTop()) + 'px');
        this.links.forEach((link) => {
            link.path.attr("d", this.get_link_path(link))
        });
    }

    get_link_path(link) {
        let n = this.nodes[link.node];
        let t = this.topics[link.topic];

        let y_node = -this.node_container_el.scrollTop() + 10 + n.offset + link.node_conn_no*5;
        let y_topic = -this.topic_scrolling_el.scrollTop() + 10 + t.offset + link.topic_conn_no*5;

        let x_offset_node  = link.group == 1 ? 2 : 5; // 1 >, 2 <
        let x_offset_topic = link.group == 1 ? this.width_svg-5 : this.width_svg-2;

        let l_off = 140;
        let r_off = 140;
        return 'M ' + x_offset_node + ' '+y_node
             + 'C ' + (x_offset_node + l_off) + ' ' + y_node
             + ', ' + (x_offset_topic - r_off) + ' ' + y_topic
             + ', ' + x_offset_topic+' ' + y_topic;
    }

    reset_focus( ) {
        if (this.focused_id_node) {
            this.nodeFocusToggle(this.focused_id_node);
        }
        if (this.focused_topic) {
            this.topicFocusToggle(this.focused_topic)
        }
    }

    nodeFocusToggle(id_node) {

        if (!this.nodes[id_node])
            return;

        let focused = !this.nodes[id_node].focused

        if (focused && this.focused_id_node && this.focused_id_node != id_node) {
            this.nodeFocusToggle(this.focused_id_node);
        }
        if (focused && this.focused_topic) {
            this.topicFocusToggle(this.focused_topic);
        }
        if (focused)
            this.focused_id_node = id_node;
        else if (this.focused_id_node == id_node)
            this.focused_id_node = null;
            
        // console.log('Node '+id_node+' focused: '+focused);
        this.nodes[id_node].focused = focused;

        let connected_topics = [];
        this.links.forEach((link) => {
            if (link.node == id_node) {
                connected_topics.push(link.topic);
                link.focused_connection = focused;
            }
        });
        connected_topics.forEach((topic) => {
            this.topics[topic].focused_connection = focused;
        });

        this.update_highlights();
    }

    topicFocusToggle(topic) {

        if (!this.topics[topic])
            return;

        let focused = !this.topics[topic].focused;

        if (focused && this.focused_id_node) {
            this.nodeFocusToggle(this.focused_id_node);
        }
        if (focused && this.focused_topic && this.focused_topic != topic) {
            this.topic_focus_toggle(this.focused_topic);
        }
        if (focused)
            this.focused_topic = topic;
        else if (this.focused_topic == topic)
            this.focused_topic = null;

        // console.log('Topic '+topic+' focused: '+focused);
        this.topics[topic].focused = focused;

        let connected_nodes = [];
        this.links.forEach((link) => {
            if (link.topic == topic) {
                connected_nodes.push(link.node);
                link.focused_connection = focused;
            }
        });
        connected_nodes.forEach((node) => {
            this.nodes[node].focused_connection = focused;
        });

        this.update_highlights();
    }

    uncheckTopic(topic) {
        if (!this.topics[topic])
            return;

        this.topics[topic].chb.addClass('disabled'); //prevent event handler
        this.topics[topic].chb.prop('checked', false);
        this.topics[topic].chb.removeClass('disabled');
    }

    hoverNode(id_node, state) {

        // if (state && ((focused_id_node && focused_id_node != id_node) || focused_topic))
        //     return;

        this.nodes[id_node].highlighted = state;

        if (state)
            this.hovered_id_node = id_node;
        else if (!state && this.hovered_id_node == id_node)
            this.hovered_id_node = null;

        let connected_topics = [];
        this.links.forEach((link) => {
            if (link.node == id_node) {
                connected_topics.push(link.topic);
                link.highlighted_connection = state;
            }
        });

        connected_topics.forEach((topic) => {
            this.topics[topic].highlighted_connection = state;
        });

        this.update_highlights();
    }

    force_link_unfocus() {
        if (!this.hovered_path)
            return;
        this.hovered_path.dispatch('mouseout');
    }

    hover_topic(topic, state) {

        this.topics[topic].highlighted = state;

        if (state)
            this.hovered_topic = topic;
        else if (!state && this.hovered_topic == topic)
            this.hovered_topic = null;

        let connected_nodes = [];
        this.links.forEach((link) => {
            if (link.topic == topic) {
                connected_nodes.push(link.node);
                link.highlighted_connection = state;
            }
        });

        connected_nodes.forEach((id_node) => {
            this.nodes[id_node].highlighted_connection = state;
        });

        this.update_highlights();
    }

    update_highlights() {

        let something_focused = this.focused_topic || this.focused_id_node;

        this.node_ids.forEach((id_node) => {
            let n = this.nodes[id_node];
            if ((!something_focused && (n.highlighted || n.highlighted_connection)) || (something_focused && (n.focused || n.focused_connection))) {
                n.el.parent().removeClass('dimmed');
            } else if (something_focused || this.hovered_id_node || this.hovered_topic) {
                n.el.parent().addClass('dimmed');
            } else {
                n.el.parent().removeClass('dimmed');
            }
            if (n.focused) {
                n.el.parent().addClass('focused');
            } else {
                n.el.parent().removeClass('focused');
            }
        });

        this.links.forEach((link) => {
            let base = link.group == 1 ? 'write-link' : 'read-link';
            if ((!something_focused && link.highlighted_connection) || (something_focused && link.focused_connection)) {
                link.path.attr('class', base);
            } else if (something_focused || this.hovered_id_node || this.hovered_topic) {
                link.path.attr('class', base+' dimmed');
            } else {
                link.path.attr('class', base);
            }
        });

        this.topic_ids.forEach((topic) => {
            let t = this.topics[topic];
            if ((something_focused && (t.focused || t.focused_connection)) || (!something_focused && (t.highlighted || t.highlighted_connection))) {
                t.el.removeClass('dimmed');
            } else if (something_focused || this.hovered_id_node || this.hovered_topic) {
                t.el.addClass('dimmed');
            } else {
                t.el.removeClass('dimmed');
            }
            if (t.focused) {
                t.el.parent().addClass('focused');
            } else {
                t.el.parent().removeClass('focused');
            }
        });
    }

    

}