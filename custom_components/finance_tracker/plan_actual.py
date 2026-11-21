"""Finance Tracker 4.0: explicit plan/actual allocations, no ledger mutation."""
import sqlite3
from uuid import uuid4
from homeassistant.exceptions import HomeAssistantError
from .ledger import Ledger,now,validate_month
from .finance_planning import read_planning

SCHEMA="""CREATE TABLE IF NOT EXISTS ft4_plan_actual_links(
 id TEXT PRIMARY KEY,month TEXT NOT NULL,position_id TEXT NOT NULL,
 transaction_id TEXT NOT NULL REFERENCES ft_transactions(id),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0),created TEXT NOT NULL,
 UNIQUE(month,position_id,transaction_id));
CREATE INDEX IF NOT EXISTS ft4_link_transaction ON ft4_plan_actual_links(transaction_id);
CREATE INDEX IF NOT EXISTS ft4_link_month ON ft4_plan_actual_links(month);"""

def _open(hass):
 db=sqlite3.connect(hass.config.path('finance/household_v2.db'),timeout=10)
 db.row_factory=sqlite3.Row
 db.execute('PRAGMA foreign_keys=ON')
 db.execute('PRAGMA busy_timeout=5000')
 db.executescript(SCHEMA)
 return db

def _positions(hass,month):
 try: rows=read_planning(hass.config.path('finance/household_v2.db'),month)['rows']
 except ValueError:return []
 return [r for r in rows if r['kind'] in ('expense','income','saving_transfer') and r.get('amount_cents') is not None]

def _plan_meta(db,month):
 cats={r['position_id']:r['category_id'] for r in db.execute('SELECT position_id,category_id FROM ft3_plan_categories WHERE month=?',(month,))} if _table(db,'ft3_plan_categories') else {}
 if _table(db,'ft3_category_mapping'):
  for r in db.execute('SELECT p.id,m.category_id FROM ft3_positions p JOIN ft3_category_mapping m ON p.name=m.source_name AND p.kind=m.source_kind'):
   cats.setdefault(r['id'],r['category_id'])
 accounts={r['position_id']:r['account_id'] for r in db.execute('SELECT position_id,account_id FROM ft3_plan_accounts WHERE month=?',(month,))} if _table(db,'ft3_plan_accounts') else {}
 manual_targets={r['position_id']:r['to_account_id'] for r in db.execute('SELECT position_id,to_account_id FROM ft4_manual_plan_targets WHERE month=?',(month,))} if _table(db,'ft4_manual_plan_targets') else {}
 template_targets={'tpl:'+r['template_id']:r['to_account_id'] for r in db.execute('SELECT template_id,to_account_id FROM ft4_plan_transfer_targets WHERE month=?',(month,))} if _table(db,'ft4_plan_transfer_targets') else {}
 if _table(db,'ft3_template_plan_items'):
  for r in db.execute('SELECT template_id,category_id,account_id FROM ft3_template_plan_items WHERE month=?',(month,)):
   pid='tpl:'+r['template_id'];cats[pid]=r['category_id'];accounts[pid]=r['account_id']
 return cats,accounts,manual_targets,template_targets

def _table(db,name):return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone())

