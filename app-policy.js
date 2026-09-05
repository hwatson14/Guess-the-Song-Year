(() => {
  'use strict';

  const NESTED_SCREENS=Object.freeze([
    'scanner','loading','ready','countdown','youtube','playing','guess','reveal','error'
  ]);
  const SUPPORTED_CARD_DECKS=Object.freeze({
    uk:'aaaa0005',au:'aaah0001'
  });
  const CARD_YEAR_MIN=1900,CARD_YEAR_MAX=new Date().getFullYear();
  const GAME_YEAR_MIN=1950,GAME_YEAR_MAX=2022;

  const TRACK_ERROR_CODES=new Set([
    'SPOTIFY_TRACK_NOT_FOUND','YOUTUBE_VIDEO_NOT_FOUND','YOUTUBE_PLAY_FAILED'
  ]);
  const CATALOGUE_ERROR_CODES=new Set([
    'NO_SONG','NO_UNUSED_SONG','MODE_YEAR_UNAVAILABLE','CATALOGUE_UNAVAILABLE','CATALOGUE_INVALID'
  ]);

  function parseCardId(raw){
    const value=String(raw??'').trim();
    if(/^\d{1,5}$/.test(value)){const id=Number(value);return id>=1&&id<=308?id:null}
    let url;try{url=new URL(value)}catch{return null}
    const host=url.hostname.toLowerCase();
    if(url.protocol!=='https:'||url.username||url.password||url.port||!['hitstergame.com','www.hitstergame.com'].includes(host))return null;
    const parts=url.pathname.split('/').filter(Boolean).map(part=>part.toLowerCase());
    if(parts.length!==3)return null;
    const [locale,sku,card]=parts;
    if(SUPPORTED_CARD_DECKS[locale]!==sku||!/^\d{5}$/.test(card))return null;
    const id=Number(card);
    return id>=1&&id<=308?id:null;
  }

  function normalizeCardYear(raw,{min=CARD_YEAR_MIN,max=CARD_YEAR_MAX}={}){
    const value=String(raw??'').trim();
    if(!/^\d{4}$/.test(value))return null;
    const year=Number(value);
    return year>=min&&year<=max?year:null;
  }
  function normalizeYearRange(min,max){
    let lo=Number(min),hi=Number(max);
    if(!Number.isInteger(lo))lo=GAME_YEAR_MIN;if(!Number.isInteger(hi))hi=GAME_YEAR_MAX;
    lo=Math.max(GAME_YEAR_MIN,Math.min(GAME_YEAR_MAX,lo));hi=Math.max(GAME_YEAR_MIN,Math.min(GAME_YEAR_MAX,hi));
    return lo<=hi?{minYear:lo,maxYear:hi}:{minYear:hi,maxYear:lo};
  }
  const yearInRange=(year,range)=>{const r=normalizeYearRange(range?.minYear,range?.maxYear);return Number(year)>=r.minYear&&Number(year)<=r.maxYear};
  function rangeStats(report,min,max){
    const r=normalizeYearRange(min,max), years=(report?.years||[]).map(Number).filter(y=>y>=r.minYear&&y<=r.maxYear);
    const keys=report?.yearSongKeys||{};let songs=0;for(const y of years)songs+=(keys[y]||keys[String(y)]||[]).length;
    return {minYear:r.minYear,maxYear:r.maxYear,years,songs};
  }

  function canRetryPreparationError(code){
    return !['NO_SONG','NO_UNUSED_SONG','MODE_YEAR_UNAVAILABLE','CATALOGUE_INVALID'].includes(String(code||''));
  }

  function preparationErrorKind(code){
    const value=String(code||'');
    if(TRACK_ERROR_CODES.has(value))return 'track';
    if(CATALOGUE_ERROR_CODES.has(value))return 'catalogue';
    return 'provider';
  }

  function shouldInterceptBack({musicModal=false,screen=''}={}){
    return !!musicModal||NESTED_SCREENS.includes(String(screen));
  }

  function placementIsCorrect(years,slot,year){
    const ordered=[...(years||[])].map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    const position=Number(slot),answer=Number(year);
    if(!Number.isInteger(position)||position<0||position>ordered.length||!Number.isFinite(answer))return false;
    const left=position>0?ordered[position-1]:null;
    const right=position<ordered.length?ordered[position]:null;
    return (left===null||left<=answer)&&(right===null||answer<=right);
  }

  window.GSYAppPolicy={NESTED_SCREENS,SUPPORTED_CARD_DECKS,CARD_YEAR_MIN,CARD_YEAR_MAX,GAME_YEAR_MIN,GAME_YEAR_MAX,parseCardId,normalizeCardYear,normalizeYearRange,yearInRange,rangeStats,canRetryPreparationError,preparationErrorKind,shouldInterceptBack,placementIsCorrect};
})();
