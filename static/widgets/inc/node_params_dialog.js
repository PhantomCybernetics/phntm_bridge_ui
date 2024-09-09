import { ServiceInputDialog } from './service_input_dialog.js';

export class NodeParamsDialog {

    constructor(client) {
        this.client = client;

        this.cont_el = $('#node-params-dialog');
        this.bg = $('#dialog-modal-confirm-underlay');
        this.editor_size = 0;
        
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

    select_param(name, detail, i_list_param, param_label_el) {

        this.list_el.addClass('editor-open');

        if (this.selected_param_label && param_label_el != this.selected_param_label) {
            this.selected_param_label.removeClass('selected');
            this.selected_param_label = null;
        }
        
        this.editor_el.addClass('open');
        this.param_btns_el.addClass('editor-open');

        param_label_el.addClass('selected');
        this.selected_param_label = param_label_el;

        this.render_param(name, detail, i_list_param);
    }

    render_param(name, detail, i_list_param) {
        
        let field = {
            type: null,
            name: name,
        }
        let default_value = null;
        let is_array = false;
        switch (detail['type']) {
            case 1: field.type = 'bool'; default_value = detail.bool_value; break;
            case 2: field.type = 'int64'; default_value = detail.integer_value; break;
            case 3: field.type = 'float64'; default_value = detail.double_value; break;
            case 4: field.type = 'string'; default_value = detail.string_value; break;

            case 5: field.type = 'int8'; is_array = true; default_value = detail.byte_array_value; break;
            case 6: field.type = 'bool'; is_array = true; default_value = detail.bool_array_value; break;
            case 7: field.type = 'int64'; is_array = true; default_value = detail.integer_array_value; break;
            case 8: field.type = 'float64'; is_array = true; default_value = detail.double_array_value; break;
            case 9: field.type = 'string'; is_array = true; default_value = detail.string_array_value; break;
        }

        this.editor_el.empty();

        let editor_size = this.editor_size;
        
        if (is_array) {
            editor_size = 2;
            // this.list_el.addClass('param-array');
            this.list_el.removeClass('one-line-editor');
            this.editor_el.removeClass('one-line');

            // let block = $('<div class="block"></div>');
            ServiceInputDialog.MakePrimitiveArray(field, default_value, this.editor_el, true, (index, val) => {
                console.log('Val ['+index+'] changed to ', val);
            });
            
            // this.editor_el.append(block);

            // this.editor_el.append();
        } else {
            editor_size = 1;
            // this.list_el.removeClass('param-array');
            this.list_el.addClass('one-line-editor');
            this.editor_el.addClass('one-line');
            const r = ServiceInputDialog.MakePrimitiveType(field, default_value, true, true, (val) => {
                console.log('Val changed to ', val);
                // msg[field.name] = val;
            });
            // msg[field.name] = r.val;
            this.editor_el.append(r.line);
        }

        if (editor_size > this.editor_size) { //fix scroll when list gets smaller
            let scroll_offset = i_list_param * 30 - this.list_el.height()/2.0;
            // console.log('scroll_offset:', scroll_offset);
            this.list_el.scrollTop(scroll_offset);
        }
        this.editor_size = editor_size;
            

    }

    show(node) {
        this.node = node;

        let that = this;

        this.cont_el.empty();
        this.cont_el.append($('<h3>'+this.node.node+'</h3><span class="title">Runtime ROS Parameters</span>'))

        this.list_el = $('<div class="params-list"></div>')
        this.selected_param_label = null;
        this.list_el_loader = $('<span class="loader"></span>');
        this.list_el.append(this.list_el_loader);

        this.editor_el = $('<div class="json-editor"></div>')
        
        let list_msg = {
            "prefixes": [],
            "depth": 0
        }

        this.client.service_call(node['_srvListParameters'], list_msg, true, (list_reply) =>{
            if (list_reply.err) {
                that.list_el.empty();
                that.list_el.append($('<div class="load-err">'+(list_reply.msg?list_reply.msg:'Error while fetching params')+'</div>'));
                return;
            }
            this.client.service_call(node['_srvGetParameters'], { "names": list_reply.result.names }, true, (details_reply) =>{
                if (details_reply.err) {
                    that.list_el.empty();
                    that.list_el.append($('<div class="load-err">'+(details_reply.msg?details_reply.msg:'Error while fetching params')+'</div>'));
                    return;
                }
        
                that.list_el.empty();

                for (let i = 0; i < list_reply.result.names.length; i++) {
                    let name = list_reply.result.names[i];
                    let detail = details_reply.values[i];
                    let type_hr = that.get_type_hr(detail['type']);
                    let param_label_el = $('<div class="param-name prevent-select">'+name+'<span class="param-type">'+type_hr+'</span></div>');
                    that.list_el.append(param_label_el);
                    param_label_el.click((ev)=>{
                        that.select_param(name, detail, i, param_label_el);
                    });
                }

            });
        });



        this.bottom_btns_el = $('<div class="buttons"></div>');
        let btn_close = $('<button class="btn-close">Close</button>');
        btn_close.click((ev)=>{
            that.hide();
        });

        this.param_btns_el = $('<div class="pram-buttons"></div>');

        let btn_reload = $('<button class="btn-reload">Reload</button>');
        btn_reload.click((ev) => {
        
            btn_reload.addClass('working');

            // that.client.ui.save_service_buttons(service.service, this.btns);
            // that.client.ui.render_service_menu_btns(service, that.msg_type);

            setTimeout(()=>{
                btn_reload.removeClass('working');
            }, 100)
        }); 

        let btn_set = $('<button class="btn-save">Set</button>');
        btn_set.click((ev) => {
        
            btn_set.addClass('working');

            // that.client.ui.save_service_buttons(service.service, this.btns);
            // that.client.ui.render_service_menu_btns(service, that.msg_type);

            setTimeout(()=>{
                btn_set.removeClass('working');
            }, 100)
        }); 

        this.param_btns_el.append([ btn_set, btn_reload ]);
       
        this.bottom_btns_el.append([ this.param_btns_el,  btn_close ]);
        this.cont_el.append([ this.list_el, $('<div class="cleaner"/>'), this.editor_el, $('<div class="cleaner"/>'), this.bottom_btns_el ]);

        this.cont_el.show();

        this.bg.unbind().show().click((ev)=>this.hide());
        $('BODY').addClass('no-scroll');

    }

    get_type_hr(i_type) {
        let type_hr = 'n/a';
        switch (i_type) {
            case 0: type_hr = 'unset'; break;
            case 1: type_hr = 'bool'; break;
            case 2: type_hr = 'int'; break;
            case 3: type_hr = 'double'; break;
            case 4: type_hr = 'string'; break;
            case 5: type_hr = 'byte[]'; break;
            case 6: type_hr = 'bool[]'; break;
            case 7: type_hr = 'int[]'; break;
            case 8: type_hr = 'double[]'; break;
            case 9: type_hr = 'string[]'; break;
        }
        return type_hr;
    }

    hide() {
        this.cont_el.hide();
        this.bg.unbind().hide();
        $('BODY').removeClass('no-scroll');
    }
}