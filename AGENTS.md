# Guess the Song Year — Agent Contract

## Purpose

This repository is the standalone Guess the Song Year playable web product. Keep changes inside this product boundary.

This file is the authoritative handoff for Codex/AI agents. Read it before material catalogue/database work, then read:

1. `README.md`
2. `docs/STATUS_AND_ROADMAP.md`
3. `docs/DATA_ARCHITECTURE.md`
4. the exact runtime/data files relevant to the requested change
5. relevant validation/deployment workflow files when behaviour or catalogue data changes

Harry's latest explicit instruction is highest authority.

---

## Current product boundary

The stable core loop remains intentionally narrow while correctness is established:

- One active production music mode: **Greatest Hits**.
- Two play styles: **Real cards** and **Virtual**.
- 1–6 teams.
- First to 10 cards or Unlimited.
- Spotify Premium playback or YouTube fallback.
- Browser/device Back is handled as in-app navigation.
- Match phase/current card/reveal state are persisted so Resume restores the active turn.

Do not accidentally regress these behaviours while changing the data architecture.

---

## Known repository inconsistency: fix before expanding data/features

At the time this handoff was written, the committed repository was internally inconsistent:

- `data/catalogue.json` was still an old **v6** generated catalogue.
- `data/catalogue.schema.json`, `scripts/validate_catalogue.py`, `.github/workflows/validate.yml`, and `.github/workflows/pages.yml` expect the canonical **v10** one-mode catalogue.
- `scripts/build_catalogue_v10.py` contains the newer canonical-building logic.
- `.github/workflows/no-repeat-results-hotfix.yml` is intended to rebuild v10 and commit it, but the expected generated result had not landed in `main`.
- Experimental v11 playlist builders exist, but production must not advance to v11 until the canonical base is coherent and green.

Therefore **do not trust the current `data/catalogue.json` merely because it is on `main`**.

### Immediate recovery gate

Before feature/data expansion:

1. Reproduce the v10 canonical build locally or in a controlled workflow.
2. Make builder, generated catalogue, schema, validator, runtime, and Pages workflow agree on one contract/version.
3. Run all JS/runtime/catalogue validation.
4. Establish a green known-good baseline.
5. Only then begin the normalized-data migration in `docs/DATA_ARCHITECTURE.md`.

Do not paper over the inconsistency by weakening validators.

---

## Core invariants

These are non-negotiable unless Harry explicitly changes them:

1. **Card year == answer year.**
2. A song played for a card must have `song.year == card year`.
3. Alternate recordings/versions must not create extra answers for the same underlying song.
4. Remasters, edits, remixes, radio edits, live/acoustic versions, re-recordings and similar variants collapse to the same underlying-song identity where appropriate.
5. Genuine song titles containing words such as `Live`, `Radio`, `With`, `Part`, etc. must not be rejected merely because those words can also appear in version metadata.
6. Covers by genuinely different artists are not automatically the same recording identity.
7. Ambiguous evidence is omitted/reviewed rather than assigned a guessed year.
8. Playlist membership must never redefine canonical song/year truth.
9. Runtime fallback, when supported, may change **playlist selection**, but must never change the card year.
10. No-repeat logic operates on canonical underlying-song identity, not arbitrary provider-track IDs.

Existing regression examples include genuine titles such as:

- `Live and Let Die`
- `I Want to Live`
- `Another Brick in the Wall (Part II)`
- `Radio Ga Ga`
- `Dancing with a Stranger`
- `With or Without You`
- `Break Up with Your Girlfriend, I'm Bored`

Protect these semantics.

---

## Canonical-year evidence issue

The present v10 implementation treats the canonical answer year as **MusicBrainz recording earliest `first-release-date`** after title/artist matching.

However, earlier playlist work found cases where recording-level matching could select later re-recording/compilation representations, and an experimental PR discussed release-group evidence for themed material.

This is an unresolved modelling issue, not permission to silently switch semantics.

