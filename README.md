# twitch-aac
contextual chat suggestions for quick chatting while streaming


## AI and YouTube proxy

No shared proxy is configured by default. Enter your own HTTPS proxy base URL in
[Settings](settings.html) and press **Save proxy** to enable AI suggestions and YouTube chat. Saving an empty field disables
both. This browser-wide setting is not included in profile exports.

The proxy must support browser CORS requests (including the `x-app: twitch-aac`
header), Anthropic-compatible `POST /v1/messages` requests, and, for YouTube,
`GET /yt-chat/live?videoId=...` and `POST /yt-chat/poll`. The AI requests currently
specify `claude-haiku-4-5-20251001`. Keep upstream API keys on your proxy server and
configure its authentication, usage limits, and allowed origins there. The app
sends the optional proxy access token as a Bearer credential.
Chat context and saved phrase metadata are sent to the configured service.
The personal proxy implementation is included below; hosting must be configured separately.

A protected personal proxy is provided in [proxy/README.md](proxy/README.md).
It has no proxy request-rate limit; Claude usage limits and charges still apply.
