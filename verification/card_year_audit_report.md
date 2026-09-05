# Physical-card YEAR_MAP verification audit

Generated: 2026-08-08T23:44:40Z

## Outcome

The 308 card identities are independently verified, but the 308 printed years are **not**. The live HITSTER production database contains exactly 308 contiguous, unique card numbers for UK SKU `aaaa0005` and Australian SKU `aaah0001`. Its only per-card fields are `CardNumber` and `Spotify`; it does not contain the printed year.

Accordingly, the ledger contains 308 rows but leaves `authoritative_observed_year` blank on every row. The proposed map is withheld (`yearMap: null`, `safeToApplyAutomatically: false`). No metadata-derived year has been promoted to a physical-card fact.

## What is independently established

- The official UK product is article `1110100132`, EAN `8710126001325`, and contains 308 cards: https://jumboplay.com/en-gb/products/hitster-uk-edition-1110100132
- HITSTER's UK FAQ links the ordered Original playlist and describes songs spanning 1908-2021: https://hitstergame.com/en-gb/faq/
- The rules define the printed year as the year the song was released or performed publicly by that artist in its original form: https://hitstergame.com/en-gb/how-to-play/
- The live production gameset database has 308 cards for `aaaa0005` and 308 for `aaah0001`, with IDs exactly `00001`..`00308`: https://stgroupprdhitster.blob.core.windows.net/hitster-assets/gameset_database.json
- UK versus the ordered playlist snapshot: 307 exact Spotify-ID matches plus one same-title track relink at card `00166` (`Girl, You'll Be A Woman Soon`).
- UK versus Australia: 301 exact Spotify-ID matches. The seven alternate IDs at 00063, 00070, 00099, 00166, 00175, 00217, 00277 resolve through Spotify oEmbed to equivalent titles/versions of the same songs.

This establishes the card-number-to-song identity sequence. It does **not** establish the year printed on either physical edition.

## Repository provenance

- Initial commit `6c6e39deb3ac8d1c391f639f49a4432d1d10a64e` explicitly calls the table an assumed prototype and says it had not been verified card-by-card against the physical backs.
- The exact sequence first appears in `f864ee5417076bfeb0001777faeea812d640fe14` in `index.html`.
- Commit `c590b535f670d492ce1a7e5b6fc593f1bda66468` copies it to `engine.js`. Later tests and catalogue scripts consume that array and therefore are not independent evidence.
- No repository history or asset contains a card-back photograph, scan export, printed-year spreadsheet, or manufacturer card-year table.

## Year verification state and discrepancies

| Measure | Result |
|---|---:|
| Ledger rows | 308 |
| Authoritative card identities observed | 308 |
| Authoritative printed years observed | 0 |
| Printed-year rows unresolved | 308 |
| Confirmed current-map vs printed-year discrepancies | not computable |

`confirmedYearDiscrepancyCardIds` is empty only because a printed-year comparison cannot be made. It must not be interpreted as proof that the current map matches the deck.

Two non-authoritative sources were retained only as capture-priority signals:

