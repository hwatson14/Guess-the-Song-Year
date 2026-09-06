# Status and Roadmap

_Reviewed: 2026-09-05_

## Current status

The v17 architecture is a working multi-mode product backed by normalized JSON source and a deterministic compiler. `data/song-database.json` is the reviewable source; `scripts/song_database.mjs` compiles it into the browser-facing `data/catalogue.json`. The source contains 1,118 master song records and 1,299 mode placements.

| Area | Status | Current truth |
|---|---|---|
| Core gameplay | Stable | Real cards and Virtual play; 1–6 teams; First to 10 or Unlimited; Resume and Back handling |
| Year range | Implemented | Generic min/max selector, persisted in config/match state; physical out-of-range scans are rejected |
| Greatest Hits | Beta | 73/73 years; 877 songs; at least 12 per year |
| Australian | Beta | 73/73 years; 236 songs; legacy evidence and shallow pools remain |
| Unexpected Years | Preview | 40/73 years; intentionally sparse |
| #1 US | Beta | 73/73 fixed chart leaders |
| #1 Australia | Beta | 73/73 fixed chart leaders |
| Canonical source | Working v17 | 1,118 masters, shared across memberships |
| Compiler | Working | Offline deterministic JSON compiler from `data/song-database.json` |
| Provider links | Partially reviewed | Three preferred Spotify links; no preferred YouTube links; remaining imports are candidates |
| SQLite | Future option | Useful as a rebuilt query/validation workspace, not yet required or authoritative |

All five modes are selectable, but none is labelled Ready. Beta/Preview status reflects incomplete evidence and provider coverage, not a reason to weaken runtime identity or year invariants.

## Architecture facts to preserve

The normalized JSON source separates master song facts from mode memberships and provider links. Release-mode answer years now come from the master song's `release.answerYear`, and runtime identity uses immutable `songId`; a correction is made once and flows through every membership when the deterministic compiler rebuilds the runtime catalogue. The runtime must continue to consume a static artifact suitable for GitHub Pages.

The current YouTube fallback searches from the browser and validates candidates through the public API. It is dependent on a restricted public key and quota. Search quota/auth failures must remain visible provider errors; they must not be treated as evidence that a song or year changed. Spotify preferred links are reviewed separately from unverified imports.

## Roadmap

### Evidence and release hardening

1. Review remaining canonical release-year and recording evidence while retaining provenance and reviewed decisions.
2. Keep `node scripts/check.mjs` as the blocking local/CI gate and ensure all clean-checkout workflow inputs are committed.
3. Improve YouTube quota monitoring, candidate validation, and failure recovery; preserve clear fallback behavior.

### Normalized data evolution

1. Add reviewable schema/migrations for songs, recordings, evidence, provider tracks, chart entries, playlists, memberships, and cards.
2. Optionally rebuild a SQLite workspace from JSON for relational checks and queries; keep text JSON as reviewable source unless explicitly changed.
3. Prove semantic and gameplay equivalence before changing the browser catalogue shape.

### Playlist expansion

1. Keep the five current modes as shared memberships over canonical songs.
2. Add reviewed Spotify playlist import by resolving provider tracks to canonical song IDs; unresolved tracks become review items.
3. Do not infer answer years from Spotify metadata alone or maintain a second Spotify song database.

## Definition of green

A release is green when source and generated v17 data agree, schema and runtime checks pass, the compiler is deterministic/offline, every active mode obeys year and identity invariants, Pages stages the complete public asset set, and no credentials or session data are committed.
