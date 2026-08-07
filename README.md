# Guess the Song Year

A private-use, mobile-first music timeline game that reuses the QR codes on an existing 308-card physical deck.

The app never follows the QR URL. It reads the five-digit card ID, looks up the card's assumed year, chooses a different song from that same year, plays it, then reveals the answer only when requested.

Live site:

`https://hwatson14.github.io/Guess-the-Song-Year/`

## Game modes

- **Greatest Hits**: highly recognisable songs, biased toward major chart hits.
- **Australian**: Australian and Australian-formed acts where exact-year coverage is available.
- **Unexpected Years**: songs that are intentionally difficult to place by sound, including tracks that feel ahead of or behind their time.
- **Rock & Anthems**: rock, alternative, punk, metal and guitar-heavy picks.
- **Dancefloor**: pop, dance, disco, funk, R&B and party-friendly tracks.
- **Wildcard**: broad exact-year selection.

Every mode still uses the physical card's year. The category changes the replacement song, not the timeline distribution.

## Playback options

### YouTube

Best universal option. Players do not need a YouTube or Google login.

The app uses the YouTube Data API to find the selected song and the official YouTube IFrame Player API to play it. The player remains visible and YouTube may show ads.

One-time setup:

1. Create a Google Cloud project.
2. Enable **YouTube Data API v3**.
3. Create an API key.
4. Restrict the key to **YouTube Data API v3**.
5. Add an HTTP referrer restriction for:
   `https://hwatson14.github.io/Guess-the-Song-Year/*`
6. Open Guess the Song Year → **Settings** → paste the key under YouTube.

The key is stored only in that browser at present. A website-restricted key can later be baked into the deployment for zero-setup guests.

### Spotify

Optional cleaner playback path for a Spotify Premium user.

1. The Spotify developer-app owner creates a Spotify Web API app.
2. Add the exact Redirect URI shown in **Settings**.
3. Paste the Client ID into the app.
4. Tap **Connect Spotify** and log into the player's Spotify account.
5. Select their active Spotify device.

The app uses Authorization Code + PKCE, so no Spotify client secret is stored in the browser.

## Song selection and year integrity

- The physical card supplies the target year.
- Greatest Hits and genre modes use a public Billboard year-end research catalogue as candidate material.
- Candidate chart year is **not** trusted as release year by itself.
- YouTube selections are checked against MusicBrainz first-release metadata before playback where required.
- Spotify selections are checked against Spotify album release metadata.
- Australian mode searches a curated set of Australian/Australian-formed artists and constrains MusicBrainz results to the target release year.
- Unexpected Years includes curated time-warp candidates, but candidates are still subject to exact-year validation before playback.

## Physical card mapping

The built-in `00001–00308` year mapping is the prototype mapping accepted for this project. It has not been verified card-by-card against every physical card back.

If a card is wrong, use **Correct card year** after reveal. Corrections are saved in that browser.

Known calibration point:

`00067 → 1998`

## Current limitations

- YouTube may show ads and visible video/player metadata.
- YouTube search requires a Data API key and is subject to API quota.
- Spotify Development Mode has account/user restrictions and requires Premium for playback control.
- Public music metadata can contain reissues, remasters and imperfect release dates, so exact-year validation can sometimes reject an otherwise reasonable candidate.
- Australian and narrow genre modes can have sparse coverage in some early years.

## Deployment

GitHub Pages is deployed automatically from `main` using `.github/workflows/pages.yml`.

The repository is intended for private personal gameplay and is not affiliated with HITSTER, Jumbo, Spotify, Google or YouTube.