def action(hass,op,data):
 month=validate_month(data.get('month'))
 positions=_positions(hass,month)
 with _open(hass) as db:
  if op=='list':
   cats,accounts,manual_targets,template_targets=_plan_meta(db,month)
   links=[dict(r) for r in db.execute('SELECT l.*,t.description,t.kind,t.booked,t.category_id,t.account_id FROM ft4_plan_actual_links l JOIN ft_transactions t ON t.id=l.transaction_id WHERE l.month=? AND t.voided=0 ORDER BY t.booked',(month,))]
   byposition={}
   for l in links:byposition.setdefault(l['position_id'],[]).append(l)
   item_list=[]
   for p in positions:
    amt=abs(p['amount_cents']);actual=sum(x['amount_cents'] for x in byposition.get(p['position_id'],[]))
    item_list.append({'position_id':p['position_id'],'name':p['name'],'kind':p['kind'],'plan_cents':amt,'actual_cents':actual,'remaining_cents':amt-actual,'category_id':cats.get(p['position_id']),'account_id':accounts.get(p['position_id']),'to_account_id':(manual_targets.get(p['position_id']) if p['position_id'].startswith('manual:') else template_targets.get(p['position_id'])),'links':byposition.get(p['position_id'],[])})
   transactions=[dict(r) for r in db.execute("SELECT id,booked,description,kind,category_id,account_id,ABS(amount_cents) AS amount_cents FROM ft_transactions WHERE booked LIKE ? AND voided=0 AND (kind IN ('income','expense') OR (kind='transfer' AND amount_cents<0)) ORDER BY booked DESC,created DESC",(month+'%',))]
   alloc={r['transaction_id']:r['total'] for r in db.execute('SELECT transaction_id,SUM(amount_cents) AS total FROM ft4_plan_actual_links GROUP BY transaction_id')}
   for t in transactions:
    t['allocated_cents']=alloc.get(t['id'],0)
    t['unallocated_cents']=max(0,t['amount_cents']-t['allocated_cents'])
    t['suggestions']=[]
    if t['unallocated_cents']:
     for p in item_list:
      if p['kind']!=('saving_transfer' if t['kind']=='transfer' else t['kind']):continue
      score=(50 if p['category_id'] and p['category_id']==t['category_id'] else 0)+(25 if p['account_id'] and p['account_id']==t['account_id'] else 0)+(18 if p['name'].casefold() in t['description'].casefold() else 0)
      distance=abs(p['remaining_cents']-t['unallocated_cents'])
      score+=round(10*max(0,1-distance/max(1,p['plan_cents'],t['unallocated_cents'])))
      if score>=10:t['suggestions'].append({'position_id':p['position_id'],'name':p['name'],'score':score})
     t['suggestions'].sort(key=lambda s:-s['score'])
   return {'month':month,'positions':item_list,'transactions':transactions,'links':links,'unassigned_count':sum(1 for t in transactions if t['unallocated_cents']>0),'unassigned_cents':sum(t['unallocated_cents'] for t in transactions),'status':'linked_only','note':'Ist-Werte je Planposition umfassen ausschließlich ausdrücklich zugeordnete Buchungen.'}
  if op not in ('assign','remove','remove_transaction'):raise HomeAssistantError('Unbekannte Zuordnungsaktion')
  db.execute('BEGIN IMMEDIATE')
  if op=='remove_transaction':
   tid=str(data.get('transaction_id') or '')
   if not tid:raise HomeAssistantError('Buchung nicht angegeben')
   existing=[dict(r) for r in db.execute('SELECT * FROM ft4_plan_actual_links WHERE month=? AND transaction_id=?',(month,tid))]
   db.execute('DELETE FROM ft4_plan_actual_links WHERE month=? AND transaction_id=?',(month,tid))
   if existing:Ledger(hass)._audit(db,'plan_actual_remove_transaction',{'month':month,'transaction_id':tid,'links':existing})
   return {'removed':True,'count':len(existing),'transaction_id':tid}
  if op=='remove':
   link=db.execute('SELECT * FROM ft4_plan_actual_links WHERE id=? AND month=?',(str(data.get('link_id') or ''),month)).fetchone()
   if not link:raise HomeAssistantError('Zuordnung nicht gefunden')
   link_data=dict(link)
   db.execute('DELETE FROM ft4_plan_actual_links WHERE id=?',(link['id'],))
   Ledger(hass)._audit(db,'plan_actual_remove',{'month':month,'link_id':link_data['id'],'position_id':link_data['position_id'],'transaction_id':link_data['transaction_id'],'amount_cents':link_data['amount_cents']})
   return {'removed':True}
  pid=str(data.get('position_id') or '');tid=str(data.get('transaction_id') or '')
  p=next((r for r in positions if r['position_id']==pid),None)
  if not p:raise HomeAssistantError('Planposition nicht vorhanden')
  tx=db.execute("SELECT * FROM ft_transactions WHERE id=? AND voided=0 AND kind IN ('expense','income','transfer')",(tid,)).fetchone()
  if not tx:raise HomeAssistantError('Aktive Buchung nicht gefunden')
  if tx['booked'][:7]!=month or ('saving_transfer' if tx['kind']=='transfer' else tx['kind'])!=p['kind']:raise HomeAssistantError('Buchung und Planposition müssen Monat und Buchungsart teilen')
  amount=data.get('amount_cents')
  if type(amount)!=int or amount<=0:raise HomeAssistantError('Ungültiger Zuordnungsbetrag')
  already=db.execute('SELECT COALESCE(SUM(amount_cents),0) FROM ft4_plan_actual_links WHERE transaction_id=?',(tid,)).fetchone()[0]
  if amount>abs(tx['amount_cents'])-already:raise HomeAssistantError('Der Buchungsbetrag darf nicht mehrfach angerechnet werden')
  if db.execute('SELECT 1 FROM ft4_plan_actual_links WHERE month=? AND position_id=? AND transaction_id=?',(month,pid,tid)).fetchone():raise HomeAssistantError('Zuordnung bereits vorhanden; zunächst entfernen')
  ident=uuid4().hex
  created=now()
  db.execute('INSERT INTO ft4_plan_actual_links VALUES(?,?,?,?,?,?)',(ident,month,pid,tid,amount,created))
  Ledger(hass)._audit(db,'plan_actual_assign',{'month':month,'link_id':ident,'position_id':pid,'position_name':p.get('name'),'transaction_id':tid,'amount_cents':amount,'origin':str(data.get('origin') or '')})
  return {'id':ident,'assigned':True}
