# Neoperro preview panel

The existing Fosternya Vercel project serves the landing page and `/dashboard`. Discord sign-in is deliberately absent. Each browser receives an isolated anonymous workspace, not account-wide administrator access. One cloud profile is available per session, with a settings-only backup in browser localStorage. Signing out revokes the runtime token and clears the session cookie; the backup remains on the device.

Use the existing key/table followed by `loadstring(game:HttpGet("https://fosternya.xyz/loader.lua"))()`. The public loader remains byte-for-byte unchanged. Open Runtime connection in the dashboard, generate a private connection snippet and run it in that already loaded client. Save a configuration to deliver it. The connector polls every three seconds and acknowledges successful `ApplyConfig`; the dashboard polls status every ten seconds while visible. Saved, delivered, applied and rejected revisions are distinct. No arbitrary executable source is accepted by the API.

The snippet is a scoped bearer capability for this workspace; keep it private. It is held in browser memory while displayed, then in the game connector closure. It is not a FlowAuth key. Re-pairing, logout or the absolute 12-hour expiry revokes access. A stopped/replaced connector does not apply a response that arrives late. Revocation cannot retract settings already received or applied.

License identity is unlinked. Account-wide executions, key expiry and FlowAuth key statistics are intentionally unavailable without an authenticated identity. The overview counts connections to this workspace and aggregates connected time by game/day. It does not claim these are provider execution totals. No user IDs, usernames, raw game IDs, IP event history or private script keys are stored by the application. Short-lived keyed request counters are process memory only. Vercel/FlowAuth retain their own platform/security records; this app cannot promise those services keep no logs.

Runtime settings and scoped token hashes are stored in a private Vercel Blob store. A daily authenticated cron deletes expired workspace objects. One browser's local settings backup is not synchronized across devices and is not cleared by logout. There is no cross-device identity until a future authentication phase.

## Deployment

Project: `project-tgctb`, repository `kasztingers11-lang/jewmod`, existing Vercel/Namecheap domain unchanged. Node 24, pinned `@vercel/blob` dependency and pnpm lockfile. Public output remains `public/`; API handlers live outside it. Root legacy homepage files remain preserved in Git.

Server-only environment names: `BLOB_READ_WRITE_TOKEN`, `NEOPERRO_SESSION_SECRET`, `NEOPERRO_ORIGIN`, `CRON_SECRET`. Never commit their values. The private store and signing/cron secrets were configured through the authorized Vercel connection. Preview deployments use their own host as the signing audience; production uses `https://www.fosternya.xyz`. No account FlowAuth token is configured on this site.

## Validation

Run `node --test tests/panel.test.mjs`, `python tests/connector.py` with Lupa available and `python tests/loader_bridge.py`. Generate schema from the public authoritative defaults with `scripts/generate-schema.py`. The connector compiles with Luau and passes REAL's static checker. Offline connector tests are not Roblox compatibility proof.

The local development server `node scripts/dev.mjs` uses in-memory disposable data and an HTTP-only development cookie on loopback. Production has no memory-store fallback or authentication bypass to private account data. Page layouts are checked at mobile, HD, 2K and 4K CSS viewports; this is not a guarantee of every physical display or refresh rate.

## Security boundaries

Production sessions use Secure/HttpOnly/SameSite=Strict host-only cookies and a non-sliding 12-hour server deadline. Writes require an exact allowed Origin and a session-bound CSRF value. All object/revision access derives from the verified capability, never a user-supplied storage path. Full settings validation rejects unknown fields and non-finite values; payloads are capped at 64KB. Blob ETag conditions prevent silent concurrent overwrites. Errors returned to clients are bounded and do not include infrastructure credentials.

The site uses a restrictive CSP with no inline scripts/styles, frame denial, no-referrer, no-store API/Lua responses and restricted browser permissions. Vercel's active custom rule limits `/api/panel` to 120 requests per minute per IP. Loader endpoints are outside the rule. Process-local API budgets are defense in depth, not a distributed bot defense. Distributed abuse, shared-network false positives and cost limits still need monitoring and review before a public launch.

Production storage integration exposed a concrete version-token issue: compressed large private responses returned weak HTTP ETags (36 characters) while storage metadata returned strong ETags (34 characters). Those weak tags caused conditional updates to fail after the first profile save. A disposable private-store probe reproduced compression (`br`), rejected conditional writes and successful strong-tag writes. Private record reads now request `Accept-Encoding: identity`, retaining the strong version without disabling conditional-write protection. A targeted regression covers subsequent pairing/acknowledgment writes and stale-update rejection. `tests/deployed-panel.py` exercises the complete production HTTP path with disposable data and deletes that test workspace on completion; it is a simulated client, not a native Roblox test.

