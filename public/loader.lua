local environment = getgenv()
local connectionKey = ...
if type(connectionKey) ~= 'string' then connectionKey = script_key or environment.script_key end
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
    if type(previous) == 'table' and previous.Alive and not pendingConnection
        and (previous.Status ~= 'reconnecting' or type(connectionKey) ~= 'string') then
        connectionKey = nil
        return
    end
    local token = pendingConnection
    pendingConnection = nil
    task.defer(function()
        local problem = 'Could not start the dashboard connector. Run the key and loader again.'
        local ok = pcall(function()
            if environment.__neoperroPanelLaunch ~= launch then return end
            if type(token) ~= 'string' or #token <= 80 or #token >= 400 then
                local send
                for _, candidate in pairs({request, http_request, type(http) == 'table' and http.request,
                    type(syn) == 'table' and syn.request, type(fluxus) == 'table' and fluxus.request}) do
                    if type(candidate) == 'function' then send = candidate; break end
                end
                problem = 'Automatic pairing needs executor HTTP request support and your linked script key.'
                assert(type(send) == 'function' and type(connectionKey) == 'string')
                local http = game:GetService('HttpService')
                local body = http:JSONEncode({key = connectionKey})
                connectionKey = nil
                problem = 'The automatic pairing request failed. Check your connection and rerun the loader.'
                local reply = send({Url = 'https://www.fosternya.xyz/api/panel?action=runtime-connect', Method = 'POST',
                    Headers = {['Content-Type'] = 'application/json'}, Body = body})
                body = nil
                local status = type(reply) == 'table' and tonumber(reply.StatusCode or reply.Status or reply.status_code or reply.status)
                if status and status % 1 == 0 and status >= 100 and status <= 599 then
                    problem = 'Automatic pairing failed (HTTP ' .. status .. '). Sign in with the Discord account linked to this key and rerun the loader.'
                    if status == 429 then problem = 'Automatic pairing is rate limited. Wait one minute and rerun the loader.' end
                end
                assert(status == 200)
                local responseBody = reply.Body or reply.body
                assert(type(responseBody) == 'string' and #responseBody < 2048)
                local data = http:JSONDecode(responseBody)
                token = data.token
                assert(type(token) == 'string' and #token > 80 and #token < 400)
            end
            if environment.__neoperroPanelLaunch ~= launch then return end
            problem = 'Could not start the dashboard connector. Run the key and loader again.'
            if builtInPanel and environment.__neoperroRuntimeV1 == runtime and runtime.Alive then
                environment.__neoperroPanelToken = token
                local started, bridge = pcall(runtime.RefreshPanel, runtime)
                if started and type(bridge) == 'table' and bridge.Alive then return end
            end
            local source = game:HttpGet('https://www.fosternya.xyz/connect.lua')
            if environment.__neoperroPanelLaunch ~= launch then return end
            local active = environment.__neoperroRuntimeV1
            if active ~= runtime or type(active) ~= 'table' or not active.Alive then return end
            local connector = loadstring(source, '@neoperro-panel')
            assert(type(connector) == 'function')
            environment.__neoperroPanelToken = token
            connector()
        end)
        if environment.__neoperroPanelToken == token then environment.__neoperroPanelToken = nil end
        token = nil
        connectionKey = nil
        if not ok and environment.__neoperroPanelLaunch == launch then warn('[neoperro] ' .. problem) end
    end)
end
local expectedVersion = '2.0.0-rc.15'
local runtime = environment.__neoperroRuntimeV1
if type(runtime) == 'table' and runtime.Alive and runtime.Version == expectedVersion
    and runtime.Distribution == 'FlowAuth' and type(runtime.ApplyConfig) == 'function' then
    script_key = nil
    local result = runtime:ApplyConfig(environment.neoperro)
    connectPanel()
    return result
end

assert(type(environment.neoperro) == 'table', '[neoperro] Put your table above the loader.')
assert(type(connectionKey) == 'string' and #connectionKey > 0, '[neoperro] Put your private script_key above the loader.')
local source = game:HttpGet('https://flowauth.net/v1/loaders/56265b6f33860b070090db29d343e59a.lua')
local program = loadstring(source, '@neoperro-flowauth')
assert(type(program) == 'function', '[neoperro] FlowAuth did not return a Lua loader.')
source = nil
local result = program(connectionKey)
local loaded = environment.__neoperroRuntimeV1
if type(loaded) == 'table' and loaded.Alive and loaded.Version ~= expectedVersion then
    warn('[neoperro] Your provider is serving a different runtime version. Expected ' .. expectedVersion .. '.')
end
connectPanel()
return result
