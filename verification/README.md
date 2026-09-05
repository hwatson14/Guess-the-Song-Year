# Physical-card verification

This directory preserves the independent audit of the 308-card UK and Australian Original HITSTER identities.

Current evidence boundary:

- 308/308 card-number-to-song identities are corroborated.
- 0/308 printed card years are independently observed.
- `proposed_year_map.json` therefore withholds a replacement map.
- `physical_card_capture_template.csv` is the prepared path to finish the audit from the real deck.

The runtime parser finding in `card_year_audit_report.md` records behavior at audit time. The master stabilization branch remediates it in `app-policy.js`: QR URLs now require HTTPS, the HITSTER host, and either UK Original `uk/aaaa0005` or Australian Original `au/aaah0001`. Manual IDs `1` through `308` remain supported.

Do not treat provider metadata, community lists, MusicBrainz candidates, or the checked-in `YEAR_MAP` as proof of a printed card year. The acceptance gate remains paired physical evidence or an official manufacturer card-year table.
