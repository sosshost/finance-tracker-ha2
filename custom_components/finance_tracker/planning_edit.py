"""Non-destructive planning drafts; source Excel tables are immutable."""
import sqlite3
from datetime import date
from pathlib import Path
from homeassistant.exceptions import HomeAssistantError
from .ledger import validate_month, now
from .direct_debit import SCHEMA as DEBIT_SCHEMA, save as save_debit, config as debit_config
from .plan_templates import SCHEMA as TEMPLATE_SCHEMA, verify as verify_template

SCHEMA="""
CREATE TABLE IF NOT EXISTS ft3_plan_months(month TEXT PRIMARY KEY, status TEXT NOT NULL DEFAULT 'draft', created TEXT NOT NULL, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ft3_plan_values(month TEXT NOT NULL,position_id TEXT NOT NULL,amount_cents INTEGER,updated TEXT NOT NULL,PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft3_plan_accounts(month TEXT NOT NULL,position_id TEXT NOT NULL,account_id TEXT NOT NULL REFERENCES ft_accounts(id),updated TEXT NOT NULL,PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft4_manual_plan_targets(month TEXT NOT NULL,position_id TEXT NOT NULL,to_account_id TEXT NOT NULL REFERENCES ft_accounts(id),PRIMARY KEY(month,position_id));
"""
def _open(hass):
 db=sqlite3.connect(hass.config.path('finance/household_v2.db'),timeout=5)
 db.row_factory=sqlite3.Row
 db.execute('PRAGMA busy_timeout=5000')
 # executescript commits implicitly and acquires write locks, even for info.
 # Run the legacy schema bootstrap only when one of its tables is missing.
 required=('ft3_plan_months','ft3_plan_values','ft3_plan_accounts',
           'ft4_manual_plan_targets','ft3_templates','ft5_debit_positions')
 if any(not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(table,)).fetchone() for table in required):
  db.executescript(SCHEMA+TEMPLATE_SCHEMA+DEBIT_SCHEMA)
 return db

