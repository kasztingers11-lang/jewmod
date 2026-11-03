# Owner area

Open `/dashboard#owner` after Discord sign-in. The Owner button is visible only when the verified Discord ID matches the server-only `NEOPERRO_OWNER_DISCORD_ID` setting. Every owner endpoint independently checks that identity; hiding a button is not the access control. An owner does not need to claim a customer license to administer the service.

The area provides:

- Plain-text announcements shown above the homepage and dashboard. Notices can expire after 1–168 hours or remain until hidden. Revision checks reject stale edits. Visible pages check every 30 seconds; a private-storage read cache lasts at most 10 seconds.
- Lookup by numeric provider license ID or a Discord user ID already linked on this site. Full license keys are never returned to the owner UI.
- Project license listing and per-license execution records only if the provider's current automation contract advertises the exact project-scoped collection endpoint. Unsupported contracts or response formats return a clear service error; no endpoint or historical data is invented.
- Device, country and executor changes derived from the available execution records. Device values are keyed fingerprints; raw HWIDs, raw IP addresses and keys are removed. Missing values do not create fabricated changes. This is a bounded window, not a complete historical audit. VPN and hardware changes are not sufficient proof of sharing.
- Commands to disconnect the recorded web client, block or restore website access, and request an eligible HWID reset under the existing 24-hour policy. Disconnect/block invalidates the current recorded runtime token. Re-linking cannot remove a website block. These commands do not unload gameplay code or revoke a provider key. Provider-wide blacklists remain in the provider dashboard until its write contract is verified.
- At most 100 owner administration records retained for up to 30 days in the view. Updates remove older rows from private storage. Rows contain operator Discord ID, time, action and license ID only. Provider execution records are read on demand and are not copied into a new site execution database.

## Verification on 3 November 2026

47 Node tests passed, including eight owner-specific access, CSRF, lifetime, redaction, contract, command and retention tests. The local browser fixture demonstrated owner navigation, notice publishing, license lookup and device/country/executor differences using synthetic data. Existing loader/connector mocks and compilation passed. Dependencies: 33 production packages; no advisories reported by the audit. Real owner sign-in and provider log schema need owner testing; the attempt to inspect Firefox stopped because Windows browser URL-policy enforcement was unavailable, and no alternate browser-control path was used.

The existing Vercel firewall is enabled and has a 120/minute per-IP panel API budget. An additional deny rule for `.git`, `.env` and `node_modules` probes was applied and verified active. A new auth rate-limit monitoring rule was rejected with HTTP 402 because the plan does not support adding rate limits. No billing, DNS, Cloudflare setup, broad bot challenges or Attack Mode was changed. Existing application sign-in throttles remain. Platform DDoS mitigation is not an immunity guarantee; no load/attack test was conducted.

Secrets remain in server environment settings, license values remain encrypted at rest, and owner JSON is not a public asset. Review found no arbitrary command execution, user-supplied fetch destinations or dynamic evaluation in the new owner paths. This is an implementation review, not an independent penetration test or a guarantee against future compromise.
