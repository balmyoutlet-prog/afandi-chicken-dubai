# Afandi Dubai administration

Only alafandichicken.com. Do not apply these changes to Afandi Lebanon or Bloom.

The website remains static; /api routes are served by the isolated afandi-dubai-api Edge Function in the existing Supabase project ncadxnjjwuklckxrkcjf. All application tables have the afandi_dubai_ prefix, row-level security enabled, and no public/anon/authenticated table privileges. Only the server-side service key can access the tables. No service keys or passwords belong in this repository, build output, client bundles, workflow logs, or localStorage.

Admin operations require a random server-validated HttpOnly Secure SameSite session. First activation requires a private one-time activation code and a password change before viewing any data. Passwords are PBKDF2-SHA256 hashes with 600,000 iterations and random salts. Provisioning the first administrator is a separate restricted owner operation; the public website does not contain a bootstrap backdoor.

The database menu is the source of truth after integration. app.js is only a startup fallback; future price, availability and product edits must use the authenticated admin API/database. A catalogue snapshot is generated from the latest production app before initial seeding. Do not overwrite admin edits with repeated seed imports.

Orders are priced on the server using versioned product records, integer fils, a server-controlled delivery fee, and idempotency keys. Opening WhatsApp is not proof of sending, acceptance, payment, or sale. Only a restaurant-marked completed order creates a sales-ledger entry; refunds reverse it once. Reporting periods use Asia/Dubai, inclusive selected days, and actual server timestamps. Pre-instrumentation history is unavailable, not zero. Visits are consented browser observations, not verified people; attribution tags do not reveal an ad platform's underlying audience.

Do not seed fake historical analytics, create live orders in automated tests, send test WhatsApp messages, enable paid services, or modify DNS/email routing. Browser fixtures are isolated in memory and clearly identified as test data. Keep public output in dist using the explicit build allowlist. The temporary account password is never in source control.
