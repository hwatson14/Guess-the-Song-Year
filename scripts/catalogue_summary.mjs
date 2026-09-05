import {catalogueEngine,loadProductionCatalogue} from './catalogue_runtime.mjs';
const {data,manifest}=loadProductionCatalogue(),E=catalogueEngine(data,manifest);
const reports=await E.modeReports(),memberships=new Map(),rawMemberships=new Map(),modes={};
function add(map,key,mode){if(!map.has(key))map.set(key,new Set());map.get(key).add(mode)}
for(const [mode,buckets] of Object.entries(data.modes)){
  const rows=Object.values(buckets).flat(),r=reports[mode];
  rows.forEach(song=>add(rawMemberships,E.songUseKey(song),mode));
  const keys=new Set(Object.values(r.yearSongKeys).flat());
  keys.forEach(key=>add(memberships,key,mode));
  modes[mode]={status:r.statusLabel,storedRows:rows.length,usableSongs:keys.size,
    usableCoverage:r.coverage,totalYears:r.totalYears,excludedRows:rows.length-r.songs,
    missingUsableYears:data.years.filter(year=>!r.years.includes(year))};
}
function distribution(map){const counts={};for(const set of map.values())counts[set.size]=(counts[set.size]||0)+1;return counts}
console.log(JSON.stringify({catalogueVersion:data.version,
  storedPlacements:Object.values(modes).reduce((n,m)=>n+m.storedRows,0),
  storedUniqueIdentities:rawMemberships.size,
  usablePlacements:Object.values(modes).reduce((n,m)=>n+m.usableSongs,0),
  usableUniqueSongs:memberships.size,
  usableSongsInMultipleModes:[...memberships.values()].filter(set=>set.size>1).length,
  usableMembershipDistribution:distribution(memberships),modes},null,2));
