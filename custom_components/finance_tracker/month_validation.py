"""Read-only monthly integrity and plan/actual validation (Finance Tracker 4.0/2.1).

No database migrations or financial mutations are performed by this endpoint.
"""
from __future__ import annotations
import sqlite3
from collections import defaultdict
from datetime import date, timedelta
from pathlib import Path
from homeassistant.exceptions import HomeAssistantError
from .ledger import validate_month


def _exists(db, table):
    return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone())


def _columns(db, table):
    return {r['name'] for r in db.execute('PRAGMA table_info('+table+')')} if _exists(db,table) else set()


def validate_month_report(hass, month):
    month=validate_month(month)
    path=Path(hass.config.path('finance/household_v2.db'))
    if not path.is_file():
        raise HomeAssistantError('Finanzdatenbank nicht vorhanden')
    first=date.fromisoformat(month+'-01')
    end=(date(first.year+1,1,1) if first.month==12 else date(first.year,first.month+1,1))
    end_day=(end-timedelta(days=1)).isoformat()
    findings=[]
    def emit(code,severity,message,**detail):
        findings.append({'code':code,'severity':severity,'message':message,**detail})
    # SQLite URI mode=ro guarantees this command never creates or modifies a database.
    with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=10) as db:
        db.row_factory=sqlite3.Row
        db.execute('PRAGMA query_only=ON')
        db.execute('BEGIN')
        required=('ft_accounts','ft_transactions','ft_closings')
        if any(not _exists(db,t) for t in required):
            raise HomeAssistantError('Finanzdatenbank unvollständig; Ledger initialisieren')
        accounts=[dict(r) for r in db.execute('SELECT * FROM ft_accounts')]
        account_ids={a['id'] for a in accounts}
        categories={r['id']:r['kind'] for r in db.execute('SELECT id,kind FROM ft_categories')} if _exists(db,'ft_categories') else {}
        transactions=[dict(r) for r in db.execute('SELECT * FROM ft_transactions WHERE booked>=? AND booked<? AND voided=0',(first.isoformat(),end.isoformat()))]
        tx_ids={t['id'] for t in transactions}
        for t in transactions:
            if t['account_id'] not in account_ids:
                emit('BK-01','error','Buchung verweist auf unbekanntes Konto',transaction_id=t['id'],account_id=t['account_id'])
            if t['kind'] not in ('income','expense','transfer') or t['amount_cents']==0 or (t['kind']=='income' and t['amount_cents']<0) or (t['kind']=='expense' and t['amount_cents']>0):
                emit('BK-02','error','Ungültiger Buchungstyp oder Betrag',transaction_id=t['id'])
            if not t['category_id'] and t['kind']!='transfer':
                emit('BK-03','warning','Buchung ohne Kategorie',transaction_id=t['id'])
            elif t['category_id'] and (t['category_id'] not in categories or categories[t['category_id']]!=t['kind']):
                emit('BK-01','error','Ungültige Buchungskategorie',transaction_id=t['id'])
        # Include counterpart legs outside the requested month to identify split-month transfers.
        transfer_ids={t['transfer_id'] for t in transactions if t['kind']=='transfer' and t['transfer_id']}
        for transfer_id in transfer_ids:
            legs=[dict(r) for r in db.execute('SELECT * FROM ft_transactions WHERE transfer_id=? AND voided=0',(transfer_id,))]
            if len(legs)!=2 or any(t['kind']!='transfer' for t in legs):
                emit('UB-01','error','Umbuchung hat nicht genau zwei aktive Seiten',transfer_id=transfer_id)
                continue
            if sum(t['amount_cents'] for t in legs)!=0 or legs[0]['amount_cents']==0:
                emit('UB-02','error','Umbuchungsbeträge sind nicht gegengleich',transfer_id=transfer_id)
            if legs[0]['account_id']==legs[1]['account_id']:
                emit('UB-03','error','Quell- und Zielkonto sind identisch',transfer_id=transfer_id)
            if any(t['booked'][:7]!=month for t in legs):
                emit('PE-01','error','Umbuchungsseiten liegen in unterschiedlichen Monaten',transfer_id=transfer_id)
        for t in transactions:
            if t['kind']=='transfer' and not t['transfer_id']:
                emit('UB-01','error','Umbuchung ohne Paar-ID',transaction_id=t['id'])
        if _exists(db,'ft4_plan_actual_links'):
            links=[dict(r) for r in db.execute('SELECT * FROM ft4_plan_actual_links WHERE month=? OR transaction_id IN (SELECT id FROM ft_transactions WHERE booked>=? AND booked<?)',(month,first.isoformat(),end.isoformat()))]
            totals=defaultdict(int)
            all_linked={r['transaction_id'] for r in links}
            all_tx={r['id']:dict(r) for r in db.execute('SELECT * FROM ft_transactions WHERE id IN (SELECT transaction_id FROM ft4_plan_actual_links WHERE month=? OR transaction_id IN (SELECT id FROM ft_transactions WHERE booked>=? AND booked<?))',(month,first.isoformat(),end.isoformat()))}
            for link in links:
                tx=all_tx.get(link['transaction_id'])
                if not tx or tx['voided']:
                    emit('PI-04','error','Planzuordnung verweist auf fehlende oder stornierte Buchung',link_id=link['id'],position_id=link.get('position_id'),transaction_id=link.get('transaction_id'))
                    continue
                if link['amount_cents']<=0:
                    emit('PI-03','error','Ungültiger Zuordnungsbetrag',link_id=link['id'],position_id=link.get('position_id'),transaction_id=link.get('transaction_id'))
                totals[tx['id']]+=link['amount_cents']
                if link['month']!=tx['booked'][:7]:
                    emit('PE-01','error','Planzuordnung gehört nicht zum Buchungsmonat',link_id=link['id'],position_id=link.get('position_id'),transaction_id=link.get('transaction_id'))
                if tx['kind']=='transfer' and tx['amount_cents']>0:
                    emit('PI-04','error','Planzuordnung verweist auf Eingangsseite einer Umbuchung',link_id=link['id'],position_id=link.get('position_id'),transaction_id=link.get('transaction_id'))
            for tid,total in totals.items():
                if total>abs(all_tx[tid]['amount_cents']):
                    emit('PI-03','error','Buchung ist mehrfach über ihren Betrag hinaus zugeordnet',transaction_id=tid,allocated_cents=total)
            for t in transactions:
                if t['kind'] in ('income','expense') or (t['kind']=='transfer' and t['amount_cents']<0):
                    remainder=max(0,abs(t['amount_cents'])-totals[t['id']])
                    if remainder:
                        emit('PI-01','warning','Buchung nicht vollständig einer Planposition zugeordnet',transaction_id=t['id'],amount_cents=remainder)
        else:
            emit('PI-01','warning','Plan-Ist-Zuordnungen sind noch nicht eingerichtet')
        closings={r['account_id']:dict(r) for r in db.execute('SELECT * FROM ft_closings WHERE month=?',(month,))}
        tolerance_available='tolerance_cents' in _columns(db,'ft_account_meta')
        closing_tolerance='tolerance_cents' in _columns(db,'ft_closings')
        # Account-owner grouping and previous-month reference use the same read transaction.
        meta_rows={}
        if _exists(db,'ft_account_meta'):
            meta_rows={r['account_id']:dict(r) for r in db.execute('SELECT * FROM ft_account_meta')}
        previous_day=(first-timedelta(days=1)).isoformat()
        previous_month=previous_day[:7]
        previous_closings={r['account_id']:dict(r) for r in db.execute('SELECT * FROM ft_closings WHERE month=?',(previous_month,))}
        account_results=[]
        for a in accounts:
            if a['opening_date']>end_day:
                continue
            aid=a['id']
            balance=a['opening_cents']+db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft_transactions WHERE account_id=? AND booked<=? AND voided=0',(aid,end_day)).fetchone()[0]
            tol=0
            if tolerance_available:
                r=db.execute('SELECT tolerance_cents FROM ft_account_meta WHERE account_id=?',(aid,)).fetchone()
                if r: tol=int(r[0])
            closing=closings.get(aid)
            status='not_checkable'
            diff=None
            if closing:
                # Historic closing is assessed against its frozen tolerance, not a new setting.
                effective=int(closing['tolerance_cents']) if closing_tolerance else 0
                diff=int(closing['actual_cents'])-balance
                if abs(diff)>effective:
                    status='error'
                    emit('KO-01','error','Kontostand weicht vom bestätigten Abschluss ab',account_id=aid,difference_cents=diff,tolerance_cents=effective)
                else:
                    status='warning' if diff else 'passed'
                    if diff: emit('KO-01','warning','Kontodifferenz liegt innerhalb der dokumentierten Toleranz',account_id=aid,difference_cents=diff,tolerance_cents=effective)
            else:
                emit('KO-02','not_checkable','Bestätigter Kontostand fehlt',account_id=aid,calculated_cents=balance,tolerance_cents=tol)
            previous_balance=(a['opening_cents']+db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft_transactions WHERE account_id=? AND booked<=? AND voided=0',(aid,previous_day)).fetchone()[0]) if a['opening_date']<=previous_day else None
            movement=db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft_transactions WHERE account_id=? AND booked>=? AND booked<? AND voided=0',(aid,first.isoformat(),end.isoformat())).fetchone()[0]
            meta=meta_rows.get(aid,{})
            owner=meta.get('owner') or 'Nicht zugeordnet'
            prev=previous_closings.get(aid)
            account_results.append({'account_id':aid,'name':meta.get('display_name') or a['name'],'owner':owner,'bank':meta.get('bank') or '', 'account_type':meta.get('account_type') or '',
              'previous_month':previous_month,'previous_calculated_cents':previous_balance,
              'previous_confirmed_cents':prev['actual_cents'] if prev else None,
              'movement_cents':movement,'calculated_cents':balance,
              'confirmed_cents':closing['actual_cents'] if closing else None,'difference_cents':diff,
              'tolerance_cents':int(closing['tolerance_cents']) if closing and closing_tolerance else (0 if closing else tol),
              'status':status,'closed_at':closing['closed'] if closing else None})
        # A closed period must not silently drift after confirmation.
        for a in account_results:
            c=closings.get(a['account_id'])
            if c and a['calculated_cents']!=c['calculated_cents']:
                emit('PE-02','error','Buchungsbestand hat sich seit Kontenabschluss verändert',account_id=a['account_id'])
        counts={s:sum(f['severity']==s for f in findings) for s in ('error','warning','not_checkable')}
        ready=counts['error']==0 and counts['not_checkable']==0
        return {'month':month,'ready':ready,'status':'ready' if ready else 'blocked','counts':counts,'checked_transactions':len(transactions),'transaction_accounts':{t['id']:t['account_id'] for t in transactions},'accounts':account_results,'findings':findings,'read_only':True,'note':'Offene Plan-Ist-Zuordnungen sind nicht blockierend. Konten ohne bestätigten Iststand bleiben nicht prüfbar.'}
