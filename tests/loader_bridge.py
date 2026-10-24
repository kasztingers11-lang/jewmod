from pathlib import Path
import json,subprocess
from lupa.lua54 import LuaRuntime

root=Path(__file__).resolve().parent.parent
bridge=(root/'public/loader.lua').read_text(encoding='utf-8')
version='1.3.19'
flow='https://flowauth.net/v1/loaders/56265b6f33860b070090db29d343e59a.lua'
site='https://fosternya.xyz/loader.lua'
config=json.loads((root/'vercel.json').read_text(encoding='utf-8'))
assert config['outputDirectory']=='public' and config['buildCommand']=='' and config['framework'] is None
assert {p.name for p in (root/'public').iterdir()}=={'index.html','Highcrest.ttf','loader.lua','robots.txt'}
assert (root/'public/Highcrest.ttf').read_bytes()==(root/'Highcrest.ttf').read_bytes()
assert (root/'index.html').read_bytes()==subprocess.check_output(['git','-C',str(root),'show','18ee4d498694499d3523f34a552c030279c47126:index.html'])
headers={h['key']:h['value'] for item in config['headers'] if item['source']=='/loader.lua' for h in item['headers']}
assert headers['Content-Type']=='text/plain; charset=utf-8' and headers['Cache-Control']=='no-store'
assert 'script_key =' not in bridge.split('local environment')[0]

# No real HTTP calls or keys. The provider stub still requires a separate auth call.
lua=LuaRuntime()
check=lua.eval('''function(client,bridge,scenario,warmRequests)
    local calls,applies,auths,warnings=0,0,0,0
    local fixtureKey='synthetic-test-fixture'
    local environment={neoperro={marker='edited-table'},script_key=fixtureKey,type=type,assert=assert,error=error,
        warn=function()warnings=warnings+1 end}
    environment.getgenv=function()return environment end
    environment.game={HttpGet=function(_,url)
        calls=calls+1
        if url=='https://fosternya.xyz/loader.lua' then
            return scenario=='bad-site' and '<html>not Lua</html>' or bridge
        end
        assert(url=='https://flowauth.net/v1/loaders/56265b6f33860b070090db29d343e59a.lua')
        return scenario=='bad-provider' and '<html>not Lua</html>' or '__provider'
    end}
    local function makeRuntime(v,distribution)
        return {Alive=true,Version=v,Distribution=distribution,ApplyConfig=function(self,value)
            assert(value.marker=='edited-table','Table must reach existing runtime unchanged')
            applies=applies+1
            if scenario=='invalid-config' then error('synthetic config failure') end
        end}
    end
    environment.loadstring=function(source,name)
        if source=='__provider' then return function(key)
            assert(key==fixtureKey,'Auth receives only the supplied local key')
            auths=auths+1
            if scenario=='denied' then error('synthetic auth rejection') end
            environment.__neoperroRuntimeV1=makeRuntime(scenario=='old-provider' and '1.3.17' or '1.3.19','FlowAuth')
            return environment.__neoperroRuntimeV1
        end end
        return load(source,name,'t',environment)
    end
    if scenario=='warm' or scenario=='invalid-config' then environment.__neoperroRuntimeV1=makeRuntime('1.3.19','FlowAuth')
    elseif scenario=='stopped' then environment.__neoperroRuntimeV1=makeRuntime('1.3.19','FlowAuth');environment.__neoperroRuntimeV1.Alive=false
    elseif scenario=='old' then environment.__neoperroRuntimeV1=makeRuntime('1.3.17','FlowAuth')
    elseif scenario=='development' then environment.__neoperroRuntimeV1=makeRuntime('1.3.19','Development')
    elseif scenario=='missing-table' then environment.neoperro=nil
    elseif scenario=='missing-key' then environment.script_key=nil end
    local program=assert(load(client,'client','t',environment))
    local ok=pcall(program)
    if scenario=='warm' then
        assert(ok and calls==warmRequests and auths==0 and applies==1 and environment.script_key==nil)
    elseif scenario=='invalid-config' then
        assert(not ok and calls==warmRequests and auths==0 and applies==1)
    elseif scenario=='bad-site' or scenario=='missing-table' or scenario=='missing-key' then
        assert(not ok and calls==1 and auths==0)
    elseif scenario=='bad-provider' then assert(not ok and calls==2 and auths==0)
    elseif scenario=='denied' then assert(not ok and calls==2 and auths==1)
    else
        assert(ok and calls==2 and auths==1)
        if scenario=='old-provider' then assert(warnings==1) end
    end
    return true
end''')
scenarios=['cold','warm','stopped','old','development','bad-site','bad-provider','missing-table','missing-key','invalid-config','denied','old-provider']
for path in ['examples/one-line.lua','examples/multiline.lua','examples/site-loader.lua']:
    client=(root/path).read_text(encoding='utf-8')
    assert site in client
    if path != 'examples/site-loader.lua':assert version in client
    if path.endswith('one-line.lua'):assert len(client.splitlines())==1
    for scenario in scenarios:assert check(client,bridge,scenario,1 if path=='examples/site-loader.lua' else 0)
print('PASS: 36 bridge/client cases; exact site line skips warm reauth; optional client fast path skips all warm requests.')
print('PASS: only intended public assets deploy; original root index.html preserved; Lua/content headers verified.')
print('No Roblox, real FlowAuth auth, credentials or live deployment used by these tests.')
