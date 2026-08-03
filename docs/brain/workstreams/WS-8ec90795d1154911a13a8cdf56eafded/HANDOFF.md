# Workstream handoff

- Branch: `codex/incident-consent-hotfix`
- Outcomes: `OUT-001`
- Goal: durably record and close the production-wide order/gift consent-version
  outage reported by the user on 3 August 2026.
- Acceptance: the active backend legal editions match the published privacy 3.1,
  oferta 3.2 and request consent 1.0; the service is active; public API GETs and
  protected-route refusals are healthy; no synthetic or client order is created.
- Proof: exact pre/post backend hashes, source and public-document literals,
  service state, VPS GET-only smoke and rollback artifact are recorded in
  `E-1013`; Brain unit tests and strict validation must pass.
- Changed: authorized production backend constants were aligned to the published
  request-consent 1.0, privacy 3.1 and oferta 3.2; the service was restarted with
  an exact backup. Durable receipt `E-1013`, `REL-0103`, `START-HERE` and
  `CURRENT-HANDOFF` now record cause, proof, limits and rollback.
- Unverified: no real production submit is permitted, so downstream bot/operator
  delivery remains outside this incident proof.
- Risks/rollback: the only runtime mutation is the authoritative backend edition
  constants plus a controlled service restart. Exact backup
  `config.py.pre-consent-hotfix-20260803` restores the previous bytes before a
  restart if health does not recover.
- Next: run Brain proof and a fresh conflict scan, commit and submit this exact
  documentation result, then integrate it into canonical before starting the
  user's next branch.
