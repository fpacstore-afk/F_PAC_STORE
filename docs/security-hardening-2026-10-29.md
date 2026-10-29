# Security hardening — 2026-10-29

## Changes

- Email allowlists require a verified Firebase identity in the API, Firestore/Storage rules and existing management UI shortcuts. Server-issued `admin`/`role` claims remain available. User profile privilege fields remain protected.
- Cancellation and return endpoints use the same identity predicate. Internal API keys use constant-time comparison. The Sheets credential is restricted to the exact sync route.
- Updated compatible dependency versions and patched transitive gRPC/basic-ftp dependencies without downgrading Firebase or changing framework major versions. `npm run security:audit` checks the production dependency tree in PR and deployment workflows.
- Reject compressed JSON/raw artwork bodies, apply a cheap API entry limit before parsing, and return safe parser errors with the appropriate HTTP status.
- Payment creation and lead ingestion have transactional Firestore request budgets shared across instances, in addition to process-local route limits. Counters store a hash and expiry, never the raw IP. Existing artwork and telemetry quotas are preserved.
- Print previews use a same-origin script instead of inline scripts/onclick, preserving the manual 10×15 label action and image/font readiness for production tickets.
- Production CSP restricts executable scripts to the app and required Firebase/Mercado Pago sources. Headers are consistent in Express, Firebase Hosting and Cloudflare assets. Inline event handlers in the entry HTML were removed.
- Redact authorization strings, credential query parameters and sensitive object fields from logs; handle cyclic objects safely.
- Add privacy and purchase-condition pages, links in the footer and checkout, and keyboard/focus handling for the returns dialog. Preserve separate optional choices for analytics and recovery messages.

## Runtime availability follow-up

The authenticated deployment reported 1 CPU, 3 GiB memory, 0–13 instances and concurrency 1000 with only a TCP startup probe. The deployment now sets concurrency 80, an HTTP startup probe (up to 100 seconds) and HTTP liveness every 30 seconds (three failures). `/healthz` is a constant, uncached process-health response before body parsing, CORS and customer rate limits; it does not test Firestore or payment dependencies. This avoids a quota/database incident causing a restart loop. The candidate is checked through `/healthz` before promotion. CPU, memory and instance-count settings are preserved.

## Runtime verification and remaining configuration

1. Verify normal Google management sign-in with the existing verified administrative account. An unverified email alone must not grant privileges. Server-defined `ADMIN_EMAILS` customizations apply to the API; custom administrators should use server-issued claims so API and rules agree.
2. Token revocation checks are available through `ADMIN_CHECK_REVOKED=true`. Enable only after the Cloud Run runtime identity is confirmed to have `firebaseauth.users.get`. The flag defaults off to avoid locking out existing accounts under unknown runtime IAM; signature, expiry and admin authorization are always checked. MFA is configured at the identity provider, not by setting this flag.
3. Configure Firestore TTL on the `expiresAt` field of collection group `request_limits`, in database `ai-studio-a7d50f8c-9b01-4490-9a13-dd8892e0c41a`. Expired buckets do not grant or deny requests in later windows; TTL performs eventual storage cleanup. Existing ingestion/artwork quota collections also need their retention configuration reviewed separately. TTL is not assumed enabled by this source change.
4. Validate the effective client IP through Cloudflare, Firebase Hosting and Cloud Run before changing proxy trust. Do not trust an arbitrary caller-supplied forwarding header. No Redis subscription or infrastructure-cost increase is introduced here.
5. The deployment records selected runtime capacity/probe settings without printing environment variables or secrets. Confirm actual min/max instances, concurrency and health probes using these results. Keep database readiness separate from process liveness.
6. Confirm backups/restore, alerting, key restrictions and IAM in the authenticated cloud console. Source changes do not certify those account settings.
7. Supply confirmed legal name, registration/document and public commercial address to complete supplier identification. Only the existing brand, city and business contact channels are published. No home address, invented registration or unverified corporate data is inserted.
8. Production dependency audit is the release gate. Moderate advisories remaining only in the Firebase deployment tool chain require a compatible upstream tool update; a forced SDK/tool downgrade is not used.

## Validation

`npm run test:security-hardening` exercises unverified-email denial, preserved verified/claim access, protected cancellation/returns, a concurrent budget across independent limiter instances, safe error handling for malformed/compressed/oversized bodies and log redaction. The emulator suite adds unverified-email denial and claim access checks for both Firestore and Storage. Run `npm run test:all`, `npm run lint`, `npm run build`, `npm run verify:security-rules` (Java 21+) and `npm run security:audit` before release. All fixtures must remain isolated; never use production records for these tests.
