import { isTouchDevice } from "./../../lib.js";

export class MultiTopicSource {

    constructor(widget) {
        this.widget = widget;
        this.panel = widget.panel;
        this.sources = [];
        this.subscribed_topics = {};

        let that = this;
        this.widget.panel.ui.client.on('topics', (discovered_topics) => { this.onTopics(discovered_topics); });

        this.onChange = null;
    }

    hasSources() {
        for (let i = 0; i < this.sources.length; i++) {
            if (!this.sources[i].topic_slots)
                continue;
            for (let j = 0; j < this.sources[i].topic_slots.length; j++) {    
                if (this.sources[i].topic_slots[j].selected_topic) {
                    return true;
                }
            }
        }
        return false;
    }

    getUrlHashParts (out_parts) {
        for (let i = 0; i < this.sources.length; i++) {
            let src = this.sources[i];
            let topics = [];
            src.topic_slots.forEach((slot) => {
                if (slot.selected_topic)
                    topics.push(slot.selected_topic);
            });
            if (topics.length)
                out_parts.push('in'+i+'='+topics.join(','));
        }
    }

    parseUrlParts (custom_url_vars) {
        if (this.widget.log_dirty_stack) {
            console.error('Dead multitopic got parseUrlParts');
            return;
        }
        console.warn('multitopic got parseUrlParts');
        if (!custom_url_vars)
            return;
        custom_url_vars.forEach((kvp)=>{
            let arg = kvp[0];
            if (arg.indexOf('in') !== 0)
                return;
            let i = parseInt(arg.substring(2));
            let src = this.sources[i];
            if (!src)
                return;
            let vals = kvp[1].split(',');
            // console.warn('Multitopic got in_'+i+" > "+vals.join(', '));
            for (let j = 0; j < vals.length; j++) {
                let slot = src.topic_slots[j];
                if (!slot) {
                    slot = {
                            src: src,
                            topic: null,
                            msg_type: src.msg_type,
                            label: src.label,
                            selected_topic: null,
                            clear_cb: src.clear_cb
                        };
                    src.topic_slots.push(slot);
                }
                if (slot.selected_topic != vals[j]) {
                    slot.selected_topic = vals[j];
                    this.assignSlotTopic(slot); //try assign
                }
            }
            this.updateSlots(src);
        });
        this.updateMenuContent();
    }

    add(msg_type, label, selected_topic, num, cb, clear_cb) {
        let new_src = {
            msg_type: msg_type,
            label: label,
            selected_topic: selected_topic,
            num: num,
            cb: cb,
            clear_cb: clear_cb,
            topic_slots: []
        }
        this.sources.push(new_src);
        this.updateSlots(new_src);    
    }

    updateSlots(src) {

        let num_slots = src.topic_slots.length;
        let all_slots_full = true;
        src.topic_slots.forEach((slot) => {
            if (!slot.selected_topic)
                all_slots_full = false;
        });

        while ((all_slots_full && src.num == -1) || (num_slots < src.num)) {
            let new_topic_slot = {
                src: src,
                topic: null,
                msg_type: src.msg_type,
                label: src.label,
                selected_topic: src.selected_topic,
                // cb: src.cb,
                clear_cb: src.clear_cb
            }
            src.topic_slots.push(new_topic_slot);
            all_slots_full = this.assignSlotTopic(new_topic_slot);
            num_slots++;
        }

    }

