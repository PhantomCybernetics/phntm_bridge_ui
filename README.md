# Phantom Bridge UI

This package contains web UI for the Phantom Bridge and a web server to serve it.

The web server itself does not connect to anything, it merely servers semi-static HTML and JavaScript to users. The UI in the web browser establishes connection to Cloud Bridge via Socket.io, and to the Bridge node on a robot via WebRTC p2p connection.

You can fork this repository and host it yourself to customize the default UI provided. The configuration file specifies which Cloud Bridge server shall the client connect to.

# Install Bridge UI Server

### Install Docker & Docker Compose
```
sudo apt install docker docker-buildx docker-compose-v2
```

### Build Docker Image
```
cd ~
wget https://raw.githubusercontent.com/PhantomCybernetics/bridge_ui/main/Dockerfile -O phntm-bridge-ui.Dockerfile
docker build -f phntm-bridge-ui.Dockerfile -t phntm/bridge-ui:latest .
```

### Create config.jsonc (see more below):
```
wget https://raw.githubusercontent.com/PhantomCybernetics/bridge_ui/main/config.example.jsonc -O config.jsonc
```

### Register new App on Cloud Bridge
To Phantom Bridge this UI is an App, individual browser clients running it are its instances. An app needs to register with the Cloud Bridge server it intends to use first. The following link will return a new appId/appKey pair, put these in your config.jsonc:
[https://bridge.phntm.io:1337/app/register](https://bridge.phntm.io:1337/app/register)

### Add service to compose.yaml:
Add phntm_bridge_ui service to your compose.yaml file with config.jsonc mapped to /phntm_bridge_ui/config.jsonc and ssl certificates folder exposed:
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
      - ~config.jsonc:/phntm_bridge_ui/config.jsonc
    command:
      /bin/sh /phntm_bridge_ui/run.web-ui.sh
```
### Launch:
```
docker compose up phntm_bridge_ui
```

# Dev Mode
Dev mode mapps live git repo on the host machine to the container so that you can make changes more conventinetly.
```
cd ~
git clone git@github.com:PhantomCybernetics/bridge_ui.git bridge_ui
```

Update your compose.yaml like so:
```
services:
  phntm_bridge_ui:
    volumes:
      - ~/bridge_ui:/phntm_bridge_ui
    command:
      /bin/sh -c "while sleep 1000; do :; done"
```

Launch server manually for better control:
```
docker compose up phntm_bridge_ui -d
docker exec -it phntm-bridge-ui bash
npm install # necessary on the first run from new source!
./run.web-ui.sh
```

# Config.jsonc
**ssl**: certificates need to be exposed to the docker container (Use certbot or the ssl/gen.sh script for self signed dev certificates)  
**port**: where the UI is available (443)  
**host**: host name of the ui server (https://bridge.phntm.io)  
**url**: base address of the ui (/)  
**msgTypesDir**: .idl files are searched here  
**msgTypesJsonFile**: .json message definitions are written here  
**bridgeSocketUrl**: Socket.io url and port on the Cloud Bridge where the client should connect to (https://bridge.phntm.io:1337)  
**appId**: unique app id received by Cloud Bridge on app registration  
**appKey**: revokeable app key  

# Custom ROS Message Types
When starting, the UI server looks for .idl files in msgTypesDir (static/msg_types/grp_name/*.idl) and generates a JSON definition into a single .json file (static/msg_types.json) that the clients' web browsers then fetch. If you want to add support for ROS message types, just add add new .idl to the source folder, restart the UI server and reload web browser.

Neither the Cloud Bridge nor the Bridge UI Server use these definitions themselves in any way. They are used in the web browser to serialize and deserialzie binary ROS messages. Unsupported message types will be ignored by the client by default; topics and services are discovered regardless.

# Input and Controls
This web UI enables you to connect a gamepad or use keyboard to generate standard ROS messages such as sensor_msgs/msg/Joy or geometry_msgs/msg/Twist. This enables to control a robot remotely with easy configuration in the web browser.

See Input and Controls for details.

# Customizing This UI
The UI is meant to be customized and extended. src/robot_ui.html is the best place to start. It uses PhntmBridgeClient (static/client.js) to facilitate the connection to both Robot and Cloud Bridge.

See Customizing the UI



