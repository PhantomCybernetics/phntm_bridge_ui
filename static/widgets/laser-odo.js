import { lerpColor, linkifyURLs, lerp, deg2rad } from "../lib.js";
import * as THREE from 'three';
import { Zoomable2DTiles } from './inc/zoomable-2d-tiles.js'

export class LaserOdometryWidget extends Zoomable2DTiles {
    static label = 'Laser Scan + Odometry Map (2D)';
    constructor(panel) {
        super(panel);

        let w = panel.ui.widgets[panel.id_source];

        panel.max_trace_length = 5;
       
        $('#panel_title_'+panel.n).html(w.label);

        this.img = $('#panel_arrow_'+panel.n);
        $(this.img).click((ev)=>{
            ev.preventDefault(); //stop from moving the panel
            $('#follow_target_'+panel.n).prop('checked', true);
            that.follow_target = true;
        });

        // $(this.canvas).css({
        //     left: -this.canvas_size[0]/2.0,
        //     top: -this.canvas_size[1]/2.0,
        //     zIndex: 1,
        // });
        // $(this.canvas_overlay).css({
        //     left: -this.canvas_size[0]/2.0,
        //     top: -this.canvas_size[1]/2.0,
        //     zIndex: 2,
        // });

        // this.ctx = this.canvas.getContext("2d");
        // this.ctx_overlay = this.canvas_overlay.getContext("2d");
    
        // this.px = this.ctx.createImageData(1,1);
 
        this.pose_graph = [];
        this.scan_graph = [];
        this.scans_to_process = {};

        this.last_pose_rendered = -1;
        this.last_scan_rendered = -1;
        
        this.clear_pose = true;
        this.clear_scan = true;

        this._rot = new THREE.Quaternion();
        this._euler = new THREE.Euler();

        let that = this;

        this.topic_odo = '/odometry/filtered';
        this.topic_scan = '/scan';

        //zoom menu control
        panel.widget_menu_cb = () => {

            $('<div class="menu_line src_ctrl" id="src_ctrl_'+panel.n+'">'
                + '<button class="val" title="Odometry source">'+this.topic_odo+'</button>'
                + '<button class="val" title="Scan source">'+this.topic_scan+'</button>'
                + '</div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line zoom_ctrl" id="zoom_ctrl_'+panel.n+'">'
                + '<span class="minus">-</span>'
                + '<button class="val" title="Reset zoom">Zoom: '+panel.zoom.toFixed(1)+'x</button>'
                + '<span class="plus">+</span>'
                + '</div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('#zoom_ctrl_'+panel.n+' .plus').click(function(ev) {
                that.setZoom(panel.zoom + panel.zoom/2.0);
            });

            $('#zoom_ctrl_'+panel.n+' .minus').click(function(ev) {
                that.setZoom(panel.zoom - panel.zoom/2.0);
            });

            $('#zoom_ctrl_'+panel.n+' .val').click(function(ev) {
                that.setZoom(1.0);
            });

            $('<div class="menu_line"><label for="update_panel_'+panel.n+'" class="update_panel_label" id="update_panel_label_'+panel.n+'"><input type="checkbox" id="update_panel_'+panel.n+'" class="panel_update" checked title="Update"/> Update panel</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line"><label for="follow_target_'+panel.n+'" class="follow_target_label" id="follow_target_label_'+panel.n+'"><input type="checkbox" id="follow_target_'+panel.n+'" class="follow_target" checked title="Follow target"/> Follow target</label></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line"><a href="#" id="save_panel_link_'+panel.n+'">Save data</a></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line"><a href="#" id="configure_panel_link_'+panel.n+'">Settings</a></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());

            $('<div class="menu_line"><a href="#" id="clear_panel_link_'+panel.n+'">Clear</a></div>')
                .insertBefore($('#close_panel_link_'+panel.n).parent());
            
            $('#clear_panel_link_'+panel.n).click((ev)=>{
                ev.preventDefault(); //stop from moving the panel
                that.clear();
            });

            $('#update_panel_'+panel.n).change(function(ev) {
                that.update = $(this).prop('checked');
            });

            $('#follow_target_'+panel.n).change(function(ev) {
                that.follow_target = $(this).prop('checked');
                // if (that.follow_target) 
                //     $('#panel_widget_'+panel.n).removeClass('scrollable');
                // else
                //     $('#panel_widget_'+panel.n).addClass('scrollable');
            });
        } //widget menu end

        // window.addEventListener('resize', () => {
        //     ResizeWidget(panel);
        //     RenderScan(panel);
        // });
        // $('#display_panel_source_'+panel.n).change(() => {
        //     ResizeWidget(panel);
        //     RenderScan(panel);
        // });
    
        // this.last_odo = null;
        panel.ui.client.on(this.topic_odo, this.on_odometry_data);
        panel.ui.client.on(this.topic_scan, this.on_scan_data);
       
        this.rendering_loop();
    }

