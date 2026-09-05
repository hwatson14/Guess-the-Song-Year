# Guess the Song Year

Private music timeline game using the existing 308-card QR deck or a fully virtual deck.

## Read this first

For current implementation status and the planned database migration, see:

- [`AGENTS.md`](AGENTS.md) — authoritative Codex/AI-agent contract and execution order
- [`docs/STATUS_AND_ROADMAP.md`](docs/STATUS_AND_ROADMAP.md) — current repository status, blockers and phased roadmap
- [`docs/DATA_ARCHITECTURE.md`](docs/DATA_ARCHITECTURE.md) — normalized song/evidence/provider/playlist model

### Important current status

The repository has a known generated-data mismatch that must be resolved before expanding the catalogue:

- the checked-in `data/catalogue.json` was still **v6** during the 2026-09-05 review;
- the current schema, validator and deployment workflow expect the canonical **v10** Greatest Hits catalogue;
- `scripts/build_catalogue_v10.py` contains the newer canonical builder;
- experimental themed-playlist/v11 work exists but remains deferred until the canonical base is coherent and green.

Do not weaken validation to make the stale generated catalogue pass. Recover the intended canonical v10 baseline first, then proceed with the normalized data migration described in the docs.

## Current playable scope

The active product remains intentionally narrow while the core loop and canonical catalogue are stabilised:

- One active production music mode: **Greatest Hits**
- Two play styles: **Real cards** and **Virtual**
- 1–6 teams
- First to 10 cards or Unlimited
- Spotify Premium playback or YouTube fallback
- Browser/device Back is captured as in-app navigation instead of immediately leaving the game
- Match phase, current card/song and reveal state are persisted so Resume restores the current turn

## Core invariant

For every played card:

```text
card year == answer year == selected song year
```

Alternate versions must not create extra answers for the same underlying song. Remasters, edits, remixes, live/acoustic variants and re-recordings should collapse appropriately while genuine titles containing words such as `Live`, `Radio`, `With` or `Part` remain valid.

Playlist membership must never redefine canonical song/year truth.

## Architecture today

- `index.html` — minimal app shell
- `app.css` — consolidated visual system
- `engine.js` — physical card map plus Spotify/YouTube integrations
- `engine-v7.js` — current runtime guard/no-repeat logic
- `app.js` — physical/virtual game state and UI
- `data/catalogue.json` — prebuilt runtime catalogue **(generated artifact; currently known stale versus the v10 contract)**
- `data/catalogue.schema.json` — catalogue contract
- `scripts/validate_catalogue.py` — catalogue/gameplay validation
- `scripts/build_catalogue_v10.py` — strongest current canonical Greatest Hits builder
- `scripts/build_playlists_v11.py` / `scripts/build_modes.py` — experimental themed-playlist work, not the production source of truth

## Target data architecture

The long-term model is:

```text
reviewable normalized source data
        |
        v
SQLite logical model / validation workspace
        |
        v
offline deterministic compiler
        |
        v
data/catalogue.json
        |
        v
GitHub Pages runtime
```

Canonical songs, recordings, evidence, provider tracks, chart entries and playlist membership should be modeled separately. Playlists reference canonical songs rather than duplicate full song objects.

See [`docs/DATA_ARCHITECTURE.md`](docs/DATA_ARCHITECTURE.md) for details.

## Agreed product backlog

After the canonical data baseline/migration is safe:

1. **Min/max year selector** — a generic two-ended year range control so players can easily choose ranges such as 1990 onward. Virtual mode deals only in-range cards; physical out-of-range scans are rejected clearly.
2. **Themed playlists** — Greatest Hits, Sing Along, Australian, Unexpected Years, Party Anthems and Rock Classics represented as playlist membership over canonical songs.
3. **Existing Spotify playlist support** — imported provider tracks resolve to canonical songs and become playlist membership; unresolved/ambiguous tracks require review rather than guessed years.

## Deployment

GitHub Pages deployment validates JavaScript and the catalogue contract before publishing. Deployment should validate already-reviewed catalogue truth rather than discover or author new song truth from mutable external APIs.

Networked MusicBrainz/chart/provider enrichment should be separated from deterministic offline compilation and deployment.
