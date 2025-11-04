import { ServiceInputDialog } from "./service-input-dialog.js";

export class NodeParamsDialog {
	constructor(client) {
		this.client = client;

		this.cont_el = $("#node-params-dialog");
		this.bg = $("#dialog-modal-confirm-underlay");
		this.editor_size = 0;
	}

	updateLayout() {
		let vW = window.innerWidth;
		let vH = window.innerHeight;

		if (vW < 570) this.cont_el.addClass("narrow");
		else this.cont_el.removeClass("narrow");

		if (vH < 570) this.cont_el.addClass("thin");
		else this.cont_el.removeClass("thin");
	}

	selectParam(name, value, description, i_list_param, param_label_el) {
		this.list_el.addClass("editor-open");

		if (this.selected_param_label && param_label_el != this.selected_param_label) {
			this.selected_param_label.removeClass("selected");
			this.selected_param_label = null;
		}

		this.editor_el.addClass("open");
		this.param_btns_el.addClass("editor-open");

		param_label_el.addClass("selected");
		this.selected_param_label = param_label_el;
		this.selected_param_name = name;
		this.selected_param_value = value;
		this.selected_param_description = description;

		this.renderParam(name, value, i_list_param);
	}

	renderParam(name, value, i_list_param) {
		let field = {
			type: null,
			name: name,
		};

		console.log(
			"Rendering param " + name + ", value/desc=",
			value,
			this.selected_param_description,
		);

		let default_value = null;

		let is_array = false;
		switch (value["type"]) {
			case 1:
				field.type = "bool";
				default_value = value.bool_value;
				break;
			case 2:
				field.type = "int64";
				default_value = value.integer_value;
				break;
			case 3:
				field.type = "float64";
				default_value = value.double_value;
				break;
			case 4:
				field.type = "string";
				default_value = value.string_value;
				if (
					default_value.indexOf("\n") > -1 ||
					default_value.indexOf("\r") > -1 ||
					default_value.length > 50
				) {
					field.is_long_text = true; // shows textarea
				}
				break;
			case 5:
				field.type = "uint8";
				is_array = true;
				default_value = [];
				value.byte_array_value.forEach((buff) => {
					const uint8Array = new Uint8Array(buff);
					default_value.push(uint8Array[0]);
				});
				break;
			case 6:
				field.type = "bool";
				is_array = true;
				default_value = [].concat(value.bool_array_value);
				break;
			case 7:
				field.type = "int64";
				is_array = true;
				default_value = [].concat(value.integer_array_value);
				break;
			case 8:
				field.type = "float64";
				is_array = true;
				default_value = [].concat(value.double_array_value);
				break;
			case 9:
				field.type = "string";
				is_array = true;
				default_value = [].concat(value.string_array_value);
				break;
		}

		this.output_value = default_value;

		this.editor_el.empty();

		let editor_size = this.editor_size;

		let that = this;

		let hint_lines = [];
		if (this.selected_param_description.description) {
			hint_lines.push(
				$(
					'<span class="hint-line">' +
						this.selected_param_description.description +
						"</span>",
				),
			);
		}
		if (this.selected_param_description.additional_constraints) {
			hint_lines.push(
				$(
					'<span class="hint-line">' +
						this.selected_param_description.additional_constraints +
						"</span>",
				),
			);
		}
		if (
			this.selected_param_description.integer_range &&
			this.selected_param_description.integer_range.length
		) {
			let ranges = [];
			this.selected_param_description.integer_range.forEach((range) => {
				let rr = [];
				if (range.from_value !== undefined) rr.push("From " + range.from_value);
				if (range.to_value !== undefined)
					rr.push((rr.length ? "to" : "To") + " " + range.to_value);
				ranges.push(rr.join(" "));
			});
			hint_lines.push(
				$('<span class="hint-line">' + ranges.join(", ") + "</span>"),
			);
		}
		if (
			this.selected_param_description.floating_point_range &&
			this.selected_param_description.floating_point_range.length
		) {
			let ranges = [];
			this.selected_param_description.floating_point_range.forEach((range) => {
				let rr = [];
				if (range.from_value !== undefined)
					rr.push("From " + range.from_value.toFixed(1));
				if (range.to_value !== undefined)
					rr.push((rr.length ? "to" : "To") + " " + range.to_value.toFixed(1));
				ranges.push(rr.join(" "));
			});
			hint_lines.push(
				$('<span class="hint-line">' + ranges.join(", ") + "</span>"),
			);
		}
		hint_lines.forEach((hint_line_el) => {
			this.editor_el.append(hint_line_el);
		});

		if (is_array) {
			editor_size = 7; //-ish

			this.list_el.removeClass("one-line-editor").css("height", "");
			this.editor_el.removeClass("one-line").css("height", "");

			ServiceInputDialog.MakePrimitiveArray(
				field,
				default_value,
				this.editor_el,
				true,
				(index, val) => {
					// console.log('Output val ['+index+'] changed to ', val);
					if (index === undefined && val === undefined)
						that.output_value.pop(); // trimmed
					else that.output_value[index] = val;
				},
			);
		} else {
			if (!field.is_long_text) {
				// one line
				editor_size = 1 + hint_lines.length;
			} else {
				editor_size = 4 + hint_lines.length;
			}

			this.list_el
				.addClass("one-line-editor")
				.css(
					"height",
					"calc(60vh - 60px + 5px - " + 34 * editor_size + "px - 20px)",
				);
			this.editor_el.addClass("one-line").css("height", 34 * editor_size + "px");

			const r = ServiceInputDialog.MakePrimitiveType(
				field,
				default_value,
				true,
				true,
				(val) => {
					// console.log('Output val changed to ', val);
					that.output_value = val;
				},
			);
			this.editor_el.append(r.line);
		}

		//fix scroll when list gets smaller
		if (editor_size > this.editor_size) {
			let scroll_offset = i_list_param * 30 - this.list_el.height() / 2.0;
			this.list_el.scrollTop(scroll_offset);
		}
		this.editor_size = editor_size;

		if (this.selected_param_description.read_only) {
			this.btn_set.addClass("read-only");
			this.btn_set.attr("title", "Parameter is read-only");
		} else {
			this.btn_set.removeClass("read-only");
			this.btn_set.attr("title", "");
		}

		this.editor_el.find("INPUT, SELECT").on("keypress", (ev) => {
			if (
				ev.keyCode == 13 &&
				!that.btn_set.hasClass("read-only") &&
				!that.btn_set.hasClass("working")
			) {
				// btn_edit_confirm.trigger('click');
				console.warn("ENTER");
				that.btn_set.click();
			}
		});
	}

