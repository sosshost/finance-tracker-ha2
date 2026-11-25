"""DEV5: opt-in scheduled postings from released monthly plan positions.

All SQLite work runs in HA's executor; no posting without two explicit opt-ins.
"""
import calendar
import sqlite3
from datetime import date
from pathlib import Path
from uuid import uuid4
from homeassistant.exceptions import HomeAssistantError
from .ledger import Ledger, now, validate_month
from homeassistant.util import dt as dt_util
from .finance_planning import read_planning
from .plan_actual import SCHEMA as LINKS_SCHEMA
from .booking_proposals import SCHEMA as PROPOSALS_SCHEMA

SCHEMA = '''
CREATE TABLE IF NOT EXISTS ft5_debit_positions(
 month TEXT NOT NULL, position_id TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 day INTEGER CHECK(day BETWEEN 1 AND 31),
 automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
 account_id TEXT, to_account_id TEXT,
 PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft5_debit_templates(
 template_id TEXT PRIMARY KEY,
 enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
 day INTEGER CHECK(day BETWEEN 1 AND 31),
 automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)),
 account_id TEXT, to_account_id TEXT);
CREATE TABLE IF NOT EXISTS ft5_debit_account_settings(
 account_id TEXT PRIMARY KEY REFERENCES ft_accounts(id),
 automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)));
CREATE TABLE IF NOT EXISTS ft5_debit_settings(
 id INTEGER PRIMARY KEY CHECK(id=1), automatic INTEGER NOT NULL DEFAULT 0 CHECK(automatic IN (0,1)));
INSERT OR IGNORE INTO ft5_debit_settings(id,automatic) VALUES(1,0);
CREATE TABLE IF NOT EXISTS ft5_debit_runs(
 month TEXT NOT NULL, position_id TEXT NOT NULL, booked TEXT NOT NULL,
 transaction_id TEXT NOT NULL, second_transaction_id TEXT,
 created TEXT NOT NULL, PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft5_debit_failures(
 month TEXT NOT NULL,position_id TEXT NOT NULL,reason TEXT NOT NULL,at TEXT NOT NULL,
 PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft5_debit_events(
 month TEXT NOT NULL, position_id TEXT NOT NULL, at TEXT NOT NULL,
 reason TEXT NOT NULL, PRIMARY KEY(month,position_id,reason));
'''

def connect(hass):
    db=sqlite3.connect(Path(hass.config.path('finance/household_v2.db')),timeout=5)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=5000')
    # Avoid implicit COMMIT/DDL for ordinary status reads and scheduler checks.
    required=('ft5_debit_positions','ft5_debit_templates','ft5_debit_account_settings',
              'ft5_debit_settings','ft5_debit_runs','ft5_debit_failures',
              'ft5_debit_events','ft4_plan_actual_links')
    if any(not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone() for table in required):
        db.executescript(SCHEMA+LINKS_SCHEMA+PROPOSALS_SCHEMA)
    return db

def config(db,month,pid):
    row=db.execute('SELECT * FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,pid)).fetchone()
    if row:return dict(row)
    if pid.startswith('tpl:'):
        row=db.execute('SELECT * FROM ft5_debit_templates WHERE template_id=?',(pid[4:],)).fetchone()
        if row:return dict(row)
    return {'enabled':0,'day':None,'automatic':0,'account_id':None,'to_account_id':None}

def _validate(db,kind,enabled,day,automatic,aid,target):
    if automatic and not enabled:raise HomeAssistantError('Automatik setzt Lastschrift voraus')
    if enabled:
        if not isinstance(day,int) or isinstance(day,bool) or not 1<=day<=31:
            raise HomeAssistantError('Gültigen Abbuchungstag (1–31) angeben')
        if not aid:raise HomeAssistantError('Lastschrift erfordert ein Konto')
        ids=[aid]
        if kind=='saving_transfer':
            if not target or target==aid:raise HomeAssistantError('Umbuchung benötigt zwei unterschiedliche Konten')
            ids.append(target)
        for ident in ids:
            if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(ident,)).fetchone():
                raise HomeAssistantError('Zugeordnetes Konto fehlt oder ist inaktiv')

def save(db,month,pid,kind,data):
    enabled=int(data.get('debit_enabled') is True)
    automatic=int(data.get('debit_automatic') is True)
    raw=data.get('debit_day')
    day=int(raw) if str(raw or '').isdigit() else None
    aid=str(data.get('account_id') or '') or None
    target=str(data.get('to_account_id') or '') or None
    _validate(db,kind,enabled,day,automatic,aid,target)
    if not enabled:day=None;automatic=0
    db.execute('''INSERT INTO ft5_debit_positions(month,position_id,enabled,day,automatic,account_id,to_account_id)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET
      enabled=excluded.enabled,day=excluded.day,automatic=excluded.automatic,
      account_id=excluded.account_id,to_account_id=excluded.to_account_id''',
      (month,pid,enabled,day,automatic,aid,target))

