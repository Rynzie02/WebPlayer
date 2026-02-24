    /********** VARIABILI GLOBALI & FUNZIONI PER PLAYER / CANALI **********/
    /*********************** Author: Bocaletto Luca ***********************/
    let hls; // Istanza globale per Hls.js
    const video = document.getElementById("videoPlayer");
    const spinner = document.getElementById("spinner");
    const channelsContainer = document.getElementById("channelsContainer");
    
    let channels = []; // Array degli elementi canale
    let currentSelectedIndex = -1;
    
    function showSpinner(show = true) {
      spinner.style.display = show ? "flex" : "none";
    }
    
    function playChannel(streamUrl) {
      console.log("Caricamento stream: " + streamUrl);
      showSpinner(true);
      
      if (hls) {
        hls.destroy();
        hls = null;
      }
      
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(streamUrl);
        hls.attachMedia(video);
        hls.once(Hls.Events.MANIFEST_PARSED, () => {
          video.play().then(() => {
            showSpinner(false);
          }).catch(err => {
            console.error("Errore nel play:", err);
            showSpinner(false);
          });
        });
        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error("Errore HLS:", data);
          showSpinner(false);
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = streamUrl;
        video.play().then(() => {
          showSpinner(false);
        }).catch(err => {
          console.error("Errore nel play (nativo):", err);
          showSpinner(false);
        });
      } else {
        alert("Il tuo browser non supporta lo streaming HLS.");
        showSpinner(false);
      }
    }
    
    function parseChannelList(content) {
      const lines = content.split("\n");
      channelsContainer.innerHTML = "";
      channels = [];
      currentSelectedIndex = -1;
      let currentTitle = "";
      lines.forEach(line => {
        line = line.trim();
        if (!line) return;
        if (line.startsWith("#EXTINF")) {
          // Estrae il titolo dal testo dopo la virgola (fallback "Canale IPTV")
          const match = line.match(/,(.*)$/);
          currentTitle = match ? match[1].trim() : "Canale IPTV";
        } else if (line.startsWith("http")) {
          const streamUrl = line;
          const channelDiv = document.createElement("div");
          channelDiv.className = "channel";
          channelDiv.textContent = currentTitle;
          channelDiv.addEventListener("click", function() {
            playChannel(streamUrl);
            currentSelectedIndex = channels.indexOf(channelDiv);
            updateSelection();
          });
          channelsContainer.appendChild(channelDiv);
          channels.push(channelDiv);
        }
      });
    }
    
    
    function updateSelection() {
      channels.forEach((channel, index) => {
        if (index === currentSelectedIndex) {
          channel.classList.add("selected");
          channel.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          channel.classList.remove("selected");
        }
      });
    }
    
    /********** EVENTI DA TASTIERA **********/
    document.addEventListener("keydown", function(e) {
      // Navigazione nella lista dei canali
      if (channels.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          currentSelectedIndex = (currentSelectedIndex + 1) % channels.length;
          updateSelection();
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          currentSelectedIndex = (currentSelectedIndex - 1 + channels.length) % channels.length;
          updateSelection();
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          if (currentSelectedIndex >= 0 && currentSelectedIndex < channels.length) {
            channels[currentSelectedIndex].click();
          }
          return;
        }
      }
      
      // Controlli del player via tastiera
      if (e.key === " ") { // Space per pausa/ripresa
         e.preventDefault();
         video.paused ? video.play() : video.pause();
      } else if (e.key === "+" || e.key === "=") { // Volume su
         e.preventDefault();
         video.volume = Math.min(video.volume + 0.1, 1);
      } else if (e.key === "-") { // Volume giù
         e.preventDefault();
         video.volume = Math.max(video.volume - 0.1, 0);
      } else if (e.key.toLowerCase() === "m") { // Toggle mute
         e.preventDefault();
         video.muted = !video.muted;
      } else if (e.key.toLowerCase() === "f") { // Fullscreen toggle
         e.preventDefault();
         if (!document.fullscreenElement) {
            video.requestFullscreen ? video.requestFullscreen() : (video.webkitRequestFullscreen && video.webkitRequestFullscreen());
         } else {
            document.exitFullscreen ? document.exitFullscreen() : (document.webkitExitFullscreen && document.webkitExitFullscreen());
         }
      } else if (e.key.toLowerCase() === "p") { // Picture-in-Picture toggle
         e.preventDefault();
         if (document.pictureInPictureElement) {
            document.exitPictureInPicture().catch(err => console.error(err));
         } else {
            video.requestPictureInPicture ? video.requestPictureInPicture().catch(err => console.error(err)) : null;
         }
      }
    });
    
    /********** SUPPORTO JOYPAD (CONTROLLER/TELECOMANDO) CON DEBOUNCE **********/
    const debounceDelay = 250;
    // Impostiamo un oggetto per il debounce degli eventi simulati
    const debounceTimes = {
      ArrowUp: 0,
      ArrowDown: 0,
      Enter: 0,
      " ": 0,
      m: 0,
      f: 0,
      p: 0,
      // Volume su e giù li gestiamo con i pulsanti RT e LT
      volUp: 0,
      volDown: 0
    };
    
    function simulateKeyEvent(key) {
      const event = new KeyboardEvent("keydown", { key: key, bubbles: true });
      document.dispatchEvent(event);
    }
    
    function pollGamepad() {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
      if (gamepads[0]) {
        const gp = gamepads[0];
        let now = Date.now();
        // D-Pad Up → ArrowUp
        if (gp.buttons[12] && gp.buttons[12].pressed) {
          if (now - debounceTimes["ArrowUp"] > debounceDelay) {
            simulateKeyEvent("ArrowUp");
            debounceTimes["ArrowUp"] = now;
          }
        }
        // D-Pad Down → ArrowDown
        if (gp.buttons[13] && gp.buttons[13].pressed) {
          if (now - debounceTimes["ArrowDown"] > debounceDelay) {
            simulateKeyEvent("ArrowDown");
            debounceTimes["ArrowDown"] = now;
          }
        }
        // A Button (indice 0) → Enter
        if (gp.buttons[0] && gp.buttons[0].pressed) {
          if (now - debounceTimes["Enter"] > debounceDelay) {
            simulateKeyEvent("Enter");
            debounceTimes["Enter"] = now;
          }
        }
        // B Button (indice 1) → Space (pausa/ripresa)
        if (gp.buttons[1] && gp.buttons[1].pressed) {
          if (now - debounceTimes[" "] > debounceDelay) {
            simulateKeyEvent(" ");
            debounceTimes[" "] = now;
          }
        }
        // LT (indice 6) → "-" (Volume giù)
        if (gp.buttons[6] && gp.buttons[6].pressed) {
          if (now - debounceTimes["volDown"] > debounceDelay) {
            simulateKeyEvent("-");
            debounceTimes["volDown"] = now;
          }
        }
        // RT (indice 7) → "+" (Volume su)
        if (gp.buttons[7] && gp.buttons[7].pressed) {
          if (now - debounceTimes["volUp"] > debounceDelay) {
            simulateKeyEvent("+");
            debounceTimes["volUp"] = now;
          }
        }
        // X Button (indice 2) → "m" (Toggle mute)
        if (gp.buttons[2] && gp.buttons[2].pressed) {
          if (now - debounceTimes["m"] > debounceDelay) {
            simulateKeyEvent("m");
            debounceTimes["m"] = now;
          }
        }
        // Y Button (indice 3) → "f" (Fullscreen toggle)
        if (gp.buttons[3] && gp.buttons[3].pressed) {
          if (now - debounceTimes["f"] > debounceDelay) {
            simulateKeyEvent("f");
            debounceTimes["f"] = now;
          }
        }
        // Back Button (indice 8) → "p" (Picture-in-Picture)
        if (gp.buttons[8] && gp.buttons[8].pressed) {
          if (now - debounceTimes["p"] > debounceDelay) {
            simulateKeyEvent("p");
            debounceTimes["p"] = now;
          }
        }
      }
      requestAnimationFrame(pollGamepad);
    }
    
    window.addEventListener("gamepadconnected", function(e) {
      console.log("Gamepad collegato:", e.gamepad);
    });
    if (navigator.getGamepads) {
      requestAnimationFrame(pollGamepad);
    }
    
    video.addEventListener("playing", () => showSpinner(false));
    video.addEventListener("waiting", () => showSpinner(true));

