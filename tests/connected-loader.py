from pathlib import Path
from lupa.lua54 import LuaRuntime

source=(Path(__file__).resolve().parents[1]/'public/loader.lua').read_text(encoding='utf-8')
fixture='''
env={neoperro={['Web connect']=true,['Web configs']=true},__neoperroPanelToken=string.rep('x',100)}
function getgenv()return env end
script_key='synthetic-fixture-key'
jobs={};auths=0;fetches=0;connections=0;warnings=0;applies=0;stops=0
task={defer=function(fn)jobs[#jobs+1]=fn end}
warn=function()warnings=warnings+1 end
function runtime()
 return{Alive=true,Version='2.0.0-rc.14',Distribution='FlowAuth',ApplyConfig=function()applies=applies+1 end}
end
game={HttpGet=function(_,url)
 if url:find('flowauth.net',1,true)then return '__provider' end
 assert(url=='https://www.fosternya.xyz/connect.lua');fetches=fetches+1
 if duringFetch then duringFetch()end
 return '__connector'
end}
loadstring=function(text)
 if text=='__provider'then return function(key)auths=auths+1;assert(key=='synthetic-fixture-key');if deny then error('synthetic refusal')end;env.__neoperroRuntimeV1=runtime()end end
 if text=='__connector'then return function()
  assert(env.__neoperroPanelToken==string.rep('x',100));env.__neoperroPanelToken=nil;connections=connections+1
  env.__neoperroPanelBridge={Alive=true,Stop=function(self)self.Alive=false;stops=stops+1 end}
 end end
 error('Unexpected fixture source')
end
function pump()local work=jobs;jobs={};for _,fn in ipairs(work)do fn()end end
'''
def create():
    lua=LuaRuntime();lua.execute(fixture);return lua

for warm in [False,True]:
    lua=create()
    if warm:lua.execute('env.__neoperroRuntimeV1=runtime()')
    lua.execute(source)
    assert lua.globals().fetches==0 and lua.globals().connections==0
    assert lua.globals().auths==(0 if warm else 1)
    assert lua.globals().env['__neoperroPanelToken'] is None
    lua.execute('pump()');assert lua.globals().connections==1 and lua.globals().fetches==1
    lua.execute(source);lua.execute('pump()')
    assert lua.globals().connections==1 and lua.globals().fetches==1 and lua.globals().warnings==0
    lua.execute('env.neoperro["Web connect"]=false');lua.execute(source)
    assert lua.globals().stops==1 and not lua.globals().env['__neoperroPanelBridge']['Alive']

lua=create();lua.execute('deny=true')
try:lua.execute(source);raise AssertionError('Provider refusal must fail')
except Exception as error:assert 'synthetic refusal' in str(error)
assert len(lua.globals().jobs)==0 and lua.globals().connections==0

lua=create();lua.execute(source);lua.execute('env.neoperro["Web connect"]=false');lua.execute(source);lua.execute('pump()')
assert lua.globals().connections==0 and lua.globals().fetches==0

lua=create();lua.execute(source)
lua.globals().duringFetch=lua.eval('function()env.__neoperroPanelLaunch={};env.neoperro["Web connect"]=false end')
lua.execute('pump()');assert lua.globals().connections==0 and lua.globals().env['__neoperroPanelToken'] is None

lua=create();lua.execute('env.__neoperroPanelToken=nil');lua.execute(source);lua.execute('pump()')
assert lua.globals().fetches==0 and lua.globals().warnings==1
print('PASS: cold/warm connected launch is deferred, does not skip provider auth, reuses an active bridge, stops on opt-out, and rejects stale or unauthorized connection work.')
print('Offline Lua mock only; native executor networking and Roblox compatibility still require a live test.')

lua=create();lua.execute('''
env.__neoperroPanelToken=nil
bootstrap=0
game.GetService=function()return {
 JSONEncode=function(_,v)assert(v.key=='synthetic-fixture-key');return 'private-body' end,
 JSONDecode=function()return{token=string.rep('x',100)}end
}end
request=function(options)
 assert(options.Url=='https://www.fosternya.xyz/api/panel?action=runtime-connect')
 assert(options.Body=='private-body');assert(not options.Headers.Authorization)
 bootstrap=bootstrap+1;return{StatusCode=200,Body='fixture-json'}
end
''')
lua.execute(source);lua.execute('pump()')
assert lua.globals().bootstrap==1 and lua.globals().connections==1
lua.execute(source);lua.execute('pump()')
assert lua.globals().bootstrap==1 and lua.globals().connections==1
print('PASS: license bootstrap occurs once after authorized cold load; warm config updates reuse the bridge.')

lua=create()
lua.execute('''
env.neoperro['Web connect']=nil
env.neoperro['Web configs']=false
local original=runtime
function runtime()
 local active=original()
 active.PanelAlwaysConnect=true
 function active:RefreshPanel()
  assert(env.__neoperroPanelToken==string.rep('x',100))
  env.__neoperroPanelToken=nil
  connections=connections+1
  return {Alive=true}
 end
 return active
end
''')
lua.execute(source);lua.execute('pump()')
assert lua.globals().auths==1 and lua.globals().connections==1 and lua.globals().fetches==0
assert lua.globals().env.neoperro['Web configs'] is False
print('PASS: RC14 connects using its built-in bridge while incoming settings stay paused.')
