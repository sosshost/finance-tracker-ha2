"""Presentation metadata for existing ledger accounts; never mutates balances."""
import sqlite3
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from homeassistant.exceptions import HomeAssistantError

OWNERS={'Andrea','Sally','Gemeinsam','Maximus','Edison'}
TYPES={'Girokonto','Kreditkarte','PayPal','Guthabenkarte','Bargeld','Tagesgeld','Spardose','Depot-Verrechnung','Depot','Bausparen','Sonstiges'}

def action(hass, op, data):
    path=Path(hass.config.path('finance/household_v2.db'))
    with sqlite3.connect(path,timeout=10) as db:
        db.row_factory=sqlite3.Row
        db.execute('''CREATE TABLE IF NOT EXISTS ft_account_meta (
          account_id TEXT PRIMARY KEY REFERENCES ft_accounts(id),
          display_name TEXT, owner TEXT, account_type TEXT, bank TEXT,
          favorite INTEGER NOT NULL DEFAULT 0,
          updated_at TEXT NOT NULL)''')
        columns={row[1] for row in db.execute('PRAGMA table_info(ft_account_meta)')}
        if 'bank' not in columns: db.execute('ALTER TABLE ft_account_meta ADD COLUMN bank TEXT')
        if 'tolerance_cents' not in columns: db.execute('ALTER TABLE ft_account_meta ADD COLUMN tolerance_cents INTEGER NOT NULL DEFAULT 0')
        if op=='list':
            return {'accounts':[dict(x) for x in db.execute('SELECT account_id,display_name,owner,account_type,bank,favorite,tolerance_cents FROM ft_account_meta')]}
        if op!='save': raise HomeAssistantError('Unbekannte Aktion')
        aid=str(data.get('account_id',''))
        if not db.execute('SELECT 1 FROM ft_accounts WHERE id=?',(aid,)).fetchone(): raise HomeAssistantError('Konto nicht gefunden')
        name=str(data.get('display_name','')).strip()
        owner=str(data.get('owner','')).strip()
        typ=str(data.get('account_type','')).strip()
        bank=str(data.get('bank','')).strip()
        if len(bank)>100: raise HomeAssistantError('Bank maximal 100 Zeichen')
        favorite=data.get('favorite',False)
        tolerance=data.get('tolerance_cents',None)
        if tolerance is None:
            old=db.execute('SELECT tolerance_cents FROM ft_account_meta WHERE account_id=?',(aid,)).fetchone()
            tolerance=int(old[0]) if old else 0
        if type(tolerance) is not int or not 0<=tolerance<=100000000: raise HomeAssistantError('Kontotoleranz muss ein ganzzahliger Centbetrag von 0 bis 1.000.000 € sein')
        if len(name)>80: raise HomeAssistantError('Anzeigename maximal 80 Zeichen')
        if owner and owner not in OWNERS: raise HomeAssistantError('Unbekannter Inhaber')
        if typ and typ not in TYPES: raise HomeAssistantError('Unbekannter Kontotyp')
        if not isinstance(favorite,bool): raise HomeAssistantError('Favorit muss Ja/Nein sein')
        db.execute('''INSERT INTO ft_account_meta(account_id,display_name,owner,account_type,bank,favorite,tolerance_cents,updated_at)
          VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(account_id) DO UPDATE SET
          display_name=excluded.display_name,owner=excluded.owner,
          account_type=excluded.account_type,bank=excluded.bank,favorite=excluded.favorite,tolerance_cents=excluded.tolerance_cents,updated_at=excluded.updated_at''',
          (aid,name or None,owner or None,typ or None,bank or None,int(favorite),tolerance,datetime.now(timezone.utc).isoformat()))
        db.commit()
        return {'ok':True,'account_id':aid}
