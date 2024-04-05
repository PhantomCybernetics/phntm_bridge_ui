import { MultiTopicSource } from "./inc/multitopic.js";

export class VideoWidget {

    is_video = true;

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

        let that = this;
        this.videoWidth = -1;
        this.videoHeight = -1;

        // var v = document.getElementById("myVideo");
        this.el.on('loadedmetadata', function() {
            console.log('Video meta loaded: ', [this.videoWidth, this.videoHeight]);
            that.videoWidth = this.videoWidth;
            that.videoHeight = this.videoHeight;
            // that.aspect = this.videoWidth, this.videoHeight;
        });

        if (panel.id_stream && panel.ui.client.media_streams[panel.id_stream]) { // assign stream, if already available
            console.log('Assigning stream '+panel.id_stream+' to panel');
            document.getElementById('panel_video_'+panel.n).srcObject = panel.ui.client.media_streams[panel.id_stream];
        }

        this.overlays = {};

        this.overlay_sources = new MultiTopicSource(this);
        this.overlay_sources.add('vision_msgs/msg/Detection2DArray', 'Detection 2D Array', null, -1, this.on_overlay_data, this.clear_overlay);

        this.parseUrlParts(this.panel.custom_url_vars); 

        panel.widget_menu_cb = this.setupMenu;

