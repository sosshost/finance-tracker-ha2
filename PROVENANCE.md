# Source provenance and publication status

## Publication baseline

Version 4.1.0 is the first baseline prepared specifically for independent publication.

The active ledger, planning, template, proposal, plan/actual and closing architecture uses a separate `ft_*`/`ft3_*`/`ft4_*` schema and implementation from the historical upstream Finance Tracker 0.3.12 architecture.

For 4.1.0 the remaining clearly inherited edge components were deliberately replaced:

- Home Assistant bootstrap / setup structure
- config flow implementation
- frontend asset-serving implementation and URL namespace
- setup strings and English translation
- brand icons
- manifest ownership/documentation metadata

The old import, reminder, sensor, services and storage backend modules are not part of this package.

## Historical upstream

Private development originally started from `himanshutak08/financeTracker` version 0.3.12. At the time this baseline was prepared, that public repository did not declare a license.

Because absence of a license does not grant redistribution rights, this repository should not be submitted to the public Marketplace catalog until the remaining provenance/legal review is considered complete by the publisher. This file is technical documentation, not legal advice.

## Validation target

The publication target is:

- no byte-identical inherited source files or brand assets;
- no material shared implementation blocks in the rewritten publication-edge files;
- independent current backend/database architecture;
- explicit publisher ownership metadata.
