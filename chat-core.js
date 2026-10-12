// ── CONFIG ──
const PROXY_URL = 'https://anthropic-proxy.kirsty-mcnaught.workers.dev';

// ── SHARED CONSTANTS ──
const VLENGTH = {
  short:  'All responses must be short spoken phrases — aim for roughly 2–7 words each, punchy and natural. The bonus option can be whatever length fits best.',
  medium: 'All responses are approximately one sentence, 10–20 words each. The bonus option can be shorter or longer as feels right.',
  long:   'All responses are 2–3 sentences, expansive and conversational. The bonus option can vary in length as appropriate.'
};

// ── SPEECH STATE ──
let speakingCard = null;
let elAudio = null;
let elAudioCtx = null;
let elSpeakToken = 0;  // incremented on each call to cancel in-flight requests

// ── HELPERS ──
function x(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function parseEmoteRanges(emotesTag) {
  const ranges = [];
  for (const emote of emotesTag.split('/')) {
    const [id, positions] = emote.split(':');
    if (!positions) continue;
    for (const range of positions.split(',')) {
      const [s, e] = range.split('-').map(Number);
      if (!isNaN(s) && !isNaN(e)) ranges.push({ s, e, id });
    }
  }
  return ranges;
}

function replaceEmotes(text, emotesTag) {
  if (!emotesTag) return text;
  const ranges = parseEmoteRanges(emotesTag).sort((a, b) => b.s - a.s);
  let result = text;
  for (const { s, e } of ranges) result = result.slice(0, s) + '[emote]' + result.slice(e + 1);
  return result;
}

function renderEmotes(text, emotesTag) {
  if (!emotesTag) return x(text);
  const themeVariant = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const ranges = parseEmoteRanges(emotesTag).sort((a, b) => a.s - b.s);
  let html = '', pos = 0;
  for (const { s, e, id } of ranges) {
    if (s < pos) continue; // skip overlapping/malformed ranges
    if (s > pos) html += x(text.slice(pos, s));
    html += `<img src="https://static-cdn.jtvnw.net/emoticons/v2/${id}/default/${themeVariant}/2.0" class="chat-emote" alt="[emote]">`;
    pos = e + 1;
  }
  if (pos < text.length) html += x(text.slice(pos));
  return html;
}

// ── BOT EXCLUSION ──
let _botCache = null;

function invalidateBotCache() { _botCache = null; }

function isExcluded(user, rawText) {
  if (rawText.trimStart().startsWith('!')) return true;
  if (_botCache === null) {
    _botCache = (localStorage.getItem('ignored_bots') || '')
      .split(',').map(b => b.trim().toLowerCase()).filter(Boolean);
  }
  return _botCache.includes(user.toLowerCase());
}

// ── IRC MESSAGE PARSING ──
function parseIrcMsg(raw) {
  const m = raw.match(/^(@\S+ )?:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
  if (!m) return null;
  const tagsStr = m[1] || '';
  const emotesMatch = tagsStr.match(/\bemotes=([^;]*)/);
  return { user: m[2], text: m[3], emotesTag: emotesMatch ? emotesMatch[1] : '' };
}

// ── SPEECH ──
const EL_VOICE_DEFAULTS = { stability: 0.5, similarity_boost: 0.75, style: 0 };
const EL_MODEL_IDS = ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_flash_v2_5'];

function getElModel() {
  const saved = localStorage.getItem('el_model');
  return EL_MODEL_IDS.includes(saved) ? saved : EL_MODEL_IDS[0];
}

function getElSpeedMode() {
  return localStorage.getItem('el_speed_mode') === 'playback' ? 'playback' : 'generation';
}

function getElSpeed() {
  const saved = localStorage.getItem('el_speed');
  const speed = saved === null || saved.trim() === '' ? NaN : Number(saved);
  return Number.isFinite(speed) ? Math.max(0.7, Math.min(1.2, speed)) : 1;
}

function getElVoiceSetting(setting) {
  const saved = localStorage.getItem('el_' + setting);
  const value = saved === null || saved.trim() === '' ? NaN : Number(saved);
  return Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : EL_VOICE_DEFAULTS[setting];
}

async function playElAudioAtSpeed(arrayBuffer, speed, card, token, onError, contentType) {
  const url = URL.createObjectURL(new Blob([arrayBuffer], { type: contentType }));
  let audio, released = false, started = false;
  const playback = { pause: release };
  function release() {
    if (released) return;
    released = true;
    if (audio) {
      audio.onended = audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    URL.revokeObjectURL(url);
    if (elAudio === playback) elAudio = null;
  }
  try {
    audio = new Audio(url);
    audio.playbackRate = speed;
    audio.preservesPitch = true;
    audio.onended = () => { release(); if (token === elSpeakToken) clearSpeak(card, true); };
    audio.onerror = () => {
      release();
      if (started && token === elSpeakToken) {
        clearSpeak(card);
        if (onError) onError('Audio playback failed');
      }
    };
    elAudio = playback;
    await audio.play();
    started = true;
  } catch (e) {
    release();
    throw e;
  }
}

function speakBrowser(text, card) {
  const token = ++elSpeakToken;
  const u = new SpeechSynthesisUtterance(text);
  const savedVoiceName = localStorage.getItem('browser_voice') || '';
  const lang = localStorage.getItem('voice_lang') || 'en';
  const allVoices = window.speechSynthesis.getVoices();
  const chosen = savedVoiceName
    ? allVoices.find(v => v.name === savedVoiceName)
    : allVoices.find(v => v.lang.startsWith(lang));
  if (chosen) u.voice = chosen;
  u.rate = 0.95;
  u.onend = () => { if (token === elSpeakToken) clearSpeak(card, true); };
  u.onerror = () => { if (token === elSpeakToken) clearSpeak(card); };
  window.speechSynthesis.speak(u);
}

async function speakElevenLabs(text, key, voiceId, card, onError) {
  if (elAudio) { elAudio.pause(); elAudio = null; }
  const token = ++elSpeakToken;
  const speed = getElSpeed();
  const playbackSpeed = getElSpeedMode() === 'playback';
  if (!playbackSpeed) {
    // Warm up Web Audio during the fetch to avoid Firefox cutting off speech.
    if (!elAudioCtx || elAudioCtx.state === 'closed') elAudioCtx = new AudioContext();
    if (elAudioCtx.state === 'suspended') elAudioCtx.resume();
  }
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: getElModel(),
        voice_settings: {
          stability: getElVoiceSetting('stability'),
          similarity_boost: getElVoiceSetting('similarity_boost'),
          style: getElVoiceSetting('style'),
          speed: playbackSpeed ? 1 : speed
        }
      })
    });
    if (token !== elSpeakToken) return;  // superseded by a newer call
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    const arrayBuffer = await r.arrayBuffer();
    if (token !== elSpeakToken) return;
    if (playbackSpeed) {
      await playElAudioAtSpeed(arrayBuffer, speed, card, token, onError, r.headers.get('Content-Type') || 'audio/mpeg');
      return;
    }
    let audioBuffer;
    try {
      audioBuffer = await elAudioCtx.decodeAudioData(arrayBuffer);
    } catch(decodeErr) {
      throw new Error(`Audio decode failed: ${decodeErr.message || decodeErr}`);
    }
    if (token !== elSpeakToken) return;  // superseded while decoding
    const source = elAudioCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(elAudioCtx.destination);
    source.start();
    source.onended = () => { if (token === elSpeakToken) { elAudio = null; clearSpeak(card, true); } };
    elAudio = { pause: () => { try { source.stop(); } catch(_) {} } };  // shim for stopSpeak()
  } catch(e) {
    if (token !== elSpeakToken) return;  // superseded; don't surface stale error
    clearSpeak(card);
    console.error('ElevenLabs error:', e);
    if (onError) onError(e.message);
  }
}

