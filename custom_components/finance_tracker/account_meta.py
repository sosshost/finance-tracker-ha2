"""Account presentation metadata and account-owner administration."""

from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from homeassistant.exceptions import HomeAssistantError

TYPES = {
    "Girokonto",
    "Kreditkarte",
    "PayPal",
    "Guthabenkarte",
    "Bargeld",
    "Tagesgeld",
    "Spardose",
    "Depot-Verrechnung",
    "Depot",
    "Bausparen",
    "Sonstiges",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()



UNASSIGNED_OWNER = "Nicht zugeordnet"

def _validate_owner_name(value: object) -> str:
    name = " ".join(str(value or "").strip().split())
    if not name:
        raise HomeAssistantError("Name des Kontoinhabers fehlt")
    if len(name) > 80:
        raise HomeAssistantError("Kontoinhaber maximal 80 Zeichen")
    return name


def _ensure_schema(db: sqlite3.Connection) -> None:
    db.execute("PRAGMA foreign_keys=ON")
    db.execute(
        """CREATE TABLE IF NOT EXISTS ft_account_meta (
          account_id TEXT PRIMARY KEY REFERENCES ft_accounts(id),
          display_name TEXT, owner TEXT, account_type TEXT, bank TEXT,
          favorite INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL)"""
    )
    columns = {row[1] for row in db.execute("PRAGMA table_info(ft_account_meta)")}
    if "bank" not in columns:
        db.execute("ALTER TABLE ft_account_meta ADD COLUMN bank TEXT")
    if "tolerance_cents" not in columns:
        db.execute(
            "ALTER TABLE ft_account_meta ADD COLUMN tolerance_cents INTEGER NOT NULL DEFAULT 0"
        )

    db.execute("""CREATE TABLE IF NOT EXISTS ft5_debit_account_settings(
       account_id TEXT PRIMARY KEY REFERENCES ft_accounts(id),
       automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)))""")
    db.execute(
        """CREATE TABLE IF NOT EXISTS ft_account_owners (
          name TEXT PRIMARY KEY COLLATE NOCASE,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL)"""
    )

    # Migrate every explicitly stored owner from 4.1.0 and earlier.
    for row in db.execute(
        "SELECT DISTINCT TRIM(owner) AS owner FROM ft_account_meta "
        "WHERE owner IS NOT NULL AND TRIM(owner)<>''"
    ):
        db.execute(
            "INSERT OR IGNORE INTO ft_account_owners(name,created_at,updated_at) VALUES(?,?,?)",
            (row[0], _now(), _now()),
        )

    # A pre-4.1.1 installation may contain ledger accounts without owner metadata.
    # Never infer a person from account names. Existing unassigned accounts are migrated
    # to one neutral technical owner; a fresh installation stays empty until the user
    # creates an owner explicitly.
    has_accounts = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft_accounts'"
    ).fetchone()
    if has_accounts:
        unassigned = [
            row[0]
            for row in db.execute(
                """SELECT a.id FROM ft_accounts a
                   LEFT JOIN ft_account_meta m ON m.account_id=a.id
                   WHERE m.account_id IS NULL OR m.owner IS NULL OR TRIM(m.owner)=''"""
            )
        ]
        if unassigned:
            stamp = _now()
            db.execute(
                "INSERT OR IGNORE INTO ft_account_owners(name,created_at,updated_at) VALUES(?,?,?)",
                (UNASSIGNED_OWNER, stamp, stamp),
            )
            for account_id in unassigned:
                db.execute(
                    """INSERT INTO ft_account_meta(account_id,owner,updated_at)
                       VALUES(?,?,?)
                       ON CONFLICT(account_id) DO UPDATE SET
                       owner=CASE
                         WHEN ft_account_meta.owner IS NULL OR TRIM(ft_account_meta.owner)=''
                         THEN excluded.owner ELSE ft_account_meta.owner END,
                       updated_at=CASE
                         WHEN ft_account_meta.owner IS NULL OR TRIM(ft_account_meta.owner)=''
                         THEN excluded.updated_at ELSE ft_account_meta.updated_at END""",
                    (account_id, UNASSIGNED_OWNER, stamp),
                )


def _owner_exists(db: sqlite3.Connection, name: str) -> bool:
    return (
        db.execute(
            "SELECT 1 FROM ft_account_owners WHERE name=? COLLATE NOCASE", (name,)
        ).fetchone()
        is not None
    )


