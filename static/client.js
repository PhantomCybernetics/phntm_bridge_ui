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
    iceServers: [{urls: ['stun:stun.l.google.com:19302']}]
};

let supported_msg_types = null; //fetched static

let pc = null;
let pc_connected = false;

let grid = null;
let panels = {};
let topics = {} // str id => { msg_types: str[]}
let topic_dcs = {}; //str id => RTCDataChannel
let services = {}; // str id => { msg_type: str}

function InitPeerConnection(id_robot) {
    let pc_ = new RTCPeerConnection(config);

    pc_.addTransceiver('video', {direction: 'recvonly'});

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
        // if (evt.track.kind == 'video') {
        //     document.getElementById('video').srcObject = evt.streams[0];
        // } else {
        //     document.getElementById('audio').srcObject = evt.streams[0];
        // }
        console.log('New track added!', evt);
    });

    //let receiveChannel =
    pc_.createDataChannel('_ignore_'); //wouldn't otherwise open chanels (?)

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
        console.log('signalingstatechange', evt);

        switch (pc_.signalingState) {
            case "closed":
              console.warn('Peer connection closed');
              pc = null;
              break;
          }
    });

    pc_.addEventListener("connectionstatechange", (evt) => {
        console.log('connectionstatechange: ',  evt.currentTarget.connectionState);
        SetWebRTCSatusLabel()

        if (evt.currentTarget.connectionState == 'connected') {
            if (!pc_connected) {
                pc_connected = true;
                window.gamepadWriter.InitProducer()
                let panelTopics = Object.keys(panels);
                for (let i = 0; i < panelTopics.length; i++) {
                    let topic = panelTopics[i];
                    if (!topic_dcs[topic]) {
                        ToggleReadTopicSubscription(id_robot, topic, true);
                    }
                }
            }
        } else if (pc_connected) {
            pc_connected = false;
            window.gamepadWriter.ClearProducer();
        }
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
    if (pc)
        state = pc.connectionState

    if (state != null)
        state = state.charAt(0).toUpperCase() + state.slice(1);
    else
        state = 'n/a'

    if (state == 'Connected')
        $('#webrtc_status').html('<span class="online">'+state+'</span>');
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

    if (robot_data['name'])
        $('#robot_name').html(robot_data['name']);

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
            console.log('Setting remote answer:', answer);
            return pc.setRemoteDescription(answer);
        });
    });

}



function ToggleReadTopicSubscription(id_robot, topic, state) {
    console.warn((state ? 'Subscribing to read ' : 'Unsubscribing from reading ') + topic);

    let subscription_data = {
        id_robot: id_robot,
        topics: [ [ topic, state ? 1 : 0 ] ]
    };

    // toggle read subscription
    socket.emit('subcribe:read', subscription_data, (res) => {

        if (res['success']) {
            for (let i = 0; i < res['subscribed'].length; i++) {

                let topic = res['subscribed'][i][0];
                let id = res['subscribed'][i][1];

                if (topic_dcs[topic]) {
                    console.warn('Closing local read DC '+topic);
                    topic_dcs[topic].close();
                    delete topic_dcs[topic];
                }

                console.log('Opening local read DC '+topic+' id='+id)
                let dc = pc.createDataChannel(topic, {
                    negotiated: true,
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


            }

            for (let i = 0; i < res['unsubscribed'].length; i++) {

                let topic = res['unsubscribed'][i][0];
                let id = res['unsubscribed'][i][1];

                if (topic_dcs[topic]) {
                    console.warn('Closing local read DC '+topic);
                    topic_dcs[topic].close();
                    delete topic_dcs[topic];
                }
            }
        } else {
            console.warn('Read subscription err: ', res);

        }
    });
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


let capturing_gamepad_input = false;
let captured_gamepad_input = [];
let gamepad_service_mapping = {}
function CaptureGamepadInput(buttons, axes) {
    if (!capturing_gamepad_input) {
        return;
    }

    let something_pressed = false;
    for (let i = 0; i < buttons.length; i++) {
        if (buttons[i] && buttons[i].pressed) {
            something_pressed = true;
            if (captured_gamepad_input.indexOf(i) === -1) {
                captured_gamepad_input.push(i);
            }
        }
    }
    if (something_pressed) {
        for (let i = 0; i < captured_gamepad_input.length; i++) {
            let btn = captured_gamepad_input[i];
            if (!buttons[btn] || !buttons[btn].pressed) {
                captured_gamepad_input.splice(i, 1);
                i--;
            }
        }
    }

    $('#current-key').html(captured_gamepad_input.join(' + '));
}



function MapServiceButton(button) {

    let service_name = $(button).attr('data-service');
    let btn_name = $(button).attr('data-name');
    console.warn('Mapping '+service_name+' => ' + btn_name +' ...');

    $('#mapping-confirmation').attr('title', 'Mapping '+service_name+':'+btn_name);
    $('#mapping-confirmation').html('Press a gamepad button or combination...<br><br><span id="current-key"></span>');
    captured_gamepad_input = [];
    capturing_gamepad_input = true;
    $( "#mapping-confirmation" ).dialog({
        resizable: false,
        height: "auto",
        width: 400,
        modal: true,
        buttons: {
          Clear: function() {
            captured_gamepad_input = [];
            $('#current-key').html('');
            //$( this ).dialog( "close" );
          },
          Cancel: function() {
            capturing_gamepad_input = false;
            $( this ).dialog( "close" );
          },
          Save: function() {
            capturing_gamepad_input = false;
            if (!gamepad_service_mapping[service_name])
                gamepad_service_mapping[service_name] = {};
            if (!gamepad_service_mapping[service_name][btn_name])
                gamepad_service_mapping[service_name][btn_name] = { };

            gamepad_service_mapping[service_name][btn_name]['btns_cond'] = captured_gamepad_input;
            captured_gamepad_input = [];
            gamepad_service_mapping[service_name][btn_name]['needs_reset'] = false;

            console.log('Mapping saved: ', gamepad_service_mapping);
            $( this ).dialog( "close" );
            $('#service_controls.setting_shortcuts').removeClass('setting_shortcuts');
            $('#services_gamepad_mapping_toggle').html('[shortcuts]');
          }
        }
      });
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
    else
        window.location.hash = '';
}