# WARDOGS Pilot Announcement Generator

A local, offline, single-page app that displays a rotating stream of
procedurally-generated pilot/passenger announcements — built to sit on a
second monitor while you fly transport missions in WARDOGS.

It is a **content-agnostic engine**. All jokes live in one file,
[`data/content.json`](data/content.json); the JavaScript only knows about
templates, phrase categories, weights, contexts, and history. Add a
phrase, it's live — no code changes.

## Running it

Just double-click [`index.html`](index.html). Everything needed to run is
already in this folder, including a pre-built `data/bundle.js` (see
"Why bundle.js exists" below). No server, no install, no internet
connection required.

## The one data file

Everything content-related lives in [`data/content.json`](data/content.json):

```json
{
  "templates": [ /* announcement skeletons */ ],
  "phrases": [ /* every phrase, across every category, in one flat array */ ]
}
```

### Adding / editing phrases

Add an entry to the `"phrases"` array:

```json
{
  "id": "landing_582",
  "category": "landingWarning",
  "text": "Please prepare for what management continues to describe as a landing.",
  "styles": ["landing", "incompetent"],
  "contexts": ["any"],
  "weight": 1
}
```

- `id` — must be unique across the entire `phrases` array.
- `category` — which placeholder category this phrase belongs to (see
  "How placeholders map to categories" below). This is what makes it
  available to templates — position in the array doesn't matter, only
  this field.
- `text` — the phrase. Can itself contain dynamic placeholders like
  `{{CURRENT_TIME}}`.
- `styles` *(optional)* — humor styles this phrase belongs to (see
  Settings > Humor styles). Omit for a style-neutral phrase that's
  always eligible.
- `contexts` *(optional)* — when this phrase is eligible. Defaults to
  `["any"]`. Use time contexts like `"morning"`, `"fridayNight"`,
  `"afterMidnight"` etc. to make a phrase time-specific — see the
  `"greeting"`/`"timeComment"` entries in `content.json` for real examples.
- `weight` *(optional)* — relative selection likelihood. Defaults to 1.
- `tags` / `requires` / `excludes` *(optional)* — coherence hooks. A
  phrase can declare `tags: ["formal"]`; another phrase can then say
  `excludes: ["formal"]` to avoid pairing with it in the same
  announcement, or `requires: ["formal"]` to only appear alongside one.

Inventing a brand-new category is just picking a new `category` string
and giving a template a matching `{{PLACEHOLDER}}` — no code change,
no new file.

### Adding / editing templates

Add an entry to the `"templates"` array:

```json
{
  "id": "landing_582_template",
  "weight": 1,
  "length": "medium",
  "template": "{{CAPTAIN_INTRO}} {{LANDING_WARNING}} {{CLOSING}}"
}
```

- `length` must be `"short"`, `"medium"`, or `"long"` — controls which
  probability bucket the template competes in (Settings > Length
  probabilities).
- `template` is the string assembled at generation time. Any
  `{{SOME_PLACEHOLDER}}` token is resolved against a phrase category (see
  below) or a computed variable.
- `timeAware: true` *(optional)* — marks a template as inherently
  time-flavored. Such templates are only eligible during the
  "time-aware roll" (Settings > Time-aware probability, 25% by default),
  keeping the rest of the rotation timeless.

### Picking up your edits

Re-run the build so `file://` mode picks up changes to `content.json`:

```bash
node build.js
```

or, if you don't have Node installed (Windows-native option, no installs
required):

```powershell
powershell -ExecutionPolicy Bypass -File build.ps1
```

Either one just regenerates `data/bundle.js` from `content.json` — never
required to run the finished app itself, only to pick up edits. You can
also skip the build step entirely by running the app via a local static
server instead — see below — which loads `content.json` directly.

## How placeholders map to categories

A placeholder like `{{SAFETY_WARNING}}` is converted to camelCase —
`safetyWarning` — and matched against phrase entries whose `"category"`
field equals that string. So:

| Placeholder            | Category        |
|-------------------------|-----------------|
| `{{OPENING}}`           | `opening`       |
| `{{WELCOME}}`           | `welcome`       |
| `{{CAPTAIN_INTRO}}`     | `captainIntro`  |
| `{{PILOT_JOKE}}`        | `pilotJoke`     |
| `{{PASSENGER_JOKE}}`    | `passengerJoke` |
| `{{DESTINATION}}`       | `destination`   |
| `{{SAFETY_WARNING}}`    | `safetyWarning` |
| `{{WEATHER_INTRO}}`     | `weatherIntro`  |
| `{{COMBAT_WEATHER}}`    | `combatWeather` |
| `{{LANDING_WARNING}}`   | `landingWarning`|
| `{{TAKEOFF_LINE}}`      | `takeoffLine`   |
| `{{FLIGHT_TIME}}`       | `flightTime`    |
| `{{CLOSING}}`           | `closing`       |
| `{{GREETING}}`          | `greeting`      |
| `{{TIME_COMMENT}}`      | `timeComment`   |

