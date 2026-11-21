"""Finance Tracker 2.0: independent household cash ledger.

All monetary amounts are signed integer cents; transfer pairs are atomic.
"""
from __future__ import annotations

import sqlite3
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4
from homeassistant.exceptions import HomeAssistantError
from .finance_v3 import SCHEMA_V3

SCHEMA = '''
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS ft_accounts(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,opening_cents INTEGER NOT NULL,opening_date TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ft_categories(id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,UNIQUE(name,kind));
CREATE TABLE IF NOT EXISTS ft_transactions(id TEXT PRIMARY KEY,booked TEXT NOT NULL,account_id TEXT NOT NULL,category_id TEXT,kind TEXT NOT NULL,amount_cents INTEGER NOT NULL,description TEXT NOT NULL,transfer_id TEXT,created TEXT NOT NULL,voided INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(account_id) REFERENCES ft_accounts(id),FOREIGN KEY(category_id) REFERENCES ft_categories(id));
CREATE INDEX IF NOT EXISTS idx_ft_transactions_date ON ft_transactions(booked);
CREATE INDEX IF NOT EXISTS idx_ft_transactions_account ON ft_transactions(account_id);
CREATE TABLE IF NOT EXISTS ft_closings(month TEXT NOT NULL,account_id TEXT NOT NULL,actual_cents INTEGER NOT NULL,calculated_cents INTEGER NOT NULL,closed TEXT NOT NULL,PRIMARY KEY(month,account_id),FOREIGN KEY(account_id) REFERENCES ft_accounts(id));
CREATE TABLE IF NOT EXISTS ft_audit(id TEXT PRIMARY KEY,at TEXT NOT NULL,action TEXT NOT NULL,payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ft_recurring(id TEXT PRIMARY KEY,name TEXT NOT NULL,account_id TEXT NOT NULL,category_id TEXT,kind TEXT NOT NULL,amount_cents INTEGER NOT NULL,description TEXT NOT NULL,day_of_month INTEGER NOT NULL,start_month TEXT NOT NULL,end_month TEXT,active INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,FOREIGN KEY(account_id) REFERENCES ft_accounts(id));
CREATE TABLE IF NOT EXISTS ft_recurring_runs(template_id TEXT NOT NULL,month TEXT NOT NULL,transaction_id TEXT NOT NULL,PRIMARY KEY(template_id,month),FOREIGN KEY(template_id) REFERENCES ft_recurring(id),FOREIGN KEY(transaction_id) REFERENCES ft_transactions(id));
CREATE TABLE IF NOT EXISTS ft_budgets(month TEXT NOT NULL,category_id TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),PRIMARY KEY(month,category_id),FOREIGN KEY(category_id) REFERENCES ft_categories(id));
'''


def now():
    return datetime.now(timezone.utc).isoformat()


def validate_day(value):
    try:
        return date.fromisoformat(str(value)).isoformat()
    except ValueError as exc:
        raise HomeAssistantError('Ungültiges Datum (JJJJ-MM-TT)') from exc


def validate_month(value):
    value = str(value)
    if len(value) != 7 or value[4] != '-':
        raise HomeAssistantError('Ungültiger Monat')
    try:
        date.fromisoformat(value + '-01')
    except ValueError as exc:
        raise HomeAssistantError('Ungültiger Monat') from exc
    return value


