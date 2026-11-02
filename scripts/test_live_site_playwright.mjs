import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';

const base=process.env.LIVE_URL||'https://hwatson14.github.io/Guess-the-Song-Year/';
const result={url:base,generatedAt:new Date().toISOString(),static:{},selection:{},mobile:{},desktop:{},providerProbe:{status:'not_run'},errors:[]};
let browser;
async function asset(path){
  const url=new URL(path,base);
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'}});
  assert.equal(response.status,200,'GET '+url+' returned '+response.status);
  return response.text();
}
async function run(){
  const index=await asset('');
  const engine=await asset('engine-v7.js?v=7.7.0');
  const catalogue=JSON.parse(await asset('data/catalogue.json?v=7.7.0'));
  const manifest=JSON.parse(await asset('data/modes.json?v=1'));
  assert.match(index,/engine-v7\.js\?v=7\.7\.0/,'new engine asset URL must be deployed');
  assert.match(index,/engine\.js\?v=7\.7\.0/,'new engine loader asset URL must be deployed');
  assert.match(engine,/chooseDiverseSong/,'production engine must contain artist balancing');
  assert.equal(catalogue.version,19);
  const total=mode=>Object.values(catalogue.modes[mode]||{}).flat().length;
  assert.equal(total('greatest'),884);
  assert.equal(total('australian'),253);
  assert.equal(total('unexpected'),200);
  assert.equal(manifest.modes.one_hit_wonders.status,'building');
  result.static={version:catalogue.version,greatest:total('greatest'),australian:total('australian'),unexpected:total('unexpected'),engineVersion:'7.7.0',oneHitStatus:'building'};
  console.log('PRODUCTION STATIC',JSON.stringify(result.static));

  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const page=await context.newPage();
  page.on('pageerror',error=>result.errors.push('mobile JS: '+error.message));
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await page.locator('[data-mode-picker]').waitFor({state:'visible',timeout:35000});
  assert.equal(await page.locator('[data-mode-picker] option[value="one_hit_wonders"]').isDisabled(),true);
  assert.match(await page.locator('.mode-detail').innerText(),/884 songs/);
  result.mobile.setup=true;
  const simulation=await page.evaluate(async()=>{
    const E=window.GSYEngine;
    const used=[],picks=[];
    for(let year=1970;year<2020;year++){
      const s=await E.chooseSong(year,'greatest',used);
      const key=E.songUseKey(s);
      picks.push({year,songYear:s.year,title:s.title,artist:s.artist,key});
      used.push(key);
    }
    return picks;
  });
  assert.equal(simulation.length,50);
  assert.equal(new Set(simulation.map(x=>x.key)).size,50,'50-song simulation must have no song duplicates');
  for(const p of simulation)assert.equal(p.songYear,p.year,'selected song year must equal card year');
  const normalizedArtist=s=>String(s).split(/\s+(?:feat\.?|ft\.?|featuring|with)\s+/i)[0].trim().toLowerCase();
  const counts=new Map();
  for(const p of simulation){const artist=normalizedArtist(p.artist);counts.set(artist,(counts.get(artist)||0)+1)}
  const consecutive=simulation.filter((p,i)=>i&&normalizedArtist(p.artist)===normalizedArtist(simulation[i-1].artist)).length;
  result.selection={sample:50,range:'1970–2019',distinctSongs:50,distinctArtists:counts.size,hoodooGurus:counts.get('hoodoo gurus')||0,consecutiveSameArtist:consecutive};
  console.log('PRODUCTION SELECTION',JSON.stringify(result.selection));

  await page.locator('[data-play="virtual"]').click();
  await page.locator('[data-victory="unlimited"]').click();
  // Isolate actual catalogue/gameplay from external playback service availability.
  await page.evaluate(()=>{
    window.GSYEngine.resolveSong=async(song,provider)=>({
      provider:'youtube',title:song.title,artist:song.artist,
      videoId:'5qap5aO4i9A',candidateIds:['5qap5aO4i9A'],
      url:'https://www.youtube.com/watch?v=5qap5aO4i9A',
      matchPolicy:'title-artist-v1',song
    });
  });
  await page.locator('[data-action="start-game"]').click();
  await page.locator('.screen-ready [data-action="broken-song"]').waitFor({timeout:35000});
  const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('gsy.match.v7')));
  assert.equal(before.phase,'ready');
  assert.ok(before.current?.song?.title&&before.current?.song?.artist);
  const heading=await page.locator('#mainContent').innerText();
  assert.ok(!heading.includes(before.current.song.title),'hidden answer must not leak before reveal');
  await page.locator('[data-action="broken-song"]').click();
  await page.locator('.screen-skipped [data-action="next-skipped"]').waitFor({timeout:10000});
  const skipped=await page.evaluate(()=>JSON.parse(localStorage.getItem('gsy.match.v7')));
  assert.equal(skipped.phase,'skipped');
  assert.equal(skipped.skipReason,'broken');
  assert.equal(skipped.teams[0].bonusPoints,2,'free broken-song skip must not cost a bonus');
  assert.ok(await page.locator('#mainContent').innerText().then(x=>x.includes(before.current.song.title)),'skipped track answer must be shown');
  assert.ok(skipped.used.includes(before.current.song.songId),'skipped song must enter no-repeat history');
  await page.locator('[data-action="next-skipped"]').click();
  await page.locator('.screen-ready [data-action="broken-song"]').waitFor({timeout:35000});
  const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('gsy.match.v7')));
  assert.notEqual(after.current.song.songId,before.current.song.songId);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('[data-action="resume"]').waitFor({timeout:35000});
  await page.locator('[data-action="resume"]').click();
  await page.locator('.screen-ready [data-action="broken-song"]').waitFor({timeout:35000});
  const resumed=await page.evaluate(()=>JSON.parse(localStorage.getItem('gsy.match.v7')));
  assert.equal(resumed.current.song.songId,after.current.song.songId);
  result.mobile.gameFlow='virtual start → ready → free skip/reveal → next → reload/resume';
  console.log('PRODUCTION MOBILE FLOW',result.mobile.gameFlow);
  await context.close();

  const desk=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
  const desktop=await desk.newPage();
  desktop.on('pageerror',error=>result.errors.push('desktop JS: '+error.message));
  await desktop.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
  await desktop.locator('[data-mode-picker]').waitFor({state:'visible',timeout:35000});
  await desktop.locator('[data-mode-picker]').selectOption('australian');
  assert.match(await desktop.locator('.mode-detail').innerText(),/253 songs/);
  result.desktop={setup:true,australianSongs:253,documentWidth:await desktop.evaluate(()=>document.documentElement.scrollWidth),viewportWidth:1280};
  assert.ok(result.desktop.documentWidth<=1280,'desktop setup must not overflow horizontally');
  await desk.close();
  console.log('PRODUCTION DESKTOP',JSON.stringify(result.desktop));

  // Best-effort real service path: a genuine YouTube catalogue resolution from
  // the authorised deployed origin, no provider IDs or response bodies forged.
  const providerContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const providerPage=await providerContext.newPage();
  try{
    await providerPage.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
    await providerPage.locator('[data-mode-picker]').waitFor({state:'visible',timeout:35000});
    await providerPage.locator('[data-play="virtual"]').click();
    await providerPage.locator('[data-action="start-game"]').click();
    await providerPage.locator('.screen-ready, .screen-error').first().waitFor({timeout:45000});
    const state=await providerPage.locator('#mainContent').getAttribute('class');
    if(state.includes('screen-ready')){
      result.providerProbe.status='song_resolved';
      await providerPage.locator('[data-action="play-current"]').click();
      await providerPage.waitForTimeout(7500);
      const fallback=providerPage.locator('[data-action="yt-start"]');
      if(await fallback.isVisible().catch(()=>false)){
        await fallback.click();
        await providerPage.waitForTimeout(3000);
      }
      const playback=await providerPage.evaluate(()=>{
        const p=window.GSYEngine.youtubePlayer?.();
        return {playerState:p?.getPlayerState?.()??null,playerReady:!!p,
          pageClass:document.querySelector('#mainContent')?.className||'',iframeCount:document.querySelectorAll('#youtubePlayer iframe').length};
      });
      result.providerProbe.playback=playback;
      if(playback.playerState===1)result.providerProbe.status='youtube_reports_playing';
      else result.providerProbe.status='youtube_playback_unconfirmed';
      result.providerProbe.note='Headless YouTube player state, not confirmation of correct audible audio or Spotify';
    }else{
      const message=await providerPage.locator('.error-code').innerText().catch(()=>null);
      result.providerProbe.status='provider_error';
      result.providerProbe.errorCode=message;
    }
  }catch(error){result.providerProbe.status='network_or_timeout';result.providerProbe.message=String(error).slice(0,550)}
  await providerContext.close();
  console.log('PRODUCTION PROVIDER PROBE',JSON.stringify(result.providerProbe));
  assert.equal(result.errors.length,0,'browser JavaScript exceptions');
  result.passed=true;
}
try{await run()}
catch(error){result.passed=false;result.errors.push(String(error.stack||error));console.error('SMOKE ERROR:',error)}
finally{
  if(browser)await browser.close();
  await fs.writeFile('live-smoke-results.json',JSON.stringify(result,null,2)+'\n');
  console.log('LIVE SMOKE SUMMARY',JSON.stringify(result));
  if(!result.passed)process.exitCode=1;
}