import fs from 'node:fs';
import path from 'node:path';

const cataloguePath = path.resolve(process.cwd(), 'data/catalogue.json');

const norm = (value) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export function reconcileCatalogue(catalogue) {
const changes = [];

function removeWhere(mode, year, predicate, reason) {
  const rows = catalogue.modes?.[mode]?.[year];
  if (!Array.isArray(rows)) return;
  const kept = rows.filter((row) => {
    if (!predicate(row)) return true;
    changes.push({ mode, year: Number(year), title: row.title, artist: row.artist, reason });
    return false;
  });
  catalogue.modes[mode][year] = kept;
}

// These are the same recording/identity, with the canonical chart-facing title retained.
removeWhere('greatest', 1980, (row) => norm(row.title) === norm('Call Me (theme from American Gigolo)') && norm(row.artist) === norm('Blondie'), 'alias of Call Me');
removeWhere('greatest', 1953, (row) => norm(row.title) === norm('Vaya Con Dios (May God Be With You)') && norm(row.artist) === norm('Les Paul & Mary Ford'), 'translated alias of Vaya con Dios');
removeWhere('greatest', 1975, (row) => norm(row.title) === norm('Philadelphia Freedom') && norm(row.artist) === norm('The Elton John Band'), 'credit alias of Philadelphia Freedom by Elton John');
removeWhere('greatest', 1994, (row) => norm(row.title) === norm('The Sign (ultimix)') && norm(row.artist) === norm('Ace of Base'), 'duplicate-ID remix marker; canonical The Sign retained');

// Location-labelled copies of the canonical 1964 Beatles recording are not distinct songs.
for (const year of Object.keys(catalogue.modes?.greatest ?? {})) {
  removeWhere('greatest', year, (row) => norm(row.title).startsWith(norm('I Want to Hold Your Hand')) && norm(row.title) !== norm('I Want to Hold Your Hand'), 'location-labelled alias of original 1963 I Want to Hold Your Hand');
}

// A source label is allowed to claim verified release year only when the row carries
// independent release-year evidence. Chart-year semantics and evidence states remain intact.
for (const [mode, years] of Object.entries(catalogue.modes ?? {})) {
  for (const [year, rows] of Object.entries(years ?? {})) {
    for (const row of rows) {
      if (!row.sourceLabel?.toLowerCase().includes('release year verified') || row.releaseYearEvidence) continue;
      const prefix = row.sourceLabel.split('·')[0].trim();
      row.sourceLabel = `${prefix} · legacy release-year label`;
      changes.push({ mode, year: Number(year), title: row.title, artist: row.artist, reason: 'removed unsupported verified release-year claim' });
    }
  }
}

for (const [mode, years] of Object.entries(catalogue.modes ?? {})) {
  for (const year of Object.keys(years)) if (!years[year]?.length) delete years[year];
}
catalogue.coverage = Object.fromEntries(Object.entries(catalogue.modes ?? {}).map(([mode, years]) => [mode, Object.keys(years).length]));
catalogue.missing = Object.fromEntries(Object.entries(catalogue.modes ?? {}).map(([mode, years]) => [mode, catalogue.years.filter((year) => !years[String(year)]?.length)]));
return changes;
}

if (process.argv[1] && process.argv[1].endsWith('reconcile_catalogue_identity.mjs')) {
  const catalogue = JSON.parse(fs.readFileSync(cataloguePath, 'utf8'));
  const changes = reconcileCatalogue(catalogue);
  fs.writeFileSync(cataloguePath, `${JSON.stringify(catalogue)}\n`);
  console.log(JSON.stringify({ changed: changes.length, changes }, null, 2));
}
