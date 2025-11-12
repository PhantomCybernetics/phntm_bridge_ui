export class SingleTypePanelWidgetBase extends EventTarget {

     // default grid size when created
    static default_width = 1;
	static default_height = 6;
    static handled_msg_types = []; // add message types to be handled here

    constructor(panel, topic, widget_css_class) {
        super(); // EventTarget

		this.panel = panel; 
        this.client = panel.ui.client;
		this.topic = topic;
        this.autoresize_renderer = true; // if renderer exists, it will be resized before onResize is called
        
        this.widget_el = $("#panel_widget_" + this.panel.n);

        this.widget_el.addClass("enabled");
        if (widget_css_class)
            this.widget_el.addClass(widget_css_class);
    }

    onData(msg) {

    }

    onResize() {

    }

    setupMenu(menu_els) {

    }

    onPaused() {

    }

    onUnpaused() {

    }

    getFpsString() {
        return ''; // return string to be displayed in the FPS label
    }

    onClose() {
    }
}