-- Keep your private script_key and edited getgenv()['neoperro'] table ABOVE this block.
local environment = getgenv()
local runtime = environment.__neoperroRuntimeV1
if type(runtime) == 'table' and runtime.Alive and runtime.Version == '1.3.34'
    and runtime.Distribution == 'FlowAuth' and type(runtime.ApplyConfig) == 'function' then
    script_key = nil
    runtime:ApplyConfig(environment.neoperro)
else
    local source = game:HttpGet('https://fosternya.xyz/loader.lua')
    local program = loadstring(source, '@fosternya-loader')
    assert(type(program) == 'function', '[neoperro] Website did not return raw Lua. Check the Vercel loader deployment.')
    source = nil
    program()
end
