# Phantom Cloud Bridge

## Install Docker
```
sudo apt install docker docker-buildx docker-compose-v2
```

## Install MongoDB
```
sudo apt-get install gnupg curl
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod # run at boot
```

## Install Cloud Bridge
```
cd ~
git clone git@github.com:PhantomCybernetics/cloud_bridge.git
docker build -f cloud_bridge/dev.Dockerfile -t phntm/cloud-bridge:latest .
cp cloud_bridge/config.example.jsonc cloud_bridge/config.jsonc
# generate certificates with certbot, docker reads /etc/letsencrypt/
# edit links to ssl certs in config.jsonc
# edit admin login/pass in cofig.jsonc
```


## Run Bridge
```
docker compose -f cloud_bridge/dev.compose.yaml up phntm_cloud_bridge -d
```

## Run UI Server
```
docker compose -f cloud_bridge/dev.compose.yaml up phntm_bridge_ui -d
```




## Install TURN Server
```
sudo apt install coturn
```