RSA does not conceal files delivered to a browser. Client assets and this public Git repository remain readable; no protected runtime source or credentials are served by the website. TLS, server-side authorization and private storage enforce the actual boundary. Comment removal is a presentation requirement, not a security control. No claim of invulnerability, guaranteed 144FPS or universal bot resistance is made.

Primary references: [Vercel private Blob](https://vercel.com/docs/vercel-blob/private-storage), [Vercel Firewall](https://vercel.com/docs/vercel-firewall), [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

## 2026-10-30 interface and production verification

Replaced native short-choice menus with button groups and long-choice menus with a keyboard-operated listbox. Checked part selection with ArrowDown/Enter, prediction Auto dependencies, saving and restoring defaults. Switched surfaces to neutral black/gray and red accents, round switches, consistent SVG icons, larger settings-group headings and smaller leaf labels. Removed the visible session timer and activity-log footer copy; absolute server expiry is unchanged. Landing uses lowercase Highcrest with the original eye artwork, corrected cropping and no overflowing uppercase wordmark. Expanded the feature descriptions without hit-rate or refresh-rate promises.

Landing and configuration layouts have no horizontal overflow at 320, 390, 1920, 2560 and 3840 CSS pixels. No JavaScript animation render loop was added. Deployed code remains comment-free. Nine backend/security tests, 36 loader cases and the connector mock pass. The original loader's SHA-256 remains 785a84c6a7c78e7880bbe437b1376ef57ae711e3e47de70d012c6b22f75352d3.

Storage fix merged in PR18 / 30981c350a0c1d341788cc0e6c7f1d5a1ed8f1f0. The real production HTTP test passed private Blob saving, pairing, delivery, acknowledgment, revocation and logout; disposable test data was removed. This used a simulated client and does not prove native Roblox compatibility or frame rate.

## 2026-10-30 simplified wording and update notes

Replaced technical landing copy with short feature descriptions and Edit / Link / Apply setup steps. Removed numbered section labels, tag lists, decorative arrows, hero preview metadata and footer branding. Visible configuration labels now read Config; /dashboard#config works while old #configuration links remain accepted. Removed provider branding from UI and exported key placeholder; the underlying working loader/auth integration is unchanged.

Body text now uses the device-native Segoe UI/system font stack; Highcrest remains for the logo. The Live version button opens an accessible native dialog with the current v1.3.38 entry (Inputs / Tracers / Fixes) and a separate website entry (Design / Config / Updates). Escape closes it and returns focus to the opener. Landing widths 320/390/1920/3840 and the 390px dialog fit without horizontal overflow. Existing API/security and loader checks pass. No new gameplay release is implied by a website changelog entry.

## 2026-10-30 visual pass before identity setup

Owner explicitly chose: Visuals first; login next. No Discord OAuth app exists yet. This pass does not claim Discord-only access, license validation or automatic key-to-account linking.

Removed header eyes/dot, sidebar preview note, excess navigation/metric/decorative icons and the setup section. Version button now reads Version: 1.3.38; release notes are three short plain bullet points and no website entry. The intro uses intrinsic text width plus a font-ink-height frame; its group center matches the full viewport, including scrollbar allowance. Original eye artwork is styled redder with a CSS filter; no new raster asset was generated. Hero lettering shares the font-aware frame. Account display renders verified user fields if supplied; otherwise says Not signed in rather than fabricating a Discord identity. Profile images are restricted to Discord CDN paths, with no referrer; CSP allows that image host only. End session clears the server session and returns home. Local browser verified that navigation after logout completes; mobile and desktop layouts have no horizontal overflow.

Next identity phase: create Discord OAuth app and configure Client ID plus server-only Client Secret; protect dashboard API operations with verified identity; claim/validate owned license and map it to that identity; persistent per-account config; scoped automatic runtime pairing. Add Web connect and Web configs as top table settings only with their implemented lifecycle, not inert switches. Runtime status/history (time/user/device), owner-only encrypted key reveal/copy and license stats, plus Panel actions (get script/key/reset HWID), remain for that phase. Provider lookup/claim/reset policy was read without mutations. Current project 6147 is the one matching the deployed loader. Persisted buyer keys cannot be retrieved from its account API; an owner-facing key vault would need the user's submitted key encrypted at rest. Do not fabricate old link counts, HWIDs or account histories. No new telemetry logging added in this visual pass.
