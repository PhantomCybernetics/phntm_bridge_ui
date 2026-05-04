import {
	uuidToBytes,
} from "../inc/lib.js";


class ServiceInput {
	static MakeMenuControls(target_el, service, client) {}
}

export class UserButtonsServiceInput extends ServiceInput {
	static MakeMenuControls(inline_controls_cont, wrapped_controls_cont, service, client, node, node_cont) {
		if (!client.ui.service_btns[service.service])
			client.ui.service_btns[service.service] = [];

		let data_editor_btn = $('<button class="service_button data" title="Set service call data">{}</button>');
		data_editor_btn.click((e) => {
			e.cancelBubble = true;
			e.stopPropagation();
			$("#service_controls").addClass("hover_waiting"); //this will keep menu open (removed on next mouse enter)
			client.ui.service_input_dialog.showDialogServicesMenu(service, node, node_cont);
		});
		data_editor_btn.appendTo(inline_controls_cont);

		let btns = client.ui.service_btns[service.service];
		btns.sort((a, b) => {
			return a.sort_index - b.sort_index;
		});
		let inline_btn = true;

		let max_inline_width = (($("#service_list").width() - 20 - 15) / 2.0) - 40;
		let running_width = 0;
		let is_action = client.discovered_services[service.service] && client.discovered_services[service.service].is_action;
		let action_cancel_service = is_action ? service.service + '/_action/cancel_goal': null;

		btns.forEach((btn) => {

			if (!btn.el) {
				btn.el = $('<button class="service_button fancy_worker ' + btn.color + '">' + btn.label + "</button>");
				if (is_action)
					btn.el.addClass('action');
			} else {
				btn.el
					.html(btn.label)
					.removeClass( [ "blue", "green", "red", "orange", "magenta", "black" ] )
					.addClass(btn.color);
			}

			if (inline_btn) {
				btn.el.css({
					'position': 'absolute',
					'visibility': 'hidden',
				});

				btn.el.appendTo($("BODY"));

				running_width += btn.el.width() + 5 + 5 + 5; // padding + one margin
		
				btn.el.css({
			 		'position': 'relative',
			 		'visibility': 'visible',
				}).remove();

				if (running_width > max_inline_width)
					inline_btn = false;

				btn.el.appendTo(inline_btn ? inline_controls_cont : wrapped_controls_cont);
			} else { // wrapped
				btn.el.appendTo(wrapped_controls_cont);
			}

			btn.el.unbind().click((ev) => {
				
				if (is_action && btn.el.hasClass('working')) {
					client.ui.cancelButtonActionCall(service.service, btn.el);
				} else if (!is_action) { // service
					client.ui.serviceButtonUserPayloadCall(
						service.service, btn.value,
						btn.silent_request, btn.silent_reply,
						btn.el);
				} else { // action
					client.ui.actionButtonUserPayloadCall(
						service.service, btn.value,
						btn.silent_request, btn.silent_reply,
						btn.el);
				}
			});

		});
	}
}

// std_srvs/srv/Empty and std_srvs/srv/Trigger
export class ServiceInput_Empty extends ServiceInput {
	static MakeMenuControls(target_el, service, client) {
		let btn = $('<button class="service_button fancy_worker blue">Call</button>');

		btn.click((ev) => {
			client.ui.serviceButtonSimplePayloadCall(service.service, null, btn);
		});

		target_el.append(btn);
	}
}

// std_srvs/srv/SetBool
export class ServiceInput_Bool extends ServiceInput {
	static MakeMenuControls(target_el, service, client) {
		let btn_true = $('<button class="service_button fancy_worker green">True</button>');
		let btn_false = $('<button class="service_button fancy_worker red">False</button>');

		btn_true.click((ev) => {
			client.ui.serviceButtonSimplePayloadCall(service.service, { data: true }, btn_true);
		});

		btn_false.click((ev) => {
			client.ui.serviceButtonSimplePayloadCall(service.service, { data: false }, btn_false);
		});

		target_el.append(btn_true);
		target_el.append(btn_false);
	}
}
