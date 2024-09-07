import { lerpColor, randColor, linkifyURLs, lerp, deg2rad } from "../lib.js";
import * as THREE from 'three';
import { Zoomable2DTiles } from './inc/zoomable-2d-tiles.js'

export class OccupancyGrid extends Zoomable2DTiles {
 
    static default_width = 7;
    static default_height = 4;

    constructor(panel, topic) {
        super(panel);

        this.topic = topic;

        panel.max_trace_length = 5;

        this.render_scale = 5.0;

        this.img = $('#panel_arrow_'+panel.n);
        $(this.img).click((ev)=>{
            ev.preventDefault(); //stop from moving the panel
            $('#follow_target_'+panel.n).prop('checked', true);
            that.follow_target = true;
        });

        this.map_info_el = $('<div id="map_info_'+panel.n+'" class="map_info"></div>');
        $('#panel_widget_'+panel.n).append(this.map_info_el);

        this.pose_graph = [];
        this.map_data = [];
        this.last_map_tile_rendered = -1;
        this.map_dirty = false;
        this.tiles_flat = [];
        // this.scans_to_process = {};

        this.last_pose_rendered = -1;
        // this.last_scan_rendered = -1;

        this.clear_pose = true;
        this.clear_map = true;

        this._rot = new THREE.Quaternion();
        this._euler = new THREE.Euler();

        let that = this;

        this.topic_map = '/map';
        // this.topic_odo = '/odometry/filtered';
        // this.topic_scan = '/scan';

        //zoom menu control
        panel.widget_menu_cb = () => {

            $('<div class="menu_line zoom_ctrl" id="zoom_ctrl_'+panel.n+'">'
                + '<span class="minus">-</span>'
                + '<button class="val" title="Reset zoom">Zoom: '+panel.zoom.toFixed(1)+'x</button>'
                + '<span class="plus">+</span>'
                + '</div>')
                .insertBefore($('#close_panel_menu_'+panel.n));

            $('#zoom_ctrl_'+panel.n+' .plus').click(function(ev) {
                that.setZoom(panel.zoom + panel.zoom/2.0);
            });

            $('#zoom_ctrl_'+panel.n+' .minus').click(function(ev) {
                that.setZoom(panel.zoom - panel.zoom/2.0);
            });

            $('#zoom_ctrl_'+panel.n+' .val').click(function(ev) {
                that.setZoom(1.0);
            });

            $('<div class="menu_line"><label for="follow_target_'+panel.n+'" class="follow_target_label" id="follow_target_label_'+panel.n+'"><input type="checkbox" id="follow_target_'+panel.n+'" class="follow_target" checked title="Follow target"/> Follow target</label></div>')
                .insertBefore($('#close_panel_menu_'+panel.n));

            $('<div class="menu_line"><a href="#" id="save_panel_link_'+panel.n+'">Save data</a></div>')
                .insertBefore($('#close_panel_menu_'+panel.n));

            $('<div class="menu_line"><a href="#" id="configure_panel_link_'+panel.n+'">Settings</a></div>')
                .insertBefore($('#close_panel_menu_'+panel.n));

            $('<div class="menu_line"><a href="#" id="clear_panel_link_'+panel.n+'">Clear</a></div>')
                .insertBefore($('#close_panel_menu_'+panel.n));
            
            $('#clear_panel_link_'+panel.n).click((ev)=>{
                ev.preventDefault(); //stop from moving the panel
                that.clear();
            });

            $('#follow_target_'+panel.n).change(function(ev) {
                that.follow_target = $(this).prop('checked');
            });
        }
       
        this.rendering_loop();
    }
    
    onData = (map_msg, ns_stamp=null, k = -1) => {

        this.map_width = map_msg.info.width;
        this.map_height = map_msg.info.height;
        this.resolution = map_msg.info.resolution;
        this.map_data = map_msg.data;
        this.map_dirty = true;
        
        
        $(this.map_info_el).html(
            map_msg.header.stamp.sec+':'+map_msg.header.stamp.nanosec+'<br>' +
            (map_msg.data.length/1024).toFixed(2)+' kB<br>' +
            this.map_width+' x '+this.map_height+'<br>' +
            (this.map_width*this.resolution).toFixed(2)+' x '+(this.map_height*this.resolution).toFixed(2)+' m <br>' +
            this.resolution.toFixed(2) + ' m res'
        );
        this.render();
    }

    render(clear_pose, clear_map) {
        this.render_dirty = true;
        
        if (clear_pose !== undefined)
            this.clear_pose = clear_pose;
        
        if (clear_map !== undefined)
            this.clear_map = clear_map;
    }
     
