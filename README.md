# Finance Tracker HA2.0

Finance Tracker HA2.0 is a local household-finance integration for Home Assistant. It provides a dedicated Finance sidebar with monthly bookings, accounts, categories, financial planning, monthly templates, plan/actual allocation, booking proposals and guided monthly closing.

## Highlights

- Local SQLite data storage under `config/finance/household_v2.db`
- German-first HA2.0 user interface
- Monthly booking overview by category and account
- Financial planning with plan/actual comparison
- Monthly templates and planning proposals
- Explicit plan-to-actual allocation
- Guided monthly closing and validation
- Audit trail for subsequent booking changes
- Responsive mobile and desktop layout

## Data and privacy

Finance Tracker HA2.0 is local-first. Household finance data is stored inside the Home Assistant configuration directory. The integration does not require a cloud account, bank login, API token or external finance service.

<!-- ha-marketplace:exclude-start -->
## Installation during the publication-baseline phase

This repository layout is prepared for Home Assistant Marketplace/HACS custom-repository installation. Before public catalog submission, the remaining source-provenance/licensing review documented in `PROVENANCE.md` must be closed.

When the repository is published, add it as a custom integration repository, install Finance Tracker HA2.0, restart Home Assistant, then add **Finance Tracker HA2.0** under **Settings → Devices & services**.
<!-- ha-marketplace:exclude-end -->

## Upgrade from the private 4.0.x line

Version 4.1.0 keeps the domain `finance_tracker` and the existing database path. Replace the integration code, restart Home Assistant and reload the browser/app. No database migration is required for the 4.0.2.21 → 4.1.0 publication baseline.

## Support

Issues and documentation are intended to live in this repository once it is published under `sosshost/finance-tracker-ha2`.
