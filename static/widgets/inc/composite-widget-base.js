export class CompositePanelWidgetBase extends EventTarget {

    // default grid size when created
    static default_width = 5;
	static default_height = 5;

    constructor(panel) {
        super();

        this.panel = panel;
    }

    setupMenu(menu_els) {

    }

    onResize() {

    }

    onClose() {
        
    }
}