Before standardising the new DB:

1. Build a calibration fixture of known difficult songs.
2. Compare recording-level and release-group-level outcomes.
3. Define the semantic rule in `docs/DATA_ARCHITECTURE.md` and tests.
4. Store evidence/provenance used for each canonical year.
5. Never overwrite a reviewed answer year without a traceable evidence change.

The semantic goal is **the earliest credible release year of the intended canonical song/recording**, not whichever MusicBrainz entity happens to return first.

---

## Target data architecture

Do not continue treating `data/catalogue.json` as both database and runtime payload.

Desired architecture:

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
data/catalogue.json   <-- generated browser artifact
        |
        v
GitHub Pages runtime
```

`data/catalogue.json` should become a **compiled artifact**, not the canonical editable data store.

The normalized model should separate at least:

- songs
- recordings
- evidence/provenance
- provider tracks (Spotify/YouTube)
- chart entries/popularity evidence
- playlists
- playlist membership
- physical cards/year map

Prefer committed, reviewable normalized source files plus schema/migrations, with SQLite rebuilt during tooling/tests, rather than relying on an opaque binary DB as the only history.

A good target layout is:

```text
db/
  schema.sql
  migrations/
data/
  source/
    songs.jsonl
    recordings.jsonl
    evidence.jsonl
    provider_tracks.jsonl
    chart_entries.jsonl
    playlists.json
    playlist_songs.jsonl
  catalogue.json          # generated runtime artifact
scripts/
  ingest_*.py             # networked candidate/evidence refresh
  compile_catalogue.py    # offline deterministic compile
  validate_*.py
