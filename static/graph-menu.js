
import { IsImageTopic} from '/static/browser-client.js';
import { isTouchDevice } from './lib.js'

export class GraphMenu {

    constructor(ui) {

        this.ui = ui;

        this.graph_display_el = $('#graph_display')
        this.node_container_el = $('<div id="graph_nodes"></div>');
        this.topic_container_el = $('<div id="graph_topics"></div>');

        this.graph_display_el.empty();

        this.graph_display_el
            .append(this.node_container_el)
            .append(this.topic_container_el)
        
        this.topics = {};
        this.nodes = {};
        this.links = [];
        this.node_ids = [];
        this.topic_ids = [];
        
        this.focused_id_node = null;
        this.focused_topic = null;
        this.hovered_id_node = null;
        this.hovered_topic = null;

        this.margin = {top: 0, right: 0, bottom: 0, left: 0};
        this.width = 0;
        this.height = 0;
        let available_w = 825; // top menu defauls
        let available_h = 600; //
        if ($('BODY').hasClass('hamburger')) {
            available_w = window.innerWidth - 35;
            available_h =$(window).height()-110;
        }
        this.set_dimensions(available_w, available_h);

        let that = this;

        // append the svg object to the body of the page
        this.svg = d3.select("#graph_display")
            .append("svg")
            .attr("width", this.width)
            .attr("height", this.height)
            .append("g")
                .attr("transform", "translate(" + this.margin.left + "," + this.margin.top + ")");

        this.svg.append('defs')
            .append("marker")
                .attr("id","head-magenta")
                .attr("orient", 'auto-start-reverse')
                .attr("viewBox", '0 0 5 5')
                .attr("markerWidth", 4)
                .attr("markerHeight", 4)
                .attr("refX",2.5)
                .attr("refY",2.5)
                .append('polygon')
                    .attr('points', '0,5 1.6666666666666667,2.5 0,0 5,2.5')
                    .style("fill", "magenta");

        this.svg.append('defs')
            .append("marker")
                .attr("id","head-green")
                .attr("orient", 'auto')
                .attr("viewBox", '0 0 5 5')
                .attr("markerWidth", 4)
                .attr("markerHeight", 4)
                .attr("refX",2.5)
                .attr("refY",2.5)
                .append('polygon')
                    .attr('points', '0,5 1.6666666666666667,2.5 0,0 5,2.5')
                    .style("fill", "green");

        this.topic_container_el.on('scroll', (e) => {
            that.redraw_links();
        });
        this.node_container_el.on('scroll', (e) => {
            that.redraw_links();
        });
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

    set_dimensions(full_w, h) {
        
        let old_w = this.width;
        let old_h = this.height;

        let w_svg = full_w - 300 - 300 - 25;
        // console.log('Setting GM dimentions for available w: '+full_w+' => svg='+w_svg);
        this.width = w_svg - this.margin.left - this.margin.right;
        this.height = h - this.margin.top - this.margin.bottom;

        if (this.width < 0)
            this.width = 0;
        if (this.height < 0)
            this.height = 0;

        this.topic_container_el.css('padding-left', w_svg);
        if (this.svg) {
            // console.log('updating svg dimenstions to ' + this.width + 'x' + this.height +'');
            $('#graph_display svg').attr({
                "width": this.width,
                "height": this.height
            });
            this.svg
                .attr("width", this.width)
                .attr("height", this.height);
            if (old_w != this.width || old_h != this.height) {
                this.redraw_links();
            }
        }
        
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
            // node
            // let i_node = i++;

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
                            msg_type: nodes[id_node].publishers[id_topic].msg_types[0]
                        };
                    } else {
                        this.topics[id_topic]['connections']++;
                    }
                    this.nodes[id_node]['connections']++;
                    node_links.push({
                        node: id_node,
                        topic: id_topic,
                        group: 1,
                    });
                });
            }

            if (nodes[id_node].subscribers) {
                let topic_ids = Object.keys(nodes[id_node].subscribers);
                topic_ids.forEach((id_topic)=>{
                    if (this.topics[id_topic] === undefined) {
                        this.topics[id_topic] = {
                            connections: 1,
                            msg_type: nodes[id_node].subscribers[id_topic].msg_types[0]
                        };
                    } else {
                        this.topics[id_topic]['connections']++;
                    }
                    this.nodes[id_node]['connections']++;
                    node_links.push({
                        node: id_node,
                        topic: id_topic,
                        group: 2,
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
            node_el.prepend(box_el);
            this.nodes[id_node].el = box_el;
            this.node_container_el.append(node_el);

            let that = this;

            if (!isTouchDevice()) {
                node_el.on('mouseenter', (e) => {
                    that.hover_node(id_node, true); 
                });
                node_el.on('mouseleave', (e) => {
                    that.hover_node(id_node, false); 
                });
            }
            node_el.on('click', (e) => {
                that.node_focus_toggle(id_node); 
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
            if (!this.ui.client.find_message_type(this.topics[topic].msg_type)) {
                msg_type_classes.push('err');
                title += ' unsupported message type';
            }
            
            let box_el = $('<div class="box" style="height:'+h+'px;">'
                        + '<label for="topic_'+n+'" title="'+topic+'" class="prevent-select">' + topic + '</label><br>'
                        + '<a href="#" class="'+msg_type_classes.join(' ')+'" '
                            + 'title="'+title+'">'+this.topics[topic].msg_type+'</a>'
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
            // console.log(el.offset());

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
                
                that.topic_focus_toggle(topic); 
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

                that.ui.toggle_panel(topic, msg_type, state, w, h);

                if (state && $('BODY').hasClass('hamburger')) {
                    //close burger menu
                    that.ui.set_burger_menu_state(false, false);
                }
            });

            box_el.find('.msg_type').on('click', (e)=>{
                
                e.cancelBubble = true;
                e.stopPropagation();

                $('#graph_controls').addClass('hover_waiting'); //this will keep menu open (removed on next mouse enter)

                that.ui.message_type_dialog(that.topics[topic].msg_type);

                return false;
            });

        });

        // let i = 0;
        this.links.forEach((link) => {

            // i++;
            // if (i > 1)
            //     return;

            let n = this.nodes[link.node];
            let t = this.topics[link.topic];
            
            link.focused_connection = false;
            link.node_conn_no = n.connections_drawn.length;
            link.topic_conn_no = t.connections_drawn.length;
            n.connections_drawn.push(link);
            t.connections_drawn.push(link);

            link.path = this.svg
                .append("path")
                .attr("d", this.get_link_path(link))
                .style("stroke", link.group == 1 ? 'green' : 'magenta')
                .style('fill', 'none')
                .style('stroke-width', 2)
                ;

            if (link.group == 1) {
                link.path.attr('marker-end', 'url(#head-green)')
            } else {
                link.path.attr('marker-start', 'url(#head-magenta)')
            }
            
        });

        if (this.focused_id_node) {
            let node = this.nodes[this.focused_id_node]
            if (!node) {
                this.focused_id_node = null;
            } else if (!node.focused) {
                this.node_focus_toggle(this.focused_id_node);
            }
        }
        if (this.focused_topic) {
            let topic = this.topics[this.focused_topic]
            if (!topic) {
                this.focused_topic = null;
            } else if (!topic.focused) {
                this.topic_focus_toggle(this.focused_topic); 
            }
        }
    }    

    redraw_links() {
        this.links.forEach((link) => {
            link.path.attr("d", this.get_link_path(link))
        });
    }

    get_link_path(link) {
        let n = this.nodes[link.node];
        let t = this.topics[link.topic];

        let pos_node = -this.node_container_el.scrollTop() + 18 + n.offset + link.node_conn_no*5;
        let pos_topic = -this.topic_container_el.scrollTop() + 18 + t.offset + link.topic_conn_no*5;

        let offset_node  = link.group == 1 ? 2 : 5; // 1 >, 2 <
        let offset_topic = link.group == 1 ? this.width-5 : this.width-2;

        return 'M '+offset_node+' '+pos_node+' C 100 '+pos_node+', 100 '+pos_topic+', '+offset_topic+' '+pos_topic;
    }

    reset_focus( ) {
        if (this.focused_id_node) {
            this.node_focus_toggle(this.focused_id_node);
        }
        if (this.focused_topic) {
            this.topic_focus_toggle(this.focused_topic)
        }
    }

    node_focus_toggle(id_node) {

        if (!this.nodes[id_node])
            return;

        let focused = !this.nodes[id_node].focused

        if (focused && this.focused_id_node && this.focused_id_node != id_node) {
            this.node_focus_toggle(this.focused_id_node);
        }
        if (focused && this.focused_topic) {
            this.topic_focus_toggle(this.focused_topic);
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

    topic_focus_toggle(topic) {

        if (!this.topics[topic])
            return;

        let focused = !this.topics[topic].focused;

        if (focused && this.focused_id_node) {
            this.node_focus_toggle(this.focused_id_node);
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

    uncheck_topic(topic) {
        if (!this.topics[topic])
            return;

        this.topics[topic].chb.addClass('disabled'); //prevent event handler
        this.topics[topic].chb.prop('checked', false);
        this.topics[topic].chb.removeClass('disabled');
    }

    hover_node(id_node, state) {

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

    hover_topic(topic, state) {

        // if (state && (focused_id_node || (focused_topic && focused_topic != topic)))
        //     return;

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
                n.el.removeClass('dimmed');
            } else if (something_focused || this.hovered_id_node || this.hovered_topic) {
                n.el.addClass('dimmed');
            } else {
                n.el.removeClass('dimmed');
            }
            if (n.focused) {
                n.el.addClass('focused');
            } else {
                n.el.removeClass('focused');
            }
        });

        this.links.forEach((link) => {
            if ((!something_focused && link.highlighted_connection) || (something_focused && link.focused_connection)) {
                link.path.attr('class', '');
            } else if (something_focused || this.hovered_id_node || this.hovered_topic) {
                link.path.attr('class', 'dimmed');
            } else {
                link.path.attr('class', '');
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
                t.el.addClass('focused');
            } else {
                t.el.removeClass('focused');
            }
        });
    }

    

}