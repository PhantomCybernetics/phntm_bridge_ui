export class ServiceInputDialog {

    constructor(client) {
        this.client = client;

        this.cont_el = $('#service-input-dialog');
        this.bg = $('#dialog-modal-confirm-underlay');
        
        this.editor = null;
        this.msg = null;
    }

    updateLayout() {
        let vW = window.innerWidth;
        let vH = window.innerHeight;

        if (vW < 570)
            this.cont_el.addClass('narrow');
        else
            this.cont_el.removeClass('narrow');

        if (vH < 570)
            this.cont_el.addClass('thin');
        else
            this.cont_el.removeClass('thin');
    }

    makeDefaultBtn() {
        let sort_index = Object.keys(this.btns).length;
        return {
            label: 'Call',
            color: 'blue',
            show_request: true,
            show_reply: true,
            value: {},
            sort_index: sort_index
        };
    }

    confirmBtnLabelEdit() {
        this.btns.forEach((btn)=>{
            if (btn.editing) {
                btn.label = btn.btn_inp.val();
                btn.label_el.text(btn.label);
                btn.editing = false;
                btn.tab_el.removeClass('editing');
            }
        });
    }

    setFocusedInputValue() {
        let focusedInput = this.editor.find('input:focus');
        if (focusedInput.length) {
            focusedInput.trigger('change');
        }
    }

    selectButton(btn) {
        
        this.confirmBtnLabelEdit();
        this.setFocusedInputValue();

        this.selected_btn = btn;
        this.btns.forEach((b)=>{

            if (b.editing) {
                b.label = btn_inp.val();
                b.editing = false;
            }

            if (b == btn) {
                b.tab_el.addClass('selected');
            } else {
                b.tab_el.removeClass('selected');
            }
        });

        this.editor.empty();

        let [ msg, block_before, block_el, block_after] = this.processMsgTemplate(this.service.msg_type+'_Request', btn.value, '', true); ; //$('<div class="block" style="margin-left:'+20+'px"></div>');
        this.msg = msg;
        btn.value = msg;

        this.editor.append([ block_before, block_el, block_after] );
        this.editor.scrollTop(0);
    }

    show(service, node, node_cont_el) {
        this.service = service;

        // clone edit btns, written back on save
        if (!this.client.ui.service_btns_edited[service.service]) {
            this.client.ui.service_btns_edited[service.service]= [];
            if (this.client.ui.service_btns[service.service]) {
                this.client.ui.service_btns[service.service].forEach((live_btn)=>{

                    this.client.ui.service_btns_edited[service.service].push(JSON.parse(JSON.stringify(live_btn)));
                });
            }
        }
            
        this.btns = this.client.ui.service_btns_edited[service.service];

        if (!this.btns.length) {
            this.btns.push(this.makeDefaultBtn());
        }

        let that = this;

        this.cont_el.empty().removeClass('input-manager');
        let msg_type_link = $('<span class="msg_type">'+this.service.msg_type+'</span>');
        msg_type_link.click(()=>{
            that.client.ui.messageTypeDialog(this.service.msg_type);
        });

        this.cont_el.append( [ $('<h3>'+this.service.service+'</h3>'), msg_type_link ]);
        this.msg_type = this.client.findMessageType(this.service.msg_type+'_Request');

        this.menu_underlay = $('<div id="service-input-dialog-menu-underlay"></div>');
        this.cont_el.append(this.menu_underlay);

        this.editor = $('<div class="json-editor"></div>');

        this.bottom_btns_el = $('<div class="buttons"></div>');
        
        let btn_close = $('<button class="btn-close">Close</button>');
        btn_close.click((ev)=>{
            that.hide();
        });

        let btn_json = $('<button class="btn-json">JSON</button>');
        btn_json.click(()=>{
            if (!btn_json.hasClass('open')) {
                btn_json.addClass('open');
                that.menu_underlay.unbind().show().click(()=>{
                    btn_json.removeClass('open');
                    that.menu_underlay.unbind().hide();
                });
            } else {
                btn_json.removeClass('open')
                that.menu_underlay.unbind().hide()
            }
        });
        let json_menu = $('<div class="json-menu"><span class="arrow"></span></div>');
        json_menu.click((ev)=>{
            ev.stopPropagation();
        });
        let btn_json_copy_btn = $('<button>Copy this Message</button>');
        btn_json_copy_btn.click(()=>{
            btn_json.trigger('click'); // hide

            let val = JSON.stringify(that.msg, null, 4);
            navigator.clipboard.writeText(val);
            console.log('Copied button call json:', val);
            that.client.ui.showNotification('Message JSON copied', null, '<pre>'+val+'</pre>');
        });
        let btn_json_copy_service_btns = $('<button>Copy this Service Config</button>');
        btn_json_copy_service_btns.click(()=>{
            btn_json.trigger('click'); // hide

            let val = {}

            val[service.service] = [];
            that.btns.forEach((btn)=>{
                val[service.service].push({
                    label: btn.label,
                    color: btn.color,
                    show_request: btn.show_request,
                    show_reply: btn.show_reply,
                    value: btn.value,
                    sort_index: btn.sort_index
                });
            });

            val[service.service].sort((a, b) =>{ // sort and remove sort index
                return a.sort_index - b.sort_index;
            })
            Object.values(val[service.service]).forEach((one_srv_btn)=>{
                delete one_srv_btn.sort_index;
            });

            val = JSON.stringify(val, null, 4);
            navigator.clipboard.writeText(val);
            console.log('Copied service call settings json:', val);
            that.client.ui.showNotification('Service JSON config copied', null, '<pre>'+val+'</pre>');
        });
        let btn_json_copy_all_services = $('<button>Copy all Services Config</button>');
        btn_json_copy_all_services.click(()=>{
            btn_json.trigger('click'); // hide

            let val = {}

            Object.keys(that.client.ui.service_btns).forEach((srv)=>{
                if (!that.client.ui.service_btns[srv].length)
                    return;
                val[srv] = [];
                that.client.ui.service_btns[srv].forEach((btn)=>{
                    val[srv].push({
                        label: btn.label,
                        color: btn.color,
                        show_request: btn.show_request,
                        show_reply: btn.show_reply,
                        value: btn.value,
                        sort_index: btn.sort_index
                    });
                });
            });

            val[service.service] = []; // this service from edit vals
            that.btns.forEach((btn)=>{
                val[service.service].push({
                    label: btn.label,
                    color: btn.color,
                    show_request: btn.show_request,
                    show_reply: btn.show_reply,
                    value: btn.value,
                    sort_index: btn.sort_index
                });
            });

            let val_sorted = Object.keys(val).sort().reduce((result, key) => {
                result[key] = val[key];
                result[key].sort((a, b) =>{ // sort and remove sort index
                    return a.sort_index - b.sort_index;
                })
                Object.values(result[key]).forEach((one_srv_btn)=>{
                    delete one_srv_btn.sort_index;
                });
                return result;
              }, {});

            val = JSON.stringify(val_sorted, null, 4);
            navigator.clipboard.writeText(val);
            console.log('Copied all services call settings json:', val);
            that.client.ui.showNotification('Services JSON config copied', null, '<pre>'+val+'</pre>');
        });

        json_menu.append( [ btn_json_copy_btn, btn_json_copy_service_btns, btn_json_copy_all_services ]);
        json_menu.appendTo(btn_json);

        let btn_call = $('<button class="btn-call">Test<span class="wide"> Service</span></button>');
        btn_call.click((ev) => {
            that.client.ui.serviceMenuBtnCall(service.service, that.selected_btn, btn_call);
        });

        let btn_save = $('<button class="btn-save">Save</button>');
        btn_save.click((ev) => {
        
            btn_save.addClass('working');

            that.client.ui.saveServiceButtons(service.service, this.btns);
            that.client.ui.renderNodeServicesMenu(node, node_cont_el);

            setTimeout(()=>{
                btn_save.removeClass('working');
                that.hide();
            }, 100)
        }); 

        this.btns_line_el = $('<div class="btns-line"></div>');
        
        this.renderButtonTabs();

        this.bottom_btns_el.append([ btn_save, btn_call, btn_json, btn_close ]);
        this.cont_el.append([ this.btns_line_el, $('<div class="cleaner"/>'), this.editor, this.bottom_btns_el ]);

        this.cont_el.draggable({
            handle: 'h3',
            cursor: 'move'
        });

        this.cont_el.show();
        this.selectButton(this.btns[0]);

        this.bg.unbind().show().click((ev)=>this.hide());
        $('BODY').addClass('no-scroll');
    }

    showInputManagerDialog(id_service, msg_type, initial_value, cb) {
        this.service = {
            service: id_service,
            msg_type: msg_type,
        }

        let that = this;

        this.cont_el.empty().addClass('input-manager');
        let msg_type_link = $('<span class="msg_type">'+this.service.msg_type+'</span>');
        msg_type_link.click(()=>{
            that.client.ui.messageTypeDialog(this.service.msg_type);
        });

        this.cont_el.append( [ $('<h3>'+this.service.service+'</h3>'), msg_type_link ]);
        this.msg_type = this.client.findMessageType(this.service.msg_type+'_Request');

        this.menu_underlay = $('<div id="service-input-dialog-menu-underlay"></div>');
        this.cont_el.append(this.menu_underlay);

        this.editor = $('<div class="json-editor"></div>');

        this.editor.empty();

        let [ msg_ref, block_before, block_el, block_after] = this.processMsgTemplate(this.service.msg_type+'_Request', initial_value, '', true);
        // this.msg = msg_ref;
        // btn.value = msg;

        this.editor.append([ block_before, block_el, block_after] );
        this.editor.scrollTop(0);

        this.bottom_btns_el = $('<div class="buttons"></div>');

        let btn_close = $('<button class="btn-close">Close</button>');
        btn_close.click((ev)=>{
            that.hide();
        });

        let btn_call = $('<button class="btn-call">Test<span class="wide"> Service</span></button>');
        btn_call.click((ev) => {
            that.client.serviceCall(that.service.service, msg_ref ? msg_ref : undefined, false, (test_reply) => {
                that.client.ui.serviceReplyNotification(btn_call, that.service.service, true, test_reply);
            });
        });

        let btn_set = $('<button class="btn-save">Set</button>');
        btn_set.click((ev) => {
            that.hide();
            cb(msg_ref); // TODO
        });

        this.bottom_btns_el.append([ btn_set, btn_call, btn_close ]);
        this.cont_el.append([ this.editor, this.bottom_btns_el ]);

        this.cont_el.draggable({
            handle: 'h3',
            cursor: 'move'
        });

        this.cont_el.show();
        this.bg.unbind().show().click((ev)=>this.hide());
        $('BODY').addClass('no-scroll');
    }

    renderButtonTabs() {
        let that = this;

        this.btns_line_el.empty();
        this.btns_sortable_el = $('<div class="btn-tabs-sortable"></div>');

        this.btns.sort((a, b) => {
            return a.sort_index - b.sort_index;
        });

        for (let i_btn = 0; i_btn < this.btns.length; i_btn++) {

            let btn = this.btns[i_btn];

            let btn_tab = $('<div class="btn-tab '+btn.color+'"></div>');
            let btn_label = $('<span class="label">'+btn.label+'</span>');
           
            btn_tab.append(btn_label);

            let btn_inp = $('<input type="text" class="btn-inp""></input>');
            let btn_inp_wh = $('<span class="btn-inp-wh"></span>');
            btn_inp.on('change keydown keypress keyup blur', (ev)=>{
                 let val = btn_inp.val();
                 btn_inp_wh.text(val);
                 btn_inp.width(btn_inp_wh.width() + 10);
            });
            let btn_edit_confirm = $('<span class="btn-edit-confirm"></span>');
            btn_inp.on('keydown keypress keyup', (ev)=>{
                if (ev.keyCode == 13 && btn.editing) {
                    btn_edit_confirm.trigger('click');
                }
           });
            btn_inp.val(btn.label);
            
            btn_edit_confirm.click((ev)=>{
                btn.label = btn_inp.val();
                btn_label.text(btn.label);
                btn_tab.removeClass('editing');
                btn.editing = true;
            });
            btn_tab.append( [ btn_inp, btn_inp_wh, btn_edit_confirm ]);

            let btn_menu_btn = $('<span class="btn-menu-btn"></span>');

            let btn_menu = $('<div class="btn-menu"><span class="arrow"></span></div>');
            btn_menu.click((ev)=>{
                ev.stopPropagation();
            });
            let rename_btn = $('<button>Edit label</button>');
            rename_btn.click(()=>{
                that.menu_underlay.unbind().hide()
                btn_menu.removeClass('open');
                btn_tab.addClass('editing');
                btn_inp.trigger('change');
                btn_inp.focus();
                btn.editing = true;
            });

            let show_request_cb = $('<input type="checkbox"/>');
            show_request_cb.prop('checked', btn.show_request);
            let show_request_label = $('<label title="Service request will be shown as notification">Show request</label>');
            show_request_label.prepend(show_request_cb);
            show_request_cb.change((ev)=>{
               btn.show_request = $(ev.target).prop('checked');
            });

            let show_reply_cb = $('<input type="checkbox"/>');
            show_reply_cb.prop('checked', btn.show_reply);
            let show_reply_label = $('<label title="Service reply will be shown as notification">Show reply</label>');
            show_reply_label.prepend(show_reply_cb);
            show_reply_cb.change((ev)=>{
                btn.show_reply = $(ev.target).prop('checked');
            });

            let color_line = $('<div class="colors"></div>');
            [ 'blue', 'green', 'red', 'orange', 'magenta', 'black' ].forEach((clr)=>{
                let btn_clr = $('<button title="'+clr+'" class="color-btn '+clr+'"></button>');
                if (clr == btn.color)
                    btn_clr.addClass('selected');
                color_line.append(btn_clr);
                btn_clr.click((ev)=>{
                    color_line.children().removeClass('selected');
                    btn_clr.addClass('selected');
                    btn_tab.removeClass(btn.color);
                    btn.color = clr;
                    btn_tab.addClass(btn.color);
                });
            });
            color_line.append($('<div class="cleaner"></div>'));
            let rem_btn = $('<button class="rem">Remove button<span class="icon"></span></button>');
            rem_btn.click((ev)=>{
                if (!rem_btn.hasClass('warn')) {
                    rem_btn.addClass('warn');    
                    return;
                }
                that.btns.splice(i_btn, 1);
                if (!that.btns.length) {
                    that.btns.push(that.makeDefaultBtn()); // replace with default
                }
                that.renderButtonTabs();
                let btn_to_sel = i_btn;
                if (that.btns.length-1 < i_btn)
                    btn_to_sel = that.btns.length-1;

                that.menu_underlay.unbind().hide()
                that.selectButton(that.btns[btn_to_sel]);

            }).blur((ev)=>{
                rem_btn.removeClass('warn');
            });
            let cl = $('<div class="cleaner"></div>');
            btn_menu.append( [ rename_btn, cl, show_request_label, show_reply_label, cl, color_line, cl, rem_btn, cl ]);

            btn_menu_btn.click(()=>{
                if (!btn_menu.hasClass('open')) {
                    btn_menu.addClass('open');
                    btn_tab.addClass('menu-open');
                    that.menu_underlay.unbind().show().click(()=>{
                        btn_menu.removeClass('open');
                        btn_tab.removeClass('menu-open');
                        that.menu_underlay.unbind().hide();
                    });
                } else {
                    btn_menu.removeClass('open');
                    btn_tab.removeClass('menu-open');
                    that.menu_underlay.unbind().hide()
                }
            });

            btn_label.on('mousedown touchstart', (ev)=>{
                if (btn_menu.hasClass('open')) {
                    btn_menu_btn.trigger('click');
                    return;
                }
                that.selectButton(btn); //init editor
            });

            btn_menu.appendTo(btn_menu_btn);

            btn_tab.append(btn_menu_btn);

            // save refs
            btn.btn_inp = btn_inp;
            btn.tab_el = btn_tab; 
            btn.label_el = btn_label;

            this.btns_sortable_el.append(btn_tab);
        };

        this.btns_line_el.append(this.btns_sortable_el);

        let btn_add = $('<span class="add-btn">Add<span class="wide"> button</span></span>');
        btn_add.click((ev)=>{
            that.btns.push(that.makeDefaultBtn());
            that.confirmBtnLabelEdit();
            that.renderButtonTabs();
            that.selectButton(that.btns[that.btns.length-1]);
        });
        this.btns_line_el.append(btn_add);

        this.makeTabsSortable();
    }

    makeTabsSortable(c) {
        let that = this;
        this.btns_sortable_el.sortable({
            axis: "x",
            handle: '.label',
            cursor: "move",
            stop: () => {
                for (let i = 0; i < that.btns.length; i++) {
                    let btn = that.btns[i];
                    let index = btn.tab_el.index();
                    btn.sort_index = index;
                }
            }
        });
    }

    static Validate(val, type, val_inp, type_hint) {
        let err = false;
        let res = null;
        switch (type) {
            case "bool":
                res = (val == 'true');
                break
            case "int8": 
            case "uint8": 
            case "int16": 
            case "uint16": 
            case "int32":
            case "uint32": 
            case "int64":
            case "uint64": {
                res = parseInt(val);
                err = res != val;
                if (!err) {
                    switch (type) {
                        case "int8": if (res < -128 || res > 127) err = true; break;
                        case "uint8": if (res < 0 || res > 255) err = true; break;
                        case "int16": if (res < -32768 || res > 32767) err = true; break;
                        case "uint16": if (res < 0 || res > 65535) err = true; break;
                        case "int32": if (res < -2147483648 || res > 2147483647) err = true; break;
                        case "uint32": if (res < 0 || res > 4294967295) err = true; break;
                        case "int64": if (res < Number.MIN_SAFE_INTEGER || res > Number.MAX_SAFE_INTEGER) err = true; break;
                        case "uint64": if (res < 0 || res > Number.MAX_SAFE_INTEGER) err = true; break;
                    }
                }
                break;
            }
            case "float32":
            case "float64":  {
                res = parseFloat(val);
                err = res != val;
                if (!err) {
                    switch (type) {
                        case "float32": if (res < -3.4028235e38 || res > 3.4028235e38 || !Number.isFinite(res)) err = true; break;
                        case "float64": if (!Number.isFinite(res)) err = true; break;
                    }
                }
                break;
            }
            case "string": {
                res = val;
                break;
            }
        }

        if (err && val_inp)
            val_inp.addClass('err');
        else if (val_inp)
            val_inp.removeClass('err');
        if (err && type_hint)
            type_hint.addClass('err');
        else if (type_hint)
            type_hint.removeClass('err');
        
        return res;
    }

    static MakePrimitiveType(field, default_value, make_label, last_in_block, onVal) {
        let line = $('<div class="line"></div>')
        if (make_label)
            line.append($('<div class="label" title="'+field.name+'">'+field.name+':</div>'));
       
        let that = this;

        let inp_type_grp = field.type;
        let def_val = null;
        switch (field.type) {
            case "bool": def_val = false; break;
            case "int8": 
            case "uint8": 
            case "int16": 
            case "uint16": 
            case "int32":
            case "uint32": 
            case "int64":
            case "uint64": def_val = 0; inp_type_grp = 'int'; break;
            case "float32":
            case "float64": def_val = 0.0; inp_type_grp = 'float'; break;
            case "string": def_val = ''; break;
            case "time": def_val = { sec: 0, nsec: 0 }; break;
            case "duration": def_val = { sec: 0, nsec: 0 }; break;
        }

        let val = def_val;
        if (default_value)
            val = default_value;

        let val_inp = null;
        let type_hint = $('<span class="hint">'+field.type+'</span>');
        if (inp_type_grp == 'string') {
            if (!field.is_long_text) {
                val_inp = $('<input type="text"/>');
            }
            else {
                val_inp = $('<textarea/>');
                type_hint = null;
            }
            val_inp.val(val);
            val_inp.change((ev)=>{
                val = ServiceInputDialog.Validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'int') {
            val_inp = $('<input type="text"/>');
            val_inp.val(val);
            val_inp.change((ev)=>{
                val = ServiceInputDialog.Validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'float') {
            val_inp = $('<input type="text"/>');
            val_inp.val(val.toFixed(1));
            val_inp.change((ev)=>{
                val = ServiceInputDialog.Validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'bool') {
            val_inp = $('<select><option value="true">True</option><option value="false">False</option></select>');
            val_inp.val(val ? 'true' : 'false');
            type_hint = null;
            val_inp.change((ev)=>{
                val = ServiceInputDialog.Validate($(ev.target).val(), field.type);
                onVal(val);
            });
        } else if (inp_type_grp == 'time' || inp_type_grp == 'duration') { // UNTESTED
            val_inp = $('<div></div>');
            let val_inp_sec = $('<input type="text"/>');
            val_inp_sec.val(val[field.name].sec);
            let val_inp_nsec = $('<input type="text"/>');
            val_inp_sec.val(val.val[field.name].nsec);
            val_inp.append( [ val_inp_sec, val_inp_nsec ] );
            type_hint = $('<span class="hint">int32 / int32</span>');
            val_inp_sec.change((ev)=>{
                let sec_val = ServiceInputDialog.Validate($(ev.target).val(), 'int32', val_inp_sec, type_hint);
                val.sec = sec_val;
                onVal(val);
            });
            val_inp_nsec.change((ev)=>{
                let nsec_val = ServiceInputDialog.Validate($(ev.target).val(), 'int32', val_inp_nsec, type_hint);;
                val.nsec = nsec_val;
                onVal(val);
            });
        } 
        
        let val_wrap = $('<div class="val_wrap">');
        if (field.is_long_text) {
            val_wrap.addClass('long_text');
        }
        line.append(val_wrap.append(type_hint ? [ val_inp, type_hint ] : val_inp ));

        line.append('<i class="end-line"><b>,</b></i>');
        if (last_in_block)
            line.addClass('last-in-block');

        line.append($('<div class="cleaner"/>'));

        return { 'val': val, 'line':line };
    }

    static MakePrimitiveArray(field, default_value, block, is_last_in_block, onVal) {
        let arr_label = $('<div class="label">'+field.name+':</div><i class="array-open inline">[</i><div class="cleaner"/>');
        let arr_block = $('<div class="block"></div>');
        
        let vals_block = $('<div></div>');
    
        if (field.name == 'byte_array_value' && field.type == 'int8')  {
            field.type = 'uint8'; // fix type for byte arrays
        }

        let arrayLength = field.arrayLength ?? (default_value ? default_value.length : 0);
        // console.log('init; arrayLength: '+arrayLength, default_value);
        for (let j = 0; j < arrayLength; j++) {
            // let i = msg[field.name].length;
            let one_default_value = default_value && default_value[j] ? default_value[j] : null;
            const r = ServiceInputDialog.MakePrimitiveType(field, one_default_value, false, j == arrayLength-1, (val) => {
                onVal(j, val);
            });
            onVal(j, one_default_value);
            vals_block.append(r.line);
            // console.log('j: '+j+'; arrayLength: '+arrayLength);
        }

        arr_block.append(vals_block);

        arr_block.append($('<div class="cleaner"/>'));
        let add_btn = ($('<a href="#" class="add"/><span></span>Add</a>'));
        arr_block.append(add_btn);
        let rem_btn = ($('<a href="#" class="remove"/><span></span>Trim</a>'));
        if (!arrayLength)
            rem_btn.addClass('hidden');
        arr_block.append([add_btn, rem_btn]);
        arr_block.append($('<div class="cleaner"/>'));

        add_btn.click((ev)=>{
            arrayLength++;
            let j = arrayLength-1;
            let one_default_value = null;
            const r = ServiceInputDialog.MakePrimitiveType(field, one_default_value, false, true, (val) => {
                onVal(j, val);
            });
            onVal(j, one_default_value);
            // msg[field.name].push(r.val);
            vals_block.append(r.line);
            vals_block.children('.last-in-block').removeClass('last-in-block');
            r.line.addClass('last-in-block');

            rem_btn.removeClass('hidden');

            return false
        });

        rem_btn.click((ev)=>{
            if (arrayLength) {
                // msg[field.name].pop();
                arrayLength--;

                console.log('arrayLength: ', arrayLength);

                vals_block.children().last().remove();
                onVal(); //pop last

                if (arrayLength) {
                    vals_block.children().last().addClass('last-in-block');
                } else {
                    rem_btn.addClass('hidden');
                }
            }
            
            return false;
        });
        
        block.append( [arr_label, arr_block, $('<i class="array-close">]'+(!is_last_in_block ? '<b>,</b>' : '')+'</i>')] );
    }

    processMsgTemplate(msg_type, value, label, last_in_block = true) {
        
        // let def_els = [];
        // let indent = l*30;
        let that = this;

        const msg = {};
        
        let label_el = $((label ? '<div class="label">'+label+':</div>' : '') + '<i class="obj-open">{</i>');
        let block = $('<div class="block"></div>')

        let msg_class = this.client.findMessageType(msg_type);
        if (!msg_class)
            block.append($('<div class="err">Unrecognized complex type '+msg_type+'</div>'));

        if (msg_class) {
            for (let i = 0; i < msg_class.definitions.length; i++) { // individual fields

                const field = msg_class.definitions[i];
                
                if (field.isConstant === true) {
                    // msg[field.name] = field;
                    continue;
                }
                if (field.name === 'structure_needs_at_least_one_member') {
                    // ignore 
                    continue;
                }
                if (field.isComplex === true) { // Complex type -> new block in recursion
                   
                    
                    // if (nestedMsg == undefined) { // not found
                    //     continue;
                    // }
                    if (field.isArray === true) { // array of complex types

                        let arr_label = $('<div class="label">'+field.name+':</div><i class="array-open inline">[</i><div class="cleaner"/>');
                        let arr_block = $('<div class="block"></div>');

                        let vals_block = $('<div></div>');

                        if (!msg[field.name])
                            msg[field.name] = [];
                        else
                            msg[field.name].length = 0;

                        const arrayLength = field.arrayLength ?? (value && value[field.name] ? value[field.name].length : 0);
                        
                        for (let j = 0; j < arrayLength; j++) {                            
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.processMsgTemplate(field.type, value && value[field.name] && value[field.name][j] !== undefined ? value[field.name][j] : null, null, j == arrayLength-1);
                            let nested_block = $('<div></div>').append([ nestedBefore, nestedBlock, nestedAfter ]);
                            msg[field.name][j] = (nestedMsg);
                            vals_block.append(nested_block);
                        }

                        arr_block.append(vals_block);

                        arr_block.append($('<div class="cleaner"/>'));
                        let add_btn = ($('<a href="#" class="add"/><span></span>Add</a>'));
                        let rem_btn = ($('<a href="#" class="remove"/><span></span>Trim</a>'));
                        if (!arrayLength)
                            rem_btn.addClass('hidden');
                        arr_block.append([add_btn, rem_btn]);
                        arr_block.append($('<div class="cleaner"/>'));

                        add_btn.click((ev)=>{
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.processMsgTemplate(field.type, value ? value[field.name] : null, null, true);
                            let nested_block = $('<div></div>').append([ nestedBefore, nestedBlock, nestedAfter ]);
                            msg[field.name].push(nestedMsg);
                            vals_block.append(nested_block);

                            vals_block.children('.last-in-block').removeClass('last-in-block');
                            nested_block.addClass('last-in-block');
                            
                            rem_btn.removeClass('hidden');

                            return false;
                        });

                        rem_btn.click((ev)=>{
                            if (msg[field.name].length) {
                                msg[field.name].pop();
                                vals_block.children().last().remove();

                                if (msg[field.name].length) {
                                    vals_block.children().last().addClass('last-in-block');
                                } else {
                                    rem_btn.addClass('hidden');
                                }
                            }
                            
                            return false;
                        });

                        block.append( [arr_label, arr_block, $('<i class="array-close">]'+(i < msg_class.definitions.length-1 ? '<b>,</b>' : '')+'</i>')] );

                    }
                    else { // only one of complex types

                        const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.processMsgTemplate(field.type, value ? value[field.name] : null, field.name, i == msg_class.definitions.length-1);
                        msg[field.name] = nestedMsg;
                        block.append([ nestedBefore, nestedBlock, nestedAfter]);
                    }
                } 
                else { // Primitive types
                    
                    if (field.isArray === true) { // array of primitives
                        
                        if (!msg[field.name])
                            msg[field.name] = []; //make ref here
                        else
                            msg[field.name].length = 0; //reset

                        ServiceInputDialog.MakePrimitiveArray(field, value ? value[field.name] : null, block, i == msg_class.definitions.length-1, (index, val) => {
                            if (index === undefined && val === undefined)
                                msg[field.name].pop(); // trimmed
                            else
                                msg[field.name][index] = val; 
                        });
                    }
                    else { // single primitive type
                        
                        const r = ServiceInputDialog.MakePrimitiveType(field, value ? value[field.name] : null, true, i == msg_class.definitions.length-1, (val) => {
                            msg[field.name] = val;
                        });
                        msg[field.name] = r.val;
                        block.append(r.line);
                    
                    }
                    
                }
            }
        }

        block.append($('<div class="cleaner"/>'));

        let after = ($('<i class="obj-close">}<b>,</b></i><div class="cleaner"/>'));
        if (last_in_block)
            after.addClass('last-in-block')

        return [ msg, label_el, block, after ];
    }

    hide() {
        this.cont_el.hide();
        this.bg.unbind().hide();
        $('BODY').removeClass('no-scroll');
    }

}