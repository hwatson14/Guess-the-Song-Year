# Repository instructions

Read /AGENTS.md, /docs/STATUS_AND_ROADMAP.md, /docs/DATA_ARCHITECTURE.md and /PRODUCTION_CONTRACT.md before material changes. Harry's latest instruction has highest authority.

- The current product has five explicitly labelled Beta/Preview modes, physical and virtual play, 1–6 teams, victory targets, year-range filtering, Spotify/YouTube, Back and Resume.
- data/song-database.json is authoritative normalized source; scripts/song_database.mjs compiles data/catalogue.json offline. Do not restore obsolete v6/v10 build assumptions.
- Preserve card year == displayed answer year == runtime song bucket. Chart modes use chart-year membership without redefining the master's release year.
- Provider IDs are separate playback references. Imported candidates do not become preferred without reviewed recording evidence.
- Never fabricate evidence or commit tokens/session credentials. Networked ingestion is separate from compilation and deployment.
- Playlists reference canonical songs. Future Spotify imports must add memberships to this shared source.
- Run node scripts/check.mjs before release. See docs/RELEASE_AUDIT.md for tested scope and remaining limitations.
