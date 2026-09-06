# Guess the Song Year — Agent Contract

## Current release contract

This repository is a static Guess the Song Year web product. Preserve the narrow, playable loop while data correctness is completed:

- v17 has five currently playable/selectable modes: Greatest Hits, Australian, Unexpected Years, #1 US, and #1 Australia.
- Greatest Hits, Australian, #1 US, and #1 Australia are Beta; Unexpected Years is Preview.
- Four additional product modes are now explicitly planned: Movie Themes, TV Themes, TV & Movie Themes, and Remix: Original Year. Read `docs/MODE_EXPANSION_SPEC.md` before implementing them.
- Movie Themes answers with the represented movie's release year. TV Themes answers with the represented show's Season 1 / series-premiere year. These are screen-work years, not song release years.
- Real cards and Virtual play support 1–6 teams, First to 10 or Unlimited, Resume, and browser/device Back handling.
- A generic minimum/maximum year range is implemented and persisted. Virtual deals only eligible years; physical scans outside the range are rejected.
- Spotify Premium playback and YouTube fallback remain provider paths. Provider failures must not change the card year.

Read `README.md`, `docs/STATUS_AND_ROADMAP.md`, `docs/DATA_ARCHITECTURE.md`, `docs/MODE_EXPANSION_SPEC.md` when relevant, the relevant runtime/data files, and relevant workflow files before material catalogue or database work. Harry’s latest explicit instruction has highest authority.

## Source and generated data

The current normalized source is the reviewable JSON database at `data/song-database.json`. It contains 1,118 master songs and 1,299 mode memberships/placements. `scripts/song_database.mjs` is the deterministic compiler: `compileDatabase()` produces the browser catalogue, and `node scripts/song_database.mjs build` materializes `data/catalogue.json` from the source and mode manifest. The compiler is local/offline and must remain deterministic for an unchanged source revision.

The current v17 runtime counts are 877 Greatest Hits songs, with at least 12 per year, 236 Australian, 40 Unexpected Years, and 73 in each chart mode. Do not restore the obsolete v6/v10 one-mode contract or weaken validators to accommodate it.

Provider IDs are playback facts, not canonical song identity. Reviewed preferred links currently cover three Spotify links and no YouTube links; all other imported links remain candidates until reviewed. The YouTube search fallback depends on a referrer-restricted public API key and quota, so quota failure is an operational limitation and must fail clearly without inventing a track.

## Non-negotiable invariants

1. Answer-year truth depends on declared mode semantics: release-year modes use master `release.answerYear`; chart modes use chart membership year; planned screen-theme modes use verified screen-work answer year. Generated `song.year`, bucket year, year-range filtering, and the answer shown to players must agree.
2. Canonical song identity is stable across modes; memberships reference one master song. `song_id` is immutable after creation and must not be regenerated when `canonicalKey`, title, or artist metadata changes.
3. Screen-work year is relationship/work truth and must never overwrite the song's canonical `release.answerYear`. Movie Themes use movie release year; TV Themes use Season 1 / series-premiere year.
4. Alternate recordings, remasters, edits, remixes, live/acoustic versions, and re-recordings collapse where appropriate, while genuine titles containing words such as “Live”, “Radio”, “With”, or “Part” remain valid. The planned Remix: Original Year mode is an explicit exception only for reviewed playback variants: the answer and no-repeat identity still belong to the canonical original song.
5. Covers by distinct artists remain distinct unless explicitly reviewed otherwise.
6. Ambiguous evidence is reviewed or omitted; it is never assigned a guessed year.
7. Provider IDs, chart years, and screen-work years never redefine canonical song identity or canonical song release truth.
8. No-repeat uses canonical identity, not arbitrary provider IDs.
9. Networked ingestion creates reviewable candidates; deployment and compilation do not discover new truth.
10. Never commit credentials, tokens, browser session data, or private keys.
11. TV & Movie Themes must be a deterministic union of Movie Themes and TV Themes. Do not curate an independent third copy of the same memberships. Preserve song-to-screen-work relationship identity rather than blindly deduplicating every association by `songId`.
12. If identical audio could imply two different screen-work answer years, treat that as an ambiguity/curation problem rather than making both hidden answers playable.

## Engineering direction

Keep `data/song-database.json` and verification ledgers reviewable. SQLite is an optional future query/validation workspace, not a required live backend or sole source of history. A future schema may split songs, recordings, evidence, provider tracks, chart entries, screen works, playlists, memberships, and cards, but must preserve the current compiler contract until equivalence is proven.

Future Spotify playlist import must resolve provider tracks to existing canonical songs and add memberships; unresolved tracks go to review. Do not create an independent Spotify song database or infer answer years from album metadata alone.

Networked candidate refreshes should be separate from offline validation. CI validates source, generated catalogue, runtime, and deployment staging. Builders must not rewrite unrelated app code, docs, tests, or schemas as side effects.

For the planned theme/remix expansion, prefer declared mode semantics over adding more hard-coded mode-ID lists. Movie Themes and TV Themes should share canonical songs but carry a stable song-to-screen-work relationship with verified `workAnswerYear`; use an explicit new screen year basis. Movie Themes answer with movie release year. TV Themes answer with Season 1 / series-premiere year. TV & Movie Themes should be derived from those two source modes. Remix: Original Year must play an explicitly reviewed remix recording while retaining the canonical original song's `release.answerYear` and `songId` as gameplay truth.

## Backlog

- Complete evidence review needed to move Beta/Preview modes toward Ready.
- Improve provider reliability, especially YouTube search quota and embeddability handling.
- Add normalized schema/migrations and optional SQLite validation workspace without making SQLite the only reviewable history.
- Add reviewed Spotify playlist import as playlist membership.
- Implement the four planned modes in `docs/MODE_EXPANSION_SPEC.md`: Movie Themes, TV Themes, derived TV & Movie Themes, and Remix: Original Year.
- Add stable screen-work records/relationships and an explicit screen-work answer-year basis.
- Generalise compiler/runtime mode support so future declared modes do not require brittle edits to multiple hard-coded ID lists.
- Keep themed modes as shared memberships over canonical songs; do not duplicate song facts.

Run the narrowest relevant checks first; catalogue/runtime changes require the full `node scripts/check.mjs` suite before release claims.
