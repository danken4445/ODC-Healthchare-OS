## Multi-doctor initiative

- Follow `multi-doctor-master-prompt-codex.md` for all work on this initiative.
- The main agent acts as orchestrator: delegate exploration to `code_mapper`, implementation to the owning writer agent (`db_engineer`, `client_engineer`, `provider_ui`, `patient_ui`, `admin_ui`), tests to `test_engineer`, and review to `reviewer`.
- Only `db_engineer` writes migrations. Subagents never commit. Subagents return structured summaries, not raw logs.

## Revenue Operations & HMO/PhilHealth Claims initiative

- Follow `revenue-operations-hmo-philhealth-master-prompt.md` and `docs/revenue-operations-and-hmo-claims.md` for all work on this initiative.
- All monetary amounts must be stored as `bigint` integer centavos (`amount_in_centavos`). No floating-point or raw numeric drift.
- Financial subledgers (`financial_ledger_entries`) are strictly immutable and append-only; adjustments must use compensating debit/credit entries.
- Maintain the pay-in-full rule for appointment slot confirmation (exceptions for NBB/government facilities).
- The main agent acts as orchestrator; delegate implementation across `db_engineer`, `client_engineer`, `cashier_ui`, `hmo_ui`, `provider_ui`, `patient_ui`, and `test_engineer`.

