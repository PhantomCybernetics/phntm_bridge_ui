
class TopicWriter {
    constructor(client, topic, msg_type, on_ready_cb) {
        this.client = client;
        this.topic = topic;
        this.msg_type = msg_type;

        if (!client.msg_writers[msg_type]) {
            let Writer = window.Serialization.MessageWriter;
            let msg_class = client.find_message_type(msg_type);
            if (!msg_class) {
                console.error('Failed creating writer for '+msg_type+'; message class not found');
                return null;
            }
            client.msg_writers[msg_type] = new Writer( [ msg_class ].concat(client.supported_msg_types) );
        }

        this.msg_writer = client.msg_writers[msg_type];
        this.dc = null;
        this.on_ready_cb = on_ready_cb;
    }

    send(msg) {
        if (!this.client.pc || this.client.pc.connectionState != 'connected')
            return false; //not ready

        if (!this.dc || this.dc.readyState != 'open') {
            // if (this.dc)
            //     console.warn('Writer dc not ready for '+topic+': '+(this.dcs[topic] ? 'state='+this.dcs[topic].readyState : 'Not initiated'))
            return false; //not yer ready
        }

        if (!this.msg_writer) {
            return false; //err
        }

        let payload = this.msg_writer.writeMessage(msg); //to binary
        //console.log('Writing '+msg_type+' into '+topic, this.dcs[topic])
        this.dc.send(payload);
    }
}

class Subscriber {
    constructor(client, id_source) {
        this.client = client;
        this.id_source = id_source;
        this.msg_type = null;
    }
}

class PhntmBridgeClient extends EventTarget {

    id_robot = null;

    supported_msg_types = null; //fetched static

    pc = null;
    pc_connected = false;

    discovered_topics = {} // str topic => { msg_types: str[], subscribed: bool }
    topic_dcs = {}; //str topic => RTCDataChannel
    // let topic_video_tracks = {}; //str topic => MediaStreamTrack
    // let topic_transceivers = {}; //str topic => RTCRtpTransceiver
    discovered_nodes = {}; // str service => { msg_type: str}
    discovered_services = {}; // str service => { msg_type: str}
    discovered_cameras = {}; // str id => { info: {}}
    discovered_docker_containers = {}; // str id => { info: {}}

    transievers = []; // RTCRtpTransceiver[]
    // let topic_media_streams = {}; // str topic => MediaStream
    media_streams = {}; // str id_stream => MediaStream
    preferedVideoCodecs = [];

    socket = null;
    event_calbacks = {}

