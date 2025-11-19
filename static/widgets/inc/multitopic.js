import { isTouchDevice } from "./../../inc/lib.js";

export class MultiTopicSource extends EventTarget {
	constructor(widget) {
		super();

		this.widget = widget;
		this.panel = widget.panel;
		this.sources = [];
		this.subscribed_topics = {};

		let that = this;
		this.onTopicsDiscoveredWrapper = (discovered_topics) => {
			that.onTopicsDiscovered(discovered_topics);
		};
		this.widget.panel.ui.client.on("topics", this.onTopicsDiscoveredWrapper);

		this.event_calbacks = {};

		this.menu_open = false;
	}

	add(msg_type, label, default_topic, num, cb, clear_cb) {
		let new_src = {
			msg_type: msg_type,
			label: label,
			default_topic: default_topic,
			num: num,
			cb: cb,
			clear_cb: clear_cb,
			topic_slots: [],
			args_parsed: false,
		};
		this.sources.push(new_src);
		this.updateSlots(new_src);
	}

	on(event, cb) {
		if (!this.event_calbacks[event]) this.event_calbacks[event] = [];

		let p = this.event_calbacks[event].indexOf(cb);
		if (p > -1) return;

		this.event_calbacks[event].push(cb);
	}

	off(event, cb) {
		if (!this.event_calbacks[event]) {
			return;
		}

		let p = this.event_calbacks[event].indexOf(cb);
		if (p > -1) {
			this.event_calbacks[event].splice(p, 1);
		}
	}

	emit(event, ...args) {
		if (!this.event_calbacks[event]) {
			return;
		}

		let callbacks = Object.values(this.event_calbacks[event]);
		callbacks.forEach((cb) => {
			setTimeout(() => {
				cb(...args);
			}, 0);
		});
	}

	hasSources() {
		for (let i = 0; i < this.sources.length; i++) {
			if (!this.sources[i].topic_slots) continue;
			for (let j = 0; j < this.sources[i].topic_slots.length; j++) {
				if (this.sources[i].topic_slots[j].selected_topic) {
					return true;
				}
			}
		}
		return false;
	}

	hasType(msg_type) {
		for (let i = 0; i < this.sources.length; i++) {
			if (this.sources[i].msg_type != msg_type) continue;
			if (!this.sources[i].topic_slots) continue;
			for (let j = 0; j < this.sources[i].topic_slots.length; j++) {
				if (this.sources[i].topic_slots[j].selected_topic) {
					return true;
				}
			}
		}
		return false;
	}

	getSources() {
		let topics = [];
		for (let i = 0; i < this.sources.length; i++) {
			if (!this.sources[i].topic_slots) continue;
			for (let j = 0; j < this.sources[i].topic_slots.length; j++) {
				if (this.sources[i].topic_slots[j].selected_topic) {
					topics.push(this.sources[i].topic_slots[j].selected_topic);
				}
			}
		}
		return topics;
	}

	topicSubscribed(topic) {
		for (let i = 0; i < this.sources.length; i++) {
			if (!this.sources[i].topic_slots) continue;
			for (let j = 0; j < this.sources[i].topic_slots.length; j++) {
				if (this.sources[i].topic_slots[j].selected_topic == topic) {
					return true;
				}
			}
		}
		return false;
	}

	storeAssignedTopicsPanelVars() {
		for (let i = 0; i < this.sources.length; i++) {
			let topics = [];
			this.sources[i].topic_slots.forEach((slot) => {
				if (slot.selected_topic && slot.selected_topic != this.sources[i].default_topic) //don't store defaults
					topics.push(slot.selected_topic);
			});
			this.panel.storePanelVarAsStringArray("in"+i, topics);
		}
	}

	loadAssignedTopicsFromPanelVars() {
		let that = this;
		Object.keys(this.panel.panel_vars).forEach((var_name)=>{
			if (var_name.indexOf("in") !== 0) return; // not a multitopic var, skip

			let i = parseInt(var_name.substring(2));
			let src = that.sources[i];
			if (!src) return;
			if (src.panel_config_loaded) return; //only once
			
			let topics = that.panel.getPanelVarAsStringArray(var_name, []);
			for (let j = 0; j < topics.length; j++) {
				let slot = src.topic_slots[j];
				if (!slot) {
					slot = {
						src: src,
						topic: null,
						msg_type: src.msg_type,
						label: src.label,
						selected_topic: null,
						clear_cb: src.clear_cb,
					};
					src.topic_slots.push(slot);
				}
				if (slot.selected_topic != topics[j]) {
					slot.selected_topic = topics[j];
					that.assignSlotTopic(slot); //try assign
				}
			}
			src.panel_config_loaded = true;

			that.updateSlots(src);
		});

		this.updateMenuContent();
	}

