# neoperro V2-test

Fosternya landing page and Discord-authenticated settings dashboard. This is a test website release; the uploaded Lua runtime remains 1.3.40-rc.2. Production is the existing project-tgctb Vercel project, repository kasztingers11-lang/jewmod.

## Use

1. Open https://www.fosternya.xyz/dashboard and sign in with Discord. Only identify is requested.
2. Link your personal license once. Its Discord claim is permanent; eligible HWID resets use the provider's 24-hour policy.
3. Enable Web connect in your local table. Enable Web configs separately if saved settings should apply.
4. Execute the complete key and table followed by `loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()`.
5. The loader authorizes the runtime, checks the linked license with the website and starts a scoped connector. No connection snippet is needed. Connected and applied messages appear in the client console; no workspace file is created.

Keep the website session active. It expires 12 hours after sign-in; sign in again and rerun the loader to reconnect. Revoke connection blocks reconnection until Get script & enable connection is selected. Ending the session revokes access and returns home. An existing local settings backup remains on the device.

## Boundaries

The key is sent once over HTTPS to the same website's runtime-connect endpoint, then looked up server-side with the licensing provider. It is never placed in a URL or console output. Account API secrets remain server-only. The account record holds an authenticated encrypted key and the current workspace pointer. The connector uses a scoped token to fetch validated data, not executable source. Key possession is a credential: this path does not independently attest a HWID or prevent a compromised executor from reading its own memory.

The panel keeps one current config and latest connection state. There is no new activity timeline, location collection or workspace-file logging. Vercel, Discord and the licensing provider process their own infrastructure/security data. Public assets and the loader are readable; source secrecy is not an access control.

Gun-profile values are editable through the schema. Arbitrary Lua callback functions cannot be represented or executed through JSON and remain local-script only. Legacy setting names and weapon dimension arrays migrate to the current schema. Unsupported settings are rejected visibly rather than silently stripped.

## Development

Node 24, pnpm 10.28.2. `node scripts/dev.mjs` provides an isolated in-memory preview. `node tests/browser-fixture.mjs` provides synthetic Discord and license flows on port 4174; it has no external provider calls and is never deployed as an API handler.

Run `node --test tests/*.test.mjs`, `python tests/connector.py`, `python tests/connected-loader.py` and `python tests/loader_bridge.py` (Python tests require Lupa). The schema generator reads public runtime defaults from the sibling mysite checkout. No private customer table belongs in this repository.

See docs/PANEL.md for the V2-test verification record. Tests and simulated clients do not prove live executor compatibility or guarantee a frame rate.
