const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../bot-patterns.js');
const { parseBotAnnouncement } = require('../notifications.js');
test('patterns persist, change immediately, and can be emptied', () => {
  const values = new Map([['ignored_bots', 'testbot']]);
  const storage = {getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v)};
  global.localStorage = storage;
  assert.deepEqual(api.load(), []);
  assert.equal(parseBotAnnouncement('testbot', 'Welcome Alex!', 'test', '1').kind, 'bot');
  api.save([{kind:'follow', template:'Welcome {username}!'}]);
  assert.equal(api.load()[0].template, 'Welcome {username}!');
  assert.equal(parseBotAnnouncement('testbot', '  welcome Alex!  ', 'test', '2').username, 'Alex');
  api.save([]);
  assert.equal(parseBotAnnouncement('testbot', 'Welcome Alex!', 'test', '3').kind, 'bot');
});
test('literal punctuation and regex symbols are literal, captures extract counts', () => {
  const entries = [{kind:'gift',template:'[{username}] gave {subscriptions} gifts to {recipient}!'}];
  assert.deepEqual(api.match('[Alex] gave 4 gifts to Sam!', entries), {kind:'gift',username:'Alex',subscriptions:4,recipient:'Sam'});
  assert.equal(api.match('Alex gave 4 gifts to Sam!', entries), null);
  assert.equal(api.match('[Alex] gave -4 gifts to Sam!', entries), null);
  assert.equal(api.match('[Alex] gave 999999999999999999 gifts to Sam!', entries), null);
});
test('invalid saves preserve prior values and ambiguous placeholders are rejected', () => {
  const values = new Map(); const storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  api.save([{kind:'raid',template:'{username}: {viewers}'}], storage);
  for (const template of ['hello', '{username} {unknown}', '{username} {username}', '{username}{tier}Z', 'Hello\n{username}']) {
    assert.throws(() => api.save([{kind:'follow',template}],storage));
  }
  assert.equal(api.load(storage)[0].kind, 'raid');
  assert.throws(()=>api.validate([{kind:'unknown',template:'{username}'}]));
  assert.equal(api.match('x'.repeat(2001), []), null);
});
test('multiple variable fields fail quickly without exponential backtracking', () => {
  const entry = {kind:'gift', template:'{username} {tier} {subscriptions} {months} {viewers} {lifetimeGifts} {supporterMessage} {ignore} Z'};
  const start = Date.now();
  assert.equal(api.match('a ' + '1 '.repeat(900), [entry]), null);
  assert.ok(Date.now() - start < 1000);
});

test('final text capture preserves punctuation inside a message', () => {
  const result = api.match('Alex said Thanks! Yay!', [{kind:'resubscribe',template:'{username} said {supporterMessage}!'}]);
  assert.equal(result.supporterMessage, 'Thanks! Yay');
});
test('text import merges, skips duplicates, round trips, and rejects whole invalid files', () => {
  const values = new Map(); const storage = {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)};
  const text = '\uFEFF# Example\r\nfollow | Welcome {username}!\r\n\r\nraid | {username}: {viewers}\r\n';
  api.importText(text, storage); api.importText(text, storage);
  assert.equal(api.load(storage).length, 2);
  assert.deepEqual(api.parseText(api.exportText(api.load(storage))), api.load(storage));
  const previous = storage.getItem(api.KEY);
  for (const invalid of ['follow | Hi {username}\nwrong | {username}', 'missing separator', '# empty', 'follow | {bad}', 'x'.repeat(100001)]) {
    assert.throws(()=>api.importText(invalid,storage));
    assert.equal(storage.getItem(api.KEY),previous);
  }
});
