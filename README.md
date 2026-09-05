# Guess the Song Year

Private music timeline game using the existing 308-card QR deck or a fully virtual deck.

> This is a private app. The 308 card identities are verified; printed-year reconciliation continues naturally during play through the local Reveal correction control and remains non-blocking for deployment.

## Agent handoff

See [AGENTS.md](AGENTS.md), [current status and roadmap](docs/STATUS_AND_ROADMAP.md), and [data architecture](docs/DATA_ARCHITECTURE.md). The normalized JSON implementation supersedes the earlier v6/v10 recovery proposal.

## Current scope

- Five clearly labelled music modes (see the status table below)
- Two play styles: **Real cards** and **Virtual**
- 1–6 teams
- Adjustable 1950–2022 year range, saved with each match
- Virtual decks refill while unused songs remain; exhausted ranges finish with scores preserved
- First to 10 cards or Unlimited
- Spotify Premium playback or YouTube fallback
- Browser/device Back unwinds nested game screens and modals; at a top-level screen it leaves the app normally
- Phone gameplay is composed to fit without vertical page scrolling at 375x667, 390x844 and 430x932
- Physical Reveal can save a corrected card year in this browser so future scans use it
- Match phase, current card/song and reveal state are persisted so Resume restores the current turn

### Timelines and bonus points

Both teams' timelines stay on the main game screen. Year tiles wrap instead of disappearing off the side; larger team counts and long Unlimited games scroll within the board.

After placement is marked, the active team can claim **Bonus point +1** only if it named both the song title and artist correctly. This is an optional, manually judged award, once per card. Bonus points are separate from the card score and persist with Resume.

- **1 bonus point:** skip the current card and keep the same team's turn.
- **5 bonus points:** reveal and add a separate unused year card, earning one card toward victory without spending the turn. The current hidden card stays unchanged.
- A failed bonus draw costs nothing. Provider-error recovery remains free.
- Physical placement now stays on Reveal for bonus claiming before Next Team. Collected physical years are retained in the app; physical starter cards not recorded in the app remain on the table.

### Mode status

| Mode | Status | Coverage | Meaning |
| --- | --- | ---: | --- |
| Greatest Hits | Beta | 73/73 years | All years selectable; canonical recording and pool-depth curation continues |
| Australian | Beta | 73/73 years | All years selectable; shallow pools and legacy evidence remain |
| Unexpected Years | Preview | 40/73 years | Deliberately sparse one-song-per-covered-year preview |
| #1 US | Beta | 73/73 years | One fixed US chart leader per chart year |
| #1 Australia | Beta | 73/73 years | One fixed Australian chart leader per chart year |

Coverage counts usable songs after the runtime filter. Catalogue v17 contains 1,118 master song records across 1,299 mode placements: 877 Greatest Hits (at least 12 per year), 236 Australian, 40 Unexpected Years, and 73 in each chart mode. Every stored row is usable. Original cleanup records remain accounted for in the archive; the expansion ledger retains source recording metadata and withdrawn alias decisions. Run `node scripts/catalogue_summary.mjs` for runtime counts and `node scripts/song_database_report.mjs` for provider coverage. Legacy release evidence and exact playback-recording verification remain incomplete, so status stays Beta/Preview.

No mode is currently labelled **Ready**. `data/modes.json` is the product source of truth for these labels and their explanations. A sparse mode never silently falls back to another mode: Virtual play deals only supported years, while Real cards report an unavailable year and let the player scan another card or change mode.

## Architecture

- `app-policy.js` - testable runtime policy for error classification, Back interception and timeline placement
- `PRODUCTION_CONTRACT.md` - authoritative integration requirements for runtime, cards and catalogue data
- `verification/` - physical-card identity audit, unresolved-year ledger and capture/import protocol

- `index.html` — minimal app shell
- `app.css` — consolidated visual system
- `engine.js` — card map plus Spotify/YouTube integrations
- `engine-v7.js` — status-aware multi-mode runtime guard and duplicate/variant filtering
- `app.js` — physical/virtual game state and UI
- `data/song-database.json` — authoritative master song records, central provider links and mode memberships
- `scripts/song_database.mjs build` — generate the runtime catalogue; CI rejects stale output
- `data/catalogue.json` — generated compatibility view consumed by the game
- `data/modes.json` — authoritative mode metadata, lifecycle status and year semantics
- `data/catalogue.schema.json` — static catalogue contract
- `scripts/validate_catalogue.py` / `scripts/validate_modes.py` — validate the status-aware catalogue contract
- `scripts/build_catalogue.py` — legacy catalogue builder; catalogue generation is not part of runtime gameplay

Each master song has a stable ID, title, artist, release evidence, and Spotify/YouTube links. Separate memberships tag it for Greatest Hits, Australian, Unexpected Years or chart modes, retaining chart-year semantics. A verified preferred provider link applies across all memberships. Imported links are candidates until reviewed; metadata availability alone does not prove the exact recording. Missing IDs continue to use the existing search flow.

Provider maintenance commands:

- `node scripts/import_provider_candidates.mjs --write` imports candidate references and completed metadata observations.
- `node scripts/integrate_recording_links.mjs --write` checks MusicBrainz URL proposals against retained source responses before adding candidates.
- `node scripts/provider_review_report.mjs --write` writes missing links, differing credits and live/performance review flags to `verification/provider-review-queue.json`.
- `node scripts/song_database_report.mjs --write` refreshes aggregate coverage.

Transient metadata request failures preserve earlier observations. None of these importers promotes a candidate into a preferred playback recording. Explicit reviewed decisions in `verification/provider-recording-decisions.json` are applied with `node scripts/promote_reviewed_links.mjs --write`. This gate checks recording identity, provider metadata, version annotations, release year and the direct source relationship; audio-audition status remains explicit. Cached search results are invalidated when the catalogue selects a different provider ID.

## Core invariant

For every played card, the selected song must come from the chosen mode's bucket for that card year. Runtime mode or year fallback is not permitted. Release-year modes use the recording's release year; the two #1 modes use chart year.

The existing catalogue still needs further human curation for canonical release-year quality and recognisability. The v7 runtime filter removes obvious remix/live/backing-track duplicates, but this is not a substitute for a fully curated canonical catalogue.

## Deployment

Run `node scripts/check.mjs` for the shared local/CI validation suite. GitHub Pages uses the same gate and publishes only the staged app assets, data and vendored libraries. A failed validation step prevents deployment. Research outputs and local browser logs are excluded from the deployed site.
