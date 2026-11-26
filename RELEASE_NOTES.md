Finance Tracker HA2.0 – Release v4.2.0

Overview

Version 4.2.0 introduces extended master data management, improved transaction handling, enhanced monthly closing functionality and further harmonization of the HA2.0 user interface.

The primary focus of this release is usability, functional consistency and historical data integrity.

✨ New Features

Account Management

- Account deletion and archiving.
- Protection of accounts referenced by existing transactions.
- Preservation of historical financial records.

Category Management

- Deletion of unused main categories and subcategories.
- Automatic reference checks before deletion.
- Archiving of categories referenced by existing financial records.
- Dedicated, collapsible archive section.
- Reactivation of archived categories.
- Controlled archiving of complete category hierarchies.
- Exclusion of archived categories from new transaction and planning selections.

Monthly Closing

- Edit and delete actions directly accessible from validation findings.
- Context-sensitive actions depending on the underlying finding.
- Protection against unauthorized modifications of closed months.

🔄 Functional Improvements

Transaction Management

- Consistent use of the universal transaction editor across relevant views.
- Direct editing and cancellation of transactions without plan assignments.
- Centralized transaction-to-plan assignment within the transaction editor.
- Removal of redundant reverse assignment workflows.
- Atomic processing of transaction and allocation changes.

Account Balances

- Harmonized account grouping and group headers.
- Consistent presentation across account balances and monthly account reconciliation.

Transaction History

- Improved arrangement of chronology and change history.
- Removal of redundant totals from the chronology view.

🎨 User Interface & Experience

- Further harmonization with the HA2.0 design standard.
- Standardized edit and delete icons across relevant views.
- Consistent action button dimensions of 32 × 32 px.
- Harmonized plan-to-actual assignment dropdown.
- Improved category hierarchy layout.
- Fixed, right-aligned category action buttons.
- Improved responsive behavior on mobile devices.
- Consistent confirmation dialogs for deletion and archiving.

🛠️ Bug Fixes

- Fixed inconsistent transaction editing dialogs.
- Fixed missing or inconsistent action buttons for unassigned transactions.
- Fixed redundant plan-to-actual assignment workflows.
- Fixed inconsistent category action button dimensions.
- Fixed misaligned category action buttons.
- Fixed unwanted action button wrapping for long category names.

🛡️ Data Integrity

- Preservation of existing transaction and category identifiers.
- Preservation of historical plan-to-actual assignments.
- Reference-aware deletion and archiving mechanisms.
- Preservation of historical category names and hierarchical relationships.
- Transaction rollback in case of unsuccessful allocation changes.

🗄️ Database & Migration

- Additive database extensions for category archiving.
- Automatic database schema initialization.
- No manual database migration required.
- Existing financial records and master data are retained.
- A backup before upgrading is recommended.

⚙️ Installation & Compatibility

- Target environment: Home Assistant 2026.11.
- Existing integration domain: "finance_tracker".
- Restart Home Assistant after updating.
- Reload the frontend to activate the updated interface.

🧪 Quality Assurance

- Python syntax and compilation checks.
- JavaScript syntax validation.
- ZIP archive integrity verification.
- Version and frontend cache identifier updates.
- Incremental functional validation during development.

A complete end-to-end regression test of the final release on an independent Home Assistant installation remains outstanding.

---

Version: 4.2.0
Previous version: 4.1.5
Release date: November 26, 2026
Repository: sosshost/finance-tracker-ha2
