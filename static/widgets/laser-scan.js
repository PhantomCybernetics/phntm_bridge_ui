import { deg2rad } from "../lib.js";

//laser scan visualization
//TODO turn into class
export class LaserScanWidget {

    static default_width = 7;
    static default_height = 4;

    constructor(panel, topic) {

        this.panel = panel;
        this.topic = topic;
        
        this.data_trace = [];
        this.max_trace_length = 1;

        $('#panel_widget_'+panel.n).addClass('enabled laser_scan');

        this.canvas = $('#panel_widget_'+panel.n).html('<canvas id="panel_canvas_'+panel.n+'" width="'+panel.widget_width +'" height="'+panel.widget_height+'"></canvas>').find('canvas')[0];
        this.ctx = this.canvas.getContext("2d");

        let that = this;

        //const div = d3.selectAll();
        //console.log('d3 div', div)
        //panel.display_widget = new ApexCharts(document.querySelector('#panel_widget_'+panel.n), options);

        //panel.display_widget.render();
        // panel.zoom = 8.0;

        //zoom menu control
        panel.widget_menu_cb = () => {

            let zoom = panel.zoom === null || panel.zoom === undefined ? '?' : panel.zoom.toFixed(1);
            let rot = panel.rot === null || panel.rot === undefined ? '?' : panel.rot.toFixed(0);

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
                that.setZoom(that.panel.default_zoom);
            });

            $('<div class="menu_line rot_ctrl" id="rot_ctrl_' + panel.n + '">' +
                '<span class="rot-left"><span class="icon"></span></span>' +
                '<button class="val" title="Reset zoom">Rotate: ' + rot + '°</button>' +
                '<span class="rot-right"><span class="icon"></span></span>' +
                '</div>')
                .insertAfter($('#zoom_ctrl_'+panel.n));
              
              $('#rot_ctrl_'+panel.n+' .rot-right').click(function(ev) {
                  that.setRot(that.panel.rot + 45.0);
              });
              $('#rot_ctrl_'+panel.n+' .rot-left').click(function(ev) {
                  that.setRot(that.panel.rot - 45.0);
              });
  
              $('#rot_ctrl_'+this.panel.n+' .val').click(function(ev) {
                  that.setRot(that.panel.default_rot);
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
        

        $('#panel_widget_'+panel.n).on('mousewheel', (ev) => {
            ev.preventDefault();
            let d = ev.originalEvent.deltaY;
            that.setZoom(that.panel.zoom - d*0.005);
            // console.log('wheel', );
        });

        //pinch zoom
        const evCache = [];
        let prevDiff = -1;
        let offsetDiff = -1;
        let baseZoom = -1;

        function pointerdownHandler(ev) {
            // The pointerdown event signals the start of a touch interaction.
            // This event is cached to support 2-finger gestures
            evCache.push(ev);
            // console.log("pointerDown", ev);
            if (evCache.length > 1) {
                offsetDiff = -1; // reset
                ev.preventDefault();
            }
                
        }

        function pointermoveHandler(ev) {
            // This function implements a 2-pointer horizontal pinch/zoom gesture.
            //
            // If the distance between the two pointers has increased (zoom in),
            // the target element's background is changed to "pink" and if the
            // distance is decreasing (zoom out), the color is changed to "lightblue".
            //
            // This function sets the target element's border to "dashed" to visually
            // indicate the pointer's target received a move event.
            // console.log("pointerMove", ev);
            // ev.target.style.border = "dashed";
            
            // Find this event in the cache and update its record with this event
            const index = evCache.findIndex(
                (cachedEv) => cachedEv.pointerId === ev.pointerId,
            );
            evCache[index] = ev;
            
            // If two pointers are down, check for pinch gestures
            if (evCache.length === 2 && evCache[0].touches.length === 2) {
                // Calculate the distance between the two pointers
                let curDiff = Math.sqrt(
                    Math.pow(evCache[0].touches[0].clientX - evCache[0].touches[1].clientX, 2) +
                    Math.pow(evCache[0].touches[0].clientY - evCache[0].touches[1].clientY, 2)
                );
                
                if (offsetDiff < 0) {
                    offsetDiff = curDiff;
                    baseZoom = that.panel.zoom;
                }
                    
                curDiff -= offsetDiff;

                // console.log('touch move curDiff='+curDiff)
                let zoom = baseZoom + (curDiff/10.0);
                that.setZoom(zoom);
            
                // Cache the distance for the next move event
                prevDiff = curDiff;

                ev.preventDefault();
            }

            
        }

        function removeEvent(ev) {
            // Remove this event from the target's cache
            const index = evCache.findIndex(
              (cachedEv) => cachedEv.pointerId === ev.pointerId,
            );
            evCache.splice(index, 1);
        }

        function pointerupHandler(ev) {
            // console.log(ev.type, ev);
            // Remove this pointer from the cache and reset the target's
            // background and border
            removeEvent(ev);
            // ev.target.style.background = "white";
            // ev.target.style.border = "1px solid black";
          
            // If the number of pointers down is less than two then reset diff tracker
            if (evCache.length < 2) {
              prevDiff = -1;
            }
        }

        const el = document.getElementById('panel_widget_'+panel.n);
        el.addEventListener('touchstart', pointerdownHandler, { passive: false });
        el.addEventListener('touchmove', pointermoveHandler, { passive: false });

        // Use same handler for pointer{up,cancel,out,leave} events since
        // the semantics for these events - in this app - are the same.
        el.onpointerup = pointerupHandler;
        el.onpointercancel = pointerupHandler;
        el.onpointerout = pointerupHandler;
        el.onpointerleave = pointerupHandler;

        this.rendering = true;
        requestAnimationFrame((t)=> this.rendering_loop());
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
        
        this.renderDirty();
    }

    setRot(rot) {

        // panel.zoom +=1.0;
        // $('#zoom_ctrl_'+panel.n+' .val').html('Zoom: '+panel.zoom.toFixed(1)+'x');
        // panel.ui.update_url_hash();

        let panel = this.panel;
        if (rot < -1.0) {
            rot = 270.0;
        } else if (rot > 359.0) {
            rot = 0.0;
        }
        panel.rot = rot;
        $('#rot_ctrl_'+panel.n+' .val')
            .html('Rotate: '+panel.rot.toFixed(0)+'°');
        panel.ui.update_url_hash();
        
        this.renderDirty();
    }

    renderDirty() {
        this.render_dirty = true;
    }

    onClose() {
        this.rendering = false; //kills the loop
    }

    onResize() {
        // [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize()
        this.renderDirty()
    }

    //console.log('widget', [panel.widget_width, panel.widget_height], frame);

    async onData (decoded) {
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

            let arad = deg2rad(anglePerSample * i - this.panel.rot);
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

        this.renderDirty();
    }

    rendering_loop() {

        if (!this.rendering)
            return;
    
        if (this.render_dirty) {
            this.render_dirty = false;
            this.render();
        }

        requestAnimationFrame((t)=> this.rendering_loop());
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