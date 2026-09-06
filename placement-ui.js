(() => {
  'use strict';

  function lockCopy(label=''){
    const clean=String(label||'').trim();
    if(!clean)return 'Lock Placement';
    return `Lock ${clean.charAt(0).toLowerCase()}${clean.slice(1)}`;
  }

  function enhance(root){
    if(!root)return;
    const main=root.querySelector('main.screen-playing, main.screen-guess');
    if(!main)return;

    const active=main.querySelector('.team-timeline.active-team');
    const slots=active ? [...active.querySelectorAll('.timeline-slot')] : [];
    if(!active||!slots.length)return;

    active.classList.add('placement-timeline');
    const selected=active.querySelector('.timeline-slot.on');
    active.classList.toggle('has-placement',!!selected);

    for(const slot of slots){
      const label=slot.getAttribute('aria-label')||'Placement position';
      slot.dataset.placementLabel=label;
      slot.title=label;
    }

    const instruction=main.querySelector('.turn-toolbar p');
    if(instruction&&instruction.textContent.includes('Choose a +')){
      instruction.textContent='Tap a gap in your timeline. Your mystery song will appear there.';
    }

    const lock=main.querySelector('[data-action="lock-placement"]');
    if(lock){
      const label=selected?.dataset.placementLabel||selected?.getAttribute('aria-label')||'';
      const copy=lockCopy(label);
      if(lock.textContent!==copy)lock.textContent=copy;
      lock.setAttribute('aria-label',label?`Lock placement ${label.toLowerCase()}`:'Lock placement');
    }
  }

  const global=typeof window!=='undefined'?window:globalThis;
  global.GSYPlacementUI={lockCopy,enhance};

  if(typeof document==='undefined'||typeof MutationObserver==='undefined')return;
  const root=document.getElementById('app');
  if(!root)return;

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    queueMicrotask(()=>{queued=false;enhance(root)});
  };
  new MutationObserver(schedule).observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['class','aria-pressed','disabled']});
  enhance(root);
})();