    on_odometry_data = (odo) => {

        if (!this.update) {
            return;
        }

        if (!this.base_offset)
            this.base_offset = [ odo.pose.pose.position.y, odo.pose.pose.position.x ]

        this._rot.set(
            odo.pose.pose.orientation.x,
            odo.pose.pose.orientation.y,
            odo.pose.pose.orientation.z,
            odo.pose.pose.orientation.w
        )
        this._euler.setFromQuaternion(this._rot);
        let angleInRadians = this._euler.z;
        let ns_stamp = odo.header.stamp.sec*1000000000 + odo.header.stamp.nanosec;
        
        let angularSpeed = 0;
        if (this.pose_graph.length) {
            let ns_d = ns_stamp - this.pose_graph[this.pose_graph.length-1][0];
            let rad_d = angleInRadians - this.pose_graph[this.pose_graph.length-1][3];
            angularSpeed = (rad_d / ns_d) * 1000000000.0;
        }

        this.pose_graph.push( [
            ns_stamp, //ns
            odo.pose.pose.position.y - this.base_offset[0],
            odo.pose.pose.position.x - this.base_offset[1],
            angleInRadians, //from imu
            angularSpeed
        ]);

        if (this.scans_to_process[ns_stamp]) {
            console.log('late processing scan'+ns_stamp);
            let scan = this.scans_to_process[ns_stamp];
            delete this.scans_to_process[ns_stamp];
            this.on_scan_data(scan, ns_stamp, this.pose_graph.length-1);
        }

        // that.last_odo = odo;
        this.render();
    }

    on_scan_data = (scan, ns_stamp=null, k = -1) => {

        if (!this.update) {
            return;
        }

        if (!this.pose_graph.length)
            return; //ignore

        if (ns_stamp === null)
            ns_stamp = scan.header.stamp.sec*1000000000 + scan.header.stamp.nanosec; //ns

        // if (k === -1) {
        //      // match node in pose graph (closest timestamp, newer preferred)
        //     let _k = -1;
        //     for (k = this.pose_graph.length-1; k >= 0; k--) {
        //         if (this.pose_graph[k][0] <= ns_stamp) {
        //             if (_k >= 0)
        //                 k = _k;  // use the next one after this
        //             // console.log('Pose matched k='+k+'/'+this.pose_graph.length+'; t_pose='+t_pose+'; t_scan='+t_scan)
        //             break;
        //         } else {
        //             _k = k;
        //         }
        //     }
        //     if (k < 0) {
        //         //this.scans_to_process[ns_stamp] = scan;
        //         //return;
        //         k = this.pose_graph.length-1; // use the latest
        //     }

            
        // } 

        k = this.pose_graph.length-1;
        let pose = this.pose_graph[k];
        // if (Math.abs(pose[4]) > 0.01) {
        //     console.warn('pose['+k+'] ang_speed=', pose[4]);
        // }
       
        // k = this.trace.length-1;

        

        // if (pose[0] != ns_stamp) {
        //     console.warn('scan/pose stamp not matching')
        // } else {
        //     console.info('scan/pose stamp matching')
        // }

        let x = pose[1];
        let y = pose[2];
        let a = pose[3];
        let anglePerRange = 360.0 / scan.ranges.length;

        let scan_data = [
            ns_stamp,
            k, scan.range_max,
            Math.abs(pose[4]) > 0.01 ? pose[4] : 0.0 //ang speed
            // vec2 points follow
        ]

        for (let j = 0; j < scan.ranges.length; j++) {
            let val = scan.ranges[j];
            if (val === null || val > scan.range_max || val < scan.range_min)
                continue;
            
            let fw = [ 0, val ]

            let arad = deg2rad(anglePerRange * j);
            arad = -1.0*a + (Math.PI - arad);
            
            scan_data.push([
                x + Math.cos(arad)*fw[0] - Math.sin(arad)*fw[1],
                y + Math.sin(arad)*fw[0] + Math.cos(arad)*fw[1]
            ]);
        }

        this.scan_graph.push(scan_data);
        
        this.render();
    }

