const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'chat-core.js'), 'utf8');
const settings = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]
  .find(match => match[1].includes('// ── STATE'))[1];

test('setup and chat load the same versioned voice script instead of the cached legacy URL', () => {
  const scripts = ['index.html', 'chat.html'].map(file => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    return html.match(/<script src="(chat-core\.js[^\"]*)" defer><\/script>/)[1];
  });
  assert.equal(scripts[0], scripts[1]);
  assert.match(scripts[0], /^chat-core\.js\?v=.+$/);
});

function setup(saved = {}, options = {}) {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  let request;
  let source;
  let audio;
  const revoked = [];
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    } },
    window: { addEventListener() {}, speechSynthesis: { cancel() {} } },
    console,
    Blob,
    URL: { createObjectURL: () => 'blob:test-audio', revokeObjectURL: url => revoked.push(url) },
    Audio: class {
      constructor(url) { this.src = url; audio = this; }
      async play() {
        if (options.onPlay) options.onPlay();
        if (options.waitPlay) await options.waitPlay;
        if (options.rejectPlayback) throw new Error('Playback rejected');
      }
      pause() { this.paused = true; }
      removeAttribute(name) { if (name === 'src') this.src = ''; }
      load() {}
    },
    AudioContext: class {
      state = 'running';
      async decodeAudioData() { return {}; }
      createBufferSource() {
        source = { playbackRate: { value: 1 }, connect() {}, start() {} };
        return source;
      }
      createMediaElementSource() {
        source = { connect() {}, disconnect() { this.disconnected = true; } };
        return source;
      }
    },
    fetch: async (url, requestOptions) => {
      request = { url, body: JSON.parse(requestOptions.body) };
      if (options.waitFetch) await options.waitFetch;
      return { ok: true, headers: { get: () => 'audio/mpeg' }, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  });
  vm.runInContext(core + '\n' + settings, context);
  return { context, storage, elements, revoked, request: () => request, source: () => source, audio: () => audio };
}

test('defaults preserve existing voice behaviour and zero style', async () => {
  const app = setup();
  await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
  assert.deepEqual(app.request().body.voice_settings, {
    stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1
  });
  assert.equal(app.request().body.model_id, 'eleven_turbo_v2_5');
  assert.equal(app.source().playbackRate.value, 1);
});

test('playback mode generates at normal speed then plays at the saved rate without double slowing', async () => {
  for (const rate of [0.7, 1, 1.2]) {
    const app = setup({ el_speed: String(rate), el_model: 'eleven_multilingual_v2' });
    app.context.document.getElementById('el-speed-mode-select').value = 'playback';
    app.context.saveElSpeedMode();
    const reloaded = setup(Object.fromEntries(app.storage));
    reloaded.context.restoreElSpeedMode();
    assert.equal(reloaded.elements.get('el-speed-mode-select').value, 'playback');
    await reloaded.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    assert.equal(reloaded.request().body.voice_settings.speed, 1);
    assert.equal(reloaded.audio().playbackRate, rate);
    assert.equal(reloaded.audio().preservesPitch, true);
    assert.equal(reloaded.request().body.model_id, 'eleven_multilingual_v2');
  }
});

test('playback audio resources are released on completion and interruption', async () => {
  for (const action of ['finish', 'interrupt']) {
    const app = setup({ el_speed_mode: 'playback', el_speed: '0.7' });
    await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    if (action === 'finish') app.audio().onended();
    else await app.context.speakElevenLabs('Another test phrase', 'test-key', 'test-voice', null);
    assert.deepEqual(app.revoked, ['blob:test-audio']);
    if (action === 'finish') {
      assert.equal(app.audio().paused, true);
      assert.equal(app.audio().src, '');
      assert.equal(app.source().disconnected, true);
    }
  }
});

test('rejected playback releases audio resources and reports an error', async () => {
  const app = setup({ el_speed_mode: 'playback' }, { rejectPlayback: true });
  const errors = [];
  await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null, message => errors.push(message));
  assert.deepEqual(app.revoked, ['blob:test-audio']);
  assert.equal(app.source().disconnected, true);
  assert.deepEqual(errors, ['Playback rejected']);
});

test('Stop prevents pending speech from starting in either speed method', async () => {
  for (const mode of ['playback', 'generation']) {
    let releaseFetch;
    const waitFetch = new Promise(resolve => releaseFetch = resolve);
    const app = setup({ el_speed_mode: mode }, { waitFetch });
    const pending = app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    app.context.stopSpeak();
    releaseFetch();
    await pending;
    assert.equal(app.audio(), undefined);
    assert.equal(app.source(), undefined);
  }
});

test('Stop releases pending playback without reporting intentional cancellation as an error', async () => {
  let rejectPlay, notifyPlay;
  const waitPlay = new Promise((resolve, reject) => rejectPlay = reject);
  const playing = new Promise(resolve => notifyPlay = resolve);
  const app = setup({ el_speed_mode: 'playback' }, { waitPlay, onPlay: notifyPlay });
  const errors = [];
  const pending = app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null, message => errors.push(message));
  await playing;
  app.context.stopSpeak();
  rejectPlay(new Error('Playback cancelled'));
  await pending;
  assert.deepEqual(errors, []);
  assert.deepEqual(app.revoked, ['blob:test-audio']);
  assert.equal(app.source().disconnected, true);
});

test('generation mode and invalid modes retain ElevenLabs speed with normal playback', async () => {
  for (const mode of [undefined, 'generation', 'invalid']) {
    const saved = { el_speed: '0.7' };
    if (mode !== undefined) saved.el_speed_mode = mode;
    const app = setup(saved);
    app.context.restoreElSpeedMode();
    assert.equal(app.elements.get('el-speed-mode-select').value, 'generation');
    await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    assert.equal(app.request().body.voice_settings.speed, 0.7);
    assert.equal(app.source().playbackRate.value, 1);
  }
});

