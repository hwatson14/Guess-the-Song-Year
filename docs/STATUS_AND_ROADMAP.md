# Status and Roadmap

_Last reviewed: 2026-09-05_

## Executive status

The repository contains a working narrow game architecture and substantially improved canonical-song logic, but the committed data/build state is not coherent enough to keep expanding safely.

The key issue is **state drift between generated data and the code/contracts that are supposed to govern it**.

### Current assessment

| Area | Status | Notes |
|---|---|---|
| Core gameplay | Stable narrow scope | Physical + virtual, teams, victory target, Spotify/YouTube, Resume |
| Production music modes | Greatest Hits only | Keep narrow until canonical base is green |
| Canonical song logic | Improved in v10 builder | Good direction: underlying identity, variant rejection, answer-year evidence |
| Generated catalogue | Stale/inconsistent | `data/catalogue.json` was still v6 during this review |
| Schema/validator | Ahead of generated data | Current contract expects canonical v10 |
| Themed playlists | Experimental | v11 builders/seeds exist but should remain deferred |
| DB architecture | Not normalized yet | `catalogue.json` currently carries too many responsibilities |
| CI/release architecture | Needs cleanup | Validation is useful, but networked/build-and-push patterns should be separated |
| Year-range selector | Product requirement, not implemented | Generic min/max selector, especially useful for 1990+ play |
| Spotify playlist import | Product requirement, not implemented | Should map imported tracks to canonical songs |

---

## Verified repository facts from the review

### Runtime/product

`README.md` describes the current narrow product contract:

- Greatest Hits
- real/physical and virtual play
- 1-6 teams
- First to 10 or Unlimited
- Spotify Premium / YouTube fallback
- resume/back handling

### Data mismatch

During the review:

- `data/catalogue.json` reported `version: 6`.
- `data/catalogue.schema.json` described the newer canonical contract and required fields such as canonical identity/evidence.
- `scripts/validate_catalogue.py` explicitly required v10 Greatest Hits.
- `.github/workflows/validate.yml` explicitly asserted `data.version == 10` and Greatest Hits only.
- `.github/workflows/pages.yml` explicitly gated deployment on the v10 one-mode canonical catalogue.

Therefore the checked-in generated catalogue was not aligned with the validation/deployment contract.

### Canonical v10 work

`scripts/build_catalogue_v10.py` contains the strongest current canonical model. Important behaviours include:

- Billboard-derived popularity ordering/candidates.
- MusicBrainz-based answer-year verification.
- underlying-song identity using cleaned title + primary artist.
- alternate version rejection.
- remaster/remix/edit/live/acoustic/re-recording collapse logic.
- target pool depth of at least 12 per year, with physical card count considered.
- provider ID attachment from existing sources when available.
- explicit provenance fields.

This is the correct temporary base for recovery, but not the desired long-term DB shape.

### Experimental v11 work

The repository contains playlist/themed work such as:

- `scripts/build_modes.py`
- `scripts/build_playlists_v11.py`

The intended conceptual direction is good: canonical Greatest Hits truth first, themed playlists layered afterward.

The implementation should not be promoted as-is because it still materializes duplicated full song objects and its builder rewrites multiple unrelated files (runtime/app/schema/validator/tests/README). This is too coupled.

### Branch/PR history

There has been experimental work for verified playlists, including a draft/closed PR and a `feature/verified-playlists-v11` branch.

Do not assume experimental branch state is authoritative merely because it has a larger version number.

---

## Product requirements that must not be lost

### Min/max year selector

The game should support a **generic minimum and maximum year range** so players can select, for example, 1990 onward.

This should be a range selector in setup, not a separate hard-coded 1990s game mode.

Acceptance behaviour:

- full supported range by default;
- min <= max;
- persistent config and Resume state;
- virtual deck only deals cards in range;
- physical card outside range is rejected clearly;
- answer-year invariant remains unchanged;
- tests for narrow/single-year/boundary ranges.

### Existing Spotify playlist support

A future mode should be able to use an existing Spotify playlist.

The correct model is:

```text
Spotify provider track
  -> resolve/match canonical song
  -> playlist membership
```

not:

```text
Spotify playlist
  -> independent duplicate song DB
```

Unresolved tracks require review. Provider metadata alone must not silently redefine canonical answer year.

### Themed playlists

Existing concepts to preserve for later normalized migration:

- Greatest Hits
- Sing Along
- Australian
- Unexpected Years
- Party Anthems
- Rock Classics

They should become playlist rows + song memberships.

---

# Roadmap

## Phase A — Restore a coherent production baseline

**Priority: critical**

### A1. Rebuild intended canonical v10

Use `scripts/build_catalogue_v10.py` as the reference implementation and materialize a catalogue that actually satisfies the current schema/validator/runtime contract.

Do not migrate normalized source from the stale v6 JSON.

### A2. Run the full relevant validation set

At minimum:

```bash
node --check engine.js
node --check engine-v7.js
node --check app.js
node scripts/test_engine_v7.mjs
python scripts/audit_catalogue_variants.py
python scripts/validate_catalogue.py
python -m json.tool data/catalogue.schema.json >/dev/null
```

Also exercise the Pages workflow contract locally where practical.

### A3. Fix root cause, not validator symptoms

If v10 generation fails because the networked build is fragile, fix the builder or capture evidence/reviewed output. Do not reduce pool depth, remove evidence requirements, or bypass duplicate/version checks merely to turn CI green.

### A4. Establish one explicit current version

After recovery, builder + schema + generated catalogue + runtime + tests + deploy workflow must all agree.

---

## Phase B — Normalize canonical data