    render(clear_pose, clear_scan) {
        this.render_dirty = true;
        
        if (clear_pose !== undefined)
            this.clear_pose = clear_pose;
        
        if (clear_scan !== undefined)
            this.clear_scan = clear_scan;
    }
     
    rendering_loop() {

        let clear_tiles = false;
        if (this.do_clear) {
            this.do_clear = false;
            this.clear_pose = true;
            this.clear_scan= true;
            clear_tiles = true;
            this.scan_graph = [];
            this.pose_graph = [];
            this.render_dirty = true;
        }
        
        let that = this;
        if (this.clear_scan || this.clear_pose) {
            let layers = [];
            if (this.clear_scan) layers.push(0)
            if (this.clear_pose) layers.push(1)
            this.clearTiles(layers);
        }

        if (this.clear_scan) {
            this.clear_scan = false;
            this.last_scan_rendered = -1;
        }

        if (this.clear_pose) {
            this.clear_pose = false;
            this.last_pose_rendered = -1;
        }

        if (!this.rendering)
            return; // loop end

        if (!this.render_dirty) {
            return window.requestAnimationFrame((step)=>{
                that.rendering_loop();
            });
        }

        let panel = this.panel;

        // let frame = [
        //     this.canvas_size[0]/2.0,
        //     this.canvas_size[1]/2.0
        // ];
    
        // let range = 8.0; //panel.range_max;
        
        // move arrow to position
        if (this.pose_graph.length && this.img) {

            let x = this.pose_graph[this.pose_graph.length-1][1] * this.render_scale;
            let y = this.pose_graph[this.pose_graph.length-1][2] * this.render_scale;
            let a = -1.0 * this.pose_graph[this.pose_graph.length-1][3] + Math.PI;

            this.img.css({
                left: (x-10)+'px',
                top: (y-10)+'px',
                transform: 'rotate('+a+'rad)',
                scale: 1.0/this.panel.zoom,
                display: 'block'
            });

            if (this.follow_target) {
                $(this.canvas_container).css({
                    left: panel.widget_width/2.0 - x * panel.zoom,
                    top: panel.widget_height/2.0 - y * panel.zoom
                });
            }
        }

        //panel.display_widget.fillStyle = "#fff";
        
        if (this.pose_graph.length > 1 && this.pose_graph.length-1 > this.last_pose_rendered) {

            if (this.last_pose_rendered < 0)
                this.last_pose_rendered = 0;

            let p0 = [
                this.pose_graph[this.last_pose_rendered][1] * this.render_scale,
                this.pose_graph[this.last_pose_rendered][2] * this.render_scale,
            ];
            
            let tile0 = null;
            let tile1 = null;
            let tile_dirty = false;
            // let t_half = this.tile_size/2.0;

            for (let i = this.last_pose_rendered+1; i < this.pose_graph.length; i++) {

                let p1 = [
                    this.pose_graph[i][1] * this.render_scale,
                    this.pose_graph[i][2] * this.render_scale,
                ]

                tile0 = this.get_tile(p0[0], p0[1], 1, this.tiles);
                tile1 = this.get_tile(p1[0], p1[1], 1, this.tiles);

                if (tile0 != tile1 && tile_dirty) {

                    // console.log('switched tile');
                    tile0.ctx.lineTo(p1[0]-tile0.x, p1[1]-tile0.y);
                    tile0.ctx.stroke();
                    // tile0.ctx.closePath();
                    // tile0.ctx.moveTo(t_half,t_half); //test

                    tile1.ctx.beginPath();
                    tile1.ctx.strokeStyle = '#00ff00';
                    tile1.ctx.lineWidth = Math.max(1.0/this.panel.zoom, 1.0);
                    tile1.ctx.moveTo(p0[0]-tile1.x, p0[1]-tile1.y);

                }
                
                if (!tile_dirty) {

                    tile_dirty = true;
                    // console.log('starting tile');
                        
                    tile1.ctx.beginPath();
                    tile1.ctx.strokeStyle = '#00ff00';
                    tile1.ctx.lineWidth = Math.max(1.0/this.panel.zoom, 1.0);
                    tile1.ctx.moveTo(p0[0]-tile1.x, p0[1]-tile1.y);

                }//{ // crossing canvas border

                tile1.ctx.lineTo(p1[0]-tile1.x, p1[1]-tile1.y);
                tile1.ctx.moveTo(p1[0]-tile1.x, p1[1]-tile1.y);

                tile0 = tile1;
                p0 = p1;

                this.last_pose_rendered = i;
            }

            if (tile_dirty) {
                tile_dirty = false;
                tile1.ctx.stroke();
                // tile1.ctx.closePath();
            }

            // this.ctx_overlay.beginPath();
           
            // let x = frame[0] + this.pose_graph[this.last_pose_rendered][1] * this.render_scale;
            // let y = frame[1] + this.pose_graph[this.last_pose_rendered][2] * this.render_scale;
            
            // this.ctx_overlay.strokeStyle = '#00ff00';
            // let width = Math.max(1.0/this.panel.zoom, 1.0);
            // this.ctx_overlay.lineWidth = width;
            // this.ctx_overlay.moveTo(x, y);
            // for (let i = this.last_pose_rendered+1; i < this.pose_graph.length; i++) {
            //     x = frame[0] + this.pose_graph[i][1] * this.render_scale;
            //     y = frame[1] + this.pose_graph[i][2] * this.render_scale;
            //     this.ctx_overlay.lineTo(x, y);
            //     // this.ctx.moveTo(x, y);
            //     this.last_pose_rendered = i;
            // }
            // this.ctx_overlay.stroke();
        }

        if (this.scan_graph.length > 0 && this.scan_graph.length-1 > this.last_scan_rendered) {

            if (this.last_scan_rendered < 0)
                this.last_scan_rendered = 0;

            for (let i = this.last_scan_rendered; i < this.scan_graph.length; i++) {

                let pos = this.scan_graph[i][1];
                let range = this.scan_graph[i][2];

                let ang_speed = Math.abs(this.scan_graph[i][3]);
                //let amount = 
                let amount = Math.min(Math.max(ang_speed / 2.0, 0.0), 1.0);
                let c = lerpColor('#FF0000', '#000000', amount);
                let alpha = parseInt(lerp(255, 50, amount));
                let a = alpha.toString(16).padStart(2, '0');

                // this.ctx.fillStyle = c + a;
                // if (amount)
                //     console.log(ang_speed.toFixed(2)+' => '+amount.toFixed(2)+' ', c, a, this.ctx.fillStyle);
                // else 
                //     console.log(ang_speed.toFixed(2)+' => ', this.ctx.fillStyle);

                // this.ctx.fillStyle = "#000000ff";
                // this.ctx.beginPath();
                // this.ctx.arc(
                //     frame[0] + this.pose_graph[pos][1] * panel.zoom,
                //     frame[1] + this.pose_graph[pos][2] * panel.zoom,
                //     range * panel.zoom, 0, 2 * Math.PI);
                // this.ctx.fill();

                // let last_tile = null;
                for (let j = 4; j < this.scan_graph[i].length; j++) {

                    let x = this.scan_graph[i][j][0] * this.render_scale;
                    let y = this.scan_graph[i][j][1] * this.render_scale;

                    let tile = this.get_tile(x, y, 0, this.tiles);

                    tile.ctx.fillStyle = c + a;
                    
                    tile.ctx.fillRect(x-tile.x, y-tile.y, 1, 1 );

                    // if (t != last_tile) {
                    //     last_tile = t;
                    // }
                    // this.ctx.fillRect( x, y, 1, 1 );

                    // let d  = this.px.data;                        // only do this once per page
                    // d[0]   = 255;
                    // d[1]   = 0;
                    // d[2]   = 0;
                    // d[3]   = 255;
                    // this.ctx.putImageData(this.px, x, y);    

                    // console.log(i, j, this.scan_graph[i][j])

                    // this.ctx.fillStyle = "#ff0000";
                    // this.ctx.beginPath();
                    // this.ctx.arc(
                    //     x,
                    //     y,
                    //     .5, 0, 2 * Math.PI);
                    // this.ctx.fill();
                }

                // this.ctx.lineTo(x, y);
                // this.ctx.moveTo(x, y);

                this.last_scan_rendered = i;
            }
        }
            
    
        // for (let i = 0; i < panel.data_trace.length; i++) {
        //     let pts = panel.data_trace[i];
    
        //     for (let j = 0; j < pts.length; j++) {
        //         let p = [ pts[j][0]*panel.zoom, pts[j][1]*panel.zoom ]; //zoom applied here
        //         this.ctx.fillStyle = (i == panel.data_trace.length-1 ? "#ff0000" : "#aa0000");
        //         this.ctx.beginPath();
        //         this.ctx.arc(frame[0]+p[0], frame[1]-p[1], 1.5, 0, 2 * Math.PI);
        //         this.ctx.fill();
        //     }
        // }
    

        window.requestAnimationFrame((step)=>{
            that.rendering_loop();
        });

    }