def get(hass,month):
    with connect(hass) as db:
        return {'global_automatic':False, 'account_automatic':{r['account_id']:bool(r['automatic']) for r in db.execute('SELECT account_id,automatic FROM ft5_debit_account_settings')},
          'positions':{r['position_id']:dict(r) for r in db.execute('SELECT * FROM ft5_debit_positions WHERE month=?',(month,))},
          'runs':{r['position_id']:dict(r) for r in db.execute('SELECT * FROM ft5_debit_runs WHERE month=?',(month,))},
          'events':[dict(r) for r in db.execute('SELECT * FROM ft5_debit_events WHERE month=?',(month,))],
          'failures':[dict(r) for r in db.execute('SELECT * FROM ft5_debit_failures WHERE month=?',(month,))]}

def action(hass,op,data):
    if op=='info':return get(hass,validate_month(data.get('month')))
    if op=='global':
        raise HomeAssistantError('Globale Freigabe wurde durch kontobezogene Freigaben ersetzt')
    if op=='run':return run(hass)
    raise HomeAssistantError('Unbekannte Lastschriftaktion')

def run(hass,today=None):
    today=today or dt_util.now().date()
    month=today.strftime('%Y-%m')
    ledger=Ledger(hass,{"automatic":True})
    # Snapshot outside the transaction, but re-check all authoritative state under BEGIN IMMEDIATE.
    with connect(hass) as db:
        if not db.execute('SELECT 1 FROM ft5_debit_account_settings WHERE automatic=1 LIMIT 1').fetchone():
            return {'enabled':False,'posted':0,'blocked':[]}
        if not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_months'").fetchone():
            return {'enabled':True,'posted':0,'blocked':[]}
        if not db.execute("SELECT 1 FROM ft3_plan_months WHERE month=? AND status='released'",(month,)).fetchone():
            return {'enabled':True,'posted':0,'blocked':[]}
    snapshot=read_planning(hass.config.path('finance/household_v2.db'),month)
    posted=0;blocked=[]
    for row in snapshot['rows']:
        pid=row.get('position_id');kind=row.get('kind')
        if not pid or kind not in ('income','expense','saving_transfer'):continue
        with connect(hass) as db:
            db.execute('BEGIN IMMEDIATE')
            if not db.execute('SELECT 1 FROM ft5_debit_account_settings WHERE automatic=1 LIMIT 1').fetchone():break
            if not db.execute("SELECT 1 FROM ft3_plan_months WHERE month=? AND status='released'",(month,)).fetchone():break
            cfg=config(db,month,pid)
            if not cfg['enabled'] or not cfg['automatic'] or not cfg['day']:continue
            booked=date(today.year,today.month,min(int(cfg['day']),calendar.monthrange(today.year,today.month)[1]))
            if booked>today:continue
            if db.execute('SELECT 1 FROM ft5_debit_runs WHERE month=? AND position_id=?',(month,pid)).fetchone():continue
            # Do not recreate intentionally cancelled/voided/previously processed positions.
            if db.execute('SELECT 1 FROM ft5_debit_events WHERE month=? AND position_id=?',(month,pid)).fetchone():continue
            amount=abs(int(row.get('amount_cents') or 0))
            if not amount:continue
            try:
                _validate(db,kind,1,int(cfg['day']),1,cfg['account_id'],cfg['to_account_id'])
                if pid.startswith('tpl:'):
                    current=db.execute('SELECT account_id FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,pid[4:])).fetchone()
                    to=db.execute('SELECT to_account_id FROM ft4_plan_transfer_targets WHERE month=? AND template_id=?',(month,pid[4:])).fetchone() if kind=='saving_transfer' else None
                else:
                    current=db.execute('SELECT account_id FROM ft3_plan_accounts WHERE month=? AND position_id=?',(month,pid)).fetchone()
                    to=db.execute('SELECT to_account_id FROM ft4_manual_plan_targets WHERE month=? AND position_id=?',(month,pid)).fetchone() if kind=='saving_transfer' else None
                if not current or current[0]!=cfg['account_id'] or (kind=='saving_transfer' and (not to or to[0]!=cfg['to_account_id'])):
                    raise HomeAssistantError('Kontozuordnung der Planposition stimmt nicht mit Lastschriftmerkmal überein')
                if not db.execute('SELECT 1 FROM ft5_debit_account_settings WHERE account_id=? AND automatic=1',(cfg['account_id'],)).fetchone():
                    raise HomeAssistantError('Automatische Verbuchung für das Quell-/Belastungskonto nicht freigegeben')
                if kind=='saving_transfer' and not db.execute('SELECT 1 FROM ft5_debit_account_settings WHERE account_id=? AND automatic=1',(cfg['to_account_id'],)).fetchone():
                    raise HomeAssistantError('Automatische Verbuchung für das Zielkonto nicht freigegeben')
                ids=[cfg['account_id']]+([cfg['to_account_id']] if kind=='saving_transfer' else [])
                for aid in ids:
                    a=db.execute('SELECT opening_date FROM ft_accounts WHERE id=? AND active=1',(aid,)).fetchone()
                    if not a or booked.isoformat()<a['opening_date']:raise HomeAssistantError('Konto am Buchungstag noch nicht eröffnet')
                ledger._ensure_open(db,booked.isoformat(),ids)
                # No additional postings if already linked or deliberately marked skipped.
                if db.execute('''SELECT 1 FROM ft4_plan_actual_links l JOIN ft_transactions t ON t.id=l.transaction_id
                     WHERE l.month=? AND l.position_id=? AND t.voided=0 LIMIT 1''',(month,pid)).fetchone():continue
                decision=db.execute('SELECT 1 FROM ft3_proposal_decisions WHERE month=? AND source_name=? AND kind=? AND status=?',
                    (month,row['name'],kind,'skipped')).fetchone() if kind!='saving_transfer' else None
                if decision:continue
                desc=str(row['name'])[:240]
                if db.execute('''SELECT 1 FROM ft_transactions WHERE booked=? AND account_id=?
                     AND description=? AND kind=? AND amount_cents=? AND voided=0 LIMIT 1''',
                     (booked.isoformat(),cfg['account_id'],desc,'transfer' if kind=='saving_transfer' else kind,
                      amount if kind=='income' else -amount)).fetchone():
                    raise HomeAssistantError('Mögliche bereits vorhandene Buchung; bitte manuell prüfen und zuordnen')
                tx=uuid4().hex;second=None;transfer_id=uuid4().hex if kind=='saving_transfer' else None
                postings=[(tx,cfg['account_id'],-amount if kind!='income' else amount)]
                if kind=='saving_transfer':
                    second=uuid4().hex;postings.append((second,cfg['to_account_id'],amount))
                category=None
                if kind!='saving_transfer':
                    if pid.startswith('tpl:'):
                        c=db.execute('SELECT category_id FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,pid[4:])).fetchone()
                    else:c=db.execute('SELECT category_id FROM ft3_plan_categories WHERE month=? AND position_id=?',(month,pid)).fetchone()
                    category=c[0] if c else None
                    if category:ledger._validate_category(db,category,kind)
                for tid,aid,signed in postings:
                    db.execute('INSERT INTO ft_transactions VALUES(?,?,?,?,?,?,?,?,?,0)',
                        (tid,booked.isoformat(),aid,category,('transfer' if transfer_id else kind),signed,desc,transfer_id,now()))
                    ledger.record_creator(db,tid)
                if kind!='saving_transfer':
                    db.execute('INSERT INTO ft4_plan_actual_links VALUES(?,?,?,?,?,?)',(uuid4().hex,month,pid,tx,amount,now()))
                else:
                    # The source leg is the plan/actual anchor; the destination is its atomic counterpart.
                    db.execute('INSERT INTO ft4_plan_actual_links VALUES(?,?,?,?,?,?)',(uuid4().hex,month,pid,tx,amount,now()))
                db.execute('INSERT INTO ft5_debit_runs VALUES(?,?,?,?,?,?)',(month,pid,booked.isoformat(),tx,second,now()))
                db.execute('DELETE FROM ft5_debit_failures WHERE month=? AND position_id=?',(month,pid))
                ledger._audit(db,'automatic_debit',{'month':month,'position_id':pid,'transaction_id':tx,'second_transaction_id':second})
                posted+=1
            except (HomeAssistantError,sqlite3.Error,ValueError) as exc:
                db.rollback()  # Atomicity: never commit a partial transfer or failed posting.
                blocked.append({'position_id':pid,'reason':str(exc)})
                db.execute('INSERT INTO ft5_debit_failures VALUES(?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET reason=excluded.reason,at=excluded.at',(month,pid,str(exc)[:500],now()))
                # Keep failed positions eligible for retry after correction.
    return {'enabled':True,'posted':posted,'blocked':blocked}
