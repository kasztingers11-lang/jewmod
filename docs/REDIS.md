# Production Redis storage - 3 November 2026

Production now uses the connected Upstash Redis resource through server-only KV_REST_API_URL and KV_REST_API_TOKEN. SDK telemetry is disabled, HTTPS endpoints are restricted to Upstash, requests have bounded timeouts/retries, and private keys use a separate neoperro:store-v1 namespace. Never expose the write token or read-only token to public code.

The owner authorized a fresh web workspace after Blob reached its simple-operation quota. Old Blob files and its credentials remain preserved; this release does not enumerate or delete them. Existing configs, web-only restrictions and owner announcements were not imported. Customers sign in and re-link their license. FlowAuth still verifies project, active status, claimed Discord identity and HWID policy. Its permanent claims/blacklists were not reset. Do not merge old records over newer Redis records without explicit revision/ownership review when Blob becomes accessible.

Redis scripts perform etag CAS and retry-safe mutations atomically. Session/OAuth and pending-pairing records expire with Redis TTL. Saved profiles and completed encrypted license associations persist. A short delete tombstone prevents concurrent OAuth consumption while allowing the same network operation to retry. No expiry is extended by a retry.

The old purge endpoint remains authenticated but no longer touches the preserved archive; Redis handles active expiry. Existing Vercel firewall/rate rules and all identity/license/CSRF checks remain in place. Preview/Development were not connected to the Production database. If Redis is configured but fails, requests fail closed; they do not silently switch stores or create anonymous sessions.

Validation: node --test tests/*.test.mjs. tests/redis-lua.py additionally executes the exact scripts under Lua 5.1 with a deterministic Redis-command model; it is not a network test and requires Lupa. Production checks must separately verify the real Redis path and user sign-in.

Free Redis has its own command allowance. The existing client polling cadence is not an unlimited-service guarantee. No paid plan, billing change or firewall disable was made.
