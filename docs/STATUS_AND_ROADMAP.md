# Status and Roadmap

_Reviewed: 2026-09-06_

## Current status

Catalogue v18 is a working multi-mode product backed by normalized JSON source and a deterministic compiler. `data/song-database.json` is the reviewable source; `scripts/song_database.mjs` compiles it into the browser-facing `data/catalogue.json`. The current source contains 1,107 master song records and 1,460 active mode placements.

| Area | Status | Current truth |
|---|---|---|
| Core gameplay | Stable | Real cards and Virtual play; 1–6 teams; First to 10 or Unlimited; Resume and Back handling |
| Year range | Implemented | Generic min/max selector, persisted in config/match state; physical out-of-range scans are rejected |
| Greatest Hits | Beta | 73/73 years; 879 songs; at least 12 per year |
| Australian | Beta | 73/73 years; 235 songs; legacy evidence and shallow pools remain |
| Unexpected Years | Preview | 65/73 years; 200 unique songs; expanded with 160 reviewed, evidence-gated existing masters |
| #1 US | Beta | 73/73 fixed chart leaders |
| #1 Australia | Beta | 73/73 fixed chart leaders |
| Movie Themes | Building | Answer year = represented movie release year; source memberships/work evidence still need curation |
| TV Themes | Building | Answer year = represented show's Season 1 / series-premiere year; source memberships/work evidence still need curation |
| TV & Movie Themes | Building | Deterministic union of Movie Themes + TV Themes, inheriting each source work's answer year |
| Remix: Original Year | Building | Hear an explicitly reviewed remix; answer with the canonical original song release year |
| One Hit Wonders | Building | Release-year mode over canonical master songs; curation/eligibility evidence still required |
| Canonical source | Working v18 | 1,107 immutable master identities shared across memberships |
| Release evidence | Improved | 858 masters externally observed; 249 unresolved |
| Provider links | Partially reviewed | Spotify: 605 linked masters / 4 verified preferred tracks. YouTube: 431 linked / 0 verified preferred tracks |
| Spotify runtime identity | Hardened | Static, cached and searched tracks use the same title + strong lead-artist identity gate; non-404 API failures propagate |
| Compiler | Working | Offline deterministic JSON compiler from `data/song-database.json` |
| SQLite | Future option | Useful as a rebuilt query/validation workspace, not required or authoritative |

The five established modes are selectable, but none is labelled Ready. Beta/Preview status reflects incomplete evidence and provider coverage, not a reason to weaken runtime identity or year invariants. The five newer modes are declared in `data/modes.json`; they remain Building until their data and mechanics satisfy the same release gate.

### Unexpected Years expansion

Unexpected Years now contains exactly 200 unique canonical songs across 65 release years. The original 40 memberships were preserved; 160 additional songs were selected for recognisability plus a defensible year trap such as ahead/behind-era sound, later breakthrough, revival, cover confusion, title misdirection or deliberate retro styling. Every one of the 160 new memberships resolves to an existing canonical master with accepted externally observed release evidence, so the expansion did not duplicate song identity.

The review also found two accepted release-year errors and corrected them at the canonical-master level: Gloria Gaynor's `I Will Survive` moved from 1977 to 1978, and Eurythmics' `Sweet Dreams (Are Made Of This)` moved from 1982 to 1983. Their superseded MusicBrainz claims remain retained as rejected evidence. Moving those songs would otherwise have broken the Greatest Hits 12-song-per-year floor, so 1977 was backfilled with the existing canonical `Stayin' Alive` master and 1982 received one properly sourced new master, Musical Youth's `Pass The Dutchie`. Its Spotify and YouTube IDs are retained only as unverified provider candidates, not promoted to verified/preferred playback.

The durable `test_unexpected_years_200.mjs` contract now blocks regressions in the 200-song total, unique canonical identity, 65-year coverage, evidence requirement for the 160 new additions, corrected release truth, and Greatest Hits depth.

## Architecture facts to preserve

The normalized JSON source separates master song facts from mode memberships and provider links. Release-mode answer years come from the master song's `release.answerYear`, and runtime identity uses immutable `songId`; a correction is made once and flows through every membership when the deterministic compiler rebuilds the runtime catalogue. The runtime must continue to consume a static artifact suitable for GitHub Pages.

