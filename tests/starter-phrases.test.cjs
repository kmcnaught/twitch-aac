const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('phrases-manager.js', 'utf8');
function setup(ok = true) {
  const button = { disabled: false };
  const messages = [];
  let saved = [{ id: 'custom', phrase: 'My custom phrase', tag: 'custom' }];
  const context = { document: { getElementById: () => button }, alert: m => messages.push(m),
    fetch: async () => ({ ok, text: async () => fs.readFileSync('starter-phrases.txt', 'utf8') }),
    loadPhrases: () => saved, savePhrases: p => { saved = p; }, generateId: () => String(Math.random()),
    renderPhraseEditor() {}, refreshTagDatalist() {}, renderPhrasesGrid() {} };
  vm.createContext(context);
  for (const name of ['parsePhrasesTxt', 'addImportedPhrases', 'loadStarterPhrases']) {
    const match = html.match(new RegExp('(?:async )?function ' + name + '\\([^]*?\\n\\}'));
    assert.ok(match);
    vm.runInContext(match[0], context);
  }
  return { context, button, messages, phrases: () => saved };
}
test('starter phrases load only on request and repeated loads preserve saved phrases without duplicates', async () => {
  const s = setup();
  assert.equal(s.phrases().length, 1);
  await s.context.loadStarterPhrases();
  assert.equal(s.phrases().length, 39);
  assert.equal(s.phrases()[0].id, 'custom');
  await s.context.loadStarterPhrases();
  assert.equal(s.phrases().length, 39);
  assert.match(s.messages[1], /Imported 0 phrases/);
  assert.equal(s.button.disabled, false);
});
test('failed starter download leaves saved phrases intact and allows retry', async () => {
  const s = setup(false);
  await s.context.loadStarterPhrases();
  assert.equal(s.phrases().length, 1);
  assert.match(s.messages[0], /Could not load starter phrases/);
  assert.equal(s.button.disabled, false);
});
