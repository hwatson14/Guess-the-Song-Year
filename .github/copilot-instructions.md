# Repository instructions

Before making material changes, read:

1. `/AGENTS.md`
2. `/docs/STATUS_AND_ROADMAP.md`
3. `/docs/DATA_ARCHITECTURE.md`

`AGENTS.md` is the authoritative AI-agent contract.

Key points:

- The production game remains Greatest Hits only until the canonical data baseline is coherent.
- There is a known repository mismatch: the checked-in generated `data/catalogue.json` was v6 during the 2026-09-05 review while the current schema/validator/deploy contract expects canonical v10.
- Fix the root mismatch before expanding themed playlists or other catalogue data.
- Preserve `card year == song answer year`.
- Never fabricate release-year evidence.
- Do not treat `data/catalogue.json` as the long-term source-of-truth database; migrate toward the normalized source/SQLite/compiler architecture documented in `docs/DATA_ARCHITECTURE.md`.
- Playlists should reference canonical songs rather than duplicate full song facts.
- Networked ingestion and offline deterministic compilation should be separate concerns.
- Do not extend the pattern where data builders rewrite app/runtime/schema/tests/docs as side effects.
- Preserve physical + virtual play, 1-6 teams, victory targets, Spotify/YouTube playback, Back handling and Resume state unless the requested feature intentionally changes them.
- Agreed backlog includes a generic min/max year-range selector and later existing-Spotify-playlist support. See `AGENTS.md` and the roadmap for acceptance behaviour and sequencing.