	updateSlots(src) {
		let num_slots = src.topic_slots.length;
		let all_slots_full = true;
		let default_topic_assigned = false;
		src.topic_slots.forEach((slot) => {
			if (!slot.selected_topic) all_slots_full = false;
			if (slot.selected_topic == src.default_topic) default_topic_assigned = true;
		});

		while ((all_slots_full && src.num == -1) || num_slots < src.num) {
			let assign_topic = null;
			if (!default_topic_assigned) {
				assign_topic = src.default_topic;
				default_topic_assigned = true;
			}
			let new_topic_slot = {
				src: src,
				topic: null,
				msg_type: src.msg_type,
				label: src.label,
				selected_topic: assign_topic,
				// cb: src.cb,
				clear_cb: src.clear_cb,
			};
			src.topic_slots.push(new_topic_slot);
			all_slots_full = this.assignSlotTopic(new_topic_slot);
			num_slots++;
		}
	}

	assignSlotTopic(slot) {
		if (slot.topic) return true; //already assigned

		let assigned = false;

		Object.values(this.widget.panel.ui.client.discovered_topics).forEach((topic) => {
			if (this.subscribed_topics[topic.id]) {
				console.log(`topic ${topic.id} already subscribed; ignoring`);
				return; // topic already used, igore
			}

			if (topic.id == slot.selected_topic) {
				this.setSubscription(slot, topic);
				assigned = true;
				return;
			}
		});

		return assigned;
	}

	setSubscription(slot, topic) {
		if (this.subscribed_topics[topic.id]) return;

		slot.topic = topic.id;
		this.subscribed_topics[topic.id] = slot;
		console.log("Topic assigned: " + topic.id);

		slot.cb_wrapper = (data) => {
			// console.log('multitopic setting slot with '+topic.id, data);
			return slot.src.cb(topic.id, data);
		};
		this.widget.panel.ui.client.onTopicData(topic.id, slot.cb_wrapper);
	}

	onTopicsDiscovered(discovered_topics) {
		// client updated topics

		let changed = false;
		let that = this;

		console.log(
			`[${this.panel.id_source}] Multisource got dicovered topics`,
			discovered_topics,
		);

		Object.values(discovered_topics).forEach((topic) => {
			if (that.subscribed_topics[topic.id]) {
				console.log(
					`[${that.panel.id_source}] Multisource already subscribed to ${topic.id}`,
				);
				return; // already subscribed
			}

			that.sources.forEach((src) => {
				src.topic_slots.forEach((slot) => {
					if (topic.id == slot.selected_topic) {
						that.setSubscription(slot, topic);
						changed = true;
						return;
					}
				});
			});
		});

		if (changed) {
			this.updateMenuContent();
			this.emit("change", this.getSources());
		}
	}

	setupMenu(menu_els, label = "Edit input") {
		let menu_line_el = $('<div class="menu_line src_ctrl"></div>');
		if (this.menu_open) menu_line_el.addClass("open");

		let label_el = $('<span class="label">' + label + "</span>");
		let that = this;
		label_el.on("click", () => {
			if (that.menu_open) {
				that.menu_open = false;
				menu_line_el.removeClass("open");
			} else {
				that.menu_open = true;
				menu_line_el.addClass("open");
			}

			if (isTouchDevice()) {
				that.panel.ui.panelMenuAutosize(that.panel);
			}
		});

		label_el.appendTo(menu_line_el);
		$('<span class="icon"></span>').appendTo(menu_line_el);
		this.src_ctrl_menu = $(
			'<div id="src_ctrl_' + this.panel.n + '" class="src_ctrl_menu"></div>',
		);
		this.src_ctrl_menu.appendTo(menu_line_el);

		if (menu_els.length > 0 && menu_els[0].hasClass("panel_msg_types_line")) {
			menu_els.splice(1, 0, menu_line_el); // add after msg type info
		} else {
			menu_els.unshift(menu_line_el); // add as first
		}

		this.panel.menu_extra_class = "wider";

		this.updateMenuContent();
	}

	updateMenuContent() {
		if (!this.src_ctrl_menu) return; //not ready yet

		this.src_ctrl_menu.empty();

		this.sources.forEach((src) => {
			src.topic_slots.forEach((slot) => {
				if (slot.topic) this.makeTopicButton(slot);
				else this.makeEmptyButton(slot);
			});
		});
	}

