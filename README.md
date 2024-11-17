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
git clone git@github.com:PhantomCybernetics/bridge_ui.git bridge_ui
cd bridge_ui
docker build -f Dockerfile -t phntm/bridge-ui:latest .
```

### Register new App on Cloud Bridge
To Phantom Bridge, this UI represents an app, individual browser clients running web ui are considered app instances. New app needs to register with the Cloud Bridge server it intends to use. The following link will return a new appId/appKey pair, put these in your config.jsonc below.
[https://bridge.phntm.io:1337/app/register](https://bridge.phntm.io:1337/app/register)

### Create Config File
Create new config file `vim ~/bridge_ui_config.jsonc` and paste:
```jsonc
{
    "dieOnException": true,
    "WEB_UI": {
        "ssl": {
            // certificates need to be exposed to the docker container
            // use certbot or the ssl/gen.sh script for self signed dev certificates
            "private": "/ssl/privkey.pem",
            "public": "/ssl/cert.pem"
        },
        
        "port": 443, 
        "host": "https://bridge.phntm.io",
        "url": "/", // base address of the ui (/ + ID_ROBOT) 

        // Cloud Bridge Socket.io where the client browsers should connect to
        "bridgeSocketUrl": "https://bridge.phntm.io:1337",

        // app credentials generated upon registration on Cloud Bridge
        "appId": "",
        "appKey": "",

        // lines of an analytics tracker code to append to HTML
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
```
docker compose up phntm_bridge_ui
```

