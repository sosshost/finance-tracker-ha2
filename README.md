# Finance Tracker HA2.0

Finance Tracker HA2.0 is a local-first household finance integration for Home Assistant, with a dedicated responsive panel in German.

## Version 4.1.5

Maintainer-live-validated DEV5: transaction chronology, amount search, unified editing dialogs and local user attribution.

## Features

- Account owners, account management, categories and account-specific authorization for automatic booking
- Financial planning, monthly templates and recurring planning positions
- Direct debit scheduling, expected booking day and optional automatic booking
- Monthly transaction overview by category and by account
- Plan-to-actual allocation, editing, cancellation and audit trail
- Booking proposals and guided month-end closing
- Responsive HA2.0 interface, integrated help and accessible navigation

## Installation and upgrade

Add this repository to HACS as a custom integration repository and install Finance Tracker. Restart Home Assistant after upgrading to 4.1.5, then reload the Home Assistant app/browser.

The integration uses domain `finance_tracker` and stores data locally in `config/finance/household_v2.db`. Existing data and IDs are retained. Account-specific automatic-booking permissions must be explicitly enabled; there is no automatic transfer of a previous global permission.

The upgrade automatically adds a creator-attribution table. Back up the database before upgrading. Historical authors are not inferred.

## Privacy

Published source code contains no personal account data or household-specific account-owner mappings. All personal data remains on the Home Assistant instance.

## Notes

See [CHANGELOG.md](CHANGELOG.md) for the detailed release history and [PROVENANCE.md](PROVENANCE.md) for source provenance and publication limitations.
