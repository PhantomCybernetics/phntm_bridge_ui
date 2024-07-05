class TopicWriter {
    constructor(client, topic, msg_type) {
        this.client = client;
        this.topic = topic;
        this.msg_type = msg_type;
        this.ui = null;
        this.dc_id = null;

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

        //console.log('Writing '+msg_type+' into '+topic, this.dcs[topic])
        setTimeout(()=>{
            let payload = this.msg_writer.writeMessage(msg); //to binary
            this.dc.send(payload);
        }, 0);

        return true;
    }
}

class Subscriber {
    constructor(client, id_source) {
        this.client = client;
        this.id_source = id_source;
        this.msg_type = null;

        this.latest = null;
    }
}

export function IsImageTopic(t) {
    return t == 'sensor_msgs/msg/Image' ||
           t == 'sensor_msgs/msg/CompressedImage' ||
           t == 'ffmpeg_image_transport_msgs/msg/FFMPEGPacket';
}

export function IsFastVideoTopic(t) {
    return t == 'ffmpeg_image_transport_msgs/msg/FFMPEGPacket';
}

export class PhntmBridgeClient extends EventTarget {

    id_robot = null;
    session = null;
    supported_msg_types = null; //fetched static

    pc = null;

    discovered_topics = {} // str topic => { msg_types: str[], subscribed: bool }
    topic_dcs = {}; //str topic => RTCDataChannel
    discovered_nodes = {}; // str service => { msg_type: str}
    discovered_services = {}; // str service => { msg_type: str}
    discovered_cameras = {}; // str id => { info: {}}
    discovered_docker_containers = {}; // str id => { info: {}}

    topic_configs = {};
    topic_streams = {}; // topic/cam => id_stream
    media_streams = {}; // id_stream => MediaStream

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
        this.session = null;

        //defaults to phntm bridge service
        this.socket_url = opts.socket_url !== undefined ? opts.socket_url : 'https://bridge.phntm.io:1337';
        this.socket_path = opts.socket_path !== undefined ? opts.socket_path : '/app/socket.io/';
        this.socket_auto_connect = opts.socket_auto_connect !== undefined ? opts.socket_auto_connect : false;

        this.bridge_files_url = opts.bridge_files_url;
        this.bridge_files_secret = null;

        this.ice_servers_config = opts.ice_servers ? opts.ice_servers : [{urls:[
            "stun:stun.l.google.com:19302",
        ]}];
        this.force_turn = opts.force_turn; 

        this.init_complete = false;
        this.msg_writers = {}; //msg_type => writer
        this.msg_readers = {}; //msg_type => reader
        this.topic_writers = {}; //id => writer
        this.subscribers = {}; //id => topic ot cam reader
        this.can_change_subscriptions = false;
        this.requested_subscription_change = false;
        this.topic_streams = {};
        this.topic_configs = {}; //id => extra topic config
        this.media_streams = {}; //id_stream => stream
        this.latest = {};

        this.supported_msg_types = null;
        this.msg_types_src = opts.msg_types_src !== undefined ? opts.msg_types_src : '/static/msg_types.json' // json defs generated from .idl files
        this.load_message_types(); //async

        let that = this;

        this.socket_auth = {
            id_app: this.app_id,
            key: this.app_key,
            id_instance: null, // stored for reconnects when known
        }

        this.socket = io(this.socket_url, {
            path: this.socket_path,
            auth: this.socket_auth,
            autoConnect: this.socket_auto_connect,
            forceNew: true,
            transport: 'websocket'
        });

