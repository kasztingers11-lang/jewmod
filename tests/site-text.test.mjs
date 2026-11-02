import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
const root=new URL('../public/',import.meta.url);
test('published text contains neither encoding corruption nor truncated tool output',()=>{
  for(const name of readdirSync(root).filter(x=>/\.(html|mjs|css)$/.test(x))){
    const text=readFileSync(new URL(name,root),'utf8');
    assert.ok(!/\u00e2\u20ac|\u00e2\u2020|\u00c2\u00b7|\u00c3\u2014|\ufffd|tokens truncated/.test(text),name);
  }
});