    constructor(opts) {
        super();

        this.id_robot = opts.id_robot;
        if (!this.id_robot) {
            console.error("Missing opts.id_robot")
            return false;
        }
        this.app_id = opts.app_id;
        if (!this.app_id) {
            console.error("Missing opts.app_id")
            return false;
        }
        this.app_key = opts.app_key;
        if (!this.app_key) {
            console.error("Missing opts.app_key")
            return false;
        }

        //defaults to phntm bridge service
        this.socket_url = opts.socket_url !== undefined ? opts.socket_url : 'https://bridge.phntm.io:1337';
        this.socket_path = opts.socket_path !== undefined ? opts.socket_path : '/app/socket.io/';
        this.socket_auto_connect = opts.socket_auto_connect !== undefined ? opts.socket_auto_connect : false;

        this.ice_server_urls = opts.ice_server_urls ? opts.ice_server_urls : [
            'stun:stun.l.google.com:19302'
        ];

        this.init_complete = false;
        this.msg_writers = {}; //msg_type => writer
        this.msg_readers = {}; //msg_type => reader
        this.topic_writers = {}; //id => writer
        this.subscribers = {}; //id => topic ot cam reader
        this.media_streams = {}; //id_stream => stream

        this.supported_msg_types = null;
        this.msg_types_src = opts.msg_types_src !== undefined ? opts.msg_types_src : '/static/msg_types.json' // json defs generated from .idl files
        this.load_message_types(); //async

        let that = this;

        this.socket = io(this.socket_url, {
            path: this.socket_path,
            auth: {
                id_app: this.app_id,
                key: this.app_key
            },
            autoConnect: this.socket_auto_connect
        });

        this.socket.on("connect", () => {

            console.log('Socket.io connected with id '+that.socket.id+', requesting robot...')

            let subscribe = Object.keys(that.subscribers);
            let writers = [];
            Object.keys(that.topic_writers).forEach((topic)=>{
                writers.push([ topic, that.topic_writers[topic].msg_type ]);
            })
            that.init_complete = true;

            that.pc = that._init_peer_connection(that.id_robot);

            that.socket.emit('robot', {
                id_robot: that.id_robot,
                read: subscribe,
                write: writers,
            },
                (robot_data) => {
                    that._process_robot_data(robot_data, (answer_data) => {
                        that.socket.emit('sdp:answer', answer_data, (res_answer) => {
                            if (!res_answer || !res_answer['success']) {
                                console.error('Error answering topic read subscription offer: ', res_answer);
                                return;
                            }
                        });
                    });
                }
            );
        });

        this.socket.on('robot', (robot_data, return_callback) => {
            that._process_robot_data(robot_data, return_callback);
        });

        this.socket.on("robot:update", (update_data, return_callback) => {
            that._process_robot_data(update_data, return_callback);
        });

        this.socket.on("disconnect", () => {
            console.log('Socker.io disconnected'); // undefined
        });



        this.socket.on("introspection", (state) => {
            console.log('Got introspetion state '+state); // undefined
            that.introspection = state;
            that.emit('introspection', that.introspection);
        });

        this.socket.on('nodes', (nodes_data) => {

            if (!nodes_data[this.id_robot])
                return;

            console.warn('Raw nodes: ', nodes_data);

            this.discovered_nodes = {};
            Object.keys(nodes_data[this.id_robot]).forEach((node)=>{
                this.discovered_nodes[node] = {
                    node: node,
                    namespace: nodes_data[this.id_robot][node]['namespace'],
                    publishers: {},
                    subscribers: {},
                    services: {},
                }
                if (nodes_data[this.id_robot][node]['publishers']) {
                    let topics = Object.keys(nodes_data[this.id_robot][node]['publishers']);
                    topics.forEach((topic) => {
                        let msg_types = nodes_data[this.id_robot][node]['publishers'][topic];
                        this.discovered_nodes[node].publishers[topic] = {
                            msg_types: msg_types,
                            is_video: msg_types.indexOf('sensor_msgs/msg/Image') !== -1 ? true : false,
                            msg_type_supported: this.find_message_type(msg_types[0]) != null,
                        }
                    })
                }
                if (nodes_data[this.id_robot][node]['subscribers']) {
                    let topics = Object.keys(nodes_data[this.id_robot][node]['subscribers']);
                    topics.forEach((topic) => {
                        let msg_types = nodes_data[this.id_robot][node]['subscribers'][topic];
                        this.discovered_nodes[node].subscribers[topic] = {
                            msg_types: msg_types,
                            is_video: msg_types.indexOf('sensor_msgs/msg/Image') !== -1 ? true : false,
                            msg_type_supported: this.find_message_type(msg_types[0]) != null,
                        }
                    })
                }
                if (nodes_data[this.id_robot][node]['services']) {
                    let services = Object.keys(nodes_data[this.id_robot][node]['services']);
                    services.forEach((service) => {
                        let msg_types = nodes_data[this.id_robot][node]['services'][service];
                        this.discovered_nodes[node].services[service] = {
                            service: service,
                            msg_types: msg_types,
                        }
                    })
                }
            });

            console.log('Got nodes ', this.discovered_nodes);
            this.emit('nodes', this.discovered_nodes);

            // let i = 0;
            // let subscribe_topics = [];
            // Object.keys(topics_data).forEach((id_robot) => {

            //     if (!topics_data[id_robot])
            //         return;

            //     //sort by topic
            //     topics_data[id_robot].sort((a, b) => {
            //         if (a.topic < b.topic) {
            //             return -1;
            //         }
            //         if (a.topic > b.topic) {
            //             return 1;
            //         }
            //         // a must be equal to b
            //         return 0;
            //     });

            //     $('#topics_heading').html(topics_data[id_robot].length+' Topics');


            // });


            // if (subscribe_topics.length)
            //     SetTopicsReadSubscription(id_robot, subscribe_topics, true);


        });


        this.socket.on('topics', (topics_data) => {

            if (!topics_data[this.id_robot])
                return;

            this.discovered_topics = {};
            topics_data[this.id_robot].forEach((topic_data)=>{
                let topic = topic_data.shift();
                let msg_types = topic_data
                this.discovered_topics[topic] = {
                    msg_types: msg_types,
                    id: topic,
                    is_video: msg_types.indexOf('sensor_msgs/msg/Image') !== -1 ? true : false,
                    msg_type_supported: this.find_message_type(msg_types[0]) != null,
                }
            });

            console.log('Got topics ', this.discovered_topics);
            this.emit('topics', this.discovered_topics);

            // let i = 0;
            // let subscribe_topics = [];
            // Object.keys(topics_data).forEach((id_robot) => {

            //     if (!topics_data[id_robot])
            //         return;

            //     //sort by topic
            //     topics_data[id_robot].sort((a, b) => {
            //         if (a.topic < b.topic) {
            //             return -1;
            //         }
            //         if (a.topic > b.topic) {
            //             return 1;
            //         }
            //         // a must be equal to b
            //         return 0;
            //     });

            //     $('#topics_heading').html(topics_data[id_robot].length+' Topics');


            // });


            // if (subscribe_topics.length)
            //     SetTopicsReadSubscription(id_robot, subscribe_topics, true);


        });

        this.socket.on('services', (services_data) => {

            if (!services_data[this.id_robot])
                return;

            this.discovered_services = {};

            // let i = 0;
            services_data[this.id_robot].forEach((service_data) => {
                let service = service_data[0];
                let msg_type = service_data[1];
                this.discovered_services[service] = {
                    service: service,
                    msg_type: msg_type
                };
            });

            console.log('Got services:', this.discovered_services);
            this.emit('services', this.discovered_services);
        });

        this.socket.on('cameras', (cameras_data) => {

            if (!cameras_data[this.id_robot])
                return;



            this.discovered_cameras = {};

            Object.keys(cameras_data[this.id_robot]).forEach((id_camera) => {

                this.discovered_cameras[id_camera] = {
                    id: id_camera,
                    info: cameras_data[this.id_robot][id_camera],
                };
            });

            console.log('Got Cameras:', this.discovered_cameras);
            this.emit('cameras', this.discovered_cameras);
        });

        this.socket.on('docker', (docker_containers_data) => {

            if (!docker_containers_data[this.id_robot])
                return;

            this.discovered_docker_containers = {};

            docker_containers_data[this.id_robot].forEach((cont_data) => {
                this.discovered_docker_containers[cont_data.id] = cont_data
            });

            console.log('Got Docker containers:', this.discovered_docker_containers);
            this.emit('docker', this.discovered_docker_containers);
        });

        // pc = InitPeerConnection(id_robot);
    }

    on(event, cb) {

        if (event.indexOf('/') === 0) {  // topic or camera id
            console.log('Subscribing to '+event);
            this.create_subscriber(event);
        }

        if (!this.event_calbacks[event])
            this.event_calbacks[event] = [];
        this.event_calbacks[event].push(cb);
    }

    once(event, cb) {
        if (!this.event_calbacks[event])
            this.event_calbacks[event] = [];

        let wrapper_cb = (...args) => {
            this.off(event, wrapper_cb);
            cb(...args);
        }
        this.on(event, wrapper_cb)
    }

    off(event, cb) {
        if (!this.event_calbacks[event])
            return;
        let p = this.event_calbacks[event].indexOf(cb)
        if (p !== -1) {
            this.event_calbacks[event].splice(p, 1);
            if (this.event_calbacks[event].length == 0) {
                delete this.event_calbacks[event];
                if (event.indexOf('/') === 0) { // topic or camera id
                    console.log('Unsubscribing from '+event);
                    this.remove_subscriber(event);
                }
            }
        }
    }

    emit(event, ...args) {
        if (!this.event_calbacks[event])
            return;
        this.event_calbacks[event].forEach((cb) => {
            cb(...args)
        })
    }

    create_subscriber(id_source) {

        if (this.subscribers[id_source])
            return this.subscribers[id_source];

        this.subscribers[id_source] = new Subscriber(this, id_source);

        if (this.init_complete) { //not waiting for initial subs
            this.socket.this.emit('subscribe:read', [ id_source ], (res_sub) => {
                console.wanm('Res sub', res_sub);
            });
        }

        //init dc async

        return this.topic_writers[id_source];
    }

