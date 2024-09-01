export class ServiceInputDialog {

    constructor(client) {
        this.client = client;

        this.cont_el = $('#service-input-dialog');
        this.bg = $('#dialog-modal-confirm-underlay');
        
    }

    show(service) {
        let that = this;

        this.cont_el.empty();
        this.cont_el.append($('<h3>'+service.service+'</h3><span class="msg_type">'+service.msg_type+'</span>'))

        
        this.msg_type = this.client.find_message_type(service.msg_type+'_Request');
        // let writer = this.client.get_msg_writer(service.msg_type+'_Request');

        let editor = $('<div id="json-editor"></div>');
        // editor.append('<i class="obj-open">{</i>');
        // const [def, def_els ] = this.make_msg_template(service.msg_type+'_Request', 0);
        // 
        let [ msg, block_before, block_el, block_after] = this.process_msg_template(service.msg_type+'_Request', '', true); ; //$('<div class="block" style="margin-left:'+20+'px"></div>');
        this.def = msg;
        // block.append(def_els);
        editor.append([ block_before, block_el, block_after] );
        // editor.append('<i class="obj-close">}</i>');        

        let btns = $('<div class="buttons"></div>');
        let btn_cancel = $('<button>Cancel</button>');
        btn_cancel.click((ev)=>{
            that.hide();
        });
        let btn_test_call = $('<button>Test Call Service</button>');
        
        btn_test_call.click((ev) => {
            that.client.service_call(service.service, msg, false, (service_reply) => {
                console.log('Service replied: ', service_reply);
            });
        }); 
        let btn_save = $('<button>Save</button>');
        
        btns.append([ btn_cancel, btn_test_call, btn_save ]);
        this.cont_el.append([ editor, this.dbg, btns ]);

        this.cont_el.show();
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

    make_primitive_type(field, set_default, make_label, last_in_block, onVal) {
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
        if (set_default)
            val = set_default;

        let val_inp = null;
        let type_hint = $('<span class="hint">'+field.type+'</span>');
        if (inp_type_grp == 'string') {
            val_inp = $('<input type="text"/>');
            val_inp.val(def_val);
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'int') {
            val_inp = $('<input type="text"/>');
            val_inp.val(def_val);
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'float') {
            val_inp = $('<input type="text"/>');
            val_inp.val(def_val.toFixed(1));
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type, val_inp, type_hint);
                onVal(val);
            });
        } else if (inp_type_grp == 'bool') {
            val_inp = $('<select><option value="true">True</option><option value="false">False</option></select>');
            val_inp.val(def_val ? 'true' : 'false');
            type_hint = null;
            val_inp.change((ev)=>{
                val = that.validate($(ev.target).val(), field.type);
                onVal(val);
            });
        } else if (inp_type_grp == 'time' || inp_type_grp == 'duration') { // UNTESTED
            val_inp = $('<div></div>');
            let val_inp_sec = $('<input type="text"/>');
            val_inp_sec.val(val.sec);
            let val_inp_nsec = $('<input type="text"/>');
            val_inp_sec.val(val.nsec);
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

    process_msg_template(msg_type, label, last_in_block = true) {
        
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
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, null, j == arrayLength-1);
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
                            const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, null, true);
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

                        const [ nestedMsg, nestedBefore, nestedBlock, nestedAfter ] = this.process_msg_template(field.type, field.name, i == msg_class.definitions.length-1);
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
                        
                        const r = this.make_primitive_type(field, null, true, i == msg_class.definitions.length-1, (val) => {
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