# Finance Tracker v4.2.2

## Added
- Category development charts for income and expenses, with independent category filters and dynamic axes.
- Month selection across three calendar years, with horizontal swiping and up to twelve selected months.
- Redesigned full-screen help with setup and four main-view chapters.

## Changed
- Monthly development cards renamed Category Development, Monthly Balance and Monthly Comparison; collapsed by default.
- Category filter buttons use a three-column grid with centered labels and aligned color dots.
- Chart axis increments are multiples of EUR 100.
- Removed redundant year navigation arrows and standalone year label; January retains its year label.

## Fixed
- Category and month selection update charts without rebuilding the entire view, avoiding scroll jumps.

## Migration and compatibility
- No database migration required when upgrading from 4.2.0.
- Restart Home Assistant and reload the frontend after installation.

## Validation
- Source files matched against the complete v4.2.2 archive. Development version dev.6 was live approved; the final cosmetic change has been installed but not independently live verified. Independent full regression testing remains outstanding.