// 尝试在启动时自动加载本地的 example.m3u8（需通过 HTTP 服务器访问项目）
(function autoLoadExample() {
  const examplePath = 'example.m3u8';
  fetch(examplePath).then(response => {
    if (!response.ok) throw new Error('Network response was not ok');
    return response.text();
  }).then(text => {
    parseChannelList(text);
    if (channels.length > 0) {
      currentSelectedIndex = 0;
      updateSelection();
      // 尝试自动播放第一个频道（浏览器可能因 autoplay 策略阻止）
      try {
        channels[0].click();
      } catch (e) {
        console.warn('自动播放第一个频道失败，可能被浏览器阻止', e);
      }
    }
  }).catch(err => {
    console.warn('未能自动加载 example.m3u8：', err);
  });
})();

// 语音识别支持（录音后调用腾讯 ASR，本地桥接服务）
(function setupVoiceRecognition() {
  const voiceBtn = document.getElementById('voiceBtn');
  const voiceStatus = document.getElementById('voiceStatus');
  const voiceResult = document.getElementById('voiceResult');
  if (!voiceBtn) return;

  if (!navigator.mediaDevices || !window.MediaRecorder) {
    voiceStatus.textContent = '浏览器不支持录音';
    voiceBtn.disabled = true;
    return;
  }

  const ASR_API_URL = (window.ASR_API_URL && String(window.ASR_API_URL).trim()) || 'http://127.0.0.1:8002/api/asr';
  const NANOBOT_API_URL = (window.NANOBOT_API_URL && String(window.NANOBOT_API_URL).trim()) || 'http://127.0.0.1:8002/api/nanobot/execute';
  const ASR_ENGINE_TYPE = '16k_zh_large';
  let recorder = null;
  let streamRef = null;
  let chunks = [];

  let listening = false;
  voiceBtn.addEventListener('click', async () => {
    if (!listening) {
      try {
        streamRef = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(streamRef);
        chunks = [];
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) chunks.push(ev.data);
        };
        recorder.onstop = submitAudioToTencent;
        recorder.start();

        listening = true;
        voiceStatus.textContent = '监听中...';
        voiceBtn.textContent = '停止语音';
      } catch (e) {
        console.warn(e);
        voiceStatus.textContent = '无法打开麦克风';
      }
    } else {
      try {
        if (recorder && recorder.state !== 'inactive') recorder.stop();
        listening = false;
        voiceBtn.textContent = '启用语音';
      } catch (e) {
        console.warn(e);
      }
    }
  });

  async function submitAudioToTencent() {
    try {
      voiceStatus.textContent = '识别中...';
      const mimeType = (recorder && recorder.mimeType) || 'audio/webm';
      const blob = new Blob(chunks, { type: mimeType });
      const formData = new FormData();
      formData.append('file', blob, 'recording.webm');
      formData.append('engine_type', ASR_ENGINE_TYPE);

      const resp = await fetch(ASR_API_URL, {
        method: 'POST',
        body: formData
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = (data && (data.error || data.detail)) ? String(data.error || data.detail) : ('HTTP ' + resp.status);
        throw new Error('ASR请求失败: ' + msg);
      }
      const text = normalizeTranscript(data && data.result ? String(data.result) : '');
      voiceResult.textContent = text || '（空）';
      if (!text) {
        voiceStatus.textContent = '未识别到有效语音';
        return;
      }
      await handleVoiceCommandByNanobot(text);
    } catch (e) {
      console.warn(e);
      voiceStatus.textContent = '语音识别失败：' + (e && e.message ? e.message : '未知错误');
    } finally {
      if (streamRef) {
        streamRef.getTracks().forEach(track => track.stop());
      }
      streamRef = null;
      recorder = null;
      chunks = [];
    }
  }

  function normalizeTranscript(raw) {
    const text = String(raw || '');
    return text
      .replace(/\[\d+:\d+(?:\.\d+)?,\d+:\d+(?:\.\d+)?\]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  async function handleVoiceCommandByNanobot(raw) {
    try {
      const channelNames = channels.map(c => (c && c.textContent ? String(c.textContent).trim() : '')).filter(Boolean);
      const resp = await fetch(NANOBOT_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: raw,
          channels: channelNames
        })
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        const msg = data && (data.error || data.detail) ? String(data.error || data.detail) : ('HTTP ' + resp.status);
        throw new Error(msg);
      }

      const action = data && data.action ? data.action : null;
      const result = executeNanobotAction(action, raw);
      if (result.replyText) {
        voiceStatus.textContent = sanitizeReplyText(result.replyText);
      }
      if (!result.executed && !result.replied) {
        handleVoiceCommand(raw);
      }
    } catch (e) {
      console.warn('nanobot 解析失败，回退本地规则：', e);
      handleVoiceCommand(raw);
    }
  }

  function sanitizeReplyText(reply) {
    const text = String(reply || '').trim();
    if (!text) return '';
    const match = text.match(/"reply"\s*:\s*"([^"]+)"/);
    if (match && match[1]) return match[1].trim();
    if (text.length > 120) return '已收到回复';
    return text;
  }

  let pendingFullscreenByGesture = false;
  let fullscreenRetryHookBound = false;

  function requestFullscreenCompat() {
    const requestFn = video.requestFullscreen || video.webkitRequestFullscreen;
    if (!requestFn) {
      return Promise.reject(new Error('fullscreen_not_supported'));
    }

    try {
      const ret = requestFn.call(video);
      if (ret && typeof ret.then === 'function') {
        return ret;
      }
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          const ok = !!(document.fullscreenElement || document.webkitFullscreenElement);
          if (ok) resolve(true);
          else reject(new Error('fullscreen_not_entered'));
        }, 120);
      });
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function bindFullscreenRetryHook() {
    if (fullscreenRetryHookBound) return;
    fullscreenRetryHookBound = true;

    const runPendingFullscreen = () => {
      if (!pendingFullscreenByGesture) return;
      pendingFullscreenByGesture = false;
      requestFullscreenCompat().then(() => {
        voiceStatus.textContent = '已进入全屏';
      }).catch((err) => {
        console.warn('点击后进入全屏失败:', err);
        voiceStatus.textContent = '全屏失败：请使用键盘 F 或浏览器全屏按钮';
      });
    };

    document.addEventListener('click', runPendingFullscreen, true);
    document.addEventListener('touchend', runPendingFullscreen, true);
  }

  function triggerFullscreenByVoice() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

    if (isFullscreen) {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exitFn) {
        voiceStatus.textContent = '当前浏览器不支持退出全屏';
        return;
      }
      try {
        const ret = exitFn.call(document);
        if (ret && typeof ret.then === 'function') {
          ret.then(() => {
            voiceStatus.textContent = '已退出全屏';
          }).catch((err) => {
            console.warn('退出全屏失败:', err);
            voiceStatus.textContent = '退出全屏失败，可能被浏览器限制';
          });
        } else {
          voiceStatus.textContent = '已退出全屏';
        }
      } catch (err) {
        console.warn('退出全屏异常:', err);
        voiceStatus.textContent = '退出全屏失败，可能被浏览器限制';
      }
      return;
    }

    if (!(video.requestFullscreen || video.webkitRequestFullscreen)) {
      voiceStatus.textContent = '当前浏览器不支持全屏';
      return;
    }

    requestFullscreenCompat().then(() => {
      voiceStatus.textContent = '已进入全屏';
    }).catch((err) => {
      console.warn('进入全屏失败:', err);
      pendingFullscreenByGesture = true;
      bindFullscreenRetryHook();
      voiceStatus.textContent = '全屏失败：请点击页面任意位置自动进入全屏';
    });
  }

  function getVolumeDeltaByText(raw, direction) {
    const text = String(raw || '').toLowerCase();

    const tinyHints = ['一点点', '一点', '稍微', '小点', '轻一点', '微微', '略微'];
    const largeDownHints = ['太吵', '很吵', '吵死', '刺耳', '声音太大', '音量太大', '降很多', '小很多'];
    const largeUpHints = ['太小声', '听不清', '太轻', '大点声', '加很多', '声音太小'];

    if (tinyHints.some(k => text.includes(k))) return 0.05;
    if (direction === 'down' && largeDownHints.some(k => text.includes(k))) return 0.2;
    if (direction === 'up' && largeUpHints.some(k => text.includes(k))) return 0.2;
    return 0.1;
  }

  function isTinyVolumeRequest(raw) {
    const text = String(raw || '').toLowerCase();
    const tinyHints = ['一点点', '一点', '稍微', '小点', '轻一点', '微微', '略微', '放点声音', '来点声音', '有点声音', '出点声'];
    return tinyHints.some(k => text.includes(k));
  }

  function adjustVolume(direction, raw) {
    const delta = getVolumeDeltaByText(raw, direction);
    if (direction === 'up') {
      const wasMuted = !!video.muted;
      const tinyRequest = isTinyVolumeRequest(raw);
      if (wasMuted) {
        video.muted = false;
      }

      if (wasMuted && tinyRequest) {
        const target = 0.12;
        video.volume = Math.min(video.volume, target);
      } else {
        video.volume = Math.min(video.volume + delta, 1);
      }

      const prefix = wasMuted ? '已取消静音，' : '';
      if (wasMuted && tinyRequest) {
        voiceStatus.textContent = `${prefix}已恢复小音量，当前 ${Math.round(video.volume * 100)}%`;
      } else {
        voiceStatus.textContent = `${prefix}音量已调高（+${Math.round(delta * 100)}%），当前 ${Math.round(video.volume * 100)}%`;
      }
      return;
    }
    video.volume = Math.max(video.volume - delta, 0);
    voiceStatus.textContent = `音量已调低（-${Math.round(delta * 100)}%），当前 ${Math.round(video.volume * 100)}%`;
  }

  function findChannelIndexByName(name) {
    const queryRaw = String(name || '').trim();
    if (!queryRaw) return -1;

    const normalize = (input) => {
      return String(input || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/\s+/g, '')
        .replace(/[\-_.·,，。:：;；!！?？'"“”‘’()（）\[\]【】]/g, '')
        .replace(/频道/g, '')
        .trim();
    };

    const query = normalize(queryRaw);
    if (!query) return -1;

    const toBigrams = (text) => {
      const result = new Set();
      if (!text || text.length < 2) return result;
      for (let i = 0; i < text.length - 1; i++) {
        result.add(text.slice(i, i + 2));
      }
      return result;
    };

    const jaccard = (setA, setB) => {
      if (!setA.size || !setB.size) return 0;
      let inter = 0;
      setA.forEach(v => { if (setB.has(v)) inter += 1; });
      const union = setA.size + setB.size - inter;
      return union > 0 ? inter / union : 0;
    };

    const queryChars = new Set(query.split(''));
    const queryBigrams = toBigrams(query);
    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < channels.length; i++) {
      const titleRaw = (channels[i].textContent || '').trim();
      if (!titleRaw) continue;
      const title = normalize(titleRaw);
      if (!title) continue;

      let score = 0;
      if (title === query) {
        score = 1;
      } else {
        if (title.includes(query) || query.includes(title)) {
          score = Math.max(score, 0.92);
        }
        if (title.startsWith(query) || query.startsWith(title)) {
          score = Math.max(score, 0.88);
        }

        const titleChars = new Set(title.split(''));
        const charSim = jaccard(queryChars, titleChars);
        score = Math.max(score, 0.35 + 0.45 * charSim);

        const titleBigrams = toBigrams(title);
        const bigramSim = jaccard(queryBigrams, titleBigrams);
        score = Math.max(score, 0.25 + 0.7 * bigramSim);
      }

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    return bestScore >= 0.56 ? bestIndex : -1;
  }

  function executeNanobotAction(actionPayload, raw) {
    let actionRaw = '';
    let replyRaw = '';
    let channel = '';
    let query = '';
    if (typeof actionPayload === 'string') {
      actionRaw = String(actionPayload).trim();
    } else if (actionPayload && typeof actionPayload === 'object') {
      actionRaw = String(actionPayload.action || '').trim();
      replyRaw = String(actionPayload.reply || '').trim();
      channel = String(actionPayload.channel || '').trim();
      query = String(actionPayload.query || actionPayload.q || actionPayload.keyword || '').trim();
    }
    const legacyActionMap = {
      next: '下一个',
      prev: '上一个',
      pause: '暂停',
      play: '播放',
      toggle_mute: '切换静音',
      fullscreen: '全屏',
      open_channel: '打开频道',
      volume_up: '调高音量',
      volume_down: '调低音量',
      search: '搜索',
      find: '搜索',
      none: '无动作'
    };
    const action = legacyActionMap[actionRaw.toLowerCase ? actionRaw.toLowerCase() : actionRaw] || actionRaw;
    if (!action || action === '无动作') {
      if (replyRaw) {
        return { executed: false, replied: true, replyText: replyRaw };
      }
      return { executed: false, replied: false, replyText: '' };
    }

    if (action === '下一个') {
      if (channels.length === 0) {
        voiceStatus.textContent = '频道列表为空';
        return { executed: true, replied: false, replyText: replyRaw };
      }
      currentSelectedIndex = (currentSelectedIndex + 1 + channels.length) % channels.length;
      updateSelection();
      channels[currentSelectedIndex].click();
      voiceStatus.textContent = '切换到下一个频道';
      return { executed: true, replied: false, replyText: replyRaw };
    }
    if (action === '上一个') {
      if (channels.length === 0) {
        voiceStatus.textContent = '频道列表为空';
        return { executed: true, replied: false, replyText: replyRaw };
      }
      currentSelectedIndex = (currentSelectedIndex - 1 + channels.length) % channels.length;
      updateSelection();
      channels[currentSelectedIndex].click();
      voiceStatus.textContent = '切换到上一个频道';
      return { executed: true, replied: false, replyText: replyRaw };
    }
    if (action === '暂停') { video.pause(); voiceStatus.textContent = '已暂停'; return { executed: true, replied: false, replyText: replyRaw }; }
    if (action === '播放') { video.play(); voiceStatus.textContent = '播放中'; return { executed: true, replied: false, replyText: replyRaw }; }
    if (action === '切换静音') { video.muted = !video.muted; voiceStatus.textContent = video.muted ? '已静音' : '取消静音'; return { executed: true, replied: false, replyText: replyRaw }; }
    if (action === '全屏') { triggerFullscreenByVoice(); return { executed: true, replied: false, replyText: replyRaw }; }
    if (action === '调高音量') { adjustVolume('up', raw); return { executed: true, replied: false, replyText: replyRaw }; }
    if (action === '调低音量' || action === '调小音量') { adjustVolume('down', raw); return { executed: true, replied: false, replyText: replyRaw }; }
    // 兼容用户说 "退出全屏"、"取消全屏"、"缩小屏幕" 等指令
    if (action === '退出全屏' || action === '取消全屏' || action === '缩小屏幕') {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen;
      if (exitFn && (document.fullscreenElement || document.webkitFullscreenElement)) {
        try {
          const ret = exitFn.call(document);
          if (ret && typeof ret.then === 'function') {
            ret.then(() => { voiceStatus.textContent = '已退出全屏'; }).catch(err => { console.warn('退出全屏失败:', err); voiceStatus.textContent = '退出全屏失败'; });
          } else {
            voiceStatus.textContent = '已退出全屏';
          }
        } catch (err) {
          console.warn('退出全屏异常:', err);
          voiceStatus.textContent = '退出全屏失败';
        }
      } else {
        voiceStatus.textContent = '当前未处于全屏';
      }
      return { executed: true, replied: false, replyText: replyRaw };
    }
    if (action === '打开频道') {
      const index = findChannelIndexByName(channel);
      if (index < 0) {
        voiceStatus.textContent = channel ? ('未找到频道：' + channel) : ('未找到频道：' + raw);
        return { executed: true, replied: false, replyText: replyRaw };
      }
      currentSelectedIndex = index;
      updateSelection();
      channels[index].click();
      voiceStatus.textContent = '已打开：' + channels[index].textContent;
      return { executed: true, replied: false, replyText: replyRaw };
    }

    if (action === '搜索') {
      const q = query || raw || replyRaw || channel || '';
      if (!q) {
        voiceStatus.textContent = '搜索关键词为空';
        return { executed: true, replied: false, replyText: replyRaw };
      }
      voiceStatus.textContent = `正在搜索：${q}`;
      try {
        window.location.href = 'http://localhost:8080/s=' + encodeURIComponent(q);
      } catch (e) {
        console.warn('跳转搜索失败：', e);
      }
      return { executed: true, replied: false, replyText: replyRaw };
    }

    if (replyRaw) {
      return { executed: false, replied: true, replyText: replyRaw };
    }
    return { executed: false, replied: false, replyText: '' };
  }

  function handleVoiceCommand(raw) {
    if (!raw) return;
    const text = raw.toLowerCase();
    // 简单命令处理
    if (text.includes('下一个') || text.includes('下一')) {
      if (channels.length === 0) return voiceStatus.textContent = '频道列表为空';
      currentSelectedIndex = (currentSelectedIndex + 1 + channels.length) % channels.length;
      updateSelection();
      channels[currentSelectedIndex].click();
      return voiceStatus.textContent = '切换到下一个频道';
    }
    if (text.includes('上一个') || text.includes('上一')) {
      if (channels.length === 0) return voiceStatus.textContent = '频道列表为空';
      currentSelectedIndex = (currentSelectedIndex - 1 + channels.length) % channels.length;
      updateSelection();
      channels[currentSelectedIndex].click();
      return voiceStatus.textContent = '切换到上一个频道';
    }
    if (text.includes('暂停')) { video.pause(); return voiceStatus.textContent = '已暂停'; }
    if (text.includes('继续') || text.includes('播放') && !text.includes('打开')) { video.play(); return voiceStatus.textContent = '播放中'; }
    if (text.includes('太吵')) { adjustVolume('down', raw); return; }
    if (text.includes('放一点点声音') || text.includes('放点声音') || text.includes('来点声音') || text.includes('有点声音') || text.includes('出点声')) { adjustVolume('up', raw); return; }
    if (text.includes('减少一点点') || text.includes('减小一点点') || text.includes('小一点点')) { adjustVolume('down', raw); return; }
    if (text.includes('音量') && (text.includes('调低') || text.includes('降低') || text.includes('小一点') || text.includes('小点') || text.includes('减小'))) { adjustVolume('down', raw); return; }
    if (text.includes('音量') && (text.includes('调高') || text.includes('提高') || text.includes('大一点') || text.includes('大点') || text.includes('增大'))) { adjustVolume('up', raw); return; }
    if (text.includes('静音')) { video.muted = !video.muted; return voiceStatus.textContent = video.muted ? '已静音' : '取消静音'; }
    if (text.includes('全屏')) { triggerFullscreenByVoice(); return; }
    if (text.includes('几点') || text.includes('时间')) {
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      return voiceStatus.textContent = `现在是 ${hh}:${mm}`;
    }

    // 打开/播放指定频道，例如 "打开湖南卫视"、"播放安徽卫视"
    const openMatch = raw.match(/(?:打开|播放|切换到|换到|去看)\s*(.+)/i);
    const nameQuery = openMatch ? openMatch[1].trim().toLowerCase() : null;
    if (nameQuery) {
      // 尝试精确或包含匹配
      for (let i = 0; i < channels.length; i++) {
        const title = (channels[i].textContent || '').trim().toLowerCase();
        if (!title) continue;
        if (title === nameQuery || title.includes(nameQuery) || nameQuery.includes(title)) {
          currentSelectedIndex = i;
          updateSelection();
          channels[i].click();
          return voiceStatus.textContent = '已打开：' + channels[i].textContent;
        }
      }
      // 未找到
      return voiceStatus.textContent = '未找到频道：' + nameQuery;
    }

    voiceStatus.textContent = '未识别命令：' + raw;
  }
})();
