# Fosternya raw Lua bridge

The website serves a tiny public bridge at https://fosternya.xyz/loader.lua.
FlowAuth continues to authenticate keys and supply the protected runtime.
Runtime expected by this bridge: **1.3.18**.

## Execution

Keep your private script_key and edited getgenv()['neoperro'] table above the loader.
Replace the OLD execution block with examples/one-line.lua (one physical line), or
its readable equivalent examples/multiline.lua. Do not leave both loaders in place.

Cold load: executor -> Fosternya raw loader.lua -> FlowAuth public loader -> protected runtime.
Matching alive runtime: the recommended one-line checks it locally and calls
ApplyConfig; zero website/FlowAuth requests. Key/edited table stay on the client.
Stopped/older/different-distribution runtime: use the normal authenticated path.
The one-line contains the same warm check as the multiline equivalent.

The shorter form also works:

```lua
loadstring(game:HttpGet('https://fosternya.xyz/loader.lua'))()
```

That shorter form still requests Fosternya on EVERY execution; only its inner
FlowAuth request is skipped when the runtime matches. The recommended one-line
avoids both requests on table-only updates. First load still has two HTTP stages;
a custom domain does not remove FlowAuth latency or guarantee zero startup hitch.

## Vercel / Namecheap

Vercel deploys ONLY public/ using vercel.json. No build command/dependencies are
needed. Keep the Vercel project's Root Directory at this repository root and
Framework Preset Other. The output directory is public. If your domain is already
connected to this Vercel project, no Namecheap DNS change is needed for these files.

There is deliberately no public/index.html. The homepage and unknown routes should
return Vercel 404 after deployment. The existing root index.html, images, font and
music are preserved in Git, outside the deployed output. They are not a private
admin panel. If the GitHub repository is public, its source is still readable there.

loader.lua must return raw text, not an HTML page, a redirect to a login screen or
a deployment-protection challenge. The headers set text/plain and no-store.
No catch-all SPA rewrite routes requests to HTML. The root homepage stays hidden;
the Lua endpoint itself is necessarily public/retrievable. robots/noindex are
indexing preferences, not access control. There is no assistant-only access claim.

## FlowAuth setup

Publish the supplied neoperro-flowauth-upload.obfuscated.lua into the existing
FlowAuth script first. That protected file stays OUTSIDE this repository/public/.
Require keys and keep keyless disabled. This site has no key form, secret token,
customer-key storage, analytics, auth proxy or key in a URL. It does not bypass
FlowAuth. Never put a real customer key, API secret or protected runtime here.

When updating neoperro, synchronize the version in public/loader.lua and both
examples with the version published to FlowAuth. The bridge warns if FlowAuth
returns an older/different running runtime. The starter only updates matching
running versions; it does not silently treat older source as a new release.

## Verification

Run python tests/loader_bridge.py with Lupa's Lua 5.4 backend available. It executes
both client snippets and the real bridge against local network/compiler stubs,
covering cold/first, warm, stopped/old/different distribution, invalid responses
and configuration errors. No real key, Roblox or FlowAuth auth is used.

After Vercel deployment, verify / returns 404 and /loader.lua returns 200 with
text/plain and this bridge's source. Native executor compatibility, first-load
latency and actual FlowAuth authorization still require the user's live test.

Official Vercel references:
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/project-configuration/vercel-json
