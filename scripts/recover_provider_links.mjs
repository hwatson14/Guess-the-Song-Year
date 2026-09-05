import fs from 'node:fs';
import { catalogueEngine } from './catalogue_runtime.mjs';
import { compileDatabase } from './song_database.mjs';

const db = JSON.parse(fs.readFileSync('data/song-database.json', 'utf8'));
const outputFile = 'output/expansion/recovered-provider-links.json';
const E = catalogueEngine(compileDatabase(db), JSON.parse(fs.readFileSync('data/modes.json', 'utf8')));

// This deliberately has a narrower identity rule than the runtime's version
// collapsing: provider recovery must never turn a remix/live/version into a
// link for the original recording.
function normalize(value) {
  return String(value ?? '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/ +/g, ' ');
}
function titleForms(value) {
  const raw = String(value ?? '').trim();
  const forms = new Set([normalize(raw)]);
  // A feature suffix is an allowed metadata spelling difference only.
  forms.add(normalize(raw.replace(/\s*(?:\(|\[)?\s*(?:feat\.?|featuring)\b.*?\)?\s*$/i, '')));
  return [...forms].filter(Boolean);
}
function artistForms(value) {
  const raw = String(value ?? '').trim();
  const forms = new Set([normalize(raw)]);
  forms.add(normalize(raw.replace(/^the\s+/i, '')));
  forms.add(normalize(raw.replace(/\s*(?:,?\s*)?(?:feat\.?|ft\.?|featuring)\b.*$/i, '')));
  forms.add(normalize(raw.replace(/^the\s+/i, '').replace(/\s*(?:,?\s*)?(?:feat\.?|ft\.?|featuring)\b.*$/i, '')));
  return [...forms].filter(Boolean);
}
function idsInMaster(provider) {
  return new Set(Object.values(db.songs).flatMap(s => (s.providers?.[provider]?.links || []).map(x => x.id)).filter(Boolean));
}

const songs = Object.values(db.songs);
const index = new Map();
for (const song of songs) for (const title of titleForms(song.title)) for (const artist of artistForms(song.artist)) {
  const key = `${title}|${artist}`;
  const list = index.get(key) || [];
  list.push(song);
  index.set(key, list);
}
// Aliases are authoritative legacy identities and may not be represented by
// the current song's display title/artist.
for (const [alias, songId] of Object.entries(db.aliases || {})) {
  const song = db.songs[songId];
  if (!song) continue;
  const [title, artist] = alias.split('|');
  const key = `${normalize(title)}|${normalize(artist)}`;
  const list = index.get(key) || [];
  if (!list.includes(song)) list.push(song);
  index.set(key, list);
}

const sources = [
  { file: 'output/expansion/streaming-link-candidates.json', url: 'https://github.com/connoraking/Spotify-YouTube-Multiavariate-Analysis/blob/main/Spotify_Youtube.csv', rows: r => ({ title: r.Track, artist: r.Artist, sourceTitle: r.Track, sourceArtist: r.Artist, spotifyId: r.Uri?.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1], youtubeId: r.Url_youtube?.match(/[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/)?.[1] }) },
  { file: 'output/expansion/bimmuda-source.json', url: 'https://github.com/madelinehamilton/BiMMuDa', rows: r => ({ title: r.Title, artist: r.Artist, sourceTitle: r.Title, sourceArtist: r.Artist, spotifyId: r['Link to Audio']?.match(/spotify\.com\/track\/([A-Za-z0-9]{22})/)?.[1], youtubeId: r['Link to Audio']?.match(/[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/)?.[1] }) }
];
const masterIds = { spotify: idsInMaster('spotify'), youtube: idsInMaster('youtube') };
const proposals = [], seen = new Set();
for (const source of sources) for (const input of JSON.parse(fs.readFileSync(source.file, 'utf8'))) {
  const row = source.rows(input);
  if (!row.title || !row.artist || E.isAlternateSongTitle(row.title)) continue;
  const matches = new Set();
  for (const title of titleForms(row.title)) for (const artist of artistForms(row.artist)) for (const song of (index.get(`${title}|${artist}`) || [])) matches.add(song);
  if (matches.size !== 1) continue;
  const song = [...matches][0];
  for (const provider of ['spotify', 'youtube']) {
    const id = row[provider + 'Id'];
    if (!id || masterIds[provider].has(id)) continue;
    const key = `${song.id}|${provider}|${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    proposals.push({ songId: song.id, provider, id, url: provider === 'spotify' ? `https://open.spotify.com/track/${id}` : `https://www.youtube.com/watch?v=${id}`, sourceTitle: row.sourceTitle, sourceArtist: row.sourceArtist, sourceUrl: source.url, matchRule: 'normalized exact title + artist (NFKD/punctuation; leading The and feat suffix allowed)' });
  }
}
fs.writeFileSync(outputFile, JSON.stringify(proposals, null, 2) + '\n');
console.log(JSON.stringify({ recovered: proposals.length, spotify: proposals.filter(x => x.provider === 'spotify').length, youtube: proposals.filter(x => x.provider === 'youtube').length, output: outputFile }));
