FROM ubuntu:latest

RUN apt-get update -y --fix-missing
RUN apt-get install -y  ssh \
                        vim mc \
                        iputils-ping net-tools iproute2 curl

# Node from NodeSource
RUN apt-get install -y ca-certificates curl gnupg
RUN  mkdir -p /etc/apt/keyrings
RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg

ENV NODE_MAJOR 18
RUN echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list

RUN apt-get update
RUN apt-get install nodejs -y

# Mongo
# RUN curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
# RUN echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | tee /etc/apt/sources.list.d/mongodb-org-7.0.list
# RUN apt-get update
# RUN apt-get install -y mongodb-org


ENV PHNTM_WS /phntm_cloud_bridge

# RUN mkdir -p $PHNTM_WS

# RUN --mount=type=bind,rw=true,source=./phntm_cloud_bridge,target=$PHNTM_WS \
#         . /root/.bashrc && \
#         cd $PHNTM_WS && npm install

# use changes to package.json to force Docker not to use the cache
# when we change our application's nodejs dependencies:
# COPY ./phntm_cloud_bridge/package.json /tmp/package.json
# RUN cd /tmp && npm install -g

WORKDIR /

RUN --mount=type=bind,source=./cloud_bridge,target=$PHNTM_WS \
        cd $PHNTM_WS && npm install -g

WORKDIR $PHNTM_WS

# From here we load our application's code in, therefore the previous docker
# "layer" thats been cached will be used if possible
# WORKDIR $PHNTM_WS
# COPY . /opt/app

# RUN . install/local_setup.bash
# RUN ros2 run phntm_bridge phntm_bridge

# pimp up prompt with hostame and color
RUN echo "PS1='\${debian_chroot:+(\$debian_chroot)}\\[\\033[01;35m\\]\\u@\\h\\[\\033[00m\\] \\[\\033[01;34m\\]\\w\\[\\033[00m\\] 🌈 '"  >> /root/.bashrc

# ENTRYPOINT ["/ros_entrypoint.sh"]
CMD [ "bash" ]
