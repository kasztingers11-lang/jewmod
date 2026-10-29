local environment = getgenv()
local runtime = environment.__neoperroRuntimeV1
if type(runtime) == 'table' and runtime.Alive and runtime.Version == '1.3.38'
    and runtime.Distribution == 'FlowAuth' and type(runtime.ApplyConfig) == 'function' then
    script_key = nil
    return runtime:ApplyConfig(environment.neoperro)
end

assert(type(environment.neoperro) == 'table', '[neoperro] Put your table above the loader.')
assert(type(script_key) == 'string' and #script_key > 0, '[neoperro] Put your private script_key above the loader.')
local source = game:HttpGet('https://flowauth.net/v1/loaders/56265b6f33860b070090db29d343e59a.lua')
local program = loadstring(source, '@neoperro-flowauth')
assert(type(program) == 'function', '[neoperro] FlowAuth did not return a Lua loader.')
source = nil
local result = program(script_key)
local loaded = environment.__neoperroRuntimeV1
if type(loaded) == 'table' and loaded.Alive and loaded.Version ~= '1.3.38' then
    warn('[neoperro] FlowAuth is serving a different runtime version. Publish the 1.3.38 upload before testing this loader.')
end
return result