    remove_subscriber(id_source) {

        if (!this.subscribers[id_source])
            return;

        delete this.subscribers[id_source];

        //TODO
    }

    create_writer(topic, msg_type, on_ready_cb) {

        if (this.topic_writers[topic])
            return this.topic_writers[topic];

        this.topic_writers[topic] = new TopicWriter(this, topic, msg_type, on_ready_cb);

        if (this.init_complete) { //not waiting for initial subs
            this.socket.this.emit('topic:write', [ [ topic, msg_type ] ] ,  (res_sub) => {
                console.wanm('Res pub: ', res_sub);
            });
        }

        //init dc async

        return this.topic_writers[topic];
    }

    clear_writer(topic) {
        //TODO
    }

    load_message_types() {

        fetch(this.msg_types_src)
        .then((response) => response.json())
        .then((json) => {
            this.supported_msg_types = json;
            console.log('Fetched '+json.length+' msg types from '+this.msg_types_src)
            this.emit('message_types_loaded');
        });
    }

    connect() {
        if (this.supported_msg_types === null) {
            this.once('message_types_loaded', () => { this.connect() } )
            return;
        }

        console.log('Connecting Socket.io...')
        this.socket.connect();
    }

    _process_robot_data(robot_data, answer_callback) {

        console.warn('Recieved robot state data: ', this.id_robot, robot_data);

        let error = robot_data['err'] ? robot_data['err'] : null;
        if (error) {
            let msg = robot_data['msg']
            console.error('Robot reply: '+msg);
            this.emit('error', error, msg);
        }

        if (robot_data['id_robot'] && this.id_robot != robot_data['id_robot']) {
            console.error('Robot id missmatch: '+robot_data['id_robot']);
            this.emit('error', 1, 'Robot id mismatch: '+robot_data['id_robot']);
            return;
        }

        this.name = robot_data['name'];
        this.online = robot_data['ip'] ? true : false;
        this.ip = robot_data['ip'];
        this.introspection = robot_data['introspection']

        this.emit('online', this.online);
        this.emit('update');
        this.emit('introspection', this.introspection);

        // if (robot_online && (!pc || pc.connectionState != 'connected')) {
        //     WebRTC_Negotiate(robot_data['id_robot']);
        // }

        if (robot_data['read_data_channels']) {
            robot_data['read_data_channels'].forEach((topic_data)=>{
                let topic = topic_data[0];
                let dc_id = topic_data[1];
                let msg_type = topic_data[2];
                if (dc_id && msg_type) {
                    this._make_read_data_channel(topic, dc_id, msg_type)
                } else {
                    console.log('Topic '+topic+' closed by the client')
                }
            });
        }

        if (robot_data['read_video_streams']) {
            robot_data['read_video_streams'].forEach((stream_data)=>{

            });
        }

        if (robot_data['write_data_channels']) {
            robot_data['write_data_channels'].forEach((topic_data)=>{

            });
        }

        if (robot_data['offer'] && answer_callback) {
            console.log('Got sdp offer')
            let robot_offer = new RTCSessionDescription({ sdp: robot_data['offer'], type: 'offer' });
            let that = this;
            this.pc.setRemoteDescription(robot_offer)
            .then(() => {
                that.pc.createAnswer()
                .then((answer) => {
                    that.pc.setLocalDescription(answer)
                    .then(()=>{
                        let answer_data = {
                            id_robot: that.id_robot,
                            sdp: answer.sdp,
                        };
                        console.log('Sending sdp asnwer')
                        answer_callback(answer_data);
                    })
                })
            });
        }


        // server reports robot disconnect
        // in case of socket connection loss this webrtc stays up transmitting p2p
        if (!this.online && this.pc && this.pc_connected) {
            // console.warn('Robot offline, restarting pc...');
            // this.pc.close();
            // const ev = new Event("connectionstatechange");

            // for (const topic of Object.values(topics)) {

            //     topic.subscribed = false;

            //     if (topic.id_stream && media_streams[topic.id_stream]) {
            //         media_streams[topic.id_stream].getTracks().forEach(track => track.stop());
            //         delete media_streams[topic.id_stream];

            //         if (panels[topic.id]) {
            //             console.log('Closing video panel for '+topic.id, document.getElementById('panel_video_'+panels[topic.id].n));
            //             document.getElementById('panel_video_'+panels[topic.id].n).srcObject = undefined;
            //         }
            //     }
            // }

            // for (const cam of Object.values(cameras)) {
            //     cam.subscribed = false;

            //     if (cam.id_stream && media_streams[cam.id_stream]) {
            //         media_streams[cam.id_stream].getTracks().forEach(track => track.stop());
            //         delete media_streams[cam.id_stream];

            //         if (panels[cam.id]) {
            //             console.log('Closing video panel for '+cam.id, document.getElementById('panel_video_'+panels[cam.id].n));
            //             document.getElementById('panel_video_'+panels[cam.id].n).srcObject = undefined;
            //         }
            //     }
            // }

            // pc.dispatchEvent(ev);
        }




    }

    _make_read_data_channel(topic, dc_id, msg_type) {

        if (this.topic_dcs[topic])
            return;

        let dc = this.pc.createDataChannel(topic, {
            negotiated: true,
            ordered: false,
            maxRetransmits: 0,
            id:dc_id
        });

        let Reader = window.Serialization.MessageReader;
        let msg_type_class = this.find_message_type(msg_type, this.supported_msg_types)
        let msg_reader = new Reader( [ msg_type_class ].concat(this.supported_msg_types) );

        this.topic_dcs[topic] = dc;

        let that = this;

        dc.addEventListener('open', (ev)=> {
            console.warn('DC '+topic+' open', dc)
        });
        dc.addEventListener('close', (ev)=> {
            console.warn('DC '+topic+' close')
            delete that.topic_dcs[topic];
        });
        dc.addEventListener('error', (ev)=> {
            console.error('DC '+topic+' error', ev)
            delete that.topic_dcs[topic]
        });
        dc.addEventListener('message', (ev)=> {

            let rawData = ev.data; //arraybuffer
            let decoded = null;
            let raw_len = 0;
            let raw_type = ""

            if (rawData instanceof ArrayBuffer) {
                if (msg_reader != null) {
                    let v = new DataView(rawData)
                    decoded = msg_reader.readMessage(v);
                } else {
                    decoded = buf2hex(rawData)
                }
                raw_len = rawData.byteLength;
                raw_type = 'ArrayBuffer';
            } else { //string
                decoded = rawData;
                raw_len = decoded.length;
                raw_type = 'String';
            }

            that.emit(topic, decoded)

            // if (topic == '/robot_description') {
            //     console.warn('Got robot descripotion: ', decoded);
            // }

            // let panel = panels[topic];
            // if (!panel) {
            //     console.error('panel not found for '+topic+' (data)')
            //     return;
            // }

            // if (!$('#update_panel_'+panel.n).is(':checked')) {
            //     // console.error('panel not updating '+topic+' (data)')
            //     return;
            // }

            // // console.log('panel '+topic+' has data', ev)

            // panel.onData(ev, decoded, raw_type, raw_len);
        });
    }

