# Phantom Bridge UI

This package contains web UI for the Phantom Bridge and a web server to serve it.

The web server itself does not connect to anything, it merely servers semi-static HTML and JavaScript to users. The UI in the web browser establishes connection to Bridge Server via Socket.io, and to the Bridge Client node on a robot via WebRTC P2P connection.

You can fork this repository and host it yourself to customize the default UI provided. The configuration file specifies which Bridge Server shall the client connect to.

![Infrastructure map](https://raw.githubusercontent.com/PhantomCybernetics/phntm_bridge_docs/refs/heads/main/img/Architecture_UI.svg)

# Install Bridge UI

### Install Bun

Follow [instructions from bun.sh](https://bun.sh/docs/installation)

Last tested 1.2.18

### Clone this repo and install dependencies

```bash
cd ~
git clone git@github.com:PhantomCybernetics/phntm_bridge_ui.git phntm_bridge_ui
cd phntm_bridge_ui
bun install
```

### Register a new App on the Bridge Server

To Phantom Bridge, this UI represents an app, individual browser clients running web ui are considered app instances. New app needs to register with the Bridge Server server it intends to use. The following link will return a new appId/appKey pair, put these in your config.jsonc below.
[https://register.phntm.io/app](https://register.phntm.io/app)

### Create config file

Create new config file e.g. `~/phntm_bridge_ui/config.jsonc`, use [./config.example.jsonc](./config.example.jsonc) as a starting point.

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
ExecStart=/home/ubuntu/phntm_bridge_ui/run.sh
Restart=always
User=root
Environment=NODE_ENV=production
WorkingDirectory=/home/ubuntu/phntm_bridge_ui/
StandardOutput=append:/var/log/phntm_bridge_ui.log
StandardError=append:/var/log/phntm_bridge_ui.err.log

[Install]
WantedBy=multi-user.target
```

Reload systemctl daemon

```bash
sudo systemctl daemon-reload
```

### Add Git safe directory for root
We read git commit and tags as root to display in the UI. The repo must be added to global safe.directory like this:

``` bash
sudo git config --global --add safe.directory /home/ubuntu/phntm_bridge_ui
```

### Launch

```bash
sudo systemctl start phntm_bridge_ui.service
sudo systemctl enable phntm_bridge_ui.service # will launch on boot
```




# Mudanças e adições na branch audio

## Resumo

Implementação de reprodução de áudio do tópico `/microphone_data` (audio_common_msgs/msg/AudioData) na interface web do robô. O sistema inclui:
- Reprodução de áudio PCM 16-bit 16kHz via WebAudio API
- Menu de seleção/deselecção de microfones idêntico ao padrão de câmeras
- Integração responsiva com o layout GridStack existente
- Suporte para modo hamburger (mobile) e desktop

**Status**: Funcional - Áudio operacional com UI limpa e sem elementos flutuantes

---

## Arquivos Modificados

### 1. **phntm_bridge_ui/static/browser-client.js**

Adicionada propagação de evento para canais de áudio quando dados do robô chegam.

**Modificações:**
- Adicionada propriedade `read_audio_channels = []` à classe BrowserClient
- Adicionado bloco de código no método `_processRobotData()`:

```javascript
if (robot_data["read_audio_channels"]) {
    this.read_audio_channels = robot_data["read_audio_channels"];
    this.emit("read_audio_channels", this.read_audio_channels);
}
```

**Propósito**: Expor para a UI a lista de canais de áudio disponíveis quando o robô envia dados

---

### 2. **phntm_bridge_ui/static/miss_mic_audio_player.js** (NOVO)

Novo arquivo completo com player de áudio em WebAudio API (362 linhas).

**Funcionalidades principais:**

#### Classe: `MissMicAudioPlayer`

**Propriedades:**
- `robot`: Instância do BrowserClient
- `audioContext`: Contexto de áudio do navegador
- `gainNode`: Nó de ganho para controle de volume
- `messageQueues`: Mapa de filas de audio por tópico
- `playbackSchedules`: Controle de timers de playback

**Métodos principais:**

1. **`startAudio()`**
   - Inicializa ou retoma o AudioContext
   - Trata contextos suspensos (security policy do navegador)
   - Reinicia reprodução se houver áudio em fila

2. **`stopAudio()`**
   - Suspende o AudioContext
   - Evita continuação de playback
   - Mantém filas intactas (não limpa dados)

3. **`bindToRobot(robot, options)`**
   - Conecta o player ao BrowserClient
   - Escuta evento `read_audio_channels`
   - Cria DataChannels para cada canal de áudio
   - Opções: `{autoButton: false}` (desabilita botão flutuante)

4. **`registerDataChannel(topic_id, datachannel)`**
   - Configura listeners para mensagens binárias
   - Inicializa fila para o tópico (limite 120 chunks)
   - Descarta chunks mais antigos se fila enche

5. **`schedulePcmChunk(topic_id, int16data)`**
   - Converte Int16 para Float32 (normalização por 32768)
   - Cria BufferSource
   - Agenda playback com timing preciso

6. **`flushQueue(topic_id)` / `flushAllQueues()`**
   - Reproduz todos os chunks em fila
   - Garante playback sequencial

7. **`closeTopic(topic_id)`**
   - Finaliza playback de um tópico específico
   - Limpa DataChannel e fila

**Parâmetros de Áudio:**
- **Formato**: PCM 16-bit signed little-endian
- **Taxa de amostragem**: 44.100 Hz (44100 Hz)
- **Canais**: 1 (mono)
- **Volume padrão**: 1.0 (100%)

**Validações:**
- Bun bundler: ✅ 10.59 KB
- Sem erros de sintaxe

---

### 3. **phntm_bridge_ui/src/views/robot_ui.html**

Adicionadas seção de controles de microfone e binding do player.

**Adições:**

#### a) Script loader (antes de `</head>`)
```html
<script src="/static/miss_mic_audio_player.js"></script>
```

#### b) Seção de controles de microfone (no menu, após câmeras)
```html
<div id="microphone_controls">
    <h3 id="microphones_heading">
        <b>0</b>
        <span class="full-w">Microphones</span>
        <span class="narrow-w narrower-w">Mic</span>
    </h3>
    <div id="microphones_list" data-min-width="350"></div>
</div>
```

#### c) Binding do player (no script de inicialização da UI)
```javascript
window.__MISS_MIC_AUDIO_PLAYER__ = new MissMicAudioPlayer();
window.__MISS_MIC_AUDIO_PLAYER__.bindToRobot(robot, {
    autoButton: false  // Desabilita criação de botão flutuante
});
```

**Estrutura:**
- H3 com contador e labels responsivos (full/narrow/narrower)
- Container vazio para lista dinâmica de checkboxes
- Styling integrado com GridStack

---

### 4. **phntm_bridge_ui/static/panel-ui.js**

Adicionada lógica completa de menu de microfones (75+ linhas).

**Adições:**

#### a) Propriedade de contador
```javascript
this.num_microphones = 0;
```

#### b) Trigger de atualização (no handler de `client.on("nodes")`)
```javascript
setTimeout(() => that.microphonesMenuFromNodes(), 0);
```

#### c) Função: `microphonesMenuFromNodes()`

**Lógica:**
1. Filtra publishers do nó por tipo `audio_common_msgs/msg/AudioData`
2. Conta microphones e atualiza counter
3. Gera HTML com checkbox para cada microfone
4. Vincula handler de mudança para subscribe/unsubscribe

**Handler de Change (checkbox):**
```javascript
mic_cb.change((ev) => {
    let state = $(ev.target).prop("checked");
    if (state) {
        that.client.createSubscriber(mic.src_id);
        if (window.__MISS_MIC_AUDIO_PLAYER__) {
            window.__MISS_MIC_AUDIO_PLAYER__.startAudio();
        }
    } else {
        that.client.removeSubscriber(mic.src_id);
        if (window.__MISS_MIC_AUDIO_PLAYER__) {
            window.__MISS_MIC_AUDIO_PLAYER__.closeTopic(mic.src_id);
            window.__MISS_MIC_AUDIO_PLAYER__.stopAudio();
        }
    }
    if (state && $("BODY").hasClass("hamburger")) {
        that.setBurgerMenuState(false, false);
    }
});
```

**Ações por checkbox:**
- **Marcar**: Subscribe ao tópico + inicia áudio
- **Desmarcar**: Unsubscribe + fecha tópico no player + para áudio
- **Mobile**: Fecha menu hamburger após seleção

#### d) Configurações de layout (objeto `menu_item_widths`)
```javascript
microphone_controls: {
    full: 115,
    narrow: 70,
    narrower: 70
}
```

#### e) Label em modo hamburger
```javascript
if ($("BODY").hasClass("hamburger")) {
    // Label: "N Microphones"
}
```

---

### 5. **phntm_bridge_ui/static/styles.css**

Adicionadas 22 regras CSS para estilização completa (covers both desktop e hamburger mode).

**Adições principais:**

#### a) Estilos base
```css
#microphone_controls {
    background-color: #1f7a66;
    position: relative;
    display: flex;
    flex-direction: column;
}

#microphones_heading {
    color: #fff;
    cursor: pointer;
    padding: 10px 15px;
    margin: 0;
    background-color: #1f7a66;
    border-bottom: 1px solid #0f5d4d;
}
```

#### b) Modo Desktop (dropdown)
```css
#microphones_list {
    position: absolute;
    top: 100%;
    left: 0;
    background: #9ec65a;
    border-top: 3px solid #1f7a66;
    max-height: 520px;
    max-width: 420px;
    overflow-y: auto;
    display: none;
    z-index: 1000;
}

