export class ServiceInputDialog {

    constructor(client) {
        this.client = client;

        this.cont_el = $('#service-input-dialog');
        this.bg = $('#dialog-modal-confirm-underlay');
        
        this.editor = null;
        this.msg = null;
    }

    update_layout() {
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

    confirm_edits() {
        this.btns.forEach((btn)=>{
            if (btn.editing) {
                btn.label = btn.btn_inp.val();
                btn.label_el.text(btn.label);
                btn.editing = false;
                btn.tab_el.removeClass('editing');
            }
        });
    }

    select_button(btn) {
        this.confirm_edits();
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

        let [ msg, block_before, block_el, block_after] = this.process_msg_template(this.service.msg_type+'_Request', btn.value, '', true); ; //$('<div class="block" style="margin-left:'+20+'px"></div>');
        this.msg = msg;

        this.editor.append([ block_before, block_el, block_after] );
        this.editor.scrollTop(0);
    }

    show(service, btns) {
        this.service = service;
        this.btns = btns;

        let that = this;

        this.cont_el.empty();
        this.cont_el.append($('<h3>'+this.service.service+'</h3><span class="msg_type">'+this.service.msg_type+'</span>'))

        this.msg_type = this.client.find_message_type(this.service.msg_type+'_Request');
        // let writer = this.client.get_msg_writer(service.msg_type+'_Request');

        this.menu_underlay = $('<div id="service-input-dialog-menu-underlay"></div>');
        this.cont_el.append(this.menu_underlay);

        this.editor = $('<div id="json-editor"></div>');
        // editor.append('<i class="obj-open">{</i>');
        // const [def, def_els ] = this.make_msg_template(service.msg_type+'_Request', 0);
        
    
        // block.append(def_els);
        
        // editor.append('<i class="obj-close">}</i>');        

        this.bottom_btns_el = $('<div class="buttons"></div>');
        // let btn_cancel = $('<button class="close-dialog"></button>');
        let btn_cancel = $('<button class="btn-close">Close</button>');
        btn_cancel.click((ev)=>{
            that.hide();
        });
        // let btn_rem = $('<button class="btn-rem">Del</button>');

        let btn_copy_json = $('<button><span class="wide">Copy </span>JSON</button>');
        btn_copy_json.click((ev) => {
            let val = JSON.stringify(this.msg, null, 4);
            navigator.clipboard.writeText(val);
            console.log('Copied service call json:', val);
            that.client.ui.show_notification('Message JSON copied', null, '<pre>'+val+'</pre>');
        }); 

        let btn_call = $('<button>Call<span class="wide"> Service</span></button>');
        btn_call.click((ev) => {
            that.client.service_call(this.service.service, this.msg, false, (service_reply) => {
                if (service_reply.err) {
                    that.client.ui.show_notification('Service returned error', 'error', this.service.service+'<br><pre>'+service_reply.msg+'</pre>');
                } else {
                    that.client.ui.show_notification('Service replied', null, 'Reply data:<br><pre>'+JSON.stringify(service_reply, null, 2)+'</pre>');
                }
                
            });
        }); 

        let btn_save = $('<button class="btn-save">Save</button>');
        btn_save.click((ev) => {
            // that.client.service_call(service.service, msg, false, (service_reply) => {
            //     if (service_reply.err) {
            //         that.client.ui.show_notification('Service returned error', 'error', service.service+'<br><pre>'+service_reply.msg+'</pre>');
            //     } else {
            //         that.client.ui.show_notification('Service replied', null, 'Reply data:<br><pre>'+JSON.stringify(service_reply, null, 2)+'</pre>');
            //     }
                
            // });
        }); 

        this.btns_line_el = $('<div class="btns-line"></div>');
        
        this.render_button_tabs();

        this.bottom_btns_el.append([ btn_save, btn_call, btn_copy_json, btn_cancel ]);
        this.cont_el.append([ this.btns_line_el, $('<div class="cleaner"/>'), this.editor, this.bottom_btns_el ]);

        this.cont_el.show();
        this.select_button(this.btns[0]);

        this.bg.unbind().show().click((ev)=>this.hide());
        $('BODY').addClass('no-scroll');
    }


    // make_array(field) {
    //     let indent = l*30;
    //     const arrayLength = field.arrayLength ?? 0;
        
    //     let label = $('<div class="label">'+field.name+':</div><i class="array-open inline">[</i>');
    //     let block = $('<div class="block"></div>');
        
    //     const array = [];

    //     for (let i = 0; i < arrayLength; i++) {
    //         if (field.isComplex) 

    //             array.push(nestedDefinition);
    //         else
    //             array.push(null); // def per 

            
    //     }
        
        
    //     // if (arrayLength) {
            
    //     //     // for (let i = 0; i < arrayLength; i++) {
                
    //     //     //     block.append($('<i class="obj-open">{</i>'));
    //     //     //     block.append(nestedEls);
    //     //     //     block.append($('<i class="obj-close">}</i>'));
    //     //     // }
    //     //     // def_els.push($('<div class="cleaner"/>'), block, $('<div class="cleaner"/>'));
    //     // }
    
    //     block.append($('<i class="array-close">]</i>'));
    //     block.append($('<div class="cleaner"/>'));

    //     return [ array, block ];
    // }

    // make_complex_type(field, set_default, make_label) {
    //     let line = $('<div class="line"></div>')
    //     if (make_label)
    //         line.append($('<div class="label">'+field.name+':</div>'));


    //     line.append(val_inp);

    //     line.append(val_inp);
    //     line.append($('<div class="cleaner"/>'));

    //     return [ val,  line ];

    // }

    render_button_tabs() {
        // this.btn_els = [];
        let that = this;

        this.btns_line_el.empty();

        for (let i_btn = 0; i_btn < this.btns.length; i_btn++) {

            let btn = this.btns[i_btn];

            let btn_tab = $('<div class="btn-tab '+btn.color+'"></div>');
            let btn_label = $('<span class="label">'+btn.label+'</span>');
            btn_label.click(()=>{
                that.select_button(btn); //init editor
            });
            btn_tab.append(btn_label);

            let btn_inp = $('<input type="text" class="btn-inp""></input>');
            let btn_inp_wh = $('<span class="btn-inp-wh"></span>');
            btn_inp.on('change keydown keypress keyup', (ev)=>{
                 let val = btn_inp.val();
                 btn_inp_wh.text(val);
                 btn_inp.width(btn_inp_wh.width() + 10);
            });
            btn_inp.val(btn.label);

            let btn_edit_confirm = $('<span class="btn-edit-confirm"></span>');
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
                    that.btns.push({
                        label: 'Call',
                        color: 'blue',
                        value: {}
                    });
                }
                that.render_button_tabs();
                let btn_to_sel = i_btn;
                if (that.btns.length-1 < i_btn)
                    btn_to_sel = that.btns.length-1;

                that.menu_underlay.unbind().hide()
                that.select_button(that.btns[btn_to_sel]);

            }).blur((ev)=>{
                rem_btn.removeClass('warn');
            });
            btn_menu.append( [ rename_btn, $('<div class="cleaner"></div>'), color_line, $('<div class="cleaner"></div>'), rem_btn, $('<div class="cleaner"></div>') ]);