```

Exact filenames may evolve, but preserve the separation between source facts, network enrichment, compilation, and runtime.

See `docs/DATA_ARCHITECTURE.md` for the proposed schema and migration path.

---

## Builder and CI rules

### Networked ingestion

MusicBrainz, Wikipedia/Billboard-derived data, BiMMuDa and provider lookups are **ingestion/evidence sources**, not runtime dependencies.

Networked tools may discover/refresh candidate data, but they should:

- record source and provenance fields;
- produce reviewable source changes or artifacts;
- avoid silently changing production truth during deployment;
- be safe to rerun without duplicating records.

### Deterministic compilation

The compiler from reviewed normalized data to `data/catalogue.json` should be offline and deterministic.

Given the same source revision, it must produce the same semantic catalogue.

### Separation of concerns

A data builder must **not** rewrite unrelated application code, README content, runtime JS, tests and schema as side effects.

This is a known problem in `scripts/build_playlists_v11.py`, which currently owns too many concerns. Decompose that pattern rather than extending it.

### CI behaviour

Prefer:

- CI validates source + generated artifact + runtime.
- Networked refresh workflows create reviewable candidate changes/PRs or artifacts.
- CI does not depend on mutable external APIs to prove that an already-reviewed catalogue is valid.
- Production deployment does not author new catalogue truth.

Avoid workflows whose normal success path mutates and pushes directly to `main`.

---

## Product backlog already agreed

### 1. User-selectable year range

Harry wants the game playable with a **minimum and maximum year selector**, specifically so players can easily choose something such as `1990-present`, but the control should be generic rather than hard-coded to the 1990s.

Target behaviour:

- Compact two-ended selector/range bar in setup.
- Default full available range.
- Enforce min <= max.
- Persist selected range in config and match/resume state.
- Virtual mode deals only eligible cards/years.
- Physical-card mode must not silently accept an out-of-range card; show a clear message and request another card/scan.
- Song selection still obeys `song.year == card year`.
- Range selection filters eligible cards/years, not answer years after selection.
- Test narrow ranges, one-year ranges, boundaries and Resume.

Do this after the canonical-data contract is coherent. The normalized model should make this a cheap filter, not another catalogue.

### 2. Existing Spotify playlist support

Harry has also asked whether the game can use an existing Spotify playlist.

Architect this as **playlist membership over canonical songs**, not a second song database.

Desired direction:

- Import/resolve Spotify playlist tracks into canonical song records.
- Store provider track identity separately from canonical song identity.
- Verify/match answer year before a track becomes playable.
- Unresolved/ambiguous tracks go to review rather than receiving guessed years.
- Imported playlists can be filtered by selected year range.
- The game remains usable if a provider track changes while canonical song/year truth remains stable.

This follows the normalized DB migration unless a small prototype is required to validate the model.

### 3. Themed playlists

Experimental work exists for:

- Greatest Hits
- Sing Along
- Australian
- Unexpected Years
- Party Anthems
- Rock Classics

These should ultimately be rows in `playlists` + `playlist_songs`, not duplicated full song objects in each year bucket.

Do not merge/activate them merely because builders exist. First stabilize canonical truth and the normalized model.

---

## Recommended execution sequence

### Phase A — Recover current production contract

1. Rebuild materialized canonical v10.
2. Fix builder/validator/runtime mismatch without weakening invariants.
3. Confirm all 308 physical cards remain covered.
4. Run JS tests, catalogue validation and Pages checks.
5. Establish a green known-good baseline.

### Phase B — Normalize the data model

1. Add schema/migrations.
2. Migrate canonical v10 songs/evidence into normalized source data.
3. Add stable internal `song_id` values; retain `canonicalKey` as matching/dedupe machinery, not the only identity.
4. Split provider IDs, chart entries and evidence from song rows.
5. Implement offline deterministic compile back to the current runtime JSON contract.
6. Prove compiled gameplay is behaviourally equivalent before changing the frontend data API.

### Phase C — Clean build/release architecture

1. Split ingestion, review, compile, validation and deployment.
2. Stop builders rewriting app code.
3. Remove obsolete v6/v8/v10 wrappers only after equivalence tests and migration are complete.
4. Protect `main` with required validation checks when repository permissions/settings allow.

### Phase D — Product expansion

1. Add min/max year-range UI and filtering.
2. Migrate/activate themed playlists using normalized memberships.
3. Add Spotify playlist import/resolution.
4. Improve catalogue recognisability/scoring and provider availability without weakening canonical-year correctness.

---

## Definition of done for the data migration

The migration is not complete merely because a SQLite file exists.

It is complete when:

- Canonical song/year truth has one authoritative normalized representation.
- Playlist membership references canonical `song_id` values.
- Provider IDs are not used as canonical song identity.
- Evidence/provenance is queryable.
- Runtime JSON is generated from normalized source.
- Rebuilding runtime output is deterministic/offline.
- Existing game behaviour and 308-card coverage pass regression tests.
- A song correction is made once and flows automatically to every playlist using it.
- No builder mutates unrelated app/runtime/docs as an accidental side effect.

---

## Engineering rules

- Preserve the narrow playable scope unless Harry explicitly widens it.
- Do not silently broaden catalogue modes or add speculative product layers.
- Keep catalogue changes compatible with the active schema/validator contract.
- Treat runtime filtering as a safety net, not a substitute for source curation.
- Behaviour changes must preserve browser/device Back handling, Resume state, and deployment validation unless the task explicitly changes those contracts.
- Never commit credentials or tokens.
- Inspect current files/tests before editing; old versioned builders may be stale experiments.
- Do not infer that a larger version number automatically means authoritative code.
- Add regression tests for every canonicalisation bug fixed.
- Never fabricate release-year evidence.
- Keep changes reviewable and logically scoped.
- If current repository state conflicts with this handoff, investigate the newer commits/tests and update this document as part of the change.

## Validation

Run the narrowest relevant checks first. When catalogue/runtime behaviour changes, include catalogue validation and relevant JavaScript/browser/deployment checks before claiming completion.

Leave the repository so the next agent can identify source-of-truth, generated artifacts, blockers and next tasks without chat history.