    onClose() {
        console.warn('Closing odoscan widget')
        this.rendering = false; //kills the loop
        this.panel.ui.client.off('/odometry/filtered', this.on_odometry_data);
        this.panel.ui.client.off('/scan', this.on_scan_data);

    }


    //console.log('widget', [panel.widget_width, panel.widget_height], frame);

    // if (decoded) {
    //     let numSamples = decoded.ranges.length;
    //     let anglePerSample = 360.0 / numSamples;

    //     //panel.display_widget.fillStyle = "#ff0000";

    //     let scale = (panel.widget_height/2.0 - 20.0) / decoded.range_max;

    //     let newScanPts = [];
    //     for (let i = 0; i < numSamples; i++) {

    //         if (decoded.ranges[i] == null || decoded.ranges[i] > decoded.range_max || decoded.ranges[i] < decoded.range_min)
    //             continue;

    //         let pos = [
    //             0,
    //             decoded.ranges[i] * scale
    //         ]

    //         let arad = deg2rad(anglePerSample * i);
    //         let p = [
    //             Math.cos(arad)*pos[0] - Math.sin(arad)*pos[1],
    //             Math.sin(arad)*pos[0] + Math.cos(arad)*pos[1]
    //         ]

    //         newScanPts.push(p);
    //     }

    //     panel.data_trace.push(newScanPts);

    //     if (panel.data_trace.length > panel.max_trace_length) {
    //         panel.data_trace.shift();
    //     }

    //     panel.range_max = decoded.range_max; //save for later
    //     panel.scale = scale;

    //     LaserScanWidget_Render(panel);
    // }
}