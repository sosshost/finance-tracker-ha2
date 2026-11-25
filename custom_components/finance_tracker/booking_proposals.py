"""Stufe 12: explicit, idempotent approval of imported planning positions.

No transaction is created by listing suggestions. Plan values remain unchanged.
"""
import sqlite3
from datetime import date
from pathlib import Path
from uuid import uuid4
from homeassistant.exceptions import HomeAssistantError
from .finance_planning import read_planning
from .ledger import now, validate_day, validate_month, Ledger
from .plan_actual import SCHEMA as PLAN_ACTUAL_SCHEMA

SCHEMA = '''CREATE TABLE IF NOT EXISTS ft3_proposal_decisions (
 month TEXT NOT NULL, source_name TEXT NOT NULL, kind TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('confirmed','skipped')),
 transaction_id TEXT, decided TEXT NOT NULL,
 PRIMARY KEY(month,source_name,kind));'''


def _db(hass):
    path=Path(hass.config.path('finance/household_v2.db'))
    db=sqlite3.connect(path,timeout=5)
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA busy_timeout=5000')
    db.executescript(SCHEMA+PLAN_ACTUAL_SCHEMA)
    db.commit()
    return db


def _released(db,month):
    try:
        r=db.execute('SELECT status FROM ft3_plan_months WHERE month=?',(month,)).fetchone()
    except sqlite3.OperationalError:
        return False
    return bool(r and r['status']=='released')

def _sources(hass,month):
    month=validate_month(month)
    planning=read_planning(hass.config.path('finance/household_v2.db'),month)
    # Ignore aggregate household estimate, calculated rows, transfers, and zeros.
    return [r for r in planning['rows'] if r['kind'] in ('income','expense')
            and r.get('amount_cents') is not None and r['amount_cents'] != 0]


def _linked_by_position(db,month):
    """Return active plan/actual allocations grouped by planning position."""
    rows=db.execute('''SELECT l.position_id,l.transaction_id,l.amount_cents AS linked_cents,
                              t.booked,t.description,t.kind,t.account_id,t.category_id,
                              ABS(t.amount_cents) AS transaction_cents
                       FROM ft4_plan_actual_links l
                       JOIN ft_transactions t ON t.id=l.transaction_id
                       WHERE l.month=? AND t.voided=0
                       ORDER BY t.booked,t.created,t.id''',(month,)).fetchall()
    grouped={}
    for row in rows:
        grouped.setdefault(row['position_id'],[]).append(dict(row))
    return grouped


def _actual_for_position(db,month,position_id):
    if not position_id:return 0
    row=db.execute('''SELECT COALESCE(SUM(l.amount_cents),0) AS total
                      FROM ft4_plan_actual_links l
                      JOIN ft_transactions t ON t.id=l.transaction_id
                      WHERE l.month=? AND l.position_id=? AND t.voided=0''',
                   (month,position_id)).fetchone()
    return int(row['total'] or 0)


