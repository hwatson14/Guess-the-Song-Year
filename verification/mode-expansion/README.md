# Mode Expansion Seed Catalogue

_Compiled: 2026-09-06_

## Purpose

This directory is the reviewable curation seed for the planned Movie Themes, TV Themes, TV & Movie Themes, and Remix: Original Year modes.

**These rows are candidates, not production truth.** They are intentionally staged under `verification/` until each playable item has the evidence and provider-recording review required by `docs/MODE_EXPANSION_SPEC.md`.

## Current seed

| Source mode | Candidate rows | Answer-year coverage | Core | Expansion | Answer-year rule |
|---|---:|---:|---:|---:|---|
| Movie Themes | 142 | 73/73 years (1950-2022) | 107 | 35 | represented movie release year |
| TV Themes | 158 | 68/73 years | 117 | 41 | Season 1 / canonical series-premiere year |
| Remix: Original Year | 39 | 25 original-song years | 32 | 7 | canonical original song release year |
| TV & Movie Themes | derived only | derived | derived | derived | inherits source relationship |

`screen_themes` has **no independently curated CSV**. The compiler must derive it from the Movie and TV relationship rows. At this seed stage that means 300 source relationships before any cross-context ambiguity handling; production derivation must preserve distinct work relationships rather than blindly deduplicating by song ID.

The five uncovered TV years are 1950, 1952, 1953, 1954 and 1956. They are deliberately left empty rather than filled with weak/obscure candidates merely to hit 73/73.

## Files

- `movie-themes-seed.csv` — movie/work year + proposed theme/soundtrack recording.
- `tv-themes-seed.csv` — series-premiere year + proposed opening/signature theme.
- `remix-original-year-seed.csv` — canonical original-song answer + proposed remix playback version.
- No `screen-themes` source file by design.

## Curation rules applied

1. **Answer-year semantics are explicit.** Theme modes use `year_basis=screen`; remix mode keeps the original song's canonical release year.
2. **Recognisability beats completeness.** `recognisability_0_10` is a curation score, not an evidence-confidence score.
3. `priority=core` is currently assigned to recognisability scores 9-10; `expansion` is 7-8.
4. Licensed older songs strongly associated with a film are valid movie-theme candidates. Their song release year is irrelevant to the answer.
5. TV candidates can use an opening theme or a strongly identifying title/signature cue, but unusual later-season or regional-theme cases must be reviewed for fairness.
6. Remix candidates must be true reviewed remix/rework relationships. Covers, interpolations, mashups and soundalikes do not qualify automatically.
7. Every row remains `review_state=seed_candidate` until:
   - work/original answer year has cited evidence,
   - canonical song identity is resolved,
   - the exact Spotify/YouTube playback recording is reviewed,
   - version-specific ambiguity is resolved,
   - the row passes runtime/catalogue validation.

## Initial research references

These references were used to seed and spot-check the curation pass. They are **not** a substitute for row-level evidence.

### Film themes
- FilmMusic.com, *100 Greatest Movie Themes*: https://filmmusic.com/album/100-greatest-movie-themes/

### TV themes
- TVLine 1970s: https://www.tvline.com/lists/top-tv-theme-songs-all-time-1970s/
- TVLine 1980s: https://www.tvline.com/lists/top-tv-theme-songs-all-time-1980s/
- TVLine 2010-2020: https://www.tvline.com/lists/top-tv-theme-songs-all-time-2010-2020/
- Round the Twist FAQ: https://roundthetwist.com/faqs/faq.htm
- NFSA, *Neighbours by Barry Crocker*: https://www.nfsa.gov.au/collection/item/neighbours-barry-crocker
- NFSA, *Home and Away pilot episode*: https://www.nfsa.gov.au/collection/item/home-and-away-pilot-episode
- Bluey official music/Q&A: https://www.bluey.tv/blog/qa-with-joff/
- ABC Bluey launch context: https://www.abc.net.au/news/2018-10-07/brisbane-bluey-opens-doors-for-animation-in-queensland/10332858

### Remix spot checks
- Spotify surfaced reviewed-title candidates including `Brimful of Asha - Norman Cook Remix Single Version` and `A Little Less Conversation - JXL Radio Edit Remix`.
- Everything But The Girl `Missing` / Todd Terry remix release history was spot-checked.
- `Prayer in C` / Robin Schulz, `Summertime Sadness` / Cedric Gervais and `I Took a Pill in Ibiza` / Seeb were spot-checked for original/remix relationships.
- SAINt JHN's official provider release confirms `Roses (Imanbek Remix)` as a remix recording.

## Integration order

1. Review `core` rows first.
2. Resolve each candidate to a stable screen-work relationship or canonical original song.
3. Add row-level answer-year evidence.
4. Resolve provider assets and exact played recordings.
5. Promote reviewed rows into normalized source memberships.
6. Derive `screen_themes`.
7. Run `node scripts/check.mjs` before exposing a mode.

Do not bulk-promote this seed directly into `data/song-database.json`.
