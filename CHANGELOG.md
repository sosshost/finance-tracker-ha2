# Changelog

## 4.1.3 — Intermediate development snapshot (2026-11-22)

### Added
- Account-specific approval for automatic bookings, including direct debit scheduling and expected booking days.
- Improved integrated help organized by main views and subviews.
- Transaction edit and cancellation actions from plan-to-actual views.

### Changed
- Harmonized HA2.0 headers, navigation, dialogs, and monthly selection.
- Plan-to-actual display, including income overperformance highlighting and zero-plan actuals.
- Refresh and navigation state management for grouped views.

### Fixed
- Plan/template propagation of account associations and related attributes.
- Transaction-to-plan allocation feedback and handling.
- Frontend route registration for the planning module and navigation initialization guards.

### Migration
- No manual database migration. Account-specific automatic-booking permissions are disabled until explicitly enabled.

### Compatibility
- Home Assistant 2026.11+, domain `finance_tracker`, existing local database and IDs preserved.
- Restart Home Assistant after installation to register the frontend routes.

### Known limitations
- This is an intermediate public snapshot, not a fully live-validated stable release.
- Complete end-to-end regression testing on an independent Home Assistant installation remains outstanding.

## 4.1.1 — Master data, onboarding and anonymization

- Persistent account-owner administration and account master-data management.
- Integrated help and first-time setup guidance.
- Removed household-specific defaults and mappings.
- Existing data retained without manual migration.

## 4.1.0 — Independent publication baseline

- Independent Home Assistant setup and frontend asset-serving structure.
- Original brand assets and Marketplace/HACS metadata.
- Local database and active finance functionality retained.