def list_proposals(hass,month):
    month=validate_month(month)
    with _db(hass) as db:
        if not _released(db,month):
            return {'month':month,'released':False,'proposals':[],'accounts':[],
                    'note':'Buchungsvorschläge werden erst nach Freigabe des Monatsplans angezeigt.'}
        rows=_sources(hass,month)
        decisions={(r['source_name'],r['kind']):dict(r) for r in db.execute(
            'SELECT * FROM ft3_proposal_decisions WHERE month=?',(month,))}
        mapped={(r['source_name'],r['source_kind']):r['category_id'] for r in db.execute(
            'SELECT source_name,source_kind,category_id FROM ft3_category_mapping')}
        accounts=[dict(r) for r in db.execute('SELECT id,name,kind,opening_date,active FROM ft_accounts WHERE active=1 ORDER BY name')]
        assignments={r['position_id']:r['account_id'] for r in db.execute('SELECT position_id,account_id FROM ft3_plan_accounts WHERE month=?',(month,))} if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_accounts'").fetchone() else {}
        categories={r['position_id']:r['category_id'] for r in db.execute('SELECT position_id,category_id FROM ft3_plan_categories WHERE month=?',(month,))} if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_categories'").fetchone() else {}
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_template_plan_items'").fetchone():
            for r in db.execute('SELECT template_id,category_id,account_id FROM ft3_template_plan_items WHERE month=?',(month,)):
                key='tpl:'+r['template_id'];categories[key]=r['category_id'];assignments[key]=r['account_id']
        linked=_linked_by_position(db,month)
        out=[]
        for r in rows:
            kind=r['kind']; raw_amount=r['amount_cents']; key=(r['name'],kind)
            dec=decisions.get(key)
            position_id=r.get('position_id')
            planned_abs=abs(int(raw_amount))
            planned_cents=(-1 if kind=='expense' else 1)*planned_abs
            position_links=linked.get(position_id,[])
            actual_cents=sum(int(x['linked_cents']) for x in position_links)
            remaining_cents=max(0,planned_abs-actual_cents)
            if actual_cents>=planned_abs and planned_abs>0:
                status='confirmed'
            elif dec and dec['status']=='skipped' and actual_cents==0:
                status='skipped'
            else:
                status='open'
            transaction_ids=[]
            seen=set()
            for link in position_links:
                tid=link['transaction_id']
                if tid not in seen:
                    seen.add(tid);transaction_ids.append(tid)
            transaction_id=transaction_ids[0] if len(transaction_ids)==1 else None
            out.append({'source_name':r['name'],'kind':kind,'planned_cents':planned_cents,
                        'actual_cents':actual_cents,'remaining_cents':remaining_cents,
                        'position_id':position_id,'category_id':categories.get(position_id) or mapped.get(key),'account_id':assignments.get(position_id),'source_cell':r.get('source_cell'),
                        'lastschrift':(dict(db.execute('SELECT enabled,day,automatic FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,position_id)).fetchone()) if position_id and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft5_debit_positions'").fetchone() and db.execute('SELECT 1 FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,position_id)).fetchone() else None),
                        'status':status,'transaction_id':transaction_id,
                        'transaction_ids':transaction_ids,'linked_transactions':position_links,
                        'issue':None})
        return {'month':month,'released':True,'proposals':out,'accounts':accounts,
                'note':'Vorschlagsstatus und Restbetrag berücksichtigen ausdrücklich zugeordnete Plan-Ist-Buchungen. Vollständig gedeckte Planpositionen gelten als gebucht.'}


def decide(hass,data,actor=None):
    ledger=Ledger(hass,actor)
    month=validate_month(data.get('month'))
    source_name=str(data.get('source_name',''))
    kind=str(data.get('kind',''))
    action=str(data.get('action',''))
    if action not in ('confirm','skip','reopen') or kind not in ('expense','income'):
        raise HomeAssistantError('Ungültige Entscheidung')
    with _db(hass) as gate:
        if not _released(gate,month):raise HomeAssistantError('Monatsplan ist nicht freigegeben')
    matches=[r for r in _sources(hass,month) if r['name']==source_name and r['kind']==kind]
    if len(matches)!=1:
        raise HomeAssistantError('Planposition nicht eindeutig oder nicht vorhanden')
    row=matches[0]
    position_id=row.get('position_id')
    with _db(hass) as db:
        db.execute('BEGIN IMMEDIATE')
        if not _released(db,month):raise HomeAssistantError('Monatsplan ist nicht freigegeben')
        old=db.execute('SELECT status,transaction_id FROM ft3_proposal_decisions WHERE month=? AND source_name=? AND kind=?',
                       (month,source_name,kind)).fetchone()
        actual_before=_actual_for_position(db,month,position_id)
        planned_abs=abs(int(row['amount_cents']))
        if action=='reopen':
            if actual_before:
                raise HomeAssistantError('Position hat bereits Ist-Zuordnungen und kann nicht als entfallen wieder geöffnet werden')
            if not old: raise HomeAssistantError('Vorschlag ist bereits offen')
            if old['status']!='skipped' or old['transaction_id']:
                raise HomeAssistantError('Nur entfallene Vorschläge ohne Ist-Buchung können wieder geöffnet werden')
            db.execute('DELETE FROM ft3_proposal_decisions WHERE month=? AND source_name=? AND kind=?',(month,source_name,kind))
            ledger._audit(db,'proposal_reopen',{'month':month,'source_name':source_name,'kind':kind})
            return {'status':'open','transaction_id':None}
        if action=='skip' and actual_before:
            raise HomeAssistantError('Position hat bereits Ist-Zuordnungen und kann nicht als vollständig entfallen markiert werden')
        if action=='confirm' and actual_before>=planned_abs:
            raise HomeAssistantError('Planposition ist bereits vollständig durch Ist-Buchungen gedeckt')
        transaction_id=None
        if action=='confirm':
            booking_kind=str(data.get('booking_kind') or kind)
            if booking_kind not in ('expense','income'):raise HomeAssistantError('Ungültige Buchungsart')
            booked=validate_day(data.get('booked'))
            if booked[:7]!=month: raise HomeAssistantError('Buchungsdatum muss im Planmonat liegen')
            account_id=str(data.get('account_id',''))
            account=db.execute('SELECT * FROM ft_accounts WHERE id=? AND active=1',(account_id,)).fetchone()
            if not account: raise HomeAssistantError('Bitte ein gültiges Konto wählen')
            if booked<account['opening_date']: raise HomeAssistantError('Buchung vor Kontoeröffnung')
            Ledger(hass)._ensure_open(db,booked,[account_id])
            amount=abs(int(data.get('amount_cents',0)))
            if amount<=0 or amount>100000000000: raise HomeAssistantError('Ungültiger Ist-Betrag')
            description=str(data.get('description') or source_name).strip()
            if not description or len(description)>240: raise HomeAssistantError('Ungültige Beschreibung')
            category=db.execute('SELECT category_id FROM ft3_category_mapping WHERE source_name=? AND source_kind=?',(source_name,kind)).fetchone()
            category_id=data.get('category_id') or None
            if not category_id and position_id and position_id.startswith('tpl:'):
                c=db.execute('SELECT category_id FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,position_id[4:])).fetchone()
                category_id=c['category_id'] if c else None
            if not category_id and position_id:
                c=db.execute('SELECT category_id FROM ft3_plan_categories WHERE month=? AND position_id=?',(month,position_id)).fetchone()
                category_id=c['category_id'] if c else None
            if not category_id:category_id=category['category_id'] if category else None
            if booking_kind!=kind and not data.get('category_id'):category_id=None
            if category_id:Ledger(hass)._validate_category(db,category_id,booking_kind)
            signed=amount if booking_kind=='income' else -amount
            transaction_id=uuid4().hex
            db.execute('INSERT INTO ft_transactions VALUES(?,?,?,?,?,?,?,?,?,0)',
                       (transaction_id,booked,account_id,category_id,booking_kind,signed,description,None,now()))
            ledger.record_creator(db,transaction_id)
            # Confirmation of this specific planning proposal explicitly authorizes the
            # corresponding plan/actual link. Changed booking kinds are not auto-matched.
            if position_id and booking_kind==kind:
                db.execute('INSERT INTO ft4_plan_actual_links VALUES(?,?,?,?,?,?)',
                           (uuid4().hex,month,position_id,transaction_id,amount,now()))
        decision_status='confirmed' if action=='confirm' else 'skipped'
        db.execute('''INSERT INTO ft3_proposal_decisions(month,source_name,kind,status,transaction_id,decided)
                      VALUES(?,?,?,?,?,?)
                      ON CONFLICT(month,source_name,kind) DO UPDATE SET
                        status=excluded.status,transaction_id=excluded.transaction_id,decided=excluded.decided''',
                   (month,source_name,kind,decision_status,transaction_id,now()))
        actual_after=_actual_for_position(db,month,position_id)
        effective_status='confirmed' if actual_after>=planned_abs and planned_abs>0 else ('skipped' if action=='skip' and actual_after==0 else 'open')
        ledger._audit(db,'proposal_'+action,{'month':month,'source_name':source_name,'kind':kind,
            'transaction_id':transaction_id,'booking_kind':booking_kind if action=='confirm' else None,
            'planned_cents':row['amount_cents'],'actual_before_cents':actual_before,'actual_after_cents':actual_after,
            'remaining_after_cents':max(0,planned_abs-actual_after)})
        return {'status':effective_status,'transaction_id':transaction_id,
                'actual_cents':actual_after,'remaining_cents':max(0,planned_abs-actual_after)}
