import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reconcileCatalogue } from './reconcile_catalogue_identity.mjs';

const production = JSON.parse(fs.readFileSync('data/catalogue.json', 'utf8'));
const clone = JSON.parse(JSON.stringify(production));
reconcileCatalogue(clone);
assert.ok(JSON.stringify(clone)===JSON.stringify(production), 'production catalogue is already reconciled');
const allGreatest = Object.values(production.modes.greatest).flat();
assert.equal(allGreatest.filter((row) => row.title === 'Philadelphia Freedom').length, 1);
assert.ok(allGreatest.some((row) => row.title === 'Philadelphia Freedom' && row.artist === 'Elton John'));
for (const row of allGreatest) {
  const title = String(row.title).toLowerCase();
  assert.ok(!title.includes('theme from american gigolo'));
  assert.ok(!title.includes('vaya con dios (may god'));
  assert.ok(!title.includes('the sign (ultimix)'));
  if (title.startsWith('i want to hold your hand')) assert.equal(title, 'i want to hold your hand');
  if (row.sourceLabel?.toLowerCase().includes('release year verified')) assert.ok(row.releaseYearEvidence || row.yearEvidence);
}
assert.ok(production.modes.greatest[1963].some((row) => row.title === 'I Want to Hold Your Hand'));
assert.ok(Object.values(production.modes.greatest).every(pool=>pool.length), "no empty buckets survive");
assert.equal(production.coverage.greatest, Object.keys(production.modes.greatest).length);
console.log('catalogue identity checks passed without mutating production data');
