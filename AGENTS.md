# Project context

StreamAAC is a browser-based AAC (Augmentative and Alternative Communication)
tool for streaming. It helps users respond to Twitch and YouTube chat using
contextual suggestions, saved phrases, and text-to-speech. Twitch authentication
also enables sending text to chat.

Communication speed, user control, and reliable access to phrases are central
to the product.

## Structure

- `index.html`: setup, preferences, voice configuration, and Twitch login.
- `chat.html`: live chat, suggestions, phrase management, and the main interface.
- `chat-core.js`: shared chat, emote, speech, and helper functions.
- `sample-phrases.js`: starter phrases, seeded only when none are saved.
- `styles.css`: shared styles and light/dark themes.

This is a static application with no build step, package manifest, or repository
test suite. Prefer the existing approach; discuss substantial new dependencies
or framework changes before introducing them. The external AI/YouTube proxy
is not implemented in this repository.

## Product principles

- Preserve the user's intended meaning and control over what is spoken or sent.
  Do not introduce automatic speech or sending without agreement.
- Prioritise low-effort interaction, readable text, generous targets, predictable
  layouts, and clear feedback.
- Avoid making essential actions available only through hover, dragging, precise
  pointer movements, or timed interactions.
- Preserve keyboard access, visible focus, and accessible control names.
- Check changes in both light and dark themes.
- Preserve saved phrases and preferences. Treat localStorage keys and phrase
  import/export formats as existing user data contracts.
- Starter phrases contain example personal details. Do not assume these describe
  the maintainer or every user.
- Do not expose tokens, API keys, private chat content, or personal phrases in
  logs, screenshots, commits, or test fixtures.

## Development and validation

Run locally from the repository root:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

For UI changes, check the affected interaction in a browser, including relevant
small-screen layouts and both themes. For JavaScript changes, check syntax
(`node --check chat-core.js` and `node --check sample-phrases.js`) and exercise
the changed behaviour; these commands do not check scripts embedded in HTML.
Add focused tests when useful; do not introduce a test framework solely for a
trivial styling change.

Distinguish local checks, simulated service responses, and verified live
integrations. Browser speech and eye-gaze usability require appropriate
real-world testing. Twitch OAuth on preview sites may require an approved
redirect URI.

Check git status before editing and preserve unrelated changes. Use the existing
checkout in isolated cloud tasks; do not create a Git worktree unless requested.

## Collaboration and communication

- For substantial work, give a short plan before starting. Ask questions early
  when answers affect behaviour or scope; proceed with sensible defaults for
  routine, reversible choices.
- The maintainer uses AAC. Treat short, unpunctuated, shorthand, or typo-containing
  messages as normal communication. Do not infer technical knowledge from
  writing mechanics or assume a particular access method.
- Reduce typing effort: offer a few clearly labelled options and a recommendation
  when useful. Accept numbers, short phrases, or a different answer.
- Use conversation context to interpret shorthand. Clarify when different
  interpretations would produce meaningfully different results; otherwise
  proceed and briefly state material assumptions.
- Do not treat a delayed response as agreement. Continue independent work while
  waiting for an answer that is required.
- Explain meaningful decisions in plain language as you work, with a concrete
  example when helpful. Define unfamiliar terms briefly; offer more detail
  without making every update a tutorial.
- Give short updates at meaningful milestones. Finish with what changed, what
  was checked, and anything unresolved.
- When helping write in the maintainer's voice, preserve intended meaning, tone,
  humour, directness, and vocabulary. Ask before substantially formalising it.
- When asked to brainstorm, explore options before editing. When asked to
  implement, carry the work through and validate it.

## Review and deployment

Use a branch and PR for review. Cloudflare Workers is connected through its
dashboard. `wrangler.jsonc` defines the `twitch-aac` static-assets Worker and its
preview configuration. `.assetsignore` limits publishing to the five application
files; update it if adding a new public asset. Verify the deployment check and
actual preview URL for each PR rather than assuming a preview succeeded.
No application build command is needed. Production uses `npx wrangler deploy`;
non-production builds use `npx wrangler preview` through the connected dashboard.
Check configuration locally with `npx wrangler deploy --dry-run`.

Do not merge or deploy without user authorization. A request to open a PR permits
committing and pushing its branch, including any preview triggered automatically
by that push; it does not authorize merging into main.