    _init_peer_connection(id_robot) {

        let config = {
            sdpSemantics: 'unified-plan',
            iceServers: [{urls:[
                                 "stun:stun.l.google.com:19302",
                        ]}],
            // bundlePolicy: 'max-compat'
        };

        let pc = new RTCPeerConnection(config);
        let that = this;

        // pc_.createDataChannel('_ignore_'); //wouldn't otherwise connect when initiated from the client

        // const capabilities = RTCRtpReceiver.getCapabilities('video');

        // capabilities.codecs.forEach(codec => {
        //      if (codec.mimeType == 'video/H264') {
        //          preferedVideoCodecs.push(codec);
        //      }
        // });
        // console.info('Video codecs: ', capabilities);
        // console.warn('Preferred video codecs: ', preferedVideoCodecs);
        //transceiver.setCodecPreferences(capabilities.codecs);

        // for (let i = 0; i < MAX_OPEN_VIDEO_STREAMS; i++) { //we need to prepare transcievers in advance before creating offer
        //     transievers.push(pc_.addTransceiver('video', {direction: 'recvonly'}).setCodecPreferences(preferedVideoCodecs));
        // }

        // let t = pc_.addTransceiver('video', {direction: 'recvonly'});
        // t.setCodecPreferences(preferedVideoCodecs);
        // transievers.push(t);

        //transievers.push(pc_.addTransceiver('video', {direction: 'recvonly'}));

        //pc_.addTransceiver('video', {direction: 'recvonly'}); //wouldn't otherwise open media streams (?)
        //pc_.addTransceiver('video', {direction: 'recvonly'}); //wouldn't otherwise open media streams (?)


        // pc.addTransceiver('audio', {direction: 'recvonly'});
        // data_receiver = pc.createDataChannel('test')
        // data_receiver.addEventListener("open", (evt) => {
        //     console.log('data_receiver.open', evt)
        // });
        // data_receiver.addEventListener("error", (evt) => {
        //     console.log('data_receiver.error', evt)
        // });
        // data_receiver.addEventListener("message", (evt) => {
        //     console.log('data_receiver.MSG:', evt)
        // });
        //ordered=true, protocol='test.protocol/lala.hm'

        // connect audio / video
        pc.addEventListener('track', (evt) => {

            console.log('New track added: ', evt);

            //document.getElementById('panel_video_1').srcObject = evt.streams[0];

            for (let i = 0; i < evt.streams.length; i++) {
                let stream = evt.streams[i];

                that.media_streams[stream.id] = stream;

                that.emit('media_stream', '', stream)

                stream.addEventListener('addtrack', (evt) => {
                    console.warn('Stream added track '+stream.id, evt);
                });
                stream.addEventListener('removetrack', (evt) => {
                    console.info('Stream removed track '+stream.id, evt);
                });
                stream.addEventListener('onactive', (evt) => {
                    console.info('Stream active '+stream.id, evt);
                });
                stream.addEventListener('oninactive', (evt) => {
                    console.info('Stream inactive '+stream.id, evt);
                });
            }

            //document.getElementById('panel_video_'+track.id).srcObject = evt.streams[0];
            //$('video').attr('src', evt.streams[0]);

            evt.track.addEventListener('ended', (evt) => {
                console.warn('Track ended!', evt);
            })
        });

        //let receiveChannel =
        // on_ready_cb

        // connect data
        pc.addEventListener('datachannel', (evt) => {

            let receiveChannel = evt.channel;
            receiveChannel.addEventListener("open", (open_evt) => {
                console.log('receiveChannel.open', open_evt)
            });
            receiveChannel.addEventListener("error", (err_evt) => {
                console.log('receiveChannel.error', err_evt)
            });
            receiveChannel.addEventListener("bufferedamountlow", (event) => {
                console.log('receiveChannel.bufferedamountlow', event)
            });

            receiveChannel.addEventListener("close", (close_evt) => { console.log('receiveChannel.close', close_evt) });
            receiveChannel.addEventListener("message", (msg_evt) => {
                console.log(receiveChannel.label, msg_evt.data)
            });

            console.log('New data channel added!', receiveChannel);

            // if (evt.track.kind == 'video') {
            //     document.getElementById('video').srcObject = evt.streams[0];
            // } else {
            //     document.getElementById('audio').srcObject = evt.streams[0];
            // }

        });

        pc.addEventListener('negotiationneeded', (evt) => {
            console.log('negotiationneeded!', evt);
        });

        pc.addEventListener('signalingstatechange', (evt) => {
            console.warn('signalingstatechange', pc.signalingState);

            switch (pc.signalingState) {
                case "closed":
                  console.warn('Peer connection closed');
                  pc = null;
                  break;
              }
        });

        pc.addEventListener("connectionstatechange", (evt) => {
            console.warn('Peer connection state: ',  evt.currentTarget.connectionState);

            if (evt.currentTarget.connectionState == 'connected') {
                if (!pc.connected) { //just connected
                    pc.connected = true;
                    that.emit('peer_connected')
                    // window.gamepadController.InitProducers()
                    // let subscribe_topics = []
                    // let panelTopics = Object.keys(panels);
                    // for (let i = 0; i < panelTopics.length; i++) {
                    //     let topic = panelTopics[i];
                    //     if (topics[topic] && !topic_dcs[topic]) { //if we don't have topics[topic], it'll get subscribed on 'topics' event
                    //         subscribe_topics.push(topic);
                    //     }
                    // }
                    // if (subscribe_topics.length)
                    //     SetTopicsReadSubscription(id_robot, subscribe_topics, true);

                }
            } else if (pc.connected) { //just disconnected

                console.error('Peer disconnected', evt);

                pc.connected = false;

                that.emit('peer_disconnected')

                // return;

                // window.gamepadController.ClearProducers();

                // for (const topic of Object.values(topics)) {

                //     topic.subscribed = false;

                //     if (topic.id_stream && media_streams[topic.id_stream]) {
                //         media_streams[topic.id_stream].getTracks().forEach(track => track.stop());
                //         delete media_streams[topic.id_stream];

                //         if (panels[topic.id]) {
                //             console.log('Closing video panel for '+topic.id, document.getElementById('panel_video_'+panels[topic.id].n));
                //             document.getElementById('panel_video_'+panels[topic.id].n).srcObject = undefined;
                //         }
                //     }
                // }

                // for (const cam of Object.values(cameras)) {
                //     cam.subscribed = false;

                //     if (cam.id_stream && media_streams[cam.id_stream]) {
                //         media_streams[cam.id_stream].getTracks().forEach(track => track.stop());
                //         delete media_streams[cam.id_stream];

                //         if (panels[cam.id]) {
                //             console.log('Closing video panel for '+cam.id, document.getElementById('panel_video_'+panels[cam.id].n));
                //             document.getElementById('panel_video_'+panels[cam.id].n).srcObject = undefined;
                //         }
                //     }
                // }

                // if (pc) {
                //     pc.close();
                //     pc = null;
                //     // pc = InitPeerConnection(id_robot); //prepare for next connection
                // }

            }
        });

        return pc;
    }

