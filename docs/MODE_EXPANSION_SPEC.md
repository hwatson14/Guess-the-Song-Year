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
- New themed modes are memberships/relationships over canonical songs, not copied master records.
- The combined TV & Movie mode must be derived from the two source theme modes and deduplicated by canonical `songId`.
- Provider failures must never redefine the answer year.
- Physical-card mode and Virtual mode must use the same answer-year semantics.
- Do not expose a mode as playable until it has at least one valid pool; initial lifecycle status may be `building` or `preview`.

## 1. Movie Themes

Proposed mode ID: `movie_themes`.

Purpose: play recognisable movie themes, soundtrack themes, title themes, or strongly movie-associated theme recordings.

### Tentative year semantics

Until Harry explicitly chooses otherwise, preserve the core **Guess the Song Year** mechanic: the answer year is the canonical recording/song's `release.answerYear`, not the film's premiere year.

Store screen-work context separately so a future film-year variant remains possible without rewriting song truth:

- `workType: "movie"`
- `workTitle`
- `workYear` (film release year when verified)
- optional `themeRole` such as `main-theme`, `title-theme`, `signature-theme`, `soundtrack-signature`

A future product decision may choose to make the film's release year the answer instead. If so, introduce an explicit new year basis rather than overloading canonical song release year.

## 2. TV Themes

Proposed mode ID: `tv_themes`.

Purpose: play recognisable television themes/title themes.

Use the same canonical-song model and tentative song-release answer semantics as Movie Themes.

Recommended membership metadata:

- `workType: "tv"`
- `workTitle`
- `workYear` (series premiere or relevant theme-introduction year when verified)
- optional `themeRole`

Do not create duplicate canonical songs just because the same recording appears across multiple series, films, or other modes.

## 3. TV & Movie Themes

Proposed mode ID: `screen_themes`.

This mode is exactly the union of `movie_themes` and `tv_themes`.

### Required implementation rule

Do **not** manually curate a third set of source memberships. Derive it deterministically from the two source modes during compilation/runtime generation.

- union source mode memberships
- deduplicate by canonical `songId` within each answer-year bucket
- preserve source context so Reveal can identify whether the item came from a movie or TV show
- if one song legitimately belongs to both, keep one playable canonical song with both contexts available where practical

This prevents divergence between the combined mode and its two components.

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

Recommended future manifest concepts:

- `yearBasis`: existing `release` / `chart`, with any new basis added explicitly if required
- `repeatPolicy`
- optional `compositeOf: ["movie_themes", "tv_themes"]`
- optional playback policy such as `playbackVariant: "remix"` or membership-explicit playback selection

Do not make `screen_themes` a third independently maintained membership set.

## Suggested delivery order

1. Generalise mode/compiler validation so new declared modes are not hard-coded in multiple files.
2. Add Movie Themes and TV Themes source membership support.
3. Derive TV & Movie Themes automatically.
4. Add explicit alternate-recording/playback-reference support for Remix: Original Year.
5. Curate reviewed seed catalogues and provider assets.
6. Run the full `node scripts/check.mjs` suite before making any new mode selectable.

## Acceptance criteria

- All four mode names appear as first-class product modes once playable.
- TV & Movie Themes exactly reflects the union of the two source theme modes, modulo canonical dedupe.
- Remix mode always answers with original release year even when the played remix was released much later.
- A remix provider ID never overwrites canonical song identity or release truth.
- Year filtering, no-repeat, Resume, scoring, physical cards, Virtual cards, Spotify, and YouTube semantics remain intact.
- No mode silently substitutes another mode's catalogue.
- Full validation suite passes from a clean checkout before release.
