const test = require('node:test');
const assert = require('node:assert/strict');
const { Store, normalize, interpolate, EventConnection, TYPES } = require('../notifications.js');
function storage() { const data = new Map(); return { getItem: k => data.get(k), setItem: (k, v) => data.set(k, v) }; }
function message(kind, id = kind, event = {}) { return { metadata: { message_id: id, message_type: 'notification', subscription_type: TYPES[kind][1], message_timestamp: '2026-10-12T12:00:00Z' }, payload: { event: { user_name: 'TestUser', ...event } } }; }
test('all requested events preserve relevant details and anonymous identity', () => {
  for (const kind of Object.keys(TYPES)) assert.equal(normalize(message(kind), 'test').kind, kind);
  assert.equal(normalize(message('raid', 'r', { from_broadcaster_user_name: 'Raider', viewers: 12 }), 'test').username, 'Raider');
  assert.equal(normalize(message('gift', 'g', { total: 5 }), 'test').subscriptions, 5);
  assert.equal(normalize(message('cheer', 'b', { bits: 100, is_anonymous: true }), 'test').username, 'Anonymous supporter');
  assert.equal(normalize(message('redemption', 'p', { reward: { title: 'Hydrate', cost: 50 }, user_input: 'Hello' }), 'test').reward, 'Hydrate');
  assert.equal(normalize(message('automatic', 'a', { reward: { type: 'highlighted_message', channel_points: 100 } }), 'test').points, 100);
  assert.equal(normalize(message('subscribe', 's', { is_gift: true }), 'test'), null);
});
test('queue, outcomes and deduplication survive refresh; channels have independent preferences', () => {
  const disk = storage(); const a = new Store(disk, 'a');
  const event = normalize(message('gift'), 'a');
  assert.equal(a.add(event), true); assert.equal(a.add(event), false);
  a.data.mode = 'ai'; a.data.mappings.gift = 'saved-phrase'; a.finish(event, 'dismissed');
  const restored = new Store(disk, 'a');
  assert.equal(restored.data.events[0].status, 'dismissed'); assert.equal(restored.add(event), false);
  assert.equal(restored.data.mode, 'ai'); assert.equal(restored.data.mappings.gift, 'saved-phrase');
  assert.equal(new Store(disk, 'b').data.mode, 'phrases'); assert.equal(new Store(disk, 'b').data.events.length, 0);
  const pending = normalize(message('raid'), 'a'); restored.add(pending);
  assert.equal(new Store(disk, 'a').data.events.filter(e => e.status === 'pending').length, 1);
  restored.finish(pending, 'spoken'); assert.equal(new Store(disk, 'a').data.events[1].status, 'spoken');
});
test('redemption event IDs prevent duplicate rewards, and storage failure is visible', () => {
  const s = new Store(storage(), 'test');
  assert.equal(s.add(normalize(message('redemption', 'one', { id: 'reward-id' }), 'test')), true);
  assert.equal(s.add(normalize(message('redemption', 'two', { id: 'reward-id' }), 'test')), false);
  let warning = ''; const bad = new Store({ getItem() { return null; }, setItem() { throw Error('quota'); } }, 'test', t => warning = t);
  bad.add(normalize(message('raid'), 'test')); assert.match(warning, /could not be saved/); assert.equal(bad.data.events.length, 1);
});
test('only supported placeholders are expanded', () => {
  assert.equal(interpolate('Thanks {username}: {bits} bits, {subscriptions} gifts, {viewers} viewers, {reward}! {unknown}', { username: 'A', bits: 10, subscriptions: 2, viewers: 3, reward: 'Hydrate' }), 'Thanks A: 10 bits, 2 gifts, 3 viewers, Hydrate! {unknown}');
});
test('WebSocket welcome subscribes correctly, migration retains subscriptions and closes old socket only after welcome', async () => {
  const sockets = [], requests = [], events = [];
  class Socket { constructor(url) { this.url = url; sockets.push(this); } close() { this.closed = true; } }
  const c = new EventConnection({ token: 'test-token', broadcaster: 'b', user: 'u', specs: Object.entries(TYPES), Socket, fetcher: async (url, req) => { requests.push(JSON.parse(req.body)); return { ok: true }; }, onEvent: m => events.push(m), onStatus() {} });
  try {
    c.start(); const old = sockets[0];
    await old.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'original', keepalive_timeout_seconds: 30 } } }) });
    assert.equal(requests.length, 8); assert.equal(requests.find(r => r.type === 'channel.follow').condition.moderator_user_id, 'u');
    assert.deepEqual(requests.find(r => r.type === 'channel.raid').condition, { to_broadcaster_user_id: 'b' });
    await old.onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_reconnect' }, payload: { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=test' } } }) });
    assert.equal(old.closed, undefined); assert.equal(sockets.length, 2);
    await sockets[1].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'migrated' } } }) });
    assert.equal(old.closed, true); assert.equal(requests.length, 8);
    await sockets[1].onmessage({ data: JSON.stringify(message('raid')) }); assert.equal(events.length, 1);
  } finally { c.stop(); }
});
test('temporary subscription failures retry while authorization failures stop', async () => {
  for (const statusCode of [500, 401]) {
    const sockets = [];
    class Socket { constructor() { sockets.push(this); } close() { this.closed = true; this.onclose?.({ code: 1000 }); } }
    const c = new EventConnection({ token: 'fixture', broadcaster: 'b', user: 'u', specs: [['raid', TYPES.raid]], Socket,
      fetcher: async () => ({ ok: false, status: statusCode }), onEvent() {}, onStatus() {} });
    c.start();
    await sockets[0].onmessage({ data: JSON.stringify({ metadata: { message_type: 'session_welcome' }, payload: { session: { id: 'test' } } }) });
    assert.equal(c.stopped, statusCode === 401);
    if (statusCode === 500) assert.ok(c.retryTimer);
    c.stop();
  }
});
