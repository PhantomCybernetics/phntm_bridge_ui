import { MultiTopicSource } from "./inc/multitopic.js";

export class VideoWidget {

    is_video = true;
    static default_width = 5;
    static default_height = 4;

    constructor (panel, id_source)  {

        this.panel = panel;

        console.log('making video el')
        $('#panel_widget_'+panel.n)
            .addClass('enabled video')
            .html('<video id="panel_video_'+panel.n+'" autoplay="true" playsinline="true" muted></video>' //muted allows video autoplay in chrome before user interactions
                + '<span id="video_stats_'+panel.n+'" class="video_stats"></span>'
                + '<span id="video_fps_'+panel.n+'" class="video_fps"></span>'
                + '<div id="video_overlay_'+panel.n+'" class="video_overlay"></div>'
                ); //muted allows video autoplay in chrome before user interactions

        this.el = $('#panel_video_'+panel.n);
        this.overlay_el = $('#video_overlay_'+panel.n);
        this.video_stats_el = $('#video_stats_' + panel.n);
        this.video_fps_el = $('#video_fps_' + panel.n);

        this.videoWidth = -1;
        this.videoHeight = -1;
    
        // this.overlay_extra_controls_rendered = false;
        this.display_overlay_input_crop = false;

        let that = this;
        this.el.on('loadedmetadata', function() {
            console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
            that.videoWidth = this.videoWidth;
            that.videoHeight = this.videoHeight;
            that.updateAllOverlays();
        });

        if (panel.id_stream && panel.ui.client.media_streams[panel.id_stream]) { // assign stream, if already available
            console.log('Assigning stream '+panel.id_stream+' to panel');
            document.getElementById('panel_video_'+panel.n).srcObject = panel.ui.client.media_streams[panel.id_stream];
        }

        this.overlays = {};
        this.next_overlay_id = 0;
        this.overlay_crop_display_control_menu_el = null;

        this.panel.widget_menu_cb = () => that.setupMenu();

        this.overlay_sources = new MultiTopicSource(this);
        this.overlay_sources.on('change', (topics) => that.onOverlaySourcesChange(topics));
        this.overlay_sources.add('vision_msgs/msg/Detection2DArray', 'Detection 2D Array', null, -1,
                                 (t, d) => { that.onOverlayData(t, d); },
                                 (t) => { that.clearOverlay(t); });

        this.parseUrlParts(this.panel.custom_url_vars); //calls multisource.parseUrlParts
        // this.panel.ui.client.on('topic_config', (t, c) => that.onTopicConfigUpdate(t, c))
        this.onOverlaySourcesChange(this.overlay_sources.getSources());
    }

    
    onOverlaySourcesChange(overlay_topics) {

        console.warn('onOverlaySourcesChange', overlay_topics)

        let client = this.panel.ui.client;
        let that = this;
        overlay_topics.forEach((topic)=>{
            if (!that.overlays[topic]) {
                that.overlays[topic] = {};
                that.overlays[topic].config_update_cb = (config) => {
                    console.warn('onTopicConfigUpdate', topic, config);
                    that.overlays[topic].config = config;
                    that.setupOverlay(topic, config);
                }
                client.on_topic_config(topic, that.overlays[topic].config_update_cb);
            }
        });
    }

