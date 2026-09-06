# Mode Expansion Spec

_Added: 2026-09-06 from Harry's explicit product direction._

## Product requirement

Add four selectable game modes:

1. **Movie Themes**
2. **TV Themes**
3. **TV & Movie Themes** — a combined view of Movie Themes + TV Themes, not a separately curated duplicate catalogue
4. **Remix: Original Year** — play a remix, but the player guesses the release year of the original song

These are two new mode families: **screen themes** and **remix/original-year**.

## Global invariants

- Keep the existing min/max year selector and all normal game flow behaviour.
- Never silently fall back to another mode or year.
- Canonical song identity stays shared across modes.
- New themed modes are relationships/memberships over canonical songs, not copied master records.
- The combined TV & Movie mode must be derived from the two source theme modes, not curated independently.
- Provider failures must never redefine the answer year.
- Physical-card mode and Virtual mode must use the same answer-year semantics.
- Do not expose a mode as playable until it has at least one valid pool; initial lifecycle status may be `building` or `preview`.

## Screen-theme year rule

Harry explicitly chose **screen-work release year**, not song release year.

- **Movie Themes:** the answer is the release year of the movie the theme represents.
- **TV Themes:** the answer is the premiere year of the TV show, meaning **Season 1 / series premiere year**.
- **TV & Movie Themes:** inherits the appropriate movie or TV rule from each source membership.
- The song's own `release.answerYear` remains canonical music metadata and must not be overwritten by the screen-work year.
- The card/year bucket, generated runtime `song.year`, reveal answer, and year-range filtering for these modes must all use the screen-work answer year.

This requires an explicit new mode year basis rather than overloading the existing `release` basis. Recommended manifest value: `yearBasis: "screen"`.

## Screen-work model

Store a first-class or otherwise stable screen-work relationship so answer-year truth is reviewable independently from song truth.

Recommended fields:

- `screenWorkId` — immutable/stable work identifier
- `workType: "movie" | "tv"`
- `workTitle`
- `workAnswerYear`
  - movie: verified movie release year
  - TV: verified Season 1 / series premiere year
- optional `themeRole`, such as `main-theme`, `title-theme`, `signature-theme`, `soundtrack-signature`
- evidence/provenance for the work title and answer year

The playable theme identity is a **song-to-screen-work relationship**, not merely a song tagged with a mode.

If the same canonical song is associated with more than one screen work, do not create ambiguous gameplay where identical audio could imply different answer years. Prefer one primary association, or a distinct reviewed recording/context that makes the intended work unambiguous.

## 1. Movie Themes

Proposed mode ID: `movie_themes`.

Purpose: play recognisable movie themes, soundtrack themes, title themes, or strongly movie-associated theme recordings.

### Answer-year rule

The answer year is `workAnswerYear` for the represented **movie**, not the song's `release.answerYear`.

Example:

```text
canonical song / recording -> remains music truth
movie relationship -> Movie X, release year 1999
movie_themes membership -> answer year 1999
```

The song may have been released in a different year. That difference is intentional and must not alter canonical music metadata.

## 2. TV Themes

Proposed mode ID: `tv_themes`.

Purpose: play recognisable television themes/title themes.

### Answer-year rule

The answer year is the **Season 1 / series-premiere year** of the represented TV show.

This remains true even if:

- the theme recording itself was released earlier or later; or
- the exact theme arrangement was introduced in a later season.

If a later-season theme would make the intended series association unclear, omit or separately review it rather than changing the show's answer year.

Do not create duplicate canonical songs just because the same recording appears across multiple series, films, or other modes.

## 3. TV & Movie Themes

Proposed mode ID: `screen_themes`.

This mode is exactly the union of `movie_themes` and `tv_themes`.

### Required implementation rule

Do **not** manually curate a third set of source memberships. Derive it deterministically from the two source modes during compilation/runtime generation.

