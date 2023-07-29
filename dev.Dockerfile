FROM ubuntu:latest

RUN apt-get update -y --fix-missing
RUN apt-get install -y  ssh \
                        vim mc \
                        iputils-ping net-tools iproute2 curl

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
ENV apt-get update -y --fix-missing

RUN apt-get install -y  nodejs
                        # npm
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

RUN --mount=type=bind,source=./phntm_cloud_bridge,target=$PHNTM_WS \
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