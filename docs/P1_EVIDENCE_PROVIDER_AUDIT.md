# P1 evidence and provider hardening audit

_Date: 2026-09-06_

## Outcome

P1 improved canonical release evidence and playback identity without changing any answer year automatically.

### Release evidence

- Baseline: 817 externally observed masters, 289 unresolved.
- After P1: 857 externally observed masters, 249 unresolved.
- 40 previously unresolved master years were confirmed against exact MusicBrainz recording/title/full-credit evidence at the existing `release.answerYear`.
- 208 research results remain in `verification/release-evidence-review-queue.json` because they are lower-confidence, ambiguous, truncated, alternate-version, or otherwise require explicit review.
- An earlier exact recording is never applied automatically; it is surfaced as `earlier_exact_recording` for review.

### Provider evidence

- Spotify: 604 masters have at least one stored link; 4 have verified preferred recordings.
- YouTube: 430 masters have at least one stored link; 0 have verified preferred recordings.
- The recording-linked provider sample had low yield, so P1 deliberately prioritised runtime identity enforcement over broad link crawling.
- Automated provider verification requires an accepted MusicBrainz recording claim at the canonical answer year, compatible title/full artist/version metadata, and a recording-level `free streaming` or `streaming` URL relationship.
- Arbitrary URL relationships, provider availability, or title-only matches are not verification.

### Spotify runtime hardening

- Static catalogue Spotify IDs are fetched and identity-checked before use.
- Cached Spotify IDs are fetched and identity-checked before reuse; mismatches drop the cache.
- Search candidates use the same scorer.
- The expected lead artist is compared against each Spotify artist credit with a strong match floor, avoiding permissive shared-token matches.
- Only HTTP 404 is treated as a missing candidate. Other Spotify API errors propagate as provider errors.
- Membership-explicit alternate playback validates against its explicit playback title/artist and never falls back to an unreviewed search result.

## Verification

Final branch acceptance was run after merging the then-current `main` into the P1 branch. It passed:

- all 47 application/catalogue checks;
- Spotify mobile-auth and background-playback regressions already present on current `main`;
- static/cached Spotify identity and non-404 error propagation regressions;
- release/provider hardening policy regressions, including production automated-provider provenance;
- catalogue/schema/identity/cleanup/provenance checks;
- `git diff --check`.

The final acceptance reported 1,106 master songs and 1,298 active memberships with 857 externally observed release records and 249 unresolved. Runtime assets are cache-busted at engine/catalogue version 7.6.6.

The temporary self-materialising P1 workflow was removed before pull-request review. Normal read-only PR CI is authoritative for merge.
