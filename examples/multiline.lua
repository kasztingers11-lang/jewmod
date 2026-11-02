local source = game:HttpGet("https://fosternya.xyz/loader.lua")
local program = loadstring(source, "@neoperro-loader")
assert(type(program) == "function", "[neoperro] Loader unavailable.")
source = nil
return program()
