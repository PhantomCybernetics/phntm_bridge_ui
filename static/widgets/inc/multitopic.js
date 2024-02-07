export class MultiTopicSource {

    constructor(widget) {
        this.widget = widget;
        this.panel = widget.panel;
    }

    initMenu () {

        $('<div class="menu_line src_ctrl">' +
            '<span class="label">Edit input</span>' +
            '<div id="src_ctrl_'+this.panel.n+'" class="src_ctrl_menu"></div>' +
            '</div>')
            .insertBefore($('#pause_panel_menu_'+this.panel.n));

        this.src_ctrl_menu = $('#src_ctrl_'+this.panel.n);

    }

    makeTopicButton(title, msg_type, topic) {
        let btn = $('<button class="val" title="'+title+' - '+msg_type+'">'+topic+'</button>');
        let rem_btn = $('<span class="remove" title="Remove"><span class="icon"></span></span>');
        rem_btn.on('mouseenter', (e) => {
            btn.addClass('warn');
        });
        rem_btn.on('mouseleave', (e) => {
            btn.removeClass('warn');
        });
        rem_btn.appendTo(btn);
        btn.appendTo(this.src_ctrl_menu);
    }

    makeEmptyButton(title, msg_type) {
        let btn = $('<button class="notset" title="'+title+'">'+msg_type+'</button>');
        btn.appendTo(this.src_ctrl_menu);
    }

    

}