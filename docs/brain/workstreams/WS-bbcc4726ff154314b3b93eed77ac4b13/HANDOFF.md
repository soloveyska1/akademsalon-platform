# Workstream handoff

- Branch: `codex/incident-admin-auth-recovery-v2`
- Outcomes: `OUT-003`
- Goal: restore `admin.html` Telegram login when a browser still carries an
  expired or revoked HttpOnly session cookie, without weakening CSRF for any
  valid authenticated session and without reading client data.
- Acceptance: a request with an invalid session cookie reaches `/api/auth/start`
  as an anonymous request and clears both stale auth cookies; a valid cookie
  session still requires exact-origin double-submit CSRF; an unauthenticated
  clean browser remains unchanged; installer refuses unknown production source,
  keeps an exact rollback backup and validates the candidate before atomic
  install; production health, fresh login start/poll and the originally failing
  browser tab are green after one controlled service restart.
- Proof: failing-first installer/middleware unit tests, Python compile, focused
  public auth/privacy contracts, full backend/public/Brain regression,
  exact before/after hashes, synthetic cookie-only HTTP matrix, real browser
  network trace, service/Nginx/SQLite health and verified exact rollback,
  recorded as `E-1027`.
- Changed: none yet.
- Unverified: implementation not started.
- Risks/rollback: never treat a valid session with a bad/missing CSRF token as
  anonymous; never clear guest access; never copy secrets or database rows.
  Fail closed on source-hash or patch-anchor drift. Before apply, preserve the
  exact active `webapp.py`; rollback atomically restores that file and restarts
  `salon-bot-v2.service` if auth, health or protected-route smoke regresses.
- Next: review and commit the manifest plus this handoff.