function stopSpeak() {
  ++elSpeakToken;
  window.speechSynthesis.cancel();
  if (elAudio) { elAudio.pause(); elAudio = null; }
  if (speakingCard) clearSpeak(speakingCard);
}

function clearSpeak(card, completed = false) {
  if (card) card.classList.remove('speaking');
  if (speakingCard === card) speakingCard = null;
  if (card && card.onSpeechComplete) {
    const callback = card.onSpeechComplete;
    delete card.onSpeechComplete;
    callback(completed);
  }
}

// ── TWITCH CHAT SEND ──
function postToChat(text) {
  const token = localStorage.getItem('twitch_token');
  if (!token) return;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  if (!currentChannel) return;

  const MAX = 490; // Twitch IRC limit is 500 bytes; leave room for prefix overhead
  if (text.length <= MAX) {
    ws.send(`PRIVMSG #${currentChannel} :${text}`);
    return;
  }

  // Split on word boundaries, carrying '…' continuation markers
  const chunks = [];
  let remaining = text;
  while (remaining.length > 0) {
    const prefix = chunks.length === 0 ? '' : '… ';
    const budget = MAX - prefix.length;
    if (remaining.length <= budget) {
      chunks.push(prefix + remaining);
      break;
    }
    // Reserve 2 chars for the trailing ' …'
    const window = budget - 2;
    let cut = remaining.lastIndexOf(' ', window);
    if (cut <= 0) cut = window; // no space found, hard cut
    chunks.push(prefix + remaining.slice(0, cut) + ' …');
    remaining = remaining.slice(cut).trimStart();
  }

  for (const chunk of chunks) {
    ws.send(`PRIVMSG #${currentChannel} :${chunk}`);
  }
}

