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

function setup(saved = {}) {
  const storage = new Map(Object.entries(saved));
  const elements = new Map();
  let request;
  const context = vm.createContext({
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value))
    },
    document: { getElementById: id => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    } },
    window: { addEventListener() {} },
    console,
    AudioContext: class {
      state = 'running';
      async decodeAudioData() { return {}; }
      createBufferSource() { return { connect() {}, start() {} }; }
    },
    fetch: async (url, options) => {
      request = { url, body: JSON.parse(options.body) };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(0) };
    }
  });
  vm.runInContext(core + '\n' + settings, context);
  return { context, storage, elements, request: () => request };
}

test('defaults preserve existing voice behaviour and zero style', async () => {
  const app = setup();
  await app.context.speakElevenLabs('Test phrase', 'test-key', 'test-voice', null);
  assert.deepEqual(app.request().body.voice_settings, {
    stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1
  });
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

test('controls step by 5%, persist across reloads, and stop at both limits', () => {
  for (const setting of ['stability', 'similarity_boost', 'style']) {
    const app = setup({ ['el_' + setting]: '0.95' });
    app.context.stepElVoiceSetting(setting, 1);
    assert.equal(app.storage.get('el_' + setting), '1');
    assert.equal(app.elements.get('el-' + setting + '-label').textContent, '100%');
    assert.equal(app.elements.get('el-' + setting + '-increase').disabled, true);
    app.context.stepElVoiceSetting(setting, 1);
    assert.equal(app.storage.get('el_' + setting), '1');
    for (let i = 0; i < 21; i++) app.context.stepElVoiceSetting(setting, -1);
    assert.equal(app.storage.get('el_' + setting), '0');
    assert.equal(app.elements.get('el-' + setting + '-decrease').disabled, true);
    app.context.stepElVoiceSetting(setting, 1);
    const reloaded = setup(Object.fromEntries(app.storage));
    reloaded.context.renderElVoiceSetting(setting);
    assert.equal(reloaded.elements.get('el-' + setting + '-label').textContent, '5%');
    assert.equal(reloaded.elements.get('el-' + setting + '-decrease').disabled, false);
  }
});
