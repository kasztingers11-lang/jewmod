import json
import subprocess
from pathlib import Path
from lupa.lua51 import LuaRuntime

root=Path(__file__).resolve().parents[1]
scripts=json.loads(subprocess.check_output(['node','--input-type=module','-e',
    "import {writeScript,removeScript}from'./server/redis-store.mjs';console.log(JSON.stringify({writeScript,removeScript}));"],cwd=root,text=True))
lua=LuaRuntime(unpack_returned_tuples=True)
records={}
time=1000

def command(operation,key,*args):
    row=records.get(key)
    if row and row[1] is not None and row[1]<=time:
        records.pop(key)
        row=None
    if operation=='GET':return row[0] if row else None
    if operation=='SET':
        assert len(args) in (1,3)
        expires=time+int(args[2]) if len(args)==3 else None
        if len(args)==3:assert args[1]=='PX'
        records[key]=(args[0],expires)
        return 'OK'
    raise AssertionError(operation)

lua.globals().redis=lua.table_from({'call':command})
lua.globals().cjson=lua.table_from({'decode':lambda raw:lua.table_from(json.loads(raw),recursive=True)})
write=lua.execute('return function(KEYS,ARGV)\n'+scripts['writeScript']+'\nend')
remove=lua.execute('return function(KEYS,ARGV)\n'+scripts['removeScript']+'\nend')

def put(key,expected,etag,ttl=0):
    raw=json.dumps({'etag':etag,'data':{'revision':1}})
    return write(lua.table_from([key]),lua.table_from([expected,raw,etag,str(ttl)]))

def delete(key,expected,operation):
    return remove(lua.table_from([key]),lua.table_from([expected,operation,json.dumps({'deleted':operation})]))

assert put('session','','a',30000)==1
assert put('session','','b')==0
assert put('session','a','b',30000)==1
assert put('session','a','stale')==0
expires=records['session'][1]
time+=50
assert put('session','a','b',30000)==1 and records['session'][1]==expires
assert sum(put('session','b','race-'+str(i)) for i in range(32))==1
assert delete('session','race-0','delete-one')==1
assert delete('session','race-0','delete-two')==0
expires=records['session'][1]
time+=50
assert delete('session','race-0','delete-one')==1 and records['session'][1]==expires
assert put('session','race-0','stale')==0
time=expires+1
assert delete('session','race-0','delete-two')==0
assert put('session','','fresh',100)==1
time+=101
assert command('GET','session') is None
assert put('profile','','persistent')==1 and records['profile'][1] is None
result={'passed':True,'scope':'Actual Lua 5.1 execution of the shipped Redis scripts against a deterministic command model; not an Upstash network test',
        'cases':['NX','etag CAS','single winning concurrent expectation','idempotent write retry','single-use delete','idempotent delete retry','no retry TTL extension','automatic expiry','persistent profile']}
(root.parent/'site-review/redis-cas-validation.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
print(json.dumps(result))
