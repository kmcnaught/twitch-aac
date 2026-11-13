# Personal StreamAAC proxy

This is a separate Cloudflare Worker. The root application Worker is unchanged.
There is no proxy request-rate limit. Claude and Cloudflare account limits still
apply. The Worker restricts each AI request to 32 KiB, one user message of at most
24,000 characters, the existing Haiku model, and 1,024 output tokens.

## Dashboard setup

1. Create a Worker and replace its starter script with `worker.mjs`.
2. In Settings, add these production variables:
   - Secret `ANTHROPIC_API_KEY`: your Claude API key.
   - Secret `PROXY_ACCESS_TOKEN`: a random printable ASCII token of at least
     32 characters, saved privately. This grants access to this personal proxy.
   - Text `ALLOWED_ORIGINS`: exact website origins, comma-separated, without a
     path or trailing slash. For example `https://kmcnaught.co.uk`.
3. Deploy. No rate-limiter bindings are needed.
4. In StreamAAC Settings enter the Worker base URL and its proxy access token,
   then press Save proxy. These values apply to all profiles in that browser.
   The Claude key belongs only on the Worker, never in StreamAAC or source code.

The browser stores the proxy token in localStorage. Anyone with access to the
browser profile or scripts running on the same website origin can read it.
Use a personal token, do not share it, and rotate it on the Worker if exposed.
Changing the token immediately rejects old tokens. CORS is an additional browser
restriction, not authentication. Direct clients can forge the Origin header but
still need the correct token.

For optional YouTube chat, add a Secret `YOUTUBE_API_KEY` for an API key with
YouTube Data API v3 access. AI works without it. Without that secret, the YouTube
routes return a configuration error.

Set Claude workspace spending limits separately in the Claude Console. No
monthly dollar budget is enforced by this Worker. Requests may incur charges.

The script does not log keys, tokens, prompts, or phrase content. Cloudflare's
dashboard logging configuration is separate from this script.

## CLI alternative

From this directory, set the allowed origins in `wrangler.jsonc`, add the secrets
with `npx wrangler secret put ANTHROPIC_API_KEY` and
`npx wrangler secret put PROXY_ACCESS_TOKEN`, then deploy with
`npx wrangler deploy`. Do not commit secret values. The local config is only used
by CLI deployments; dashboard deployments use the dashboard configuration.

Run offline tests from the repository root with `node tests/proxy-worker.test.cjs`.
