export class CustomServiceInput {

    id_service = null;
    data = null; // passed initial data
    target_el = null; // parent element of the input
    client = null; // browser client ref

    constructor(id_service, custom_data, client) {
        this.id_service = id_service;
        this.data = custom_data;
        this.client = client;
    }

    makeMenuControls() {
        // override this to make your UI
    }

    onValueChanged(new_value) {
        // trigerred when other peer updates the input
        // override to update the UI
    }

    static GetStyles() {
        // override this to insert custom CSS for this input class
    }
}