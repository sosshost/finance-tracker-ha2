"""Additive Finance Tracker 3.0 planning schema.

No data import or modification of legacy ledger rows is performed here.
All monthly planning values are separate from ft_transactions.
"""

SCHEMA_V3 = '''
CREATE TABLE IF NOT EXISTS ft3_periods (
 period TEXT PRIMARY KEY CHECK(length(period)=7),
 status TEXT NOT NULL DEFAULT 'unverified' CHECK(status IN ('unverified','planned','confirmed','closed')),
 source TEXT NOT NULL DEFAULT 'excel'
);
CREATE TABLE IF NOT EXISTS ft3_positions (
 id TEXT PRIMARY KEY,
 source_sheet TEXT NOT NULL,
 source_row INTEGER NOT NULL,
 name TEXT NOT NULL,
 group_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('expense','income','balance','saving_transfer','household_aggregate','clearing','derived','status')),
 owner TEXT,
 UNIQUE(source_sheet,source_row)
);
CREATE TABLE IF NOT EXISTS ft3_import_batches (
 id TEXT PRIMARY KEY,
 source_filename TEXT NOT NULL,
 sha256 TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('preview','approved','imported','rejected'))
);
CREATE TABLE IF NOT EXISTS ft3_monthly_values (
 position_id TEXT NOT NULL REFERENCES ft3_positions(id),
 period TEXT NOT NULL REFERENCES ft3_periods(period),
 amount_cents INTEGER,
 text_value TEXT,
 value_type TEXT NOT NULL CHECK(value_type IN ('historical','planned','unverified')),
 source_cell TEXT NOT NULL,
 source_formula TEXT,
 import_batch_id TEXT NOT NULL REFERENCES ft3_import_batches(id),
 PRIMARY KEY(position_id,period),
 CHECK((amount_cents IS NULL) != (text_value IS NULL))
);
CREATE TABLE IF NOT EXISTS ft3_balance_snapshots (
 position_id TEXT NOT NULL REFERENCES ft3_positions(id),
 period TEXT NOT NULL REFERENCES ft3_periods(period),
 balance_cents INTEGER NOT NULL,
 source_cell TEXT NOT NULL,
 import_batch_id TEXT NOT NULL REFERENCES ft3_import_batches(id),
 PRIMARY KEY(position_id,period)
);
CREATE TABLE IF NOT EXISTS ft3_reconciliations (
 period TEXT NOT NULL REFERENCES ft3_periods(period),
 source_row INTEGER NOT NULL,
 excel_total_cents INTEGER NOT NULL,
 computed_total_cents INTEGER NOT NULL,
 difference_cents INTEGER NOT NULL,
 import_batch_id TEXT NOT NULL REFERENCES ft3_import_batches(id),
 PRIMARY KEY(period,source_row)
);
CREATE INDEX IF NOT EXISTS idx_ft3_monthly_period ON ft3_monthly_values(period);
CREATE INDEX IF NOT EXISTS idx_ft3_balances_period ON ft3_balance_snapshots(period);
'''
