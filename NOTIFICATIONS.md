# Twitch notifications

## Eggbot chat announcements

All other posts from eggbotreal now become **Bot message** notifications, with the original text visible and the usual editable Speak/Dismiss response. Saved phrases can be mapped to Bot message (or tagged `event:bot`); AI mode uses the original message as untrusted event data. Phrase-bank mode still makes no notification AI requests.

Messages beginning with `Dad Joke:` (case-insensitive) or `!` (including `!Disabled`) are excluded, after removing any /me wrapper. Bot messages tagged by Twitch as replies to a `!command` are also excluded. A plain, unthreaded command response cannot be identified from reply metadata; its response wording would need a separate filter. Ordinary bot posts containing a command name elsewhere remain available.

By default, StreamAAC reads announcements from the exact Twitch login `eggbotreal` for follows, subscriptions, resubscriptions, individual gifts and raids. This uses the existing Twitch chat connection and works even if direct EventSub is unavailable or subscription permissions are missing. It only catches new announcements while chat is connected; it cannot retrieve earlier bot messages. Bits and channel points still require direct Twitch events until their bot formats are configured in code.

In Notifications Settings, the large **Use eggbotreal announcements** control is saved per channel. When enabled, those five event types use only the bot; their direct Twitch subscriptions are excluded and any overlapping deliveries are ignored. Switch it off to use the direct Twitch subscriptions instead. Existing pending notifications and history remain available.

The supported formats are the user-provided announcements: `Name followed!`, `Name gifted a Tier 1 sub to Recipient CrreamAwk They've gifted 47 subs in total!`, `Name resubscribed with Prime (7 months) CrreamAwk Message`, `Name subscribed with Tier 2.`, and `Name is raiding with a party of 25!`. Gifts count as one subscription; the trailing total is a lifetime count. The recipient is available as `{recipient}` in saved response phrases. The emote delimiter is excluded from the response data. All other saved response placeholders and speech/history actions continue to work.

Bot recognition runs before the normal ignored-bot filter. The user's ignored-bot settings remain unchanged. Twitch message IDs, requested via IRC tags/commands capabilities, deduplicate repeated deliveries even after refresh. Bundled IRC messages are processed separately. No announcement triggers speech or focus changes. See [Twitch IRC capabilities and delivery semantics](https://dev.twitch.tv/docs/chat/irc/).

Run `node tests/eggbot.test.cjs` for parser and chat-ingestion tests. The browser simulation's Add bot announcements button sends all five formats through the chat handler and an overlapping direct raid to check source filtering. Live eggbot delivery still requires real-world verification.

Open **Notifications** beside Chat Mode. Events remain pending until **Speak** finishes successfully or **Dismiss** is selected. Closing the panel preserves the queue. Edit the response directly or use Response options to choose a saved phrase. Notifications speak through the configured browser or ElevenLabs voice; they do not automatically post acknowledgements to chat. Stop speaking keeps the event available.

**Settings** remembers the response mode and phrase mappings separately for each channel. New channels default to Phrase bank only. Map any existing saved phrase to an event, or use a phrase tagged `event:raid`, `event:follow`, `event:subscribe`, `event:resubscribe`, `event:gift`, `event:cheer`, `event:redemption`, or `event:automatic`. Existing starter event phrases are matched by label where available; a neutral built-in phrase fills any gaps. Saved phrase data and import/export formats are unchanged.

Placeholders: `{username}`, `{bits}`, `{viewers}`, `{subscriptions}`, `{months}`, `{reward}`, `{points}`. For example: `Thank you for the raid, {username}! Welcome to all {viewers} viewers!`

AI mode uses the existing response proxy/model, one request at a time with a timeout and phrase fallback. Each suggestion is editable; AI never starts speech. Choosing Phrase bank only cancels queued/in-flight notification AI requests and retains edited responses. In AI mode, Response options includes Generate a new AI suggestion, including for past events.

History includes pending, spoken and dismissed events, displayed in batches of 30. Events, edits, outcomes, action records, modes and mappings are saved in this browser under `streamaac_notifications_v1:<channel>`. Storage errors are shown. Data does not transfer to another browser or device.

## Twitch access

Reconnect Twitch from setup to authorize the added scopes: `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, `channel:read:redemptions`, alongside the existing chat scopes. Follow subscriptions require the logged-in account to be the broadcaster or a moderator; subscriptions, cheers and redemptions require the broadcaster's user token for WebSocket EventSub. A moderator login to SpecialEffect therefore cannot receive every event. The panel reports connected events and subscription errors. Do not place a client secret in this static application.

The app subscribes to follows (v2), subscriptions, shared resubscription messages, aggregate gifts, incoming raids, cheers, custom redemptions and automatic redemptions (v2). Gift-recipient subscription messages are suppressed to avoid duplicating gift acknowledgements. Twitch does not send every recurring subscription renewal as a resubscription message: the viewer must share it.

One EventSub WebSocket is used, with temporary overlap for Twitch-directed migration. Migration retains subscriptions; unexpected disconnects reconnect with backoff and resubscribe. Message IDs are persisted for deduplication, and redemption IDs guard against duplicate rewards. Bootstrap/API network errors and transient subscription failures retry. Twitch cannot replay events missed during a complete outage; events during that gap may be missed.

References: [WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [subscription types and authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

## Validation

On iPad, returning to the page, restoring it from the browser's page cache, or regaining network access checks the event socket's last heartbeat deadline. A stale connection is replaced and resubscribed; a healthy connection is retained. Bootstrap requests time out rather than staying stuck after suspension. Settings contains a short connection status, a separate resubscription permission/connection status, and a Reconnect notifications button. Connection messages do not appear in Pending or History. Events missed while the browser was suspended cannot be recovered from Twitch.

Run `node tests/notifications.test.cjs`, `node tests/elevenlabs-settings.test.cjs`, and `node quiet-mode.test.cjs` from the repository root. Check JavaScript syntax including the embedded HTML scripts.

Serve locally and open `tests/notifications-preview.html` for a simulation with isolated test storage, fake Twitch/AI responses, and silent simulated speech. This fixture blocks external service requests. Use Add raid, Finish simulated speech and Refresh app to exercise queueing and speech outcomes. It is excluded from published assets.

Live broadcaster authorization, Twitch event delivery, ElevenLabs/browser audio on the user's PC, and eye-gaze ergonomics still require real-world testing. No new runtime dependencies or build step are introduced.