A few placeholders are computed directly instead of pulled from a phrase
pool: `{{CURRENT_TIME}}`, `{{DAY_OF_WEEK}}`, `{{TIME_PERIOD}}`, `{{HOUR}}`,
`{{MINUTE}}` — these come from the live system clock, not JSON.

## Architecture

```
index.html
css/
  styles.css
js/
  timeContext.js   - pure function: Date -> { hour, period, contexts[], ... }
  dataLoader.js     - loads + validates data/content.json (or bundle.js),
                       indexes every phrase into per-category pools
  history.js        - localStorage-backed anti-repeat ring buffer
  generator.js       - template selection, phrase resolution, weighting,
                       coherence (styles/contexts/tags), normalization,
                       anti-repeat rerolling, and the testGenerator() stats tool
  app.js            - UI: timer, buttons, settings panel, status bar
data/
  content.json        - THE single content file: { templates: [...],
                       phrases: [...] } (small sample set — the real
                       library will be supplied separately and can grow
                       into the thousands with zero code changes)
  bundle.js           - AUTO-GENERATED by build.js/build.ps1; lets
                       index.html work via file:// (see below)
build.js              - optional dev-only script: node build.js regenerates
                       data/bundle.js from content.json
build.ps1              - same thing, no Node required (Windows PowerShell)
dev-server.ps1          - optional tiny local static file server, no
                       installs required, alternative to the bundle
```

### Why `bundle.js` exists

Browsers block `fetch()` of local files when a page is opened via
`file://` (no server). To keep "double-click index.html" working while
still keeping content in plain JSON, `data/bundle.js` is a generated file
that just does `window.WARDOGS_DATA = { ...the contents of content.json... }`
and is loaded with a normal `<script>` tag (which *is* allowed under
`file://`). `js/dataLoader.js` prefers this bundle when present, and
falls back to `fetch()`-ing `data/content.json` directly if it's absent —
which lets you skip the build step entirely by running a tiny local
static server instead, e.g.:

```bash
npx serve .
# or
python -m http.server 8000
# or, no installs needed on Windows:
powershell -ExecutionPolicy Bypass -File dev-server.ps1
```

Either way, **`content.json` is always the source of truth** — you never
hand-edit `bundle.js`.

## Anti-repeat system

Every generated announcement is fingerprinted as
`templateId|category:phraseId|category:phraseId|...` and checked against
the last N signatures (Settings > Recent history size, default 30,
persisted in `localStorage`). A collision triggers a reroll (up to 50
attempts) before falling back to allowing the repeat, so a small sample
library can never hang.

## Debug / stress-testing

Open the browser console and run:

```js
testGenerator(10000)
```

It generates 10,000 announcements back-to-back (bypassing the timer),
and logs unique-combination count, duplicate reroll count, unresolved
placeholders, invalid announcements, whitespace/punctuation issues, and
per-template/length usage — useful for sanity-checking a much larger
phrase library later.

Startup also validates the whole library automatically: duplicate IDs,
missing fields, empty text, bad weights/contexts, and templates that
reference an unknown category are all logged as console warnings, and the
offending entry is skipped rather than crashing the app.

## Team picker

A colored TEAM: GREEN / BLUE / RED badge sits above the announcement text
and rerolls at random every time a new announcement is shown — on
rotation, on NEXT, and when opening a share link. It's an independent
coin-flip each time (no anti-repeat), purely client-side.

## Sharing a specific announcement

Hit **SHARE** below the controls to copy a link to whatever announcement is
currently on screen. Rather than embedding the whole sentence, the URL
carries a short code — the template id plus the ordered list of phrase ids
that filled it in, e.g. `?say=standard_flight_001~opening_002,welcome_006,
destination_002,closing_004` — usually 30-90 characters instead of the
200-350 a full announcement would take. There's no server or database
involved; opening the link deterministically re-assembles the exact same
text from `content.json`, so it works the same locally or on GitHub Pages.

Opening a share link shows that exact line immediately, paused (so it won't
get replaced by the timer), with the link stripped from the address bar
right away. Hit **RESUME** to fold back into the normal rotation, or
**NEXT** to jump straight to a fresh random one.

Because the link references phrase/template *ids*, it depends on those ids
still existing in `content.json` — if you later delete or rename an id a
link pointed to, opening that old link just falls back to a fresh random
announcement instead of showing broken text (with a note in the console).
Editing a phrase's `text` in place, or adding new phrases/templates, never
breaks existing links.

## Settings

Gear icon (top right) opens a panel for: rotation interval, history size,
length probabilities (short/medium/long), time-aware toggle + probability,
and per-style enable/disable checkboxes (auto-populated from whatever
styles show up in the loaded phrase library). Everything persists to
`localStorage`; "Reset to Defaults" clears it back to the shipped
defaults.