        this.socket.on("connect", () => {

            let subscribe = Object.keys(that.subscribers);
            let writers = [];
            Object.keys(that.topic_writers).forEach((topic)=>{
                writers.push([ topic, that.topic_writers[topic].msg_type ]);
            });
            that.init_complete = true;

            let req_data = {
                id_robot: that.id_robot,
                read: subscribe,
                write: writers,
            }

            console.log('Socket.io connected with id '+that.socket.id+', requesting:', req_data);

            setTimeout(()=>{
                that.socket.emit('robot', req_data,
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
            }, 0);
        });

        this.socket.on("disconnect", () => {
            console.log('Socket.io disconnected');
            that.robot_socket_online = false;
            if (that.pc && that.pc.signalingState == 'closed') {
                that._clear_connection();
            }
            setTimeout(()=>{
                that.emit('socket_disconnect');
            }, 0);
        });

        this.socket.on("error", (err) => {
            console.error('Socket.io error', err);
        });

        this.socket.on("connect_error", (err) => {
            console.error('Socket.io connect error:', err);
        });

        this.socket.on('instance', (id_instance) => {
            setTimeout(()=>{
                if (that.socket_auth.id_instance != id_instance) {
                    console.warn('Got new id instance: '+id_instance);
                    if (that.pc) {
                        console.warn('Removing pc for old instance: '+that.socket_auth.id_instance);
                        that.pc.close();
                        that.pc = null;
                    }
                    that.socket_auth.id_instance = id_instance;
                }
            }, 0);
        });

        this.socket.on('robot', (robot_data, return_callback) => {
            setTimeout(()=>{
                that._process_robot_data(robot_data, return_callback);
            }, 0)
        });

        this.socket.on("robot:update", (update_data, return_callback) => {
            setTimeout(()=>{
                that._process_robot_data(update_data, return_callback);
            }, 0);
        });

        this.socket.on("introspection", (state) => {
            console.log('Got introspetion state '+state); // undefined
            that.introspection = state;
            setTimeout(()=>{
                that.emit('introspection', that.introspection);
            }, 0);
        });

        this.socket.on('nodes', (nodes_data) => {

            if (!nodes_data[this.id_robot])
                return;

            console.warn('Raw nodes: ', nodes_data);

            setTimeout(()=>{
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
                                is_video: IsImageTopic(msg_types[0]),
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
                                is_video: IsImageTopic(msg_types[0]),
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

            }, 0);

        });


        this.socket.on('topics', (topics_data) => {

            if (!topics_data[this.id_robot])
                return;

            setTimeout(()=>{
                this.discovered_topics = {};
                topics_data[this.id_robot].forEach((topic_data)=>{
                    let topic = topic_data.shift();
                    let msg_types = topic_data
                    this.discovered_topics[topic] = {
                        msg_types: msg_types,
                        id: topic,
                        is_video: IsImageTopic(msg_types[0]),
                        msg_type_supported: this.find_message_type(msg_types[0]) != null,
                    }
                });

                console.log('Got topics ', this.discovered_topics);
                this.emit('topics', this.discovered_topics);
            }, 0);

        });

        this.socket.on('services', (services_data) => {

            if (!services_data[this.id_robot])
                return;

            setTimeout(()=>{
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
            }, 0);
        });

        this.socket.on('cameras', (cameras_data) => {

            if (!cameras_data[this.id_robot])
                return;

            setTimeout(()=>{
                this.discovered_cameras = {};

                Object.keys(cameras_data[this.id_robot]).forEach((id_camera) => {

                    this.discovered_cameras[id_camera] = {
                        id: id_camera,
                        info: cameras_data[this.id_robot][id_camera],
                    };
                });

                console.log('Got Cameras:', this.discovered_cameras);
                this.emit('cameras', this.discovered_cameras);
            }, 0);
        });

        this.socket.on('docker', (docker_containers_data) => {

            if (!docker_containers_data[this.id_robot])
                return;

            setTimeout(()=>{
                this.discovered_docker_containers = {};

                docker_containers_data[this.id_robot].forEach((cont_data) => {
                    this.discovered_docker_containers[cont_data.id] = cont_data
                });

                console.log('Got Docker containers:', this.discovered_docker_containers);
                this.emit('docker', this.discovered_docker_containers);
            }, 0);
        });

        window.addEventListener("beforeunload", function(e){
            if (that.pc) {
                console.warn('Unloading window, disconnecting pc...');
                that.pc.close();
                that.pc = null;
            }
        });

        this.on('peer_connected', () => this.start_heartbeat());
        this.on('peer_disconnected', () => {
            this.stop_heartbeat();
        });
        // pc = InitPeerConnection(id_robot);
    }

    on(event, cb) {

        if (!this.event_calbacks[event])
            this.event_calbacks[event] = [];

        let p = this.event_calbacks[event].indexOf(cb);
        if (p > -1)
            return;

        this.event_calbacks[event].push(cb);

        if (event.indexOf('/') === 0) {  // topic or camera id
            this.create_subscriber(event);

            if (this.latest[event]) {
                setTimeout(()=>{
                    cb(this.latest[event].msg, this.latest[event].ev);
                }, 0);
            }
        }
    }

    once(event, cb) {
        if (!this.event_calbacks[event])
            this.event_calbacks[event] = [];

        let wrapper_cb = (...args) => {
            this.off(event, wrapper_cb);
            setTimeout(()=>{
                cb(...args);
            }, 0);
        }
        this.on(event, wrapper_cb)
    }

    off(event, cb) {
        // console.warn('unsubscribe', cb)
        if (!this.event_calbacks[event]) {
            console.warn('Event not registered', event, this.event_calbacks)
            return;
        }

        let p = this.event_calbacks[event].indexOf(cb)
        if (p !== -1) {
            this.event_calbacks[event].splice(p, 1);
            console.log('Handler removed for '+event+"; "+Object.keys(this.event_calbacks[event]).length+" remaing");
            if (Object.keys(this.event_calbacks[event]).length == 0) {
                delete this.event_calbacks[event];
                if (event.indexOf('/') === 0) { // topic or camera id
                    console.log('Unsubscribing from '+event);
                    this.remove_subscriber(event);
                }
            }
        }
        else {
            console.error('cb not found in unsubscribe for '+event, cb)
        }
    }