	clearSlot(slot) {
		if (slot.topic) {
			// console.log('Clearing topic: '+slot.topic);

			delete this.subscribed_topics[slot.topic];
			this.widget.panel.ui.client.offTopicData(slot.topic, slot.cb_wrapper);
			if (slot.clear_cb) slot.clear_cb(slot.topic);

			slot.topic = null;
		}

		slot.selected_topic = null;

		// remove slot from src if there is another empty one
		for (let i = 0; i < slot.src.topic_slots.length; i++) {
			let other_slot = slot.src.topic_slots[i];
			if (!other_slot.topic && other_slot != slot) {
				// other empty
				let p = slot.src.topic_slots.indexOf(slot);
				slot.src.topic_slots.splice(p, 1);
				break;
			}
		}

		this.updateMenuContent();
		this.emit("change", this.getSources());
	}

	//clear all subs
	close() {
		this.widget.panel.ui.client.off("topics", this.onTopicsDiscoveredWrapper);
		let topics = Object.keys(this.subscribed_topics);
		let that = this;
		topics.forEach((topic) => {
			let slot = that.subscribed_topics[topic];
			if (slot.clear_cb) slot.clear_cb(slot.topic);
			console.log(`mutitopic cleared slot for ${topic}`);
			slot.topic = null;
			that.widget.panel.ui.client.offTopicData(topic, slot.cb_wrapper);
		});
		this.subscribed_topics = {};
	}

	makeTopicButton(slot) {
		let that = this;

		let btn = $(
			'<button class="val" title="' +
				slot.label +
				" - " +
				slot.msg_type +
				'">' +
				slot.topic +
				"</button>",
		);
		let rem_btn = $(
			'<span class="remove" title="Remove"><span class="icon"></span></span>',
		);
		rem_btn.appendTo(btn);

		btn.on("click", (e) => {
			if (isTouchDevice && btn.hasClass("warn")) {
				rem_btn.trigger("click");
				return;
			}

			that.widget.panel.ui.messageTypeDialog(slot.msg_type);
		});

		btn[0].addEventListener(
			"touchstart",
			(e) => {
				if (!isTouchDevice()) return;
				console.log("touchstart " + slot.label);
				if (slot.btn_timer) window.clearTimeout(slot.btn_timer);
				slot.btn_timer = window.setTimeout(() => {
					btn.addClass("warn");
					that.panel.ui.menu_blocking_element = btn;
					that.panel.menu_content_underlay
						.addClass("open")
						.unbind()
						.on("click", () => {
							btn.trigger("cancel");
						});
				}, 2000); // hold for 2s for the delete button to appear
			},
			{ passive: true },
		);

		btn.on("touchend", (e) => {
			if (!isTouchDevice()) return;
			if (slot.btn_timer) {
				window.clearTimeout(slot.btn_timer);
				slot.btn_timer = null;
			}
		});

		btn.on("cancel", (e) => {
			if (!isTouchDevice()) return;
			if (btn.hasClass("warn")) {
				btn.removeClass("warn");
			}
			that.panel.ui.menu_blocking_element = null;
			// console.log('cancel!');
			that.panel.menu_content_underlay.removeClass("open").unbind();
		});

		rem_btn.on("mouseenter", (e) => {
			btn.addClass("warn");
		});

		rem_btn.on("mouseleave", (e) => {
			btn.removeClass("warn");
		});

		rem_btn.on("click", (ev) => {
			that.clearSlot(slot);
			that.storeAssignedTopicsPanelVars();
			if (isTouchDevice()) {
				btn.removeClass("warn");
				that.panel.ui.menu_blocking_element = null;
				that.panel.menu_content_underlay.removeClass("open").unbind();
			}
			if (ev) {
				ev.preventDefault();
				ev.stopPropagation();
			}
		});

		btn.appendTo(this.src_ctrl_menu);
	}

	makeEmptyButton(slot) {
		let that = this;

		let btn = $(
			'<button class="notset" title="' +
				slot.label +
				'">' +
				slot.msg_type +
				"</button>",
		);
		btn.on("click", (e) => {
			if (!isTouchDevice()) {
				that.panel.menu_el.addClass("hover_waiting");
			}

			that.widget.panel.ui.topicSelectorDialog(
				slot.label,
				slot.msg_type, //filter by msg type
				Object.keys(that.subscribed_topics), //exclude
				(topic) => {
					// console.log('Selected '+topic);
					slot.selected_topic = topic;
					that.assignSlotTopic(slot);
					that.updateSlots(slot.src);
					that.updateMenuContent();
					that.storeAssignedTopicsPanelVars();
					that.emit("change", that.getSources());
				},
				() => {
					//onclose
					// if (!isTouchDevice()) {
					//     // this.panel.menu_el.removeClass('hover_waiting');
					// }
				},
				btn,
			);
			e.cancelBubble = true;
			return false;
		});
		btn.appendTo(this.src_ctrl_menu);
	}
}