- Bopster's community/imported displayed year differs from the current map on 79 cards: 00011, 00019, 00020, 00022, 00033, 00034, 00038, 00042, 00051, 00058, 00060, 00062, 00064, 00069, 00072, 00073, 00074, 00082, 00083, 00088, 00090, 00091, 00093, 00099, 00105, 00107, 00110, 00111, 00114, 00115, 00116, 00119, 00125, 00130, 00134, 00136, 00141, 00144, 00147, 00150, 00166, 00169, 00172, 00175, 00194, 00199, 00200, 00204, 00206, 00207, 00209, 00210, 00211, 00212, 00214, 00217, 00221, 00223, 00227, 00230, 00233, 00236, 00238, 00239, 00241, 00245, 00246, 00248, 00249, 00252, 00255, 00261, 00262, 00266, 00273, 00278, 00291, 00295, 00303.
- The MusicBrainz recording search candidate differs on 81 cards and failed to resolve 10 cards. Differing IDs: 00004, 00005, 00009, 00013, 00016, 00017, 00021, 00023, 00025, 00026, 00030, 00036, 00046, 00051, 00057, 00061, 00062, 00065, 00069, 00071, 00076, 00082, 00083, 00084, 00085, 00087, 00089, 00090, 00091, 00092, 00093, 00100, 00104, 00105, 00110, 00111, 00113, 00118, 00120, 00126, 00128, 00134, 00135, 00136, 00144, 00147, 00151, 00153, 00170, 00176, 00191, 00196, 00202, 00209, 00210, 00212, 00214, 00216, 00219, 00220, 00223, 00224, 00229, 00233, 00239, 00243, 00244, 00248, 00251, 00252, 00255, 00265, 00266, 00267, 00273, 00297, 00299, 00300, 00301, 00303, 00304. Unresolved IDs: 00019, 00027, 00077, 00122, 00148, 00156, 00203, 00232, 00282, 00294.
- The union contains 141 cards: 00004, 00005, 00009, 00011, 00013, 00016, 00017, 00019, 00020, 00021, 00022, 00023, 00025, 00026, 00027, 00030, 00033, 00034, 00036, 00038, 00042, 00046, 00051, 00057, 00058, 00060, 00061, 00062, 00064, 00065, 00069, 00071, 00072, 00073, 00074, 00076, 00077, 00082, 00083, 00084, 00085, 00087, 00088, 00089, 00090, 00091, 00092, 00093, 00099, 00100, 00104, 00105, 00107, 00110, 00111, 00113, 00114, 00115, 00116, 00118, 00119, 00120, 00122, 00125, 00126, 00128, 00130, 00134, 00135, 00136, 00141, 00144, 00147, 00148, 00150, 00151, 00153, 00156, 00166, 00169, 00170, 00172, 00175, 00176, 00191, 00194, 00196, 00199, 00200, 00202, 00203, 00204, 00206, 00207, 00209, 00210, 00211, 00212, 00214, 00216, 00217, 00219, 00220, 00221, 00223, 00224, 00227, 00229, 00230, 00232, 00233, 00236, 00238, 00239, 00241, 00243, 00244, 00245, 00246, 00248, 00249, 00251, 00252, 00255, 00261, 00262, 00265, 00266, 00267, 00273, 00278, 00282, 00291, 00294, 00295, 00297, 00299, 00300, 00301, 00303, 00304.

These are **candidate conflicts, not discrepancies**. The public data visibly contains reissues/remasters and false recording matches. The full per-card flags are in the ledger.

## Structural audit

- Expected and live IDs: 1..308, exactly 308 unique and contiguous.
- Missing IDs: none.
- Duplicate IDs: none.
- Out-of-range IDs: none.
- UK live Spotify identities: 308 unique.
- Australian live Spotify identities: 308 unique.
- Current `YEAR_MAP`: 308 non-null entries, range 1950..2022.
- Missing years inside the current map's range: none.
- Years used more than once: 64; this is expected distribution, not duplicate cards.
- Important range warning: the current map bottoms out at 1950 and includes 2022, while the current UK FAQ describes the game as spanning 1908-2021. This is a reason to demand card-back evidence, not enough evidence to assign replacement years.

### Current YEAR_MAP counts by year

| Year | Cards |
|---:|---:|
| 1950 | 1 |
| 1951 | 1 |
| 1952 | 1 |
| 1953 | 1 |
| 1954 | 2 |
| 1955 | 1 |
| 1956 | 1 |
| 1957 | 2 |
| 1958 | 4 |
| 1959 | 1 |
| 1960 | 3 |
| 1961 | 2 |
| 1962 | 2 |
| 1963 | 3 |
| 1964 | 1 |
| 1965 | 4 |
| 1966 | 4 |
| 1967 | 3 |
| 1968 | 4 |
| 1969 | 3 |
| 1970 | 4 |
| 1971 | 4 |
| 1972 | 5 |
| 1973 | 6 |
| 1974 | 3 |
| 1975 | 5 |
| 1976 | 7 |
| 1977 | 6 |
| 1978 | 6 |
| 1979 | 5 |
| 1980 | 3 |
| 1981 | 5 |
| 1982 | 6 |
| 1983 | 8 |
| 1984 | 5 |
| 1985 | 5 |
| 1986 | 4 |
| 1987 | 6 |
| 1988 | 4 |
| 1989 | 6 |
| 1990 | 6 |
| 1991 | 3 |
| 1992 | 4 |
| 1993 | 2 |
| 1994 | 8 |
| 1995 | 6 |
| 1996 | 5 |
| 1997 | 7 |
| 1998 | 4 |
| 1999 | 4 |
| 2000 | 7 |
| 2001 | 5 |
| 2002 | 5 |
| 2003 | 6 |
| 2004 | 5 |
| 2005 | 6 |
| 2006 | 6 |
| 2007 | 7 |
| 2008 | 6 |
| 2009 | 5 |
| 2010 | 6 |
| 2011 | 4 |
| 2012 | 5 |
| 2013 | 4 |
| 2014 | 5 |
| 2015 | 1 |
| 2016 | 6 |
| 2017 | 4 |
| 2018 | 4 |
| 2019 | 4 |
| 2020 | 4 |
| 2021 | 4 |
| 2022 | 3 |

## QR parsing edge cases

The parser tests below port the exact regular expression and range check from `engine.js`. Exact-port failures: 0.

