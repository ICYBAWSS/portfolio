# Portfolio v5: font overhaul, dynamic GitHub projects, media cross-pause, iPod viz, bulletin board

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Six upgrades to `~/Desktop/rayhan-portfolio/index.html` — new type system (Valley Sans + Roboto Mono), a *dynamic* project section fed by a GitHub Action (pinned repos + auto-vendored README images), mutual pause between song/video, a bigger-touch iPod with a 1-row waveform visualizer, and a draw-and-pin bulletin board.

**Architecture:** Single static HTML fragment (unchanged structure). The project section stops being hardcoded: a GitHub Actions workflow queries the GraphQL `pinnedItems` API server-side (token never in HTML), commits a `pinned.json` + downloads each repo's first README image into `assets/projects/`; the page fetches `pinned.json` from `raw.githubusercontent.com` (CORS `*`) at runtime and falls back to a static list on failure.

**Tech Stack:** vanilla JS + CSS; GitHub Actions (GraphQL API); no new client deps.

---

## Verified facts (affect the design — do not re-derive)

- **`raw.githubusercontent.com` and `api.github.com` send `Access-Control-Allow-Origin: *`** → browser `fetch` works, no proxy.
- **`github.com/user-attachments/assets/...` images send NO CORS header** (they 302 to S3 presigned URLs). Display in `<img>` works, but `canvas.getImageData` (pixel sampling) throws `SecurityError`. → images must be vendored into the repo (same-origin), which the Action does.
- **`gh-pinned-repos.egoist.dev` is dead** (Deno Deploy Classic sunset 2026-07). No other no-auth pinned endpoint exists; pinned data is GraphQL-only and needs a token.
- **"Valley Sans" exists** on Google Fonts, weights 300–800. "Roboto Mono" has 400/500/700.
- **The portfolio is a git repo on branch `main` with NO remote** → must be pushed to GitHub before the Action can exist.

---

## Task 0 — Prerequisite: push to GitHub (user action, one-time)

Rayhan must create the repo and push (I can scaffold, he authorizes the remote):

```bash
cd ~/Desktop/rayhan-portfolio
git remote add origin git@github.com:ICYBAWSS/rayhan-portfolio.git   # or https + PAT
git push -u origin main
```

The Action (Task 3) and `pinned.json` fetch target both depend on this URL. If the portfolio is instead hosted elsewhere (GitHub Pages under a different repo), substitute that repo path in Tasks 3–4.

---

## Task 1 — Full font overhaul

**Objective:** Replace DM Mono (vibe-coded) and Instrument Serif with Valley Sans (body) + Roboto Mono (display/ASCII).

**Files:** `index.html`

**Step 1 — import (line 3):**

```css
@import url('https://fonts.googleapis.com/css2?family=Valley+Sans:wght@300;400;500;600;700;800&family=Roboto+Mono:wght@400;500;700&display=swap');
```

**Step 2 — base container (line 6):** `.port{...font-family:'Valley Sans',sans-serif;...}`

**Step 3 — mono anchor classes (ASCII art + glyph overlays MUST stay monospace — ch/em positioning breaks otherwise):** set `font-family:'Roboto Mono',monospace` on `.a-pre`, `.a-glyph`, `.a-video`, `.a-zone`, `.a-rowzone`, `.a-ctl`, `.ipod-screen`. (These currently use DM Mono.)

**Step 4 — display/titles → Roboto Mono 700:** `.proj-title` (line 256), `.hc-name` (line 270), and in JS `PRETEXT.name` (line 1094 `'italic 32px Instrument Serif'` → `'700 32px Roboto Mono'`; same for the `isNarrow` `'italic 25px Instrument Serif'` → `'700 25px Roboto Mono'`).

**Step 5 — body → Valley Sans:** `PRETEXT.bio` (line 1095 `'300 13px DM Mono'` → `'300 13px Valley Sans'`, plus the narrow variant). `.nav-item`, `.tag`, `.about-p`, `.proj-desc`, `.clink`, `.sec-label`, `.work-tab` inherit Valley Sans from `.port` (no explicit change needed).

**Step 6 — verify:** `grep -n "DM Mono\|Instrument Serif" index.html` → 0 hits. Open page: name/card titles render bold mono; iPod/TV glyph buttons still sit exactly on the art (Roboto Mono `1ch` ≈ DM Mono `1ch`; eyeball, adjust `left/top` anchors only if drifted).

---

## Task 2 — Dynamic project section (client side)

**Objective:** Fetch `pinned.json` at runtime, render project cards with blurred image + luminance-sampled text color + hover reveal. Local override map for image/desc/order edits.

**Files:** `index.html` (CSS + JS)

**Step 1 — data model + override map (JS, near `contentData`):**

```js
const PROJECT_OVERRIDES = {
  // key = repo name (case-sensitive, from GitHub). Editable by hand:
  // 'FlipFocus': { image:'assets/projects/FlipFocus.png', desc:'...', tags:['Swift'], order:1 },
};
async function loadProjects(){
  try {
    const r = await fetch('https://raw.githubusercontent.com/ICYBAWSS/rayhan-portfolio/main/pinned.json');
    if (!r.ok) throw 0;
    return (await r.json()).map(p => Object.assign(p, PROJECT_OVERRIDES[p.name]||{}));
  } catch(e) {
    return FALLBACK_PROJECTS; // static array with the 3 current repos + local image paths
  }
}
```

