# Firefox Issues
Last tested v119, Oct 30 2023

TL;DR: Use something else for optimal experience

## Partial ICE Restart
When video stream is closed or subscription otherwise modified, peer connection fails complaining about partial ICE restart. This is not yet supported by Firefox. The problem often occurs on page load, when some panels are already open and the subscription is subsequently altered.
https://bugzilla.mozilla.org/show_bug.cgi?id=1268533

## Permissions
In order to open WebRTC connection with incoming streams, camera permission needs to be granted by the user for some reason, despite the fact user's camera is not being accessed at all. On top of that, Firefox's permission API doesn't seem to have a way to ask for this permisssion without actually starting the camera.
As a workaround, in **about:config**, set **permissions.default.camera** to 1 to make this work.
https://stackoverflow.com/questions/53147944/firefox-permission-name-member-of-permissiondescriptor-camera-is-not-a-vali