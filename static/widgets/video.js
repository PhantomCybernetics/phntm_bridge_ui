export class VideoWidget {

    constructor (panel, id_source)  {

        this.panel = panel;

        console.log('making video el')
        $('#panel_widget_'+panel.n)
            .addClass('enabled video')
            .html('<video id="panel_video_'+panel.n+'" autoplay="true" playsinline="true" muted></video>' //muted allows video autoplay in chrome before user interactions
                + '<span id="video_stats_'+panel.n+'" class="video_stats"></span>'
                + '<span id="video_fps_'+panel.n+'" class="video_fps"></span>'
                ); //muted allows video autoplay in chrome before user interactions

        this.el = $('#panel_video_'+panel.n);

        if (panel.id_stream && panel.ui.client.media_streams[panel.id_stream]) { // assign stream, if already available
            console.log('Assigning stream '+panel.id_stream+' to panel');
            document.getElementById('panel_video_'+panel.n).srcObject = panel.ui.client.media_streams[panel.id_stream];
        }

        panel.widget_menu_cb = function(panel) {

            //fps menu toggle
            $('<div class="menu_line"><label for="video_fps_cb_'+panel.n+'" class="video_fps_cb_label" id="video_fps_cb_label_'+panel.n+'">'
                +'<input type="checkbox" id="video_fps_cb_'+panel.n+'" checked class="video_fps_cb" title="Display video FPS"> FPS</label></div>'
                ).insertBefore($('#close_panel_link_'+panel.n).parent());

            $('#video_fps_cb_'+panel.n).change(function(ev) {
                if ($(this).prop('checked')) {
                    $('#video_fps_'+panel.n).addClass('enabled');
                } else {
                    $('#video_fps_'+panel.n).removeClass('enabled');
                }
            });

            $('#video_fps_'+panel.n).addClass('enabled'); //on by default

            //stats menu toggle
            $('<div class="menu_line"><label for="video_stats_cb_'+panel.n+'" class="video_stats_cb_label" id="video_stats_cb_label_'+panel.n+'">'
                +'<input type="checkbox" id="video_stats_cb_'+panel.n+'" class="video_stats_cb" title="Display video stats"> Stats for nerds</label></div>'
                ).insertBefore($('#close_panel_link_'+panel.n).parent());

            $('#video_stats_cb_'+panel.n).change(function(ev) {
                if ($(this).prop('checked')) {
                    $('#video_stats_'+panel.n).addClass('enabled');
                } else {
                    $('#video_stats_'+panel.n).removeClass('enabled');
                }
            });

        }

    }

}