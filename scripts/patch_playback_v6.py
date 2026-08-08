from pathlib import Path

p=Path('app.js')
s=p.read_text()

start=s.index('  async function prepareCard(cardId){')
end=s.index('\n  async function loadQr()', start)
prepare='''  async function prepareCard(cardId){
    const year=E.cardYear(cardId);if(!year){toast('That card has no year mapping.');return nextRound()}
    screen='loading';render();
    const assignKey=`${roundDeck}:${cardId}`;
    const excluded=[...(match.used||[])];
    let lastErr=null;
    for(let attempt=0;attempt<4;attempt++){
      try{
        let song=attempt===0?match.assign[assignKey]:null;
        if(!song){song=await E.chooseSong(year,roundDeck,excluded);match.assign[assignKey]=song;saveMatch()}
        const resolved=await E.resolveSong(song,E.getProvider());
        current={cardId,year,song,resolved,provider:E.getProvider(),deck:roundDeck};
        screen='ready';render();return;
      }catch(err){
        lastErr=err;
        const failed=match.assign[assignKey];
        if(failed){const k=E.songKey(failed);if(!excluded.includes(k))excluded.push(k)}
        const retryable=['SPOTIFY_TRACK_NOT_FOUND','YOUTUBE_VIDEO_NOT_FOUND','YOUTUBE_PLAY_FAILED'].includes(err?.code);
        if(retryable){delete match.assign[assignKey];saveMatch();continue}
        break;
      }
    }
    toast(errorText(lastErr));
    if(['NO_SPOTIFY_DEVICE','SPOTIFY_NOT_CONNECTED','SPOTIFY_REAUTH'].includes(lastErr?.code)){musicModal=true;screen='setup';render();return}
    if(cfg.playMode==='physical'){setTimeout(()=>{screen='scanner';render()},1200)}else{setTimeout(nextRound,1200)}
  }
'''
s=s[:start]+prepare+s[end:]

start=s.index('  async function playCurrent(){')
end=s.index('\n  async function togglePlay()', start)
play='''  async function playCurrent(){
    if(!current||playing)return;
    screen='playing';render();
    try{
      if(current.provider==='spotify'){await E.playSpotify(current.resolved.uri);playing=true;playNeedsTap=false}
      else{const r=await E.playYouTube('youtubePlayer',current.resolved);playing=!!r.started;playNeedsTap=!!r.needsTap;if(playNeedsTap)toast('YouTube is ready. Tap the visible player to start audio.')}
    }catch(err){
      playing=false;
      if(err?.code==='YOUTUBE_PLAY_FAILED'){
        toast('That upload would not play. Swapping in another song from the same year.');
        await replaceCurrentSong();return;
      }
      toast(errorText(err));
      if(err?.code?.startsWith('SPOTIFY')){musicModal=true;render()}
    }
  }

  async function replaceCurrentSong(){
    if(!current)return;
    const {cardId,year}=current,assignKey=`${roundDeck}:${current.cardId}`;
    const excluded=[...(match.used||[]),E.songKey(current.song)];
    delete match.assign[assignKey];saveMatch();E.destroyYouTube();playing=false;
    screen='loading';render();
    let lastErr=null;
    for(let attempt=0;attempt<3;attempt++){
      try{
        const song=await E.chooseSong(year,roundDeck,excluded);
        const k=E.songKey(song);if(!excluded.includes(k))excluded.push(k);
        const resolved=await E.resolveSong(song,E.getProvider());
        match.assign[assignKey]=song;saveMatch();
        current={cardId,year,song,resolved,provider:E.getProvider(),deck:roundDeck};
        screen='ready';render();toast('A replacement track is ready.');return;
      }catch(err){lastErr=err}
    }
    toast(errorText(lastErr)||'No alternative song could be prepared.');
    if(cfg.playMode==='physical'){screen='scanner';render()}else nextRound();
  }
'''
s=s[:start]+play+s[end:]

p.write_text(s)
