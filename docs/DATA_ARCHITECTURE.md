# Data Architecture

## Current architecture

The authoritative reviewable source is `data/song-database.json`, a normalized JSON document containing master songs, mode memberships, release evidence, and provider links. It currently represents 1,118 master records and 1,299 placements across five modes. `data/catalogue.json` is the generated browser artifact, not the preferred editing surface.

The compiler in `scripts/song_database.mjs` loads the source, validates identities and provider-link contracts, and uses `compileDatabase()` to emit the runtime catalogue. Given the same source and manifest, compilation is deterministic and offline. `scripts/catalogue_runtime.mjs` and the browser consume the generated artifact; they do not query external services for catalogue truth.

## Logical model

The JSON source already expresses the following relationships:

- **Master song:** stable internal song ID, title, artist, canonical key, release evidence, and canonical year.
- **Mode membership:** a reference to a master song plus mode/year metadata; chart modes retain chart year and rank.
- **Provider track:** Spotify or YouTube ID and URL, state, audit metadata, and optional preferred ID. Provider identity never becomes song identity.
- **Evidence:** source URLs, MusicBrainz recording IDs, retrieval dates, matched title/artist, release dates, and review decisions.

The current runtime contains 877 Greatest Hits songs (at least 12 per year), 236 Australian, 40 Unexpected Years, and 73 in each chart mode. A correction to a master record should flow to all memberships through one compile.

SQLite is an optional future workspace for relational queries, constraints, and validation. It is not required for the current product and must not become the only reviewable history. Git-friendly JSON remains the source unless a deliberate migration changes that decision.

## Canonical-year and identity rules

For reviewed release evidence, the current data uses MusicBrainz recording earliest `first-release-date` evidence, with title/artist matching and alternate-version filtering. The semantic goal remains the earliest credible release year of the intended canonical song/recording. A future evidence calibration may compare recording and release-group representations, but it must preserve provenance and a rule version rather than silently rewriting years.

Canonical song identity is represented by the stable master ID; `canonicalKey` remains matching/dedupe machinery. MusicBrainz IDs are evidence references. Spotify and YouTube IDs are playback references. Distinct covers remain distinct songs unless explicitly reviewed otherwise. Remasters, edits, remixes, live/acoustic versions, and re-recordings must not create accidental duplicate answers, while genuine titles containing version-like words remain valid.

## Provider policy

Three preferred Spotify links are currently reviewed; no YouTube link has yet been promoted to preferred. Imported provider links remain candidates until a reviewed decision validates recording identity, version, metadata, year evidence, and source relationship. Missing IDs use the existing provider search flow.

The YouTube search path is browser-side and depends on a referrer-restricted public API key plus quota. Quota exhaustion, API restrictions, and network failures are operational provider errors; they must fail clearly and must not alter canonical song/year truth. Spotify Premium/device requirements remain provider availability concerns.

## Future extensions

When schema/migrations are added, keep these conceptual entities separate: songs, recordings, evidence, provider tracks, chart entries, playlists, playlist memberships, and physical cards. The five current modes should remain membership rows over shared masters. A Spotify playlist import should resolve tracks to canonical song IDs and create memberships; unresolved tracks go to review. It must not create a duplicate song database or guess answer years from album metadata.

The generic min/max year selector is a runtime filter over cards and memberships. It does not require a separate 1990+ catalogue. Virtual play deals only eligible years, and physical play rejects an out-of-range card before song selection.

## Validation requirements

- Every membership references an existing master song and supported year.
- Every generated row has `song.year` equal to its containing year bucket.
- Release evidence states remain explicit, including unresolved legacy rows in Beta modes; Ready promotion requires accepted evidence.
- Provider IDs are unique per provider where required and preferred links carry reviewed evidence.
- No-repeat uses stable master identity, not provider IDs.
- Compiler output is semantically identical across repeated builds from unchanged source.
- Networked ingestion is kept outside deployment validation; Pages publishes only reviewed generated data and explicit public assets.
