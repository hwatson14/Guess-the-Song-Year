# Data Architecture

## Goal

The product needs one canonical model of song/year truth that can support:

- Greatest Hits
- themed playlists
- arbitrary min/max year ranges
- imported Spotify playlists
- provider-track replacement
- canonical-year corrections
- dedupe/no-repeat logic
- provenance/review

without duplicating song facts into multiple nested playlist/year structures.

The browser can continue consuming a small static JSON file. The normalized model is a **build-time/source-of-truth concern**, not a requirement for a live backend.

---

## Architectural principle

A **song is a fact entity**. A **playlist is a selection of songs**.

Do not model this:

```text
Greatest Hits -> copy of Song A
Rock Classics -> copy of Song A
Sing Along    -> copy of Song A
```

Model this:

```text
                 -> Greatest Hits
Canonical Song A -> Rock Classics
                 -> Sing Along
```

If Song A's canonical answer year or preferred Spotify track changes, that correction should be made once.

---

## Source-of-truth hierarchy

Target hierarchy:

1. **Reviewed normalized source data** committed in Git-friendly text form.
2. **Schema + migrations** defining the logical model.
3. **SQLite workspace** rebuilt from reviewed source for joins, constraints and validation.
4. **Compiled `data/catalogue.json`** generated for the static browser runtime.
5. Runtime filters act as safety nets only.

During migration, `scripts/build_catalogue_v10.py` is the temporary canonical builder, but it should not remain the long-term database.

---

## Proposed logical model

### `songs`

One row per canonical playable song identity.

Suggested columns:

```sql
CREATE TABLE songs (
    song_id TEXT PRIMARY KEY,
    canonical_title TEXT NOT NULL,
    canonical_artist TEXT NOT NULL,
    answer_year INTEGER NOT NULL CHECK(answer_year BETWEEN 1950 AND 2022),
    canonical_key TEXT NOT NULL UNIQUE,
    review_status TEXT NOT NULL DEFAULT 'reviewed',
    recognisability_score REAL,
    notes TEXT,
    created_at TEXT,
    updated_at TEXT
);
```

Notes:

- `song_id` is a stable internal ID. It should survive title formatting/provider changes.
- `canonical_key` remains useful for matching/dedupe, but should no longer be the only primary identity.
- `answer_year` is the game answer year after evidence review.
- Keep artists denormalized initially. A separate artist table is not required yet and would add complexity around aliases/collaborations without immediate value.

### `recordings`

Tracks MusicBrainz recording/release representations and alternate-version classification.

```sql
CREATE TABLE recordings (
    recording_id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(song_id),
    musicbrainz_recording_id TEXT,
    musicbrainz_release_group_id TEXT,
    title TEXT,
    artist_credit TEXT,
    first_release_date TEXT,
    version_type TEXT,
    is_canonical INTEGER NOT NULL DEFAULT 0,
    UNIQUE(musicbrainz_recording_id)
);
```

Typical `version_type` values might include `canonical`, `remaster`, `radio_edit`, `live`, `acoustic`, `remix`, `re_recording`, `unknown`.

Do not infer a version type only from naive word matching when that would reject genuine titles.

### `evidence`

Stores why a fact was accepted.

```sql
CREATE TABLE evidence (
    evidence_id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(song_id),
    fact_type TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    asserted_value TEXT NOT NULL,
    confidence REAL,
    evidence_status TEXT NOT NULL DEFAULT 'accepted',
    retrieved_at TEXT,
    rule_version TEXT,
    notes TEXT
);
```

Examples:

- `fact_type = answer_year`
- `source_type = musicbrainz_recording`
- `asserted_value = 1998`

This allows later review of why the year is what it is.

### `provider_tracks`

Separates canonical song identity from Spotify/YouTube playback identity.

```sql
CREATE TABLE provider_tracks (
    provider_track_id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(song_id),
    recording_id TEXT REFERENCES recordings(recording_id),
    provider TEXT NOT NULL CHECK(provider IN ('spotify','youtube')),
    external_id TEXT NOT NULL,
    is_preferred INTEGER NOT NULL DEFAULT 0,
    availability_status TEXT,
    title TEXT,
    artist TEXT,
    checked_at TEXT,
    UNIQUE(provider, external_id)
);
```

A provider-track replacement should not create a new canonical song.

### `chart_entries`

