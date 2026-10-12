const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('chat.html', 'utf8');
const core = fs.readFileSync('chat-core.js', 'utf8');
const storage = new Map();
const area = { innerHTML: '', append() {} };
let rendered;
const context = vm.createContext({
  localStorage: { getItem: k => storage.get(k) ?? null },
  document: { getElementById: () => area, createElement: () => ({}) },
  renderFsCards: p => { rendered = p; },
  loadPhrases: () => JSON.parse(storage.get('stored_phrases') || '[]'),
  selectedPhraseGame: () => storage.get('game') || '',
  updateSuggestEnabled() {},
  phrasesViewActive: false,
  quietPoolSignature: '', quietRemaining: [], quietResponses: []
});
vm.runInContext(core.slice(core.indexOf('function loadGamePhraseFiles()'), core.indexOf('function selectedPhraseGame()')), context);
vm.runInContext(core.slice(core.indexOf('function parseGamePhraseText('), core.indexOf("window.addEventListener('DOMContentLoaded', () => {", core.indexOf('function parseGamePhraseText('))), context);
vm.runInContext(html.slice(html.indexOf('function showQuietPhrases('), html.indexOf('// ── STATE ──')), context);
assert.deepEqual(Array.from(vm.runInContext("parseGamePhraseText('one\\r\\n\\r\\ntwo\\n one \\rthree')", context)), ['one', 'two', 'three']);
for (let count = 0; count <= 13; count++) {
  const phrases = Array.from({length: count}, (_, i) => `General ${i}`);
  storage.set('stored_phrases', JSON.stringify(phrases.map(phrase => ({phrase}))));
  storage.set('game', `Game ${count}`);
  const seen = new Set();
  for (let round = 0; round < 12; round++) {
    vm.runInContext('showQuietPhrases()', context);
    assert.equal(rendered.length, Math.min(4, count));
    assert.equal(new Set(rendered).size, rendered.length);
    for (const phrase of rendered) {
      if (seen.size === count) seen.clear();
      assert.ok(!seen.has(phrase), `Repeated before exhaustion for pool ${count}`);
      seen.add(phrase);
    }
    const before = [...rendered];
    vm.runInContext('showQuietPhrases(true)', context);
    assert.deepEqual(Array.from(rendered), before);
  }
}
storage.set('game', 'Minecraft');
storage.set('stored_phrases', JSON.stringify([{phrase: 'General hello'}]));
storage.set('game_phrase_files', JSON.stringify({Minecraft: {phrases: ['Game hello', 'General hello']}}));
vm.runInContext('showQuietPhrases()', context);
assert.deepEqual(new Set(rendered), new Set(['General hello', 'Game hello']));
storage.set('game_phrase_files', '{}');
vm.runInContext('showQuietPhrases(true)', context);
assert.deepEqual(Array.from(rendered), ['General hello']);
console.log('PASS: line parsing, pools 0–13, cycles, no within-batch duplicates, cache restoration, game/general mixing, deletion fallback');
