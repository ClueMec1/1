[README (1).md](https://github.com/user-attachments/files/32177320/README.1.md)
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

## Why one file right now (and what changes later)

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

Recipes now have a **servings** field (set when adding or editing
one — defaults to 4). Every time you start Cook Mode, it asks how
many servings you want *that time*, pre-filled with the recipe's
normal amount — say 8 instead of 4 and every ingredient quantity
doubles automatically, so there's no mental math and nothing to
remember for next time either, since it asks fresh every time.

This is scoped to the **ingredients list only** — step instructions
are left exactly as written. A step might mention a temperature, a
pan size, or a bake time that has nothing to do with batch size, and
reliably telling an actual quantity apart from those in free-form
prose isn't safe to guess at, so it's left alone rather than risking
a wrong rewrite. The scaling itself handles whole numbers, decimals,
and fractions ("1/2", "1 1/2") and renders common fractions back as
symbols (¼ ½ ¾ ⅓ ⅔); an ingredient with no leading number (like "a
pinch of salt") is simply left as-is.

### Luna — a wake-word voice assistant for hands-busy cooking

Cook Mode now listens for **"Luna"** and does nothing else until it
hears it — that's deliberate, and solves a real problem: a system
that reacts to *everything* said nearby picks up ordinary kitchen
conversation and misfires constantly. Luna only ever acts on what
comes right after her name.

**The wake word is forgiving on purpose, without being noisy.** It
matches "Luna" exactly, a short list of known mishearings ("tuna,"
"loona," "lunar"), and anything within one letter-edit of "luna" —
enough that saying it quickly still works. It deliberately does
*not* go looser than that: a wider fuzzy match was tested and found
to falsely trigger on ordinary words like "Linda" or "Lane," which
would recreate the exact noise problem this feature exists to solve.

**What you can say**, right after "Luna": **next** / **okay** (also
"continue," "go on," "got it") to advance, **back** to return to the
previous step, **pause** and **resume** for the timer, **start
over** to restart the timer from its full duration, **add** or
**remove** any number of minutes ("Luna add seven minutes," "Luna
remove two minutes" — not limited to round numbers), **say that
again** (also "where was I," "repeat that") to re-hear whatever was
just said, and **I have a question, [anything]** to ask the AI a
real question about the recipe — it answers using the recipe's
ingredients and your current step as context, spoken back in 1-2
sentences. A tap on the small "Luna" pill in the header shows the
full list any time.

**The honest limitation:** this needs the browser's speech
recognition, which is reliably supported on Chrome, Edge, and
Android, but genuinely inconsistent on Safari for iPhone and iPad —
real-world reports describe it as unreliable there, especially for
continuous "always listening" use, and it may not work at all
depending on iOS version. This is feature-detected: on a device where
it's not well supported, Luna's indicator simply never turns on, and
every other part of Cook Mode (the buttons, the spoken steps) works
exactly the same either way.

One more integrity detail: Luna's microphone is explicitly paused
for the duration of every spoken response and resumed right after —
without that, she could hear her own voice reading a step and
misinterpret it as a command.

### Starting to talk faster

Steps used to have a noticeable pause between appearing on screen and
starting to speak. **True pre-recorded audio isn't possible** with
the free, built-in speech engine this app uses — that would need a
paid text-to-speech API generating and hosting audio files ahead of
time, which is a different scale of thing entirely. What *is* done:
the speech engine is "warmed up" — its voice list loaded and a
silent utterance spoken — the moment Cook Mode opens, which is where
most of that delay actually lived, rather than in anything about the
step text itself.

Cook Mode's controls are **Back/Next buttons, plus Luna's voice
commands where supported** — each screen (ingredients, part intros,
individual steps) is still read aloud automatically via
`speechSynthesis` the moment it appears, and a step with a timer
shows a **Start timer** button with a live countdown alongside
whatever Luna can now also do to it.

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

**The honest limit:** this only works while the app is open — a
background tab, a backgrounded phone PWA, that all still counts as
"open" and still works. A *fully closed* app (force-quit, or never
opened since restart) won't notify you, because nothing is running to
notice the new data. That's the real trade-off of staying
server-free.

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

## Games & points

A **Games** tab in the nav (bottom pill on phones, sidebar on
desktop) with three mini-games, none requiring any outside knowledge
(trivia was removed for exactly that reason): a self-contained
**Memory Match** card game (5–20 points depending on how few moves it
took), **Connect Four** (15 points for a win) with a bot that takes a
winning move when available, blocks yours when it has to, and
otherwise favors the center columns, and **Checkers** (20 points for
a win) with a bot that prefers captures when one's available.
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
**Coin Tic-Tac-Toe**, **Coin Sudoku**, and a **3D Platform Runner**
(built with Three.js) — each a complete, self-contained HTML game,
played in an iframe. They're embedded as base64-encoded text rather
than plain JS strings on purpose: their own code contains
`${...}` template-literal syntax and `<script>` tags, both of which
would collide with this file's own JavaScript if embedded any more
directly — base64 sidesteps that completely, and the round-trip
(encode → decode) was verified byte-for-byte identical to the
originals before shipping.

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
signed into the app); Coin Sudoku gives a flat 25 for finishing.
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

## Video calling — not built yet, and here's the honest reason why

WebRTC video calling is genuinely possible without a dedicated
signaling server — Firestore can carry the offer/answer/ICE exchange
between two devices, the same way it already carries everything else
here. The part that doesn't have a free, reliable answer is **TURN**:
free public **STUN** servers (which just help two devices discover
their own network address) are easy to use and already exist, but
many real-world connections — cellular data, symmetric NATs, some
corporate or home routers — need a **TURN relay server** to actually
connect the call, and a TURN server has to relay real audio/video
traffic, which costs real bandwidth — nobody gives that away free at
meaningful scale. A STUN-only version would work great on the same
WiFi network and fail unpredictably elsewhere, which isn't a good
foundation to ship silently. Worth building as its own dedicated
piece, with that trade-off out in the open, rather than folded into
everything else.

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
