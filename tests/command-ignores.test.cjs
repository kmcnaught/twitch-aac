const test = require('node:test');
const assert = require('node:assert/strict');
const rules = require('../command-ignores.js');
test('add, reload, remove and export/import preserve editable rules', () => {
  const data = new Map(); const disk = {getItem:k => data.get(k) ?? null, setItem:(k,v) => data.set(k,v)};
  assert.equal(rules.load(disk).length, 0);
  rules.save([], disk); assert.deepEqual(rules.load(disk), []);
  const entry = {command:'!test', replies:['A test reply', 'Second test part']};
  rules.save(rules.merge(rules.load(disk), [entry]), disk);
  const exported = JSON.parse(JSON.stringify({version:1, commands:rules.load(disk)}));
  assert.equal(rules.matches('Second test part continues', exported.commands), true);
  assert.equal(rules.matches('Other bot event', exported.commands), false);
  assert.equal(rules.commandMatches('!TEST argument', '!test'), true);
  assert.equal(rules.commandMatches('!testing', '!test'), false);
  assert.equal(rules.merge(exported.commands, [entry]).length, 1);
  rules.save([], disk); assert.equal(rules.matches('A test reply', rules.load(disk)), false);
});
test('imports are validated without accepting executable markup or replacing data', () => {
  assert.throws(() => rules.validate([{command:'!test', replies:'wrong'}]));
  assert.throws(() => rules.validate(Array(201).fill({command:'x', replies:[]})));
  const original = [{command:'!one', replies:['First']}];
  assert.throws(() => rules.merge(original, [{command:'!two', replies:[null]}]));
  assert.deepEqual(original, [{command:'!one', replies:['First']}]);
  assert.equal(rules.merge(original, [{command:'!ONE', replies:['Second']}])[0].replies.length, 2);
});

test('configured reply matching handles emoji, split replies and apostrophes', () => {
  const entries = [{command:'!fixture', replies:["I can't test this", 'Second part:']}];
  assert.equal(rules.matches('😂 I can’t test this today', entries), true);
  assert.equal(rules.matches('Second part: more text', entries), true);
  assert.equal(rules.matches('Second part: more text', []), false);
});
