# Phantom Bridge UI

This package contains web UI for the Phantom Bridge and a web server to serve it.

The web server itself does not connect to anything, it merely servers semi-static HTML and JavaScript to users. The UI in the web browser establishes connection to Cloud Bridge via Socket.io, and to the Bridge node on a robot via WebRTC P2P connection.

You can fork this repository and host it yourself to customize the default UI provided. The configuration file specifies which Cloud Bridge server shall the client connect to.

![Infrastructure map](https://raw.githubusercontent.com/PhantomCybernetics/phntm_bridge_docs/refs/heads/main/img/Architecture_UI_Server.png)

# Install Bridge UI Server

### Install Docker & Docker Compose
```bash
sudo apt install docker docker-buildx docker-compose-v2
```
Then add the current user to the docker group:
```bash
sudo usermod -aG docker ${USER}
# log out & back in
```

### Clone this repo and build the Docker Image
```bash
cd ~
git clone git@github.com:PhantomCybernetics/bridge_ui.git bridge_ui
cd bridge_ui
docker build -f Dockerfile -t phntm/bridge-ui:latest .
```

### Register a new App on the Cloud Bridge
To Phantom Bridge, this UI represents an app, individual browser clients running web ui are considered app instances. New app needs to register with the Cloud Bridge server it intends to use. The following link will return a new appId/appKey pair, put these in your config.jsonc below.
[https://bridge.phntm.io:1337/app/register](https://bridge.phntm.io:1337/app/register)

### Create config file
Create new config file e.g. `~/bridge_ui_config.jsonc` and paste:
```jsonc
{
    "dieOnException": true,

    "WEB_UI": {
        "ssl": {
            // certificates need to be exposed to the docker container
            // use certbot or the ssl/gen.sh script for self signed dev certificates
            "private": "/ssl/privkey.pem",
            "public": "/ssl/fullchain.pem"
        },
        
        "port": 443, 
        "host": "https://bridge.phntm.io",
        "url": "/", // base address of the UI (ID_ROBOT will be appended) 

        // Cloud Bridge Socket.io where the client browsers should connect to
        "bridgeSocketUrl": "https://bridge.phntm.io:1337",

        // app credentials generated upon registration on Cloud Bridge
        "appId": "APP_ID",
        "appKey": "APP_KEY",
        "name": "Phntm Bridge Web UI"

        // lines of an analytics tracker code to be appended to HTML
        "analyticsCode": []
    }
}
```

### Add service to your compose.yaml
Add phntm_bridge_ui service to your compose.yaml file with config.jsonc mapped to /phntm_bridge_ui/config.jsonc and ssl certificates folder exposed:
```yaml
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
      - ~/bridge_ui_config.jsonc:/phntm_bridge_ui/config.jsonc
    command:
      /bin/sh /phntm_bridge_ui/run.web-ui.sh
```
### Launch:
```bash
docker compose up phntm_bridge_ui
```

