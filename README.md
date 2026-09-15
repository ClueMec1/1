[README (1).md](https://github.com/user-attachments/files/32264362/README.1.md)
# Neumify

A family-only PWA: an open, categorized photo/video/music feed, a
WhatsApp-style chat, a shared calendar, voice-guided recipes, a
private AI assistant per person, and host approvals — all in **one
file**, `index.html`.

## Important: a real bug just got fixed — read this once

Every previous version of `index.html` created a `sw.js` file but
**never actually registered it** — no `navigator.serviceWorker.register(...)`
call existed anywhere. That means the service worker sat there
completely inert this whole time, and every "I bumped the cache
version" fix in earlier rounds did nothing at all. This version
finally registers it, and adds logic to actively check for updates
and auto-reload once when a new version takes over — so a phone that's
just backgrounded (not force-closed) still picks up changes instead of
silently sitting on stale content.

**One manual step you'll likely need on each device, one time only:**
since no service worker was ever controlling the page before, and
phones (especially "Add to Home Screen" installs) can hold onto old
cached content stubbornly at the browser level too, you may need to
force one fresh load to get *this specific fix* onto a device — after
that, updates should propagate on their own. Easiest ways: remove and
re-add the home screen icon, or open the URL fresh in the browser
(not the home-screen icon) and hard-refresh once.

## Important: a second real bug just got fixed — likely explains several other symptoms at once

`enterApp()` — the function that runs the moment you're approved and
signed in — was being called again on **every single change** to your
member document, not just at login. Once presence tracking, points,
and profile photos were all added, that meant it was firing roughly
every 30 seconds (the presence heartbeat) or any time you earned
points, changed your photo, etc. And at the end of it, it
unconditionally re-ran the app's navigation logic for whatever screen
you were currently on.

Two concrete symptoms this caused: on the **AI tab**, that navigation
re-run included a session reset, so an in-progress conversation could
get silently wiped while waiting for a reply — which looks exactly
like "my question disappeared, then the answer popped up out of
context" a few seconds later. In an open **chat room**, it meant the
message list and the typing/presence listeners were being torn down
and rebuilt roughly every 30 seconds — which would make online status
and typing indicators flicker in and out rather than staying up,
since they rarely got more than a few seconds to actually display
before being reset.

Fixed with a simple guard: the navigation logic now only runs on the
*first* entry into the app each session. Everything else in
`enterApp()` (avatar, points badge, host-tab visibility) still updates
live exactly as before — only the destructive re-navigation was the
problem.

## Important: a third real bug just got fixed — re-registering was silently resetting people

Member records are keyed by phone number, and the registration form
used to `setDoc(..., { merge: true })` with every field, including
`status` and `isHost`, every single time someone submitted it — with
no check for whether an account already existed there. That meant
anyone who cleared their browser, switched devices, or reinstalled
and had to fill out the name/phone form again would silently get
**their approved status reset to pending, their host status reset to
false, and their original join date overwritten** — even though they
were already a known, approved member.

Fixed properly: registering now checks for an existing account at
that phone number first. If one exists and the name matches, it just
signs back into that same account — no re-approval, no lost host
status, no reset join date. If the phone matches but the name
doesn't (a shared household number, most likely), it asks for
confirmation before signing in as the existing name, rather than
silently either overwriting someone's account or refusing outright.

## Switching between accounts on one shared device

The "switch user" button in the top bar used to just wipe the
current sign-in and dump you on a blank registration form — meaning
switching back to whoever it was a minute ago meant retyping their
name and phone number from scratch every time.

It now remembers every account that's successfully signed in on that
specific device (name, photo, up to the 8 most recent) and offers
them as a tap-to-switch list — no retyping. **"+ Add another
account"** goes to a normal blank registration, for a second family
member — a kid, say — signing in on the same shared tablet or phone
for the first time; their account joins the remembered list too the
moment they're approved, right alongside whoever was already using
that device. Any remembered account can be removed from the list
with the ✕ next to it, for a device that shouldn't keep remembering
someone (a family computer at a grandparent's house, say) — that
only forgets it locally on that device; the account itself, and
everything in it, is untouched.

This is stored per-device in `localStorage`, not synced anywhere —
it's purely "which accounts has this specific browser seen before,"
using the same no-password, approval-based trust model the rest of
this app already runs on rather than adding a new one.

## Important: a fourth real bug just got fixed — this is likely why updates reached the computer but not the phone

The service worker's `fetch` handler was serving the app shell
(`index.html` itself) **cache-first** — meaning once a device had a
version cached, it would keep serving that exact cached copy
indefinitely, and only had a chance to update when a brand-new
service worker fully installed, activated, and reloaded the page.
That whole chain depends on the browser noticing `sw.js` changed and
running its update cycle promptly — and that cycle is well known to
be sluggish or inconsistent specifically for **iOS home-screen
PWAs** (an "installed" standalone app on iPhone/iPad doesn't check
for service worker updates nearly as eagerly as a normal browser tab
does). A desktop browser tab, checking more readily, would pull the
new version while a phone sat on an old cached one indefinitely —
exactly the split reported.

Fixed at the actual source: the app shell is now fetched
**network-first**, falling back to the cache only if the network
genuinely fails (offline). Every load now tries to get the newest
version directly, rather than the newest version being something
that depends on a background update cycle completing correctly on
every individual device. Firestore, Storage, the Gemini API, Hebcal,
GIPHY, chess.js's CDN, uploaded media, and every embedded game are
untouched by any of this — they were never cached and still aren't;
this only ever affected `index.html` and `manifest.json`.

**One more one-time step, same as before:** this fix has to reach a
device before it can help that device — a phone stuck on an old
cached version needs to successfully load *this* update once, the
same way as the original service-worker-registration fix earlier.
Removing and re-adding the home screen icon (or opening the plain
URL in the browser and hard-refreshing once) is still the most
reliable way to force that. After this specific update lands,
everything from here on should update the same way on phone as it
already does on computer.

## Important: a fifth real bug just got fixed — "Start cooking" could silently fail

`scaleIngredientText` (the serving-size math) called `.match()` on
each ingredient with no check that it was actually a string — if any
ingredient in a recipe wasn't a clean string for any reason, this
threw an error with nothing catching it. Since that happened inside
`startCookMode`, *before* the line that actually shows the Cook Mode
screen, the visible symptom was exactly what got reported: pick a
serving size, the dialog closes, and you're just back on the Recipes
list with no explanation at all.

The first fix added a safety net around it — but a safety net that
only shows a generic "something went wrong" message, with the actual
error swallowed and never seen, isn't a real fix, just a nicer-looking
symptom. That generic message showed up again, which confirmed
something was still throwing further in.

**Fixed properly this time**, all the way through `buildCookSequence`:
every piece of a recipe's data (`parts`, each part's `ingredients` and
`steps`, each step's `text`) is now explicitly checked to actually be
the type it's supposed to be before anything is done with it, falling
back to sensible empty defaults rather than assuming the data is
always shaped correctly. Tested directly against six different kinds
of deliberately broken recipe data (missing parts, `parts` not even
being an array, `null` ingredients, steps with no text, mixed-in
`undefined`/numbers where strings were expected) — all six now build
a working Cook Mode sequence instead of throwing. On top of that,
`startCookMode` now: logs the *real* error to the browser console if
anything still goes wrong (open dev tools to see it, rather than
only ever seeing a generic message), automatically retries without
scaling first if scaling was involved (so a scaling issue specifically
never blocks cooking a recipe outright), and only shows the
plain-language alert as the last resort, with the actual error
message included in it.

That error-message logging is exactly what surfaced the *next* bug
immediately: `currentCookRecipe is not defined`. Its `let
currentCookRecipe = null;` declaration had been dropped somewhere
across the many recent edits to this area — it was still being
*used* in four places, just never declared. Since this app runs as
an ES module (always strict mode), assigning to an undeclared
variable throws immediately rather than silently creating a global,
which is exactly what happened. Restored, and — since this is the
second time a declaration has gone missing this way in this
project's history — the whole file was swept afterward with a script
checking every variable used in an assignment against every `let`/
`const`/`function`/`import` declaration in the file, to check for any
other lurking instances of the same thing. Several false positives
turned up (HTML/SVG attributes and API query-string parameters
inside template literals look like assignments to a simple regex but
aren't real code, and a few genuine variables declared on a shared
comma-separated line like `let a, b, c;` weren't caught by the
sweep's own pattern) — every one of those was checked by hand and
confirmed to actually be declared correctly. `currentCookRecipe` was
the only real instance found.

## Why one file right now (and what changes later)

## Bottom nav redesigned — two capsules, and hidden outside Feed

With ten-plus tabs now (Feed, Today, Chat, Calls, Torah, Family Tree,
Games, Calendar, Recipes, AI, and Host for the host), the single-row
phone nav had grown into a horizontally-scrolling strip — and a
scroll hint most people never notice means most people never
discovered everything past what fit on the first screen.

**Two rows instead of one scrolling row** — both visible at once, no
sliding required to see the rest of them. Five tabs on top, the rest
below, each its own separate rounded capsule rather than one long bar.

**Outside of Feed, the nav disappears entirely on a phone** — every
other screen gets the full display instead of sharing it with a nav
bar that's now taller than before. A back arrow appears in the top
bar as the only way home, returning to Feed, where the nav reappears
to pick somewhere else to go. This is a deliberate hub-and-spoke
design: Feed is home base, everything else is a full-screen visit you
explicitly return from — exactly so the taller two-row nav doesn't
end up eating more of the screen than the single row it replaced.

**Desktop is untouched** — the sidebar never had the scrolling
problem this solves (it has the vertical room for every tab already),
so it stays permanently visible regardless of which tab is open, the
same as before.

## Visual theme — gradient background, glass nav, no layout changes

The app now has a colorful pink-to-orange gradient as its background,
and the nav (bottom pill on phones, sidebar on desktop) plus the top
bar use a frosted-glass look (translucent + blurred) instead of solid
white — inspired by a reference image, but deliberately **not**
copying its actual layout, since that image was an ad mockup, not a
real app screen. Everything people actually interact with — every
card, form, message bubble, button position, and the whole navigation
structure — is untouched; only the background and the nav/top bar's
own colors changed. Mobile nav icons are also slightly bigger now (20px → 24px), as asked.

This was deliberately scoped narrowly: the main content area (`main`)
keeps its own light, nearly-opaque background sitting on top of the
gradient, specifically so none of the existing dark-text-on-light
color combinations throughout the app needed to be touched or
re-audited for contrast — the risk in a full-app re-theme is
exactly the kind of thing that's easy to get subtly wrong in places
that don't get checked, so this keeps the blast radius to just the
outer chrome.

This app used to be split into a separate HTML file per screen. It's
temporarily consolidated back into a single `index.html` — a proper
single-page app with client-side routing (no full page reloads between
screens) instead of one-file-per-screen. This is a deliberate,
temporary trade-off:

- **Right now**, at roughly 1,200 lines, one file is easy to work
  with and easy to hand to an AI assistant to keep extending.
- **Later**, once this file is pushing toward ~6,000 lines (from
  adding the dual calendar, recipes, the AI assistant, etc.), it's
  worth splitting again — at that point, ask for it to be split into
  two, before it approaches the ~10k-line range that gets genuinely
  hard to work with in one sitting.

Until then, resist the urge to split things off piece by piece —
that's exactly the in-between state that's hardest to reason about.
One file, deliberately, until it's time for the next split.

## What's inside `index.html`

It's one long file with clearly labeled sections, in this order:
1. **Auth screens** — Gate (family question), Register (name+phone),
   Waiting (pending approval), Blocked (kicked)
2. **App shell** — top bar, the six views, and a single nav element
   that's a floating bottom pill on phones and becomes a left sidebar
   on tablets/desktop (one `@media (min-width: 860px)` block — same
   buttons, same JS, just repositioned)
3. One `<script type="module">` at the bottom, itself split into
   commented sections: CONFIG, ICONS, SHARED HELPERS, STATE/SCREEN
   SWITCHING, BOOT, ROUTING, then one section per view (FEED, CHAT
   LIST, ROOM, CALENDAR, RECIPES, COOK MODE, AI, HOST)

**Routing:** there's no page navigation anymore — switching "screens"
just hides/shows a `<div class="view">` and updates `location.hash`
(`#/feed`, `#/chat`, `#/room/<chatId>`, `#/calendar`, `#/recipes`,
`#/ai`, `#/host`), so the back button and reloading both still make
sense. Firestore listeners for each view only start the first time
you visit it (`startXIfNeeded()` guards), except the chat *room*
thread, which tears down and resubscribes every time you open a
different conversation — that one's per-conversation, not

**Chat on wide screens** is a real WhatsApp-Web-style split: the chat
list stays visible in a fixed left column while a conversation (or an
empty-state placeholder) fills the rest, instead of the room covering
the whole screen the way it still does on mobile. A pinned **✨
Family AI** row sits at the top of the chat list too — it's not a
separate feature, just a second, more discoverable way into the exact
same private AI conversation that's also reachable from the AI tab.
per-app-lifetime.

manifest.json / sw.js / icons/ stay as separate files — a PWA manifest
and service worker have to be, that's not part of this trade-off.

## File map

```
index.html   the whole app — see structure above
manifest.json    PWA metadata (name, icons, colors)
sw.js            minimal service worker — caches the app shell only, never live data
icons/           put icon-192.png and icon-512.png here
```

## What's in the Feed

The standalone "Media" page is gone — its idea (pasting a link that
auto-embeds) lives inside the Feed now, organized into four
categories: **Video, Music, Pictures, Memories**. Only the host can
post (tap a category, add a title and paste a link — YouTube, Spotify,
Vimeo auto-embed; anything else shows as a plain link; a Picture URL
renders as an image if it loads, falls back to a link if it doesn't).
Everyone can browse and filter by category with the pills at the top.

**Why URLs instead of uploads:** this app doesn't use Firebase
Storage at all anymore. Storage now requires the paid Blaze plan just
to provision a bucket, even though usage within the free quota costs
nothing — Google added that requirement for new projects. Since the
whole point here is staying on the free Spark plan, everything media
goes through a pasted link instead of a direct upload. See "Free
storage, for later" below for what to do if you outgrow that.

## Recipes — AI-organized once, then read aloud while cooking

Paste in the raw ingredients and raw steps for a recipe — copied from
anywhere, in whatever order they came in. The AI reads through it
**once, when you save it**, and restructures it into a clean, guided
sequence:

- If the recipe has genuinely separable components (three cake
  batters, a filling plus a topping), it splits into labeled parts —
  first the full ingredient list, then "Now let's start with the
  white one," with that part's own ingredients and steps, then on to
  the next part.
- Adds a **timer** to any step with a duration ("bake for 25
  minutes"), a **tip** where genuinely useful, and a **temperature
  conversion** when a step names one (°F ↔ °C).
- If no Gemini key is configured yet, or the AI call fails, the
  recipe still saves — it just falls back to one step per pasted
  line, no smart restructuring. Nothing is ever blocked on the AI.

**This only happens once**, at save time — the result is stored, so
cooking it later never calls the AI again; it just plays back what
was already organized.

### Cook for however many you actually need

Recipes now **require** a servings field when adding or editing one —
how many people the recipe as written actually serves. Every time you
start Cook Mode, it tells you that number and asks how many you want
*this time*, pre-filled with the recipe's normal amount — say 8
instead of 4 and every ingredient quantity doubles automatically, so
there's no mental math and nothing to remember for next time either,
since it asks fresh every time.

This is scoped to the **ingredients list only** — step instructions
are left exactly as written. A step might mention a temperature, a
pan size, or a bake time that has nothing to do with batch size, and
reliably telling an actual quantity apart from those in free-form
prose isn't safe to guess at, so it's left alone rather than risking
a wrong rewrite. The scaling itself handles whole numbers, decimals,
and fractions ("1/2", "1 1/2") and renders common fractions back as
symbols (¼ ½ ¾ ⅓ ⅔); an ingredient with no leading number (like "a
pinch of salt") is simply left as-is.

### Two more ways through a recipe when your hands are a mess

**Tap anywhere on the screen to move to the next step.** No need to
aim for the arrow button with a floury finger. This turns off
automatically whenever a timer is running on the current step — a tap
during a timer is genuinely ambiguous (next step? adjust the timer?
there's no way to know which was meant), and someone waiting on a
timer has a natural window to go wash their hands anyway, so the
problem this solves doesn't apply there. A small "👆 Tap anywhere to
go to the next step" hint shows only when it's actually active.

**Shake to advance — entirely optional**, a 📳 toggle in Cook Mode's
header, off by default. Turn it on and a real shake of the phone or
tablet moves to the next step, no touching the screen at all. Turning
it on requires a permission prompt on iPhone/iPad specifically (Apple
requires that prompt to come from a direct tap, which is exactly what
tapping the toggle provides) — declining it just means shake stays
off, everything else keeps working. The preference is remembered
across sessions; the actual motion listener is only ever active while
Cook Mode is open, so it isn't running in the background the rest of
the time.

### A redesigned timer, and a one-time guide to the controls

The timer now has a circular progress ring around the digits (turning
pink in the last 15%) instead of just numbers, and the adjustment
buttons — −1 min, −10 sec, +10 sec, +1 min — are now icon-forward
circular buttons matching the rest of Cook Mode's visual language
instead of plain text pills.

The very first time you cook anything on a given device, Cook Mode
opens with a **quick spoken guide to the controls** — tap anywhere,
say "Luna," the Ask-a-question button — before it gets to the
ingredients. It only plays once ever (tracked per device); after
that, straight to the ingredients like normal.

### Two arrows, real timer controls, and Luna is back — with a safety switch this time

- **Two arrow buttons** — left goes back a step, right goes forward
  (a checkmark on the very last step instead of an arrow, to show
  it'll finish). That's the entire button-based navigation,
  deliberately simple.
- **A bigger timer display**, with real controls underneath it:
  **Pause/Resume** (one button that toggles), and four adjustment
  buttons — **−1:00**, **−0:10**, **+0:10**, **+1:00** — each one a
  plain, repeatable tap (tap +1:00 twice, it's +2 minutes; no hidden
  double-tap gesture to learn, just normal buttons doing what they say).
- **"❓ Ask a question" is a button**, not a voice command — tap it,
  type anything about the recipe, and the AI answers using the
  recipe's ingredients and your current step as context, spoken back
  as well as shown as text.

**Luna, the wake-word voice assistant, is back** — the same version
as before (instant chime feedback the moment she hears her name,
using the recognizer's in-progress transcript rather than waiting for
a full sentence; saying "Luna" alone and then the command as a
separate follow-up both work). She still does nothing until she
hears "Luna" specifically — not the end of a step, not a quiet
moment, not anything else. Voice commands: next/okay, back,
pause/resume, start over, and add or remove any number of minutes.

**A host-controlled safety switch, specifically for this:** Host →
Integrations now has a simple on/off toggle just for Luna, separate
from the Recipes tab itself — given how much back-and-forth this
particular feature has already had, this means it can be switched
off for the whole family without needing another round of code
changes if it's ever unreliable again. Flipping it takes effect
immediately, even mid-cook.

**The mic constantly restarting, making noise and visibly blinking
during normal use — found and fixed.** The actual cause: recipe steps
get read aloud automatically on every step change, and Luna's
microphone was being **fully stopped and restarted** around every
single one of those read-outs, to stop her hearing her own voice. In
a real cooking session with many steps, that's dozens of full mic
stop/restarts, not an occasional glitch — which is exactly the
pattern reported (noise, notification-like sounds, the mic indicator
blinking on and off). Rather than trying to make those restarts
faster, the fix removes the need for them: the microphone now stays
running continuously through Luna's own speech, and a simple flag
tells her to ignore anything picked up while she's talking, instead
of physically stopping and restarting the hardware to achieve the
same result. The mic now only restarts when the *browser itself*
periodically ends a long-running session — a real limitation of the
underlying Web Speech API that can't be removed, but is far less
frequent than "every time a step is read aloud."

A cloud speech API (Google, Azure, etc.) was raised as an
alternative — worth being upfront about the actual tradeoff there:
that would mean a paid, metered service *and* a backend server just
to keep the API key from being visible in this app's page source
(this app has no backend at all right now, by design, to stay free
and simple to host). Since the specific cause here was findable and
fixable without any of that, this fix was tried first rather than
reaching for a bigger, costlier tool. If real testing shows it's
still not reliable enough, a cloud API remains a legitimate next
step — but it's a deliberate cost and complexity tradeoff worth
deciding on directly, not a default move.

**Chime plays on phone, but the command after it isn't heard —
found a likely cause specific to phones.** Every chime was creating a
**brand new `AudioContext`** from scratch. A phone manages the
microphone and speaker as one shared, tightly-controlled audio
session — far more strictly than a computer does — so creating a new
audio context right at the moment the mic needs to keep listening for
the command can interrupt that capture, even though nothing in this
app's own code ever told it to stop. That lines up with what was
reported: the chime proves "Luna" was heard, and the very next moment
— exactly when the command needs to be captured — is exactly where
this kind of interruption would land. Fixed by reusing a single,
persistent `AudioContext` for the whole session instead of creating a
new one on every chime (properly closed when Luna stops, so it
doesn't linger between cooking sessions). This is a real, testable
hypothesis rather than a guaranteed fix — genuine phone testing will
tell whether this was the actual cause or whether something else
(device-specific mic sensitivity, background noise from being held
closer to a face, etc.) is also involved.

**Speech pre-warming now starts even earlier** — the moment the
serving-size dialog opens, not only once Cook Mode itself does. That
dialog is "free" time from a latency standpoint (you're already
looking at it, choosing a number), so the engine gets that whole
window as a head start before its first real sentence is needed.

A genuinely clever idea came up for going further: use an actual
**pre-recorded** audio clip for the very first thing said (which has
no engine-startup delay at all, since it's just a sound file playing)
and use its few seconds of runtime to let the slower text-to-speech
engine warm up in the background, so by the time the *real* speech is
needed, it's instant. The idea itself is sound — it's a legitimate,
well-known technique. What's not possible is the "pre-recorded" part
literally: this app's speech comes from the browser's built-in engine,
which has no way to render its own voice out to a saved audio file —
only to play live through the speakers in the moment. Producing an
actual recording would mean a paid text-to-speech API that generates
and hosts real audio files, which is the same kind of cost-and-backend
tradeoff as the cloud speech-recognition question earlier in this
file — a deliberate step up, not a default one.

So what's actually here is the closest honest version of the same
idea using only what's free: warming the engine up as early as
possible (the serving dialog, now, instead of only Cook Mode itself)
so that by the time the **first spoken thing — a quick one-time guide
to the controls** — plays, the delay should be minimal to begin with.

**Editing a recipe** (the recipe's author, or the host) shows the
**AI-organized version**, not your original raw paste — the
ingredients and steps textareas are pre-filled from the already-sorted
`parts`, so you're refining what the AI produced rather than starting
over. Saving an edit re-runs the same AI organizing pass on your
edited text.

## Family AI — a private assistant per person, with a 3-tier fallback

Each family member gets their **own private conversation** with the
AI. Two different kinds of "memory," deliberately:

- **The conversation itself** lives only in that browser tab's memory
  for as long as you're on the AI tab — it remembers everything you've
  said in the current visit, so follow-up questions work naturally.
  Leave the tab (or reload) and it starts over blank. Nothing about
  what any individual person asks the AI is stored anywhere, or
  visible to anyone else.
- **Family facts** (below) are the opposite: permanent, shared, and
  known to the AI from the very first message of every new
  conversation, for everyone.

### Three things now share one knowledge base — Family AI, Family Tree, and per-chat "Ask AI"

The Family AI tab, the Family Tree, and the "🤖 Ask AI" button inside
every chat room all draw from the same underlying facts and family
tree data now — asking any of the three about something covered by
the other two works, since they're reading from the same place.

**Facts now save themselves during an actual conversation with the
AI, without anyone filling out a form.** Tell it something durable —
"the Hanukkah party is at Goldie's house," "Grandma's birthday is
June 3rd" — and it recognizes that as worth remembering and saves it
on its own; ask it "what's up" and nothing gets saved, because
nothing durable was said. Under the hood, the AI is instructed to
tack on a hidden marker line at the end of its reply whenever
something's worth keeping, which gets quietly extracted and saved to
the shared facts, then stripped back out before you ever see it — so
what you actually read is just its normal, natural reply.

**The per-chat "Ask AI" button works the other way on purpose.** It
reads the last 30 messages of whichever chat you're in *only* to
answer the question in front of it, and knows the same shared facts
and family tree while doing so — but nothing from that chat is ever
saved anywhere. A casual conversation between family members should
never silently turn into a permanent fact; only an actual, direct
conversation with the AI itself does that.

**Manually adding or removing a general family fact is now
host-only** — the "Family facts" button only shows up for the host.
**"My facts" is the opposite — open to everyone, for facts about
themselves specifically.** Personal preferences, allergies, anything
worth the family AI knowing about *you* — "I don't like tuna," say —
without it being lumped into general family-wide facts or requiring
the host to add it on your behalf. Everyone manages their own list;
nobody edits someone else's.

The AI is told plainly who it's currently talking to, so when
chatting with it directly and you say something clearly about
yourself, it recognizes that as personal rather than general and
saves it under your name automatically — using the exact same hidden
end-of-reply marker mechanism as the family-wide facts, just a
second, distinct marker for anything personal. Say "the Hanukkah
party is at Goldie's" and it becomes a general family fact everyone's
AI conversations know; say "I don't like tuna" and it becomes a
personal fact specifically about you. **Personal facts aren't
private, though** — they're organized by who they're about, but
visible to the whole family's AI conversations (the per-chat "Ask AI"
button included), the same as the family tree already is, since the
point is the family AI actually knowing useful things about each
person, not a hidden diary only that person's own conversations can see.

Every auto-saved fact — family-wide or personal — still shows up in
its respective list, clearly marked "(auto-saved from AI chat)" so
it's easy to tell apart from anything added by hand, and remove
anything that shouldn't have been saved.

### Three providers per feature, tried in order — and each feature has its own separate keys

Every AI feature (Family AI chat, Recipes' auto-organizing, and the
Daily Question) calls the same chain shape — **Gemini → Groq →
Puter**, first success wins — but **Chat, Recipes, and Daily
Question each have their own separate Gemini and Groq keys**, not one
shared pair. This is deliberate: it used to be one shared key across
everything, and heavy use of one feature (the Daily Question
generating right at 7pm, say) could slow down or rate-limit someone
having a conversation with the AI at the same moment. Separate keys
mean separate quotas — one feature being busy never affects another.
If Gemini's free-tier usage runs out for a given feature, it quietly
moves to that feature's Groq key; if that's also unavailable or not
set, it falls through to Puter, which needs no host-managed key at
all, so there's always something that works.

1. **Gemini** (tried first) — **[Google AI Studio](https://aistudio.google.com/apikey)**,
   sign in with any Google account, click **Create API key**. No
   payment info needed. You can generate up to three separate keys
   (one per feature) from the same free account if you want fully
   independent quotas, or reuse one key across all three fields — it's
   still one shared quota either way, just organized identically to
   how the app calls it.
2. **Groq** (tried second) — **[console.groq.com](https://console.groq.com)**,
   free signup, generate an API key. Groq runs open models on custom
   chips and is extremely fast, though generally a notch behind
   Gemini's answer quality.
3. **Puter** (last resort, always on) — needs **nothing from the
   host**. It's built into the app already (a script tag, nothing to
   configure). The trade-off: each family member does a quick, free,
   one-time sign-in with their own Puter account **the first time
   Puter actually gets used** (only when both Gemini and Groq have
   failed or aren't configured) — Puter calls this the "User-Pays"
   model, so nobody manages a shared key for it, but there's a small
   individual step instead.

**One-time host setup:** open the **AI** tab → **API keys (host)** →
fill in Gemini and/or Groq keys for Chat, Recipes, and Daily Question
separately (any left blank falls through to Puter) → **Save all keys**.

**Family facts are separate, and open to everyone** — the **Family
facts** button on the AI tab is visible to any approved member, not
just the host ("Grandma's birthday is June 3rd," "we're vegetarian on
Fridays," whatever's useful). Every conversation, for every person,
includes the current fact list from its very first message regardless
of which provider answered it, and anyone can remove a fact to
correct it.

**Worth knowing:** all six keys are stored in Firestore under the same
trust model as everything else in this app (any approved family
member's device can read them, since that's also what lets their
browser call Gemini/Groq directly) — consistent with the rest of the
app, not a new kind of exposure. Both free tiers have real rate
limits (a handful of requests per minute); that's exactly what the
fallback chain is for — if one's momentarily exhausted, the next
tier picks it up automatically.

## Integrations — two separate upload providers, on purpose

The Host tab's **Integrations** section has two cards, kept
deliberately separate rather than sharing one provider:

- **FEED (Cloudinary)** — up to **4 Cloudinary accounts**, tried in
  order as a fallback chain: if account #1 fails (free quota hit,
  misconfigured, network hiccup), it automatically tries #2, then #3,
  then #4, before giving up. Powers "Upload a file" on Feed posts.
  Reserved for the Feed specifically because it's host-only and
  comfortably handles long videos on the free plan — running multiple
  free Cloudinary accounts as backups is also a legitimate way to
  stretch further past any single account's free-tier limits.
- **CHAT (Supabase Storage)** — Project URL, API key, and a bucket
  name. Powers the photo, video, and tap-to-record voice-message
  buttons in every conversation. Kept separate so everyday chat
  traffic — which *everyone* generates, not just the host — never
  eats into the Cloudinary accounts set aside for long Feed videos.

**The automatic handoff:** until Supabase is set up, Chat quietly
uses the Cloudinary chain as a fallback so those buttons still work
from day one. The moment the host adds Supabase's details, Chat
switches to it automatically — no other change needed. Feed always
uses the Cloudinary chain regardless; that part never changes.

Nothing breaks if neither is set up — the buttons still show, but
tapping them explains that the host needs to add one first, rather
than failing silently.

### Setting up Supabase for Chat — two steps are easy to miss

1. **Settings → API** in the Supabase dashboard → copy the **Project
   URL** and the **anon** key (or the newer **publishable** key —
   Supabase is migrating to `sb_publishable_...`/`sb_secret_...` keys
   through the rest of 2026, but the classic anon key still works
   today and either one goes in the same field). **Never** use the
   `service_role` / secret key here — that one must only ever live on
   a server, and this app has no server.
2. **Storage → New bucket** → name it (e.g. `family-board`) → mark it
   **Public**.
3. **Easy-to-miss part #1:** marking a bucket "Public" only makes
   files *readable* — it does **not** allow uploads. Supabase Storage
   uses Postgres Row Level Security, and by default no uploads are
   allowed at all until you add a policy. Open the bucket →
   **Policies** → **New policy** → pick the template for **INSERT** →
   allow it for the **anon** role → Save. Skip this and uploads will
   fail with a "row-level security policy" error — same shape of
   mistake as forgetting to publish Firestore rules earlier in this
   README, just Supabase's version of it.
4. **Easy-to-miss part #2 (new):** the 1:1 chat space-saving feature
   below also needs a **DELETE** policy on the same bucket, for the
   same **anon** role — otherwise it'll just silently fail to free up
   space (harmlessly; nothing breaks, you just won't get the storage
   savings). Same Policies screen, same steps, template for DELETE
   instead of INSERT.
5. Paste the Project URL, key, and bucket name into the Host tab.

**Why these specific fields, not a raw API key everywhere:**
Cloudinary's real API key needs a matching secret to "sign" each
upload, and that secret can only safely live on a server — never in
browser code anyone can inspect. An **unsigned upload preset**
sidesteps that: a preset configured once in the dashboard that's
allowed to accept uploads and nothing else. Supabase's anon/publishable
key is meant to be used directly from browser code by design — Row
Level Security policies (step 3 above) are what actually decide what
that key is allowed to do, rather than the key itself being secret.
Both are the standard way to do uploads without a backend server, not
a shortcut.

Voice messages use the browser's built-in `MediaRecorder` API (tap to
start, tap again to stop) — supported in Chrome, Edge, and Safari.
Where it isn't available, the button explains that plainly rather
than doing nothing.

**If you want to swap either provider out later** — each one is a
single function, `uploadToCloudinary()` or `uploadToSupabase()`, so
swapping means changing that one function, not touching Feed or Chat.

## More WhatsApp-style chat behavior

**Every chat room now has a 🤖 Ask AI button** in its header. Tap it
and either ask a specific question, or leave it blank and it looks at
the last 30 messages of that conversation itself and offers whatever
seems genuinely useful — a summary, a suggested reply, anything. It
reuses the same AI setup as everywhere else in the app (Host →
Integrations → AI keys), and the conversation context never leaves
that one request — nothing is stored or logged from it.

**The message box was redesigned** — photo, camera, video, GIF, voice,
and send used to all share one row with the text field, which left
the field so narrow you could only see the first few characters of
whatever you'd typed. Now the five attachment/action buttons sit on
their own row above, and the text field gets its own full-width row
below with nothing competing for its space. The voice-recording
overlay (the screen that replaces the message box while you're
holding the mic button) was resized to match the new taller message
box too, so it fully covers it instead of leaving the button row
peeking out above it.

- **Typing indicators** — appear under the message list within ~3
  seconds of the other person typing, and clear automatically if they
  stop or send.
- **Online / last seen** — shown under the other person's name in a
  1:1 conversation. This is a heartbeat, not true instant presence:
  every device checks in every 30 seconds while the app is open, and
  "online" just means "checked in within the last 90 seconds." This
  app doesn't use Firebase's Realtime Database, which is what would
  normally provide instant, disconnect-aware presence — the heartbeat
  is the honest, free-tier-friendly approximation.
- **Read receipts** — a single grey checkmark means sent; a double
  turquoise checkmark means at least one other person has seen it.
  Works the same for text, photos, videos, and voice messages.
- **Profile pictures** — tap your own avatar (top-right) to upload
  one, using whichever upload provider is already configured for
  Chat (Supabase, or Cloudinary as the fallback — see Integrations
  above). No provider configured yet means no profile picture yet,
  same graceful-degradation pattern as every other upload feature
  here.
- **Reply to a message** — tap "↩ reply" under any message, a
  preview strip shows above the compose bar with what you're replying
  to (and a way to cancel), and the sent message shows a small quoted
  block above its own content. Works for text and media messages
  alike.
- **Emoji reactions** — tap "😊" under a message for a quick picker
  (👍❤️😂😮😢🙏), or tap an existing reaction pill to toggle your own.
  Reactions are stored per-emoji as a list of who reacted, so counts
  and "did I already react" both just work.
- **Voice messages record like WhatsApp's** — press and hold the mic
  button to record; a bar appears showing a live timer and two
  gestures: **drag left to cancel** (discards the recording) and
  **drag up to lock** (keeps recording after you let go, showing
  Delete/Send buttons instead). Uses Pointer Events, so it works with
  touch on a phone and mouse on desktop identically.
- **A dedicated camera button** now sits next to the gallery button —
  it uses `capture="environment"` so mobile browsers open the camera
  directly for a brand-new photo, instead of only being able to
  attach one that already exists. (On desktop, browsers that have no
  camera concept just fall back to a normal file picker, which is the
  correct and expected behavior.)
- **GIFs** — a GIF button opens a search sheet backed by **GIPHY**'s
  free API. **Not Tenor** — Google fully shut down the Tenor API on
  June 30, 2026, so it's simply not usable anymore; GIPHY is the
  current, actually-available free option. Needs a free GIPHY key in
  Host → Integrations (no credit card). Sent GIFs are just a media
  message with `mediaType: "gif"` — an `<img>` tag animates a GIF
  natively, no special player needed.
- **Every message now shows the sender's avatar and a timestamp** —
  the avatar (their profile picture, or their first initial if they
  haven't set one) sits beside each of *their* messages; your own
  messages skip it, matching how WhatsApp only shows the other
  person's avatar. `authorPhoto` is captured at send time (the same
  denormalization pattern already used for `authorName`), so a
  message keeps showing the photo the sender had *then*, even if they
  change it later — consistent with how chat history works everywhere
  else.

## Notifications — what "free and serverless" actually allows

Real push notifications — the kind that wake up a fully closed app —
need a server holding a credential that calls Firebase Cloud
Messaging on your behalf. This app has no server, so that's not
something that can be added without also adding one (a Firebase Cloud
Function would be the natural way, which needs the Blaze plan).

What *is* built, for free, with no backend: **local notifications**,
using the browser's own Notification API, triggered by the live data
this app is already watching. The browser asks for permission once,
automatically, the first time you're approved into the app. From
then on, you'll get a native notification for:
- A new message in a chat you're not currently looking at
- A new Feed post from someone else, if you're not currently on the
  Feed tab

**A real bug just got fixed here, and it's worth explaining plainly.**
This used to create notifications with the page-level `new
Notification(...)` constructor. Per MDN's own documentation, **that
constructor throws an error outright on nearly all mobile
browsers** — it was never just unreliable there, it flatly didn't
work, full stop. That error was being caught by a try/catch and
silently discarded, so on a phone, not one notification was ever
actually being created — not muted, not delayed to the background,
simply never made in the first place. That's very likely the entire
explanation for "no sound, even when the app is open in the
background."

Fixed by switching to `ServiceWorkerRegistration.showNotification()`
— the documented, correct way to show a notification on mobile,
going through the service worker rather than the page directly —
with the old approach kept only as a fallback for the rare case the
service worker isn't ready yet. A vibration pattern was added too,
and tapping a notification now actually brings the app to focus
(opening it fresh if it wasn't open at all) instead of just
disappearing with nothing happening.

**What's still a real, unavoidable limit, even after this fix:**
there's no option in the web Notification API to specify a *custom*
sound file — whether any sound plays, and which one, is entirely up
to the device's own notification settings (silent mode, Do Not
Disturb, per-app sound settings), the same as it is for genuinely
every app on the phone, not just this one. What this fix controls is
whether a notification is created at all; whether it makes noise was
never something a website could control directly, on any platform.

And the bigger-picture limit from before still stands: this only
works while the app is open somewhere — a background tab, a
backgrounded phone PWA, that counts as open and now should
genuinely work. A *fully closed* app (force-quit, or never opened
since a restart) still won't notify you, because nothing is running
to notice the new data — that's the real trade-off of staying
server-free, and no fix to *how* a notification is shown changes
that part.

## Daily Question — a reason to open the app every evening

A pinned **🎯 Today's Question** chat sits at the top of the chat
list, alongside Family Chat and Family AI. Once it's past 7pm, a
fresh question appears there and everyone gets a notification; the
question is shown big, at the top of that chat, and anyone can reply
underneath it. By 8pm, if it hasn't gotten much engagement, there's a
gentle reminder notification too. The previous day's conversation is
cleared out each time a new question starts — it's meant to feel like
a fresh daily prompt, not an ever-growing thread.

**Where the question comes from:** the AI writes it automatically
each evening, using the family facts from the AI tab (a real memory,
an upcoming date, a family member's name — whatever's been shared).
The host can also set it directly, any time, in Host → Integrations
— typing a question there and hitting **Save — use this now**
replaces today's question **immediately**, for everyone, regardless
of what time it is; it doesn't wait for 7pm or save for "later."

**The honest scheduling limit — same shape as the notifications
section below:** there's no server here, no actual clock running at
7:00:00pm. What happens instead: whichever family member's device
has the app open first *after* 7pm notices the date has changed and
generates the question — then Firestore's real-time sync pushes it to
everyone else's already-open app instantly, including the
notification. A device that's fully closed right at 7pm won't get a
notification for it, but will see the new question the next time it's
opened, same as any other Firestore-backed data here.

There's also a small, low-key nudge toward another feature (Calendar,
voice-guided Recipes, the AI) shown once when you open the Daily
Question room — not a whole onboarding system, just a rotating tip,
in keeping with the spirit of gently pulling people deeper into the
app without being pushy about it.

## The screen stays awake while actively cooking

Cook Mode now requests the device's screen to stay on for as long as
it's open, using the browser's Screen Wake Lock API — no more
grabbing a floury phone to tap it awake mid-recipe. It's requested
the moment Cook Mode opens and released the moment it closes.

One real quirk of this API, handled here: the browser releases the
lock automatically the moment the tab is backgrounded (switching
apps, the phone auto-locking) and does **not** silently reacquire it
on its own when you come back — so it's also re-requested whenever
the tab becomes visible again while Cook Mode is still open, in case
that happened.

**Browser support**: Chrome, Edge, and Android Chrome support this
well; Safari added it in iOS 16.4, so it needs a reasonably current
iPhone/iPad. On an older or unsupported browser, this fails silently
and Cook Mode works exactly as it always has — the screen may just
fall asleep on its own normal timing, same as before this existed.

## Games & points

**Everyone can see where everyone stands** — a collapsible leaderboard
sits right above the games list, sorted highest to lowest, with medals
for the top three and "(you)" next to your own name.

A **Games** tab in the nav (bottom pill on phones, sidebar on
desktop) with three mini-games, none requiring any outside knowledge
(trivia was removed for exactly that reason): a self-contained
**Memory Match** card game (5–20 points depending on how few moves it
took), **Connect Four** (15 points for a win) with a bot that takes a
winning move when available, blocks yours when it has to, and
otherwise favors the center columns, and **Checkers** (20 points for
a win) with a bot that prefers captures when one's available.

### Two more games, both fully original

Two zip files of real GitHub game-jam projects came in later, asking
for them to be added. Checking their licenses first (see further down
this file for the full story) turned up an explicit "all rights
reserved, distribution only to js13kgames.com" on one and no license
at all on the other — so neither was added. What got built instead,
on request, was **original games in the same spirit**, written from
scratch:

**🕹️ Neon Pinball** — a real physics pinball table, not a scripted
imitation of one. The flippers are proper rotating arms: each frame,
the closest point on the flipper's current line segment to the ball
is found, and if the ball is close enough, it gets pushed out along
that contact normal *and* given an extra push in the direction the
flipper is currently swinging, scaled by how fast it's rotating at
the moment of contact — the same underlying idea real pinball physics
engines use, simplified down to something reliable at 60fps in a
plain canvas. Five bumpers, funnel walls guiding the ball toward the
flippers, a hold-to-charge launcher, three balls, and a combo
multiplier (up to ×5) for hitting bumpers in quick succession. All
sound effects are generated on the fly with the Web Audio API —
no sound files, nothing borrowed. Final score becomes points at a
capped rate.

**🌀 Orbit Snake** — classic grid-based snake, rendered in 3D. Drag
anywhere on the board to orbit the camera around it (it also rotates
slowly on its own when you're not dragging), the snake's body is a
moving rainbow gradient, and eating food triggers a small particle
burst. Same wall/self-collision rules as ordinary snake, with the
pace gently increasing as the score climbs. Nipple.js joystick
included, same as the other 3D games here.

Both were tested piece by piece before being wired in — the
collision math (closest-point-on-segment, wall/self collision
detection, grid-to-world coordinate mapping) was run against known
cases in isolation first, separately from the visual/canvas code, the
same way the rest of this app's trickier logic has been throughout.

### On removing the GameZipper games, and why nine GitHub repos weren't added in their place

The 20 external GameZipper games (Tetris, Pong, Solitaire, and so on)
that used to fill out this tab have been **removed entirely** — every
tile, the whole external-games list, the "claim points for playing"
button system, all of it.

A later request asked for those to be replaced with code pulled
directly from nine specific GitHub repositories (driving sandboxes,
an open-world game, an endless runner, and so on), converted into
native components. That request ran into three real, checked
constraints rather than just difficulty:

- **Several of these repos aren't portable single-file games at
  all.** `MankyDanky/web-racing`, checked directly, is a *multiplayer*
  game requiring WebRTC peer-to-peer connections plus a **Django
  backend server** for matchmaking and party codes — there's no
  server here to deploy that to, and "extracting it into a native
  component" isn't meaningful without one.
- **This app's own build sandbox has no network access** — confirmed
  in its own configuration, not a guess. That means no `git clone`,
  no bulk-downloading a repo's binary assets (3D models, textures,
  sound files), which every one of these nine games depends on. Only
  individual web pages can be viewed, one at a time, through search
  and fetch tools — not a whole repository's file tree.
- **Licensing** — reproducing substantial source code from someone
  else's repository requires checking its license first. Several
  comparable hobby game projects turned up while checking these had
  no license file at all, which by default means "all rights
  reserved," not "free to copy."

So that specific ask wasn't fulfilled as literally requested, and
that was said plainly rather than attempting a shortcut version that
would have shipped broken (missing assets, broken relative imports,
or actually infringing someone's copyright).

**What *was* achievable, and got built:** real `nipple.js` virtual
joystick controls (a genuine, MIT-licensed, verified library) added
to the three 3D games this app already owns the full source for —
Platform Runner, Cosmic Jet Simulator, and the Racing game (see the
base64-embedded games section further up). Runner and Racing re-fire
their existing lane-shift movement functions on a short cooldown
while the joystick is held in a direction; the Jet game applies
continuous analog adjustment every frame instead, since flight
genuinely benefits from smoother control than a lane-based runner or
racer does. All three keep working with their original on-screen
buttons too — the joystick is an addition, not a replacement.

Each of the three also got an explicit `cancelAnimationFrame` +
WebGL `renderer.dispose()` call on `pagehide`, worth being honest
about: the browser already tears down a removed iframe's entire
execution context automatically the moment it's removed from the
page, so this isn't fixing a pre-existing leak — it's cheap extra
insurance specifically against WebGL context buildup from opening
and closing the same game many times in one session without a full
page reload in between.

Their scoring was already wired into this app's real points system
(`awardPoints()`, called through the same `postMessage` bridge used
by every base64-embedded game here) before any of this — that part
didn't need to change.

### Why two uploaded game projects weren't added

Two zip files — real, working js13k game-jam entries ("Technicolor
Tilt," a pinball boss-rush, and "Lossst — A Snake in Space," a 3D
snake puzzle game) — were uploaded with a request to add them here.
Both were opened and checked directly before doing anything with
them, and neither was added:

- **Lossst's own `LICENSE.md` states, verbatim**: *"all rights served
  to the copyright holder / distribution rights granted to
  js13kgames.com."* Its README repeats it: *"All rights reserved /
  Distribution only allowed to js13kGames.com."* That's about as
  direct a restriction as a license can state, and this app is not
  js13kgames.com.
- **Technicolor Tilt has no license file at all**, which under
  copyright law defaults to "all rights reserved" — not "free to
  use because no license was specified." Its own README opens with
  *"Made by [@rndD] for js13kGames 2026,"* with credits to several
  other named developers for specific parts of it.

Being able to download a public GitHub repository doesn't come with
permission to redistribute it somewhere else — that's specifically
what a license grants, and neither of these grants it (one explicitly
withholds it). This holds regardless of how the files arrived —
uploaded directly, downloaded from GitHub, anywhere — it's about
what each project's actual author has said is allowed. Two original
games inspired by the same genres were built instead — see above.

### Points — the host can see and adjust anyone's balance

Host → Integrations now has a full points list: everyone's current
balance, plus a field to add or take away any amount for anyone.
**Nobody has to wonder whether the host changed something** — every
adjustment is stored on the member's own record, and the next time
their device is active (or the next time they open the app if it
wasn't), a one-time notice tells them plainly: *"The host gave you
20 points"* or *"The host took away 10 points."* It only shows once
per adjustment, then marks itself seen.

Checkers here uses **simplified rules — captures are optional, not
forced** (real tournament checkers requires capturing whenever
possible, including multi-jump chains; that logic is exactly where
most bugs in a from-scratch checkers implementation tend to live, so
it's intentionally left out for a casual family game — diagonal
moves and king promotion both work normally). Points show as a 🪙
badge in the top bar, live-updated via the same `members/{id}`
document everything else already reads, using Firestore's
`increment()` so simultaneous point-earning across devices can't
silently overwrite itself.

**Four family-made games** are also in there — **Coin Sweeper**,
**Coin Tic-Tac-Toe**, **Sudoku**, and a **3D Platform Runner**
(built with Three.js) — each a complete, self-contained HTML game,
played in an iframe. They're embedded as base64-encoded text rather
than plain JS strings on purpose: their own code contains
`${...}` template-literal syntax and `<script>` tags, both of which
would collide with this file's own JavaScript if embedded any more
directly — base64 sidesteps that completely, and the round-trip
(encode → decode) was verified byte-for-byte identical to the
originals before shipping.

**Sudoku was renamed from "Coin Sudoku" and its coin theming
removed** — cells used to show 🪙1 through 🪙9 and the whole board was
styled gold, when the actual intent was simply "award points for
finishing," not a coin-themed visual style. It's a plain number grid
now (1–9, a blue color scheme instead of gold), still awarding the
same points on completion — only the look changed, not the puzzle
logic underneath it, which was checked directly (every row, column,
and 3×3 box of a freshly generated solved grid contains 1–9 exactly
once) before shipping the retheme.

**Coin Sweeper and Sudoku had a real layout bug, now fixed** — both
were missing a viewport meta tag entirely, and both sized their grid
in fixed pixels rather than anything relative to screen width. On a
narrow phone, that combination meant the game was wider than the
screen with no way to see the whole thing without scrolling
sideways. Both now use a responsive width (`min(92vw, ...)` capped at
a sensible maximum) so they fit a phone screen directly, without
scaling down to nothing on a wider tablet or desktop screen either.

**Their coins now feed into the app's shared points** — each game got
one small addition at its own win/game-over moment: a
`window.parent.postMessage({ type: 'neumify-game-points', points: N },
'*')` call. The main app listens for exactly that message shape and
awards points through the same `awardPoints()` every other game uses.
Conversion is roughly: Coin Sweeper and the Runner give 1 point per
in-game coin (Sweeper also gives partial credit if a trap ends the
round early — effort isn't wasted); Coin Tic-Tac-Toe gives a flat 10
for a win / 5 for a draw (it's a shared-screen 2-player game, so
there's no way to know which "coin color" is the person actually
signed into the app); Sudoku gives a flat 25 for finishing.
`'*'` as the postMessage target is unusually permissive, but a
`srcdoc` iframe has no normal origin to target more precisely — the
main app validates the message's shape before trusting it, which is
the realistic amount of caution worth having for a family app's
internal points, not a security boundary.

**The Runner's touch controls were a real bug, now fixed:** its
on-screen left/right/jump buttons used `touchstart`, which is known
to be unreliable across devices in nested/embedded contexts — that's
very likely exactly why it didn't work on some tablets. Switched to
**Pointer Events** (`pointerdown`), the modern, unified input model
already used elsewhere in this app (the voice-message recording
gesture) for exactly this kind of reliability. Also added
`touch-action: none` on the buttons so the browser doesn't intercept
the gesture for scrolling first, and gave the Runner specifically a
much taller iframe (`min(88vh, 900px)` vs `min(70vh, 640px)` for the
simpler 2D games) since a 3D game needs real room to be playable —
sizing now uses `min()` so it stays sensible across phone, tablet,
and desktop instead of a value tuned for only one of them.

**A fifth family-made game, added the same careful way: Cosmic Jet
Simulator** — a 3D space-flight game (also Three.js), collecting
energy cores while dodging asteroids. It arrived with the exact same
`touchstart` reliability issue as the Runner, so the same fixes were
applied proactively before it ever shipped rather than waiting for
the same bug report twice: switched its on-screen up/down/left/right
buttons to Pointer Events, added `touch-action: none`, wired its
game-over moment to the points bridge (1 point per energy core), and
gave it the same generous "tall" iframe sizing as the Runner. Verified
byte-for-byte via the same base64 round-trip check as every other
embedded game here.

**A sixth, same treatment again: 3D Racing Game** — dodge traffic,
collect coins. This one had *two* separate `touchstart` spots to fix:
its on-screen left/right buttons, and a full-screen swipe-to-steer
gesture (`touchstart`/`touchend` on the whole window). Both converted
to Pointer Events the same way, `touch-action: none` added to the
buttons, points wired in (1 per coin), and the same tall iframe as
the other 3D games. Verified byte-for-byte, same as always.

**Two more games, built from scratch for this app:** **Snake**
(canvas-based, score = length, points = final score) and **2048**
(the classic sliding-merge puzzle, points scale with final score,
capped at 50). Both take arrow keys *and* on-screen touch controls
built the same reliable way (Pointer Events, not touch events) —
2048's swipe detection is just a pointerdown/pointerup delta, no
gesture library needed. The 2048 merge logic (each tile merges at
most once per move — `2,2,2,2` becomes `4,4`, not `4,2,2` or `8`) and
Snake's collision detection were both verified against known test
cases before shipping.

**One actual fix, not just a style choice:** Coin Tic-Tac-Toe's
turn-tracking and win logic depended on comparing two emoji values
(🟡 vs ⚪) that had been stripped out somewhere before the file
reached this app — as uploaded, both players' moves were being
recorded as the same empty string, so no win could ever be detected
and both players' marks looked identical on the board. Restored using
🟡 (gold) and ⚪ (silver), matching the game's own "Gold Coins (P1)" /
"Silver Coins (P2)" labels already in its HUD — everything else in
all four games is byte-for-byte what was provided.

**Chess** asks the player to pick the rules fresh, every single time
they play — two genuinely different engines, not one game with a
setting:

- **Standard** uses [chess.js](https://github.com/jhlywa/chess.js)
  (BSD-2-Clause licensed, loaded from jsDelivr), which handles full
  FIDE legality — castling, en passant, check/checkmate/stalemate.
  Real chess rules are exactly the kind of thing worth trusting a
  well-tested library for rather than reimplementing by hand.
- **Simple** is entirely custom code, hand-written for this app: no
  castling, no en passant, and **no check restriction at all** — you
  can even move into check — and you win by literally capturing the
  opponent's king on a later move. That's a deliberately different,
  much easier ruleset, not a cut-down version of the same one; pawns
  auto-promote to a queen in both modes.

Bot difficulty (Easy/Medium/Hard) is picked at the same time as the
ruleset. Easy plays randomly; Medium picks the best immediate move by
material; Hard looks two moves ahead (its move, then your best
reply) to avoid obvious blunders and spot two-move tactics. Points
scale with difficulty (15/25/40 for a win) regardless of which
ruleset you picked.

## Feature toggles — roll the app out gradually instead of all at once

Host → Integrations has a three-state switch for each of the seven
main tabs (Feed, Today's Question, Chat, Games, Calendar, Recipes,
Family AI — Host itself is always available to the host):

- **On** — works normally.
- **Under construction** — stays visible in the navigation, but
  tapping it shows a "coming soon" message instead of the real
  thing. Good for letting people see what's ahead without letting
  them in yet.
- **Off** — removed from the navigation entirely, as if it doesn't exist.

This was built specifically for introducing a big app gradually — start
everyone with just Recipes, say, then switch Chat to "on" a week
later, and so on, rather than handing over the whole thing at once.

**Nothing is ever deleted or reset by any of this.** Turning a
feature off (or to under-construction) only changes whether its tab
shows and whether tapping it reaches the real view — the feature's
own view is never touched, torn down, or rebuilt; it just stays
hidden behind a separate placeholder screen. Turn Chat off for a
month, turn it back on, and every conversation, message, and photo
is exactly where it was.

**Luna gets her own separate on/off switch** in the same place, below
the seven main toggles — see the Recipes section above for why.

## Notifications — an in-app center underneath everything else

A 🔔 bell sits next to your profile picture in the top bar, with a
small red dot whenever there's something unread. Tapping it opens a
panel of recent notifications — new chat messages, new Feed posts,
the daily question, points changes, anything else this app already
tries to notify about — and **opening the panel marks everything in
it as read**, so nothing keeps flagging itself as new once you've
actually seen it.

This exists specifically as the honest fallback promised earlier: OS
push notifications depend on browser support and on permission having
been granted, and don't work at all once the app is fully closed (see
the Notifications section further down for why). The in-app center
has none of those dependencies — every notification that would have
tried to become an OS notification is *also* recorded here
regardless of whether that OS notification succeeded, so there's
always somewhere to find it inside the app itself. It's stored per
device (not synced across a person's phone and tablet, say) — kept
simple on purpose rather than adding a synced-across-devices system
for what's meant to be a lightweight inbox.

## Host-gated paid Feed videos

When posting to the Feed, the host can set an optional **"Cost to
unlock, in points"** field. A post with a cost shows as a locked 🔒
card to everyone except the poster and the host — tapping **Unlock**
spends that many points (if you have them) and reveals it, permanently,
for that person specifically; the deduction and the unlock are two
separate Firestore writes, so in the rare case one fails the other is
caught and surfaced as a normal connection error rather than silently
charging someone for nothing. Everyone else still sees it locked until
they spend their own points.

## Daily Question: "what we heard yesterday"

Right before each new day's question clears out the previous day's
conversation, the AI reads through what was actually said and writes
one short summary sentence — a consensus, or an interesting split of
opinions ("more people said Thursday than Monday") — stored as
`previousSummary` on the new question document. A small box reading
**"💭 What we heard yesterday: ..."** appears above the new question
in the Daily Question room whenever one exists. If there were fewer
than two messages the day before, or the AI summary call fails for
any reason, the box just doesn't appear that day — never blocks the
new question from being generated.

## The Family Tree tab

A new main tab, genuinely separate from everything else, with the
same host on/off/under-construction switch as every other main tab.

**Fully open editing, exactly as asked** — there's no concept of
"your entry" versus "someone else's" here. Any approved family member
can add a person, edit anyone's details, or remove someone. If a
grandparent's birth year is wrong or someone's phone number changed,
whoever notices just fixes it — no ownership, no waiting on one
specific person.

**Per person**: name, nickname, cell phone, a separate home phone
(for a married couple sharing a landline, say), where they live, and
an open notes field for anything else worth recording. Parents and
spouse are set by picking from everyone already in the tree — children
aren't a separate field to fill in at all; they're computed
automatically from who has *you* listed as a parent, so a child
only ever needs to be entered once, from their own side.

**The tree is laid out by generation automatically** — nobody places
anyone on a grid manually. Each person's generation comes from the
data itself: a root ancestor with no tracked parents starts at
generation 1; everyone else is one generation past their parents.
Someone who married into the family (their own parents were never
added) takes their spouse's generation instead of defaulting to the
top of the tree, which is what actually happens when a person with no
tracked parents is treated as a new root rather than looking at who
they married.

That generation logic went through two real bugs during testing,
worth being honest about rather than just presenting the finished
version. The first attempt deadlocked whenever two spouses were
married to *only* each other with neither having tracked parents —
each was waiting on the other's generation, forever, and nobody ever
resolved. Fixed by giving anyone with no tracked parents an immediate
provisional generation, then upgrading it afterward if their spouse
turned out to resolve higher through real parentage. This was caught
specifically because it was tested against a realistic four-generation
mock family (grandparents, a married-in parent, an unmarried sibling,
a married-in daughter-in-law, a grandchild) rather than only the
simple two-generation case that happened to work fine and would have
shipped a real bug otherwise. **Spouse links are also kept symmetric
automatically** — selecting someone as your spouse adds you to their
own record too, since the generation logic and the tree's couple
grouping both depend on that relationship being visible from both sides.

**Connected to the Family AI**, exactly as asked — the whole tree
(names, relationships, phone numbers, where people live, notes) is
loaded the moment you're approved into the app, whether or not you've
ever opened the Family Tree tab yourself, so asking NeumAI something
about anyone in it works regardless of which tab you actually used to
add that person.

## The Torah tab

A new main tab, its own spot in the navigation, with the same
on/off/under-construction host switch as every other main tab. Three
independent pieces:

**Look up any text — not just what's tied to today's calendar.** Full
Gemara, any daf, any perek, any sefer in Sefaria's library. Type
"Shabbat 21a," "Bava Metzia 59b," or just a book name into the search
box above the daily schedule, and it uses Sefaria's own `/api/name`
autocompleter (verified its real response shape directly before
building against it — see below) to resolve book names, authors, and
references into an actual passage, opened in the same reader as
everything else here. Typing just a book name with no specific
daf/perek (e.g. "Shabbat" alone) will fetch the whole tractate as one
long passage — it renders, but capped at a sane length with a note
suggesting a specific daf, rather than trying to hand the browser an
entire book as unbroken text.

**Today's learning** pulls live from [Sefaria's public API](https://developers.sefaria.org) —
genuinely free, no API key or account needed for any of what's used
here. It shows the day's Parashat Hashavua, Daf Yomi, Daily Rambam,
Daily Mishnah, and whatever else Sefaria's calendar returns for that
day, each with a "Read" button that fetches the actual Hebrew and
English text for that passage on demand and shows it right in the
app. Verified directly against Sefaria's real, live API response
before building against it, rather than assuming a shape from
documentation alone.

**A weekly family learning-hours tracker.** "Log time" records
minutes learned plus an optional note of what was studied; everyone's
logged time for the current week (sunset-to-sunset isn't tracked
here — it's a plain calendar week, Sunday to Saturday) totals up into
a simple leaderboard, most minutes first. Resets naturally each week
since totals are only ever pulled for the current week's bucket.

**A place to share shiurim and divrei Torah** — upload an audio or
video recording with a title and an optional note, and it shows up
for the whole family to play right in the app. Uses the exact same
Cloudinary upload pipeline as the Feed and Chat already do, so it
needs the same Host → Integrations Cloudinary setup and nothing
additional.

Open to every approved family member the same way most of this app
is — nothing here is gender-gated at the software level; if that
distinction matters for how a specific family uses it, that's a
matter of how the people using it choose to use it, not something
built into the access control.

### Zmanim — a real fix, not just a rebuild

Zmanim used to be host-controlled: one shared latitude/longitude/
timezone set in Host → Integrations, and it genuinely wasn't
working — checked directly against a live Hebcal response, and found
the actual bug: the code was reading a field called `tzeit7083deg`,
which doesn't exist in Hebcal's real output (it's `dusk`), so that
row silently never rendered, and depending on whether the host had
ever actually saved a location, the rest could come up empty too.

Rebuilt properly, and moved to **each person's own choice, not the
host's** — a plain city search (type "Lakewood," "Miami," "New York,"
anything) using Hebcal's own free autocomplete, no API key needed,
verified against its real response shape before writing a line of
code against it. No coordinates, no altitude, nothing beyond picking
your own city from the results — set once in the Calendar tab, saved
to your own account, and used every time zmanim load for you from
then on. Everyone in the family can be in a different location if
that's genuinely true for them.

### Today's practice, and Sefirat HaOmer

A card right below zmanim shows what today calls for — Rosh Chodesh
(Ya'aleh V'Yavo, full Hallel), Chanukah or Purim (Al Hanisim), a fast
day (Aneinu), Selichot when Hebcal's own calendar includes it — pulled
from the same Hebcal calendar data already used for holidays
elsewhere in this app, not from any date math written here. That's a
deliberate choice: getting details like this wrong matters, and
Hebcal is already the authoritative source this app leans on for
everything Hebrew-calendar-related. **A visible note says plainly
that this is a general guide, and to check with your own rabbi or
community's practice for anything you're unsure of** — it doesn't
try to cover every halachic edge case (the exact start of Aseret
Yemei Teshuva's specific liturgical substitutions, for one, isn't
attempted here, specifically because getting that partially right
felt worse than leaving it out).

**Sefirat HaOmer** shows automatically during the actual Omer period
(pulled from Hebcal, so it simply doesn't appear the rest of the
year) with today's count and a personal "I counted tonight" button —
your own checkbox, not shared with anyone else's.

### Ask AI about your learning

A button right at the top of the Torah tab for exactly what it says —
stuck on something while learning, ask what it means. The AI is
specifically instructed to flag genuine disagreements between
commentators rather than presenting one opinion as settled fact, and
to point toward asking your own rabbi for anything that's actually a
practical halachic question rather than treating its own answer as a
ruling.


## Voice & video calling — built, with the STUN-only tradeoff stated plainly

WebRTC calling is real now, reachable two ways: a **📞 Calls tab in
the main navigation**, its own place alongside Feed, Chat, Games, and
the rest — not tucked inside Chat — listing everyone approved with
their name and photo, tap to call; and the same 📞 button still lives
inside Chat too (both the floating button there and inside every
individual chat room's header, which rings everyone in that specific
conversation at once). Both paths lead to the exact same calling
system underneath. Signaling — the offer/answer/ICE-candidate
exchange two devices need to find each other — travels through
Firestore the same way everything else here does, so there's no
separate signaling server to run.

**Calls has its own host on/off/under-construction switch**, same as
every other main tab (Host → Integrations) — turning it off removes
the nav tab entirely; the 📞/📹 buttons inside individual chat rooms
stay put either way, since those are considered part of Chat itself,
not the Calls tab specifically.

**You can see and join calls already in progress.** The Calls tab has
a "🔴 Happening now" section showing any call currently active that
you're not already part of, with who's on it and a Join button —
tapping it doesn't drop you straight in; it sends a request to
whoever's already on the call, who sees a banner right inside their
call screen ("[name] wants to join") with Allow/Deny. You see a
"waiting to be let in" screen in the meantime, and either get pulled
in automatically the moment someone allows you, or a plain message if
they don't.

**A call with only one person left in it closes itself.** If it drops
to just you — because everyone else hung up, not because you're still
waiting for someone's first invite to be answered, which is a
different state entirely and doesn't trigger this — the call shows
"Everyone else left" for a moment and then ends on its own instead of
leaving you sitting alone in an empty call screen.

**The honest tradeoff, stated up front rather than discovered
mid-call:** this uses free public STUN servers only, no TURN relay
server. STUN helps two devices discover how to reach each other
directly and works well on most home networks — which is the normal
case for a family app used mostly from home. It does **not**
universally work: some cellular connections, symmetric NATs, and
restrictive corporate or public networks need a TURN relay server to
connect at all, and TURN servers relay real audio/video traffic,
which costs real bandwidth — there's no free, meaningful-scale answer
for that, which is exactly why it wasn't built before. Rather than
leave that silent, a tile that fails to connect says so directly
("Couldn't connect") instead of just sitting there black.

**Group calls** work by connecting everyone directly to everyone else
(a mesh, not a routed call through a server) — genuinely fine for a
handful of people on decent connections, but bandwidth and CPU use
scale up with each additional person, so this is realistically built
for family-sized calls, not a large group. **Inviting someone into an
ongoing call** (the ➕ button) works the same way whether they're
joining a call that started as 1:1 or already has several people —
everyone already in the call automatically connects to the new
person the moment they join.

**Minimizing a call** (🗕) shrinks it to a small floating bar you can
keep talking through while browsing anywhere else in the app — Chat,
Recipes, Games, wherever — tap it to bring the call back full-screen.
Muting your mic and turning your camera on/off both work mid-call;
turning the camera off falls back to showing your initial/photo
instead of a frozen frame.

## Chat retention & space-saving — what actually happens, honestly

Three separate rules, all "lazy" (checked whenever someone opens a
chat, since there's no server to run them on a schedule):

- **All text messages, everywhere, delete after 30 days.** No
  exceptions, no placeholder — the message is just gone.
- **Media in Family Chat and any custom group** (not 1:1s) turns into
  a text placeholder ("📷 Photo (expired after 5 days)") after 5 days,
  whether or not anyone downloaded it.
- **Media in genuine 1:1 chats** works differently, closer to how
  WhatsApp actually behaves: the first time the recipient's device
  loads a photo, video, or voice message, it downloads and caches the
  actual file in the browser's local storage (IndexedDB) — future
  views of that same message use the local copy, no re-downloading.
  Once it's safely cached, the app tries to delete the file from
  cloud storage to free up space.

**The honest limit, worth understanding:** that last point — actually
freeing up storage — only works when the file was uploaded to
**Supabase**. Deleting a file from Cloudinary for real (not just the
10-minute client-side delete token Cloudinary offers, which is far
too short a window for this) requires an API secret that must live on
a server, and this app doesn't have one — putting that secret in
browser code would let anyone inspecting the page delete your entire
Cloudinary account's files, not just one. So: for chat media that
went through Supabase (the default, once it's set up), the file
really is removed from cloud storage after download. For chat media
that fell back to Cloudinary (Supabase not yet configured), the
message still turns into a placeholder on schedule, and the local
device that downloaded it keeps working fine — the file just isn't
actually erased from Cloudinary's storage in that case.

**One real trade-off to know about:** once a 1:1 photo/video is freed
from cloud storage, it only exists on whichever devices already
cached it locally. If the recipient later reinstalls, clears their
browser data, or opens the chat on a different device, they'll see
"Only saved on the device that first opened it" instead of the media.
This mirrors how real WhatsApp media works, not a bug — it's the
direct trade-off of actually freeing up storage rather than keeping
everything forever.

## Calendar — real month grid, zmanim, Jewish holidays, dual recurrence

Uses **Hebcal's free public API** (no key needed at all) for everything
Hebrew-calendar-related. This is deliberate: getting Hebrew date math,
leap years, and zmanim right by hand is exactly the kind of thing
worth relying on a validated source for rather than reimplementing.

- **Month grid** — every day shows both its Gregorian day number and
  its Hebrew date; a pill toggle swaps which one is large/primary.
  Jewish holidays get a small amber dot, family events get a pink
  dot, today gets a highlighted border, and the next 7 days get a
  soft highlight. Tap any day for a quick summary.
- **Holidays** shown are major + minor Jewish holidays — Rosh
  Hashanah, Yom Kippur, Sukkot, Chanukah, Purim, Pesach, Shavuot, and
  similar — with modern Israeli civil holidays (Yom HaAtzma'ut, Yom
  HaZikaron, Yom HaShoah, Yom Yerushalayim) deliberately excluded, as
  asked.
- **Adding an event** starts with two tabs — **English date** or
  **Hebrew date**. English shows the normal Gregorian date picker.
  Hebrew shows dropdowns for the day and the month, with month names
  in Hebrew script (ניסן, אייר, etc.), for people who think in the
  Hebrew calendar rather than converting from a Gregorian date in
  their head. Either way, a "Repeats every year" checkbox controls
  recurrence. A Hebrew-repeating event needs **no Hebcal lookup at
  all** when you save it — only a one-time (non-repeating) Hebrew
  date needs a single lookup, to pin down which Gregorian date it
  falls on this year.
- The grid's day-of-week header also switches to Hebrew-alphabet day
  letters (א׳ ב׳ ג׳...) when Hebrew is the primary calendar.
- **Next 30 days** is a plain, flat list beneath the grid, computed
  the same recurrence-aware way; anything within 7 days gets the same
  soft highlight as the grid.
- **Today popup** — the first time you open the Calendar tab each
  session, if anything (an event or a holiday) falls on today, a
  full-screen banner announces it before you see the grid. Nothing to
  configure — it just checks and shows itself when relevant.
- **Zmanim** (halachic daily times — dawn, sunrise, latest Shema,
  sunset, nightfall, etc.) are shown for today at the top of the tab.
  These depend on an exact location, so there's a **CALENDAR** card in
  Host → Integrations for latitude/longitude/timezone, defaulting to
  New York City. Change it if your family is elsewhere.

Every Hebcal call degrades gracefully — if the network hiccups or
Hebcal is briefly unavailable, the grid still shows Gregorian dates
and your events; you just temporarily lose the Hebrew labels/holidays
until the next successful load.

## Firebase setup

### Firestore
- **Firestore Database → Create database** → production mode.
- **Firestore → Rules** → paste, then **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```
- **Authentication → Sign-in method → enable Anonymous.** Every
  device signs in anonymously behind the scenes just so it's allowed
  to talk to Firestore — it has nothing to do with who the person
  says they are (that's the separate name/phone/PIN system below).
  **This is the single most common cause of sign-in hanging on
  "Loading…"** — if it's off, you'll now get a clear error message
  instead, telling you exactly this.

This app no longer uses Firebase Storage at all — Firestore alone is
enough for everything, and Firestore's free Spark-plan quota is
generous for a family's worth of chat/calendar/feed/recipes/AI-chat
traffic.

### Good to know: this is trust-based, not lockdown-secure
The rule above lets any signed-in device read and write anything —
approval, host status, and who-can-delete-what are enforced by the
app's own screens, not the database. That's the right trade-off for a
real family who has the passcode, but someone opening their browser's
dev console could, in principle, edit their own Firestore record
directly. Stricter server-side rules are possible later if that ever
matters for your family.

## Emergency Chat — a break-glass fallback, independent of Firebase

If Firestore or Firebase Auth itself ever breaks, the entire normal
sign-in flow breaks with it — so a real fallback can't live inside
the normal app. **Emergency Chat** is a separate, minimal channel with
zero Firebase dependency: it talks directly to a Google Sheet via a
Google Apps Script Web App.

**What it is, honestly:** one shared text-only room, no photos/video,
no multiple conversations, no real-time push (it polls every 8
seconds since Sheets can't do live updates). It's meant purely so the
family can still say "the app's down, here's what's going on" during
an outage — not a replacement for the real Chat.

**Where to find it:** a small "Can't sign in? Emergency Chat" link on
the gate screen (for when Firebase itself is unreachable and you
can't even sign in), and a small warning-triangle icon in the top bar
once you're in the app (for when something breaks mid-session).

### Setup (one-time, ~3 minutes)

1. Open `emergency-chat-apps-script.gs` (included alongside this
   README) — it has full setup steps in its own comments.
2. Short version: open a Google Sheet → Extensions → Apps Script →
   paste that file's contents in → Deploy → New deployment → Web app →
   Execute as **Me**, access **Anyone** → Deploy → copy the URL it
   gives you.
3. In `index.html`, find `const EMERGENCY_SHEETS_URL = "";` near the
   top of the `<script>` block and paste the URL between the quotes.

**Why this lives in the code, not Firestore:** every other integration
in this app (Cloudinary, Supabase, Gemini) stores its settings in
Firestore, editable from the Host tab without touching code. Emergency
Chat is the one deliberate exception — its whole purpose is working
when Firestore doesn't, so its config has to live somewhere that
doesn't depend on Firestore being up.

**On identity:** Emergency Chat only asks for a name, no approval
queue — intentionally more relaxed than the rest of the app, since
during a real outage the priority is "family can talk to each other,"
not access control. Anyone with the app URL and the family passcode
context could theoretically use it, which is an acceptable trade-off
for a break-glass channel, not a normal one.

## Signing in as host

Two independent ways — both work, on purpose:

1. **Phone match.** In `index.html`'s `<script>`, near the top, set
   `HOST_PHONE` to your own number. Whoever registers with that
   number becomes host automatically, no approval needed.
2. **PIN fast-track (for the host's own first sign-in).** On the gate
   screen there's a small, low-opacity key icon in the bottom-right
   corner — easy to miss on purpose. Tapping it and entering the PIN
   (`1239`, set as `HOST_PIN` near the top of the same script) skips
   the family question *and* the approval queue entirely and signs
   that device in as host right away. If you're not registered on
   that device yet, it'll ask for your name (and optionally phone)
   once.

## If sign-in gets stuck on "Loading…" or shows an error

Every screen shows a real error message with a **Try again** button
now instead of hanging. Common causes, in the order you'll likely hit
them on a brand-new Firebase project:

- **"Authentication hasn't been turned on..." (`auth/configuration-not-found`)**
  — Authentication was never initialized for this project at all. Go
  to **Authentication** in the Firebase Console and click **Get
  started** once, then enable **Anonymous** under Sign-in method.
- **"Anonymous sign-in isn't turned on..." (`auth/operation-not-allowed`)**
  — Authentication is set up, but the Anonymous provider specifically
  is off. **Authentication → Sign-in method → Anonymous → enable**.
- **A message about security rules** — make sure the relevant rules
  (Firestore and/or Storage, below) are pasted in **and published** —
  there's a Publish button; pasting alone isn't enough.

## Deploying to GitHub Pages

1. Create a new GitHub repo, push this whole folder to it.
2. Repo → **Settings → Pages** → Source: **Deploy from a branch** →
   branch `main`, folder `/ (root)`. Save.
3. GitHub gives you a URL like `https://yourname.github.io/repo-name/`.
   Open it — you'll land on the family passcode question.
4. On a phone, open that URL and use **"Add to Home Screen"** — it
   installs like an app using `manifest.json`.

## Notes on the two Firebase projects you set up

`index.html`'s `firebaseConfig` currently points at `fam-pwa` (your
primary project). Your `fam-pwa-2` config is your backup — the two
projects have **separate Firestore databases**, so switching means
switching to an empty chat/calendar/feed unless you export and
re-import the data.