    service_call(service, data, cb) {
        let req = {
            id_robot: this.id_robot,
            service: service,
            msg: data
        }
        console.warn('Service call request', req);
        this.socket.emit('service', req, (reply)=> {
            console.log('Service call reply', reply);
            if (cb)
                cb(reply);
        });
    }

    docker_container_start(id_cont, cb) { //
       this._docker_call(id_cont, 'start', cb)
    }

    docker_container_stop(id_cont, cb) { //
        this._docker_call(id_cont, 'stop', cb)
    }

    docker_container_restart(id_cont, cb) { //
        this._docker_call(id_cont, 'restart', cb)
    }

    _docker_call(id_cont, msg, cb) { //
        let req = {
            id_robot: this.id_robot,
            container: id_cont,
            msg: msg
        }
        console.warn('Docker request', req);
        this.socket.emit('docker', req, (reply)=> {
            console.log('Docker reply', reply);
            if (cb)
                cb(reply);
        });
    }

    wifi_scan(roam=true, cb) {
        console.warn('Triggering wifi scan on robot '+this.id_robot+'; roam='+roam)
        this.socket.emit('iw:scan', { id_robot: this.id_robot, roam: roam }, (res) => {
            if (!res || !res['success']) {
                console.error('Wifi scan err: ', res);
                if (cb)
                    cb(res);
                return;
            }
            console.log('IW Scan results:', res.res);
            if (cb)
                cb(res.res);
        });
    }

    find_message_type(search, msg_types) {
        if (msg_types === undefined)
            msg_types = this.supported_msg_types;

        for (let i = 0; i < msg_types.length; i++) {
            if (msg_types[i].name == search) {
                return msg_types[i];
            }
        }
        return null;
    }
}




function buf2hex(buffer) { // buffer is an ArrayBuffer
    return [...new Uint8Array(buffer)]
        .map(x => x.toString(16).padStart(2, '0'))
        .join(' ');
}