P1 release-evidence hardening is deliberately asymmetric: external research may add confidence to the existing answer year, but it may not silently move that answer. Exact MusicBrainz title/full-credit matches with an official release and sufficient confidence can upgrade an unresolved master when the observed year equals `release.answerYear`. An earlier exact recording, a lower-confidence match, ambiguous/truncated search, alternate recording, or network failure remains in the durable review queue. Explicit reviewed corrections, such as the two Unexpected Years corrections above, retain the superseded claim as rejected evidence rather than erasing history.

Provider identity is separate from song identity. Automatically verified provider links require recording-level MusicBrainz provenance and only `free streaming` / `streaming` URL relationships are eligible. Provider metadata must still match the intended recording identity and version. Arbitrary MusicBrainz URL relationships, title-only matches and provider availability alone are not verification. Manual reviewed provider decisions remain supported through their separate evidence ledger.

Spotify runtime resolution now revalidates static catalogue IDs and cached IDs before playback using the same identity scorer used for search. The expected lead artist is compared against each Spotify artist credit with a strong match floor rather than permissive shared-token matching. A wrong static/cached candidate is discarded and normal search may recover; non-404 Spotify API failures remain visible errors rather than being converted into missing-track fallback.

The YouTube fallback still searches from the browser and validates candidate identity through the public API. It remains dependent on a restricted public key and quota. Search quota/auth failures must remain visible provider errors; they must not be treated as evidence that a song or year changed.

The screen-theme modes require a separate screen-work answer-year basis. A theme song remains canonical music data with its own `release.answerYear`, while its movie/show relationship supplies the gameplay year for theme modes. Movie Themes use the movie's release year. TV Themes use the show's Season 1 / series-premiere year. `TV & Movie Themes` must be derived from its two source modes while preserving song-to-screen-work relationship identity. `Remix: Original Year` needs an explicit reviewed alternate playback reference while preserving the original song's `songId` and `release.answerYear` as gameplay identity and answer.

## Roadmap

### Evidence and release hardening

1. Work the remaining release-evidence review queue, prioritising high-confidence exact matches just below the automatic threshold and any `earlier_exact_recording` conflicts.
2. Keep `release.answerYear` immutable during automated research. Any proposed year change requires explicit review with retained provenance.
3. Expand reviewed provider coverage where recording-level streaming provenance exists; do not spend large crawl budgets on low-yield arbitrary link discovery.
4. Prioritise YouTube provider certainty and runtime failure recovery, because no YouTube preferred recording is yet independently verified.
5. Keep `node scripts/check.mjs` as the blocking local/CI gate and retain the Spotify static/cached identity regressions.

### Mode expansion

1. Add a stable screen-work relationship model with verified movie release year / TV Season 1 premiere year and an explicit `screen` year basis.
2. Add `movie_themes` and `tv_themes` source memberships using screen-work answer years, without mutating canonical song release years.
3. Add `screen_themes` as the deterministic union of those two modes, preserving work identity and avoiding ambiguous duplicate audio with different answers.
4. Extend provider/recording relationships so `remix_original_year` can intentionally play a reviewed remix without contaminating normal-mode canonical playback.
5. Curate `one_hit_wonders` as canonical-song membership with explicit eligibility evidence.
6. Only make each mode selectable after its catalogue/runtime checks pass; sparse Preview operation is acceptable, silent fallback is not.

See `docs/MODE_EXPANSION_SPEC.md` for the detailed product and data contract.

### Normalized data evolution

1. Add reviewable schema/migrations for songs, recordings, evidence, provider tracks, chart entries, screen works, playlists, memberships, and cards.
2. Optionally rebuild a SQLite workspace from JSON for relational checks and queries; keep text JSON as reviewable source unless explicitly changed.
3. Prove semantic and gameplay equivalence before changing the browser catalogue shape.

### Playlist expansion

1. Keep established and future themed modes as shared memberships over canonical songs.
2. Add reviewed Spotify playlist import by resolving provider tracks to canonical song IDs; unresolved tracks become review items.
3. Do not infer answer years from Spotify metadata alone or maintain a second Spotify song database.

## Definition of green

A release is green when source and generated v18 data agree, schema and runtime checks pass, the compiler is deterministic/offline, every active mode obeys its declared year and identity invariants, provider candidates cannot bypass runtime identity validation, Pages stages the complete public asset set, and no credentials or session data are committed.