test('switching speed methods preserves the saved speed and supports switching back', async () => {
  const app = setup({ el_speed_mode: 'playback', el_speed: '0.7' });
  app.context.document.getElementById('el-speed-mode-select').value = 'generation';
  app.context.saveElSpeedMode();
  assert.equal(app.storage.get('el_speed'), '0.7');
  await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
  assert.equal(app.request().body.voice_settings.speed, 0.7);
  assert.equal(app.source().playbackRate.value, 1);
});

test('invalid speeds default safely and out-of-range speeds are bounded for playback', () => {
  for (const saved of ['', ' ', 'invalid', 'Infinity']) {
    assert.equal(setup({ el_speed: saved }).context.getElSpeed(), 1);
  }
  assert.equal(setup({ el_speed: '0' }).context.getElSpeed(), 0.7);
  assert.equal(setup({ el_speed: '2' }).context.getElSpeed(), 1.2);
});

test('each model choice persists, restores, and is sent with saved voice settings', async () => {
  for (const model of ['eleven_turbo_v2_5', 'eleven_multilingual_v2', 'eleven_flash_v2_5']) {
    const app = setup({ el_stability: '0.6', el_similarity_boost: '0.8', el_style: '0.2', el_speed: '0.95' });
    app.context.document.getElementById('el-model-select').value = model;
    app.context.saveElModel();
    assert.equal(app.storage.get('el_model'), model);
    const reloaded = setup(Object.fromEntries(app.storage));
    reloaded.context.restoreElModel();
    assert.equal(reloaded.elements.get('el-model-select').value, model);
    await reloaded.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    assert.equal(reloaded.request().body.model_id, model);
    assert.deepEqual(reloaded.request().body.voice_settings, {
      stability: 0.6, similarity_boost: 0.8, style: 0.2, speed: 0.95
    });
  }
});

test('missing or unsupported model choices restore and send the existing default', async () => {
  for (const saved of [undefined, '', 'unknown-model', 'eleven_v3']) {
    const app = setup(saved === undefined ? {} : { el_model: saved });
    app.context.restoreElModel();
    assert.equal(app.elements.get('el-model-select').value, 'eleven_turbo_v2_5');
    await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
    assert.equal(app.request().body.model_id, 'eleven_turbo_v2_5');
  }
});

test('saved settings, including zero, are used in speech requests', async () => {
  const app = setup({ el_stability: '0', el_similarity_boost: '1', el_style: '0.35', el_speed: '1.15' });
  await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
  assert.deepEqual(app.request().body.voice_settings, {
    stability: 0, similarity_boost: 1, style: 0.35, speed: 1.15
  });
  assert.equal(app.request().body.model_id, 'eleven_turbo_v2_5');
});

test('invalid saved values fall back and out-of-range values are bounded', () => {
  for (const [setting, fallback] of Object.entries({ stability: 0.5, similarity_boost: 0.75, style: 0 })) {
    for (const saved of ['', ' ', 'invalid', 'Infinity']) {
      assert.equal(setup({ ['el_' + setting]: saved }).context.getElVoiceSetting(setting), fallback);
    }
    assert.equal(setup({ ['el_' + setting]: '-0.2' }).context.getElVoiceSetting(setting), 0);
    assert.equal(setup({ ['el_' + setting]: '1.2' }).context.getElVoiceSetting(setting), 1);
  }
});

test('style steps by 1%, other controls by 5%, with persistence and bounded limits', () => {
  for (const setting of ['stability', 'similarity_boost', 'style']) {
    const step = setting === 'style' ? 1 : 5;
    const app = setup({ ['el_' + setting]: String((100 - step) / 100) });
    app.context.stepElVoiceSetting(setting, 1);
    assert.equal(app.storage.get('el_' + setting), '1');
    assert.equal(app.elements.get('el-' + setting + '-label').textContent, '100%');
    assert.equal(app.elements.get('el-' + setting + '-increase').disabled, true);
    app.context.stepElVoiceSetting(setting, 1);
    assert.equal(app.storage.get('el_' + setting), '1');
    for (let i = 0; i < 100 / step + 1; i++) app.context.stepElVoiceSetting(setting, -1);
    assert.equal(app.storage.get('el_' + setting), '0');
    assert.equal(app.elements.get('el-' + setting + '-decrease').disabled, true);
    app.context.stepElVoiceSetting(setting, 1);
    const reloaded = setup(Object.fromEntries(app.storage));
    reloaded.context.renderElVoiceSetting(setting);
    assert.equal(reloaded.elements.get('el-' + setting + '-label').textContent, step + '%');
    assert.equal(reloaded.elements.get('el-' + setting + '-decrease').disabled, false);
  }
});

test('style can match 7% exactly and is sent as 0.07', async () => {
  const app = setup({ el_model: 'eleven_multilingual_v2', el_speed: '0.7', el_stability: '1', el_similarity_boost: '1', el_style: '0.05' });
  app.context.stepElVoiceSetting('style', 1);
  app.context.stepElVoiceSetting('style', 1);
  assert.equal(app.elements.get('el-style-label').textContent, '7%');
  const reloaded = setup(Object.fromEntries(app.storage));
  reloaded.context.renderElVoiceSetting('style');
  assert.equal(reloaded.elements.get('el-style-label').textContent, '7%');
  await reloaded.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
  assert.equal(reloaded.request().body.model_id, 'eleven_multilingual_v2');
  assert.deepEqual(reloaded.request().body.voice_settings, {
    stability: 1, similarity_boost: 1, style: 0.07, speed: 0.7
  });
});