function escapeHtml(unsafe)
{
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }

 function nl2br (str, is_xhtml) {
    if (typeof str === 'undefined' || str === null) {
        return '';
    }
    var breakTag = (is_xhtml || typeof is_xhtml === 'undefined') ? '<br />' : '<br>';
    return (str + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1' + breakTag + '$2');
}

var prettifyXml = function(sourceXml)
{
    var xmlDoc = new DOMParser().parseFromString(sourceXml, 'application/xml');
    var xsltDoc = new DOMParser().parseFromString([
        // describes how we want to modify the XML - indent everything
        '<xsl:stylesheet xmlns:xsl="http://www.w3.org/1999/XSL/Transform">',
        '  <xsl:strip-space elements="*"/>',
        '  <xsl:template match="para[content-style][not(text())]">', // change to just text() to strip space in text nodes
        '    <xsl:value-of select="normalize-space(.)"/>',
        '  </xsl:template>',
        '  <xsl:template match="node()|@*">',
        '    <xsl:copy><xsl:apply-templates select="node()|@*"/></xsl:copy>',
        '  </xsl:template>',
        '  <xsl:output indent="yes"/>',
        '</xsl:stylesheet>',
    ].join('\n'), 'application/xml');

    var xsltProcessor = new XSLTProcessor();
    xsltProcessor.importStylesheet(xsltDoc);
    var resultDoc = xsltProcessor.transformToDocument(xmlDoc);
    var resultXml = new XMLSerializer().serializeToString(resultDoc);
    return resultXml;
};

function GetFile(url) {
    alert('TODO:\n'+url+'');
}

function linkifyURLs(text, is_xhtml) {
    const options = {
        //rel: 'nofollow noreferrer noopener',
        formatHref: {
          hashtag: (val) => `https://www.twitter.com/hashtag/${val.substr(1)}`,
          mention: (val) => `https://github.com/${val.substr(1)}`
        },
        render: ({ tagName, attributes, content }) => {
            let attrs = "";
            tagName = 'A';
            for (const attr in attributes) {
                if (attr == 'href') {
                    attrs += ` ${attr}=javascript:GetFile(\'${attributes[attr]}\');`;
                } else
                    attrs += ` ${attr}=${attributes[attr]}`;
            }
            return `<${tagName}${attrs}>${content}</${tagName}>`;
        },
      }

      if (is_xhtml)
        return linkifyHtml(text, options)
    else
        return linkifyStr(text, options)
}


function lerpColor(a, b, amount) {

    var ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}












// function WebRTC_Negotiate(id_robot)
// {
//     console.log('WebRTC negotiating... ');

//     if (!pc)
//         pc = InitPeerConnection(id_robot);

//     return pc.createOffer().then(function(offer) {
//         return pc.setLocalDescription(offer);
//     }).then(function() {
//         // wait for ICE gathering to complete
//         return new Promise(function(resolve) {
//             if (pc.iceGatheringState === 'complete') {
//                 resolve();
//             } else {
//                 function checkState() {
//                     if (pc.iceGatheringState === 'complete') {
//                         pc.removeEventListener('icegatheringstatechange', checkState);
//                         resolve();
//                     }
//                 }
//                 pc.addEventListener('icegatheringstatechange', checkState);
//             }
//         });
//     }).then(function() {
//         let offer = pc.localDescription;
//         console.log('ICE gathering done, sending local offer: ', offer)
//         socket.emit('offer', { 'id_robot': id_robot, 'sdp': offer.sdp}, (answer) => {
//             if (answer.err) {
//                 console.error('Offer returned error', answer);
//                 return;
//             }
//             console.log('Setting remote answer:', answer.sdp);
//             return pc.setRemoteDescription({ sdp:answer.sdp, type:'answer'});
//         });
//     });

// }

let topics_to_subscribe = []; // str topic
let topics_to_unsubscribe = []; // str topic
function SetTopicsReadSubscription(id_robot, topics_list, subscribe) {

    for (let i = 0; i < topics_list.length; i++) {
        let topic = topics_list[i];
        if (subscribe) {
            let pSubscribe = topics_to_subscribe.indexOf(topic);
            if (topics[topic] && topics[topic].subscribed) {
                console.info('Topic '+topic+' already subscribed to (we cool)');
                if (pSubscribe !== -1)
                    topics_to_subscribe.splice(pSubscribe, 1);
                continue;
            }
            if (pSubscribe === -1)
                topics_to_subscribe.push(topic);
            let pUnsubscribe = topics_to_unsubscribe.indexOf(topic);
            if (pUnsubscribe !== -1)
                topics_to_unsubscribe.splice(pUnsubscribe, 1);
        } else {
            let pUnsubscribe = topics_to_unsubscribe.indexOf(topic);
            if (topics[topic] && !topics[topic].subscribed) {
                console.info('Topic '+topic+' already unsubscribed from (we cool)');
                if (pUnsubscribe !== -1)
                    topics_to_unsubscribe.splice(pUnsubscribe, 1);
                continue;
            }
            if (pUnsubscribe === -1)
                topics_to_unsubscribe.push(topic);
            let pSubscribe = topics_to_subscribe.indexOf(topic);
            if (pSubscribe !== -1)
                topics_to_subscribe.splice(pSubscribe, 1);
        }
    }

    let cum_topics_list = subscribe ? topics_to_subscribe : topics_to_unsubscribe;

    if (!cum_topics_list.length) {
        console.info('No topics to '+(subscribe?'subscribe to':'unsubscribe from')+' in SetTopicsReadSubscription (we cool)');
        return;
    }

    if (subscribe) {

        if (!pc || pc.signalingState != 'stable' || !pc.localDescription) {
            if (pc && pc.connectionState == 'failed') {
                console.info('Cannot subscribe to topics, pc.connectionState='+pc.connectionState+'; pc.signalingState='+pc.signalingState+'; pc.localDescription='+pc.localDescription+'; waiting... '+cum_topics_list.join(', '));
                //connect will trigger this again
                return;
            }

            if (pc)
                console.info('Cannot subscribe to topics, pc.connectionState='+pc.connectionState+'; pc.signalingState='+pc.signalingState+'; pc.localDescription='+pc.localDescription+'; waiting... '+cum_topics_list.join(', '));
            else
                console.info('Cannot subscribe to topics, pc=null; waiting... '+cum_topics_list.join(', '));

            setTimeout(() => {
                SetTopicsReadSubscription(id_robot, [], subscribe) //all alteady in queues
            }, 1000); //try again when stable
            return;
        }

        _DoSetTopicsSubscription(id_robot, cum_topics_list, true)
        topics_to_subscribe = [];

    } else {
        // unsubscribe, no need to renegotiate
        _DoSetTopicsSubscription(id_robot, cum_topics_list, false)
        topics_to_unsubscribe = [];
    }
}

// //assuming pc state is stable when subscribing to new topics here
// function _DoInitTopicsReadSubscription(id_robot, topics_list, subscribe) {



//     // if (!subscribe) {
//     return _DoSetTopicsSubscription(subscription_data, subscribe); //no need to negotiate
//     // }

//     // return pc.createOffer()
//     //     .then(function(offer) {
//     //         pc.setLocalDescription(offer);
//     //         //setup transievers for img topics
//     //         subscription_data['sdp_offer'] = pc.localDescription.sdp;
//     //     }).then(function() {
//     //         _DoSetTopicsSubscription(subscription_data, true);
//     //     });
// }

function _DoSetTopicsSubscription(id_robot, topics_list, subscribe) {

    console.log((subscribe ? 'Subscribing to read ' : 'Unsubscribing from reading ') + topics_list.join(', '));

    let data = {
        id_robot: id_robot,
        topics: [],
    };
    for (let i = 0; i < topics_list.length; i++) {
        if (!topics[topics_list[i]])
            continue;
        topics[topics_list[i]].subscribed = subscribe;
        data.topics.push([ topics_list[i], subscribe ? 1 : 0 ]);
    }

    if (!data['topics'].length) {
        return
    }

    return socket.emit('subcribe:read', data, (res) => {
        if (!res || !res['success']) {
            console.error('Read subscription err: ', res);
            return;
        }

        if (subscribe) {

            if (!res['offer_sdp']) {
                console.error('Read subscription err: no sdp offer received');
                return;
            }

            let robot_offer = new RTCSessionDescription({ sdp: res['offer_sdp'], type: 'offer' });
            console.log('Setting robot offer, signalling state='+pc.signalingState, robot_offer);

            _HandleTopicSubscriptionReply(res); // preps video panel to be found when new media stream is added

            pc.setRemoteDescription(robot_offer)
            .then(() => {

                pc.createAnswer()
                .then((answer) => {
                    pc.setLocalDescription(answer)
                    .then(()=>{
                        let answer_data = {
                            id_robot: id_robot,
                            sdp: answer.sdp,
                        };
                        socket.emit('sdp:answer', answer_data, (res_answer) => {
                            if (!res_answer || !res_answer['success']) {
                                console.error('Error answering topic read subscription offer: ', res_answer);
                                return;
                            }
                        });
                    })
                })
            });

        } else { // unsubscribe => no negotiation needed
            _HandleTopicSubscriptionReply(res);
        }
    });
}

function _HandleTopicSubscriptionReply(res) {

    console.log('Handling topic subscription data: ', res);

    for (let i = 0; i < res['subscribed'].length; i++) {

        let topic = res['subscribed'][i][0];
        let id = res['subscribed'][i][1];

        if (!topics[topic]) {
            console.warn('Topic '+topic+' not found in topics list', topics);
            continue;
        }

        let is_image = topics[topic]['msg_types'][0] == 'sensor_msgs/msg/Image'

        if (!is_image) { //subscribed data

            if (topic_dcs[topic]) {
                console.warn('Restarting local read DC '+topic);
                topic_dcs[topic].close();
                delete topic_dcs[topic];
            }

            console.log('Opening local read DC '+topic+' id='+id)
            let dc = pc.createDataChannel(topic, {
                negotiated: true,
                ordered: false,
                maxRetransmits: 0,
                id:id
            });

            let Reader = window.Serialization.MessageReader;
            let msg_type_class = find_message_type(topics[topic]['msg_types'][0], supported_msg_types)
            let msg_reader = new Reader( [ msg_type_class ].concat(supported_msg_types) );

            topic_dcs[topic] = dc;

            dc.addEventListener('open', (ev)=> {
                console.warn('DC '+topic+' open', dc)
            });
            dc.addEventListener('close', (ev)=> {
                console.warn('DC '+topic+' close')
                delete topic_dcs[topic];
            });
            dc.addEventListener('error', (ev)=> {
                console.error('DC '+topic+' error', ev)
                delete topic_dcs[topic]
            });
            dc.addEventListener('message', (ev)=> {

                let rawData = ev.data; //arraybuffer
                let decoded = null;
                let raw_len = 0;
                let raw_type = ""

                if (rawData instanceof ArrayBuffer) {
                    if (msg_reader != null) {
                        let v = new DataView(rawData)
                        decoded = msg_reader.readMessage(v);
                    } else {
                        decoded = buf2hex(rawData)
                    }
                    raw_len = rawData.byteLength;
                    raw_type = 'ArrayBuffer';
                } else { //string
                    decoded = rawData;
                    raw_len = decoded.length;
                    raw_type = 'String';
                }

                if (topic == '/robot_description') {
                    console.warn('Got robot descripotion: ', decoded);
                }

                let panel = panels[topic];
                if (!panel) {
                    console.error('panel not found for '+topic+' (data)')
                    return;
                }

                if (!$('#update_panel_'+panel.n).is(':checked')) {
                    // console.error('panel not updating '+topic+' (data)')
                    return;
                }

                // console.log('panel '+topic+' has data', ev)

                panel.onData(ev, decoded, raw_type, raw_len);
            });

        } else { //image topic subscribed as video stream

            console.log('Subscribing to video track '+topic+' id stream='+id+'; local streams:', media_streams);

            topics[topic].id_stream = id;

            let panel = panels[topic];
            if (!panel) {
                console.error('Panel not found for '+topic);
                continue;
            }

            // if this is the first time stream is subscribed,
            // panel will be found by 'track' event fires
            panel.id_stream = id;

            // otherwise we reuse existing panel
            if (media_streams[id]) {
                console.log('Found stream for '+topic+' id='+id);
                document.getElementById('panel_video_'+panel.n).srcObject = media_streams[id];
            }

        }

    }

    if (res['unsubscribed']) {
        for (let i = 0; i < res['unsubscribed'].length; i++) {

            let id_topic = res['unsubscribed'][i][0];
            let id = res['unsubscribed'][i][1];
            let topic = topics[id_topic];

            if (topic_dcs[id_topic]) {
                console.warn('Closing local read DC '+id_topic);
                topic_dcs[id_topic].close();
                delete topic_dcs[id_topic];
            }

            // if (topic.id_stream && media_streams[topic.id_stream]) {

            //     console.warn('Stopping media stream for '+id_topic);

            //     // topic_video_tracks[topic].stop()

            //     media_streams[topic.id_stream].getTracks().forEach(track => track.stop());
            //     delete media_streams[topic.id_stream];

            //     if (panels[id_topic]) {
            //         console.log('Closing video panel for '+id_topic, document.getElementById('panel_video_'+panels[id_topic].n));
            //         document.getElementById('panel_video_'+panels[id_topic].n).srcObject = undefined;
            //     }
            //     //pc.removeTrack(topic_transceivers[topic].receiver);
            //     //topic_video_tracks[topic].stop();
            //     //delete topic_video_tracks[topic];
            // }
        }
    }

    if (res['err']) {
        for (let i = 0; i < res['err'].length; i++) {

            let topic = res['err'][i][0];
            let msg = res['err'][i][1];
            console.info('Topic '+topic+' subscription err: '+msg);

            if (topics[topic]) {
                topics[topic].subscribed = false;
            }
        }
    }
}


let cameras_to_subscribe = []; // str cam
let cameras_to_unsubscribe = []; // str cam
function SetCameraSubscription(id_robot, camera_list, subscribe) {

    for (let i = 0; i < camera_list.length; i++) {
        let cam = camera_list[i];
        if (subscribe) {
            let pSubscribe = cameras_to_subscribe.indexOf(cam);
            if (cameras[cam] && cameras[cam].subscribed) {
                console.info('Camera '+cam+' already subscribed to (we cool)');
                if (pSubscribe !== -1)
                    cameras_to_subscribe.splice(pSubscribe, 1);
                continue;
            }
            if (pSubscribe === -1)
                cameras_to_subscribe.push(cam);
            let pUnsubscribe = cameras_to_unsubscribe.indexOf(cam);
            if (pUnsubscribe !== -1)
                cameras_to_unsubscribe.splice(pUnsubscribe, 1);
        } else {
            let pUnsubscribe = cameras_to_unsubscribe.indexOf(cam);
            if (cameras[cam] && !cameras[cam].subscribed) {
                console.info('Camera '+cam+' already unsubscribed from (we cool)');
                if (pUnsubscribe !== -1)
                    cameras_to_unsubscribe.splice(pUnsubscribe, 1);
                continue;
            }
            if (pUnsubscribe === -1)
                cameras_to_unsubscribe.push(cam);
            let pSubscribe = cameras_to_subscribe.indexOf(cam);
            if (pSubscribe !== -1)
                cameras_to_subscribe.splice(pSubscribe, 1);
        }
    }

    let cum_cameras_list = subscribe ? cameras_to_subscribe : cameras_to_unsubscribe;

    if (!cum_cameras_list.length) {
        console.info('No cameras to '+(subscribe?'subscribe to':'unsubscribe from')+' in SetCameraSubscription (we cool)');
        return;
    }

    if (subscribe) {

        if (!pc || pc.signalingState != 'stable' || !pc.localDescription) {
            if (pc && pc.connectionState == 'failed') {
                console.info('Cannot subscribe to cameras, pc.connectionState='+pc.connectionState+'; pc.signalingState='+pc.signalingState+'; pc.localDescription='+pc.localDescription+'; waiting... '+cum_cameras_list.join(', '));
                //connect will trigger this again
                return;
            }

            if (pc)
                console.info('Cannot subscribe to cameras, pc.connectionState='+pc.connectionState+'; pc.signalingState='+pc.signalingState+'; pc.localDescription='+pc.localDescription+'; waiting... '+cum_cameras_list.join(', '));
            else
                console.info('Cannot subscribe to cameras, pc=null; waiting... '+cum_cameras_list.join(', '));

            setTimeout(() => {
                SetCameraSubscription(id_robot, [], subscribe) //all alteady in queues
            }, 1000); //try again when stable
            return;
        }

        _DoSetCamerasSubscription(id_robot, cum_cameras_list, true)
        cameras_to_subscribe = [];

    } else {
        // unsubscribe, no need to renegotiate
        _DoSetCamerasSubscription(id_robot, cum_cameras_list, false)
        cameras_to_unsubscribe = [];
    }

}

// assuming pc state is stable when subscribing to new cameras here
// function _DoInitCamerasSubscription() {

//     console.warn((subscribe ? 'Subscribing to caneras ' : 'Unsubscribing from cameras ') + cameras_list.join(', '));

//     let subscription_data = {
//         id_robot: id_robot,
//         cameras: [],
//     };
//     for (let i = 0; i < cameras_list.length; i++) {
//         if (!cameras[cameras_list[i]])
//             continue;
//         cameras[cameras_list[i]].subscribed = subscribe;
//         subscription_data.cameras.push([ cameras_list[i], subscribe ? 1 : 0 ]);
//     }

//     if (!subscription_data['cameras'].length) {
//         return
//     }

//     if (!subscribe) {
//         return _DoSetCamerasSubscription(subscription_data, false); //no need to negotiate
//     }

//     return pc.createOffer()
//         .then(function(offer) {
//             pc.setLocalDescription(offer);
//             //setup transievers for img topics
//             subscription_data['sdp_offer'] = pc.localDescription.sdp;
//         }).then(function() {
//             _DoSetCamerasSubscription(subscription_data, true);
//         });
// }

function _DoSetCamerasSubscription(id_robot, cameras_list, subscribe) {

    console.log((subscribe ? 'Subscribing to cameras ' : 'Unsubscribing from cameras ') + cameras_list.join(', '));

    let data = {
        id_robot: id_robot,
        cameras: [],
    };
    for (let i = 0; i < cameras_list.length; i++) {
        if (!cameras[cameras_list[i]])
            continue;
        cameras[cameras_list[i]].subscribed = subscribe;
        data.cameras.push([ cameras_list[i], subscribe ? 1 : 0 ]);
    }

    if (!data['cameras'].length) {
        return
    }

    return socket.emit('cameras:read', data, (res) => {
        if (!res || !res['success']) {
            console.error('Camera subscription err: ', res);
            return;
        }

        if (subscribe) {

            if (!res['offer_sdp']) {
                console.error('Read subscription err: no sdp offer received');
                return;
            }
            let robot_offer = new RTCSessionDescription({ sdp: res['offer_sdp'], type: 'offer' });
            console.log('Setting robot offer, signalling state='+pc.signalingState, robot_offer);

            pc.setRemoteDescription(robot_offer)
            .then(() => {

                pc.createAnswer()
                .then((answer) => {
                    pc.setLocalDescription(answer)
                    .then(()=>{
                        let answer_data = {
                            id_robot: id_robot,
                            sdp: answer.sdp,
                        };
                        socket.emit('sdp:answer', answer_data, (res_answer) => {
                            if (!res_answer || !res_answer['success']) {
                                console.error('Error answering camera read subscription offer: ', res_answer);
                                return;
                            }
                            _HandleCamerasSubscriptionReply(res); // preps video panel to be found when new media stream is added
                        });
                    })
                })
            });

        } else { // unsubscribe => no negotiation needed
            _HandleCamerasSubscriptionReply(res);
        }
    });
}

function _HandleCamerasSubscriptionReply(res) {

    // console.log('Handling cameras subscription data: ', res);

    for (let i = 0; i < res['subscribed'].length; i++) {

        let id_cam = res['subscribed'][i][0];
        let id_stream = res['subscribed'][i][1];

        if (!cameras[id_cam]) {
            console.warn('Camera '+id_cam+' not found in detected cameras list', cameras);
            continue;
        }

        console.log('Subscribing to video track '+id_cam+' id stream='+id_stream+'; local media streams:', media_streams);

        cameras[id_cam].id_stream = id_stream;

        let panel = panels[id_cam];
        if (!panel) {
            console.error('Panel not found for '+id_cam);
            continue;
        }

        // if this is the first time stream is subscribed,
        // panel will be found by 'track' event fires
        panel.id_stream = id_stream;

        if (media_streams[id_stream]) {
            console.log('Found stream for '+id_cam+' id='+id_stream);
            document.getElementById('panel_video_'+panel.n).srcObject = media_streams[id_stream];
        }
    }

    if (res['unsubscribed']) {
        for (let i = 0; i < res['unsubscribed'].length; i++) {

            let id_cam = res['unsubscribed'][i][0];
            let id_stream = res['unsubscribed'][i][1];

            if (topic_media_streams[id_cam]) {

                console.warn('Pausing video track for '+id_cam);

                const elements = document.querySelectorAll(`[srcObject="${topic_media_streams[id_cam].id}"]`);
                elements.forEach(element => {
                    element.srcObject = null;
                });
            }
        }
    }

    if (res['err']) {
        for (let i = 0; i < res['err'].length; i++) {

            let id_cam = res['err'][i][0];
            let msg = res['err'][i][1];
            console.info('Camera '+id_cam+' subscription err: '+msg);

            if (cameras[id_cam]) {
                cameras[id_cam].subscribed = false;
            }
        }
    }

}