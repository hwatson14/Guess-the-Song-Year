# Guess the Song Year — Agent Contract

## Current release contract

This repository is a static Guess the Song Year web product. Preserve the narrow, playable loop while data correctness is completed:

- v17 has five selectable modes: Greatest Hits, Australian, Unexpected Years, #1 US, and #1 Australia.
- Greatest Hits, Australian, #1 US, and #1 Australia are Beta; Unexpected Years is Preview.
- Real cards and Virtual play support 1–6 teams, First to 10 or Unlimited, Resume, and browser/device Back handling.
- A generic minimum/maximum year range is implemented and persisted. Virtual deals only eligible years; physical scans outside the range are rejected.
- Spotify Premium playback and YouTube fallback remain provider paths. Provider failures must not change the card year.

Read `README.md`, `docs/STATUS_AND_ROADMAP.md`, `docs/DATA_ARCHITECTURE.md`, the relevant runtime/data files, and relevant workflow files before material catalogue or database work. Harry’s latest explicit instruction has highest authority.

## Source and generated data

The current normalized source is the reviewable JSON database at `data/song-database.json`. It contains 1,118 master songs and 1,299 mode memberships/placements. `scripts/song_database.mjs` is the deterministic compiler: `compileDatabase()` produces the browser catalogue, and `node scripts/song_database.mjs build` materializes `data/catalogue.json` from the source and mode manifest. The compiler is local/offline and must remain deterministic for an unchanged source revision.

The current v17 runtime counts are 877 Greatest Hits songs, with at least 12 per year, 236 Australian, 40 Unexpected Years, and 73 in each chart mode. Do not restore the obsolete v6/v10 one-mode contract or weaken validators to accommodate it.

Provider IDs are playback facts, not canonical song identity. Reviewed preferred links currently cover three Spotify links and no YouTube links; all other imported links remain candidates until reviewed. The YouTube search fallback depends on a referrer-restricted public API key and quota, so quota failure is an operational limitation and must fail clearly without inventing a track.

## Non-negotiable invariants

1. `song.year` equals the containing card/year bucket and the answer year shown to players.
2. Canonical identity is stable across modes; memberships reference one master song.
3. Alternate recordings, remasters, edits, remixes, live/acoustic versions, and re-recordings collapse where appropriate, while genuine titles containing words such as “Live”, “Radio”, “With”, or “Part” remain valid.
4. Covers by distinct artists remain distinct unless explicitly reviewed otherwise.
5. Ambiguous evidence is reviewed or omitted; it is never assigned a guessed year.
6. Provider IDs and chart years never redefine canonical song/year truth.
7. No-repeat uses canonical identity, not arbitrary provider IDs.
8. Networked ingestion creates reviewable candidates; deployment and compilation do not discover new truth.
9. Never commit credentials, tokens, browser session data, or private keys.

## Engineering direction

Keep `data/song-database.json` and verification ledgers reviewable. SQLite is an optional future query/validation workspace, not a required live backend or sole source of history. A future schema may split songs, recordings, evidence, provider tracks, chart entries, playlists, memberships, and cards, but must preserve the current compiler contract until equivalence is proven.

Future Spotify playlist import must resolve provider tracks to existing canonical songs and add memberships; unresolved tracks go to review. Do not create an independent Spotify song database or infer answer years from album metadata alone.

Networked candidate refreshes should be separate from offline validation. CI validates source, generated catalogue, runtime, and deployment staging. Builders must not rewrite unrelated app code, docs, tests, or schemas as side effects.

## Backlog

- Complete evidence review needed to move Beta/Preview modes toward Ready.
- Improve provider reliability, especially YouTube search quota and embeddability handling.
- Add normalized schema/migrations and optional SQLite validation workspace without making SQLite the only reviewable history.
- Add reviewed Spotify playlist import as playlist membership.
- Keep themed modes as shared memberships over canonical songs; do not duplicate song facts.

Run the narrowest relevant checks first; catalogue/runtime changes require the full `node scripts/check.mjs` suite before release claims.
