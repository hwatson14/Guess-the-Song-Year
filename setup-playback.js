(() => {
  'use strict';

  const root=document.getElementById('app');
  const E=window.GSYEngine;
  if(!root||!E)return;

  let scheduled=false,pickerOpen=false,deviceSeq=0;
  let cachedDevices=[],cachedAt=0,devicePromise=null;
  const DEVICE_CACHE_MS=15000;

  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
  const setText=(el,value)=>{if(el&&el.textContent!==String(value??''))el.textContent=String(value??'')};

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;syncSetupPlayback()});
  }

  function panelMarkup(){
    return `<div class="option-head"><h3>Playback</h3><span data-setup-playback-status></span></div>
      <div class="service-grid setup-service-grid" role="group" aria-label="Music service">
        <button type="button" class="service" data-setup-provider-choice="spotify"><strong>Spotify</strong><small>Premium · hidden playback</small></button>
        <button type="button" class="service" data-setup-provider-choice="youtube"><strong>YouTube</strong><small>No login · browser playback</small></button>
      </div>
      <div class="setup-device" data-setup-device>
        <div class="setup-device-top">
          <div class="setup-device-copy">
            <span class="setup-device-label">Playback device</span>
            <strong data-setup-device-name>Checking…</strong>
            <small data-setup-device-meta></small>
          </div>
          <button type="button" class="btn ghost setup-device-change" data-setup-device-change>Change</button>
        </div>
        <div class="setup-device-picker" data-setup-device-picker hidden>
          <select data-setup-device-select aria-label="Spotify playback device"></select>
          <button type="button" class="btn ghost" data-setup-device-refresh>Refresh devices</button>
          <small data-setup-device-help>Open Spotify on the target device and play/pause once if it is missing.</small>
        </div>
      </div>`;
  }

  function installPanel(setup){
    let panel=setup.querySelector('[data-setup-playback]');
    if(panel)return panel;
    panel=document.createElement('section');
    panel.className='card option-card setup-playback-card';
    panel.setAttribute('data-setup-playback','');
    panel.innerHTML=panelMarkup();
    const firstCard=setup.querySelector('.option-card');
    setup.insertBefore(panel,firstCard||null);
    bindPanel(panel);
    return panel;
  }

  function bindPanel(panel){
    panel.querySelectorAll('[data-setup-provider-choice]').forEach(button=>{
      button.addEventListener('click',()=>{
        pickerOpen=false;
        const provider=button.dataset.setupProviderChoice;
        const proxy=root.querySelector(`#musicModal [data-provider="${provider}"]`);
        if(proxy)proxy.click();
        else if(provider==='youtube'||provider==='spotify'){E.setProvider(provider);schedule()}
      });
    });
    panel.querySelector('[data-setup-device-change]')?.addEventListener('click',()=>{
      if(E.getProvider()!=='spotify')return;
      if(!E.isSpotifyConnected()){
        const connect=root.querySelector('#musicModal [data-action="connect-spotify"]');
        if(connect)connect.click();
        else E.spotifyConnect();
        return;
      }
      pickerOpen=!pickerOpen;
      renderDevice(panel,cachedDevices);
      if(pickerOpen)refreshDeviceView(panel,false);
    });
    panel.querySelector('[data-setup-device-refresh]')?.addEventListener('click',()=>refreshDeviceView(panel,true));
    panel.querySelector('[data-setup-device-select]')?.addEventListener('change',event=>{
      E.setSpotifyDevice(event.currentTarget.value);
      pickerOpen=false;
      syncPickerVisibility(panel);
      renderDevice(panel,cachedDevices);
    });
  }

  function syncProvider(panel){
    const provider=E.getProvider();
    panel.querySelectorAll('[data-setup-provider-choice]').forEach(button=>{
      const on=button.dataset.setupProviderChoice===provider;
      button.classList.toggle('on',on);
      button.setAttribute('aria-pressed',on?'true':'false');
    });
    const status=panel.querySelector('[data-setup-playback-status]');
    setText(status,provider==='spotify'?(E.isSpotifyConnected()?'Spotify connected':'Spotify sign-in required'):'Plays on this device');
  }

  function syncPickerVisibility(panel){
    const picker=panel.querySelector('[data-setup-device-picker]');
    if(picker)picker.hidden=!pickerOpen||E.getProvider()!=='spotify'||!E.isSpotifyConnected();
  }

  function effectiveDevice(devices){
    const selected=E.getSpotifyDevice();
    return devices.find(device=>device.id===selected)||devices.find(device=>device.is_active)||devices[0]||null;
  }

  function renderDevice(panel,devices=[]){
    const provider=E.getProvider(),connected=E.isSpotifyConnected();
    const name=panel.querySelector('[data-setup-device-name]');
    const meta=panel.querySelector('[data-setup-device-meta]');
    const change=panel.querySelector('[data-setup-device-change]');
    const select=panel.querySelector('[data-setup-device-select]');
    const help=panel.querySelector('[data-setup-device-help]');
    if(!name||!meta||!change||!select)return;

    if(provider!=='spotify'){
      setText(name,'This device');
      setText(meta,'YouTube plays in this browser');
      change.hidden=true;
      pickerOpen=false;
      syncPickerVisibility(panel);
      return;
    }

    change.hidden=false;
    if(!connected){
      setText(name,'Not connected');
      setText(meta,'Connect Spotify to choose a playback device');
      setText(change,'Connect');
      pickerOpen=false;
      syncPickerVisibility(panel);
      return;
    }

    setText(change,pickerOpen?'Done':'Change');
    const selected=E.getSpotifyDevice();
    const device=effectiveDevice(devices);
    if(device){
      setText(name,device.name||'Spotify device');
      setText(meta,`${selected?'Selected':'Automatic'}${device.type?` · ${device.type}`:''}`);
    }else{
      setText(name,'No Spotify device found');
      setText(meta,'Open Spotify on the target device and play/pause once');
    }

    const options=[`<option value="" ${selected?'':'selected'}>Automatic (active Spotify device)</option>`];
    for(const item of devices){
      options.push(`<option value="${esc(item.id)}" ${selected===item.id?'selected':''}>${esc(item.name||'Spotify device')}${item.type?` · ${esc(item.type)}`:''}${item.is_active?' · active':''}</option>`);
    }
    const html=options.join('');
    if(select.innerHTML!==html)select.innerHTML=html;
    setText(help,devices.length?'Choose Automatic to follow Spotify’s active device.':'Open Spotify on the target device and play/pause once, then refresh.');
    syncPickerVisibility(panel);
  }

  async function loadDevices(force=false){
    if(!E.isSpotifyConnected())return [];
    if(!force&&cachedAt&&Date.now()-cachedAt<DEVICE_CACHE_MS)return cachedDevices;
    if(devicePromise)return devicePromise;
    const request=E.spotifyDevices().then(devices=>{
      cachedDevices=Array.isArray(devices)?devices:[];
      cachedAt=Date.now();
      return cachedDevices;
    }).finally(()=>{devicePromise=null});
    devicePromise=request;
    return request;
  }

  async function refreshDeviceView(panel,force=false){
    const seq=++deviceSeq;
    if(E.getProvider()!=='spotify'||!E.isSpotifyConnected()){renderDevice(panel,[]);return}
    if(!cachedAt){
      const name=panel.querySelector('[data-setup-device-name]');
      const meta=panel.querySelector('[data-setup-device-meta]');
      setText(name,'Checking Spotify…');
      setText(meta,'Finding available playback devices');
    }
    try{
      const devices=await loadDevices(force);
      if(seq!==deviceSeq||!panel.isConnected)return;
      renderDevice(panel,devices);
    }catch(error){
      if(seq!==deviceSeq||!panel.isConnected)return;
      const name=panel.querySelector('[data-setup-device-name]');
      const meta=panel.querySelector('[data-setup-device-meta]');
      setText(name,'Device check failed');
      setText(meta,error?.message||'Open Spotify and try Refresh devices');
      syncPickerVisibility(panel);
    }
  }

  function syncSetupPlayback(){
    const setup=root.querySelector('.screen-setup .setup-grid');
    if(!setup)return;
    const panel=installPanel(setup);
    syncProvider(panel);
    syncPickerVisibility(panel);
    if(E.getProvider()==='spotify'&&E.isSpotifyConnected())refreshDeviceView(panel,false);
    else renderDevice(panel,[]);
  }

  const observer=new MutationObserver(schedule);
  observer.observe(root,{childList:true,subtree:true});
  schedule();
})();
