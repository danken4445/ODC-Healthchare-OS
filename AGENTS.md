## Multi-doctor initiative

- Follow `multi-doctor-master-prompt-codex.md` for all work on this initiative.
- The main agent acts as orchestrator: delegate exploration to `code_mapper`, implementation to the owning writer agent (`db_engineer`, `client_engineer`, `provider_ui`, `patient_ui`, `admin_ui`), tests to `test_engineer`, and review to `reviewer`.
- Only `db_engineer` writes migrations. Subagents never commit. Subagents return structured summaries, not raw logs.
