# Release audit — 2026-09-05

Release candidate: catalogue v17, application assets 7.5.18. This audit covers the accumulated catalogue/database migration and gameplay cleanup, plus a focused release review using three small agents and primary-agent browser verification.

## Findings resolved

| Finding | Resolution | Evidence |
| --- | --- | --- |
| Physical scans started music before the phone-down gate | Both providers now persist and display Ready before playback | `test_physical_ready.mjs`, both provider paths |
| Cached YouTube uploads could remain stale indefinitely | Seven-day expiry, validation of legacy and current caches, removal of failed candidates | `test_engine_playback_fixes.mjs`, `test_preferred_link_cache.mjs` |
| Video validation accepted candidates when the API failed | Validation now fails with a recoverable provider error | Playback regression suite |
| Delayed Spotify commands could leave the wrong final playback state | Play/pause commands are serialized | Delayed-command regression |
| Spotify search could accept an exact title by the wrong artist | Independent title/artist confidence floors and aggregate match threshold | Wrong-artist rejection regression |
| CI and Pages depended on untracked local files | Compiler, source database, ledgers, tests, dependencies, assets and scanner are included in the release | Shared gate and clean-checkout verification |
| Main's documentation described an obsolete v6/v10 mismatch | Preserved the six remote commits and reconciled documentation with the current implementation | Merge history and updated handoff |

## Validation

- `node scripts/check.mjs`: all 34 checks pass. Includes syntax, database/compiler equivalence, schema, cleanup accounting, expansion provenance, year ranges, canonical identity, provider recovery, scoring policy, physical cards, Spotify sessions and vendored dependency checks.
- Real provider test: candidate app files were routed through Playwright at the production origin, because the YouTube key correctly rejects localhost referrers. Provider requests were not mocked. “Girls Just Want to Have Fun” resolved, YouTube showed normal pre-roll ads, and the actual player reported PLAYING with time advancing from 36.86 to 60.90 seconds. The title matched the selected song. This verifies player state, not a human audio audition.
- Completed that turn through Guess, placement and Reveal; the correct placement awarded one point.
- Phone matrix: Ready, placement, Reveal and game over at 375×667, 390×844 and 430×932; six-team/long-timeline saved-state fixtures. All 12 combinations had zero document overflow. Timeline and team strips scroll internally.
- Setup at all three sizes showed 877 Greatest Hits songs and no page overflow. Music dialog made the background inert, took focus, closed with Escape and restored focus.
- Injected provider-error test separately verified that reload/Resume preserves the complete match and Back returns to Resume without consuming the turn. This is a recovery fixture, not playback evidence.
- Staged files were checked for credential/token patterns without printing values; none found. The existing YouTube browser key is deliberately public and referrer-restricted. Research caches and browser profiles/logs are ignored; Pages uses an explicit public-file staging list.

## Catalogue and architecture

One normalized JSON source holds 1,118 master songs and 1,299 mode memberships. The offline compiler generates the runtime catalogue. Greatest Hits has 877 songs, at least 12 for every year 1950–2022. Australian has 236, Unexpected Years 40, and each chart mode 73. All 665 original cleanup records remain accounted for; no runtime rows are silently filtered out.

Provider candidates remain separate from reviewed preferred playback IDs. Three Spotify links have been promoted; no YouTube candidate has been promoted merely because metadata was available. Search fills missing runtime playback IDs.

## Remaining limitations

- The release is playable Beta, not a claim that every song/year/recording has been independently verified. Four modes remain Beta and Unexpected Years remains Preview. Legacy release evidence, ambiguous recording versions and shallow themed pools still need curation.
- YouTube playback depends on network access, provider availability, the restricted key and search quota. Ads and browser tap-to-start requirements can appear. There is no server-side quota service or guarantee that every upload will remain playable.
- Spotify requires Premium and an available Connect device. Unit/VM tests cover authentication recovery and command ordering; this audit did not use a real authenticated Premium account.
- Physical QR identities and parser behavior are tested. The printed-year reconciliation ledger remains non-blocking under the private-app contract; browser-local Reveal corrections are not promoted as independent evidence. A real phone camera/deck scan is not claimed by the desktop fixture tests.
- Spotify playlist import and an optional SQLite query workspace remain future work. They are not required by the current static deployment.

Deployment evidence is recorded in the release task and GitHub Actions. Publication must use the tested revision and verify the live asset version and catalogue after Pages completes.
