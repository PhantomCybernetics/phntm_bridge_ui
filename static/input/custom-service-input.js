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

	onValueChanged(msg) {
		// trigerred when another peer updates the input
		// override to update the UI
	}

	static GetStyles() {
		return ""; // override this to insert custom CSS for this input class
	}
}
