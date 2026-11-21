# Finance Tracker HA2.0

Finance Tracker HA2.0 is a local household-finance integration for Home Assistant. It provides a dedicated Finance sidebar with monthly bookings, accounts, categories, financial planning, monthly templates, plan/actual allocation, booking proposals and guided monthly closing.

## Highlights

- Local SQLite data storage under `config/finance/household_v2.db`
- German-first HA2.0 user interface
- Account-owner and account master-data administration
- Monthly booking overview by category and account
- Financial planning with plan/actual comparison
- Monthly templates and planning proposals
- Explicit plan-to-actual allocation
- Guided monthly closing and validation
- Audit trail for subsequent booking changes
- Integrated help and first-time setup guidance
- Responsive mobile and desktop layout

## Data and privacy

Finance Tracker HA2.0 is local-first. Household finance data is stored inside the Home Assistant configuration directory. The integration does not require a cloud account, bank login, API token or external finance service.

The published source contains no household-specific owner names or personal default mappings. Account owners and account master data are created locally by the user.

## Installation

Add this repository to Home Assistant Marketplace/HACS as a custom integration repository, install Finance Tracker HA2.0, restart Home Assistant, then add **Finance Tracker HA2.0** under **Settings → Devices & services**.

## Upgrade to 4.1.1

Version 4.1.1 keeps the domain `finance_tracker` and the existing database path. It adds full account-owner administration, account creation/editing/deletion with referential-integrity protection, integrated help and first-time setup guidance, and removes household-specific defaults from the source.

Existing installations are migrated automatically. Existing account IDs, transactions, categories, plan/actual links, templates and month closings are retained. No manual database migration is required.

## Support

Issues and documentation are maintained in this repository under `sosshost/finance-tracker-ha2`.