            btn_menu_btn.click(()=>{
                if (!btn_menu.hasClass('open')) {
                    btn_menu.addClass('open');
                    that.menu_underlay.unbind().show().click(()=>{
                        btn_menu.removeClass('open');
                        that.menu_underlay.unbind().hide();
                    });
                } else {
                    btn_menu.removeClass('open');
                    that.menu_underlay.unbind().hide()
                }
            });

            btn_menu.appendTo(btn_menu_btn);

            btn_tab.append(btn_menu_btn);

            // btn_cont.append([ btn_inp_wh, btn_inp, btn_menu ]);

            // btn_sel_inps.push( [ btn_inp, btn_cont ] );

            // save refs
            btn.btn_inp = btn_inp;
            btn.tab_el = btn_tab; 
            btn.label_el = btn_label;

            this.btns_line_el.append(btn_tab);
        };

        let btn_add = $('<span class="add-btn">Add<span class="wide"> button</span></span>');
        btn_add.click((ev)=>{
            that.confirm_edits();
            that.btns.push({
                label: 'Call',
                color: 'blue',
                value: {}
            });
            that.render_button_tabs();
            that.select_button(that.btns[that.btns.length-1]);
        });
        this.btns_line_el.append(btn_add);
    }

    validate(val, type, val_inp, type_hint) {
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

    make_primitive_type(field, default_value, make_label, last_in_block, onVal) {
        let line = $('<div class="line"></div>')
        if (make_label)
            line.append($('<div class="label">'+field.name+':</div>'));
       
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
            val = set_default;

        let val_inp = null;
        let type_hint = $('<span class="hint">'+field.type+'</span>');
        if (inp_type_grp == 'string') {
            val_inp = $('<input type="text"/>');
            val_inp.val(val);
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'int') {
            val_inp = $('<input type="text"/>');
            val_inp.val(val);
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'float') {
            val_inp = $('<input type="text"/>');
            val_inp.val(val.toFixed(1));
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'bool') {
            val_inp = $('<select><option value="true">True</option><option value="false">False</option></select>');
            val_inp.val(val ? 'true' : 'false');
            type_hint = null;
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type);
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
                let sec_val = that.validate($(ev.target).val(), 'int32', val_inp_sec, type_hint);
                val.sec = sec_val;
                onVal(val);
            });
            val_inp_nsec.change((ev)=>{
                let nsec_val = that.validate($(ev.target).val(), 'int32', val_inp_nsec, type_hint);;
                val.nsec = nsec_val;
                onVal(val);
            });
        } 
        
        line.append($('<div class="val_wrap">').append(type_hint ? [ val_inp, type_hint ] : val_inp ));
        
        line.append('<i class="end-line"><b>,</b></i>');
        if (last_in_block)
            line.addClass('last-in-block');

        line.append($('<div class="cleaner"/>'));

        return { 'val': val, 'line':line };
    }

    process_msg_template(msg_type, value, label, last_in_block = true) {
        
        // let def_els = [];
        // let indent = l*30;
        let that = this;

        const msg = {};
        
        let label_el = $((label ? '<div class="label">'+label+':</div>' : '') + '<i class="obj-open">{</i>');
        let block = $('<div class="block"></div>')

        let msg_class = this.client.find_message_type(msg_type);
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

                        msg[field.name] = [];
                        const arrayLength = field.arrayLength ?? 0;
                        for (let j = 0; j < arrayLength; j++) {                            
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, value[field.name], null, j == arrayLength-1);
                            let nested_block = $('<div></div>').append([ nestedBefore, nestedBlock, nestedAfter ]);
                            msg[field.name].push(nestedMsg);
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
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, value ? value[field.name] : null, null, true);
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

                        const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, value ? value[field.name] : null, field.name, i == msg_class.definitions.length-1);
                        msg[field.name] = nestedMsg;
                        block.append([ nestedBefore, nestedBlock, nestedAfter]);
                    }
                } 
                else { // Primitive types
                    
                    if (field.isArray === true) { // array of primitives
                        
                        let arr_label = $('<div class="label">'+field.name+':</div><i class="array-open inline">[</i><div class="cleaner"/>');
                        let arr_block = $('<div class="block"></div>');
                        
                        let vals_block = $('<div></div>');
                        
                        msg[field.name] = [];
                        const arrayLength = field.arrayLength ?? 0;
                        for (let j = 0; j < arrayLength; j++) {
                            let i = msg[field.name].length;
                            const r = this.make_primitive_type(field, null, false, j == arrayLength-1, (val) => {
                                msg[field.name][i] = val;    
                            });
                            msg[field.name].push(r.val);
                            vals_block.append(r.line);
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
                            let i = msg[field.name].length;
                            const r = this.make_primitive_type(field, null, false, true, (val) => {
                                msg[field.name][i] = val;    
                            });
                            msg[field.name].push(r.val);
                            vals_block.append(r.line);
                            vals_block.children('.last-in-block').removeClass('last-in-block');
                            r.line.addClass('last-in-block');

                            rem_btn.removeClass('hidden');

                            return false
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
                    else { // single primitive type
                        
                        const r = this.make_primitive_type(field, value ? value[field.name] : null, true, i == msg_class.definitions.length-1, (val) => {
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

        // let line = $('<div class="line"></div>');
        // line.append(def_els);

        return [ msg, label_el, block, after ];
    }

    hide() {

        this.cont_el.hide();
        this.bg.unbind().hide();
        $('BODY').removeClass('no-scroll');
    }

}