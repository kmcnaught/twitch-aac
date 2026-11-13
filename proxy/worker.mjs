const MODEL = 'claude-haiku-4-5-20251001';
const MAX_BYTES = 32768;

async function readJson(request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('Send application/json.'), { status: 415 });
  }
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('Missing request body.'), { status: 400 });
  const chunks = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('Request is too large.'), { status: 413 });
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw Object.assign(new Error('Invalid JSON.'), { status: 400 }); }
}

async function validToken(header, expected) {
  if (!expected || expected.length < 32 || !header?.startsWith('Bearer ') || header.length > 1024) return false;
  const digest = async value => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [a, b] = await Promise.all([digest(header.slice(7)), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin' };
    const reply = (body, status = 200, extra = {}) => new Response(JSON.stringify(body), { status, headers: { ...headers, ...extra } });
    const error = (message, status) => reply({ error: { message } }, status);
    // Origin restrictions are an extra browser safeguard; the token is required independently.
    if (!origin || !allowed.includes(origin)) return error('This website is not allowed.', 403);
    headers['Access-Control-Allow-Origin'] = origin;
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...headers,
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app',
        'Access-Control-Max-Age': '600' } });
    }
    if (!env.PROXY_ACCESS_TOKEN || env.PROXY_ACCESS_TOKEN.length < 32) return error('Proxy authentication is not configured.', 503);
    if (!await validToken(request.headers.get('Authorization'), env.PROXY_ACCESS_TOKEN)) return error('Proxy access token is missing or incorrect.', 401);
    const url = new URL(request.url);
    const ai = url.pathname === '/v1/messages' && request.method === 'POST';
    const youtubeLive = url.pathname === '/yt-chat/live' && request.method === 'GET';
    const youtubePoll = url.pathname === '/yt-chat/poll' && request.method === 'POST';
    if (!ai && !youtubeLive && !youtubePoll) return error('Not found.', 404);
    try {
      if (ai) {
        if (!env.ANTHROPIC_API_KEY) return error('Claude is not configured.', 503);
        const body = await readJson(request);
        const message = body?.messages?.[0];
        if (!Array.isArray(body?.messages) || body.messages.length !== 1 || message?.role !== 'user' || typeof message.content !== 'string' || !message.content.trim() || message.content.length > 24000) return error('Send one user message of at most 24,000 characters.', 400);
        const maxTokens = Number.isInteger(body.max_tokens) && body.max_tokens > 0 ? Math.min(body.max_tokens, 1024) : 1024;
        const upstream = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', signal: AbortSignal.timeout(20000),
          headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          // Construct an allowlisted payload: never forward tools, arbitrary models, or caller headers.
          body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: message.content }] })
        });
        if (!upstream.ok) return error(upstream.status === 429 ? 'Claude usage limit reached. Try again later.' : 'Claude request failed. Check your proxy configuration and API account.', upstream.status === 429 ? 429 : 502);
        const data = await upstream.json();
        return reply({ content: (data.content || []).filter(block => block.type === 'text').map(block => ({ type: 'text', text: block.text })) });
      }
      if (!env.YOUTUBE_API_KEY) return error('YouTube is not configured on this proxy.', 503);
      let endpoint;
      if (youtubeLive) {
        const videoId = url.searchParams.get('videoId') || '';
        if (!/^[\w-]{11}$/.test(videoId)) return error('Invalid YouTube video ID.', 400);
        endpoint = new URL('https://www.googleapis.com/youtube/v3/videos');
        endpoint.search = new URLSearchParams({ part: 'liveStreamingDetails', id: videoId, key: env.YOUTUBE_API_KEY }).toString();
      } else {
        const body = await readJson(request);
        if (typeof body?.liveChatId !== 'string' || !body.liveChatId || body.liveChatId.length > 512 || (body.pageToken != null && (typeof body.pageToken !== 'string' || body.pageToken.length > 2048))) return error('Invalid YouTube chat request.', 400);
        endpoint = new URL('https://www.googleapis.com/youtube/v3/liveChat/messages');
        endpoint.search = new URLSearchParams({ part: 'snippet,authorDetails', liveChatId: body.liveChatId, maxResults: '200', key: env.YOUTUBE_API_KEY }).toString();
        if (body.pageToken) endpoint.searchParams.set('pageToken', body.pageToken);
      }
      const upstream = await fetch(endpoint, { signal: AbortSignal.timeout(20000) });
      if (!upstream.ok) return reply({ error: upstream.status === 403 ? 'stream_ended' : 'YouTube request failed.' }, upstream.status === 403 ? 403 : 502);
      const data = await upstream.json();
      if (youtubeLive) {
        const liveChatId = data.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
        return reply(liveChatId ? { liveChatId } : { error: 'no_live_stream' });
      }
      return reply({ messages: (data.items || []).map(item => ({ author: item.authorDetails?.displayName || 'YouTube viewer', text: item.snippet?.displayMessage || '' })), nextPageToken: data.nextPageToken, pollingIntervalMillis: Math.max(data.pollingIntervalMillis || 5000, 5000) });
    } catch (failure) {
      return error(failure.status ? failure.message : 'Proxy service unavailable. Please try again later.', failure.status || 502);
    }
  }
};