	show(node) {
		this.node = node;

		let that = this;

		this.cont_el.empty();
		this.cont_el.append(
			$(
				"<h3>" +
					this.node.node +
					'</h3><span class="title">Runtime ROS Parameters</span>',
			),
		);

		this.list_el = $('<div class="params-list"></div>');
		this.selected_param_label = null;
		this.list_el_loader = $('<span class="loader"></span>');
		this.list_el.append(this.list_el_loader);

		this.editor_el = $('<div class="json-editor"></div>');

		let list_msg = {
			prefixes: [],
			depth: 0,
		};

		this.client.serviceCall(
			node["_srvListParameters"],
			list_msg,
			true,
			this.client.default_service_timeout_sec,
			(list_reply) => {
				if (list_reply.err) {
					if (that.node == node) {
						that.list_el.empty();
						that.list_el.append(
							$(
								'<div class="load-err">' +
									(list_reply.msg
										? list_reply.msg
										: "Error while fetching params") +
									"</div>",
							),
						);
					}
					return;
				}
				list_reply.result.names.sort();
				this.client.serviceCall(
					node["_srvDescribeParameters"],
					{ names: list_reply.result.names },
					true,
					this.client.default_service_timeout_sec,
					(descriptions_reply) => {
						if (descriptions_reply.err) {
							if (that.node == node) {
								that.list_el.empty();
								that.list_el.append(
									$(
										'<div class="load-err">' +
											(descriptions_reply.msg
												? descriptions_reply.msg
												: "Error while fetching param descriptions") +
											"</div>",
									),
								);
							}
							return;
						}
						this.client.serviceCall(
							node["_srvGetParameters"],
							{ names: list_reply.result.names },
							true,
							this.client.default_service_timeout_sec,
							(vals_reply) => {
								if (vals_reply.err) {
									if (that.node == node) {
										that.list_el.empty();
										that.list_el.append(
											$(
												'<div class="load-err">' +
													(vals_reply.msg
														? vals_reply.msg
														: "Error while fetching params") +
													"</div>",
											),
										);
									}
									return;
								}
								that.list_el.empty();

								for (let i = 0; i < list_reply.result.names.length; i++) {
									let name = list_reply.result.names[i];
									let value = vals_reply.values[i];
									let description = descriptions_reply.descriptors[i];
									let type_hr = that.getTypeHR(value["type"]);
									let param_label_el = $(
										'<div class="param-name prevent-select">' +
											name +
											'<span class="param-type">' +
											type_hr +
											"</span></div>",
									);
									that.list_el.append(param_label_el);
									param_label_el.click((ev) => {
										that.selectParam(
											name,
											value,
											description,
											i,
											param_label_el,
										);
									});
								}
							},
						);
					},
				);
			},
		);

		this.bottom_btns_el = $('<div class="buttons"></div>');
		let btn_close = $('<button class="btn-close">Close</button>');
		btn_close.click((ev) => {
			that.hide();
		});

		this.param_btns_el = $('<div class="pram-buttons"></div>');

		let btn_reload = $('<button class="btn-reload">Reload</button>');
		btn_reload.click((ev) => {
			btn_reload.addClass("working");

			this.client.serviceCall(
				node["_srvGetParameters"],
				{ names: [that.selected_param_name] },
				true,
				this.client.default_service_timeout_sec,
				(value_reply) => {
					that.client.ui.serviceReplyNotification(
						btn_reload,
						node["_srvGetParameters"],
						false,
						value_reply,
					);
					btn_reload.removeClass("working");

					if (value_reply.err) {
						if (that.node == node) {
							that.editor_el.empty();
							that.editor_el.append(
								$(
									'<div class="load-err">' +
										(value_reply.msg
											? value_reply.msg
											: "Error while fetching param value") +
										"</div>",
								),
							);
						}
						return;
					}

					that.selected_param_value.bool_value =
						value_reply.values[0].bool_value;
					that.selected_param_value.integer_value =
						value_reply.values[0].integer_value;
					that.selected_param_value.double_value =
						value_reply.values[0].double_value;
					that.selected_param_value.string_value =
						value_reply.values[0].string_value;

					that.selected_param_value.byte_array_value.length = 0;
					that.selected_param_value.byte_array_value.push(
						...value_reply.values[0].byte_array_value,
					);

					that.selected_param_value.bool_array_value.length = 0;
					that.selected_param_value.bool_array_value.push(
						...value_reply.values[0].bool_array_value,
					);

					that.selected_param_value.integer_array_value.length = 0;
					that.selected_param_value.integer_array_value.push(
						...value_reply.values[0].integer_array_value,
					);

					that.selected_param_value.double_array_value.length = 0;
					that.selected_param_value.double_array_value.push(
						...value_reply.values[0].double_array_value,
					);

					that.selected_param_value.string_array_value.length = 0;
					that.selected_param_value.string_array_value.push(
						...value_reply.values[0].string_array_value,
					);

					// console.log('local val set to', that.selected_param_value);

					that.renderParam(
						that.selected_param_name,
						that.selected_param_value,
						-1,
					);
				},
			);
		});

		let btn_set = $('<button class="btn-save">Set</button>');
		this.btn_set = btn_set;
		btn_set.click((ev) => {
			if (btn_set.hasClass("read-only")) return;

			btn_set.addClass("working");

			console.log("setting val ", that.output_value);

			let param_val = {
				name: that.selected_param_name,
				value: {
					type: that.selected_param_value.type,
					bool_value: false,
					integer_value: 0,
					double_value: 0.0,
					string_value: "",
					byte_array_value: [],
					bool_array_value: [],
					integer_array_value: [],
					double_array_value: [],
					string_array_value: [],
				},
			};
			switch (param_val.value.type) {
				case 1:
					param_val.value.bool_value = that.output_value;
					break;
				case 2:
					param_val.value.integer_value = that.output_value;
					break;
				case 3:
					param_val.value.double_value = that.output_value;
					break;
				case 4:
					param_val.value.string_value = that.output_value;
					break;
				case 5:
					param_val.value.byte_array_value = that.output_value;
					for (let j = 0; j < param_val.value.byte_array_value.length; j++)
						param_val.value.byte_array_value[j] =
							param_val.value.byte_array_value[j] === null
								? 0
								: param_val.value.byte_array_value[j];
					break;
				case 6:
					param_val.value.bool_array_value = that.output_value;
					for (let j = 0; j < param_val.value.bool_array_value.length; j++)
						param_val.value.bool_array_value[j] =
							param_val.value.bool_array_value[j] === null
								? false
								: param_val.value.bool_array_value[j];
					break;
				case 7:
					param_val.value.integer_array_value = that.output_value;
					for (let j = 0; j < param_val.value.integer_array_value.length; j++)
						param_val.value.integer_array_value[j] =
							param_val.value.integer_array_value[j] === null
								? 0
								: param_val.value.integer_array_value[j];
					break;
				case 8:
					param_val.value.double_array_value = that.output_value;
					for (let j = 0; j < param_val.value.double_array_value.length; j++)
						param_val.value.double_array_value[j] =
							param_val.value.double_array_value[j] === null
								? 0.0
								: param_val.value.double_array_value[j];
					break;
				case 9:
					param_val.value.string_array_value = that.output_value;
					for (let j = 0; j < param_val.value.string_array_value.length; j++)
						param_val.value.string_array_value[j] =
							param_val.value.string_array_value[j] === null
								? ""
								: param_val.value.string_array_value[j];
					break;
			}

			console.log("param val ", param_val);

			that.client.serviceCall(
				node["_srvSetParameters"],
				{ parameters: [param_val] },
				true,
				this.client.default_service_timeout_sec,
				(set_reply) => {
					that.client.ui.serviceReplyNotification(
						btn_set,
						node["_srvSetParameters"],
						false,
						set_reply,
					);
					btn_set.removeClass("working");
					if (
						set_reply["results"] &&
						set_reply["results"].length == 1 &&
						set_reply["results"][0]["successful"] === true
					) {
						btn_reload.trigger("click");
					}
				},
			);
		});

		this.param_btns_el.append([btn_set, btn_reload]);

		this.bottom_btns_el.append([this.param_btns_el, btn_close]);
		this.cont_el.append([
			this.list_el,
			$('<div class="cleaner"/>'),
			this.editor_el,
			$('<div class="cleaner"/>'),
			this.bottom_btns_el,
		]);

		this.cont_el.draggable({
			handle: "h3",
			cursor: "move",
		});

		this.cont_el.show();

		this.bg
			.unbind()
			.show()
			.click((ev) => this.hide());
		$("BODY").addClass("no-scroll");
	}

	getTypeHR(i_type) {
		let type_hr = "n/a";
		switch (i_type) {
			case 0:
				type_hr = "unset";
				break;
			case 1:
				type_hr = "bool";
				break;
			case 2:
				type_hr = "int";
				break;
			case 3:
				type_hr = "double";
				break;
			case 4:
				type_hr = "string";
				break;
			case 5:
				type_hr = "byte[]";
				break;
			case 6:
				type_hr = "bool[]";
				break;
			case 7:
				type_hr = "int[]";
				break;
			case 8:
				type_hr = "double[]";
				break;
			case 9:
				type_hr = "string[]";
				break;
		}
		return type_hr;
	}

	hide() {
		this.cont_el.hide();
		this.bg.unbind().hide();
		$("BODY").removeClass("no-scroll");
	}
}
