# Guess the Song Year

Private music timeline game using either the existing physical QR cards or a fully virtual in-app timeline.

## Current app architecture

- **Game setup** chooses Real Cards vs Virtual, fixed deck vs choose every song, team count, and victory target.
- **Real Cards** scans the existing QR deck and uses the physical timeline.
- **Virtual** generates a shuffled card order from the same 308-card year distribution and requires players to place each song into the correct in-app timeline slot.
- **Decks** currently include Greatest Hits, Australian, Unexpected Years, #1 US, Rock & Anthems, Dancefloor, and Wildcard. #1 Australia is reserved for the curated Australian annual #1 manifest.
- **Playback** supports Spotify PKCE and YouTube fallback.
- Spotify Client ID is preconfigured in the browser app. Tokens are retained in browser storage and refreshed automatically while valid.
- YouTube search uses the restricted shared API key.

## Live

https://hwatson14.github.io/Guess-the-Song-Year/
