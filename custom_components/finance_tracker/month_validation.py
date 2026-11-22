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
from .closing_balance import balance as reference_balance


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
        drafts={r["account_id"]:r["actual_cents"] for r in db.execute("SELECT * FROM ft_closing_drafts WHERE month=?",(month,))} if _exists(db,"ft_closing_drafts") else {}
        account_results=[]
        for a in accounts:
            if a['opening_date']>end_day or (not a['active'] and a['id'] not in closings):
                continue
            aid=a['id']
            balance=reference_balance(db,a,month+'-31',False)
            tol=0
            if tolerance_available:
                r=db.execute('SELECT tolerance_cents FROM ft_account_meta WHERE account_id=?',(aid,)).fetchone()
                if r: tol=int(r[0])
            closing=closings.get(aid)
            status='not_checkable'
            diff=None
            actual=drafts.get(aid,closing['actual_cents'] if closing else None)
            if actual is not None:
                diff=actual-balance
                status='warning' if diff else 'passed'
            else:
                emit('KO-02','not_checkable','Tatsächlicher Kontostand fehlt',account_id=aid)
            previous_balance=reference_balance(db,a,previous_month+'-31') if a['opening_date']<=previous_day else None
            movement=db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft_transactions WHERE account_id=? AND booked>=? AND booked<? AND voided=0',(aid,first.isoformat(),end.isoformat())).fetchone()[0]
            meta=meta_rows.get(aid,{})
            owner=meta.get('owner') or 'Nicht zugeordnet'
            prev=previous_closings.get(aid)
            account_results.append({'account_id':aid,'name':meta.get('display_name') or a['name'],'owner':owner,'bank':meta.get('bank') or '', 'account_type':meta.get('account_type') or '',
              'previous_month':previous_month,'previous_calculated_cents':previous_balance,
              'previous_confirmed_cents':prev['actual_cents'] if prev else None,
              'movement_cents':movement,'calculated_cents':balance,
              'confirmed_cents':actual,'difference_cents':diff,
              'tolerance_cents':int(closing['tolerance_cents']) if closing and closing_tolerance else (0 if closing else tol),
              'status':status,'closed_at':closing['closed'] if closing else None})
        # Resolve user-facing references within the same read-only snapshot.
        names={r['id']:r['name'] for r in db.execute('SELECT id,name FROM ft_categories')} if _exists(db,'ft_categories') else {}
        account_lookup={a['id']:a for a in accounts}
        def account_detail(aid):
            a=account_lookup.get(aid)
            if not a: return None
            meta=meta_rows.get(aid,{})
            return {'name':meta.get('display_name') or a['name'], 'owner':meta.get('owner') or 'Nicht zugeordnet', 'bank':meta.get('bank') or ''}
        tx_cache={t['id']:t for t in transactions}
        def tx_detail(tid):
            if tid not in tx_cache:
                row=db.execute('SELECT * FROM ft_transactions WHERE id=?',(tid,)).fetchone()
                tx_cache[tid]=dict(row) if row else None
            t=tx_cache[tid]
            if not t: return None
            cid=t['category_id']
            return {'description':t['description'], 'booked':t['booked'], 'kind':t['kind'], 'amount_cents':t['amount_cents'], 'voided':bool(t['voided']), 'account':account_detail(t['account_id']), 'category':names.get(cid) if cid else None, 'category_missing':not bool(cid), 'category_unknown':bool(cid and cid not in names)}
        transfer_cache={}
        link_lookup={l['id']:l for l in links} if _exists(db,'ft4_plan_actual_links') else {}
        for f in findings:
            if f.get('account_id'): f['account_detail']=account_detail(f['account_id'])
            if f.get('transaction_id'): f['transaction_detail']=tx_detail(f['transaction_id'])
            if f.get('transfer_id'):
                tid=f['transfer_id']
                if tid not in transfer_cache:
                    transfer_cache[tid]=[tx_detail(r['id']) for r in db.execute('SELECT id FROM ft_transactions WHERE transfer_id=? ORDER BY amount_cents,booked,id',(tid,))]
                f['transfer_details']=transfer_cache[tid]
            link=link_lookup.get(f.get('link_id'))
            if link:
                f['allocation_detail']={'month':link['month'],'amount_cents':link['amount_cents']}
        if _exists(db,'ft5_debit_positions'):
            for d in db.execute('SELECT * FROM ft5_debit_positions WHERE month=? AND enabled=1',(month,)):
                pid=d['position_id']
                if pid.startswith('tpl:'):
                    name_row=db.execute('SELECT name FROM ft3_templates WHERE id=?',(pid[4:],)).fetchone()
                else:
                    name_row=db.execute('SELECT name FROM ft3_positions WHERE id=?',(pid,)).fetchone()
                name=name_row[0] if name_row else 'Unbekannte Planposition'
                if d['automatic'] and _exists(db,'ft5_debit_failures'):
                    failure=db.execute('SELECT reason FROM ft5_debit_failures WHERE month=? AND position_id=?',(month,pid)).fetchone()
                    if failure:emit('LS-02','warning','Automatische Lastschrift nicht verbucht: '+name,position_name=name,reason=failure[0])
                if not d['day']:continue
                due=date(first.year,first.month,min(d['day'],(end-timedelta(days=1)).day))
                if date.today()<=due:continue
                linked=db.execute('SELECT 1 FROM ft4_plan_actual_links l JOIN ft_transactions t ON t.id=l.transaction_id WHERE l.month=? AND l.position_id=? AND t.voided=0',(month,pid)).fetchone() if _exists(db,'ft4_plan_actual_links') else None
                run=db.execute('SELECT 1 FROM ft5_debit_runs WHERE month=? AND position_id=?',(month,pid)).fetchone() if _exists(db,'ft5_debit_runs') else None
                if not linked and not run:emit('LS-01','warning','Lastschrift überfällig: '+name,position_name=name,expected_day=d['day'],account_detail=account_detail(d['account_id']))
        counts={s:sum(f['severity']==s for f in findings) for s in ('error','warning','not_checkable')}
        ready=counts['error']==0 and counts['not_checkable']==0
        return {'month':month,'closed':bool(account_results) and all(a['closed_at'] for a in account_results),'booked_cents':sum(t['amount_cents'] for t in transactions),'ready':ready,'status':'ready' if ready else 'blocked','counts':counts,'checked_transactions':len(transactions),'transaction_accounts':{t['id']:t['account_id'] for t in transactions},'accounts':account_results,'findings':findings,'read_only':True,'note':'Offene Plan-Ist-Zuordnungen sind nicht blockierend. Konten ohne bestätigten Iststand bleiben nicht prüfbar.'}
