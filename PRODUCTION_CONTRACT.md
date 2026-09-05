# Production contract

This file is the integration contract for the playable app. Candidate generators and research artifacts do not become production inputs until they satisfy this contract and are reviewed in the master integration stream.

## Runtime

- Five declared modes: `greatest`, `australian`, `unexpected`, `number1_us`, and `number1_au`.
- `data/modes.json` is the authority for whether each mode is Ready, Beta, Preview, or Building; the setup screen must disclose that status and current year coverage.
- Physical and virtual play use the same card-year and song-year rules.
- A card year never falls back to a different year or mode.
- Each match snapshots its 1950–2022 year range and configuration. Unsupported or out-of-range physical scans preserve the turn and restart scanning.
- Unique-song modes refill eligible card IDs while unused songs remain, then end a depleted range with scores preserved. Fixed chart modes may repeat on deck rollover.
- Superseded playback requests must never pause, destroy or change a newer player.
- Provider-wide failures stop on a recoverable error screen. They must not silently deal or scan additional cards.
- A failed playback candidate may be replaced only by a different unused song from the same year.

## Timeline and bonus rules

- Both teams' collected timelines are the primary gameplay view, in fixed left/right columns, with years ascending from top to bottom and internal scrolling for larger games.
- Each team owns a persisted non-negative bonus balance, separate from card score.
- The optional Reveal award is exactly one point for both correct title and artist, once per completed placement, whether the placement was right or wrong.
- A voluntary skip costs one point and keeps the same team/turn. Provider recovery is not charged.
- Five points buy a separate unused card within the chosen mode/range: add its year and one card score without advancing the turn or altering the current hidden card.
- Failed or superseded purchases must not charge points. A bonus card cannot reuse the current song or an already-used song.
- All point, card, history and placement changes persist together; repeated clicks or Resume cannot duplicate an award.
- Physical placement is marked once, then stays on Reveal for the optional bonus before Next Team.

## Physical cards

- Valid card IDs are the integers 1–308.
- QR URLs are accepted only for the verified UK Original (`uk/aaaa0005`) and Australian Original (`au/aaah0001`) deck identities on `https://hitstergame.com`.
- `YEAR_MAP[id]` is accepted only after comparison with an independent physical or documentary source.
- Unverified card-year values remain explicitly unresolved; the current array is not evidence for itself.
- Physical Reveal can save a card-number year correction in this browser for future scans. Entering the built-in year removes that override.
- A local correction is a playability aid, not verification evidence, and is not promoted automatically into `YEAR_MAP` or the verification ledger. It assumes one physical deck edition per browser.

## Shared song database

- `data/song-database.json` is the authoritative editable source. Each stable song ID owns its recording identity, release evidence and Spotify/YouTube assets.
- Memberships reference that song ID and carry the mode, applicable year and provenance. Chart-year memberships never redefine a recording's first release year.
- `data/catalogue.json` is a generated runtime view for the existing app. Run `node scripts/song_database.mjs build` after source edits; CI rejects divergence.
- Imported playback IDs remain unverified. Provider links carry explicit evidence states; missing URLs are not replaced with invented IDs.
- Legacy display aliases and provider selections are retained as references for audit and saved-game compatibility.

## Song catalogue

The checked-in catalogue may contain every mode declared in `data/modes.json`. A mode's declared status controls the validation gate:

- **Ready** — complete and fully gated for coverage, pool depth, canonical identity, release/chart-year evidence, provenance, and duplicate safety.
- **Beta** — playable with its disclosed gaps or canonical-data debt.
- **Preview** — deliberately incomplete or sparse, with its coverage disclosed before play.
- **Building** — present for catalogue work but not selectable in the app.

Virtual play filters its card deck to years supported by the selected mode. Physical play reports an unsupported scanned year and never borrows a song from another mode or year.

- A mode promoted to Ready covers every year 1950–2022.
- Greatest Hits has at least 12 distinct underlying songs per year and at least as many usable songs as physical cards for that year; fixed chart modes have exactly one evidenced year-end leader per year.
- `song.year` equals its containing bucket. It is the canonical recording's earliest release year for release-year modes, and the applicable chart year for the two #1 modes.
- Remasters, edits, live versions, remixes, alternate billings, duplicate playback IDs, and repeated underlying songs do not count as additional songs.
- Every record in a Ready mode carries canonical identity, the applicable release/chart-year evidence, and provenance. Playback IDs are independently checked and may be blank when unverified.

The checked-in catalogue is playable because its modes are honestly labelled Beta or Preview. The separate catalogue stream can promote an individual mode only after it meets the Ready gates; no status label is inferred from catalogue version alone.

## Integration gates

1. JavaScript syntax and policy tests pass.
2. The complete catalogue validator and variant audit pass.
3. The 308-card verification ledger is reported during deployment but is non-blocking for this private app; corrections remain local until independently evidenced and deliberately promoted.
4. Phone-viewport browser smoke tests pass for setup, provider failure, resume, Back, placement, reveal, and game over with zero page-scroll overflow at 375x667, 390x844, and 430x932.
5. Accessibility checks cover focus, dialog behavior, reduced motion, names, and state announcements.

Only the master integration stream updates production runtime files, the authoritative `YEAR_MAP`, or the shared song database and its generated catalogue.
