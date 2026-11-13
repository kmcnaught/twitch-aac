const { test } = require('node:test');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');

test('personal proxy authenticates without rate-limit bindings and constrains upstream calls', async () => {
  const worker = (await import('../proxy/worker.mjs')).default;
  const originalFetch = globalThis.fetch;
  const originalCrypto = globalThis.crypto;
  globalThis.crypto = webcrypto;
  let calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Hello!' }] }));
  };
  const token = 'offline-fixture-token-'.repeat(3);
  const env = { PROXY_ACCESS_TOKEN: token, ANTHROPIC_API_KEY: 'offline-fixture-key', ALLOWED_ORIGINS: 'https://fixture.invalid' };
  const makeRequest = (overrides = {}) => new Request('https://proxy.invalid/v1/messages', {
    method: 'POST', headers: { Origin: 'https://fixture.invalid', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', ...overrides },
    body: JSON.stringify({ model: 'expensive-unapproved-model', max_tokens: 999999, tools: [{ name: 'unapproved' }], messages: [{ role: 'user', content: 'Hello' }] })
  });
  try {
    assert.equal((await worker.fetch(makeRequest({ Authorization: 'Bearer wrong' }), env)).status, 401);
    assert.equal((await worker.fetch(makeRequest({ Origin: 'https://other.invalid' }), env)).status, 403);
    assert.equal((await worker.fetch(makeRequest(), { ...env, PROXY_ACCESS_TOKEN: '' })).status, 503);
    assert.equal(calls.length, 0);
    const result = await worker.fetch(makeRequest(), env);
    assert.equal(result.status, 200);
    assert.equal(result.headers.get('Access-Control-Allow-Origin'), 'https://fixture.invalid');
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://api.anthropic.com/v1/messages');
    const payload = JSON.parse(calls[0].options.body);
    assert.equal(payload.model, 'claude-haiku-4-5-20251001');
    assert.equal(payload.max_tokens, 1024);
    assert.equal(payload.tools, undefined);
    assert.equal(calls[0].options.headers['x-api-key'], env.ANTHROPIC_API_KEY);
    assert(!JSON.stringify(await result.json()).includes(env.ANTHROPIC_API_KEY));

    const big = new Request('https://proxy.invalid/v1/messages', { method: 'POST', headers: { Origin: 'https://fixture.invalid', Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: 'x'.repeat(33000) });
    assert.equal((await worker.fetch(big, env)).status, 413);
    assert.equal(calls.length, 1);
    const preflight = await worker.fetch(new Request('https://proxy.invalid/v1/messages', { method: 'OPTIONS', headers: { Origin: 'https://fixture.invalid' } }), env);
    assert.equal(preflight.status, 204);
    assert.match(preflight.headers.get('Access-Control-Allow-Headers'), /Authorization/);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.crypto = originalCrypto;
  }
});