`FALLBACK_PROJECTS` = the 3 repos already fetched (FlipFocus, wikipedia_graph, pulsemap) with `image:'assets/projects/<name>.png'` — so the site still renders offline or pre-Action.

**Step 2 — render (replace the hardcoded `contentData.dev.work` list with a call):** in `updateDynamicContent`, when `workType==='list'`, `const items = await loadProjects(); projList.innerHTML = items.map(renderProject).join(''); bindTilt();` — then bind per-card reveal/sampling. (Make `updateDynamicContent` async, or fire the fetch and render on `.then`.)

**Step 3 — card markup + blur/reveal CSS:**

```css
.proj-card.has-bg{position:relative;overflow:hidden;}
.proj-bg{position:absolute;inset:-8%;background-size:cover;background-position:center;
  filter:blur(9px) saturate(.9);transform:scale(1.08);transition:filter .35s ease,transform .35s ease;}
.proj:hover .proj-bg{filter:none;transform:scale(1);}
.proj-card.has-bg .proj-main,.proj-card.has-bg .proj-arrow{position:relative;z-index:1;transition:opacity .25s ease;}
.proj-card.has-bg.light-text{color:#f2ede3;}
.proj-card.has-bg.light-text .proj-title{color:#fff;}
.proj-card.has-bg.dark-text .proj-title{color:#1a1206;}
.proj:hover .proj-card.has-bg .proj-main,.proj:hover .proj-card.has-bg .proj-arrow{opacity:0;}
```

**Step 4 — luminance sampling (the ~15 lines):** for each card with an image, load it into an `Image` (same-origin → not tainted), draw to an offscreen 1×1 canvas via a scaled `drawImage`, read the single pixel, compute relative luminance `Y = .2126r+.7152g+.0722b`; add class `light-text` if `Y < 128` else `dark-text`. This is the "text color calculated from the blurred image" — blur ≈ average ≈ the sampled mean.

**Step 5 — click → repo:** wrap card in `<a href="${p.url}" target="_blank" rel="noopener">` or add a delegated `data-href` click.

**Step 6 — verify:** dev tab shows 3 real cards; images blurred with readable auto-colored text; hover → text fades + image sharpens; click opens repo. Kill network (DevTools offline) → fallback list still renders.

---

## Task 3 — GitHub Action: pinned repos → `pinned.json` + vendored images

**Objective:** Server-side GraphQL fetch of pinned repos, download first README image per repo, commit both. Token never in HTML.

**Files:** create `.github/workflows/pinned.yml` in the portfolio repo.

**Step 1 — workflow:**

```yaml
name: refresh-pinned
on:
  schedule: [{cron: '0 */6 * * *'}]
  workflow_dispatch: {}
permissions:
  contents: write
jobs:
  refresh:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: fetch pinned + vend images
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}     # fallback: secrets.PINNED_PAT
        run: |
          set -euo pipefail
          mkdir -p assets/projects
          curl -sS -H "Authorization: bearer $GH_TOKEN" \
            -d '{"query":"{ user(login:\"ICYBAWSS\"){ pinnedItems(first:6,types:REPOSITORY){ nodes{ ... on Repository{ name description url stargazerCount primaryLanguage{ name } } } } } }"}' \
            https://api.github.com/graphql > /tmp/pinned.json
          # build final json with image paths
          node .github/scripts/build-pinned.mjs /tmp/pinned.json pinned.json
      - name: commit
        run: |
          git config user.name github-actions
          git config user.email actions@github.com
          git add pinned.json assets/projects
          git commit -m "chore: refresh pinned repos" || echo "no changes"
          git push
```

**Step 2 — `build-pinned.mjs`:** read GraphQL result, for each repo: `fetch(https://api.github.com/repos/ICYBAWSS/<name>/readme, {headers:{Accept:'application/vnd.github.raw'}})` → regex first `!\[[^\]]*\]\(([^)]+)\)` or `<img[^>]+src="([^"]+)"` → if URL found, `fetch` it to `assets/projects/<name>.<ext>`; emit `pinned.json` array `[{name,description,url,language,stars,image:'assets/projects/<name>.<ext>'}]` (image `null` if none). Skip downloading if already present (idempotent).

**Step 3 — token:** try `GITHUB_TOKEN` first (zero setup). If GraphQL returns `null` for `pinnedItems` (GITHUB_TOKEN may be scoped to repo resources and unable to read user profile), create a **fine-grained PAT** (read-only: public repos + profile) and store as repo secret `PINNED_PAT`; swap the env line. Either way the token stays server-side.

**Step 4 — verify:** push; trigger via `workflow_dispatch`; confirm `pinned.json` + 3 PNGs land on `main`; `curl -sI https://raw.githubusercontent.com/ICYBAWSS/rayhan-portfolio/main/pinned.json` shows `access-control-allow-origin: *`.

---