def action(hass, op, data):
    path = Path(hass.config.path("finance/household_v2.db"))
    with sqlite3.connect(path, timeout=10) as db:
        db.row_factory = sqlite3.Row
        # Read requests must not run DDL or owner backfill. Those writes used to
        # acquire a RESERVED SQLite lock on every picker refresh.
        if op != "list" or not all(
            db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()
            for name in ("ft_account_meta", "ft_account_owners", "ft5_debit_account_settings")
        ):
            _ensure_schema(db)

        if op == "list":
            owners = [
                dict(row)
                for row in db.execute(
                    """SELECT o.name, COUNT(m.account_id) AS account_count
                       FROM ft_account_owners o
                       LEFT JOIN ft_account_meta m ON m.owner=o.name COLLATE NOCASE
                       GROUP BY o.name
                       ORDER BY o.name COLLATE NOCASE"""
                )
            ]
            accounts = [
                dict(row)
                for row in db.execute(
                    """SELECT account_id,display_name,owner,account_type,bank,favorite,tolerance_cents
                       FROM ft_account_meta"""
                )
            ]
            enabled={r['account_id']:bool(r['automatic']) for r in db.execute('SELECT account_id,automatic FROM ft5_debit_account_settings')}
            for a in accounts:a['automatic_debit']=enabled.get(a['account_id'],False)
            return {"accounts": accounts, "owners": owners}

        if op == "owner_add":
            name = _validate_owner_name(data.get("name"))
            if _owner_exists(db, name):
                raise HomeAssistantError("Kontoinhaber ist bereits vorhanden")
            stamp = _now()
            db.execute(
                "INSERT INTO ft_account_owners(name,created_at,updated_at) VALUES(?,?,?)",
                (name, stamp, stamp),
            )
            db.commit()
            return {"ok": True, "name": name}

        if op == "owner_save":
            old_name = _validate_owner_name(data.get("old_name"))
            new_name = _validate_owner_name(data.get("name"))
            existing = db.execute(
                "SELECT name FROM ft_account_owners WHERE name=? COLLATE NOCASE",
                (old_name,),
            ).fetchone()
            if not existing:
                raise HomeAssistantError("Kontoinhaber nicht gefunden")
            duplicate = db.execute(
                "SELECT name FROM ft_account_owners WHERE name=? COLLATE NOCASE AND name<>? COLLATE NOCASE",
                (new_name, existing["name"]),
            ).fetchone()
            if duplicate:
                raise HomeAssistantError("Kontoinhaber ist bereits vorhanden")
            db.execute(
                "UPDATE ft_account_meta SET owner=?,updated_at=? WHERE owner=? COLLATE NOCASE",
                (new_name, _now(), existing["name"]),
            )
            db.execute(
                "UPDATE ft_account_owners SET name=?,updated_at=? WHERE name=? COLLATE NOCASE",
                (new_name, _now(), existing["name"]),
            )
            db.commit()
            return {"ok": True, "old_name": old_name, "name": new_name}

        if op == "owner_delete":
            name = _validate_owner_name(data.get("name"))
            existing = db.execute(
                "SELECT name FROM ft_account_owners WHERE name=? COLLATE NOCASE", (name,)
            ).fetchone()
            if not existing:
                raise HomeAssistantError("Kontoinhaber nicht gefunden")
            used = db.execute(
                "SELECT COUNT(*) FROM ft_account_meta WHERE owner=? COLLATE NOCASE",
                (existing["name"],),
            ).fetchone()[0]
            if used:
                raise HomeAssistantError(
                    f"Kontoinhaber ist noch {used} Konto/Konten zugeordnet. Konten zuerst umordnen."
                )
            db.execute(
                "DELETE FROM ft_account_owners WHERE name=? COLLATE NOCASE",
                (existing["name"],),
            )
            db.commit()
            return {"ok": True, "name": existing["name"]}

        if op != "save":
            raise HomeAssistantError("Unbekannte Aktion")

        aid = str(data.get("account_id", ""))
        if not db.execute("SELECT 1 FROM ft_accounts WHERE id=?", (aid,)).fetchone():
            raise HomeAssistantError("Konto nicht gefunden")
        display_name = str(data.get("display_name", "")).strip()
        owner = str(data.get("owner", "")).strip()
        typ = str(data.get("account_type", "")).strip()
        bank = str(data.get("bank", "")).strip()
        if len(bank) > 100:
            raise HomeAssistantError("Bank maximal 100 Zeichen")
        favorite = data.get("favorite", False)
        tolerance = data.get("tolerance_cents", None)
        if tolerance is None:
            old = db.execute(
                "SELECT tolerance_cents FROM ft_account_meta WHERE account_id=?", (aid,)
            ).fetchone()
            tolerance = int(old[0]) if old else 0
        if type(tolerance) is not int or not 0 <= tolerance <= 100000000:
            raise HomeAssistantError(
                "Kontotoleranz muss ein ganzzahliger Centbetrag von 0 bis 1.000.000 € sein"
            )
        if len(display_name) > 80:
            raise HomeAssistantError("Anzeigename maximal 80 Zeichen")
        if owner and not _owner_exists(db, owner):
            raise HomeAssistantError("Unbekannter Kontoinhaber")
        if typ and typ not in TYPES:
            raise HomeAssistantError("Unbekannter Kontotyp")
        if not isinstance(favorite, bool):
            raise HomeAssistantError("Favorit muss Ja/Nein sein")
        db.execute(
            """INSERT INTO ft_account_meta(account_id,display_name,owner,account_type,bank,favorite,tolerance_cents,updated_at)
               VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET
               display_name=excluded.display_name,owner=excluded.owner,
               account_type=excluded.account_type,bank=excluded.bank,favorite=excluded.favorite,
               tolerance_cents=excluded.tolerance_cents,updated_at=excluded.updated_at""",
            (
                aid,
                display_name or None,
                owner or None,
                typ or None,
                bank or None,
                int(favorite),
                tolerance,
                _now(),
            ),
        )
        if 'automatic_debit' in data:
            enabled=data['automatic_debit']
            if type(enabled) is not bool:raise HomeAssistantError('Kontofreigabe muss Ja/Nein sein')
            db.execute('''INSERT INTO ft5_debit_account_settings(account_id,automatic) VALUES(?,?)
              ON CONFLICT(account_id) DO UPDATE SET automatic=excluded.automatic''',(aid,int(enabled)))
        db.commit()
        return {"ok": True, "account_id": aid}
