export class ServiceInputBase {
	id_service = null;
	client= null; // browser client ref

	constructor(id_service, client) {
		this.id_service = id_service;
		this.client = client;
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