// ── CLEAR BUTTONS ──
function initClearBtn(inputEl, clearBtn, onClear) {
  if (!inputEl || !clearBtn) return;
  function update() {
    clearBtn.classList.toggle('visible', inputEl.value.length > 0);
  }
  inputEl.addEventListener('input', update);
  clearBtn.addEventListener('click', () => {
    inputEl.value = '';
    update();
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (onClear) onClear();
    inputEl.focus();
  });
  update();
}
// Game files use a separate key so the existing general phrase format stays intact.
function loadGamePhraseFiles() {
  try {
    const value = JSON.parse(localStorage.getItem('game_phrase_files') || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
function selectedPhraseGame() {
  const select = document.getElementById('game-select');
  const game = select ? select.value : localStorage.getItem('game') || '';
  return (game === 'other' ? (document.getElementById('game-custom-input')?.value ?? localStorage.getItem('game_custom') ?? '') : game).trim();
}
function parseGamePhraseText(text) {
  return [...new Set(text.split(/\r\n|\n|\r/).map(line => line.trim()).filter(Boolean))];
}
window.addEventListener('DOMContentLoaded', () => {
  const manager = document.getElementById('game-phrase-manager');
  if (!manager) return;
  const fileInput = document.getElementById('game-phrase-file');
  const status = document.getElementById('game-phrase-status');
  let uploadGame = '';
  function renderFiles() {
    const list = document.getElementById('game-phrase-files');
    list.replaceChildren();
    for (const [game, data] of Object.entries(loadGamePhraseFiles())) {
      if (!Array.isArray(data.phrases)) continue;
      const row = document.createElement('div');
      row.className = 'game-phrase-row';
      const label = document.createElement('span');
      label.textContent = `${game} · ${data.name} · ${data.phrases.length} phrases`;
      const remove = document.createElement('button');
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete phrase file for ${game}`);
      remove.onclick = () => {
        try {
          const files = loadGamePhraseFiles();
          delete files[game];
          localStorage.setItem('game_phrase_files', JSON.stringify(files));
          status.textContent = `Deleted phrase file for ${game}. General phrases are still available.`;
          renderFiles();
        } catch { status.textContent = 'Could not delete the file. Browser storage is unavailable.'; }
      };
      row.append(label, remove);
      list.append(row);
    }
    if (!list.children.length) list.textContent = 'No game files yet. Quiet Mode will use general phrases.';
  }
  document.getElementById('game-phrase-upload').onclick = () => {
    uploadGame = selectedPhraseGame();
    if (!uploadGame) { status.textContent = 'Choose a game above (or enter an Other game name) first.'; return; }
    fileInput.click();
  };
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    const game = uploadGame;
    if (!file) return;
    try {
      if (!/\.txt$/i.test(file.name)) throw new Error('Please choose a .txt file.');
      if (file.size > 2 * 1024 * 1024) throw new Error('Please choose a file smaller than 2 MB.');
      const phrases = parseGamePhraseText(await file.text());
      if (!phrases.length) throw new Error('The file has no phrases. Add one phrase per line.');
      const files = loadGamePhraseFiles();
      Object.defineProperty(files, game, { value: { name: file.name, phrases }, enumerable: true, configurable: true, writable: true });
      localStorage.setItem('game_phrase_files', JSON.stringify(files));
      status.textContent = `Saved ${phrases.length} phrases for ${game}.`;
      renderFiles();
    } catch (error) { status.textContent = error.name === 'QuotaExceededError' ? 'Browser storage is full. The previous file has been kept.' : error.message; }
    finally { fileInput.value = ''; }
  };
  window.addEventListener('storage', e => { if (e.key === 'game_phrase_files') renderFiles(); });
  renderFiles();
});
