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
  install; production health, fresh login start and the originally failing
  browser tab are green after controlled apply, rollback and forward restarts.
- Proof: failing-first installer/middleware unit tests, Python compile, focused
  public auth/privacy contracts, full backend/public/Brain regression,
  exact before/after hashes, synthetic cookie-only HTTP matrix, real browser
  network trace, service/Nginx/SQLite health and verified exact rollback,
  recorded as `E-1027`.
- Changed: exact source-pinned middleware installer and executable regression
  suite were added. Recovery is limited to exact `POST /api/auth/start` with
  `_session_user() is None`; valid-session CSRF and all other unsafe routes are
  unchanged. Installer preserves unknown concurrent drift and has an exact
  atomic rollback path.
- Verified: implementation `cc9cfed21c3ebebba386d6962954fc85f8a87df7`;
  focused 8/8, backend 39/39, public 596/596, Brain 39/39, two independent
  reviews P0=0/P1=0/P2=0. Production exact hash is `14a45362…48ee`; stale
  auth-start is 200 with both auth cookies deleted, protected order and PUT
  remain 403. The originally failing tab reaches the Telegram confirmation
  state. Service, Nginx and SQLite are green after an executed rollback and
  forward restore. Full record: E-1027 / REL-0167.
- Unverified: the user has not yet confirmed the one-time login in Telegram;
  authenticated admin access was intentionally not completed on their behalf.
- Risks/rollback: never treat a valid session with a bad/missing CSRF token as
  anonymous; never clear guest access; never copy secrets or database rows.
  Fail closed on source-hash or patch-anchor drift. Before apply, preserve the
  exact active `webapp.py`; rollback atomically restores that file and restarts
  `salon-bot-v2.service` if auth, health or protected-route smoke regresses.
- Next: user clicks `Открыть бота`, confirms the one-time Telegram login and
  returns to the waiting admin tab; if the code expires, press the entry button
  again to create a fresh one.
