# NEOPERRO / Fosternya

Black landing page with the existing Highcrest wordmark and cat-eye entrance, plus a responsive configuration dashboard at https://www.fosternya.xyz/dashboard. Hosted in the existing Vercel project, with the original root homepage assets preserved outside deployed public output.

This is an anonymous test workspace, without Discord login. Each browser has an isolated 12-hour session and one saved configuration. Private storage, signed host-only cookies, CSRF/Origin checks, schema validation and optimistic revision checks are implemented. It does not expose FlowAuth administrator controls or account-wide keys/statistics.

## Using the dashboard

1. Enter the dashboard. No Discord account is required.
2. Edit and save a configuration. JSON import/backup and Lua export are available. Lua exports contain a key placeholder, never a real key.
3. Load Neoperro in the game using your existing private script_key, table and loader.
4. In Runtime connection, generate the private snippet and execute it in that already loaded client.
5. Save changes and watch the separate saved, delivered and applied revisions. Polling delivery normally takes a few seconds. A rejected or disconnected client is shown explicitly.

The connection transfers settings and aggregate connected time. It does not read or transmit your FlowAuth key. Generating a replacement connection, ending the session or reaching the absolute 12-hour expiry revokes access. The settings-only device backup remains in localStorage after logout. Expired cloud workspaces are removed by the daily authenticated cron.

License status and key-specific execution data stay unavailable until a later identity-verification phase. Overview activity counts paired connections and aggregated time for this workspace, not provider execution totals. No fabricated chart data or synthetic connected status is shown.

## Existing loader

Runtime expected: **1.3.38**. Keep your private key and configuration table above this exact line:

```lua
loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()
```

The loader file is unchanged by the dashboard work. Cold load: executor -> Fosternya bridge -> FlowAuth -> protected runtime. A matching alive authenticated runtime reuses ApplyConfig. Other/stopped/older runtimes use the normal authenticated path. The optional examples/one-line.lua and examples/multiline.lua avoid both HTTP requests for matching warm updates. Do not retain two competing loaders in the same client script.

The website never hosts the protected runtime or account API credentials. `/loader.lua` and `/connect.lua` are necessarily public raw Lua text. RSA or hiding filenames cannot keep browser-delivered assets secret. The GitHub repository is public; server authorization and private storage, not source secrecy, enforce access.

## Development and checks

Node 24 and pnpm 10.28.2. Install with `pnpm install --frozen-lockfile --ignore-scripts`, run `node scripts/dev.mjs` and open the printed loopback address. The development server uses disposable in-memory workspaces and never reads production storage.

- `node --test tests/panel.test.mjs`: expiry, isolation, CSRF, malformed settings, concurrent revisions, delivery, acknowledgment and revocation.
- `python tests/connector.py` with Lupa: bounded offline connector behavior. Not live Roblox proof.
- `python tests/loader_bridge.py` with Lupa: 36 loader scenarios, public inventory and response-header configuration.
- `python scripts/generate-schema.py` with Lupa: regenerate from public authoritative defaults, not a private user table.

Vercel deploys static assets only from `public/`, plus Node API handlers from `api/`. Root Directory remains this repository root; Framework is Other. Keep private tokens only in Vercel server environment variables. Their names, without values, appear in .env.example. See [panel architecture, privacy and security boundaries](docs/PANEL.md).
