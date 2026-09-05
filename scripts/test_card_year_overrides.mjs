import assert from 'node:assert/strict';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const values=new Map();
globalThis.localStorage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,String(value)),
  removeItem:key=>values.delete(key)
};
globalThis.window={};

const policyUrl=pathToFileURL(path.resolve('app-policy.js')).href;
const engineUrl=pathToFileURL(path.resolve('engine.js')).href;
await import(`${policyUrl}?test=${Date.now()}`);
await import(`${engineUrl}?test=${Date.now()}`);

let E=window.GSYEngine;
assert.equal(E.baseCardYear(1),1976);
assert.deepEqual(E.cardYearReference(1),{cardId:1,baseYear:1976,year:1976,overridden:false});

let saved=E.setCardYearReference(1,1975);
assert.deepEqual(saved,{cardId:1,baseYear:1976,year:1975,overridden:true});
assert.equal(E.cardYear(1),1975);
assert.deepEqual(JSON.parse(values.get('gsy.cardYearOverrides.v1')),{1:1975});

await import(`${engineUrl}?reload=${Date.now()}`);
E=window.GSYEngine;
assert.equal(E.cardYear(1),1975,'override must survive an engine reload');

E.setCardYearReference(2,1986);
saved=E.setCardYearReference(1,1976);
assert.deepEqual(saved,{cardId:1,baseYear:1976,year:1976,overridden:false});
assert.equal(E.cardYear(1),1976);
assert.equal(E.cardYear(2),1986,'resetting one card must preserve other overrides');
assert.deepEqual(JSON.parse(values.get('gsy.cardYearOverrides.v1')),{2:1986});

assert.throws(
  ()=>E.setCardYearReference(0,1975),
  error=>error?.code==='INVALID_CARD_ID'
);
assert.throws(
  ()=>E.setCardYearReference(1,'75'),
  error=>error?.code==='INVALID_CARD_YEAR'
);
assert.throws(
  ()=>E.setCardYearReference(1,window.GSYAppPolicy.CARD_YEAR_MAX+1),
  error=>error?.code==='INVALID_CARD_YEAR'
);

values.set('gsy.cardYearOverrides.v1','{malformed');
await import(`${engineUrl}?malformed=${Date.now()}`);
E=window.GSYEngine;
assert.equal(E.cardYear(1),1976,'malformed stored data must fall back safely');

console.log('card year override regression tests passed');
