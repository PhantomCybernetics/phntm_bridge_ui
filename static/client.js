const socket = io("https://mrkbk.local:1337", {
    path:'/app/socket.io/',
    auth: {
        id_app: '6476b0cb2a6d250ce840ad5e',
        key: '6476b0cb2a6d250ce840ad5d'
    },
    autoConnect: false
});

let config = {
    sdpSemantics: 'unified-plan',
    iceServers: [{urls:[
                         "stun:stun.l.google.com:19302",
                         "stun:stun1.l.google.com:19302",
                         "stun:stun2.l.google.com:19302",
                         "stun:stun3.l.google.com:19302",
                         "stun:stun4.l.google.com:19302",
                ]}]
};

let supported_msg_types = null; //fetched static

let pc = null;
let pc_connected = false;

let grid = null;
let panels = {};
let topics = {} // str topic => { msg_types: str[], subscribed: bool }
let topic_dcs = {}; //str topic => RTCDataChannel
let topic_video_tracks = {}; //str topic => MediaStreamTrack
let topic_transceivers = {}; //str topic => RTCRtpTransceiver
let services = {}; // str service => { msg_type: str}

let transievers = []; // RTCRtpTransceiver[]
let topic_media_streams = {}; // str topic => MediaStream

const MAX_OPEN_VIDEO_STREAMS = 3;