Popularity/recognisability source data belongs separately from canonical answer-year truth.

```sql
CREATE TABLE chart_entries (
    chart_entry_id TEXT PRIMARY KEY,
    song_id TEXT REFERENCES songs(song_id),
    chart_name TEXT NOT NULL,
    chart_year INTEGER NOT NULL,
    rank INTEGER,
    source_url TEXT,
    source_title TEXT,
    source_artist TEXT
);
```

A chart year can differ from answer year. It must never silently redefine `songs.answer_year`.

### `playlists`

```sql
CREATE TABLE playlists (
    playlist_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    playlist_type TEXT NOT NULL,
    fallback_playlist_id TEXT REFERENCES playlists(playlist_id),
    is_active INTEGER NOT NULL DEFAULT 0
);
```

Possible `playlist_type` values:

- `system`
- `curated`
- `spotify_import`

### `playlist_songs`

Many-to-many membership table.

```sql
CREATE TABLE playlist_songs (
    playlist_id TEXT NOT NULL REFERENCES playlists(playlist_id),
    song_id TEXT NOT NULL REFERENCES songs(song_id),
    weight REAL,
    sort_order INTEGER,
    added_source TEXT,
    PRIMARY KEY (playlist_id, song_id)
);
```

No duplicate full song objects per playlist.

### `cards`

Physical cards can be normalized from the current `YEAR_MAP`.

```sql
CREATE TABLE cards (
    card_id INTEGER PRIMARY KEY,
    year INTEGER NOT NULL CHECK(year BETWEEN 1950 AND 2022)
);
```

This makes range filtering and coverage queries straightforward while preserving compatibility with the physical deck.

---

## Canonical-year semantics

### Current implementation

The v10 builder currently uses the earliest matching MusicBrainz **recording** `first-release-date`.

### Known concern

Earlier themed-playlist work observed cases where recording-level results could represent later re-recordings or compilation-related entries. Experimental work considered release-group evidence.

### Required resolution

Do not collapse this into a simple technical choice such as "always recording" or "always release group" without calibration.

The semantic contract should be:

> `answer_year` is the earliest credible public release year of the intended canonical song/recording represented to the player.

Implementation should be validated against a fixture of difficult examples, including:

- original vs later re-recording
- single vs album release
- remaster metadata
- live/acoustic/remix variants
- cover versions
- same title by different artists
- songs whose chart year is later than original release year
- genuine title words that resemble version metadata

After calibration, encode the chosen evidence precedence in tests and a `rule_version` stored with evidence.

---

## Canonical identity semantics

### Stable internal identity

Use stable `song_id` as the primary key.

### Matching identity

Keep a normalized `canonical_key` for candidate matching and dedupe. Existing logic roughly derives this from a cleaned base title + primary artist.

Important distinction:

- `song_id` = stable database identity
- `canonical_key` = matching/dedupe heuristic key
- MusicBrainz ID = external evidence/reference identity
- Spotify/YouTube ID = playback identity

These must not be conflated.

### Covers

Do not globally collapse same-title covers into one song merely because titles match. The game is playing a specific artist/recording. Covers may have different answer years and should remain distinct canonical songs unless there is an explicit product rule otherwise.

---

## Reviewable source format

Avoid making a binary SQLite file the only reviewable history.

Recommended committed source files:

```text
data/source/songs.jsonl
data/source/recordings.jsonl
data/source/evidence.jsonl
data/source/provider_tracks.jsonl
data/source/chart_entries.jsonl
data/source/playlists.json
data/source/playlist_songs.jsonl
```

Why JSONL:

- line-oriented diffs
- easy streaming
- easy generation/querying
- stable IDs
- simple Codex editing

SQLite can be rebuilt from these files during validation/tooling.

If a later workflow proves that a committed SQLite database is materially simpler, it can be added as a generated artifact, but text source remains preferable for code review and merge conflict handling.

---

## Ingestion vs compilation

### Ingestion

Networked scripts discover/refresh data from external sources.

Example responsibilities:

- query MusicBrainz
- scrape/parse chart source pages
- resolve Spotify/YouTube IDs
- import Spotify playlists
- propose canonical matches
- create unresolved review queues

They should write **candidate/reviewable source changes**, not silently change production truth during deployment.

### Compilation

`compile_catalogue.py` should:

