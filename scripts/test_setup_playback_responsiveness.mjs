import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Model child-list mutation delivery and the browser's normalization of boolean
// attributes. Keeping the microtask queue explicit turns a UI freeze into a
// bounded test failure instead of hanging the validation process.
function make({devices=[],failure=null,pending=false}={}){
  const tasks=[],observers=[];
  let provider='spotify',selected='',connected=true,calls=0,optionWrites=0;
  let finishRequest;
  function changed(target){
    for(const observer of observers){
      let watched=target===observer.target;
      if(observer.options.subtree){
        for(let node=target.parent;node;node=node.parent)if(node===observer.target)watched=true;
      }
      if(!watched||observer.queued)continue;
      observer.queued=true;
      tasks.push(()=>{observer.queued=false;observer.callback()});
    }
  }
  class Element{
    constructor(){this.parent=null;this.dataset={};this.listeners={};this.children=new Map();this.isConnected=true;this.text='';this.html='';this.classList={toggle(){}}}
    set textContent(value){this.text=String(value);changed(this)}
    get textContent(){return this.text}
    set innerHTML(value){
      // selected is serialized as selected="" by a browser, not as the input
      // template's bare selected attribute. Rewriting it is still a mutation.
      this.html=String(value).replace(/ selected(?=[ >])/g,' selected=""');
      if(this===select)optionWrites++;
      changed(this);
    }
    get innerHTML(){return this.html}
    setAttribute(){}
    addEventListener(type,callback){this.listeners[type]=callback}
    querySelector(selector){return this.children.get(selector)||null}
    querySelectorAll(){return []}
  }
  const root=new Element(),setup=new Element(),panel=new Element(),select=new Element();
  setup.parent=root;
  const nodes={};
  for(const key of ['playback-status','device-name','device-meta','device-change','device-picker','device-refresh','device-help']){
    const node=new Element();node.parent=panel;nodes[key]=node;
    panel.children.set(`[data-setup-${key}]`,node);
  }
  select.parent=panel;panel.children.set('[data-setup-device-select]',select);
  root.children.set('.screen-setup .setup-grid',setup);
  setup.insertBefore=node=>{node.parent=setup;setup.children.set('[data-setup-playback]',node);changed(setup)};
  const E={
    getProvider:()=>provider,setProvider:value=>{provider=value},
    isSpotifyConnected:()=>connected,
    getSpotifyDevice:()=>selected,setSpotifyDevice:value=>{selected=value},
    spotifyDevices:()=>{
      calls++;
      if(pending)return new Promise(resolve=>{finishRequest=resolve});
      return failure?Promise.reject(failure):Promise.resolve(devices);
    },
  };
  class MutationObserver{
    constructor(callback){this.callback=callback;this.queued=false;observers.push(this)}
    observe(target,options){this.target=target;this.options=options}
  }
  vm.runInNewContext(fs.readFileSync('setup-playback.js','utf8'),{
    window:{GSYEngine:E},document:{getElementById:()=>root,createElement:()=>panel},
    queueMicrotask:callback=>tasks.push(callback),MutationObserver,Date,console,
  });
  async function flush(){
    for(let step=0;step<100;step++){
      const task=tasks.shift();if(task)task();
      // Settle the async device lookup and view update between deliveries.
      for(let i=0;i<8;i++)await Promise.resolve();
      if(!tasks.length)return;
    }
    assert.fail('Setup must settle instead of observing and redrawing itself indefinitely');
  }
  return {flush,nodes,select,E,root,setup,
    calls:()=>calls,optionWrites:()=>optionWrites,
    rerender:()=>changed(root),
    resolve:result=>finishRequest(result),
    disconnect:()=>{connected=false},
  };
}

const device={id:'phone',name:'Harry & Candace’s phone',type:'Smartphone',is_active:true};
for(const devices of [[],[device]]){
  const h=make({devices});await h.flush();
  assert.equal(h.calls(),1,'one lookup suffices for initial setup');
  assert.equal(h.optionWrites(),1,'initial option list is written once');
  assert.equal(h.nodes['device-name'].textContent,devices.length?device.name:'No Spotify device found');
  h.rerender();await h.flush();
  assert.equal(h.calls(),1,'app re-render uses cached discovery');
  assert.equal(h.optionWrites(),1,'equivalent options must not be rewritten after HTML normalization');
  if(devices.length){
    h.select.listeners.change({currentTarget:{value:'phone'}});await h.flush();
    assert.equal(h.E.getSpotifyDevice(),'phone','manual selection persists');
    assert.match(h.select.innerHTML,/value="phone" selected=""/);
  }
  h.E.setSpotifyDevice('');h.rerender();await h.flush();
  assert.match(h.select.innerHTML,/value="" selected=""/,'Automatic remains selectable');
}

{
  const h=make({failure:new Error('Spotify unavailable')});await h.flush();
  assert.equal(h.calls(),1,'a failed lookup must not trigger observer-driven retries');
  assert.equal(h.nodes['device-name'].textContent,'Device check failed');
  h.nodes['device-refresh'].listeners.click();await h.flush();
  assert.equal(h.calls(),2,'explicit Refresh still retries');
}

{
  const h=make({pending:true});await h.flush();
  assert.equal(h.calls(),1);assert.equal(h.nodes['device-name'].textContent,'Checking Spotify…');
  h.rerender();await h.flush();assert.equal(h.calls(),1,'slow discovery is shared across redraws');
  h.resolve([device]);await h.flush();assert.equal(h.nodes['device-name'].textContent,device.name);
  h.disconnect();h.rerender();await h.flush();
  assert.equal(h.nodes['device-name'].textContent,'Not connected');
  h.E.setProvider('youtube');h.rerender();await h.flush();
  assert.equal(h.nodes['device-name'].textContent,'This device');
}

console.log('Setup playback settles after success, failure and slow discovery; controls remain usable.');
