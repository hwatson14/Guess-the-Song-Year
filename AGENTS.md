# Guess the Song Year — Agent Contract

## Purpose

This repository is the standalone Guess the Song Year playable web product. Keep changes inside this product boundary.

## Read first

1. `README.md`
2. the exact runtime/data files relevant to the requested change
3. relevant validation/deployment workflow files when behaviour or catalogue data changes

Harry's latest explicit instruction is highest authority.

## Current product boundary

- One active music mode: **Greatest Hits**.
- Two play styles: **Real cards** and **Virtual**.
- 1–6 teams.
- First to 10 cards or Unlimited.
- Spotify Premium playback or YouTube fallback.
- Match phase/current card/reveal state are persisted so Resume restores the active turn.
- Additional catalogues and custom playlists are deferred while the core loop is stabilised.

## Core invariant

For every played card, the selected song must come from the prebuilt Greatest Hits bucket for that card year. Runtime mode fallback is not permitted under the current v7 contract.

## Engineering rules

- Preserve the narrow playable scope unless Harry explicitly widens it.
- Do not silently broaden catalogue modes or add speculative product layers.
- Keep catalogue changes compatible with `data/catalogue.schema.json` and `scripts/validate_catalogue.py`.
- Treat the existing catalogue as needing further human curation for canonical release-year quality and recognisability; runtime filtering is not a substitute for source curation.
- Behaviour changes must preserve browser/device Back handling, Resume state, and deployment validation unless the task explicitly changes those contracts.
- Never commit credentials or tokens.

## Validation

Run the narrowest relevant checks first. When catalogue/runtime behaviour changes, include the catalogue validation and any relevant JavaScript/browser/deployment checks before claiming completion.
