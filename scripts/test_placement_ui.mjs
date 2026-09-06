import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../placement-ui.js',import.meta.url),'utf8');
const context=vm.createContext({window:{},globalThis:{},console});
vm.runInContext(source,context,{filename:'placement-ui.js'});

const ui=context.window.GSYPlacementUI;
assert.ok(ui,'placement UI helper should be exported');
assert.equal(ui.lockCopy('Before 1998'),'Lock before 1998');
assert.equal(ui.lockCopy('Between 1998 and 2003'),'Lock between 1998 and 2003');
assert.equal(ui.lockCopy('After 2010'),'Lock after 2010');
assert.equal(ui.lockCopy(''),'Lock Placement');

console.log('Virtual placement UI copy regression tests passed');
