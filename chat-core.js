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
function speakBrowser(text, card) {
  const u = new SpeechSynthesisUtterance(text);
  const savedVoiceName = localStorage.getItem('browser_voice') || '';
  const lang = localStorage.getItem('voice_lang') || 'en';
  const allVoices = window.speechSynthesis.getVoices();
  const chosen = savedVoiceName
    ? allVoices.find(v => v.name === savedVoiceName)
    : allVoices.find(v => v.lang.startsWith(lang));
  if (chosen) u.voice = chosen;
  u.rate = 0.95;
  u.onend = u.onerror = () => clearSpeak(card);
  window.speechSynthesis.speak(u);
}

async function speakElevenLabs(text, key, voiceId, card, onError) {
  if (elAudio) { elAudio.pause(); elAudio = null; }
  const token = ++elSpeakToken;
  // Create/resume AudioContext before the fetch so Firefox's audio pipeline
  // warms up during the network round-trip, avoiding start-of-audio cutoff
  if (!elAudioCtx || elAudioCtx.state === 'closed') elAudioCtx = new AudioContext();
  if (elAudioCtx.state === 'suspended') elAudioCtx.resume();
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_turbo_v2_5',
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: parseFloat(localStorage.getItem('el_speed') || '1.0') }
      })
    });
    if (token !== elSpeakToken) return;  // superseded by a newer call
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}`);
    const arrayBuffer = await r.arrayBuffer();
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
    source.onended = () => { elAudio = null; clearSpeak(card); };
    elAudio = { pause: () => { try { source.stop(); } catch(_) {} } };  // shim for stopSpeak()
  } catch(e) {
    if (token !== elSpeakToken) return;  // superseded; don't surface stale error
    clearSpeak(card);
    console.error('ElevenLabs error:', e);
    if (onError) onError(e.message);
  }
}

function stopSpeak() {
  window.speechSynthesis.cancel();
  if (elAudio) { elAudio.pause(); elAudio = null; }
  if (speakingCard) clearSpeak(speakingCard);
}

function clearSpeak(card) {
  if (card) card.classList.remove('speaking');
  speakingCard = null;
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