    setupOverlay(topic, config) {

        if (config) {
            this.overlays[topic].nn_cropped_square = config['nn_input_cropped_square'] ? config['nn_input_cropped_square'] : false;
            this.overlays[topic].nn_w = config['nn_input_w'] ? config['nn_input_w'] : 0;
            this.overlays[topic].nn_h = config['nn_input_h'] ? config['nn_input_h'] : 0;
            this.overlays[topic].config = config;
        } else if (!this.overlays[topic].config) {
            return;
        }
        
        if (this.videoWidth < 0 || this.videoHeight < 0)
            return; //video dimenstions still unknown

        this.overlays[topic].display_w = this.overlays[topic].nn_cropped_square ? this.videoHeight : this.videoWidth;
        this.overlays[topic].display_h = this.videoHeight;
        this.overlays[topic].xoff = (this.videoWidth-this.overlays[topic].display_w) / 2.0;

        if (this.overlays[topic].container_el) {
            // let svg = this.overlays[topic].svg.select(function() { return this.parentNode; })
            // svg.remove();
            this.overlays[topic].container_el.remove();
        }

        console.log('Making overlay from '+topic);
        let cont_id = 'video_overlay_'+this.panel.n+'_'+(this.next_overlay_id);
        this.next_overlay_id++;
        this.overlays[topic].container_el = $('<div class="video_overlay_cont" id="'+cont_id+'"></div>');
        this.overlays[topic].container_el.css('left', ((this.overlays[topic].xoff/this.videoWidth)*100)+'%');
        this.overlays[topic].container_el.appendTo(this.overlay_el);
        
        this.overlays[topic].svg = d3.select('#'+cont_id).append("svg");
        this.overlays[topic].svg.attr("width", ((this.overlays[topic].display_w/this.videoWidth)*100)+'%')
                .attr("viewBox", '0 0 ' + this.overlays[topic].display_w + ' ' + this.overlays[topic].display_h)
                .append("g");
        if (this.display_overlay_input_crop) {
            this.overlays[topic].container_el.addClass('display_crop');
        }

        this.renderOverlayMenuControls();
    }

    updateAllOverlays() {
        let overlay_topics = Object.keys(this.overlays);
        overlay_topics.forEach((t) => {
            this.setupOverlay(t, null);
        });
    }

    clearOverlay (topic) {
        if (this.overlays[topic]) {
            console.log('Removing overlay', this.overlays[topic]);
            let client = this.panel.ui.client;
            if (this.overlays[topic].container_el) {
                this.overlays[topic].container_el.remove();
            }
            if (this.overlays[topic].config_update_cb) {
                client.remove_topic_config_handler(topic, this.overlays[topic].config_update_cb);
            }
            delete this.overlays[topic];
        }
        this.renderOverlayMenuControls();
    }

    onClose() {
        let overlay_topics = Object.keys(this.overlays);
        overlay_topics.forEach((topic) => {
            this.clearOverlay(topic);
        });
    }

    setupMenu() {

        this.overlay_sources.setupMenu("Overlay");

        //fps menu toggle
        $('<div class="menu_line"><label for="video_fps_cb_'+this.panel.n+'" class="video_fps_cb_label" id="video_fps_cb_label_'+this.panel.n+'">'
            +'<input type="checkbox" id="video_fps_cb_'+this.panel.n+'" checked class="video_fps_cb" title="Display video FPS"> FPS</label></div>'
            ).insertBefore($('#close_panel_menu_'+this.panel.n));

        let that = this;
        $('#video_fps_cb_'+this.panel.n).change(function(ev) {
            if ($(this).prop('checked')) {
                that.video_fps_el.addClass('enabled');
            } else {
                that.video_fps_el.removeClass('enabled');
            }
        });

        this.video_fps_el.addClass('enabled'); //on by default

        //stats menu toggle
        $('<div class="menu_line"><label for="video_stats_cb_'+this.panel.n+'" class="video_stats_cb_label" id="video_stats_cb_label_'+this.panel.n+'">'
            +'<input type="checkbox" id="video_stats_cb_'+this.panel.n+'" class="video_stats_cb" title="Display video stats"> Stats for nerds</label></div>'
            ).insertBefore($('#close_panel_menu_'+this.panel.n));

        $('#video_stats_cb_'+this.panel.n).change(function(ev) {
            if ($(this).prop('checked')) {
                that.video_stats_el.addClass('enabled');
            } else {
                that.video_stats_el.removeClass('enabled');
            }
        });

        this.overlay_crop_display_control_menu_el = null; //menu is empty here, force re-create
        this.renderOverlayMenuControls();
    }