class Ledger:
    def __init__(self, hass):
        self.path = Path(hass.config.path('finance/household_v2.db'))

    def _db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA busy_timeout=5000')
        db.executescript(SCHEMA)
        db.executescript(SCHEMA_V3)
        db.execute('CREATE TABLE IF NOT EXISTS ft_amount_expressions(transaction_id TEXT PRIMARY KEY,expression TEXT NOT NULL,FOREIGN KEY(transaction_id) REFERENCES ft_transactions(id))')
        # V2.3: retain every recurring execution, including voided transactions.
        # Existing UNIQUE(template_id,month) must be removed without losing rows.
        cols = [r['name'] for r in db.execute('PRAGMA table_info(ft_recurring_runs)')]
        if 'id' not in cols:
            with db:
                db.execute('ALTER TABLE ft_recurring_runs RENAME TO ft_recurring_runs_legacy')
                db.execute('CREATE TABLE ft_recurring_runs(id TEXT PRIMARY KEY,template_id TEXT NOT NULL,month TEXT NOT NULL,transaction_id TEXT NOT NULL UNIQUE,FOREIGN KEY(template_id) REFERENCES ft_recurring(id),FOREIGN KEY(transaction_id) REFERENCES ft_transactions(id))')
                for row in db.execute('SELECT template_id,month,transaction_id FROM ft_recurring_runs_legacy').fetchall():
                    db.execute('INSERT INTO ft_recurring_runs VALUES(?,?,?,?)',(uuid4().hex,row['template_id'],row['month'],row['transaction_id']))
                db.execute('DROP TABLE ft_recurring_runs_legacy')
        db.execute('CREATE INDEX IF NOT EXISTS idx_ft_recurring_runs_month ON ft_recurring_runs(template_id,month)')
        cols_closing={r['name'] for r in db.execute('PRAGMA table_info(ft_closings)')}
        if 'tolerance_cents' not in cols_closing: db.execute('ALTER TABLE ft_closings ADD COLUMN tolerance_cents INTEGER NOT NULL DEFAULT 0')
        if 'difference_cents' not in cols_closing: db.execute('ALTER TABLE ft_closings ADD COLUMN difference_cents INTEGER NOT NULL DEFAULT 0')
        return db

    def _attach_expressions(self, db, transactions):
        ids=[t['id'] for t in transactions if t.get('id')]
        if not ids:return
        for start in range(0,len(ids),500):
            batch=ids[start:start+500]
            rows=db.execute('SELECT transaction_id,expression FROM ft_amount_expressions WHERE transaction_id IN ('+','.join('?' for _ in batch)+')',batch).fetchall()
            lookup={r['transaction_id']:r['expression'] for r in rows}
            for t in transactions:
                if t.get('id') in lookup:t['amount_expression']=lookup[t['id']]

    def _save_expression(self,db,ident,data,amount):
        expression=str(data.get('amount_expression') or '').strip()
        if not expression:return
        import ast
        from decimal import Decimal, ROUND_HALF_UP, InvalidOperation
        if len(expression)>160:raise HomeAssistantError('Berechnung zu lang')
        expr=expression.replace(',','.').replace(':','/')
        try:
            node=ast.parse(expr,mode='eval')
            def calc(n,depth=0):
                if depth>25:raise ValueError()
                if isinstance(n,ast.Expression):return calc(n.body,depth+1)
                if isinstance(n,ast.Constant) and type(n.value) in (int,float):return Decimal(str(n.value))
                if isinstance(n,ast.UnaryOp) and isinstance(n.op,(ast.UAdd,ast.USub)):
                    v=calc(n.operand,depth+1);return -v if isinstance(n.op,ast.USub) else v
                if isinstance(n,ast.BinOp) and isinstance(n.op,(ast.Add,ast.Sub,ast.Mult,ast.Div)):
                    a,b=calc(n.left,depth+1),calc(n.right,depth+1)
                    if isinstance(n.op,ast.Add):return a+b
                    if isinstance(n.op,ast.Sub):return a-b
                    if isinstance(n.op,ast.Mult):return a*b
                    return a/b
                raise ValueError()
            result=calc(node)
            computed=int((abs(result)*100).quantize(Decimal('1'),rounding=ROUND_HALF_UP))
            if computed!=amount:raise ValueError()
        except (ValueError,SyntaxError,InvalidOperation,ArithmeticError,OverflowError) as exc:
            raise HomeAssistantError('Betragsgleichung ist ungültig oder stimmt nicht mit dem Buchungsbetrag überein') from exc
        db.execute('INSERT OR REPLACE INTO ft_amount_expressions(transaction_id,expression) VALUES(?,?)',(ident,expression))

    def _audit(self, db, action, payload):
        import json
        db.execute('INSERT INTO ft_audit VALUES(?,?,?,?)',(uuid4().hex,now(),action,json.dumps(payload,ensure_ascii=False)))

    def _ensure_open(self, db, booked, account_ids):
        month = booked[:7]
        for account_id in account_ids:
            if db.execute('SELECT 1 FROM ft_closings WHERE month>=? AND account_id=?',(month,account_id)).fetchone():
                raise HomeAssistantError('Dieser oder ein späterer Monat ist für das Konto bereits abgeschlossen')

    def _account(self, db, account_id):
        row = db.execute('SELECT * FROM ft_accounts WHERE id=? AND active=1',(account_id,)).fetchone()
        if row is None:
            raise HomeAssistantError('Konto nicht gefunden oder inaktiv')
        return row

    def _balance(self, db, account, through=None):
        clause = ' AND booked<=?' if through else ''
        params = (account['id'], through) if through else (account['id'],)
        row = db.execute('SELECT COALESCE(SUM(amount_cents),0) AS total FROM ft_transactions WHERE account_id=? AND voided=0'+clause,params).fetchone()
        return account['opening_cents'] + row['total']

    def _transaction(self, db, transaction_id):
        row = db.execute('SELECT * FROM ft_transactions WHERE id=? AND voided=0', (transaction_id,)).fetchone()
        if row is None:
            raise HomeAssistantError('Buchung nicht gefunden oder bereits storniert')
        return row

    def _validate_category(self, db, category_id, kind):
        if category_id:
            category = db.execute('SELECT kind FROM ft_categories WHERE id=?', (category_id,)).fetchone()
            if category is None or category['kind'] != kind:
                raise HomeAssistantError('Kategorie passt nicht zur Buchung')

    def execute(self, op, data):
        with self._db() as db:
            if op == 'overview':
                accounts = [dict(r) for r in db.execute('SELECT * FROM ft_accounts ORDER BY name')]
                for a in accounts:
                    a['balance_cents'] = self._balance(db,a)
                categories = [dict(r) for r in db.execute('SELECT * FROM ft_categories ORDER BY kind,name')]
                month = validate_month(data.get('month') or date.today().strftime('%Y-%m'))
                transactions = [dict(r) for r in db.execute('''SELECT t.*,a.name AS account_name,c.name AS category_name FROM ft_transactions t JOIN ft_accounts a ON a.id=t.account_id LEFT JOIN ft_categories c ON c.id=t.category_id WHERE t.booked LIKE ? AND t.voided=0 ORDER BY t.booked DESC,t.created DESC LIMIT 500''',(month+'%',))]
                # One visual record for each atomic transfer pair. Ledger rows remain intact.
                transfers={}
                combined=[]
                for tx in transactions:
                    if tx['kind']!='transfer':
                        combined.append(tx)
                        continue
                    pair=transfers.setdefault(tx['transfer_id'],[])
                    pair.append(tx)
                for pair in transfers.values():
                    if len(pair)!=2 or sum(t['amount_cents'] for t in pair)!=0:
                        # Corrupt/partial transfers remain visible rather than disappearing.
                        combined.extend(pair)
                        continue
                    outgoing=next(t for t in pair if t['amount_cents']<0)
                    incoming=next(t for t in pair if t['amount_cents']>0)
                    displayed=dict(outgoing)
                    displayed.update(from_id=outgoing['account_id'],to_id=incoming['account_id'],
                                     from_name=outgoing['account_name'],to_name=incoming['account_name'],
                                     amount_cents=abs(outgoing['amount_cents']))
                    combined.append(displayed)
                transactions=sorted(combined,key=lambda t:(t['booked'],t['created']),reverse=True)
                self._attach_expressions(db, transactions)
                income = sum(t['amount_cents'] for t in transactions if t['kind']=='income')
                expense = -sum(t['amount_cents'] for t in transactions if t['kind']=='expense')
                closings = [dict(r) for r in db.execute('SELECT * FROM ft_closings WHERE month=?',(month,))]
                locked_accounts = [r['account_id'] for r in db.execute('SELECT DISTINCT account_id FROM ft_closings WHERE month>=?',(month,))]
                recurring = [dict(r) for r in db.execute('SELECT * FROM ft_recurring ORDER BY name')]
                audit_count = db.execute('SELECT COUNT(*) AS n FROM ft_audit').fetchone()['n']
                return {'recurring':recurring,'audit_count':audit_count,'accounts':accounts,'categories':categories,'transactions':transactions,'closings':closings,'month':month,'income_cents':income,'expense_cents':expense,'total_cents':sum(a['balance_cents'] for a in accounts),'transactions_truncated':len(transactions)==500,'locked_accounts':locked_accounts}
            if op == 'audit_log':
                limit = min(max(int(data.get('limit',300)),1),500)
                month_raw=data.get('month')
                month=validate_month(month_raw) if month_raw else None
                import json
                scope=str(data.get('scope') or '')
                if scope=='booking_changes':
                    account_names={r['id']:r['name'] for r in db.execute('SELECT id,name FROM ft_accounts')}
                    category_names={r['id']:r['name'] for r in db.execute('SELECT id,name FROM ft_categories')}
                    kind_names={'expense':'Ausgabe','income':'Einnahme','transfer':'Umbuchung'}
                    def account_name(ident):
                        return account_names.get(ident) if ident else 'Ohne Konto'
                    def category_name(ident):
                        return category_names.get(ident) if ident else 'Ohne Kategorie'
                    def position_name(ident,month_hint=None):
                        ident=str(ident or '')
                        if not ident:return 'Ohne Planbezug'
                        if ident.startswith('tpl:'):
                            row=db.execute('SELECT name FROM ft3_templates WHERE id=?',(ident[4:],)).fetchone() if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_templates'").fetchone() else None
                        else:
                            row=db.execute('SELECT name FROM ft3_positions WHERE id=?',(ident,)).fetchone() if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_positions'").fetchone() else None
                        return row['name'] if row else ident
                    def tx_row(ident):
                        if not ident:return None
                        row=db.execute('SELECT * FROM ft_transactions WHERE id=?',(str(ident),)).fetchone()
                        return dict(row) if row else None
                    def event_month_match(action,payload):
                        if not month:return True
                        candidates=set()
                        if action=='edit_transaction':
                            for obj in (payload.get('before') or {},payload.get('after') or {}):
                                booked=obj.get('booked') if isinstance(obj,dict) else None
                                if isinstance(booked,str) and len(booked)>=7:candidates.add(booked[:7])
                        elif action=='edit_transfer':
                            before=payload.get('before') or []
                            for obj in before if isinstance(before,list) else []:
                                booked=obj.get('booked') if isinstance(obj,dict) else None
                                if isinstance(booked,str) and len(booked)>=7:candidates.add(booked[:7])
                            booked=(payload.get('after') or {}).get('booked') if isinstance(payload.get('after'),dict) else None
                            if isinstance(booked,str) and len(booked)>=7:candidates.add(booked[:7])
                        elif action=='void_transaction':
                            for obj in payload.get('before') or []:
                                booked=obj.get('booked') if isinstance(obj,dict) else None
                                if isinstance(booked,str) and len(booked)>=7:candidates.add(booked[:7])
                        elif action.startswith('plan_actual_'):
                            m=payload.get('month')
                            if isinstance(m,str):candidates.add(m[:7])
                        return month in candidates
                    def initial_plan_assignment(row,payload):
                        if payload.get('origin')=='booking_create':return True
                        tx=tx_row(payload.get('transaction_id'))
                        if not tx or not tx.get('created') or not row.get('at'):return False
                        try:
                            return abs((datetime.fromisoformat(row['at'])-datetime.fromisoformat(tx['created'])).total_seconds())<=30
                        except (TypeError,ValueError):
                            return False
                    events=[]
                    def add_change(row,change_type,label,subject,before_text='',after_text='',reason='',booked=None,amount_cents=None,transaction_id=None,payload=None):
                        events.append({'id':f"{row['id']}:{change_type}:{len(events)}",'at':row['at'],'action':row['action'],
                                       'change_type':change_type,'change_label':label,'subject':subject or 'Buchung',
                                       'before_text':str(before_text or ''),'after_text':str(after_text or ''),'reason':str(reason or '').strip(),
                                       'booked':booked,'amount_cents':amount_cents,'transaction_id':transaction_id,'payload':payload or {}})
                    for raw in db.execute('SELECT * FROM ft_audit ORDER BY at DESC,id DESC'):
                        row=dict(raw);payload=json.loads(row['payload']);action=row['action']
                        if action not in ('edit_transaction','edit_transfer','void_transaction','plan_actual_assign','plan_actual_remove','plan_actual_remove_transaction'):
                            continue
                        if not event_month_match(action,payload):continue
                        reason=str(payload.get('reason') or '').strip()
                        if action=='edit_transaction':
                            before=payload.get('before') or {};after=payload.get('after') or {}
                            if not isinstance(before,dict) or not isinstance(after,dict):continue
                            subject=str(after.get('description') or before.get('description') or 'Buchung')
                            tid=payload.get('id');booked=after.get('booked') or before.get('booked')
                            if before.get('account_id')!=after.get('account_id'):
                                add_change(row,'account','Konto',subject,account_name(before.get('account_id')),account_name(after.get('account_id')),reason,booked,transaction_id=tid,payload=payload)
                            if int(before.get('amount_cents') or 0)!=int(after.get('amount_cents') or 0):
                                add_change(row,'amount','Wert',subject,str(int(before.get('amount_cents') or 0)),str(int(after.get('amount_cents') or 0)),reason,booked,amount_cents=int(after.get('amount_cents') or 0),transaction_id=tid,payload=payload)
                            if before.get('category_id')!=after.get('category_id'):
                                add_change(row,'category','Kategorie',subject,category_name(before.get('category_id')),category_name(after.get('category_id')),reason,booked,transaction_id=tid,payload=payload)
                            if before.get('booked')!=after.get('booked'):
                                add_change(row,'date','Datum',subject,before.get('booked') or '',after.get('booked') or '',reason,after.get('booked'),transaction_id=tid,payload=payload)
                            if str(before.get('description') or '')!=str(after.get('description') or ''):
                                add_change(row,'description','Beschreibung',subject,before.get('description') or '',after.get('description') or '',reason,booked,transaction_id=tid,payload=payload)
                            if before.get('kind')!=after.get('kind'):
                                add_change(row,'kind','Buchungsart',subject,kind_names.get(before.get('kind'),before.get('kind') or ''),kind_names.get(after.get('kind'),after.get('kind') or ''),reason,booked,transaction_id=tid,payload=payload)
                        elif action=='edit_transfer':
                            before=payload.get('before') or [];after=payload.get('after') or {}
                            if not isinstance(before,list) or not isinstance(after,dict):continue
                            outgoing=next((x for x in before if int(x.get('amount_cents') or 0)<0),before[0] if before else {})
                            incoming=next((x for x in before if int(x.get('amount_cents') or 0)>0),before[-1] if before else {})
                            subject=str(after.get('description') or outgoing.get('description') or 'Umbuchung');tid=payload.get('transfer_id')
                            old_accounts=f"{account_name(outgoing.get('account_id'))} → {account_name(incoming.get('account_id'))}"
                            new_accounts=f"{account_name(after.get('from_id'))} → {account_name(after.get('to_id'))}"
                            if old_accounts!=new_accounts:
                                add_change(row,'account','Konto',subject,old_accounts,new_accounts,reason,after.get('booked'),transaction_id=tid,payload=payload)
                            old_amount=abs(int(outgoing.get('amount_cents') or 0));new_amount=abs(int(after.get('amount_cents') or 0))
                            if old_amount!=new_amount:
                                add_change(row,'amount','Wert',subject,str(old_amount),str(new_amount),reason,after.get('booked'),amount_cents=new_amount,transaction_id=tid,payload=payload)
                            if outgoing.get('booked')!=after.get('booked'):
                                add_change(row,'date','Datum',subject,outgoing.get('booked') or '',after.get('booked') or '',reason,after.get('booked'),transaction_id=tid,payload=payload)
                            if str(outgoing.get('description') or '')!=str(after.get('description') or ''):
                                add_change(row,'description','Beschreibung',subject,outgoing.get('description') or '',after.get('description') or '',reason,after.get('booked'),transaction_id=tid,payload=payload)
                        elif action=='void_transaction':
                            before=payload.get('before') or []
                            if not isinstance(before,list) or not before:continue
                            first=before[0];subject=str(first.get('description') or 'Buchung')
                            amount=sum(int(x.get('amount_cents') or 0) for x in before) if len(before)==1 else abs(int(first.get('amount_cents') or 0))
                            add_change(row,'void','Storno',subject,'Aktiv','Storniert',reason,first.get('booked'),amount_cents=amount,transaction_id=first.get('id'),payload=payload)
                        elif action=='plan_actual_assign':
                            if initial_plan_assignment(row,payload):continue
                            tx=tx_row(payload.get('transaction_id'));subject=str((tx or {}).get('description') or 'Buchung')
                            add_change(row,'plan_position','Planentwurfsposition',subject,'Ohne diese Zuordnung',position_name(payload.get('position_id'),payload.get('month')),reason,(tx or {}).get('booked'),amount_cents=int(payload.get('amount_cents') or 0),transaction_id=payload.get('transaction_id'),payload=payload)
                        elif action=='plan_actual_remove':
                            tx=tx_row(payload.get('transaction_id'));subject=str((tx or {}).get('description') or 'Buchung')
                            add_change(row,'plan_position','Planentwurfsposition',subject,position_name(payload.get('position_id'),payload.get('month')),'Zuordnung entfernt',reason,(tx or {}).get('booked'),amount_cents=int(payload.get('amount_cents') or 0),transaction_id=payload.get('transaction_id'),payload=payload)
                        elif action=='plan_actual_remove_transaction':
                            tx=tx_row(payload.get('transaction_id'));subject=str((tx or {}).get('description') or 'Buchung')
                            links=payload.get('links') or []
                            for link in links if isinstance(links,list) else []:
                                add_change(row,'plan_position','Planentwurfsposition',subject,position_name(link.get('position_id'),payload.get('month')),'Zuordnung entfernt',reason,(tx or {}).get('booked'),amount_cents=int(link.get('amount_cents') or 0),transaction_id=payload.get('transaction_id'),payload=payload)
                    events.sort(key=lambda e:(e.get('at') or '',e.get('id') or ''),reverse=True)
                    truncated=len(events)>limit
                    return {'month':month,'scope':'booking_changes','events':events[:limit],'truncated':truncated,'count':len(events)}
                action_labels={
                    'add_transaction':'Buchung angelegt','transfer':'Umbuchung angelegt',
                    'edit_transaction':'Buchung geändert','edit_transfer':'Umbuchung geändert',
                    'void_transaction':'Buchung storniert','post_recurring':'Wiederkehrende Buchung gebucht',
                    'close_month':'Monatsabschluss','set_budget':'Budget geändert',
                    'proposal_confirm':'Planungsvorschlag gebucht','proposal_skip':'Planungsvorschlag entfällt',
                    'proposal_reopen':'Planungsvorschlag wieder geöffnet',
                    'plan_actual_assign':'Plan-Ist-Zuordnung erstellt',
                    'plan_actual_remove':'Plan-Ist-Zuordnung entfernt',
                    'plan_actual_remove_transaction':'Plan-Ist-Zuordnungen entfernt',
                }
                tx_cache={}
                def tx_by_id(ident):
                    if not ident:return None
                    key=('id',str(ident))
                    if key not in tx_cache:
                        row=db.execute('''SELECT t.*,a.name AS account_name,c.name AS category_name
                                          FROM ft_transactions t JOIN ft_accounts a ON a.id=t.account_id
                                          LEFT JOIN ft_categories c ON c.id=t.category_id WHERE t.id=?''',(str(ident),)).fetchone()
                        tx_cache[key]=dict(row) if row else None
                    return tx_cache[key]
                def tx_by_transfer(ident):
                    if not ident:return None
                    key=('transfer',str(ident))
                    if key not in tx_cache:
                        row=db.execute('''SELECT t.*,a.name AS account_name,c.name AS category_name
                                          FROM ft_transactions t JOIN ft_accounts a ON a.id=t.account_id
                                          LEFT JOIN ft_categories c ON c.id=t.category_id
                                          WHERE t.transfer_id=? ORDER BY t.amount_cents ASC LIMIT 1''',(str(ident),)).fetchone()
                        tx_cache[key]=dict(row) if row else None
                    return tx_cache[key]
                def payload_months(payload,action):
                    months=set()
                    def walk(value):
                        if isinstance(value,dict):
                            m=value.get('month')
                            if isinstance(m,str) and len(m)>=7 and m[4]=='-':months.add(m[:7])
                            b=value.get('booked')
                            if isinstance(b,str) and len(b)>=7 and b[4]=='-':months.add(b[:7])
                            for nested in value.values():
                                if isinstance(nested,(dict,list)):walk(nested)
                        elif isinstance(value,list):
                            for nested in value:walk(nested)
                    walk(payload)
                    txs=[]
                    for key in ('transaction_id','id'):
                        ident=payload.get(key)
                        tx=tx_by_id(ident)
                        if tx:txs.append(tx)
                    for ident in payload.get('ids') or []:
                        tx=tx_by_id(ident)
                        if tx:txs.append(tx)
                    transfer_id=payload.get('transfer_id')
                    if transfer_id:
                        tx=tx_by_transfer(transfer_id)
                        if tx:txs.append(tx)
                    if action=='transfer' and payload.get('id'):
                        tx=tx_by_transfer(payload.get('id'))
                        if tx:txs.append(tx)
                    for tx in txs:
                        booked=tx.get('booked')
                        if booked:months.add(booked[:7])
                    return months,txs
                events=[]
                audited_link_ids=set()
                for raw in db.execute('SELECT * FROM ft_audit ORDER BY at DESC,id DESC'):
                    row=dict(raw);payload=json.loads(row['payload']);action=row['action']
                    months,txs=payload_months(payload,action)
                    if month and month not in months:continue
                    if action=='plan_actual_assign' and payload.get('link_id'):audited_link_ids.add(str(payload['link_id']))
                    tx=txs[0] if txs else None
                    subject=str(payload.get('source_name') or payload.get('position_name') or (tx or {}).get('description') or '')
                    if action=='close_month':
                        account=db.execute('SELECT name FROM ft_accounts WHERE id=?',(payload.get('account_id'),)).fetchone()
                        subject=account['name'] if account else 'Monatsabschluss'
                    elif action=='set_budget':
                        cat=db.execute('SELECT name FROM ft_categories WHERE id=?',(payload.get('category_id'),)).fetchone()
                        subject=cat['name'] if cat else 'Budget'
                    reason=str(payload.get('reason') or '').strip()
                    detail=''
                    if action=='proposal_confirm':
                        detail='Planungsvorschlag als Ist-Buchung übernommen'
                    elif action=='proposal_skip':detail='Planungsvorschlag als entfallen markiert'
                    elif action=='proposal_reopen':detail='Entfallene Position wieder geöffnet'
                    elif action=='close_month':
                        detail=f"Kontostand {int(payload.get('balance_cents',0))/100:.2f} € · Abweichung {int(payload.get('difference_cents',0))/100:.2f} €"
                    elif action.startswith('plan_actual_'):
                        detail='Plan-Ist-Zuordnung geändert'
                    elif reason:detail=reason
                    amount=None
                    if tx:amount=int(tx.get('amount_cents') or 0)
                    elif payload.get('amount_cents') is not None:amount=int(payload.get('amount_cents') or 0)
                    elif payload.get('actual_after_cents') is not None:
                        sign=-1 if payload.get('kind')=='expense' else 1
                        amount=sign*int(payload.get('actual_after_cents') or 0)
                    event={'id':row['id'],'at':row['at'],'action':action,'title':action_labels.get(action,action.replace('_',' ').title()),
                           'subject':subject,'detail':detail,'reason':reason,'amount_cents':amount,
                           'booked':(tx or {}).get('booked'),'kind':(tx or {}).get('kind') or payload.get('kind'),'payload':payload}
                    events.append(event)
                # Existing plan/actual links predate audit logging. Surface them as historical
                # creation events so the month feed is complete for currently active links.
                if month and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_actual_links'").fetchone():
                    for link in db.execute('''SELECT l.*,t.description,t.kind,t.booked FROM ft4_plan_actual_links l
                                              JOIN ft_transactions t ON t.id=l.transaction_id
                                              WHERE l.month=? AND t.voided=0''',(month,)):
                        if str(link['id']) in audited_link_ids:continue
                        signed=int(link['amount_cents'])*(1 if link['kind']=='income' else -1 if link['kind']=='expense' else 1)
                        events.append({'id':'link:'+str(link['id']),'at':link['created'],'action':'plan_actual_assign',
                                       'title':'Plan-Ist-Zuordnung erstellt','subject':link['description'],
                                       'detail':'Bestehende Plan-Ist-Zuordnung','reason':'','amount_cents':signed,
                                       'booked':link['booked'],'kind':link['kind'],
                                       'payload':{'month':month,'link_id':link['id'],'position_id':link['position_id'],
                                                  'transaction_id':link['transaction_id'],'amount_cents':link['amount_cents']}})
                events.sort(key=lambda e:(e.get('at') or '',e.get('id') or ''),reverse=True)
                truncated=len(events)>limit
                return {'month':month,'events':events[:limit],'truncated':truncated,'count':len(events)}
            if op == 'transaction_detail':
                ident = str(data.get('id',''))
                row = db.execute('SELECT t.*,a.name AS account_name,c.name AS category_name FROM ft_transactions t JOIN ft_accounts a ON a.id=t.account_id LEFT JOIN ft_categories c ON c.id=t.category_id WHERE t.id=?',(ident,)).fetchone()
                if not row:
                    raise HomeAssistantError('Buchung nicht gefunden')
                import json
                events=[]
                for item in db.execute('SELECT at,action,payload FROM ft_audit ORDER BY at DESC'):
                    payload=json.loads(item['payload'])
                    if payload.get('id')==ident or ident in payload.get('ids',[]):
                        events.append({'at':item['at'],'action':item['action'],'payload':payload})
                return {'transaction':dict(row),'events':events,'locked':bool(db.execute('SELECT 1 FROM ft_closings WHERE month>=? AND account_id=?',(row['booked'][:7],row['account_id'])).fetchone())}
            if op == 'month_summary':
                month=validate_month(data.get('month') or date.today().strftime('%Y-%m'))
                totals=db.execute("SELECT kind,COALESCE(SUM(amount_cents),0) AS amount,COUNT(*) AS n FROM ft_transactions WHERE booked LIKE ? AND voided=0 GROUP BY kind",(month+'%',)).fetchall()
                categories=[dict(r) for r in db.execute("SELECT COALESCE(c.name,'Ohne Kategorie') AS name,t.kind,COUNT(*) AS count,SUM(ABS(t.amount_cents)) AS amount_cents FROM ft_transactions t LEFT JOIN ft_categories c ON t.category_id=c.id WHERE t.booked LIKE ? AND t.voided=0 AND t.kind IN ('income','expense') GROUP BY c.name,t.kind ORDER BY amount_cents DESC",(month+'%',))]
                return {'month':month,'totals':[dict(r) for r in totals],'categories':categories}
            if op == 'set_budget':
                month=validate_month(data.get('month'))
                category_id=str(data.get('category_id',''))
                amount=int(data.get('amount_cents',-1))
                category=db.execute('SELECT * FROM ft_categories WHERE id=? AND kind="expense"',(category_id,)).fetchone()
                if not category or amount<0:
                    raise HomeAssistantError('Ausgabenkategorie und Budgetbetrag erforderlich')
                db.execute('INSERT INTO ft_budgets(month,category_id,amount_cents) VALUES(?,?,?) ON CONFLICT(month,category_id) DO UPDATE SET amount_cents=excluded.amount_cents',(month,category_id,amount))
                self._audit(db,op,{'month':month,'category_id':category_id,'amount_cents':amount})
                return {'saved':True}
            if op == 'budget_summary':
                month=validate_month(data.get('month') or date.today().strftime('%Y-%m'))
                rows=[dict(r) for r in db.execute('''SELECT c.id AS category_id,c.name,COALESCE(b.amount_cents,0) AS budget_cents,COALESCE(x.actual_cents,0) AS actual_cents FROM ft_categories c LEFT JOIN ft_budgets b ON b.category_id=c.id AND b.month=? LEFT JOIN (SELECT category_id,SUM(-amount_cents) AS actual_cents FROM ft_transactions WHERE kind='expense' AND voided=0 AND booked LIKE ? GROUP BY category_id) x ON x.category_id=c.id WHERE c.kind='expense' ORDER BY c.name''',(month,month+'%'))]
                return {'month':month,'categories':rows,'budget_cents':sum(r['budget_cents'] for r in rows),'actual_cents':sum(r['actual_cents'] for r in rows)}
            if op == 'year_summary':
                year=str(data.get('year') or date.today().year)
                if len(year)!=4 or not year.isdigit() or int(year)<1900 or int(year)>2200:
                    raise HomeAssistantError('Ungültiges Jahr')
                rows=[dict(r) for r in db.execute('''SELECT substr(booked,1,7) AS month,SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END) AS income_cents,SUM(CASE WHEN kind='expense' THEN -amount_cents ELSE 0 END) AS expense_cents FROM ft_transactions WHERE booked>=? AND booked<? AND voided=0 GROUP BY substr(booked,1,7)''',(year+'-01-01',str(int(year)+1)+'-01-01'))]
                by_month={r['month']:r for r in rows}
                months=[]
                for m in range(1,13):
                    key=f'{year}-{m:02d}'
                    r=by_month.get(key,{'income_cents':0,'expense_cents':0})
                    months.append({'month':key,'income_cents':r['income_cents'],'expense_cents':r['expense_cents'],'net_cents':r['income_cents']-r['expense_cents']})
                return {'year':year,'months':months,'income_cents':sum(r['income_cents'] for r in months),'expense_cents':sum(r['expense_cents'] for r in months)}
            if op == 'add_recurring':
                name=str(data.get('name','')).strip()
                account_id=str(data.get('account_id',''))
                kind=str(data.get('kind',''))
                amount=abs(int(data.get('amount_cents',0)))
                description=str(data.get('description','')).strip()
                day=int(data.get('day_of_month',1))
                start=validate_month(data.get('start_month'))
                end=validate_month(data['end_month']) if data.get('end_month') else None
                category_id=data.get('category_id') or None
                if not name or len(name)>100 or kind not in ('income','expense') or amount<=0 or day<1 or day>31 or not description or len(description)>240 or (end and end<start):
                    raise HomeAssistantError('Ungültige wiederkehrende Buchung')
                account=self._account(db,account_id)
                self._validate_category(db,category_id,kind)
                if end and end<account['opening_date'][:7]:
                    raise HomeAssistantError('Vor Kontoeröffnung')
                ident=uuid4().hex
                db.execute('INSERT INTO ft_recurring VALUES(?,?,?,?,?,?,?,?,?,?,1,?)',(ident,name,account_id,category_id,kind,amount,description,day,start,end,now()))
                self._audit(db,op,{'id':ident,'name':name})
                return {'id':ident}
            if op == 'set_recurring_active':
                ident=str(data.get('id',''))
                active=data.get('active')
                if type(active) is not bool:
                    raise HomeAssistantError('Aktiv muss wahr oder falsch sein')
                row=db.execute('SELECT * FROM ft_recurring WHERE id=?',(ident,)).fetchone()
                if not row:
                    raise HomeAssistantError('Vorlage nicht gefunden')
                db.execute('UPDATE ft_recurring SET active=? WHERE id=?',(int(active),ident))
                self._audit(db,op,{'id':ident,'active':active})
                return {'updated':True}
            if op == 'post_recurring':
                from calendar import monthrange
                ident=str(data.get('id',''))
                month=validate_month(data.get('month'))
                row=db.execute('SELECT * FROM ft_recurring WHERE id=? AND active=1',(ident,)).fetchone()
                if not row:
                    raise HomeAssistantError('Aktive Vorlage nicht gefunden')
                if month<row['start_month'] or (row['end_month'] and month>row['end_month']):
                    raise HomeAssistantError('Monat außerhalb der Laufzeit')
                if db.execute('SELECT 1 FROM ft_recurring_runs r JOIN ft_transactions t ON t.id=r.transaction_id WHERE r.template_id=? AND r.month=? AND t.voided=0',(ident,month)).fetchone():
                    raise HomeAssistantError('Diese Vorlage wurde im Monat bereits gebucht')
                booked=f"{month}-{min(row['day_of_month'],monthrange(int(month[:4]),int(month[5:]))[1]):02d}"
                account=self._account(db,row['account_id'])
                if booked<account['opening_date']:
                    raise HomeAssistantError('Buchung vor Kontoeröffnung')
                self._ensure_open(db,booked,[row['account_id']])
                amount=row['amount_cents'] if row['kind']=='income' else -row['amount_cents']
                transaction_id=uuid4().hex
                db.execute('INSERT INTO ft_transactions VALUES(?,?,?,?,?,?,?,?,?,0)',(transaction_id,booked,row['account_id'],row['category_id'],row['kind'],amount,row['description'],None,now()))
                db.execute('INSERT INTO ft_recurring_runs VALUES(?,?,?,?)',(uuid4().hex,ident,month,transaction_id))
                self._audit(db,op,{'id':transaction_id,'template_id':ident,'month':month,'amount_cents':amount,'repost_after_void':bool(db.execute('SELECT 1 FROM ft_recurring_runs WHERE template_id=? AND month=? AND transaction_id<>?',(ident,month,transaction_id)).fetchone())})
                return {'id':transaction_id,'booked':booked}
            if op == 'add_account':
                name = str(data.get('name','')).strip()
                kind = str(data.get('kind','checking'))
                opening = int(data.get('opening_cents',0))
                opened = validate_day(data.get('opening_date') or date.today().isoformat())
                if not name or len(name)>100 or kind not in ('checking','savings','cash'):
                    raise HomeAssistantError('Ungültiges Konto')
                ident=uuid4().hex
                db.execute('INSERT INTO ft_accounts VALUES(?,?,?,?,?,1,?)',(ident,name,kind,opening,opened,now()))
                self._audit(db,op,{'id':ident,'name':name})
                return {'id':ident}
            if op == 'add_category':
                name=str(data.get('name','')).strip()
                kind=str(data.get('kind','expense'))
                if not name or len(name)>100 or kind not in ('income','expense'):
                    raise HomeAssistantError('Ungültige Kategorie')
                ident=uuid4().hex
                try:
                    db.execute('INSERT INTO ft_categories VALUES(?,?,?)',(ident,name,kind))
                except sqlite3.IntegrityError as exc:
                    raise HomeAssistantError('Kategorie bereits vorhanden') from exc
                self._audit(db,op,{'id':ident,'name':name})
                return {'id':ident}
            if op == 'add_transaction':
                booked=validate_day(data.get('booked'))
                account_id=str(data.get('account_id',''))
                kind=str(data.get('kind',''))
                amount=abs(int(data.get('amount_cents',0)))
                description=str(data.get('description','')).strip()
                category_id=data.get('category_id') or None
                if kind not in ('income','expense') or amount<=0 or not description or len(description)>240:
                    raise HomeAssistantError('Ungültige Buchung')
                account=self._account(db,account_id)
                if booked<account['opening_date']:
                    raise HomeAssistantError('Buchung vor Kontoeröffnung')
                self._ensure_open(db,booked,[account_id])
                if category_id:
                    c=db.execute('SELECT kind FROM ft_categories WHERE id=?',(category_id,)).fetchone()
                    if not c or c['kind']!=kind:
                        raise HomeAssistantError('Kategorie passt nicht zur Buchung')
                ident=uuid4().hex
                signed=amount if kind=='income' else -amount
                db.execute('INSERT INTO ft_transactions VALUES(?,?,?,?,?,?,?,?,?,0)',(ident,booked,account_id,category_id,kind,signed,description,None,now()))
                self._save_expression(db,ident,data,amount)
                self._audit(db,op,{'id':ident,'booked':booked,'account_id':account_id,'category_id':category_id,'kind':kind,'amount_cents':signed,'description':description})
                return {'id':ident}
            if op == 'transfer':
                booked=validate_day(data.get('booked'))
                source=str(data.get('from_id',''))
                target=str(data.get('to_id',''))
                amount=abs(int(data.get('amount_cents',0)))
                description=str(data.get('description') or 'Umbuchung').strip()
                if source==target or amount<=0 or not description or len(description)>240:
                    raise HomeAssistantError('Ungültige Umbuchung')
                a=self._account(db,source)
                b=self._account(db,target)
                if booked<max(a['opening_date'],b['opening_date']):
                    raise HomeAssistantError('Umbuchung vor Kontoeröffnung')
                self._ensure_open(db,booked,[source,target])
                transfer_id=uuid4().hex
                ids=[]
                for account_id,signed in ((source,-amount),(target,amount)):
                    row_id=uuid4().hex;ids.append(row_id)
                    db.execute('INSERT INTO ft_transactions VALUES(?,?,?,?,?,?,?,?,?,0)',(row_id,booked,account_id,None,'transfer',signed,description,transfer_id,now()))
                self._audit(db,op,{'id':transfer_id,'booked':booked,'from_id':source,'to_id':target,'kind':'transfer','amount_cents':amount,'description':description})
                return {'id':transfer_id,'from_transaction_id':ids[0],'to_transaction_id':ids[1]}
            if op == 'void_transaction':
                ident = str(data.get('id', ''))
                reason = str(data.get('reason', '')).strip()
                if not reason or len(reason) > 240:
                    raise HomeAssistantError('Bitte einen Stornogrund (maximal 240 Zeichen) angeben')
                original = self._transaction(db, ident)
                if original['kind'] == 'transfer':
                    rows = db.execute('SELECT * FROM ft_transactions WHERE transfer_id=? AND voided=0', (original['transfer_id'],)).fetchall()
                    if len(rows) != 2:
                        raise HomeAssistantError('Umbuchung ist unvollständig; keine Änderung vorgenommen')
                else:
                    rows = [original]
                for row in rows:
                    self._ensure_open(db, row['booked'], [row['account_id']])
                for row in rows:
                    db.execute('UPDATE ft_transactions SET voided=1 WHERE id=?', (row['id'],))
                self._audit(db, op, {'ids': [r['id'] for r in rows], 'reason': reason,
                                      'before': [dict(r) for r in rows]})
                return {'voided': len(rows)}
            if op == 'edit_transfer':
                ident=str(data.get('id') or '')
                original=self._transaction(db,ident)
                if original['kind']!='transfer' or not original['transfer_id']:
                    raise HomeAssistantError('Dies ist keine Umbuchung')
                pair=db.execute('SELECT * FROM ft_transactions WHERE transfer_id=? AND voided=0',(original['transfer_id'],)).fetchall()
                if len(pair)!=2 or sum(r['amount_cents'] for r in pair)!=0:
                    raise HomeAssistantError('Umbuchung unvollständig; keine Änderung vorgenommen')
                outgoing=next(r for r in pair if r['amount_cents']<0)
                incoming=next(r for r in pair if r['amount_cents']>0)
                booked=validate_day(data.get('booked'))
                from_id=str(data.get('from_id') or '')
                to_id=str(data.get('to_id') or '')
                amount=abs(int(data.get('amount_cents',0)))
                description=str(data.get('description') or '').strip()
                reason=str(data.get('reason') or '').strip()
                if from_id==to_id or amount<=0 or amount>100000000000 or not description or len(description)>240:
                    raise HomeAssistantError('Ungültige Umbuchung')
                if not reason or len(reason)>240:raise HomeAssistantError('Bitte Änderungsgrund angeben')
                src=self._account(db,from_id);dst=self._account(db,to_id)
                if booked<max(src['opening_date'],dst['opening_date']):raise HomeAssistantError('Umbuchung vor Kontoeröffnung')
                self._ensure_open(db,outgoing['booked'],[outgoing['account_id'],incoming['account_id']])
                self._ensure_open(db,booked,[from_id,to_id])
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_actual_links'").fetchone():
                    total=db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft4_plan_actual_links WHERE transaction_id IN (?,?)',(outgoing['id'],incoming['id'])).fetchone()[0]
                    if total and (booked[:7]!=outgoing['booked'][:7] or amount<total):
                        raise HomeAssistantError('Planbezug zuerst ändern: Monat oder Betrag widerspricht einer bestehenden Zuordnung')
                db.execute('UPDATE ft_transactions SET booked=?,account_id=?,amount_cents=?,description=? WHERE id=?',
                           (booked,from_id,-amount,description,outgoing['id']))
                db.execute('UPDATE ft_transactions SET booked=?,account_id=?,amount_cents=?,description=? WHERE id=?',
                           (booked,to_id,amount,description,incoming['id']))
                self._audit(db,op,{'transfer_id':original['transfer_id'],'reason':reason,
                         'before':[dict(r) for r in pair],
                         'after':{'booked':booked,'from_id':from_id,'to_id':to_id,'amount_cents':amount,'description':description}})
                return {'updated':True,'transfer_id':original['transfer_id']}
            if op == 'edit_transaction':
                ident = str(data.get('id', ''))
                original = self._transaction(db, ident)
                if original['kind'] == 'transfer':
                    raise HomeAssistantError('Umbuchungen bitte vollständig stornieren und neu anlegen')
                booked = validate_day(data.get('booked'))
                account_id = str(data.get('account_id', ''))
                kind = str(data.get('kind', ''))
                amount = abs(int(data.get('amount_cents', 0)))
                description = str(data.get('description', '')).strip()
                category_id = data.get('category_id') or None
                reason = str(data.get('reason', '')).strip()
                if kind not in ('income', 'expense') or amount <= 0 or not description or len(description) > 240:
                    raise HomeAssistantError('Ungültige Buchungsdaten')
                if not reason or len(reason) > 240:
                    raise HomeAssistantError('Bitte einen Änderungsgrund angeben')
                account = self._account(db, account_id)
                if booked < account['opening_date']:
                    raise HomeAssistantError('Buchung vor Kontoeröffnung')
                self._ensure_open(db, original['booked'], [original['account_id']])
                self._ensure_open(db, booked, [account_id])
                self._validate_category(db, category_id, kind)
                # A changed booking must not invalidate existing plan allocations.
                if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_actual_links'").fetchone():
                    allocations=db.execute('SELECT month,position_id,SUM(amount_cents) AS total FROM ft4_plan_actual_links WHERE transaction_id=? GROUP BY month,position_id',(ident,)).fetchall()
                    if allocations:
                        if booked[:7]!=original['booked'][:7] or kind!=original['kind']:
                            raise HomeAssistantError('Buchung ist mit einer Planposition verknüpft. Planbezug zuerst entfernen, um Monat oder Buchungsart zu ändern.')
                        if sum(r['total'] for r in allocations)>amount:
                            raise HomeAssistantError('Der neue Betrag liegt unter den bestehenden Plan-Ist-Zuordnungen. Bitte zuerst Zuordnungen reduzieren oder entfernen.')
                signed = amount if kind == 'income' else -amount
                db.execute("UPDATE ft_transactions SET booked=?,account_id=?,category_id=?,kind=?,amount_cents=?,description=? WHERE id=?",
                           (booked, account_id, category_id, kind, signed, description, ident))
                self._save_expression(db,ident,data,amount)
                self._audit(db, op, {'id': ident, 'reason': reason, 'before': dict(original),
                                     'after': {'booked': booked, 'account_id': account_id, 'category_id': category_id,
                                               'kind': kind, 'amount_cents': signed, 'description': description}})
                return {'updated': True}
            if op == 'close_month':
                month=validate_month(data.get('month'))
                account_id=str(data.get('account_id',''))
                actual=int(data.get('actual_cents'))
                account=self._account(db,account_id)
                if month < account['opening_date'][:7]:
                    raise HomeAssistantError('Monat vor Kontoeröffnung')
                if db.execute('SELECT 1 FROM ft_closings WHERE month=? AND account_id=?',(month,account_id)).fetchone():
                    raise HomeAssistantError('Konto für Monat bereits abgeschlossen')
                calculated=self._balance(db,account,month+'-31')
                # Account metadata is optional for legacy installations; 0 cents is the safe default.
                meta_table=db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft_account_meta'").fetchone()
                tolerance=0
                if meta_table and 'tolerance_cents' in {r['name'] for r in db.execute('PRAGMA table_info(ft_account_meta)')}:
                    meta=db.execute('SELECT tolerance_cents FROM ft_account_meta WHERE account_id=?',(account_id,)).fetchone()
                    tolerance=int(meta['tolerance_cents']) if meta else 0
                difference=actual-calculated
                if abs(difference)>tolerance:
                    raise HomeAssistantError(f'Kontodifferenz: {difference} Cent; erlaubt: ±{tolerance} Cent.')
                db.execute('INSERT INTO ft_closings(month,account_id,actual_cents,calculated_cents,closed,tolerance_cents,difference_cents) VALUES(?,?,?,?,?,?,?)',(month,account_id,actual,calculated,now(),tolerance,difference))
                self._audit(db,op,{'month':month,'account_id':account_id,'balance_cents':actual,'calculated_cents':calculated,'difference_cents':difference,'tolerance_cents':tolerance})
                return {'closed':True,'difference_cents':difference,'tolerance_cents':tolerance}
            raise HomeAssistantError('Unbekannte Aktion')