- union source mode memberships
- preserve each membership's `screenWorkId`, `workType`, `workTitle`, and `workAnswerYear`
- deduplicate duplicate **song-to-work relationships**, preferably by stable membership/work identity rather than blindly by `songId`
- preserve source context so Reveal identifies the movie or TV show
- if the same song legitimately represents two different works, treat that as an ambiguity/curation case rather than silently collapsing or assigning two hidden answer years to indistinguishable audio

This prevents divergence between the combined mode and its two components while preserving correct screen-work year semantics.

## 4. Remix: Original Year

Proposed mode ID: `remix_original_year`.

Purpose: the player hears a later remix/rework/edit of a known song but must guess **the year the original song was released**.

### Answer-year rule

The answer year is always the canonical original song's `release.answerYear`.

Example logical model:

- canonical original song: one immutable `songId`
- original release answer year: canonical `release.answerYear`
- played asset: an explicitly reviewed remix recording related to that canonical original
- reveal: original title/artist + original answer year; optionally show remix title/remixer/version after reveal

### Playback rules

This mode must not rely on generic provider search to discover a remix at play time.

Each playable remix needs a reviewed relationship to the canonical original, with explicit Spotify/YouTube playback identifiers where available. A later remix is intentionally an alternate recording here, so normal anti-remix filtering must not discard it inside this mode.

Recommended model extension:

```text
song (canonical original)
  -> recording/provider asset: canonical/original
  -> recording/provider asset: remix
       relationship: remix-of canonical original
       version/remixer metadata

membership remix_original_year
  -> canonical songId
  -> explicit reviewed remix playback reference
  -> answerYear = canonical original release.answerYear
```

The remix membership's explicit playback reference must override the normal preferred canonical recording for this mode only. Normal modes continue to reject accidental remix/live/edit alternatives.

### Identity / no-repeat

No-repeat remains keyed to the canonical original `songId`, not the remix provider ID. Multiple remixes of one original must not masquerade as unrelated answer songs unless a future mode explicitly allows that behaviour.

## Data and compiler direction

The current compiler hard-codes release-mode IDs and supported mode IDs. Expansion should replace brittle mode-ID tests with declared mode semantics where possible.

Recommended manifest concepts:

- `yearBasis`: `release`, `chart`, or new `screen`
- `repeatPolicy`
- optional `compositeOf: ["movie_themes", "tv_themes"]`
- optional playback policy such as `playbackVariant: "remix"` or membership-explicit playback selection

Compiler semantics should be:

- `release` -> master song `release.answerYear`
- `chart` -> membership/chart year
- `screen` -> verified screen-work `workAnswerYear`

Do not make `screen_themes` a third independently maintained membership set.

## Suggested delivery order

1. Generalise mode/compiler validation so new declared modes are not hard-coded in multiple files.
2. Add a screen-work relationship model and `screen` year basis.
3. Add Movie Themes and TV Themes source memberships with verified work years.
4. Derive TV & Movie Themes automatically.
5. Add explicit alternate-recording/playback-reference support for Remix: Original Year.
6. Curate reviewed seed catalogues and provider assets.
7. Run the full `node scripts/check.mjs` suite before making any new mode selectable.

## Acceptance criteria

- All four mode names appear as first-class product modes once playable.
- Movie Themes reveals/scores the represented movie's release year, regardless of the song's release year.
- TV Themes reveals/scores the represented show's Season 1 / series-premiere year, regardless of the theme recording's release year.
- TV & Movie Themes exactly reflects the union of the two source theme modes without an independently curated third catalogue.
- Screen-work answer years never overwrite canonical song release truth.
- Remix mode always answers with original release year even when the played remix was released much later.
- A remix provider ID never overwrites canonical song identity or release truth.
- Year filtering, no-repeat, Resume, scoring, physical cards, Virtual cards, Spotify, and YouTube semantics remain intact.
- No mode silently substitutes another mode's catalogue.
- Full validation suite passes from a clean checkout before release.
