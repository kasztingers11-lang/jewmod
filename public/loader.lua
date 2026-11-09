local environment = getgenv()
local connectionKey = script_key
local pendingConnection = environment.__neoperroPanelToken
environment.__neoperroPanelToken = nil
local launch = {}
environment.__neoperroPanelLaunch = launch
local function connectPanel()
    local settings = environment.neoperro
    local previous = environment.__neoperroPanelBridge
    local runtime = environment.__neoperroRuntimeV1
    local builtInPanel = type(runtime) == 'table' and runtime.Alive and runtime.PanelAlwaysConnect == true
        and type(runtime.RefreshPanel) == 'function'
    if type(settings) ~= 'table' or not builtInPanel and settings['Web connect'] ~= true then
        connectionKey = nil
        pendingConnection = nil
        if type(previous) == 'table' and type(previous.Stop) == 'function' then previous:Stop() end
        return
    end
    if type(previous) == 'table' and previous.Alive and not pendingConnection then
        connectionKey = nil
        return
    end
    local token = pendingConnection
    pendingConnection = nil
    task.defer(function()
        local ok = pcall(function()
            if environment.__neoperroPanelLaunch ~= launch then return end
            if type(token) ~= 'string' or #token <= 80 or #token >= 400 then
                local send
                for _, candidate in pairs({request, http_request, type(http) == 'table' and http.request,
                    type(syn) == 'table' and syn.request, type(fluxus) == 'table' and fluxus.request}) do
                    if type(candidate) == 'function' then send = candidate; break end
                end
                assert(type(send) == 'function' and type(connectionKey) == 'string')
                local http = game:GetService('HttpService')
                local body = http:JSONEncode({key = connectionKey})
                connectionKey = nil
                local reply = send({Url = 'https://www.fosternya.xyz/api/panel?action=runtime-connect', Method = 'POST',
                    Headers = {['Content-Type'] = 'application/json'}, Body = body})
                body = nil
                assert(type(reply) == 'table' and tonumber(reply.StatusCode or reply.Status or reply.status_code) == 200)
                local responseBody = reply.Body or reply.body
                assert(type(responseBody) == 'string' and #responseBody < 2048)
                local data = http:JSONDecode(responseBody)
                token = data.token
                assert(type(token) == 'string' and #token > 80 and #token < 400)
            end
            if environment.__neoperroPanelLaunch ~= launch then return end
            if builtInPanel and environment.__neoperroRuntimeV1 == runtime and runtime.Alive then
                environment.__neoperroPanelToken = token
                assert(runtime:RefreshPanel())
                return
            end
            local source = game:HttpGet('https://www.fosternya.xyz/connect.lua')
            if environment.__neoperroPanelLaunch ~= launch then return end
            local active = environment.__neoperroRuntimeV1
            if type(active) ~= 'table' or not active.Alive then return end
            local connector = loadstring(source, '@neoperro-panel')
            assert(type(connector) == 'function')
            environment.__neoperroPanelToken = token
            connector()
        end)
        environment.__neoperroPanelToken = nil
        token = nil
        connectionKey = nil
        if not ok then warn('[neoperro] Panel unavailable. Open your dashboard, enable connection, then run the loader again. Local settings remain active.') end
    end)
end
local runtime = environment.__neoperroRuntimeV1
if type(runtime) == 'table' and runtime.Alive and runtime.Version == '2.0.0-rc.7'
    and runtime.Distribution == 'FlowAuth' and type(runtime.ApplyConfig) == 'function' then
    script_key = nil
    local result = runtime:ApplyConfig(environment.neoperro)
    connectPanel()
    return result
end

assert(type(environment.neoperro) == 'table', '[neoperro] Put your table above the loader.')
assert(type(script_key) == 'string' and #script_key > 0, '[neoperro] Put your private script_key above the loader.')
local source = game:HttpGet('https://flowauth.net/v1/loaders/56265b6f33860b070090db29d343e59a.lua')
local program = loadstring(source, '@neoperro-flowauth')
assert(type(program) == 'function', '[neoperro] FlowAuth did not return a Lua loader.')
source = nil
local result = program(script_key)
local loaded = environment.__neoperroRuntimeV1
if type(loaded) == 'table' and loaded.Alive and loaded.Version ~= '2.0.0-rc.7' then
    warn('[neoperro] Your provider is serving a different runtime version. Expected 2.0.0-rc.7.')
end
connectPanel()
return result