def action(hass,op,data):
 month=validate_month(data.get('month'))
 with _open(hass) as db:
  existing=db.execute('SELECT status FROM ft3_plan_months WHERE month=?',(month,)).fetchone()
  if op=='info':
   return {'month':month,'status':existing['status'] if existing else 'imported','editable':bool(existing),'positions':[dict(r) for r in db.execute('SELECT id,name,kind,source_row FROM ft3_positions ORDER BY source_row')], 'debit_positions':{r['position_id']:dict(r) for r in db.execute('SELECT * FROM ft5_debit_positions WHERE month=?',(month,))}, 'debit_templates':{r['template_id']:dict(r) for r in db.execute('SELECT * FROM ft5_debit_templates')}, 'template_transfer_targets':{r['template_id']:r['to_account_id'] for r in db.execute('SELECT template_id,to_account_id FROM ft4_plan_transfer_targets WHERE month=?',(month,))}, 'manual_transfer_targets':{r['position_id']:r['to_account_id'] for r in db.execute('SELECT position_id,to_account_id FROM ft4_manual_plan_targets WHERE month=?',(month,))}, 'account_assignments':{**{r['position_id']:r['account_id'] for r in db.execute('SELECT position_id,account_id FROM ft3_plan_accounts WHERE month=?',(month,))}, **{'tpl:'+r['template_id']:r['account_id'] for r in db.execute('SELECT template_id,account_id FROM ft3_template_plan_items WHERE month=? AND account_id IS NOT NULL',(month,))}}, 'accounts':[dict(r) for r in db.execute('SELECT id,name,kind FROM ft_accounts WHERE active=1 ORDER BY name')], 'excluded':[r['position_id'] for r in db.execute('SELECT position_id FROM ft3_plan_exclusions WHERE month=?',(month,))], 'categories':{**{r['position_id']:r['category_id'] for r in db.execute('SELECT position_id,category_id FROM ft3_plan_categories WHERE month=?',(month,))}, **{'tpl:'+r['template_id']:r['category_id'] for r in db.execute('SELECT template_id,category_id FROM ft3_template_plan_items WHERE month=? AND category_id IS NOT NULL',(month,))}}, 'mapped_categories':{r['id']:r['category_id'] for r in db.execute('SELECT p.id,m.category_id FROM ft3_positions p JOIN ft3_category_mapping m ON p.name=m.source_name AND p.kind=m.source_kind')}, 'template_items':[dict(r) for r in db.execute('SELECT i.*,t.name,t.kind FROM ft3_template_plan_items i JOIN ft3_templates t ON t.id=i.template_id WHERE i.month=?',(month,))]}
  if op=='create':
   if existing: raise HomeAssistantError('Monatsentwurf existiert bereits')
   if data.get('mode','template')!='template' or data.get('included_positions'):
    raise HomeAssistantError('Neue Monatsentwürfe ausschließlich aus Monatsvorlagen erstellen')
   tids=data.get('template_ids',[])
   if not isinstance(tids,list) or any(not isinstance(t,str) for t in tids):raise HomeAssistantError('Ungültige Vorlagenauswahl')
   target_imported=bool(db.execute('SELECT 1 FROM ft3_periods WHERE period=?',(month,)).fetchone())
   db.execute('BEGIN IMMEDIATE')
   db.execute('INSERT INTO ft3_plan_months VALUES(?,?,?,?)',(month,'draft',now(),now()))
   db.execute("INSERT OR IGNORE INTO ft3_plan_exclusions SELECT ?,id FROM ft3_positions WHERE kind IN ('income','expense','saving_transfer','household_aggregate')",(month,))
   for tid in set(tids):
    t=db.execute('SELECT * FROM ft3_templates WHERE id=? AND active=1 AND deleted=0',(tid,)).fetchone()
    if not t or month[5:] not in __import__('json').loads(t['months']):raise HomeAssistantError('Vorlage für diesen Kalendermonat nicht gültig')
    # Every template, including those imported from an older plan, is a master-data
    # object in its own right. The source position_id is provenance only.
    # Materialize under tpl:<id> so the current template name, kind, account and
    # category are used instead of the historic ft3_positions row.
    db.execute('INSERT OR IGNORE INTO ft3_template_plan_items VALUES(?,?,?,?,?,0)',
               (month,tid,t['amount_cents'],t['category_id'],t['account_id']))
    db.execute('INSERT OR IGNORE INTO ft5_debit_positions SELECT ?,?,enabled,day,automatic,account_id,to_account_id FROM ft5_debit_templates WHERE template_id=?',(month,'tpl:'+tid,tid))
   # Carry over the target account for transfer templates selected into this month.
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_transfer_targets'").fetchone():
    db.execute("""INSERT OR IGNORE INTO ft4_plan_transfer_targets(month,template_id,to_account_id)
       SELECT ?, i.template_id, t.to_account_id FROM ft3_template_plan_items i
       JOIN ft4_transfer_template_targets t ON t.template_id=i.template_id
       WHERE i.month=?""",(month,month))
   db.execute("DELETE FROM ft5_debit_positions WHERE month=? AND position_id LIKE 'tpl:%' AND NOT EXISTS (SELECT 1 FROM ft3_template_plan_items i WHERE i.month=? AND 'tpl:'||i.template_id=ft5_debit_positions.position_id)",(month,month))
   db.execute("INSERT OR IGNORE INTO ft5_debit_positions SELECT ?, 'tpl:'||i.template_id,COALESCE(d.enabled,0),d.day,COALESCE(d.automatic,0),d.account_id,d.to_account_id FROM ft3_template_plan_items i LEFT JOIN ft5_debit_templates d ON d.template_id=i.template_id WHERE i.month=?",(month,month))
   return {'created':True,'month':month,'imported_source_preserved':target_imported}
  if not existing: raise HomeAssistantError('Zuerst Monatsentwurf erstellen')
  if op=='add_position':
   if existing['status']!='draft':raise HomeAssistantError('Positionen können nur in Entwürfen ergänzt werden')
   from uuid import uuid4
   name=str(data.get('name') or '').strip()
   kind=str(data.get('kind') or '')
   amount=data.get('amount_cents')
   if not name or len(name)>240:raise HomeAssistantError('Bezeichnung erforderlich (maximal 240 Zeichen)')
   if kind not in ('income','expense','saving_transfer'):raise HomeAssistantError('Ungültige Buchungsart')
   if type(amount)!=int or abs(amount)>100000000000:raise HomeAssistantError('Ungültiger Centbetrag')
   amount=(1 if kind=='income' else -1)*abs(amount)
   cid=data.get('category_id') or None;aid=data.get('account_id') or None
   verify_template(db,kind,cid,aid)
   target=str(data.get('to_account_id') or '')
   if kind=='saving_transfer':
    if not aid or not target:raise HomeAssistantError('Quell- und Zielkonto sind erforderlich')
    if aid==target:raise HomeAssistantError('Quell- und Zielkonto dürfen nicht identisch sein')
    if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(target,)).fetchone():raise HomeAssistantError('Zielkonto fehlt oder ist inaktiv')
   db.execute('BEGIN IMMEDIATE')
   # A manual position is an independent position belonging to its creation month.
   # It is not inserted into the recurring monthly template table.
   pid='manual:'+uuid4().hex
   source_row=db.execute('SELECT COALESCE(MAX(source_row),0)+1 FROM ft3_positions').fetchone()[0]
   db.execute('INSERT INTO ft3_positions(id,source_sheet,source_row,name,group_name,kind,owner) VALUES(?,?,?,?,?,?,NULL)',(pid,'manual:'+month,source_row,name,'Individuell',kind))
   db.execute('INSERT INTO ft3_plan_values(month,position_id,amount_cents,updated) VALUES(?,?,?,?)',(month,pid,amount,now()))
   if cid:db.execute('INSERT INTO ft3_plan_categories(month,position_id,category_id) VALUES(?,?,?)',(month,pid,cid))
   if aid:db.execute('INSERT INTO ft3_plan_accounts(month,position_id,account_id,updated) VALUES(?,?,?,?)',(month,pid,aid,now()))
   if kind=='saving_transfer':db.execute('INSERT INTO ft4_manual_plan_targets VALUES(?,?,?)',(month,pid,target))
   db.execute('UPDATE ft3_plan_months SET updated=? WHERE month=?',(now(),month))
   return {'created':True,'position_id':pid,'month':month}
  if op=='delete':
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_actual_links'").fetchone():
    if db.execute('SELECT 1 FROM ft4_plan_actual_links WHERE month=? LIMIT 1',(month,)).fetchone():
     raise HomeAssistantError('Zunächst die Plan-Ist-Zuordnungen dieses Entwurfs entfernen')
   if existing['status']!='draft':raise HomeAssistantError('Nur nicht freigegebene Monatsentwürfe können gelöscht werden')
   # Prevent losing the planning provenance of confirmed or skipped proposals.
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_proposal_decisions'").fetchone():
    if db.execute('SELECT 1 FROM ft3_proposal_decisions WHERE month=? LIMIT 1',(month,)).fetchone():
     raise HomeAssistantError('Monatsentwurf hat bereits Buchungsentscheidungen und darf nicht gelöscht werden')
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_transfer_targets'").fetchone():
    db.execute('DELETE FROM ft4_plan_transfer_targets WHERE month=?',(month,))
   db.execute('DELETE FROM ft4_manual_plan_targets WHERE month=?',(month,))
   for table in ('ft3_plan_values','ft3_plan_accounts','ft3_plan_exclusions','ft3_plan_categories','ft3_template_plan_items','ft5_debit_positions'):
    db.execute('DELETE FROM '+table+' WHERE month=?',(month,))
   db.execute('DELETE FROM ft3_plan_months WHERE month=?',(month,))
   return {'deleted':True,'month':month,'imported_source_preserved':True}
  if op=='save':
   if existing['status']!='draft': raise HomeAssistantError('Freigegebenen Plan erst als neue Version öffnen')
   ident=str(data.get('position_id',''))
   pos=db.execute('SELECT kind FROM ft3_positions WHERE id=?',(ident,)).fetchone() if not ident.startswith('tpl:') else db.execute('SELECT kind FROM ft3_templates WHERE id=?',(ident[4:],)).fetchone()
   if not pos or pos['kind'] not in ('income','expense','saving_transfer','household_aggregate'):
    raise HomeAssistantError('Nur echte Planpositionen sind bearbeitbar')
   amount=data.get('amount_cents')
   if type(amount) is not int or abs(amount)>100000000000:raise HomeAssistantError('Ungültiger Centbetrag')
   if pos['kind'] in ('income','expense'):amount=(1 if pos['kind']=='income' else -1)*abs(amount)
   if ident.startswith('tpl:'):
    db.execute('UPDATE ft3_template_plan_items SET amount_cents=?,customized=1 WHERE month=? AND template_id=?',(amount,month,ident[4:]))
    if not db.execute('SELECT changes()').fetchone()[0]:raise HomeAssistantError('Vorlagenposition nicht im Monatsplan')
   else:
    db.execute('INSERT INTO ft3_plan_values VALUES(?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET amount_cents=excluded.amount_cents,updated=excluded.updated',(month,ident,amount,now()))
   if pos['kind']=='saving_transfer' and ident.startswith('tpl:') and 'to_account_id' in data:
    source=str(data.get('account_id') or '')
    target=str(data.get('to_account_id') or '')
    if not source or not target or source==target:raise HomeAssistantError('Zwei unterschiedliche Konten erforderlich')
    if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(target,)).fetchone():raise HomeAssistantError('Zielkonto ungültig')
    db.execute('INSERT INTO ft4_plan_transfer_targets(month,template_id,to_account_id) VALUES(?,?,?) ON CONFLICT(month,template_id) DO UPDATE SET to_account_id=excluded.to_account_id',(month,ident[4:],target))
   if 'category_id' in data:
    cid=data.get('category_id') or None
    verify_template(db,pos['kind'],cid,None)
    if ident.startswith('tpl:'):
     db.execute('UPDATE ft3_template_plan_items SET category_id=?,customized=1 WHERE month=? AND template_id=?',(cid,month,ident[4:]))
    else:
     if cid:db.execute('INSERT INTO ft3_plan_categories VALUES(?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET category_id=excluded.category_id',(month,ident,cid))
     else:db.execute('DELETE FROM ft3_plan_categories WHERE month=? AND position_id=?',(month,ident))
   if 'to_account_id' in data and pos['kind']=='saving_transfer' and not ident.startswith('tpl:'):
    target=str(data.get('to_account_id') or '')
    source=str(data.get('account_id') or (db.execute('SELECT account_id FROM ft3_plan_accounts WHERE month=? AND position_id=?',(month,ident)).fetchone() or [''])[0])
    if not source or not target or source==target:raise HomeAssistantError('Zwei unterschiedliche Konten erforderlich')
    if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(target,)).fetchone():raise HomeAssistantError('Zielkonto fehlt oder ist inaktiv')
    db.execute('INSERT INTO ft4_manual_plan_targets VALUES(?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET to_account_id=excluded.to_account_id',(month,ident,target))
   if 'account_id' in data:
    aid=str(data.get('account_id') or '')
    if aid:
     if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(aid,)).fetchone():raise HomeAssistantError('Konto nicht vorhanden oder inaktiv')
     if ident.startswith('tpl:'):db.execute('UPDATE ft3_template_plan_items SET account_id=?,customized=1 WHERE month=? AND template_id=?',(aid,month,ident[4:]))
     else:db.execute('INSERT INTO ft3_plan_accounts VALUES(?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET account_id=excluded.account_id,updated=excluded.updated',(month,ident,aid,now()))
    else:
     if ident.startswith('tpl:'):db.execute('UPDATE ft3_template_plan_items SET account_id=NULL,customized=1 WHERE month=? AND template_id=?',(month,ident[4:]))
     else:db.execute('DELETE FROM ft3_plan_accounts WHERE month=? AND position_id=?',(month,ident))
   if ident.startswith('tpl:'):
    account=db.execute('SELECT account_id FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,ident[4:])).fetchone()
    target=db.execute('SELECT to_account_id FROM ft4_plan_transfer_targets WHERE month=? AND template_id=?',(month,ident[4:])).fetchone()
   else:
    account=db.execute('SELECT account_id FROM ft3_plan_accounts WHERE month=? AND position_id=?',(month,ident)).fetchone()
    target=db.execute('SELECT to_account_id FROM ft4_manual_plan_targets WHERE month=? AND position_id=?',(month,ident)).fetchone()
   aid=account[0] if account else None; to=target[0] if target and pos['kind']=='saving_transfer' else None
   cfg=debit_config(db,month,ident)
   if 'debit_enabled' in data:
    save_debit(db,month,ident,pos['kind'],{**data,'account_id':aid,'to_account_id':to})
   elif cfg['enabled']:
    if aid!=cfg['account_id'] or to!=cfg['to_account_id']:
     raise HomeAssistantError('Kontozuordnung und Lastschrift stimmen nicht überein. Lastschrift ausdrücklich prüfen und speichern.')
    # Freeze the inherited configuration for this month without changing its permissions.
    db.execute('INSERT OR IGNORE INTO ft5_debit_positions VALUES(?,?,?,?,?,?,?)',(month,ident,cfg['enabled'],cfg['day'],cfg['automatic'],aid,to))
   db.execute('UPDATE ft3_plan_months SET updated=? WHERE month=?',(now(),month))
   return {'saved':True}
  if op=='exclude':
   pid=str(data.get('position_id') or '')
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_actual_links'").fetchone():
    if db.execute('SELECT 1 FROM ft4_plan_actual_links WHERE month=? AND position_id=? LIMIT 1',(month,pid)).fetchone():
     raise HomeAssistantError('Position ist mit Ist-Buchungen verknüpft. Plan-Ist-Zuordnung zuerst entfernen')
   if existing['status']!='draft':raise HomeAssistantError('Nur Entwürfe bearbeitbar')
   pid=str(data.get('position_id') or '')
   if pid.startswith('tpl:'):
    db.execute('DELETE FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,pid[4:]))
    db.execute('DELETE FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,pid))
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft4_plan_transfer_targets'").fetchone():
     db.execute('DELETE FROM ft4_plan_transfer_targets WHERE month=? AND template_id=?',(month,pid[4:]))
   else:
    if not db.execute('SELECT 1 FROM ft3_positions WHERE id=?',(pid,)).fetchone():raise HomeAssistantError('Position nicht vorhanden')
    db.execute('INSERT OR IGNORE INTO ft3_plan_exclusions VALUES(?,?)',(month,pid))
   if not pid.startswith('tpl:'):
    db.execute('DELETE FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,pid))
    db.execute('DELETE FROM ft3_plan_values WHERE month=? AND position_id=?',(month,pid))
    db.execute('DELETE FROM ft4_manual_plan_targets WHERE month=? AND position_id=?',(month,pid))
    db.execute('DELETE FROM ft3_plan_accounts WHERE month=? AND position_id=?',(month,pid))
    db.execute('DELETE FROM ft3_plan_categories WHERE month=? AND position_id=?',(month,pid))
   db.execute('UPDATE ft3_plan_months SET updated=? WHERE month=?',(now(),month))
   return {'excluded':True}
  if op=='release':
   if existing['status']!='draft':raise HomeAssistantError('Plan bereits freigegeben')
   db.execute("UPDATE ft3_plan_months SET status='released',updated=? WHERE month=?",(now(),month))
   return {'released':True}
  if op=='revise':
   if existing['status']!='released':raise HomeAssistantError('Nur freigegebene Pläne überarbeiten')
   db.execute("UPDATE ft3_plan_months SET status='draft',updated=? WHERE month=?",(now(),month))
   return {'draft':True}
  raise HomeAssistantError('Unbekannte Planaktion')
