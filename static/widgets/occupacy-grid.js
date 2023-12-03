import { lerpColor, linkifyURLs, lerp, deg2rad } from "../lib.js";
import * as THREE from 'three';

export class OccupancyGrid {
 
    static default_width = 5;
    static default_height = 4;

    constructor(panel) {
        this.panel = panel;
        this.panel.default_zoom = 1.0;
        if (this.panel.zoom === undefined || this.panel.zoom === null) {
            this.panel.zoom = this.panel.default_zoom;
        }

        let w = panel.ui.widgets[panel.id_source];

        this.tile_size = 500; //px x px one tile
        this.render_scale = 100;
        this.tiles = {}; // [x,y] => [ scan_canvas, overlay_canvas ]

        panel.max_trace_length = 5;
        $('#panel_widget_'+panel.n).addClass('enabled laser_scan');
        $('#panel_title_'+panel.n).html(w.label);

        $('#panel_widget_'+panel.n).html(
            '<div class="canvas_container" id="canvas_container_'+panel.n+'">' +
                '<img id="panel_arrow_'+panel.n+'" title="Follow target" class="arrow" src="/static/arrow.png">' +
            '</div>');
        $('#panel_widget_'+panel.n).addClass('scrollable');

        this.canvas_container = $('#canvas_container_'+panel.n);
        [ panel.widget_width, panel.widget_height ] = panel.getAvailableWidgetSize();
        this.canvas_container.css({
            left: panel.widget_width/2.0,
            top: panel.widget_height/2.0,
            scale: panel.zoom
        });

        this.img = $('#panel_arrow_'+panel.n);
        $(this.img).click((ev)=>{
            ev.preventDefault(); //stop from moving the panel
            $('#follow_target_'+panel.n).prop('checked', true);
            that.follow_target = true;
        });
 
        this.base_offset = null;

        this.pose_graph = [];
        this.map_data = [];
        // this.scans_to_process = {};

        // this.last_pose_rendered = -1;
        // this.last_scan_rendered = -1;

        this.render_dirty = false;
        this.clear_pose = true;
        this.clear_map = true;
        this.do_clear = false;

        this.drag_mouse_offset = []
        this.drag_frame_offset = []
        this.dragging = false;
        
        this.rendering = true; // loop runnig

        this._rot = new THREE.Quaternion();
        this._euler = new THREE.Euler();

        this.update = true; // disables new data processing
        this.follow_target = true;

        let that = this;

        this.topic_map = '/map';
        // this.topic_odo = '/odometry/filtered';
        // this.topic_scan = '/scan';

        //zoom menu control
        panel.widget_menu_cb = () => {

            $('<div class="menu_line src_ctrl" id="src_ctrl_'+panel.n+'">'
                + '<button class="val" title="Map source">'+this.topic_map+'</button>'
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
            });
        }
        
        panel.resize_event_handler = function () {
        };
        
        $('#panel_widget_'+panel.n).on('mousedown touchstart', (ev) => {
            // console.log(ev);
            if (ev.button === 0) {
                ev.preventDefault();
                that.drag_mouse_offset = [ ev.originalEvent.pageX, ev.originalEvent.pageY ];
                let cont_pos = $('#canvas_container_'+panel.n).position();
                that.drag_frame_offset = [ cont_pos.left, cont_pos.top ];
                that.dragging = true;
            }
        });

        $('#panel_widget_'+panel.n).on('wheel', (ev) => {
            ev.preventDefault();
            let d = ev.originalEvent.deltaY;
            this.setZoom(this.panel.zoom - d*0.005);
        });

        $(window.document).on('mousemove touchmove', function(ev) {
            if(that.dragging) {
                ev.preventDefault();

                if (that.follow_target) {
                    that.follow_target = false;
                    $('#follow_target_'+panel.n).prop('checked', false);
                }

                $('#canvas_container_'+panel.n).css({
                    left: that.drag_frame_offset[0] + (ev.originalEvent.pageX - that.drag_mouse_offset[0]),
                    top: that.drag_frame_offset[1] + (ev.originalEvent.pageY - that.drag_mouse_offset[1])
                });
            }
        });