    renderOverlayMenuControls() {

        let some_overlay_is_cropped = false;
        Object.keys(this.overlays).forEach((topic)=>{
            if (this.overlays[topic].nn_cropped_square) {
                some_overlay_is_cropped = true;
                return;
            }
        });

        if (some_overlay_is_cropped && !this.overlay_crop_display_control_menu_el) {

            this.overlay_crop_display_control_menu_el = $('<div class="menu_line overlay_menu_ctrl"><label for="video_overlay_input_crop_cb_'+this.panel.n+'">'
                +'<input type="checkbox"'
                + (this.display_overlay_input_crop?' checked':'')
                + ' id="video_overlay_input_crop_cb_'+this.panel.n+'" title="Display overlay input cropping"> Show overlay input cropping</label></div>'
            );
            this.overlay_crop_display_control_menu_el.insertBefore($('#close_panel_menu_'+this.panel.n));
            
            let that = this;
            $('#video_overlay_input_crop_cb_'+this.panel.n).change((ev) => {
                if ($(ev.target).prop('checked')) {
                    that.display_overlay_input_crop = true;
                    that.panel.ui.update_url_hash();
                } else {
                    that.display_overlay_input_crop = false;
                    that.panel.ui.update_url_hash();
                }

                Object.keys(that.overlays).forEach((topic)=>{
                    if (that.overlays[topic].container_el) {
                        if (that.display_overlay_input_crop) 
                            that.overlays[topic].container_el.addClass('display_crop');
                        else
                            that.overlays[topic].container_el.removeClass('display_crop');
                    }
                });
            });

        } else if (!some_overlay_is_cropped && this.overlay_crop_display_control_menu_el) {
            this.overlay_crop_display_control_menu_el.remove();
            this.overlay_crop_display_control_menu_el = null;
        }
    }

    onOverlayData (topic, data) {
        
        if (this.panel.paused)
            return;

        if (!this.overlays[topic] || !this.overlays[topic].svg)
            return; //not yet initiated

        let svg = this.overlays[topic].svg;
        svg.selectAll("rect").remove();
        svg.selectAll("text").remove();

        if (!data || !data.detections || !data.detections.length)
            return;

        for (let i = 0; i < data.detections.length; i++) {
            let d = data.detections[i];
            let labels = [];
            for (let j = 0; j < d.results.length; j++) {
                let c = d.results[j].hypothesis.class_id;
                let l = 'Class ' + c;
                if (this.overlays[topic].config && this.overlays[topic].config['nn_detection_labels']
                    && this.overlays[topic].config['nn_detection_labels'][c])
                    l = this.overlays[topic].config['nn_detection_labels'][c];
                labels.push(l + ' (' + d.results[j].hypothesis.score.toFixed(2)+')');
            }
            let label = labels.join("\n");

            let sx = this.overlays[topic].display_w / this.overlays[topic].nn_w;
            let sy = this.overlays[topic].display_h / this.overlays[topic].nn_h;

            let bbcx = d.bbox.center.position.x * sx;
            let bbcy = d.bbox.center.position.y * sy;

            let bbwidth = d.bbox.size_x * sx;
            let bbheight = d.bbox.size_y * sy;
            let bbleft = bbcx - (bbwidth/2.0);
            let bbtop = bbcy - (bbheight/2.0);

            let centerpath = svg
                .append("rect")
                    .attr("x", bbcx - 5)
                    .attr("y", bbcy - 5)
                    .attr("width", 10)
                    .attr("height", 10)
                    .style('fill', 'magenta')
                ;
            
            let boxpath = svg
                .append("rect")
                    .attr("x", bbleft)
                    .attr("y", bbtop)
                    .attr("width", bbwidth)
                    .attr("height", bbheight)
                    .style("stroke", 'magenta')
                    .style('fill', 'none')
                    .style('stroke-width', 2)
                ;

            svg.append('text')
                .attr('class', 'detection-res')
                .attr('x', bbleft+5.0)
                .attr('y', bbtop+5.0)
                .style("stroke", 'white')
                .style("fill", 'white')
                .style('font-size', 20)
                .attr('dy', 20)
                .text(label);
            }
    }

    getUrlHashParts (out_parts) {
        this.overlay_sources.getUrlHashParts(out_parts);
        out_parts.push('crp='+(this.display_overlay_input_crop ? '1' : '0'));
    }

    parseUrlParts (custom_url_vars) {
        if (!custom_url_vars)
            return;
        this.overlay_sources.parseUrlParts(custom_url_vars);

        custom_url_vars.forEach((kvp)=>{
            let arg = kvp[0];
            let val = kvp[1];
            switch (arg) {
                case 'crp':
                    this.display_overlay_input_crop = parseInt(val) == 1;
                    break;
            }
        });
    }

}