    rendering_loop() {

        let clear_tiles = false;
        if (this.do_clear) {
            this.do_clear = false;
            this.clear_pose = true;
            this.clear_map= true;
            clear_tiles = true;
            this.scan_graph = [];
            this.pose_graph = [];
            this.render_dirty = true;
        }

        // if (this.last_map_point_rendered === 0){
        //     // this.clear_map = true;
        // }
            
        
        let that = this;
        if (this.clear_map || this.clear_pose) {
            let layers = [];
            if (this.clear_map) layers.push(0)
            if (this.clear_pose) layers.push(1)
            this.clearTiles(layers, false);
        }

        if (this.clear_map) {
            this.clear_map = false;
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

        if (this.map_data.length) {

            if (this.map_dirty) {
                this.map_dirty = false;
                this.tiles_flat = [];
                for (let x = 0; x < this.map_width*this.render_scale; x+=this.tile_size) {
                    for (let y = 0; y < this.map_height*this.render_scale; y+=this.tile_size) {
                        this.tiles_flat.push(this.get_tile(x, y, 0));
                    }
                }
                this.last_map_tile_rendered = -1;
                console.log('Made '+this.tiles_flat.length+' tiles');
            }

            
            if (this.last_map_tile_rendered > -2 && this.last_map_tile_rendered < this.tiles_flat.length-1) {
                let n = 0;
                for (let i = this.last_map_tile_rendered+1; i < this.tiles_flat.length; i++) {
                    let tile = this.tiles_flat[i];
                    console.warn('rendering '+i+'  / '+this.tiles_flat.length);
                    tile.ctx.fillStyle = randColor()+'55';
                    console.log('Fill '+i, tile.ctx.fillStyle);
                    tile.ctx.fillRect(0, 0, this.tile_size, this.tile_size);
                    // tile.ctx.clearRect(0, 0, this.tile_size, this.tile_size);
                    this.last_map_tile_rendered = i;
    
                    let src_tile_size = Math.floor(this.tile_size / this.render_scale);
                    let src_tile_offset_x = tile.cx * src_tile_size;
                    let src_tile_offset_y = tile.cy * src_tile_size;
                    
                    for (let src_tile_x = 0; src_tile_x < src_tile_size; src_tile_x++) {

                        let src_x = src_tile_x + src_tile_offset_x;
                        if (src_x > this.map_height)
                                continue;

                        for (let src_tile_y = 0; src_tile_y < src_tile_size; src_tile_y++) {
                            let src_y = src_tile_y + src_tile_offset_y;
                            if (src_y > this.map_width)
                                continue;

                            let val = this.map_data[(src_x)*this.map_width + (src_y)];
                            if (val < 0)
                                continue;
    
                            let amount = val / 100.0;
                            let c = lerpColor('#00FF00', '#FF0000', amount);
                            //     let alpha = parseInt(lerp(255, 50, amount));
                            //     let a = alpha.toString(16).padStart(2, '0');
                            tile.ctx.fillStyle = c + 'FF';
                            tile.ctx.fillRect(
                                src_tile_x*this.render_scale,
                                src_tile_y*this.render_scale,
                                this.render_scale, this.render_scale );
    
                        } 
                    }
    
                    n++;
                    if (n > 0)  //limit to one tile per frame
                        break;
                }
            }
            
            
            // this.last_map_point_rendered < this.map_data.length

            // 
            // for (let i = this.last_map_point_rendered; i < this.map_data.length; i++) {

            //     let x = Math.floor(i / this.map_width) * this.render_scale;
            //     let y = (i % this.map_width) * this.render_scale;
            //     let val = this.map_data[i]; //-1=unknown, 0=clear, 100=occupied

            //     this.last_map_point_rendered = i;

            //     if (val == -1)
            //         continue;

            //     let tile = this.get_tile(x, y, 0);

            //     let amount = val / 100.0;
            //     let c = lerpColor('#00FF00', '#FF0000', amount);
            //     let alpha = parseInt(lerp(255, 50, amount));
            //     let a = alpha.toString(16).padStart(2, '0');
            //     tile.ctx.fillStyle = c + 'FF';
                
            //     tile.ctx.fillRect(x-tile.x, y-tile.y, this.render_scale, this.render_scale );

            //     n++;
            //     if (n > 20000)
            //         break;
            // }
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
        console.warn('Closing map widget')
        this.rendering = false; //kills the loop
        // this.panel.ui.client.off(this.topic_map, this.on_map_data);
    }
}
