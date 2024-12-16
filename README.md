# Phantom Bridge UI

This package contains web UI for the Phantom Bridge and a web server to serve it.

The web server itself does not connect to anything, it merely servers semi-static HTML and JavaScript to users. The UI in the web browser establishes connection to Cloud Bridge via Socket.io, and to the Bridge node on a robot via WebRTC P2P connection.

You can fork this repository and host it yourself to customize the default UI provided. The configuration file specifies which Cloud Bridge server shall the client connect to.

![Infrastructure map](https://raw.githubusercontent.com/PhantomCybernetics/phntm_bridge_docs/refs/heads/main/img/Architecture_UI_Server.png)

# Install Bridge UI Server

### Install Node.js & Npm
Last tested v18.20.5
```bash
sudo apt install nodejs npm
```

### Clone this repo and install Node dependencies
```bash
cd ~
git clone git@github.com:PhantomCybernetics/bridge_ui.git bridge_ui
cd bridge_ui
npm install
```

### Register a new App on the Cloud Bridge
To Phantom Bridge, this UI represents an app, individual browser clients running web ui are considered app instances. New app needs to register with the Cloud Bridge server it intends to use. The following link will return a new appId/appKey pair, put these in your config.jsonc below.
[https://bridge.phntm.io:1337/app/register](https://bridge.phntm.io:1337/app/register)

### Create config file
Create new config file e.g. `~/bridge_ui/config.jsonc` and paste:
```jsonc
{
    "dieOnException": true,

    "WEB_UI": {
        "ssl": {
            // use certbot or the ssl/gen.sh script for self signed dev certificates
            "private": "/your_ssl_dir/privkey.pem",
            "public": "/your_ssl_dir/fullchain.pem"
        },
        
        "port": 443, 
        "host": "https://bridge.phntm.io",
        "url": "/", // base address of the UI (ID_ROBOT will be appended) 

        // address where robot's Cloud Bridge instance will be requested
        "bridgeLocateUrl": "https://register.phntm.io/locate",
        
        "bridgeSocketPort": 1337, // Cloud Bridge port for Socket.io
        "bridgeFilesPort": 1338, // Cloud Bridge port for file requests

        // app credentials generated upon registration on Cloud Bridge
        "appId": "APP_ID",
        "appKey": "APP_KEY",
        "name": "Phntm Bridge Web UI",

        // lines of an analytics tracker code to be appended to HTML
        "analyticsCode": []
    }
}
```

### Add system service to your systemd
```bash
sudo vim /etc/systemd/system/phntm_bridge_ui.service
```
...and paste:
```
[Unit]
Description=phntm bridge_ui service
After=network.target

[Service]
ExecStart=/home/ubuntu/bridge_ui/run.web-ui.sh
Restart=always
User=root
Environment=NODE_ENV=production
WorkingDirectory=/home/ubuntu/bridge_ui/
StandardOutput=append:/var/log/bridge_ui.log
StandardError=append:/var/log/bridge_ui.err.log

[Install]
WantedBy=multi-user.target
```
Reload systemctl daemon
```bash
sudo systemctl daemon-reload
```

### Launch:
```bash
sudo systemctl start phntm_bridge_ui.service
sudo systemctl enable phntm_bridge_ui.service # will launch on boot
```
