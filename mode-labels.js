(() => {
  'use strict';

  const root=document.getElementById('app');
  if(!root)return;

  let reports=null,reportsPromise=null,scheduled=false;

  function songCountLabel(value){
    const n=Math.max(0,Number(value)||0);
    return `${n.toLocaleString()} ${n===1?'song':'songs'}`;
  }

  async function getReports(){
    const E=window.GSYEngine;
    if(!E?.modeReports)return null;
    if(reports)return reports;
    if(!reportsPromise){
      reportsPromise=E.modeReports()
        .then(value=>(reports=value||{}))
        .catch(()=>null)
        .finally(()=>{reportsPromise=null});
    }
    return reportsPromise;
  }

  async function enhance(){
    scheduled=false;
    const E=window.GSYEngine,select=root.querySelector('[data-mode-picker]');
    if(!E||!select)return;
    const modeReports=await getReports();
    if(!modeReports||!select.isConnected)return;

    for(const option of select.options){
      const id=option.value,info=E.MODES?.[id],report=modeReports[id];
      if(!info||!report)continue;
      const next=`${info.name} — ${report.statusLabel} · ${songCountLabel(report.songs)} · ${report.coverageLabel}`;
      if(option.textContent!==next)option.textContent=next;
    }

    const report=modeReports[select.value],detail=root.querySelector('.mode-card .mode-detail b');
    if(report&&detail){
      const basis=report.yearBasis==='chart'?'chart year':'release year';
      const next=`${songCountLabel(report.songs)} · ${report.coverageLabel} · ${basis}`;
      if(detail.textContent!==next)detail.textContent=next;
    }
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(enhance);
  }

  new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  root.addEventListener('change',event=>{
    if(event.target?.matches?.('[data-mode-picker]'))schedule();
  });
  schedule();
})();
