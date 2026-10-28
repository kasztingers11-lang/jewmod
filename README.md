# Fosternya raw Lua bridge

The website serves a tiny public bridge at https://fosternya.xyz/loader.lua.
FlowAuth continues to authenticate keys and supply the protected runtime.
Runtime expected by this branch: **1.3.34**. The owner confirmed publishing v1.3.34 to FlowAuth; this bridge enables same-version configuration reuse. FlowAuth remains the provider.

## Execution

Keep your private script_key and edited getgenv()['neoperro'] table above the loader.
Replace the OLD execution block with examples/site-loader.lua, shown below.
Do not leave both loaders in place.

Cold load: executor -> Fosternya raw loader.lua -> FlowAuth public loader -> protected runtime.
Matching alive runtime: the website bridge calls ApplyConfig and skips FlowAuth.
Key/edited table stay on the client.
Stopped/older/different-distribution runtime: use the normal authenticated path.
Use this exact line under the table:

```lua
loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()
```

This form still requests Fosternya on EVERY execution; its inner FlowAuth request
is skipped when the runtime matches. Optional examples/one-line.lua and its readable
equivalent examples/multiline.lua move the warm check onto the client and avoid
both requests on table-only updates. First load still has two HTTP stages;
a custom domain does not remove FlowAuth latency or guarantee zero startup hitch.

## Vercel / Namecheap

Vercel deploys ONLY public/ using vercel.json. No build command/dependencies are
needed. Keep the Vercel project's Root Directory at this repository root and
Framework Preset Other. The output directory is public. If your domain is already
connected to this Vercel project, no Namecheap DNS change is needed for these files.

public/index.html shows only the existing script cat logo and neoperro text on black.
The logo uses the script's pinned public GitHub asset; the existing Highcrest.ttf
font is copied into public/ and served locally. It has no JavaScript, audio, key form,
loader links, captions or animation. Unknown routes still return Vercel 404.
The existing root index.html, images and music are preserved in Git, outside the
deployed output. They are not a private
admin panel. If the GitHub repository is public, its source is still readable there.

loader.lua must return raw text, not an HTML page, a redirect to a login screen or
a deployment-protection challenge. The headers set text/plain and no-store.
No catch-all SPA rewrite routes requests to HTML. The landing page is public;
the Lua endpoint itself is necessarily public/retrievable. robots/noindex are
indexing preferences, not access control. There is no assistant-only access claim.

## FlowAuth setup

Publish the supplied neoperro-flowauth-upload.obfuscated.lua into the existing
FlowAuth script first. That protected file stays OUTSIDE this repository/public/.
Require keys and keep keyless disabled. This site has no key form, secret token,
customer-key storage, analytics, auth proxy or key in a URL. It does not bypass
FlowAuth. Never put a real customer key, API secret or protected runtime here.

When updating neoperro, synchronize the version in public/loader.lua and the two
optional fast-path examples with the version published to FlowAuth. The bridge warns if FlowAuth
returns an older/different running runtime. The starter only updates matching
running versions; it does not silently treat older source as a new release.

## Verification

Run python tests/loader_bridge.py with Lupa's Lua 5.4 backend available. It executes
all three client snippets and the real bridge against local network/compiler stubs,
covering cold/first, warm, stopped/old/different distribution, invalid responses
and configuration errors. No real key, Roblox or FlowAuth auth is used.

After Vercel deployment, verify / shows Neoperro and /loader.lua returns 200 with
text/plain and this bridge's source. Native executor compatibility, first-load
latency and actual FlowAuth authorization still require the user's live test.

Official Vercel references:
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/project-configuration/vercel-json