1. load reviewed normalized data locally/offline;
2. validate referential integrity/invariants;
3. select preferred provider tracks;
4. build per-year runtime pools for active playlists;
5. enforce fallback policy without changing card year;
6. emit `data/catalogue.json` deterministically;
7. emit useful summary statistics.

No network calls.

---

## Runtime JSON contract

The current browser shape can be preserved during migration to reduce frontend risk.

A later cleaner runtime shape could be:

```json
{
  "version": 12,
  "songs": {
    "s_001": {
      "title": "Example",
      "artist": "Artist",
      "year": 1998,
      "spotifyId": "..."
    }
  },
  "playlists": {
    "greatest": {
      "1998": ["s_001", "s_002"]
    },
    "rock": {
      "1998": ["s_001"]
    }
  }
}
```

But do not change runtime shape and source architecture in the same step unless tests prove equivalence. A staged migration is safer:

1. normalize source;
2. compile the **existing** v10-compatible runtime shape;
3. prove behavioural equivalence;
4. only then consider optimizing runtime JSON.

---

## Year-range support

The min/max-year feature should be implemented as a query/filter over cards and playlist membership.

Examples:

```sql
SELECT card_id, year
FROM cards
WHERE year BETWEEN :min_year AND :max_year;
```

For virtual mode, only eligible cards are dealt.

For physical mode, a card outside the configured range is rejected with a user-facing message. The system must not pick an in-range song for an out-of-range card.

This feature does **not** require a separate 1990+ catalogue.

---

## Spotify playlist import

Spotify playlists should resolve into canonical song membership:

```text
Spotify playlist track
    -> provider_tracks match
    -> canonical song_id
    -> playlist_songs membership
```

If no reliable match exists:

```text
track -> unresolved review queue
```

Do not guess answer years from Spotify album metadata alone without the canonical evidence process.

Imported playlist names/metadata may be stored in `playlists`, but authentication/tokens must never be committed.

---

## Validation queries/gates

At minimum validate:

### Referential integrity

- every `recordings.song_id` exists
- every `provider_tracks.song_id` exists
- every `playlist_songs.song_id` exists
- every playlist fallback exists

### Canonical truth

- answer year in supported range
- canonical key unique unless a documented exception exists
- accepted answer-year evidence exists for every playable song
- no explicit alternate/version entry is marked canonical without an intentional override

### Runtime/playability

- every required physical card year has enough Greatest Hits supply
- `song.year == containing runtime year bucket`
- no-repeat identity is stable
- preferred playback IDs are not incorrectly shared across unrelated songs
- active playlist fallback never changes card year

### Determinism

Running the compiler twice on unchanged source should produce semantically identical output.

---

## Migration sequence

### Step 1 — Recover v10

Do not migrate from the stale v6 materialization. First produce and validate the intended canonical v10 source material.

### Step 2 — Extract normalized source

Write a migration script that converts canonical v10 objects into:

- songs
- recordings/evidence
- provider tracks
- chart entries
- Greatest Hits membership

Assign stable `song_id`s.

### Step 3 — Rebuild SQLite workspace

Add schema and source loader. Enforce constraints.

### Step 4 — Compile old runtime shape

Generate a v10-compatible `data/catalogue.json` from normalized source.

### Step 5 — Equivalence tests

Compare:

- year coverage
- song counts
- canonical keys
- answer years
- provider IDs
- no-repeat behaviour

### Step 6 — Decompose builders

Split network ingestion from source data migration and compile.

### Step 7 — Migrate themed playlists

Convert existing curated seed lists into `playlists` / `playlist_songs`, reusing canonical song IDs and adding reviewed new canonical songs when necessary.

### Step 8 — Add year range

Implement min/max setup UI + runtime filtering.

### Step 9 — Add Spotify imports

Resolve provider tracks into canonical song memberships.

---

## Anti-patterns to avoid

- Editing `data/catalogue.json` manually as canonical truth.
- Copying full song facts into every playlist.
- Using Spotify track ID as song identity.
- Using chart year as answer year without evidence.
- Treating a MusicBrainz entity ID as proof without title/artist/version validation.
- Network-dependent deployment validation.
- Builders that rewrite frontend/runtime/docs/tests as side effects.
- Weakening validation to make a stale generated artifact pass.
- Maintaining separate 1950+, 1990+, themed or Spotify song databases when they should be filters/memberships over shared canonical songs.