## Task 4 — Cross-pause: song ↔ video

**Objective:** Playing one silences the other; switching hobbies silences both.

**Files:** `index.html` JS

- Add module global `let tvVideo = null;` beside `ipodAudio`.
- In `initTv`: `tvVideo = main;` and `main.addEventListener('play', ()=>{ if (ipodAudio) ipodAudio.pause(); });`
- In `initIpod`: `audio.addEventListener('play', ()=>{ if (tvVideo) tvVideo.pause(); });`
- Top of `updateDynamicContent`: `if (ipodAudio) ipodAudio.pause(); if (tvVideo) tvVideo.pause();` (closes the ghost-audio gap the current `ipodAudio`-only guard leaves for the TV).

**Verify:** play a song → click a VHS → song stops, video plays; back to song → video pauses. Switch hobby mid-play → silence.

---

## Task 5 — Bigger, obvious iPod controls

**Objective:** Enlarge the wheel glyphs without re-anchoring.

**Files:** `index.html` CSS

- `.ipod-device .a-pre{font-size:15px;}` (art + em-anchored glyphs scale together).
- `.ipod-device .a-glyph{font-size:18px;min-width:3ch;}`
- Strengthen affordance: `.ag-center`/play glyph get `text-shadow`/brighter hover already present — add `.a-glyph{border-radius:50%}` and a faint ring on hover for a button feel.

**Verify:** producer tab → controls visibly larger, still on the wheel; prev/next/toggle/menu all still click correctly.

---

## Task 6 — iPod waveform visualizer (1-row)

**Objective:** Thin scrolling waveform in the status row (row 12, the "Backlight" row), driven by Web Audio time-domain data; flat when paused.

**Files:** `index.html` JS (`initIpod`)

- Append inside `.ipod-device`: `<canvas class="ipod-viz" style="position:absolute;left:7ch;top:14.4em;width:26ch;height:1.2em"></canvas>` (row 12 = index 12 × 1.2em; matches existing `swap(12,'Backlight',…)`).
- One `AudioContext` + `createMediaElementSource(audio)` + `AnalyserNode(fftSize=512)` per `initIpod` call (audio element is recreated each visit — disconnect the old source to avoid the one-source-per-element limit).
- rAF loop: `getByteTimeDomainData` → draw last ~80 samples as a 1px line in `#e8e2d9` at low alpha; `audio.paused` → draw a flat baseline.
- Waveform sits *behind* the status text (canvas z-index below the `pre`), so "▶ playing 0:12/3:45" stays readable.

**Verify:** play a track → status row shows a moving waveform; pause → flat line.

---

## Task 7 — Bulletin board (nav-only section)

**Objective:** A draw-pad that pins visitor doodles onto a fixed cork board, persisted to localStorage. No work-tab — it's a hidden extra scroll stop reached via nav.

**Files:** `index.html` (CSS + JS + markup)

**Step 1 — nav:** add `<button class="nav-item" data-key="board">bulletin</button>` to `.left-nav`; add `'board'` to the scroll-spy array `['life','work','contact']` and to `jumpTo` targets.

**Step 2 — section markup** (insert in `.right` before `#sec-contact`, which must stay last `min-height:100%` — snap-trap pitfall): `#sec-board` with `.board-pad` `<canvas>` (520×360 CSS px, `cursor:crosshair`, 3px round ink strokes) + buttons **Pin it** / **Clear pad**, and a `.board-wall` (fixed-height horizontal strip of pinned notes).

**Step 3 — pin/persist:** `pad.toDataURL()` → push `{id, img}` into `localStorage['bb-notes']` (cap 12, `shift()` oldest, `try/catch` QuotaExceeded → inline status message). Render thumbs (92px, slight rotate, CSS tape `::before`), click a pinned note to unpin. Rehydrate on load. This is local-only per browser — a shared world-visible board needs a backend (flag to Rayhan; not in scope).

**Step 4 — draw pad:** pointerdown/move/up → `ctx.lineTo`, ~20 lines total, no framework.

**Verify:** draw → Pin → appears on wall; reload → persists; 13th pin drops the oldest; nav "bulletin" jumps to it and highlights.

---

## Order, risks, open questions

Order: **0 → 1 → 3 → 4 → 2 → 5 → 6 → 7** (push + font + Action first so the dynamic fetch has a source; client rendering after the data pipeline exists).

- **Risk:** Roboto Mono glyph metrics vs DM Mono — visual re-check of the ASCII overlays after Task 1/5 (adjust anchors if off).
- **Risk:** GITHUB_TOKEN may not read `pinnedItems` → fine-grained PAT fallback (documented, still secret-side).
- **Risk:** `raw.githubusercontent` fetch fails (offline/rate-limit) → `FALLBACK_PROJECTS` keeps the section populated.
- **Open:** repo URL/name for Task 0 (default `ICYBAWSS/rayhan-portfolio`); board stays local-only unless he wants a backend.

## Validation (end-to-end)

Load the page: four hobbies + board all render, no console errors, no ghost audio; kill network → projects fall back; trigger the Action → pinned.json + images land; hover a card → reveal; play/pause cross-mutes.
