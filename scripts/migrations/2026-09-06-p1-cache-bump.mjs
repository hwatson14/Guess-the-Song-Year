import fs from 'node:fs';

const write=process.argv.includes('--write');
const version='7.6.6';
let changed=false;

let index=fs.readFileSync('index.html','utf8');
const nextIndex=index.replace(/engine\.js\?v=[0-9.]+/g,`engine.js?v=${version}`);
if(nextIndex!==index){changed=true;if(write)fs.writeFileSync('index.html',nextIndex)}

let engine=fs.readFileSync('engine.js','utf8');
const nextEngine=engine.replace(/data\/catalogue\.json\?v=[0-9.]+/g,`data/catalogue.json?v=${version}`);
if(nextEngine!==engine){changed=true;if(write)fs.writeFileSync('engine.js',nextEngine)}

if(!nextIndex.includes(`engine.js?v=${version}`))throw new Error('Engine cache version was not materialized');
if(!nextEngine.includes(`data/catalogue.json?v=${version}`))throw new Error('Catalogue cache version was not materialized');
console.log(JSON.stringify({write,changed,version}));
