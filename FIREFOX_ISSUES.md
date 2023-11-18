# Firefox Issues
Last tested v119, Oct 30 2023

TL;DR: Use any other browser for optimal experience

## Partial ICE Restarts
When video stream is closed or data channel subscriptions otherwise modified (new channels subscribed, unsubscribed, etc), the peer connection in FF fails complaining about "partial ICE restart". This behaviour is not implemented properly by Firefox. The problem often occurs on page load, when some panels are already open and the subscription is subsequently altered. 
https://bugzilla.mozilla.org/show_bug.cgi?id=1268533

## Camera Permissions
In order to open a WebRTC connection with incoming streams, camera permission needs to be granted by the user for some reason, despite the fact this camera is not being used for anything. On top of that, Firefox's permission API doesn't have any way to request this permisssion other than actually starting the camera. We will not be doing that here.
As a workaround, you can set **permissions.default.camera** to **1** to in your **about:config**. 
https://stackoverflow.com/questions/53147944/firefox-permission-name-member-of-permissiondescriptor-camera-is-not-a-vali