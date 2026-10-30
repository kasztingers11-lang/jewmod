local environment = getgenv()
local token = environment.__neoperroPanelToken
environment.__neoperroPanelToken = nil
assert(type(token) == 'string' and #token > 80 and #token < 400, '[neoperro] Generate a connection snippet in your dashboard.')
local requestFunction = request or http_request
assert(type(requestFunction) == 'function', '[neoperro] This connection requires HTTP request support.')
local runtime = environment.__neoperroRuntimeV1
assert(type(runtime) == 'table' and runtime.Alive and type(runtime.ApplyConfig) == 'function', '[neoperro] Load your existing key, table and loader first.')
local previous = environment.__neoperroPanelBridge
if type(previous) == 'table' and type(previous.Stop) == 'function' then previous:Stop() end
local bridge = {Alive = true, AppliedRevision = 0, RejectedRevision = 0, ErrorCode = nil, Status = 'connecting'}
function bridge:Stop()
    self.Alive = false
    self.Status = 'stopped'
end
environment.__neoperroPanelBridge = bridge
local http = game:GetService('HttpService')
task.spawn(function()
    local failures = 0
    while bridge.Alive and environment.__neoperroPanelBridge == bridge do
        local active = environment.__neoperroRuntimeV1
        if type(active) ~= 'table' or not active.Alive then bridge:Stop(); break end
        local responseOK, response = pcall(requestFunction, {
            Url = 'https://www.fosternya.xyz/api/panel?action=runtime',
            Method = 'POST',
            Headers = {['Content-Type'] = 'application/json', Authorization = 'Bearer ' .. token},
            Body = http:JSONEncode({version = active.Version,
                appliedRevision = bridge.AppliedRevision, rejectedRevision = bridge.RejectedRevision,
                errorCode = bridge.ErrorCode}),
        })
        if not bridge.Alive or environment.__neoperroPanelBridge ~= bridge then break end
        local status = responseOK and type(response) == 'table' and (response.StatusCode or response.Status) or 0
        if status == 401 or status == 403 or status == 410 then bridge:Stop(); break end
        local decodedOK, data = false, nil
        if status == 200 and type(response.Body) == 'string' and #response.Body < 65536 then
            decodedOK, data = pcall(function() return http:JSONDecode(response.Body) end)
        end
        if decodedOK and type(data) == 'table' and type(data.revision) == 'number'
            and data.revision >= 0 and data.revision % 1 == 0 then
            failures = 0
            bridge.Status = 'connected'
            if type(data.config) == 'table' and data.revision > bridge.AppliedRevision
                and data.revision ~= bridge.RejectedRevision then
                local current = environment.__neoperroRuntimeV1
                if type(current) == 'table' and current.Alive and type(current.ApplyConfig) == 'function' then
                    local applied = pcall(function() current:ApplyConfig(data.config) end)
                    if applied then bridge.AppliedRevision, bridge.ErrorCode = data.revision, nil
                    else bridge.RejectedRevision, bridge.ErrorCode = data.revision, 'apply-failed' end
                else bridge.RejectedRevision, bridge.ErrorCode = data.revision, 'runtime-unavailable' end
            end
        else
            failures = failures + 1
            bridge.Status = 'reconnecting'
        end
        task.wait(math.min(30, 3 * 2 ^ math.min(failures, 3)))
    end
    token = nil
end)
return bridge
