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
let pc = new RTCPeerConnection(config);


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

function ProcessRobotData(robot_data) {
    if (robot_data['err']) {
        $('#robot_info').html('Error connecting to robot...');
        return;
    }

    console.log('SIO got robot data', robot_data);

    if (robot_data['name'])
        $('#robot_name').html(robot_data['name']);

    let robot_online = robot_data['ip'] ? true : false;

    if (robot_online && (!pc || pc.connectionState != 'connected')) {
        WebRTC_Negotiate(robot_data['id_robot']);
    }

    $('#robot_info').html('ID: '+ robot_data['id_robot']
                            + ' @ '
                            + (robot_online ? '<span class="online">'+robot_data['ip']+'</span>':'<span class="offline">Offline</span>')+' '
                            + 'WebRTC: <span id="webrtc_status"></span> '
                            + 'Socket.io: <span id="socketio_status"></span>'
                            );

    SetWebRTCSatusLabel();
    SetSocketIOSatusLabel();
}

function WebRTC_Negotiate(id_robot)
{
    console.log('WebRTC negotiating... ');

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