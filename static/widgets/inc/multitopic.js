export class MultiTopicSource {

    constructor(widget) {
        this.widget = widget;
        this.panel = widget.panel;
        this.sources = [];
        this.subscribed_topics = {};

        this.widget.panel.ui.client.on('topics', (discovered_topics) => this.onTopics(discovered_topics));
    }

    add(msg_type, label, selected_topic, num, cb) {
        let new_src = {
            msg_type: msg_type,
            label: label,
            selected_topic: selected_topic,
            num: num,
            cb: cb,
            topic_slots: []
        }
        this.sources.push(new_src);
        this.updateSlots(new_src);    
    }

    updateSlots(src) {

        let num_slots = src.topic_slots.length;
        let all_slots_full = true;
        src.topic_slots.forEach((slot) => {
            if (!slot.topic)
                all_slots_full = false;
        });

        while ((all_slots_full && src.num == -1) || (num_slots < src.num)) {
            let new_topic_slot = {
                src: src,
                topic: null,
                msg_type: src.msg_type,
                label: src.label,
                selected_topic: src.selected_topic,
                cb: src.cb
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
            if (this.subscribed_topics[topic.id])
                return; // topic already used, igore

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
        console.warn('Topic assigned: '+topic.id);

        this.widget.panel.ui.client.on(topic.id, slot.cb);
    }

    onTopics(discovered_topics) { // client updated topics

        let changed = false;
        let that = this;

        console.warn('Multisource got topics', discovered_topics)

        Object.values(discovered_topics).forEach((topic)=>{

            if (that.subscribed_topics[topic.id])
                return; // already subscribed

            that.sources.forEach((src)=>{
                src.topic_slots.forEach((slot)=>{
                    if (topic.id == slot.selected_topic) {
                        this.setSubscription(slot, topic);
                        changed = true;
                        return;
                    }
                });
            })

        });

        if (changed) {
            this.updateMenuContent();
        }
        
    }


    setupMenu () {

        $('<div class="menu_line src_ctrl">' +
            '<span class="label">Edit input</span>' +
            '<div id="src_ctrl_'+this.panel.n+'" class="src_ctrl_menu"></div>' +
            '</div>')
            .insertBefore($('#pause_panel_menu_'+this.panel.n));

        this.src_ctrl_menu = $('#src_ctrl_'+this.panel.n);

        this.updateMenuContent();
    }

    updateMenuContent() {

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

            console.warn('Clearing topic: '+slot.topic);

            delete this.subscribed_topics[slot.topic];
            this.widget.panel.ui.client.off(slot.topic, slot.cb);

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
    }

    makeTopicButton(slot) {
        let that = this;

        let btn = $('<button class="val" title="'+slot.label+' - '+slot.msg_type+'">'+slot.topic+'</button>');
        btn.on('click', (e) => {
            that.widget.panel.ui.message_type_dialog(slot.msg_type);
            e.cancelBubble = true;
            return false;
        });

        let rem_btn = $('<span class="remove" title="Remove"><span class="icon"></span></span>');
        rem_btn.on('mouseenter', (e) => {
            btn.addClass('warn');
        });
        rem_btn.on('mouseleave', (e) => {
            btn.removeClass('warn');
        });
        rem_btn.on('click', (e) => {
            that.clearSlot(slot);
            e.cancelBubble = true;
            return false;
        });
        rem_btn.appendTo(btn);

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
                    console.log('Selected '+topic);
                    slot.selected_topic = topic;
                    that.assignSlotTopic(slot);
                    that.updateSlots(slot.src);
                    that.updateMenuContent();
                }
            );
            e.cancelBubble = true;
            return false;
        });
        btn.appendTo(this.src_ctrl_menu);
    }

    

}