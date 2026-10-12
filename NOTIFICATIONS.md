# Twitch notifications

Open **Notifications** beside Chat Mode. Events remain pending until **Speak** finishes successfully or **Dismiss** is selected. Closing the panel preserves the queue. Edit the response directly or use Response options to choose a saved phrase. Notifications speak through the configured browser or ElevenLabs voice; they do not automatically post acknowledgements to chat. Stop speaking keeps the event available.

**Settings** remembers the response mode and phrase mappings separately for each channel. New channels default to Phrase bank only. Map any existing saved phrase to an event, or use a phrase tagged `event:raid`, `event:follow`, `event:subscribe`, `event:resubscribe`, `event:gift`, `event:cheer`, `event:redemption`, or `event:automatic`. Existing starter event phrases are matched by label where available; a neutral built-in phrase fills any gaps. Saved phrase data and import/export formats are unchanged.

Placeholders: `{username}`, `{bits}`, `{viewers}`, `{subscriptions}`, `{months}`, `{reward}`, `{points}`. For example: `Thank you for the raid, {username}! Welcome to all {viewers} viewers!`

AI mode uses the existing response proxy/model, one request at a time with a timeout and phrase fallback. Each suggestion is editable; AI never starts speech. Choosing Phrase bank only cancels queued/in-flight notification AI requests and retains edited responses. In AI mode, Response options includes Generate a new AI suggestion, including for past events.

History includes pending, spoken and dismissed events, displayed in batches of 30. Events, edits, outcomes, action records, modes and mappings are saved in this browser under `streamaac_notifications_v1:<channel>`. Storage errors are shown. Data does not transfer to another browser or device.

## Twitch access

Reconnect Twitch from setup to authorize the added scopes: `moderator:read:followers`, `channel:read:subscriptions`, `bits:read`, `channel:read:redemptions`, alongside the existing chat scopes. Follow subscriptions require the logged-in account to be the broadcaster or a moderator; subscriptions, cheers and redemptions require the broadcaster's user token for WebSocket EventSub. A moderator login to SpecialEffect therefore cannot receive every event. The panel reports connected and unavailable event types. Do not place a client secret in this static application.

The app subscribes to follows (v2), subscriptions, shared resubscription messages, aggregate gifts, incoming raids, cheers, custom redemptions and automatic redemptions (v2). Gift-recipient subscription messages are suppressed to avoid duplicating gift acknowledgements. Twitch does not send every recurring subscription renewal as a resubscription message: the viewer must share it.

One EventSub WebSocket is used, with temporary overlap for Twitch-directed migration. Migration retains subscriptions; unexpected disconnects reconnect with backoff and resubscribe. Message IDs are persisted for deduplication, and redemption IDs guard against duplicate rewards. Bootstrap/API network errors and transient subscription failures retry. Twitch cannot replay events missed during a complete outage; the connection status warns about that gap.

References: [WebSocket handling](https://dev.twitch.tv/docs/eventsub/handling-websocket-events/), [subscription types and authorization](https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/).

## Validation

Run `node tests/notifications.test.cjs`, `node tests/elevenlabs-settings.test.cjs`, and `node quiet-mode.test.cjs` from the repository root. Check JavaScript syntax including the embedded HTML scripts.

Serve locally and open `tests/notifications-preview.html` for a simulation with isolated test storage, fake Twitch/AI responses, and silent simulated speech. This fixture blocks external service requests. Use Add raid, Finish simulated speech and Refresh app to exercise queueing and speech outcomes. It is excluded from published assets.

Live broadcaster authorization, Twitch event delivery, ElevenLabs/browser audio on the user's PC, and eye-gaze ergonomics still require real-world testing. No new runtime dependencies or build step are introduced.
