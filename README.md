# Guess the Song Year

Private music timeline game using the existing 308-card QR deck or a fully virtual deck.

## v7 scope

The playable product is intentionally narrow while the core loop is stabilised:

- One active music mode: **Greatest Hits**
- Two play styles: **Real cards** and **Virtual**
- 1–6 teams
- First to 10 cards or Unlimited
- Spotify Premium playback or YouTube fallback
- Browser/device Back is captured as in-app navigation instead of immediately leaving the game
- Match phase, current card/song and reveal state are persisted so Resume restores the current turn

Additional catalogues and custom playlists are deferred until this core mode is reliable.

## Architecture

- `index.html` — minimal app shell
- `app.css` — consolidated visual system
- `engine.js` — card map plus Spotify/YouTube integrations
- `engine-v7.js` — v7 runtime guard: exposes Greatest Hits only and filters obvious duplicate/variant catalogue records
- `app.js` — physical/virtual game state and UI
- `data/catalogue.json` — prebuilt song catalogue
- `data/catalogue.schema.json` — static catalogue contract
- `scripts/validate_catalogue.py` — validates all 308 cards have a covered Greatest Hits year and enforces the active app contract
- `scripts/build_catalogue.py` — legacy catalogue builder; catalogue generation is not part of runtime gameplay

## Core invariant

For every played card, the selected song must come from the prebuilt Greatest Hits bucket for that card year. Runtime mode fallback is not permitted in v7.

The existing catalogue still needs further human curation for canonical release-year quality and recognisability. The v7 runtime filter removes obvious remix/live/backing-track duplicates, but this is not a substitute for a fully curated canonical catalogue.

## Deployment

GitHub Pages deployment now runs JavaScript and catalogue validation before publishing. A failed validation step prevents that deployment run from continuing.