BODY.desktop-ui #microphones_list .camera:hover {
    background-color: #1f7a66;
    color: #fff;
}

BODY.top-menu #microphone_controls.active:hover #microphones_list {
    display: block;
}
```

#### c) Modo Hamburger (mobile)
```css
BODY.hamburger #menubar_items #microphones_heading {
    border-bottom: 1px solid #0f5d4d;
}

BODY.hamburger #menubar_items #microphones_list {
    max-height: 95px;
    max-width: unset;
    display: none;
}

BODY.hamburger #menubar_items #microphones_list.active {
    display: block;
    max-height: 95px;
}

BODY.hamburger #menubar_items #microphones_list LABEL.camera {
    height: 40px;
    padding-left: 30px;
    line-height: 22px;
}

BODY.hamburger #menubar_items #microphones_list .camera {
    border-bottom: 1px solid #0f5d4d;
}

BODY.hamburger #menubar_items #microphones_list .camera INPUT {
    position: absolute;
    left: 10px;
    top: 18px;
}
```

**Cores:**
- **Primária**: `#1f7a66` (teal - header/hover)
- **Secundária**: `#9ec65a` (verde claro - fundo dropdown, mesmo das câmeras)
- **Destaque**: `#0f5d4d` (teal escuro - borders)

**Diferenciação visual**: Microfones usam paleta teal (vs. câmeras em verde), permitindo distinção clara na UI.

---