    assignSlotTopic(slot) {

        if (slot.topic)
            return true; //already assigned

        let assigned = false;

        Object.values(this.widget.panel.ui.client.discovered_topics).forEach((topic)=>{
            if (this.subscribed_topics[topic.id]) {
                console.log(`topic ${topic.id} already subscriber; ignoring`);
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

        if (this.subscribed_topics[topic.id])
            return;

        slot.topic = topic.id;
        this.subscribed_topics[topic.id] = slot;
        console.log('Topic assigned: '+topic.id);

        slot.cb_wrapper = (data) => {
            // console.log('multitopic setting slot with '+topic.id, data);
            return slot.src.cb(topic.id, data);
        }
        this.widget.panel.ui.client.on(topic.id, slot.cb_wrapper);
    }

    onTopics (discovered_topics) { // client updated topics

        let changed = false;
        let that = this;

        console.log('Multisource got topics', discovered_topics)

        Object.values(discovered_topics).forEach((topic)=>{

            if (that.subscribed_topics[topic.id]) {
                console.log(`multitopic already subscribed to ${topic.id}`)
                return; // already subscribed
            }

            that.sources.forEach((src)=>{
                src.topic_slots.forEach((slot)=>{
                    if (topic.id == slot.selected_topic) {
                        that.setSubscription(slot, topic);
                        changed = true;
                        return;
                    }
                });
            })

        });

        if (changed) {
            this.updateMenuContent();
            if (this.onChange)
                this.onChange();
        }
        
    }


    setupMenu (label="Edit input") {

        let menu_line_el = $('<div class="menu_line src_ctrl"></div>');

        let label_el = $('<span class="label">'+label+'</span>');
        let that = this;
        label_el.on('click', () => { 
            if (menu_line_el.hasClass('open'))
                menu_line_el.removeClass('open');
            else
                menu_line_el.addClass('open');

            console.log('Multitopic clicked, open='+menu_line_el.hasClass('open'))

            if (isTouchDevice()) {
                that.panel.ui.panel_menu_autosize(that.panel);
            }
        });

        label_el.appendTo(menu_line_el);
        $('<span class="icon"></span>').appendTo(menu_line_el);
        $('<div id="src_ctrl_'+this.panel.n+'" class="src_ctrl_menu"></div>').appendTo(menu_line_el);

        menu_line_el.insertBefore($('#close_panel_menu_'+this.panel.n));

        menu_line_el.parent().parent().addClass('wider');

        this.src_ctrl_menu = $('#src_ctrl_'+this.panel.n);

        this.updateMenuContent();
    }

    updateMenuContent() {

        if (!this.src_ctrl_menu)
            return; //not ready yet

        this.src_ctrl_menu.empty();

        this.sources.forEach((src) => {
            src.topic_slots.forEach((slot)=>{
                if (slot.topic)
                    this.makeTopicButton(slot);
                else
                    this.makeEmptyButton(slot);
            });
        });
    }

    clearSlot(slot) {
        if (slot.topic) {

            console.log('Clearing topic: '+slot.topic);

            delete this.subscribed_topics[slot.topic];
            this.widget.panel.ui.client.off(slot.topic, slot.cb_wrapper);
            if (slot.clear_cb) 
                slot.clear_cb(slot.topic);

            slot.topic = null;
        }
        
        slot.selected_topic = null;

        // remove slot from src if there is another empty one
        for (let i = 0; i < slot.src.topic_slots.length; i++) {
            let other_slot = slot.src.topic_slots[i];
            if (!other_slot.topic && other_slot != slot) { // other empty
                let p = slot.src.topic_slots.indexOf(slot);
                slot.src.topic_slots.splice(p, 1);
                break;
            }
        }

        this.updateMenuContent();
        if (this.onChange)
            this.onChange();
    }

    //clear all subs
    close() {
        // this.widget.panel.ui.client.off('topics', this.onTopics);
        let topics = Object.keys(this.subscribed_topics);
        let that = this;
        topics.forEach((topic)=>{
            let slot = that.subscribed_topics[topic];
            if (slot.clear_cb)
                slot.clear_cb(slot.topic);
            console.log(`mutitopic cleared slot for ${topic}`)
            slot.topic = null;
            that.widget.panel.ui.client.off(topic, slot.cb_wrapper);
        });
        this.subscribed_topics = {};

    }

    makeTopicButton(slot) {
        let that = this;

        let btn = $('<button class="val" title="'+slot.label+' - '+slot.msg_type+'">'+slot.topic+'</button>');
        let rem_btn = $('<span class="remove" title="Remove"><span class="icon"></span></span>');
        rem_btn.appendTo(btn);

        btn.on('click', (e) => {
            if (isTouchDevice && btn.hasClass('warn')) {
                rem_btn.trigger('click');
                return;
            }
            
            that.widget.panel.ui.message_type_dialog(slot.msg_type);
        });

        btn.on('touchstart', (e) => {
            if (!isTouchDevice()) return;
            console.log('touchstart '+slot.label);
            if (slot.btn_timer)
                window.clearTimeout(slot.btn_timer);
            slot.btn_timer = window.setTimeout(()=>{
                btn.addClass('warn');
                that.panel.ui.menu_blocking_element = btn;
                that.panel.menu_content_underlay
                    .addClass('open')
                    .unbind()
                    .on('click', () => {
                        btn.trigger('cancel');
                    });

            }, 2000) // hold for 2s for the delete button to appear
        });

        btn.on('touchend', (e) => {
            if (!isTouchDevice()) return;
            if (slot.btn_timer) {
                window.clearTimeout(slot.btn_timer);
                slot.btn_timer = null;
            }
        });

        btn.on('cancel', (e) => {
            if (!isTouchDevice()) return;
            if (btn.hasClass('warn')) {
                btn.removeClass('warn');
            }
            that.panel.ui.menu_blocking_element = null;
            // console.log('cancel!');
            that.panel.menu_content_underlay
                    .removeClass('open')
                    .unbind();
        });

        rem_btn.on('mouseenter', (e) => {
            btn.addClass('warn');
        });

        rem_btn.on('mouseleave', (e) => {
            btn.removeClass('warn');
        });
        
        rem_btn.on('click', (ev) => {
            that.clearSlot(slot);
            if (isTouchDevice()) {
                btn.removeClass('warn');
                that.panel.ui.menu_blocking_element = null;
                that.panel.menu_content_underlay
                        .removeClass('open')
                        .unbind();
            }
            that.panel.ui.update_url_hash();
            if (ev) {
                ev.preventDefault();
                ev.stopPropagation();
            }
        });
        

        btn.appendTo(this.src_ctrl_menu);
    }

    makeEmptyButton(slot) {
        let that = this;

        let btn = $('<button class="notset" title="'+slot.label+'">'+slot.msg_type+'</button>');
        btn.on('click', (e) => {
            that.widget.panel.ui.topic_selector_dialog(slot.label,
                slot.msg_type, //filter by msg type
                Object.keys(that.subscribed_topics), //exclude
                (topic) => {
                    // console.log('Selected '+topic);
                    slot.selected_topic = topic;
                    that.assignSlotTopic(slot);
                    that.updateSlots(slot.src);
                    that.updateMenuContent();
                    that.panel.ui.update_url_hash();
                    if (that.onChange)
                        that.onChange();
                }, 
                btn
            );
            e.cancelBubble = true;
            return false;
        });
        btn.appendTo(this.src_ctrl_menu);
    }

    

}