**Priority: high**

Use `docs/DATA_ARCHITECTURE.md`.

### B1. Add DB schema

Create:

```text
db/schema.sql
db/migrations/
```

with normalized entities for songs, recordings, evidence, provider tracks, chart entries, playlists, playlist membership and cards.

### B2. Add Git-friendly normalized source

Target:

```text
data/source/songs.jsonl
data/source/recordings.jsonl
data/source/evidence.jsonl
data/source/provider_tracks.jsonl
data/source/chart_entries.jsonl
data/source/playlists.json
data/source/playlist_songs.jsonl
```

### B3. Migrate canonical v10

Write a one-time/re-runnable migration from canonical v10 into normalized source.

Assign stable `song_id` values.

### B4. Build SQLite workspace

Load normalized source into SQLite and validate relational constraints.

SQLite is a logical/query/validation workspace. Keep Git-reviewable text as authoritative history unless a later decision explicitly changes that.

### B5. Compile existing runtime shape

Add an offline deterministic compiler that regenerates the current runtime catalogue shape from normalized source.

Do not change the frontend data contract in the same step unless necessary.

### B6. Prove equivalence

Compare old canonical v10 output and normalized compiler output for:

- supported years;
- per-year song counts;
- canonical keys;
- answer years;
- provider IDs;
- no-repeat behaviour;
- physical card coverage.

---

## Phase C — Resolve canonical-year evidence semantics

**Priority: high**

The current v10 rule is MusicBrainz recording earliest first-release-date, but earlier experiments identified cases where entity selection can be misleading.

### C1. Create calibration fixture

Use a small set of known difficult songs spanning:

- re-recordings;
- remasters;
- single vs album release;
- covers;
- chart-year lag;
- alternate artist credits;
- genuine titles containing version-like words.

### C2. Compare evidence strategies

Evaluate recording vs release-group evidence and any precedence/fallback rules.

### C3. Lock semantic rule

Store evidence and a `rule_version` so future corrections are auditable.

The answer is not "whatever MusicBrainz says first". It is the earliest credible public release year of the intended canonical recording/song represented to the player.

---

## Phase D — Clean build/CI architecture

**Priority: medium-high**

### D1. Separate responsibilities

Target script classes:

- `ingest_*`: networked candidate/evidence refresh
- migration/load tools: normalized source maintenance
- `compile_catalogue.py`: offline deterministic runtime generation
- `validate_*`: no network
- deploy: no catalogue authoring

### D2. Decompose v11 builder pattern

Do not extend the current pattern where one builder rewrites:

- catalogue
- schema
- runtime JS
- app JS
- tests
- README

Each concern should have an explicit source file and test.

### D3. Stop production workflows authoring truth

Prefer reviewable PR/artifact generation for networked refreshes.

Deployment should validate and deploy an already-reviewed revision, not discover new song truth and push it to `main`.

### D4. Protect `main`

When repository permissions/settings allow, require relevant validation before merge.

---

## Phase E — Add min/max year selector

**Priority: high after canonical migration**

### E1. Configuration

Extend config with:

```js
minYear
maxYear
```

Default to the supported data/card range.

### E2. Setup UI

Use a compact two-ended range selector/bar with readable current values.

Requirements:

- easy 1990+ selection;
- min cannot exceed max;
- sensible keyboard/touch usability;
- preserve existing simple setup UX.

### E3. Virtual play

Filter eligible virtual cards before dealing.

Do not deal out-of-range cards then retry after song selection.

### E4. Physical play

If scanned card year is outside range:

- do not select a song;
- show a clear out-of-range message;
- request another card/scan.

### E5. Persist/resume

Range belongs to match/config state so Resume reproduces the same rules.

### E6. Tests

Test:

- full range;
- 1990-2022;
- one-year range;
- minimum boundary;
- maximum boundary;
- physical out-of-range scan;
- resume.

---

## Phase F — Migrate themed playlists

**Priority: medium**

### F1. Create playlist records

Seed the existing themes into normalized `playlists`.

### F2. Resolve memberships

For each curated seed:

- reuse existing canonical song if matched;
- otherwise ingest/review a new canonical song;
- add `playlist_songs` membership;
- do not copy full song facts into the playlist.

### F3. Fallback semantics

If a theme lacks an eligible song for the exact card year, optional fallback may use Greatest Hits for that **same year only**.

### F4. Activate only after coverage/UX tests

Do not enable themes merely because seed resolution succeeds.

---

## Phase G — Spotify playlist import

**Priority: later**

### G1. Import provider track list

Use authenticated runtime/tooling access without committing tokens.

### G2. Resolve to canonical songs

Match provider track to `provider_tracks` / song evidence.

### G3. Review unresolved entries

Do not guess years.

### G4. Store playlist membership

Imported Spotify playlist becomes a `playlists` row + `playlist_songs` rows.

### G5. Year-range compatibility

The same generic min/max filter should work automatically.

---

# Definition of green

A repository state is considered **green** only when:

- generated catalogue matches the documented/schema version;
- validator passes without exceptions or weakening;
- JS/runtime tests pass;
- Pages deployment checks agree with local validation;
- source-of-truth vs generated artifacts are documented;
- no known stale generated file is masquerading as canonical truth.

# Definition of database migration complete

The DB migration is complete when:

- one canonical song fact exists once;
- playlist membership references songs;
- provider IDs are separate from canonical identity;
- answer-year evidence/provenance can be queried;
- runtime catalogue is compiled from normalized source;
- compiler is deterministic/offline;
- a canonical correction flows to every playlist automatically;
- current gameplay behaviour and physical-card coverage remain intact.