        this.overlay_labels = { '/oak/nn/detections' : [
            // YOLO @ COCO:
            "person",
            "bicycle",
            "car",
            "motorbike",
            "aeroplane",
            "bus",
            "train",
            "truck",
            "boat",
            "traffic light",
            "fire hydrant",
            "stop sign",
            "parking meter",
            "bench",
            "bird",
            "cat",
            "dog",
            "horse",
            "sheep",
            "cow",
            "elephant",
            "bear",
            "zebra",
            "giraffe",
            "backpack",
            "umbrella",
            "handbag",
            "tie",
            "suitcase",
            "frisbee",
            "skis",
            "snowboard",
            "sports ball",
            "kite",
            "baseball bat",
            "baseball glove",
            "skateboard",
            "surfboard",
            "tennis racket",
            "bottle",
            "wine glass",
            "cup",
            "fork",
            "knife",
            "spoon",
            "bowl",
            "banana",
            "apple",
            "sandwich",
            "orange",
            "broccoli",
            "carrot",
            "hot dog",
            "pizza",
            "donut",
            "cake",
            "chair",
            "sofa",
            "pottedplant",
            "bed",
            "diningtable",
            "toilet",
            "tvmonitor",
            "laptop",
            "mouse",
            "remote",
            "keyboard",
            "cell phone",
            "microwave",
            "oven",
            "toaster",
            "sink",
            "refrigerator",
            "book",
            "clock",
            "vase",
            "scissors",
            "teddy bear",
            "hair drier",
            "toothbrush"

            //MobileNet @ PASCAL 2007 VOC
            // "background",
            // "aeroplane",
            // "bicycle",
            // "bird",
            // "boat",
            // "bottle",
            // "bus",
            // "car",
            // "cat",
            // "chair",
            // "cow",
            // "diningtable",
            // "dog",
            // "horse",
            // "motorbike",
            // "person",
            // "pottedplant",
            // "sheep",
            // "sofa",
            // "train",
            // "tvmonitor"
        ]};
    }

    setupMenu = () => {

        $('#monitor_menu_content_'+this.panel.n+' .panel_msg_types_line').addClass('nospace');

        this.overlay_sources.setupMenu("Overlay");

        //fps menu toggle
        $('<div class="menu_line"><label for="video_fps_cb_'+this.panel.n+'" class="video_fps_cb_label" id="video_fps_cb_label_'+this.panel.n+'">'
            +'<input type="checkbox" id="video_fps_cb_'+this.panel.n+'" checked class="video_fps_cb" title="Display video FPS"> FPS</label></div>'
            ).insertBefore($('#close_panel_menu_'+this.panel.n));

        $('#video_fps_cb_'+this.panel.n).change(function(ev) {
            if ($(this).prop('checked')) {
                $('#video_fps_'+this.panel.n).addClass('enabled');
            } else {
                $('#video_fps_'+this.panel.n).removeClass('enabled');
            }
        });

        $('#video_fps_'+this.panel.n).addClass('enabled'); //on by default

        //stats menu toggle
        $('<div class="menu_line"><label for="video_stats_cb_'+this.panel.n+'" class="video_stats_cb_label" id="video_stats_cb_label_'+this.panel.n+'">'
            +'<input type="checkbox" id="video_stats_cb_'+this.panel.n+'" class="video_stats_cb" title="Display video stats"> Stats for nerds</label></div>'
            ).insertBefore($('#close_panel_menu_'+this.panel.n));

        $('#video_stats_cb_'+this.panel.n).change(function(ev) {
            if ($(this).prop('checked')) {
                $('#video_stats_'+this.panel.n).addClass('enabled');
            } else {
                $('#video_stats_'+this.panel.n).removeClass('enabled');
            }
        });

    }

    on_overlay_data = (topic, data) => {
        
        if (this.panel.paused)
            return;

        if (!this.overlays[topic]) {
            if (this.videoWidth < 0 || this.videoHeight < 0)
                return; //video dimenstions still unknown

            console.log('Making overlay from '+topic)
            this.overlays[topic] = d3.select("#video_overlay_"+this.panel.n)
                .append("svg")
                    .attr("width", '100%')
                    .attr("viewBox", '0 0 ' + this.videoWidth + ' ' + this.videoHeight)
                    // .attr("preserveAspectRatio", "xMidYMid meet")
                        .append("g");
                
                    // .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
        }

        let svg = this.overlays[topic];
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
                if (this.overlay_labels[topic] && this.overlay_labels[topic][c])
                    l = this.overlay_labels[topic][c];
                labels.push(l + ' (' + d.results[j].hypothesis.score.toFixed(2)+')');
            }
            let label = labels.join("\n");
            // console.log(i+' bbox: ', d.bbox, label)
            // let sx = this.videoWidth / 416.0;
            // let sy = this.videoHeight / 416.0;

            let nn_cropped_square = true;
            // yolo:
            let nn_w = 416;
            let nn_h = 416;
            //mobilenet:
            // let nn_w = 300;
            // let nn_h = 300;
            
            let display_w = nn_cropped_square ? this.videoHeight : this.videoWidth;
            let display_h = this.videoHeight;

            let sx = display_w / nn_w;
            let sy = display_h / nn_h;
            
            let xoff = (this.videoWidth-display_w) / 2.0;

            let bbcx = d.bbox.center.position.x * sx + xoff;
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
            // let labelbox = svg
            //     .append("rect")
            //         .attr("x", d.bbox.center.position.x-(d.bbox.size_x/2.0))
            //         .attr("y", d.bbox.center.position.y+(d.bbox.size_y/2.0))
            //         .attr("width", d.bbox.size_x)
            //         .attr("height", 20)
            //         .style('fill', 'magenta')
            //     ;
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

    // get_box_path(bbox) {

    //     return 'M '+offset_node+' '+pos_node+' C 100 '+pos_node+', 100 '+pos_topic+', '+offset_topic+' '+pos_topic;
    // }

    clear_overlay = (topic) => {
        if (this.overlays[topic]) {
            console.log('Removing overlay', this.overlays[topic]);
            let svg = this.overlays[topic].select(function() { return this.parentNode; })
            svg.remove();
            delete this.overlays[topic];
        }
    }

    getUrlHashParts (out_parts) {
        this.overlay_sources.getUrlHashParts(out_parts);
        console.log('Video.getUrlHashParts', out_parts);
    }

    parseUrlParts (custom_url_vars) {
        if (!custom_url_vars)
            return;
        this.overlay_sources.parseUrlParts(custom_url_vars);
        console.log('Video.parseUrlParts', custom_url_vars);
    }

}