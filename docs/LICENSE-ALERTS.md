# License-change alerts

FlowAuth sends signed events to /api/flowauth-alerts. The endpoint subscribes to script.executed, key.hwid_reset and auth.failed; refused runs are ignored except hwid_mismatch. No Roblox runtime change is required.

The first successful event for each numeric license ID establishes a silent baseline. Future events send a Discord embed only when HWID fingerprint, normalized IP address, country or executor changes. HWID resets are always logged. A repeated mismatch attempt is suppressed for 24 hours per combination and does not replace the successful baseline. Missing fields do not clear known values. Older events cannot roll current values back.

License and user IDs are spoilers. Each available field shows a check when unchanged or a cross with old → new when changed. Missing data is labelled, and carried-forward values are marked last observed. Event timestamps are UTC. No keys, API credentials, raw HWIDs, mentions or raw webhook payloads are forwarded. HWIDs use stable keyed fingerprints.

## Server configuration

Production needs DISCORD_SECURITY_WEBHOOK_URL, FLOWAUTH_WEBHOOK_SECRET (32–512 random characters), FLOWAUTH_API_KEY, the existing private Redis variables and NEOPERRO_ORIGIN. They belong only in Vercel secrets, never in the Lua table, browser or public repository. The Discord URL must use https://discord.com/api/webhooks/.

The administrative /api/flowauth-alert-setup endpoint accepts signed POST JSON with exactly one action: configure, test or status. X-Neoperro-Setup-Timestamp is Unix milliseconds; X-Neoperro-Setup-Signature is sha256= plus HMAC-SHA256(timestamp + '.' + raw body) using FLOWAUTH_WEBHOOK_SECRET. Configure creates one project-6147 webhook at the fixed receiver URL. Existing registration is reused. An ambiguous API outcome is deliberately not retried automatically: inspect FlowAuth before creating anything else. Test asks FlowAuth to send its real webhook.test delivery, which records receipt without producing a Discord activity message.

Incoming events require the documented X-FlowAuth headers and HMAC on exact raw bytes within five minutes. Parsing is disabled in the Vercel adapter. Project IDs and event/header agreement are checked. Bodies are limited to 32 KiB. Invalid signatures receive 401; temporary delivery errors receive 503 so the provider can retry. The receiver supports delivery-ID and content deduplication, per-license atomic writes and a leased persistent outbox. Discord failures retain the pending alert. A crash after Discord accepts a message but before acknowledgement can still duplicate it on retry; the same event fingerprint appears in the footer. This is not an exactly-once delivery guarantee.

Comparison state and deduplication expire after 30 days of inactivity through Redis TTL. The setup registration persists. Discord messages follow the channel’s own retention and access rules. Only the fixed private channel receives alerts, with mentions disabled. Country lookup runs locally using the pinned geoip-country database, with IPv4 and IPv6 support. No external service receives an IP for geolocation. GeoLite2 data is created by MaxMind (https://www.maxmind.com); database and upstream licences remain in the dependency. Keep the package current when updating deployments. Approximate location is not proof of license sharing.

Provider contract: https://flowauth.net/docs/webhooks and https://flowauth.net/docs/api (checked 11 November 2026).