    emit(event, ...args) {
        if (!this.event_calbacks[event]) {
            // console.log('no callbacks for '+event);
            return;
        }

        // console.log('calling callbacks for '+event, this.event_calbacks[event]);
        let callbacks = Object.values(this.event_calbacks[event]);
        callbacks.forEach((cb) => {
            setTimeout(()=>{
                cb(...args)
            }, 0);
        });
    }

    create_subscriber(id_source) {

        if (this.subscribers[id_source]) {
            console.log('Reusing subscriber for '+id_source+'; init_complete='+this.init_complete);
            return this.subscribers[id_source];
        }

        console.log('Creating subscriber for '+id_source+'; init_complete='+this.init_complete)

        this.subscribers[id_source] = new Subscriber(this, id_source);

        if (this.init_complete) { //not waiting for initial subs
            console.log('emitting subscribe for '+id_source)

            if (this.add_subscribers_timeout) {
                window.clearTimeout(this.add_subscribers_timeout);
                this.add_subscribers_timeout = null;
            }
            if (!this.queued_subs)
                this.queued_subs = [];
            this.queued_subs.push(id_source);
            this.add_subscribers_timeout = window.setTimeout(
                () => this.delayed_bulk_create_subscribers(),
                5
            );
        }

        //init dc async
        return this.subscribers[id_source];
    }

    remove_subscriber(id_source) {

        if (!this.subscribers[id_source]) {
            console.log('Subscriber not found for '+id_source+'; not removing')
            return;
        }

        console.log('Removing subscriber for '+id_source);
        // this.topic_dcs

        delete this.subscribers[id_source];

        if (this.topic_streams[id_source]) {
            console.log('Clearing media stream for '+id_source);
            // if (this.media_streams[this.topic_streams[id_source]])
            //     delete this.media_streams[this.topic_streams[id_source]];
            delete this.topic_streams[id_source];
        }

        // if (topic_dcs) {
            
        // }

        if (this.init_complete) { //not waiting for initial subs
            if (this.remove_subscribers_timeout) {
                window.clearTimeout(this.remove_subscribers_timeout);
                this.remove_subscribers_timeout = null;
            }
            if (!this.queued_unsubs)
                this.queued_unsubs = [];
            this.queued_unsubs.push(id_source);
            this.remove_subscribers_timeout = window.setTimeout(
                () => this.delayed_bulk_remove_subscribers(),
                5
            );
        }
    }

    delayed_bulk_create_subscribers () {

        if (!this.can_change_subscriptions || this.requested_subscription_change) {
            this.add_subscribers_timeout = window.setTimeout(
                () => this.delayed_bulk_create_subscribers(),
                100 // wait
            );
            return;
        }

        console.log('requesting subscribe to ', this.queued_subs);
        this.requested_subscription_change = true; //lock
        this.socket.emit('subscribe', {
            id_robot: this.id_robot,
            sources: this.queued_subs
        }, (res) => {
            console.warn('Res sub', res);
            this.requested_subscription_change = false; //unlock
        });
        this.queued_subs = [];
        this.add_subscribers_timeout = null;
    }

    delayed_bulk_remove_subscribers () {

        if (!this.can_change_subscriptions || this.requested_subscription_change) {
            this.remove_subscribers_timeout = window.setTimeout(
                () => this.delayed_bulk_remove_subscribers(),
                100 // wait
            );
            return;
        }

        console.log('requesting unsubscribe from ', this.queued_unsubs);
        
        this.socket.emit('unsubscribe', {
            id_robot: this.id_robot,
            sources: this.queued_unsubs
        }, (res) => {
            console.warn('Res unsub', res);
            this.requested_subscription_change = false; //unlock
        });
        this.queued_unsubs = [];
        this.remove_subscribers_timeout = null;
    }

    get_writer(topic, msg_type, err_out = null) {

        if (this.topic_writers[topic] && this.topic_writers[topic].msg_type == msg_type) {
            console.log('Re-using writer for '+topic+' and '+msg_type+'; init_complete='+this.init_complete);
            return this.topic_writers[topic];
        }

        if (this.topic_writers[topic] && this.topic_writers[topic].msg_type != msg_type) {
            console.error('Will not write '+msg_type+' into '+topic+' (type mixing: '+this.topic_writers[topic].msg_type+' x '+msg_type+')');
            if (err_out) {
                err_out.error = true;
                err_out.message = 'Not writing because mixing message types in one topic breaks ROS.' +
                                  'Either change the ouput topic, or save your changes & reload this page to override.';
            }
            return false;
        }

        console.warn('Beginning writing '+msg_type+' to '+topic+'; init_complete='+this.init_complete)

        this.topic_writers[topic] = new TopicWriter(this, topic, msg_type);
        let that = this;
        if (this.init_complete) { // not waiting for initial subs
            this.socket.emit('subscribe:write', {
                id_robot: this.id_robot,
                sources: [[ topic, msg_type ]]
            },  (res_pub) => {
                
                if (res_pub && res_pub.err) {
                    console.error('Error creating a topic writer for '+topic+':', res_pub.err);
                } else {
                    console.warn('Res pub: ', res_pub);
                    if (res_pub['write_data_channels']) {
                        res_pub['write_data_channels'].forEach((one_res)=>{
                            let res_topic = one_res[0];
                            let dc_id = one_res[1];
                            let res_msg_type = one_res[2];
                            that._make_write_data_channel(res_topic, dc_id, res_msg_type);
                        });
                    }
                }
            });
        }
        return this.topic_writers[topic];
    }

