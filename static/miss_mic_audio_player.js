(function () {
  class MissMicAudioPlayer {
    constructor(options = {}) {
      this.defaultSampleRate = options.defaultSampleRate || 44100;
      this.defaultChannels = options.defaultChannels || 1;
      this.maxQueueChunks = options.maxQueueChunks || 120;
      this.gainValue = options.gain ?? 1.0;

      this.audioContext = null;
      this.gainNode = null;
      this.nextPlaybackTime = 0;
      this.started = false;
      this.channels = this.defaultChannels;
      this.sampleRate = this.defaultSampleRate;

      this.robot = null;
      this.boundReadAudioHandler = null;
      this.boundPeerHandler = null;
      this.boundDisconnectHandler = null;

      this.channelConfigs = new Map(); // topic -> channelConfig
      this.activeChannels = new Map(); // topic -> { queue, droppedChunks, dc, dc_id }
    }

    async startAudio() {
      if (!this.audioContext) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
          throw new Error("WebAudio API não suportada no navegador.");
        }

        this.audioContext = new AudioCtx();
        this.gainNode = this.audioContext.createGain();
        this.gainNode.gain.value = this.gainValue;
        this.gainNode.connect(this.audioContext.destination);
      }

      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.started = true;
      if (this.nextPlaybackTime < this.audioContext.currentTime) {
        this.nextPlaybackTime = this.audioContext.currentTime + 0.02;
      }

      this.flushAllQueues();
    }

    stopAudio() {
      this.started = false;
      this.nextPlaybackTime = this.audioContext ? this.audioContext.currentTime : 0;
    }

    setGain(value) {
      this.gainValue = value;
      if (this.gainNode) {
        this.gainNode.gain.value = value;
      }
    }

    attachEnableButton(options = {}) {
      const buttonId = options.id || "miss-mic-audio-enable";
      let button = document.getElementById(buttonId);
      if (!button) {
        button = document.createElement("button");
        button.id = buttonId;
        button.type = "button";
        button.textContent = options.text || "Ativar áudio";
        button.style.position = "fixed";
        button.style.right = "16px";
        button.style.bottom = "16px";
        button.style.zIndex = "2147483647";
        button.style.padding = "10px 14px";
        button.style.border = "none";
        button.style.borderRadius = "8px";
        button.style.background = "#2563eb";
        button.style.color = "#fff";
        button.style.fontSize = "14px";
        button.style.cursor = "pointer";
        button.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
        document.body.appendChild(button);
      }

      const updateLabel = () => {
        if (!this.audioContext || this.audioContext.state !== "running") {
          button.textContent = options.text || "Ativar áudio";
        } else {
          button.textContent = options.activeText || "Áudio ativo";
        }
      };

      button.addEventListener("click", async () => {
        try {
          await this.startAudio();
          updateLabel();
        } catch (err) {
          console.error("[miss_mic_audio] Falha ao ativar áudio:", err);
        }
      });

      updateLabel();
      return button;
    }

    bindToRobot(robot, options = {}) {
      if (!robot) {
        return;
      }

      this.robot = robot;

      if (options.autoButton !== false) {
        this.attachEnableButton(options.button || {});
      }

        if (this.boundReadAudioHandler) {
          robot.off?.("read_audio_channels", this.boundReadAudioHandler);
        }
        if (this.boundPeerHandler) {
          robot.off?.("peer_connected", this.boundPeerHandler);
          robot.off?.("peer_connection_changed", this.boundPeerHandler);
        }
        if (this.boundDisconnectHandler) {
          robot.off?.("peer_disconnected", this.boundDisconnectHandler);
        }

        this.boundReadAudioHandler = (channels) => {
          this.handleReadAudioChannels(channels);
      };
      this.boundPeerHandler = () => this.attachPendingChannels();
      this.boundDisconnectHandler = () => this.stopAudio();

        robot.on("read_audio_channels", this.boundReadAudioHandler);
        robot.on("peer_connected", this.boundPeerHandler);
        robot.on("peer_connection_changed", this.boundPeerHandler);
        robot.on("peer_disconnected", this.boundDisconnectHandler);

      if (robot.read_audio_channels && robot.read_audio_channels.length) {
        this.handleReadAudioChannels(robot.read_audio_channels);
      }

      this.attachPendingChannels();
    }

    parseAudioConfig(channelConfig) {
      const sampleRate = Number(channelConfig[3]) || this.defaultSampleRate;
      const channels = Number(channelConfig[4]) || this.defaultChannels;
      return { sampleRate, channels };
    }

    handleReadAudioChannels(channels) {
      if (!Array.isArray(channels)) {
        return;
      }

      channels.forEach((channelConfig) => {
        const topic = channelConfig && channelConfig[0];
        const dcId = channelConfig && Number(channelConfig[1]);

        if (!topic) {
          return;
        }

        if (dcId) {
          this.channelConfigs.set(topic, channelConfig);
        } else {
          this.channelConfigs.delete(topic);
          this.closeTopic(topic);
          return;
        }
      });

      this.attachPendingChannels();
    }

    attachPendingChannels() {
      if (!this.robot || !this.robot.pc || this.robot.pc.connectionState === "closed") {
        return;
      }

      for (const [topic, channelConfig] of this.channelConfigs.entries()) {
        const dcId = Number(channelConfig[1]);
        if (!dcId) {
          continue;
        }

        const active = this.activeChannels.get(topic);
        if (active && active.dc_id === dcId && active.dc) {
          continue;
        }

        this.createNegotiatedAudioChannel(this.robot.pc, channelConfig);
      }
    }

    createNegotiatedAudioChannel(peerConnection, channelConfig) {
      const topic = channelConfig[0];
      const id = Number(channelConfig[1]);
      const protocol = "audio/pcm_s16le";

      const existing = this.activeChannels.get(topic);
      if (existing && existing.dc_id === id && existing.dc) {
        return existing.dc;
      }

      const dc = peerConnection.createDataChannel(topic, {
        negotiated: true,
        id,
        ordered: false,
        maxRetransmits: 0,
        protocol,
      });

      const format = this.parseAudioConfig(channelConfig);
      this.registerDataChannel(topic, dc, format.sampleRate, format.channels, id);
      return dc;
    }

    registerDataChannel(topic, dataChannel, sampleRate = this.defaultSampleRate, channels = this.defaultChannels, dc_id = null) {
      this.sampleRate = sampleRate;
      this.channels = channels;

      const state = this.activeChannels.get(topic) || {
        queue: [],
        droppedChunks: 0,
        dc: null,
        dc_id: null,
      };
      state.dc = dataChannel;
      state.dc_id = dc_id;
      this.activeChannels.set(topic, state);

      dataChannel.binaryType = "arraybuffer";
      dataChannel.onmessage = async (event) => {
        if (!this.started) {
          try {
            await this.startAudio();
          } catch (err) {
            console.error("[miss_mic_audio] Falha ao iniciar áudio:", err);
            return;
          }
        }

        const payload = await this.toArrayBuffer(event.data);
        if (!payload) {
          return;
        }

        if (state.queue.length >= this.maxQueueChunks) {
          state.queue.shift();
          state.droppedChunks++;
        }
        state.queue.push(payload);
        this.flushQueue(topic);
      };

      dataChannel.onclose = () => {
        const current = this.activeChannels.get(topic);
        if (current && current.dc === dataChannel) {
          this.activeChannels.delete(topic);
        }
      };

      dataChannel.onerror = (err) => {
        console.error("[miss_mic_audio] Erro no canal de áudio", topic, err);
      };
    }

    closeTopic(topic) {
      const state = this.activeChannels.get(topic);
      if (!state) {
        return;
      }

      if (state.dc && state.dc.readyState !== "closed") {
        try {
          state.dc.close();
        } catch (err) {
          console.warn("[miss_mic_audio] Falha ao fechar canal", topic, err);
        }
      }
      this.activeChannels.delete(topic);
    }

    flushAllQueues() {
      for (const topic of this.activeChannels.keys()) {
        this.flushQueue(topic);
      }
    }

    flushQueue(topic) {
      if (!this.audioContext || !this.started) {
        return;
      }

      const state = this.activeChannels.get(topic);
      if (!state) {
        return;
      }

      while (state.queue.length > 0) {
        const chunk = state.queue.shift();
        this.schedulePcmChunk(chunk, this.sampleRate, this.channels);
      }
    }

    schedulePcmChunk(arrayBuffer, sampleRate, channels) {
      const int16 = new Int16Array(arrayBuffer);
      if (int16.length === 0) {
        return;
      }

      const frameCount = Math.floor(int16.length / channels);
      if (frameCount <= 0) {
        return;
      }

      const audioBuffer = this.audioContext.createBuffer(channels, frameCount, sampleRate);

      for (let ch = 0; ch < channels; ch++) {
        const channelData = audioBuffer.getChannelData(ch);
        let srcIndex = ch;
        for (let i = 0; i < frameCount; i++, srcIndex += channels) {
          channelData[i] = int16[srcIndex] / 32768.0;
        }
      }

      const src = this.audioContext.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(this.gainNode);

      const now = this.audioContext.currentTime;
      if (this.nextPlaybackTime < now - 0.1) {
        this.nextPlaybackTime = now + 0.02;
      }

      src.start(this.nextPlaybackTime);
      this.nextPlaybackTime += audioBuffer.duration;
    }

    async toArrayBuffer(data) {
      if (!data) {
        return null;
      }
      if (data instanceof ArrayBuffer) {
        return data;
      }
      if (ArrayBuffer.isView(data)) {
        return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
      }
      if (data instanceof Blob) {
        return await data.arrayBuffer();
      }
      console.warn("[miss_mic_audio] Formato de payload não suportado:", typeof data);
      return null;
    }
  }

  window.MissMicAudioPlayer = MissMicAudioPlayer;
  window.__MISS_MIC_AUDIO_PLAYER__ = window.__MISS_MIC_AUDIO_PLAYER__ || new MissMicAudioPlayer();
})();