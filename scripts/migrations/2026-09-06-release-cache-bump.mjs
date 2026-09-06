import fs from 'node:fs';

const WRITE=process.argv.includes('--write');
function replaceAllExact(path,from,to,expectedMinimum=1){
  let text=fs.readFileSync(path,'utf8');
  if(text.includes(to)&&!text.includes(from))return false;
  const count=text.split(from).length-1;
  if(count<expectedMinimum)throw new Error(`Expected at least ${expectedMinimum} occurrences of ${from} in ${path}, found ${count}`);
  text=text.split(from).join(to);
  if(WRITE)fs.writeFileSync(path,text);
  return true;
}

replaceAllExact('index.html','v=7.6.0','v=7.6.1',5);
replaceAllExact('engine.js',"./data/catalogue.json?v=7.5.19","./data/catalogue.json?v=7.6.1");
console.log(JSON.stringify({write:WRITE,release:'7.6.1'}));
