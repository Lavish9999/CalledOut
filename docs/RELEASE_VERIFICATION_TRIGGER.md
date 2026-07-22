# CalledOut release verification

This draft branch exists only to run the complete GitHub Actions release suite against the current release-hardening changes on `main`.

Required checks:

- Mobile and admin TypeScript, lint, unit tests, and production build
- Production dependency audit
- Fresh Supabase migration replay and pgTAP behavior tests
- Deno typechecking for every Edge Function

Do not merge this marker file into `main`.
