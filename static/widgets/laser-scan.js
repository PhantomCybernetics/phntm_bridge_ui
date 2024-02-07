import { deg2rad } from "../lib.js";

//laser scan visualization
//TODO turn into class
export class LaserScanWidget {

    constructor(panel, topic) {

        this.panel = panel;
        this.topic = topic;
        
        this.data_trace = [];
        this.max_trace_length = 5;

        $('#panel_widget_'+panel.n).addClass('enabled laser_scan');

        const canvas = $('#panel_widget_'+panel.n).html('<canvas id="panel_canvas_'+panel.n+'" width="'+panel.widget_width +'" height="'+panel.widget_height+'"></canvas>').find('canvas')[0];
        this.ctx = canvas.getContext("2d");

        let that = this;

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        //panel.display_widget = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        //panel.display_widget.render();
        // panel.zoom = 8.0;

        //zoom menu control
        panel.widget_menu_cb = () => {

            let zoom = panel.zoom === null || panel.zoom === undefined ? '?' : panel.zoom.toFixed(1);

            $('<div class="menu_line zoom_ctrl" id="zoom_ctrl_' + panel.n + '">' +
              '<span class="minus">-</span>' +
              '<button class="val" title="Reset zoom">Zoom: ' + zoom + 'x</button>' +
              '<span class="plus">+</span>' +
              '</div>')
              .insertAfter($('#panel_msg_types_'+panel.n).parent());
            
            $('#zoom_ctrl_'+panel.n+' .plus').click(function(ev) {
                that.setZoom(that.panel.zoom + that.panel.zoom/2.0);
            });
            $('#zoom_ctrl_'+panel.n+' .minus').click(function(ev) {
                that.setZoom(that.panel.zoom - that.panel.zoom/2.0);
            });

            $('#zoom_ctrl_'+this.panel.n+' .val').click(function(ev) {
                that.setZoom(1.0);
            });
        }

        // window.addEventListener('resize', () => {
        //     ResizeWidget(panel);
        //     RenderScan(panel);
        // });
        // $('#display_panel_source_'+panel.n).change(() => {
        //     ResizeWidget(panel);
        //     RenderScan(panel);
        // });
        panel.resize_event_handler = function () {
            // [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()
            that.render();
        };

        $('#panel_widget_'+panel.n).on('wheel', (ev) => {
            ev.preventDefault();
            let d = ev.originalEvent.deltaY;
            that.setZoom(that.panel.zoom - d*0.005);
            // console.log('wheel', );
        });
    }

    setZoom(zoom) {

        // panel.zoom +=1.0;
        // $('#zoom_ctrl_'+panel.n+' .val').html('Zoom: '+panel.zoom.toFixed(1)+'x');
        // panel.ui.update_url_hash();

        let panel = this.panel;
        if (zoom < 0.1) {
            zoom = 0.1;
        } else if (zoom > 30.0) {
            zoom = 30.0;
        }
        panel.zoom = zoom;
        $('#zoom_ctrl_'+panel.n+' .val')
            .html('Zoom: '+panel.zoom.toFixed(1)+'x');
        panel.ui.update_url_hash();
        
        this.render_dirty = true;
    }

    onClose() {
    }

    //console.log('widget', [panel.widget_width, panel.widget_height], frame);

    onData = (decoded) => {
        let numSamples = decoded.ranges.length;
        let anglePerSample = 360.0 / numSamples;

        //panel.display_widget.fillStyle = "#ff0000";

        this.scale = (this.panel.widget_height/2.0 - 20.0) / decoded.range_max;

        let newScanPts = [];
        for (let i = 0; i < numSamples; i++) {

            if (decoded.ranges[i] == null || decoded.ranges[i] > decoded.range_max || decoded.ranges[i] < decoded.range_min)
                continue;

            let pos = [
                0,
                decoded.ranges[i] * this.scale
            ]

            let arad = deg2rad(anglePerSample * i);
            let p = [
                Math.cos(arad)*pos[0] - Math.sin(arad)*pos[1],
                Math.sin(arad)*pos[0] + Math.cos(arad)*pos[1]
            ]

            newScanPts.push(p);
        }

        this.data_trace.push(newScanPts);

        if (this.data_trace.length > this.max_trace_length) {
            this.data_trace.shift();
        }

        this.range_max = decoded.range_max; //save for later

        this.render();
    }

    render = () => {

        let frame = [
            this.panel.widget_width/2.0,
            this.panel.widget_height/2.0
        ];
    
        let range = this.range_max;
    
        //panel.display_widget.fillStyle = "#fff";
        this.ctx.clearRect(0, 0, this.panel.widget_width, this.panel.widget_height);
    
        for (let i = 0; i < this.data_trace.length; i++) {
            let pts = this.data_trace[i];
    
            for (let j = 0; j < pts.length; j++) {
                let p = [ pts[j][0]*this.panel.zoom, pts[j][1]*this.panel.zoom ]; //zoom applied here
                this.ctx.fillStyle = (i == this.data_trace.length-1 ? "#ff0000" : "#aa0000");
                this.ctx.beginPath();
                this.ctx.arc(frame[0]+p[0], frame[1]-p[1], 1.5, 0, 2 * Math.PI);
                this.ctx.fill();
            }
        }
    
        //lines
        let range_int = Math.floor(range);
        for (let x = -range_int; x < range_int+1; x++) {
            this.ctx.beginPath();
            this.ctx.setLineDash(x == 0 ? [] : [this.scale/20, this.scale/10]);
            this.ctx.strokeStyle = x == 0 ? 'rgba(100,100,100,0.3)' : '#0c315480' ;
    
            //vertical
            //panel.widget_height
            let dd = Math.sqrt(Math.pow(range_int*this.panel.scale, 2) - Math.pow(x*this.scale, 2))*this.panel.zoom;
            this.ctx.moveTo(frame[0] + (x*this.scale)*this.panel.zoom, frame[1]-dd);
            this.ctx.lineTo(frame[0] + (x*this.scale)*this.panel.zoom, frame[1]+dd);
            this.ctx.stroke();
    
            //horizontal
            this.ctx.moveTo(frame[0]-dd, frame[1]+(x*this.scale)*this.panel.zoom);
            this.ctx.lineTo(frame[0]+dd, frame[1]+(x*this.scale)*this.panel.zoom);
            this.ctx.stroke();
        }
    
        //frame dot on top
        this.ctx.fillStyle = "#26a0fc";
        this.ctx.beginPath();
        this.ctx.arc(frame[0], frame[1], 5, 0, 2 * Math.PI);
        this.ctx.fill();
    }
    
}