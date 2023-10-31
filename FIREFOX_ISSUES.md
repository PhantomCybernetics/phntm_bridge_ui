# Firefox Issues
Last tested v119, Oct 30 2023

## Permissions
In order to open WebRTC connection with incoming streams, camera permission needs to be granted by the user for some reason. On top of that, Firefox's permission API doesn't seem to have a way to ask for this permisssion without actually starting the camera. In about:config, set permissions.default.camera to 1 to make this work.
https://stackoverflow.com/questions/53147944/firefox-permission-name-member-of-permissiondescriptor-camera-is-not-a-vali

## ICE Servers & Gathering
Firefox takes about ~11s to finish the initial ICE gathering.

## Partial ICE Restart
When video stream is closed or subscription modified, peer connection fails complaining about partial ICE restart, which is not yet supported in Firefox. This problem also occurs on page load, when panels are open, and the subscription is later altered.