| Input | Result | Observation |
|---|---:|---|
| `1` | 1 | manual unpadded ID |
| `00001` | 1 | manual padded ID |
| `00308` | 308 | upper boundary |
| `00000` | reject | zero rejected |
| `00309` | reject | out-of-range rejected |
| `https://hitstergame.com/uk/aaaa0005/00001` | 1 | resolver-compatible UK candidate shape |
| `https://hitstergame.com/au/aaah0001/00001` | 1 | resolver-compatible AU candidate shape |
| `https://hitstergame.com/uk/aaaa0016/00001` | 1 | different UK deck silently collides |
| `https://hitstergame.com/de/aaaa0002/00001` | 1 | foreign deck silently collides |
| `https://evil.example/not-a-deck/00001` | 1 | untrusted host is accepted |
| `junk/00001` | 1 | non-URL suffix is accepted |
| `https://hitstergame.com/uk/aaaa0005/00001?x=1` | 1 | query suffix accepted |
| `https://hitstergame.com/uk/aaaa0005/00001/` | reject | trailing slash rejected |
| `https://hitstergame.com/uk/aaaa0005/1` | reject | unpadded URL card rejected |
| `https://hitstergame.com/uk/aaaa0005/00001#x` | reject | bare fragment rejected |
| `https://hitstergame.com/uk/aaaa0005/00001?x=1#frag` | 1 | fragment after query accepted |
| `https://hitstergame.com/uk/aaaa0005/?id=00001` | reject | query-parameter card rejected |
| `000001` | reject | six digits rejected |
| ` 00001 ` | 1 | outer whitespace trimmed |
| `+1` | reject | signed number rejected |
| `1.0` | reject | decimal rejected |

The parser extracts only the trailing five-digit number. It ignores host, locale, and deck SKU, so other UK expansions, foreign editions, or arbitrary URLs ending in the same ID silently collide with the UK/Australian Original map. The resolver identity is therefore the tuple `(host, locale, deck SKU, card number)`, not the card number alone; the exact physical QR payload remains to be captured. No gameplay code was changed in this audit.

The public resolver implementation that exposed the production database and QR shape is: https://github.com/musicguessr/musicguessr-backend/blob/main/internal/resolver/resolver.go

## Missing authority and capture/import protocol

The missing source is a one-to-one observation of the printed side and QR payload for Harry's exact physical edition. The box article/EAN and the QR deck SKU must be captured because card numbers repeat across editions.

1. Photograph the box article/EAN and one representative card on both sides. Confirm whether the QR contains UK SKU `aaaa0005`, Australian SKU `aaah0001`, or something else.
2. Use `physical_card_capture_template.csv`; it already has all 308 expected card numbers and candidate UK/AU URL shapes. The locale portion is inferred from the public resolver, so record the physical QR payload verbatim rather than accepting the prefilled candidate as proof.
3. Work in batches of 25. For each card, scan the raw QR payload and photograph the year side without changing card order.
4. Best evidence is one frame showing the decoded QR payload and the printed-year side. If that is awkward, use paired files such as `00001_qr.jpg` and `00001_year.jpg`; never rely on capture order alone.
5. Populate `observed_qr_payload`, `printed_year`, `edition_sku`, `box_article_or_ean`, `photo_qr`, `photo_year`, `observer`, and `observed_at`.
6. Fast alternative: export QR scans as timestamped CSV, preserve deck order, then make one continuous video flipping each card while reading the printed year. Reconcile timestamps before import.
7. Acceptance gate: exactly 308 unique IDs, no missing/out-of-range IDs, every row linked to visual evidence, and a second-person review of all candidate-conflict rows plus at least 10% of apparent matches.

## Artifacts

- `card_year_verification_ledger.csv`: 308-row evidence ledger; authoritative years are intentionally blank.
- `proposed_year_map.json`: machine-readable withholding decision; no unsafe map is proposed.
- `physical_card_capture_template.csv`: prefilled 308-row import template.
- `qr_parser_edge_cases.csv`: exact parser behavior and collision cases.
- `sources/official_hitster_gamesets_uk_au.json`: extracted production identity snapshot with source hash.
- `sources/official_uk_playlist.json`: ordered title/artist reference; direct official embed for rows 1..100 and community import for rows 101..308.
- `sources/musicbrainz_release_years.json`: non-authoritative screening data only.

The official playlist is https://open.spotify.com/playlist/0Mpj1KwRmY2pHzmj7mfbdh. The community list used to recover the currently hidden tail is https://bopster.app/en/playlist?id=4450. Spotify's current public API restrictions prevent retrieving all tracks from another user's playlist, which is why the live HITSTER gameset database is the stronger identity source.
