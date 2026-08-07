# Guess the Song Year

A private-use, mobile-first web app that reuses the QR codes on an existing 308-card music timeline deck as **physical random card IDs**.

The app does **not** follow the QR URL. Instead it:

1. scans the QR;
2. extracts the five-digit card ID;
3. looks up the card's year;
4. chooses a replacement song from that exact year;
5. tells Spotify to play it on your selected device;
6. reveals the replacement song + year only when you tap **Reveal answer**.

## What is already built

- Camera QR scanning + manual fallback.
- Built-in 00001–00308 year profile.
- Per-card year corrections, stored locally and exportable/importable.
- Spotify Authorization Code + PKCE. No client secret in the browser.
- Spotify Connect device selection and direct playback control.
- **Discover mode:** random Spotify track with a strict exact-year metadata check; it will fail rather than silently play a different year.
- **My Library mode:** import an owned/collaborative Spotify playlist or CSV, then restrict replacements to exact-year songs from that library.
- No-repeat song selection within a game where possible.
- Fixed card→song assignment within a game so rescanning the same physical card is deterministic.
- Session history, new-game reset, library coverage by year.
- Installable PWA shell.
- Global error/status toast so setup issues remain visible when the app changes tabs.
- Year corrections invalidate any prior wrong-year assignment for that card.

## 5-minute setup

### 1. Host the folder over HTTPS

For phone camera use, deploy the contents of this folder to any static HTTPS host. GitHub Pages, Cloudflare Pages, Netlify, etc. all work.

For local desktop testing only:

```bash
cd Guess-the-Song-Year
python -m http.server 8080 --bind 127.0.0.1
```

Open `http://127.0.0.1:8080/`.

### 2. Create a Spotify Developer app

In the Spotify Developer Dashboard create one Development Mode app and copy its **Client ID**.

In the app's Redirect URIs add the exact URI shown by Guess the Song Year under **Settings → Redirect URI**.

Examples:

- deployed: `https://hwatson14.github.io/Guess-the-Song-Year/`
- local: `http://127.0.0.1:8080/`

Do not use `localhost`; Spotify requires an explicit loopback IP for HTTP local testing.

### 3. Connect Spotify

In Guess the Song Year:

1. Settings → paste Client ID.
2. Add the displayed redirect URI to Spotify's dashboard.
3. Tap **Connect Spotify**.
4. Open Spotify on the phone/speaker/TV you want to use and play/pause anything once.
5. Guess the Song Year → Settings → **Refresh** devices.

Spotify playback control requires Spotify Premium.

## GitHub Pages deployment

This package is ready for the `Guess-the-Song-Year` repository. The included `.github/workflows/pages.yml` validates the app and deploys the repository root to GitHub Pages on every push to `main`.

First-time GitHub setup:

1. Open **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
2. Push/commit to `main`. The workflow validates and publishes the site.
3. Open the deployed site, then **Settings → Run test** inside Guess the Song Year.
4. Copy the redirect URI shown in the app into the Spotify Developer Dashboard before connecting Spotify.

For this repository, the normal project-site address is `https://hwatson14.github.io/Guess-the-Song-Year/`. The app calculates its own redirect URI from the actual deployed URL.

The page includes `noindex` metadata and `robots.txt` because it is intended for private use.

## Song-source modes

### Discover

No song list required. Each card year is sent to Spotify Search using the `year:` filter. The returned track is independently checked against Spotify album-release metadata and rejected if the year does not match. Difficulty changes how deep into the results the app samples.

### My Library

Best for a curated family/friends version.

Option A: create a Spotify playlist you own (or collaborate on), then import it in the app.

Option B: import CSV:

```csv
title,artist,year,spotify_uri
Closing Time,Semisonic,1998,spotify:track:4EnkwZd0UJAuHpNMMemQaA
```

`spotify_uri` is optional. If omitted, the app resolves title + artist via Spotify Search when selected.

## Important data assumption

The built-in 308-card year profile assumes the AU/UK original ordering used during the prototype. It is intentionally editable: if a physical card disagrees, tap **Correct it** after reveal. Corrections are retained on that device and can be exported as JSON.

## Known limitations

- The 308-card year table is an **assumed prototype mapping**, as requested. It has not been verified card-by-card against the physical backs.
- Spotify album release metadata can represent reissues/remasters rather than the first historical release. For a high-integrity custom pack, use **My Library + CSV** with years you have curated.
- Discover mode does not know the original song printed on each physical card, so there is a small chance it can randomly select the original song itself.
- Spotify and the QR scanner library require internet access.

## Validation

Run:

```bash
python tests/validate.py
```

## Private-use / trademark note

This app is independent and is not affiliated with Jumbo, HITSTER or Spotify. It does not reproduce the original app or alter the physical cards; it reads QR text on cards you own and controls your Spotify account.
