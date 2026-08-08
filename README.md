# Guess the Song Year

Private music timeline game using the existing 308-card QR deck or a fully virtual deck.

## Architecture

- `index.html` — minimal app shell
- `app.css` — one consolidated visual system
- `engine.js` — card map, static catalogue selection and resilient Spotify/YouTube playback
- `app.js` — physical/virtual game state and UI
- `data/catalogue.json` — generated static song catalogue
- `scripts/build_catalogue.py` — catalogue builder

## Game setup

Four game options live on one setup screen:

1. Real cards or Virtual
2. Fixed deck or choose a deck before every song
3. 1–6 teams
4. First to 10 cards or Unlimited

Music provider setup is separate from the game rules and opens as a lightweight sheet.

## Catalogue

The catalogue is prebuilt so runtime APIs resolve playback, rather than decide which song belongs in a deck. Modes are Greatest Hits, Australian, Unexpected Years, #1 US and #1 Australia.

The v6 app intentionally has one UI shell only. Legacy dashboard, v4 and experimental UX layers have been removed.
