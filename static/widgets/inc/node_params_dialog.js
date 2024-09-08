export class NodeParamsDialog {

    constructor(client) {
        this.client = client;

        this.cont_el = $('#node-params-dialog');
        this.bg = $('#dialog-modal-confirm-underlay');
        
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

    show(node) {
        this.node = node;

        let that = this;

        this.cont_el.empty();
        this.cont_el.append($('<h3>'+this.node.node+'</h3><span class="title">Runtime Parameters</span>'))


        this.list_el = $('<div class="params-list"></div>')
        this.list_el_loader = $('<span class="loader">Loading...</span>');
        this.list_el.append(this.list_el_loader);

        let list_msg = {
            "prefixes": [],
            "depth": 0
        }

        this.client.service_call(node['_srvListParameters'], list_msg, true, (list_reply) =>{
            this.client.service_call(node['_srvGetParameters'], { "names": list_reply.result.names }, true, (details_reply) =>{
                that.list_el.empty();

                for (let i = 0; i < list_reply.result.names.length; i++) {
                    let name = list_reply.result.names[i];
                    let detail = details_reply.values[i];
                    let type_hr = 'n/a';
                    switch (detail['type']) {
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
                    that.list_el.append($('<div class="param-name">'+name+'<span class="param-type">'+type_hr+'</span></div>'))
                }

            });
        });



        this.bottom_btns_el = $('<div class="buttons"></div>');
        let btn_close = $('<button class="btn-close">Close</button>');
        btn_close.click((ev)=>{
            that.hide();
        });

        let btn_save = $('<button class="btn-save">Save</button>');
        btn_save.click((ev) => {
        
            btn_save.addClass('working');

            // that.client.ui.save_service_buttons(service.service, this.btns);
            // that.client.ui.render_service_menu_btns(service, that.msg_type);

            setTimeout(()=>{
                btn_save.removeClass('working');
                that.hide();
            }, 100)
        }); 
        this.bottom_btns_el.append([ btn_save,  btn_close ]);
        this.cont_el.append([ this.list_el, $('<div class="cleaner"/>'), this.bottom_btns_el ]);

        this.cont_el.show();

        this.bg.unbind().show().click((ev)=>this.hide());
        $('BODY').addClass('no-scroll');

    }

    hide() {
        this.cont_el.hide();
        this.bg.unbind().hide();
        $('BODY').removeClass('no-scroll');
    }
}