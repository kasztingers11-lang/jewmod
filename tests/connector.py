from pathlib import Path
from lupa.lua54 import LuaRuntime

source=(Path(__file__).resolve().parents[1]/'public/connect.lua').read_text(encoding='utf-8')
fixture='''
env={neoperro={['Web connect']=true,['Web configs']=true},__neoperroPanelToken=string.rep('x',100)}
function getgenv()return env end
tasks={};task={spawn=function(fn)tasks[#tasks+1]=coroutine.create(fn)end,wait=function(n)return coroutine.yield(n)end}
status=200;data={revision=1,config={Marker=true}};calls=0;applies=0
http={JSONEncode=function(_,v)lastBody=v;return 'json' end,JSONDecode=function()return data end}
game={PlaceId=1,GetService=function(_,name)
 if name=='HttpService'then return http end
 return{GetProductInfo=function()return{Name='Da Strike'}end}
end}
request=function(options)
 calls=calls+1
 assert(options.Url=='https://www.fosternya.xyz/api/panel?action=runtime')
 assert(options.Headers.Authorization=='Bearer '..string.rep('x',100))
 if stopDuringRequest then env.__neoperroPanelBridge:Stop()end
 return{StatusCode=status,Body='json'}
end
env.__neoperroRuntimeV1={Alive=true,Version='1.3.38',ApplyConfig=function(_,config)
 if reject then error('synthetic apply failure')end
 applies=applies+1;applied=config
end}
function pump()
 for _,co in ipairs(tasks)do if coroutine.status(co)~='dead'then local ok,err=coroutine.resume(co);assert(ok,err)end end
end
'''
lua=LuaRuntime();lua.execute(fixture);bridge=lua.execute(source);lua.execute('pump()')
assert bridge['AppliedRevision']==1 and lua.globals().applies==1
assert set(lua.globals().lastBody.keys())=={'version','appliedRevision','rejectedRevision','configEnabled'}
lua.execute('pump()');assert lua.globals().lastBody['appliedRevision']==1 and lua.globals().applies==1
lua.execute('data={revision=2,config={Marker=false}};reject=true;pump()')
assert bridge['RejectedRevision']==2 and bridge['ErrorCode']=='apply-failed'
lua.execute('pump()');assert lua.globals().applies==1
lua.execute('status=401;pump()');assert not bridge['Alive']
lua.execute('env.__neoperroPanelToken=string.rep("x",100);status=200;data={revision=3,config={Marker=true}};reject=false')
second=lua.execute(source);lua.execute('stopDuringRequest=true;pump()')
assert not second['Alive'] and lua.globals().applies==1
assert lua.globals().env['__neoperroPanelToken'] is None
paused=LuaRuntime();paused.execute(fixture);paused.execute('env.neoperro={["Web connect"]=true,["Web configs"]=false}')
third=paused.execute(source);paused.execute('pump()')
assert paused.globals().calls==1 and paused.globals().applies==0 and paused.globals().lastBody['configEnabled']==False
paused.execute('env.neoperro["Web configs"]=true;pump()');assert paused.globals().applies==1
paused.execute('env.neoperro["Web connect"]=false;pump()');assert not third['Alive'] and paused.globals().calls==2
print('PASS: connector applies once, acknowledges revisions, reports rejection, stops on revocation and ignores late stopped responses. Offline Lua mock; no Roblox/network inference.')
print('PASS: Web configs pauses/resumes delivery and Web connect off stops before another request.')

for alias in ['http_request','http.request','syn.request','fluxus.request']:
    check=LuaRuntime();check.execute(fixture)
    check.execute('savedRequest=request;request=nil;http_request=nil')
    if '.' in alias:
        obj,key=alias.split('.')
        check.execute(obj+'='+obj+' or {};'+obj+'.'+key+'=savedRequest')
    else:check.execute(alias+'=savedRequest')
    check.execute('original=savedRequest;savedRequest=function(options)local r=original(options);return{status_code=tostring(r.StatusCode),body=r.Body}end')
    check.execute(alias+'=savedRequest')
    check.execute(source);check.execute('pump()')
    assert check.globals().applies==1,alias
print('PASS: four alternative request aliases with lowercase response body and numeric-string status.')

check=LuaRuntime();check.execute(fixture)
check.execute('webApplies=0;env.__neoperroRuntimeV1.ApplyWebConfig=function(_,config)webApplies=webApplies+1;assert(config.Marker)end')
check.execute(source);check.execute('pump()')
assert check.globals().webApplies==1 and check.globals().applies==0
print('PASS: supported runtimes receive web configs through their callback-preserving method.')

check=LuaRuntime();check.execute(fixture)
check.execute('''
env.neoperro={['Web configs']=false}
local active=env.__neoperroRuntimeV1
active.PanelAlwaysConnect=true
active.GetCalibrationReport=function()return{enabled=true,follow='Mouse',samples=24}end
''')
bridge=check.execute(source);check.execute('pump()')
assert bridge['Status']=='connected' and check.globals().applies==0
assert check.globals().lastBody['calibration']['samples']==24
assert check.globals().lastBody['configEnabled']==False
print('PASS: an already loaded RC14 can pair with no Web connect key and report calibration while config delivery is off.')
