export class CustomServiceInput {
	id_service = null;
	bridge_client= null; // browser client ref
	config_data = null; // passed initial data

	constructor(id_service, bridge_client, config_data) {
		this.id_service = id_service;
		this.bridge_client = bridge_client;
		this.config_data = config_data;
	}

	makeElements(target_el) {
		// crete your controls and add to 
		// the target el
	}

	updateDisplay(value, is_error=false) {
		// update created elements with value
	}

	getCurrentValue(done_cb, err_cb) {
		// handle loading of the current value
		// i.e. via a getter service call
		// called on init and when nodes are updated
	}

	onValueChanged(msg) {
		// trigerred when another peer updates the input
		// override to update the UI
	}
}
