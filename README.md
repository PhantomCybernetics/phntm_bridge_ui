# Phantom Bridge UI

This server hosts Web UI for the Phantom Bridge. It needs to be hosted on a public IP or where users can reach it inside a private network.

The itself server does not connect to anything, it only servers HTML and JavaScript to users web browser, which then connects to Cloud Bridge server via Socket.io and to a robot via WebRTC.

### Install Docker & Compose
```
sudo apt install docker docker-buildx docker-compose-v2
```

## Install Bridge UI Server
### Dev mode
```
cd ~
git clone git@github.com:PhantomCybernetics/bridge_ui.git bridge_ui
docker build -f bridge_ui/Dockerfile -t phntm/bridge-ui:latest .
```

Make config.jsonc (see more below):
```
cp bridge_ui/config.example.jsonc bridge_ui/config.jsonc
```

Add phntm_bridge_ui service to your compose.yaml file with ~/bridge_ui mounted in the container, overwriting /phntm_bridge_ui:
```
services:
  phntm_bridge_ui:
    image: phntm/bridge-ui:latest
    container_name: phntm-bridge-ui
    hostname: phntm-bridge-ui.local
    restart: unless-stopped
    privileged: true
    environment:
      - TERM=xterm
    ports:
      - 443:443
    volumes:
      - ~/bridge_ui/ssl:/ssl
      - ~/bridge_ui:/phntm_bridge_ui
    command:
      /bin/sh -c "while sleep 1000; do :; done"
```

Run:
```
docker compose up phntm_bridge_ui -d
docker exec -it phntm-bridge-ui bash
npm install # on first run
./run.web-ui.sh
```

### Production mode
```
cd ~
wget https://raw.githubusercontent.com/PhantomCybernetics/bridge_ui/main/Dockerfile -O phntm-bridge-ui.Dockerfile
docker build -f phntm-bridge-ui.Dockerfile -t phntm/bridge-ui:latest .
```

Make config.jsonc (see more below):
```
wget https://raw.githubusercontent.com/PhantomCybernetics/bridge_ui/main/config.example.jsonc -O bridge_ui.config.jsonc
```

Add phntm_bridge_ui service to your compose.yaml file with congig.jsonc remapped:
```
services:
  phntm_bridge_ui:
    image: phntm/bridge-ui:latest
    container_name: phntm-bridge-ui
    hostname: phntm-bridge-ui.local
    restart: unless-stopped
    privileged: true
    environment:
      - TERM=xterm
    ports:
      - 443:443
    volumes:
      - /etc/letsencrypt:/ssl
      - ~bridge_ui.config.jsonc:/phntm_bridge_ui/config.jsonc
    command:
      /bin/sh /phntm_bridge_ui/run.web-ui.sh
```
Run:
```
docker compose up phntm_bridge_ui -d
```

## Edit config.jsonc
ssl: certificates cerificates need to me mounted in the docker (Use certbot or the ssl/gen.sh script for self signed dev certificates)
port: where the UI is available (443)
host: host name of the ui server (https://bridge.phntm.io)
url: address of the ui (/)
msgTypesDir: .idl files are searched here
msgTypesJsonFile: .json message definitions written here
bridgeSocketUrl: Socket.io url and port of the Cloud Bridge the client will
connect to (https://bridge.phntm.io:1337)
appId: unique app id (this UI server is an app)
appKey: revokeable app key

## Register New App
To Bridge this UI is an app, individual instances in users' web browsers are an app instance. New app needs an AppId and an appKey. The following link will generate a new pair:
```
https://bridge.phntm.io:1337/app/register

# retuns json::
# {
#    "appId": "65372a11132641f870a0fc58",
#    "appKey": "65372a11132641f870a0fc57"
# }
```
Put these in your bridge_ui/config.jsonc

## Custom ROS Message Types
The UI server looks for .idl files in msgTypesDir (static/msg_types/grp_name/*.idl) and generates a JSON definition into a single .json file (static/msg_types.json) that the cliet's web browser fetch. If you want to add new supported message types, add them to the source folder, restart the UI server and reload browser.

Neither the Cloud Bridge nor the Bridge UI Server need these definitions. The UI server generates these for the web client. Unsupported message types can not be deserialzied by the browser; topics and services are discovered regardless.

# Input and Controls
The web UI enables to connect a gamepad or use keyboard to generate standard ROS messages such as sensor_msgs/msg/Joy or geometry_msgs/msg/Twist. This enables to control a robot remotely, some configuration might be necessary in the web browser.

See Input and Controls for details.

## Customizing the UI
The UI is meant to be customized and extended. src/robot_ui.html is the best place to start. It uses PhntmBridgeClient (static/client.js) to facilitate the connection to both Robot and Cloud Bridge.

See Customizing the UI



