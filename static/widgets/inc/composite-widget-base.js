import { MultiTopicSource } from "./multitopic.js";

export class CompositePanelWidgetBase extends EventTarget {

    static LABEL = "Widget name";

    // default grid size when created
    static DEFAULT_WIDTH = 5;
	static DEFAULT_HEIGHT = 5;

    constructor(panel, widget_css_class) {
        super(); // EventTarget

        this.panel = panel;
        this.client = panel.ui.client;
        this.ui = panel.ui;
        this.autoresize_renderer = true; // if renderer exists, it will be resized before onResize is called

        this.widget_el = $("#panel_widget_" + this.panel.n);
        this.widget_el.addClass("enabled");

        if (widget_css_class)
            this.widget_el.addClass(widget_css_class);

        this.sources = new MultiTopicSource(this);
    }

    setupMenu(menu_els) {      
        this.sources.setupMenu(menu_els);
    }

    onPaused() {

    }

    onUnpaused() {

    }

    getFpsString() {
        return ''; // return string to be displayed in the FPS label
    }

    onResize() {

    }

    onClose() {
        this.sources.close();
    }
}