    remove_writer(topic) {
        if (!this.writers[topic]) {
            console.log('Writer not found for '+topic+'; not removing')
            return;
        }

        console.log('Removing writer for '+topic);
        // this.topic_dcs

        if (this.writers[topic].dc) {
            this.writers[topic].dc.close();
        }
        delete this.writers[topic];

        if (this.init_complete) { //not waiting for initial subs
            this.socket.emit('unsubscribe:write', {
                id_robot: this.id_robot,
                sources: [ topic ]
            }, (res) => {
                console.warn('Res unpub', res);
            });
        }
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
            //wait for messages defs to load
            this.once('message_types_loaded', () => { this.connect(); });
            return;
        }

        this.start_heartbeat(); // make webrtc data channel (at least one needed to open webrtc connection)

        console.log('Connecting Socket.io...')
        this.socket.connect();
    }

    start_heartbeat() {

        if (this.heartbeat_timer)
            return;

        this.heartbeat_logged = false;
        this.heartbeat_writer = this.get_writer('_heartbeat', 'std_msgs/msg/Byte');

        if (!this.heartbeat_writer)
            console.error('Error setting up heartbeat writer');
        else {
            console.log('heartbeat writer ready');
            let that = this;
            that.heartbeat_timer = setInterval(()=>{

                if (!that.pc || that.pc.connectionState != 'connected')
                    return;

                if (!that.heartbeat_writer.send({data: 1})) { // true when ready and written
                    console.warn('Failed to send heartbeat');
                    that.heartbeat_logged = false;
                } else if (!that.heartbeat_logged) {
                    console.log('Heartbeat started');
                    that.heartbeat_logged = true;
                }

            }, 3000);
        }
    }

    stop_heartbeat() {
        if (this.heartbeat_timer) {
            console.log('Heartbeat stopped');
            clearInterval(this.heartbeat_timer);
            this.heartbeat_timer = null;
        }
    }

    get_bridge_file_url(url) {
        let res = this.bridge_files_url
                    .replace('%ROBOT_ID%', this.id_robot)
                    .replace('%SECRET%', this.bridge_files_secret)
                    .replace('%URL%', encodeURIComponent(url));
        return res;
    }

    _process_robot_data(robot_data, answer_callback) {

        console.warn('Recieved robot state data: ', this.id_robot, robot_data);
        let that = this;

        if (robot_data['session']) { // no session means server pushed just brief info
            if (this.session != robot_data['session']) {
                console.warn('NEW PC SESSION '+robot_data['session']);

                Object.keys(this.topic_writers).forEach((topic)=>{
                    if (that.topic_writers[topic].dc) {
                        that.topic_writers[topic].dc.close();
                        that.topic_writers[topic].dc_id = -1;
                        delete that.topic_writers[topic].dc;
                    }
                });

                if (this.pc != null) {
                    this.pc.close(); // make new pc
                    this.pc = null;
                }
            }
            this.session = robot_data['session'];
        }
    
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
        let prev_online = this.robot_socket_online;
        this.robot_socket_online = robot_data['ip'] ? true : false;
        this.ip = robot_data['ip'];
        let prev_introspection = this.introspection;
        this.introspection = robot_data['introspection'];
        if (robot_data['files_fw_secret']) {
            this.bridge_files_secret = robot_data['files_fw_secret'];
        }
            
        if (this.robot_socket_online && !this.pc /*|| this.pc.signalingState == 'closed' */) {
            console.warn(`Creating new webrtc peer w id_instance=${this.socket_auth.id_instance}`);
            this.pc = this._init_peer_connection(this.id_robot);
        } else if (this.robot_socket_online) {
            console.warn(`Re-using old webrtc peer, robot_socket_online=${this.robot_socket_online} pc=${this.pc} id_instance=${this.socket_auth.id_instance}; this should autoconnect...`);
            // should autoconnect ?!?!
        }

        if (prev_online != this.robot_socket_online)
            this.emit('robot-socket-connected', this.robot_socket_online);

        this.emit('update');

        if (prev_introspection != this.introspection)
            this.emit('introspection', this.introspection);

        if (!this.robot_socket_online) {
            // in case of socket connection loss this webrtc stays up transmitting p2p
            console.warn('Server reports robot disconnected from socket.io')
            return;
        }

        if (robot_data['input_drivers'] || robot_data['input_defaults']) {
            let drivers = robot_data['input_drivers'];
            let defaults = robot_data['input_defaults'];
            this.emit('input_config', drivers, defaults);
        }

        if (robot_data['read_data_channels']) {
            robot_data['read_data_channels'].forEach((topic_data)=>{
                let topic = topic_data[0];
                let dc_id = topic_data[1];
                let msg_type = topic_data[2];
                let reliable = topic_data[3];
                let topic_config = topic_data[4]; //extra topic config

                if (topic_config && Object.keys(topic_config).length) {
                    console.log('Got '+topic+' extra config:', topic_config);
                    this.topic_configs[topic] = topic_config;
                    this.emit('topic_config', topic, this.topic_configs[topic]);
                } else if (this.topic_configs[topic]) {
                    console.log('Deleted '+topic+' extra config');
                    delete this.topic_configs[topic];
                    this.emit('topic_config', topic, null);
                }
            });
        }

        if (robot_data['ui']) {
            console.log('ui got config: ', robot_data['ui']);
            this.emit('ui_config', robot_data['ui']);
        }

        if (robot_data['read_video_streams']) {
            robot_data['read_video_streams'].forEach((stream_data)=>{
                let id_src = stream_data[0];
                let id_stream = stream_data[1];

                if (Array.isArray(id_stream) && id_stream.length > 1) {
                    id_stream = id_stream[0];
                    let src_type = id_stream[1] // sensor_msgs/msg/Image
                }

                if (id_stream) {
                    if (!this.topic_streams[id_src] || this.topic_streams[id_src] != id_stream) {
                        console.log('Setting stream to '+id_stream+' for '+id_src);
                        this.topic_streams[id_src] = id_stream;
                        if (this.media_streams[id_stream]) {
                            this.emit('media_stream', id_src, this.media_streams[id_stream]);
                        }
                    } else {
                        console.log('Stream already exists for '+id_src +'; old='+this.topic_streams[id_src]+' new='+id_stream+'');
                    }

                } else if (this.topic_streams[id_src]) {
                    //stream closed
                    console.log('Stream closed for '+id_src +'; '+this.topic_streams[id_src]);
                    // if (this.media_streams[this.topic_streams[id_src]])
                    //     delete this.media_streams[this.topic_streams[id_src]];
                    delete this.topic_streams[id_src];
                }
            });
        }

        if (robot_data['write_data_channels']) {
            console.log('Got write channels', robot_data['write_data_channels'])
            robot_data['write_data_channels'].forEach((topic_data)=>{
                let topic = topic_data[0];
                let dc_id = topic_data[1];
                let msg_type = topic_data[2];

                if (dc_id && that.topic_writers[topic] && that.topic_writers[topic].msg_type == msg_type) {
                    that.topic_writers[topic].dc_id = dc_id;
                }
                if (dc_id && msg_type) { // dc_ids starts with 1
                    this._make_write_data_channel(topic, dc_id, msg_type)
                } else if (topic && this.topic_writers[topic] && this.topic_writers[topic].dc) {
                    console.log('Topic '+topic+' closed by the robot')
                    this.topic_writers[topic].dc.close();
                    this.topic_writers[topic].dc = null;
                }
            });
        }

        if (robot_data['offer'] && answer_callback) {
            console.log('Got sdp offer', robot_data['offer'])
            let robot_offer = new RTCSessionDescription({ sdp: robot_data['offer'], type: 'offer' });

            that.pc.setRemoteDescription(robot_offer).then(() => {
                that.pc.createAnswer().then((answer) => {
                    that.pc.setLocalDescription(answer)
                    .then(()=>{

                        that._wait_for_ice_gathering().then(()=>{
                            console.log('Ice cool, state=', that.pc.iceGatheringState);
                            console.log('Ice servers:', that.ice_servers_config);
                            // console.log('First local description:', that.pc.localDescription.sdp);

                            let answer_data = {
                                id_robot: that.id_robot,
                                sdp: that.pc.localDescription.sdp,
                            };
                            console.log('Sending sdp asnwer', answer_data.sdp)
                            answer_callback(answer_data);

                        }).catch(()=>{
                            console.error('Error handling robot\'s offer');
                        });
                       
                    });
                });
            });
        } else {
            console.log('Initiated without subs, unlocking...');
            this.can_change_subscriptions = true;
        }
    }

    _ice_checker(resolve, reject, start_time) {
        if (this.pc && this.pc.iceGatheringState == 'complete')
            return resolve();

        if (start_time === undefined)
            start_time = Date.now();
        else if (Date.now() - start_time > 30000) {
            console.error('Timed out while waiting for ICE gathering, state='+this.pc.iceGatheringState);
            if (reject)
                return reject();
            return;
        }

        console.log('Waiting for ICE gathering, state='+this.pc.iceGatheringState);

        let that = this;
        setTimeout(() => {
            that._ice_checker(resolve, reject, start_time);
        }, 100);
    }

    _wait_for_ice_gathering() {
        let that = this;
        return new Promise((resolve, reject) => {
            return that._ice_checker(resolve, reject);
        });
    }

    // _make_read_data_channel(topic, dc_id, msg_type, reliable) {

    //     if (this.topic_dcs[topic]) {
    //         console.log('DC already exists for '+topic);
    //         // if (dc_id != this.topic_dcs[topic].id) {
    //         //     console.warn('DC for '+topic+' has new id: '+dc_id+', old='+this.topic_dcs[topic].id);
    //         //     this.topic_dcs[topic].close();
    //         //     delete this.topic_dcs[topic];
    //         // } else {
    //         return; //we cool here
    //         // }
    //     }

    //     console.log('Creating DC for '+topic+'; reliable='+reliable);

    //     if (this.pc.signalingState == 'closed') {
    //         return console.err('Cannot create read DC for '+topic+'; pc.signalingState=closed');
    //     }

    //     let dc = this.pc.createDataChannel(topic, {
    //         negotiated: true,
    //         ordered: reliable ? true : false,
    //         maxRetransmits: reliable ? null : 0,
    //         id: dc_id
    //     });

    //     let Reader = window.Serialization.MessageReader;
    //     // console.warn('reader=', Reader);
    //     let msg_type_class = this.find_message_type(msg_type, this.supported_msg_types)
    //     let msg_reader = new Reader( [ msg_type_class ].concat(this.supported_msg_types) );
    //     // console.warn('reader inst=', msg_reader);
    //     this.topic_dcs[topic] = dc;

    //     let that = this;

    //     dc.addEventListener('open', (ev)=> {
    //         console.warn('DC '+topic+' open', dc)
    //     });
    //     dc.addEventListener('close', (ev)=> {
    //         console.warn('DC '+topic+' close')
    //         delete that.topic_dcs[topic];
    //     });
    //     dc.addEventListener('error', (ev)=> {
    //         console.error('DC '+topic+' error', ev)
    //         delete that.topic_dcs[topic]
    //     });
    //     let dc_incomming_logged = false;
    //     dc.addEventListener('message', (ev)=> {

    //         let rawData = ev.data; 
    //         let decoded = null;
    //         let raw_len = 0;
    //         let raw_type = ""

    //         if (!dc_incomming_logged) {
    //             console.info('Incoming data for '+topic);
    //             dc_incomming_logged = true;
    //         }

    //         if (rawData instanceof ArrayBuffer ) {
    //             raw_len = rawData.byteLength;
    //             raw_type = 'ArrayBuffer';
    //             if (msg_reader != null) {                    
    //                 let v = new DataView(rawData)
    //                 decoded = msg_reader.readMessage(v);
    //             } else {
    //                 decoded = buf2hex(rawData)
    //             }
    //         } else if (rawData instanceof Blob) { //firefox
    //             raw_len = rawData.size;
    //             raw_type = 'Blob';
    //             if (msg_reader != null) {                    
                
    //                 new Response(rawData).arrayBuffer()
    //                 .then((buff)=>{
    //                     let v = new DataView(buff)
    //                     decoded = msg_reader.readMessage(v);
    //                     that.emit(topic, decoded, ev)
    //                     that.latest[topic] = {
    //                         msg: decoded,
    //                         ev: ev
    //                     };
    //                 });
    //                 return; //async

    //             } else {
    //                 decoded = buf2hex(rawData)
    //             }
                
    //         } else { // fail => string
    //             decoded = rawData; 
    //         }

    //         that.emit(topic, decoded, ev)
    //         that.latest[topic] = {
    //             msg: decoded,
    //             ev: ev
    //         };
    //     });
    // }

    _make_write_data_channel(topic, dc_id, msg_type) {

        if (!this.topic_writers[topic]) {
            console.log('Writer not found for '+topic);
            return;
        }

        if (this.topic_writers[topic].dc && this.topic_writers[topic].dc.id == dc_id) {
            console.log('Writer DC already exists for '+topic+'; id='+dc_id);
            // if (dc_id != this.topic_writers[topic].dc.id) {
            //     console.warn('Write DC for '+topic+' has new id: '+dc_id+', old='+this.topic_writers[topic].dc.id);
            //     this.topic_writers[topic].dc.close();
            //     delete this.topic_writers[topic].dc
            // } else {
             return; //we cool here
            // }
        }

        let dc = null;
        try {
            console.log('Creating write DC for '+topic+'; pc=', this.pc);
            dc = this.pc.createDataChannel(
                topic,
                {
                    negotiated: true, //negotiated by the app, not webrtc layer
                    ordered: false,
                    maxRetransmits: 0,
                    id: dc_id
                }
            );
            this.topic_writers[topic].dc = dc;
        } catch (e) {
            console.error('Creating write DC for '+topic+' failed', e);
            return;
        }

        let that = this;
        dc.addEventListener('open', (ev)=> {
            console.warn('Write DC '+topic+' open', dc.id)
        });
        dc.addEventListener('close', (ev)=> {
            console.warn('Write DC '+topic+' closed', dc.id)
            if (that.topic_writers[topic].dc == dc) {
                delete that.topic_writers[topic].dc;
                that.topic_writers[topic].dc_id = -1;    
            }
        });
        dc.addEventListener('error', (ev)=> {
            console.error('write DC '+topic+' error', ev)
            if (that.topic_writers[topic].dc == dc) {
                delete that.topic_writers[topic].dc;
                that.topic_writers[topic].dc_id = -1;
            }
        });
    }

    _clear_connection() {
        console.warn('Socket and webrtc disconnected; clearing session');
        this.session = null;
        this.init_complete = false;
        let that = this;
        Object.keys(that.topic_writers).forEach((topic)=>{
            if (that.topic_writers[topic].dc) {
                that.topic_writers[topic].dc.close();
                // delete that.topic_writers[topic].dc;
            }
        });
        if (this.pc != null) {
            this.pc.close(); // make new pc
            this.pc = null;
        }
    }

    _init_peer_connection(id_robot) {

        let config = {
            sdpSemantics: 'unified-plan',
            iceServers: this.ice_servers_config,
            // bundlePolicy: 'max-compat'
        };

        if (this.force_turn) {
            console.warn("Forcing TURN connection...")
            config['iceTransportPolicy'] = 'relay' //force TURN
        }

        let pc = new RTCPeerConnection(config);
        let that = this;

        pc.addEventListener('icegatheringstatechange', (evt) => {
            console.warn('Ice gathering state changed: ', pc.iceGatheringState);
        });

        pc.addEventListener('iceconnectionstatechange', (evt) => {
            console.warn('Ice connection state changed: ', pc.iceConnectionState);
        });

        pc.addEventListener('negotiationneeded', (evt) => {
            console.warn('Negotiation needed! ');
        });

        // connect audio / video
        pc.addEventListener('track', (evt) => {

            console.log('New track added: ', evt);

            for (let i = 0; i < evt.streams.length; i++) {
                let stream = evt.streams[i];

                that.media_streams[stream.id] = stream;

                Object.keys(that.topic_streams).forEach((id_src)=>{
                    if (that.topic_streams[id_src] == stream.id) {
                        that.emit('media_stream', id_src, stream)
                    }
                })

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

            evt.track.addEventListener('ended', (evt) => {
                console.warn('Track ended!', evt);
            })
        });

        // connect data
        pc.addEventListener('datachannel', (evt) => {

            let ch = evt.channel;
            let topic = ch.label;
            let msg_type = ch.protocol;
            let dc_id = ch.id;
            
            // if (that.topic_writers[topic]) {
            //     that.topic_writers[topic] = ch;
            //     console.log('New write data channel added '+ch.label, ch);
            //     // return;
            // }

            console.log('New read data channel added '+ch.label, ch);

            let channelLogged = false;

            let Reader = window.Serialization.MessageReader;
            
            let msg_type_class = that.find_message_type(msg_type, that.supported_msg_types)
            if (!msg_type_class) {
                console.error('Unsupported msg type: '+msg_type);
                return;
            }
                
            let msg_reader = new Reader([ msg_type_class ].concat(that.supported_msg_types));

            ch.addEventListener("open", (open_evt) => {
                console.log('Read channel open '+open_evt.target.label, open_evt)
            });
            ch.addEventListener("error", (err_evt) => {
                console.error('Read channel error '+err_evt.target.label, err_evt)
            });
            ch.addEventListener("bufferedamountlow", (event) => {
                console.warn('Read channel bufferedamountlow '+event.target.label, event)
            });

            ch.addEventListener("close", (close_evt) => {
                console.log('Read channel close', close_evt)
            });
            
            ch.addEventListener("message", (msg_evt) => {
                
                let rawData = msg_evt.data; //arraybuffer
                let decoded = null;
                let raw_len = 0;
                let raw_type = "";

                if (rawData instanceof ArrayBuffer ) {
                    raw_len = rawData.byteLength;
                    raw_type = 'ArrayBuffer';
                    if (msg_reader != null) {                    
                        let v = new DataView(rawData)
                        decoded = msg_reader.readMessage(v);
                    } else {
                        decoded = buf2hex(rawData)
                    }
                } else if (rawData instanceof Blob) { //firefox
                    raw_len = rawData.size;
                    raw_type = 'Blob';
                    if (msg_reader != null) {                    
                    
                        new Response(rawData).arrayBuffer()
                        .then((buff)=>{
                            let v = new DataView(buff)
                            decoded = msg_reader.readMessage(v);
                            that.emit(topic, decoded, ev)
                            that.latest[topic] = {
                                msg: decoded,
                                ev: ev
                            };
                        });
                        return; //async
    
                    } else {
                        decoded = buf2hex(rawData)
                    }
                    
                } else { // fail => string
                    decoded = rawData; 
                }

                if (!channelLogged) {
                    channelLogged = true;
                    console.log('Incoming data for '+topic+' ('+msg_type+')', decoded);
                }

                that.emit(topic, decoded, msg_evt)
                that.latest[topic] = {
                    msg: decoded,
                    ev: msg_evt
                };
                
            });

         

            // if (evt.track.kind == 'video') {
            //     document.getElementById('video').srcObject = evt.streams[0];
            // } else {
            //     document.getElementById('audio').srcObject = evt.streams[0];
            // }

        });

        pc.addEventListener('negotiationneeded', (evt) => {
            console.warn('negotiationneeded!', evt);
        });

        pc.addEventListener('signalingstatechange', (evt) => {
            console.warn('signalingstatechange', pc.signalingState);

            that.can_change_subscriptions = (pc.signalingState == 'stable');

            if (pc.signalingState == 'closed' && !that.robot_socket_online) {
               that._clear_connection();
            }

            // switch (pc.signalingState) {
            //     case "closed":
            //       console.warn('Peer signalling state is closed');
            //       break;
            //   }
        });

        pc.addEventListener("connectionstatechange", (evt) => {

            let newState = evt.currentTarget.connectionState;
            if (newState == 'failed' || newState == 'disconnected') {
                console.warn('Peer connection state: ', evt.currentTarget.connectionState);
            } else {
                console.warn('Peer connection state: ', evt.currentTarget.connectionState);
            }

            if (evt.currentTarget.connectionState == 'connected') {
                if (!pc.connected) { //just connected
                    pc.connected = true;
                    that.emit('peer_connected')
                    that.run_peer_stats_loop();
                }
            } else if (evt.currentTarget.connectionState != 'connecting' && pc.connected) { //just disconnected

                console.error(`Peer disconnected, robot_socket_online=${that.robot_socket_online }`);

                let was_connected = pc.connected;
                that.peer_stats_loop_running = false;
                pc.connected = false;

                Object.keys(that.topic_writers).forEach((topic)=>{
                    if (that.topic_writers[topic].dc) {
                        that.topic_writers[topic].dc.close();
                        // delete that.topic_writers[topic].dc;
                    }
                });

                if (was_connected) {
                    if (!that.robot_socket_online) {
                        console.warn('Clearing peer connection & instance id');
                        that.pc.close();
                        that.pc = null;
                        that.socket_auth.id_instance = null; // cloud bridge will generate new instance id on connection
                    }

                    that.emit('peer_disconnected');
                }
            }
        });

        return pc;
    }
    
    async get_peer_stats() {
        let that = this;
        return new Promise((resolve) => {

            if (!that.pc || !that.pc.connected) {
                setTimeout(() => {
                    resolve();
                }, 100);
                return;
            }
                
            that.pc.getStats(null)
                .then((results) => {
                    that.emit('peer_stats', results);
                })
                .catch((err) => {
                    console.error(err);
                })
                .finally((info) => {
                    setTimeout(() => {
                        resolve();
                    }, 1000);
                });
        });
    }

    async run_peer_stats_loop() {
        // return;

        this.peer_stats_loop_running = true;

        while (this.peer_stats_loop_running) {
            await this.get_peer_stats();
        }
    }

    service_call(service, data, cb) { 
        let req = {
            id_robot: this.id_robot,
            service: service,
            msg: data // data undefined => no msg
        }
        console.warn('Service call request', req);
        this.socket.emit('service', req, (reply)=> {
            console.log('Service call reply', reply);
            if (cb)
                cb(reply);
        });
    }

    docker_container_start(id_cont, cb) {
       this._docker_call(id_cont, 'start', cb)
    }

    docker_container_stop(id_cont, cb) { 
        this._docker_call(id_cont, 'stop', cb)
    }

    docker_container_restart(id_cont, cb) { 
        this._docker_call(id_cont, 'restart', cb)
    }

    _docker_call(id_cont, msg, cb) {
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

    run_introspection(state=true) {
        if (this.introspection == state)
            return;
        this.socket.emit('introspection', { id_robot: this.id_robot, state: state }, (res) => {
            if (!res || !res['success']) {
                console.error('Introspection start err: ', res);
                return;
            }
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