        $(window.document).on('mouseup touchend', function(ev) {
            that.dragging = false;
        });

        panel.ui.client.on(this.topic_map, this.on_map_data);
       
        this.rendering_loop();
    }

    get_tile(x, y, layer) {

        let t_half = this.tile_size/2.0;
        let cx = Math.floor((x+t_half) / this.tile_size);
        let cy = Math.floor((y+t_half) / this.tile_size);

        if (!this.tiles[cx])
            this.tiles[cx] = {};
        if (!this.tiles[cx][cy])
            this.tiles[cx][cy] = {}

        if (!this.tiles[cx][cy][layer]) {
            console.log('Adding canvas tile ['+cx+';'+cy+'] L='+layer, x, y)
            this.tiles[cx][cy][layer] = {}
            let base = [
                cx * this.tile_size - t_half,
                cy * this.tile_size - t_half,
            ]
            let canvas = $(this.canvas_container).append(
                '<canvas class="canvas_tile" id="canvas_tile_'+cx+'x'+cy+'_'+layer+'" width="'+ this.tile_size +'" height="'+ this.tile_size +'" style="left: '+base[0]+'px; top: '+base[1]+'px; z-index: '+layer+'"></canvas>'
            ).find('#canvas_tile_'+cx+'x'+cy+'_'+layer)[0];
            // console.log(canvas);
            this.tiles[cx][cy][layer].canvas = canvas;
            this.tiles[cx][cy][layer].ctx = canvas.getContext('2d');
            this.tiles[cx][cy][layer].x = base[0];
            this.tiles[cx][cy][layer].y = base[1];
        }
        
        return this.tiles[cx][cy][layer];
    }

    setZoom(zoom) {
        let panel = this.panel;
        if (zoom < 0.1) {
            zoom = 0.1;
        } else if (zoom > 5.0) {
            zoom = 5.0;
        }
        panel.zoom = zoom;
        $('#zoom_ctrl_'+panel.n+' .val').html('Zoom: '+panel.zoom.toFixed(1)+'x');
        panel.ui.update_url_hash();
        let oldPos = $(this.img).offset();
        $(this.canvas_container).css({scale: panel.zoom});
        let newPos = $(this.img).offset();
        let pos = $(this.canvas_container).position();
        $(this.canvas_container).css({
            left: pos.left-(newPos.left-oldPos.left),
            top: pos.top-(newPos.top-oldPos.top),
        });
        this.render(true, false); // redraw pose
    }

    
    on_map_data = (map_msg, ns_stamp=null, k = -1) => {

        if (!this.update) {
            return;
        }
        
        
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
        
        let that = this;
        if (this.clear_scan || this.clear_pose) {
            // console.log('tiles x:', Object.keys(this.tiles));
            Object.keys(that.tiles).forEach((x)=>{
                // console.log('tiles y['+x+']:', Object.keys(this.tiles[x]));
                Object.keys(that.tiles[x]).forEach((y)=>{

                    if (that.clear_scan && that.tiles[x][y][0]) {
                        that.tiles[x][y][0].ctx.clearRect(0, 0, this.tile_size, this.tile_size);
                        if (clear_tiles) {
                            $('#canvas_tile_'+x+'x'+y+'_0').remove();
                            delete that.tiles[x][y][0];
                        }
                    }
                        
                    if (that.clear_pose && that.tiles[x][y][1]) {
                        that.tiles[x][y][1].ctx.clearRect(0, 0, that.tile_size, that.tile_size);
                        if (clear_tiles) {
                            $('#canvas_tile_'+x+'x'+y+'_1').remove();
                            delete that.tiles[x][y][1];
                        }
                    }
                        
                });
            });
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

                tile0 = this.get_tile(p0[0], p0[1], 1);
                tile1 = this.get_tile(p1[0], p1[1], 1);

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

        if (this.pose_graph.length > 0 && this.scan_graph.length-1 > this.last_scan_rendered) {

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

                    let tile = this.get_tile(x, y, 0);

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

    clear() {
        console.log('clearing widget!');
        this.do_clear = true;
    }
}