function InitPeerConnection(id_robot) {
    let pc_ = new RTCPeerConnection(config);

    pc_.createDataChannel('_ignore_'); //wouldn't otherwise open chanels (?)

    const capabilities = RTCRtpReceiver.getCapabilities('video');
    let preferedVideoCodecs = [];
    capabilities.codecs.forEach(codec => {
         if (codec.mimeType == 'video/H264') {
             preferedVideoCodecs.push(codec);
         }
    });
    console.info('Video codecs: ', capabilities);
    console.warn('Preferred video codecs: ', preferedVideoCodecs);
    //transceiver.setCodecPreferences(capabilities.codecs);

    for (let i = 0; i < MAX_OPEN_VIDEO_STREAMS; i++) { //we need to prepare transcievers in advance before creating offer
        transievers.push(pc_.addTransceiver('video', {direction: 'recvonly'}).setCodecPreferences(preferedVideoCodecs));
    }

    //transievers.push(pc_.addTransceiver('video', {direction: 'recvonly'}));
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
    pc_.addEventListener('track', (evt) => {

        console.warn('New track added: ', evt);

        //document.getElementById('panel_video_1').srcObject = evt.streams[0];

        for (let i = 0; i < evt.streams.length; i++) {
            let stream = evt.streams[i];

            for (let topic in panels) {
                let panel = panels[topic];
                if (panel.id_stream == stream.id) {

                    console.log('Found video panel for stream '+stream.id+' topic='+topic);
                    //$('#panel_video_'+panel.n).attr('src', evt.streams[i]);
                    document.getElementById('panel_video_'+panel.n).srcObject = stream;
                    //document.getElementById('panel_video_'+panel.n).play();
                    console.warn('New video track added for '+topic+' id_stream='+stream.id);
                    topic_video_tracks[topic] = evt.track;
                    topic_transceivers[topic] = evt.transceiver;
                    topic_media_streams[topic] = stream

                    stream.addEventListener('addtrack', (evt) => {
                        console.warn('Track added to stream '+stream.id, evt);
                    });

                    stream.addEventListener('removetrack', (evt) => {
                        console.info('Track removed from stream '+stream.id, evt);
                    });

                   // break;
                }
            }
        }

        //document.getElementById('panel_video_'+track.id).srcObject = evt.streams[0];
        //$('video').attr('src', evt.streams[0]);

        evt.track.addEventListener('ended', (evt) => {
            console.warn('Track ended!', evt);
        })
    });

    //let receiveChannel =


    // connect data
    pc_.addEventListener('datachannel', (evt) => {

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

    pc_.addEventListener('negotiationneeded', (evt) => {
        console.log('negotiationneeded!', evt);
    });

    pc_.addEventListener('signalingstatechange', (evt) => {
        console.warn('signalingstatechange', pc_.signalingState);

        switch (pc_.signalingState) {
            case "closed":
              console.warn('Peer connection closed');
              pc = null;
              break;
          }
    });

    pc_.addEventListener("connectionstatechange", (evt) => {
        console.log('connectionstatechange: ',  evt.currentTarget.connectionState);

        if (evt.currentTarget.connectionState == 'connected') {
            if (!pc_connected) { //just connected
                pc_connected = true;
                window.gamepadController.InitProducer()
                let subscribe_topics = []
                let panelTopics = Object.keys(panels);
                for (let i = 0; i < panelTopics.length; i++) {
                    let topic = panelTopics[i];
                    if (topics[topic] && !topic_dcs[topic]) { //if we don't have topics[topic], it'll get subscribed on 'topics' event
                        subscribe_topics.push(topic);
                    }
                }
                if (subscribe_topics.length)
                    SetTopicsReadSubscription(id_robot, subscribe_topics, true);
            }
        } else if (pc_connected) { //just disconnected

            pc_connected = false;
            window.gamepadController.ClearProducer();
            for (const topic of Object.keys(topics)) {
                topics[topic].subscribed = false;
                if (topic_media_streams[topic]) {
                    topic_media_streams[topic].getTracks().forEach(track => track.stop());
                    delete topic_media_streams[topic];
                    delete topic_video_tracks[topic];
                    delete topic_transceivers[topic];

                    if (panels[topic]) {
                        console.log('Closing video panel for '+topic, document.getElementById('panel_video_'+panels[topic].n));
                        document.getElementById('panel_video_'+panels[topic].n).srcObject = undefined;
                    }
                }
            }
            if (pc) {
                pc.close();
                pc = InitPeerConnection(id_robot); //prepare for next connection
            }

        }

        SetWebRTCSatusLabel();
    });

    return pc_;
}

function FindMessageType(search, msg_types) {
    for (let i = 0; i < msg_types.length; i++) {
        if (msg_types[i].name == search) {
            return msg_types[i];
        }
    }
    return null;
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

function SetWebRTCSatusLabel() {

    let state = null;
    let via_turn = null;
    if (pc) {
        state = pc.connectionState
        console.log('pc.sctp:', pc.sctp)
        if (pc.sctp && pc.sctp.transport && pc.sctp.transport.iceTransport) {
            // console.log('pc.sctp.transport:', pc.sctp.transport)
            // console.log('pc.sctp.transport.iceTransport:', pc.sctp.transport.iceTransport)
            selectedPair = pc.sctp.transport.iceTransport.getSelectedCandidatePair()
            if (selectedPair && selectedPair.remote) {
                via_turn = selectedPair.remote.type == 'relay' ? true : false;
            }
        }
    }

    if (state != null)
        state = state.charAt(0).toUpperCase() + state.slice(1);
    else
        state = 'n/a'

    if (state == 'Connected')
        $('#webrtc_status').html('<span class="online">'+state+'</span>'+(via_turn?' <span class="turn">[TURN]</span>':'<span class="online"> [p2p]<//span>'));
    else if (state == 'Connecting')
        $('#webrtc_status').html('<span class="connecting">'+state+'</span>');
    else
        $('#webrtc_status').html('<span class="offline">'+state+'</span>');
}

function SetSocketIOSatusLabel() {
    let state = 'n/a';
    if (socket)
        state = socket.connected ? 'Connected' : 'Disconnected';

    if (state == 'Connected')
        $('#socketio_status').html('<span class="online">'+state+'</span>');
    else
        $('#socketio_status').html('<span class="offline">'+state+'</span>');
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

function ProcessRobotData(robot_data) {
    if (robot_data['err']) {
        $('#robot_info').html('Error connecting to robot...');
        return;
    }

    console.log('SIO got robot data', robot_data);

    if (robot_data['name']) {
        $('#robot_name').html(robot_data['name']);
        document.title = robot_data['name'] + ' @ BridgeViz';
    }


    console.log('Robot data: ', robot_data);

    let robot_online = robot_data['ip'] ? true : false;

    if (robot_online && (!pc || pc.connectionState != 'connected')) {
        WebRTC_Negotiate(robot_data['id_robot']);
    }

    $('#robot_info').html('ID: '+ robot_data['id_robot']
                            + ' @ '
                            + (robot_online ? '<span class="online">'+robot_data['ip'].replace('::ffff:', '')+'</span>':'<span class="offline">Offline</span>')+' '
                            + 'WebRTC: <span id="webrtc_status"></span> '
                            + 'Socket.io: <span id="socketio_status"></span>'
                            );

    // server reports robot being offline, in case of Socker connection loss this is
    // not teh case and webrtc keeps transmitting
    if (!robot_online && pc && pc_connected) {
        console.warn('Robot offline, restarting pc...');
        pc.close();
        const ev = new Event("connectionstatechange");
        pc.dispatchEvent(ev);
    }

    SetWebRTCSatusLabel();
    SetSocketIOSatusLabel();
}

function WebRTC_Negotiate(id_robot)
{
    console.log('WebRTC negotiating... ');

    if (!pc)
        pc = InitPeerConnection(id_robot);

    return pc.createOffer().then(function(offer) {
        return pc.setLocalDescription(offer);
    }).then(function() {
        // wait for ICE gathering to complete
        return new Promise(function(resolve) {
            if (pc.iceGatheringState === 'complete') {
                resolve();
            } else {
                function checkState() {
                    if (pc.iceGatheringState === 'complete') {
                        pc.removeEventListener('icegatheringstatechange', checkState);
                        resolve();
                    }
                }
                pc.addEventListener('icegatheringstatechange', checkState);
            }
        });
    }).then(function() {
        let offer = pc.localDescription;
        console.log('ICE gathering done, sending local offer: ', offer)
        socket.emit('offer', { 'id_robot': id_robot, 'sdp': offer.sdp, 'type': offer.type}, (answer) => {
            if (answer.err) {
                console.error('Offer returned error', answer);
                return;
            }
            console.log('Setting remote answer:', answer.sdp);
            return pc.setRemoteDescription(answer);
        });
    });

}

let topics_to_subscribe = []; // str topic
let topics_to_unsubscribe = []; // str topic

function SetTopicsReadSubscription(id_robot, topics_list, subscribe) {

    for (let i = 0; i < topics_list.length; i++) {
        let topic = topics_list[i];
        if (subscribe) {
            let pSubscribe = topics_to_subscribe.indexOf(topic);
            if (topics[topic] && topics[topic].subscribed) {
                console.warn('Topic '+topic+' already subscribed to');
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
                console.warn('Topic '+topic+' already unsubscribed from');
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
                return;
            }

            if (pc)
                console.info('Cannot subscribe to topics, pc.connectionState='+pc.connectionState+'; pc.signalingState='+pc.signalingState+'; pc.localDescription='+pc.localDescription+'; waiting... '+cum_topics_list.join(', '));
            else
                console.info('Cannot subscribe to topics, pc=null; waiting... '+cum_topics_list.join(', '));

            setTimeout(() => {
                SetTopicsReadSubscription(id_robot, [], subscribe) //all alteady in queues
            }, 300); //try again when stable
            return;
        }

        _DoInitTopicsReadSubscription(id_robot, cum_topics_list, true)
        topics_to_subscribe = [];

    } else {
        // unsubscribe, no need to renegotiate
        _DoInitTopicsReadSubscription(id_robot, cum_topics_list, false)
        topics_to_unsubscribe = [];
    }
}

//assuming pc state is stable when subscribing to new topics here
function _DoInitTopicsReadSubscription(id_robot, topics_list, subscribe) {

    console.warn((subscribe ? 'Subscribing to read ' : 'Unsubscribing from reading ') + topics_list.join(', '));

    let subscription_data = {
        id_robot: id_robot,
        topics: [],
    };
    for (let i = 0; i < topics_list.length; i++) {
        if (!topics[topics_list[i]])
            continue;
        topics[topics_list[i]].subscribed = subscribe;
        subscription_data.topics.push([ topics_list[i], subscribe ? 1 : 0 ]);
    }

    if (!subscription_data['topics'].length) {
        return
    }

    if (!subscribe) {
        return _DoSetSubscription(subscription_data, false); //no need to negotiate
    }

    // for (let i = 0; i < topics_list.length; i++) {
    //     let topic = topics_list[i];
    // }

    // for (let i = 0; i < subscription_data['topics'].length; i++) {
        // let topic = subscription_data['topics'][i];
        // let msg_type = topics[topic[0]] ? topics[topic[0]]['msg_types'][0] : null;
        // let is_image = msg_type == 'sensor_msgs/msg/Image';
        // if (is_image && !topic_transceivers[topic]) {
        //     console.log('Adding video transceiver for '+topic);
        //     topic_transceivers[topic] = pc.addTransceiver('video', {direction: 'recvonly'});
        // }
    // }

    return pc.createOffer()
        .then(function(offer) {
            pc.setLocalDescription(offer);
            //setup transievers for img topics
            subscription_data['sdp_offer'] = pc.localDescription.sdp;
        }).then(function() {
            _DoSetSubscription(subscription_data, true);
        });
}

function _DoSetSubscription(subscription_data, subscribing) {
    // toggle read subscription
    return socket.emit('subcribe:read', subscription_data, (res) => {
        if (!res['success']) {
            console.warn('Read subscription err: ', res);
            return;
        }

        if (subscribing) {
            let robot_answer = new RTCSessionDescription({ sdp: res['answer_sdp'], type: 'answer' });
            //robot_offer.sdp = offer.sdp.replace('H264', 'codec-not-supported');

            _HandleSubscriptionData(res);

            console.log('Setting robot answer:', robot_answer);
            pc.setRemoteDescription(robot_answer)
            // .then(() => {

            // });
        } else { //no negotiation needed
            _HandleSubscriptionData(res);
        }

        //console.log('Setting robot offer:', robot_answer);
        //pc.setRemoteDescription(robot_answer)

    });
}

function _HandleSubscriptionData(res) {

    console.log('Handling subscription data: ', res);

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
                ondragend: false,
                maxRetransmits: 0,
                id:id
            });

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
                let panel = panels[topic];
                if (!panel)
                    return;

                if (!$('#update_panel_'+panel.n).is(':checked'))
                    return;

                panel.OnData(ev);
            });

        } else { //subscribed video

            console.log('Subscribing to video track '+topic+' id stream='+id+'; local streams:', topic_media_streams);

            let panel = panels[topic];
            if (!panel) {
                console.error('Panel not found for '+topic);
                continue;
            }

            panel.id_stream = id;

            if (topic_media_streams[topic] && topic_media_streams[topic].id == id) {
                console.log('Found stream for '+topic+' id='+id);
                document.getElementById('panel_video_'+panel.n).srcObject = topic_media_streams[topic];
            }

            //$('#panel_widget_'+panel.n).find('video').attr('id', 'panel_video_'+id);

            // if (topic_video_tracks[topic]) {

            // }

        }

    }

    if (res['unsubscribed']) {
        for (let i = 0; i < res['unsubscribed'].length; i++) {

            let topic = res['unsubscribed'][i][0];
            let id = res['unsubscribed'][i][1];

            if (topic_dcs[topic]) {
                console.warn('Closing local read DC '+topic);
                topic_dcs[topic].close();
                delete topic_dcs[topic];
            }

            if (topic_video_tracks[topic]) {

                console.warn('Pausing video track for '+topic);

                // topic_video_tracks[topic].stop();

                // topic_media_streams[topic].removeTrack(topic_video_tracks[topic]);

                const elements = document.querySelectorAll(`[srcObject="${topic_media_streams[topic].id}"]`);
                elements.forEach(element => {
                    element.srcObject = null;
                });
                //pc.removeTrack(topic_transceivers[topic].receiver);
                //topic_video_tracks[topic].stop();
                //delete topic_video_tracks[topic];
            }
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

function TogglePanel(topic, state, w, h, x = null, y = null, src_visible = false) {
    let panel = panels[topic];
    if (state) {
        if (!panel) {
            panel = new Panel(topic, topics[topic] ? topics[topic].msg_types : null, w, h, x, y, src_visible);
            panels[topic] = panel;
        }
    } else if (panel) {
        panel.Close();
        delete panels[topic];
    }

    //UpdateUrlHash();
}

function UpdateUrlHash() {
    let hash = [];

    //console.log('Hash for :', $('#grid-stack').children('.grid-stack-item'));

    $('#grid-stack').children('.grid-stack-item').each(function () {
        widget = this;
        let x = $(widget).attr('gs-x');
        let y = $(widget).attr('gs-y');
        let w = $(widget).attr('gs-w');
        let h = $(widget).attr('gs-h');
        let topic = $(widget).find('.monitor_panel').attr('data-topic');
        let topicBits = [
            topic,
            [x, y].join('x'),
            [w, h].join('x'),
        ];
        let source_visible = $(widget).find('.panel_content').hasClass('enabled');
        if (source_visible)
            topicBits.push('src');
        hash.push(topicBits.join(':'));
    });

    if (hash.length > 0)
        window.location.hash = ''+hash.join(';');
    else //remove hash
        history.pushState("", document.title, window.location.pathname+window.location.search);
}
