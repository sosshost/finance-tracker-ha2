# Changelog

## 4.1.1 — Master data, onboarding and anonymization

- Added persistent account-owner administration: create, rename and delete.
- Added complete account administration: create, edit and delete.
- Added referential-integrity protection so accounts in use cannot be destructively deleted.
- Added migration of existing owner metadata without inferring personal identities from account names.
- Added dynamic owner lists to account, planning and template pickers.
- Added integrated help and first-time setup guidance in the main header.
- Removed household-specific owner names, aliases and personal default mappings from source code.
- Hardened form handling for account creation/editing and planning forms.
- Updated frontend cache revision for the 4.1.1 build.
- No manual database migration required.

## 4.1.0 — Independent Publication Baseline

- Rebuilt the Home Assistant bootstrap and WebSocket registration structure.
- Rebuilt frontend asset serving under `/api/finance_tracker/ui/`.
- Removed the historical hidden planning sidebar registration.
- Rewrote config flow and setup/translation text.
- Replaced inherited brand artwork with a new original geometric Finance Tracker mark.
- Added Marketplace/HACS repository metadata and validation workflow.
- Kept the `finance_tracker` domain, `household_v2.db` data model and all active ledger/planning functionality.
- No database migration required from 4.0.2.21.
