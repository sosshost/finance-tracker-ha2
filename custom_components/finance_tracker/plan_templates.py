"""Explicit-month planning templates; no automatic cash postings."""
import sqlite3
from uuid import uuid4
from .ledger import validate_month, now
from .direct_debit import SCHEMA as DEBIT_SCHEMA, _validate as validate_debit
from .finance_planning import read_planning
from homeassistant.exceptions import HomeAssistantError

SCHEMA='''
CREATE TABLE IF NOT EXISTS ft3_templates(id TEXT PRIMARY KEY,position_id TEXT UNIQUE,name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('income','expense')),amount_cents INTEGER NOT NULL,category_id TEXT,account_id TEXT,months TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ft3_template_plan_items(month TEXT NOT NULL,template_id TEXT NOT NULL,amount_cents INTEGER NOT NULL,category_id TEXT,account_id TEXT,customized INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(month,template_id));
CREATE TABLE IF NOT EXISTS ft3_plan_exclusions(month TEXT NOT NULL,position_id TEXT NOT NULL,PRIMARY KEY(month,position_id));
CREATE TABLE IF NOT EXISTS ft3_plan_categories(month TEXT NOT NULL,position_id TEXT NOT NULL,category_id TEXT,PRIMARY KEY(month,position_id));
'''
def connect(hass):
 db=sqlite3.connect(hass.config.path('finance/household_v2.db'),timeout=5)
 db.row_factory=sqlite3.Row
 db.execute('CREATE TABLE IF NOT EXISTS ft_category_archive(id TEXT PRIMARY KEY)')
 db.execute('PRAGMA foreign_keys=ON');db.execute('PRAGMA busy_timeout=5000')
 required=('ft3_templates','ft3_template_plan_items','ft3_plan_exclusions','ft3_plan_categories','ft5_debit_templates','ft5_debit_positions','ft5_debit_settings','ft5_debit_account_settings','ft5_debit_runs','ft5_debit_failures','ft5_debit_events')
 if any(not db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(t,)).fetchone() for t in required):db.executescript(SCHEMA+DEBIT_SCHEMA)
 if 'deleted' not in {r['name'] for r in db.execute('PRAGMA table_info(ft3_templates)')}: db.execute('ALTER TABLE ft3_templates ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0')
 # Migration: legacy year-specific template months become annual calendar months.
 import json
 for row in db.execute('SELECT id,months FROM ft3_templates').fetchall():
  old=json.loads(row['months']);new=months_check(old)
  if old!=new:db.execute('UPDATE ft3_templates SET months=? WHERE id=?',(json.dumps(new),row['id']))
 # Transfers remain two ledger postings; this only expands master-data kinds.
 schema=db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='ft3_templates'").fetchone()[0]
 if "'saving_transfer'" not in schema:
  db.execute('SAVEPOINT ft4_transfer_template_migration')
  try:
   db.execute('ALTER TABLE ft3_templates RENAME TO ft3_templates_legacy')
   db.execute("""CREATE TABLE ft3_templates(
    id TEXT PRIMARY KEY,position_id TEXT UNIQUE,name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('income','expense','saving_transfer')),
    amount_cents INTEGER NOT NULL,category_id TEXT,account_id TEXT,
    months TEXT NOT NULL DEFAULT '[]',active INTEGER NOT NULL DEFAULT 1,
    updated TEXT NOT NULL,deleted INTEGER NOT NULL DEFAULT 0)""")
   db.execute("""INSERT INTO ft3_templates(id,position_id,name,kind,amount_cents,category_id,account_id,months,active,updated,deleted)
     SELECT id,position_id,name,kind,amount_cents,category_id,account_id,months,active,updated,deleted FROM ft3_templates_legacy""")
   db.execute('DROP TABLE ft3_templates_legacy')
   db.execute('RELEASE SAVEPOINT ft4_transfer_template_migration')
  except Exception:
   db.execute('ROLLBACK TO SAVEPOINT ft4_transfer_template_migration')
   db.execute('RELEASE SAVEPOINT ft4_transfer_template_migration')
   raise
 db.execute("""CREATE TABLE IF NOT EXISTS ft4_transfer_template_targets(
  template_id TEXT PRIMARY KEY,to_account_id TEXT NOT NULL REFERENCES ft_accounts(id))""")
 db.execute("""CREATE TABLE IF NOT EXISTS ft4_plan_transfer_targets(
  month TEXT NOT NULL,template_id TEXT NOT NULL,to_account_id TEXT NOT NULL REFERENCES ft_accounts(id),
  PRIMARY KEY(month,template_id))""")
 db.commit()
 return db

def months_check(months):
 if not isinstance(months,list) or len(months)>240:raise HomeAssistantError('Bitte eine gültige Monatsauswahl angeben')
 result=set()
 for m in months:
  m=str(m)
  if len(m)==7: m=validate_month(m)[5:]
  if not (len(m)==2 and m.isdigit() and 1<=int(m)<=12):raise HomeAssistantError('Ungültiger Kalendermonat')
  result.add(m)
 return sorted(result)

def verify(db,kind,category_id,account_id):
 if kind not in ('income','expense','saving_transfer'):raise HomeAssistantError('Unbekannte Vorlagenart')
 if kind=='saving_transfer' and category_id:raise HomeAssistantError('Umbuchungen haben keine Einnahme-/Ausgabenkategorie')
 if category_id and not db.execute('SELECT 1 FROM ft_categories WHERE id=? AND kind=?',(category_id,kind)).fetchone():raise HomeAssistantError('Kategorie passt nicht zur Buchungsart')
 if account_id and not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(account_id,)).fetchone():raise HomeAssistantError('Ungültiges Konto')

def action(hass,op,data):
 import json
 with connect(hass) as db:
  if op=='list':
   templates=[]
   for r in db.execute('SELECT * FROM ft3_templates WHERE deleted=0 ORDER BY kind,name COLLATE NOCASE'):
    t=dict(r);t['months']=json.loads(t['months']);debit=db.execute('SELECT * FROM ft5_debit_templates WHERE template_id=?',(t['id'],)).fetchone();t.update({k:debit[k] for k in ('enabled','day','automatic')}) if debit else t.update({'enabled':0,'day':None,'automatic':0});t['to_account_id']=db.execute('SELECT to_account_id FROM ft4_transfer_template_targets WHERE template_id=?',(t['id'],)).fetchone();t['to_account_id']=t['to_account_id'][0] if t['to_account_id'] else None;templates.append(t)
   return {'templates':templates}
  if op in ('source','import_from_plan'):
   # The plan remains the source of truth; never change its rows or posted transactions.
   available=[r['month'] for r in db.execute("SELECT month FROM ft3_plan_months WHERE status IN ('draft','released') ORDER BY month DESC")]
   month=validate_month(data.get('month') or (available[0] if available else '2000-01'))
   if month not in available:
    if op=='source':return {'months':available,'month':month,'positions':[]}
    raise HomeAssistantError('Nur vorhandene Monatsentwürfe oder freigegebene Pläne können als Quelle dienen')
   snapshot=read_planning(hass.config.path('finance/household_v2.db'),month)
   cats={r['position_id']:r['category_id'] for r in db.execute('SELECT position_id,category_id FROM ft3_plan_categories WHERE month=?',(month,))}
   accounts={r['position_id']:r['account_id'] for r in db.execute('SELECT position_id,account_id FROM ft3_plan_accounts WHERE month=?',(month,))}
   mapping={(r['source_name'],r['source_kind']):r['category_id'] for r in db.execute('SELECT source_name,source_kind,category_id FROM ft3_category_mapping')}
   existing_positions={r['position_id'] for r in db.execute('SELECT position_id FROM ft3_templates WHERE position_id IS NOT NULL')}
   existing_names={(r['kind'],r['name'].casefold()) for r in db.execute('SELECT kind,name FROM ft3_templates')}
   template_lookup={r['template_id']:r for r in db.execute('SELECT template_id,category_id,account_id FROM ft3_template_plan_items WHERE month=?',(month,))}
   positions=[]
   for r in snapshot['rows']:
    pid=str(r.get('position_id') or '')
    if r.get('kind') not in ('expense','income') or r.get('amount_cents') is None or not pid:continue
    is_tpl=pid.startswith('tpl:')
    original=template_lookup.get(pid[4:]) if is_tpl else None
    cid=(original['category_id'] if original else cats.get(pid) or mapping.get((r['name'],r['kind'])))
    aid=(original['account_id'] if original else accounts.get(pid))
    already=is_tpl or pid in existing_positions or (r['kind'],r['name'].casefold()) in existing_names
    positions.append({'position_id':pid,'name':r['name'],'kind':r['kind'],'amount_cents':int(r['amount_cents']),
     'category_id':cid,'account_id':aid,'already_template':already,'group_name':r.get('group_name') or ''})
   positions.sort(key=lambda r:(r['kind']!='expense',(r['group_name'] or '').casefold(),r['name'].casefold(),r['position_id']))
   if op=='source':return {'months':available,'month':month,'positions':positions}
   selected=data.get('position_ids')
   if not isinstance(selected,list) or not selected or len(selected)>500 or len(set(selected))!=len(selected):
    raise HomeAssistantError('Bitte gültige, eindeutige Positionen auswählen')
   chosen_months=months_check(data.get('months',[]))
   if not chosen_months:raise HomeAssistantError('Mindestens einen jährlichen Kalendermonat auswählen')
   by_id={p['position_id']:p for p in positions}
   if not set(selected)<=set(by_id):raise HomeAssistantError('Die Auswahl enthält nicht vorhandene Planpositionen')
   # Validate the complete batch before writing anything. Existing templates are skipped.
   skipped=[]; inserts=[]
   for pid in selected:
    p=by_id[pid]
    if p['already_template']:
     skipped.append(p['name']);continue
    verify(db,p['kind'],p['category_id'],p['account_id'])
    p['amount_cents']=(1 if p['kind']=='income' else -1)*abs(p['amount_cents'])
    inserts.append(p)
   for p in inserts:
    tid=uuid4().hex
    db.execute('INSERT INTO ft3_templates(id,position_id,name,kind,amount_cents,category_id,account_id,months,active,updated) VALUES(?,?,?,?,?,?,?,?,1,?)',
      (tid,p['position_id'],p['name'],p['kind'],p['amount_cents'],p['category_id'],p['account_id'],json.dumps(chosen_months),now()))
    db.execute('INSERT OR IGNORE INTO ft5_debit_templates SELECT ?,enabled,day,automatic,account_id,to_account_id FROM ft5_debit_positions WHERE month=? AND position_id=?',(tid,month,p['position_id']))
   return {'created':len(inserts),'skipped':skipped,'months':chosen_months,'source_month':month}
  if op=='delete':
   ident=str(data.get('id') or '')
   row=db.execute('SELECT id FROM ft3_templates WHERE id=? AND deleted=0',(ident,)).fetchone()
   if not row:raise HomeAssistantError('Vorlage nicht vorhanden oder bereits gelöscht')
   # Tombstone preserves template references in released plans and existing bookings.
   db.execute('UPDATE ft3_templates SET deleted=1,active=0,updated=? WHERE id=?',(now(),ident))
   return {'deleted':True,'id':ident,'historical_references_preserved':True}
  if op=='save':
   ident=str(data.get('id') or uuid4().hex);name=str(data.get('name') or '').strip()
   if not name or len(name)>240:raise HomeAssistantError('Ungültige Bezeichnung')
   kind=str(data.get('kind') or 'expense');amount=data.get('amount_cents')
   if type(amount)!=int or abs(amount)>100000000000:raise HomeAssistantError('Ungültiger Betrag')
   amount=(1 if kind=='income' else -1)*abs(amount)
   months=months_check(data.get('months',[]))
   cid=data.get('category_id') or None;aid=data.get('account_id') or None
   verify(db,kind,cid,aid)
   to_id=str(data.get('to_account_id') or '')
   if kind=='saving_transfer':
    if not aid or not to_id or aid==to_id:raise HomeAssistantError('Für Umbuchungen zwei unterschiedliche Konten angeben')
    if not db.execute('SELECT 1 FROM ft_accounts WHERE id=? AND active=1',(to_id,)).fetchone():raise HomeAssistantError('Zielkonto fehlt oder ist inaktiv')
   else:
    to_id=''
   pos=data.get('position_id') or None
   if not pos:
    # Historical ft3_positions can share the display name: template IDs are independent.
    # A source-row name must never prevent a stand-alone template from being created.
    if db.execute('SELECT 1 FROM ft3_templates WHERE name=? AND kind=? AND id<>?',(name,kind,ident)).fetchone():raise HomeAssistantError('Vorlagenname bereits vorhanden')
   if pos:
    # An imported template remains independent of its historic source row.
    # position_id only records where it originally came from, and must not
    # force the source name, kind or other source metadata onto the template.
    p=db.execute('SELECT id FROM ft3_positions WHERE id=?',(pos,)).fetchone()
    if not p:raise HomeAssistantError('Quellposition nicht gefunden')
   existing=db.execute('SELECT id,deleted FROM ft3_templates WHERE id=?',(ident,)).fetchone()
   if existing and existing['deleted']:raise HomeAssistantError('Gelöschte Vorlage kann nicht überschrieben werden')
   if existing:
    old_debit=db.execute('SELECT * FROM ft5_debit_templates WHERE template_id=?',(ident,)).fetchone()
    if old_debit and old_debit['enabled'] and 'debit_enabled' not in data and (aid!=old_debit['account_id'] or (to_id or None)!=old_debit['to_account_id']):
     raise HomeAssistantError('Lastschrift bei Änderung des Kontos ausdrücklich prüfen und speichern')
    # Existing months must not inherit later changes to template permissions.
    db.execute("INSERT OR IGNORE INTO ft5_debit_positions SELECT i.month,'tpl:'||i.template_id,COALESCE(d.enabled,0),d.day,COALESCE(d.automatic,0),d.account_id,d.to_account_id FROM ft3_template_plan_items i LEFT JOIN ft5_debit_templates d ON d.template_id=i.template_id WHERE i.template_id=?",(ident,))
    db.execute('UPDATE ft3_templates SET position_id=?,name=?,kind=?,amount_cents=?,category_id=?,account_id=?,months=?,active=?,updated=? WHERE id=?',(pos,name,kind,amount,cid,aid,json.dumps(months),int(bool(data.get('active',True))),now(),ident))
   else:
    db.execute('INSERT INTO ft3_templates(id,position_id,name,kind,amount_cents,category_id,account_id,months,active,updated) VALUES(?,?,?,?,?,?,?,?,?,?)',(ident,pos,name,kind,amount,cid,aid,json.dumps(months),int(bool(data.get('active',True))),now()))
   if to_id:
    db.execute('INSERT INTO ft4_transfer_template_targets(template_id,to_account_id) VALUES(?,?) ON CONFLICT(template_id) DO UPDATE SET to_account_id=excluded.to_account_id',(ident,to_id))
   else:
    db.execute('DELETE FROM ft4_transfer_template_targets WHERE template_id=?',(ident,))
   if 'debit_enabled' in data:
    enabled=int(data.get('debit_enabled') is True);automatic=int(data.get('debit_automatic') is True)
    day=int(data['debit_day']) if str(data.get('debit_day') or '').isdigit() else None
    validate_debit(db,kind,enabled,day,automatic,aid,to_id)
    db.execute('INSERT INTO ft5_debit_templates VALUES(?,?,?,?,?,?) ON CONFLICT(template_id) DO UPDATE SET enabled=excluded.enabled,day=excluded.day,automatic=excluded.automatic,account_id=excluded.account_id,to_account_id=excluded.to_account_id',
      (ident,enabled,day if enabled else None,automatic if enabled else 0,aid,to_id or None))
   return {'saved':True,'id':ident}
  if op=='apply':
   tid=str(data.get('id') or '');months=sorted({validate_month(m) for m in data.get('months',[])});t=db.execute('SELECT * FROM ft3_templates WHERE id=? AND active=1 AND deleted=0',(tid,)).fetchone()
   if not t:raise HomeAssistantError('Vorlage nicht gefunden')
   if t['category_id'] and db.execute('SELECT 1 FROM ft_category_archive WHERE id=?',(t['category_id'],)).fetchone():raise HomeAssistantError('Vorlage enthält archivierte Kategorie. Bitte zuerst korrigieren.')
   applied=[];skipped=[]
   for month in months:
    p=db.execute('SELECT status FROM ft3_plan_months WHERE month=?',(month,)).fetchone()
    if not p or p['status']!='draft':skipped.append(month);continue
    # Keep template identity and its latest master data even when the
    # template was originally imported from a planning source row.
    existing_item=db.execute('SELECT customized FROM ft3_template_plan_items WHERE month=? AND template_id=?',(month,tid)).fetchone()
    if not existing_item:
     db.execute('INSERT INTO ft3_template_plan_items VALUES(?,?,?,?,?,0)',
                (month,tid,t['amount_cents'],t['category_id'],t['account_id']))
    if not existing_item:
     db.execute('INSERT OR IGNORE INTO ft5_debit_positions SELECT ?,?,enabled,day,automatic,account_id,to_account_id FROM ft5_debit_templates WHERE template_id=?',(month,'tpl:'+tid,tid))
     db.execute('INSERT OR IGNORE INTO ft5_debit_positions(month,position_id,enabled,automatic) VALUES(?,?,0,0)',(month,'tpl:'+tid))
    if t['kind']=='saving_transfer':
     target=db.execute('SELECT to_account_id FROM ft4_transfer_template_targets WHERE template_id=?',(tid,)).fetchone()
     if not target:raise HomeAssistantError('Zielkonto für Umbuchungsvorlage fehlt')
     db.execute('INSERT OR IGNORE INTO ft4_plan_transfer_targets VALUES(?,?,?)',(month,tid,target[0]))
    if t['position_id']:
     db.execute('INSERT OR IGNORE INTO ft3_plan_exclusions VALUES(?,?)',(month,t['position_id']))
    applied.append(month)
   return {'applied':applied,'skipped':skipped}
  if op=='propagate':
   month=validate_month(data.get('from_month'));source=str(data.get('position_id') or '');scopes=sorted({validate_month(m) for m in data.get('months',[])});change_template=bool(data.get('template'))
   if not source:raise HomeAssistantError('Quellposition fehlt')
   # Changes are explicit and only target draft months; never modify released plans.
   template=db.execute('SELECT * FROM ft3_templates WHERE position_id=? OR id=?',(source,source.replace('tpl:',''))).fetchone()
   if not template and change_template:raise HomeAssistantError('Keine zugeordnete Vorlage vorhanden')
   amount=data.get('amount_cents');cid=data.get('category_id') or None;aid=data.get('account_id') or None
   if type(amount)!=int:raise HomeAssistantError('Ungültiger Betrag')
   kind=template['kind'] if template else db.execute('SELECT kind FROM ft3_positions WHERE id=?',(source,)).fetchone()
   kind=kind if isinstance(kind,str) else kind['kind'] if kind else None
   verify(db,kind,cid,aid)
   amount=(1 if kind=='income' else -1)*abs(amount)
   # Read all metadata from the authoritative source month. Propagate it as a coherent set.
   source_debit=db.execute('SELECT enabled,day,automatic,account_id,to_account_id FROM ft5_debit_positions WHERE month=? AND position_id=?',(month,source)).fetchone()
   if source_debit is None and source.startswith('tpl:'):
    source_debit=db.execute('SELECT enabled,day,automatic,account_id,to_account_id FROM ft5_debit_templates WHERE template_id=?',(source[4:],)).fetchone()
   source_debit=dict(source_debit) if source_debit else None
   if source_debit and source_debit['enabled']:
    # The selected booking account replaces the previous account in the propagated configuration.
    validate_debit(db,kind,source_debit['enabled'],source_debit['day'],source_debit['automatic'],aid,source_debit['to_account_id'])
   if change_template:
    db.execute("INSERT OR IGNORE INTO ft5_debit_positions SELECT i.month,'tpl:'||i.template_id,COALESCE(d.enabled,0),d.day,COALESCE(d.automatic,0),d.account_id,d.to_account_id FROM ft3_template_plan_items i LEFT JOIN ft5_debit_templates d ON d.template_id=i.template_id WHERE i.template_id=?",(template['id'],))
    db.execute('UPDATE ft3_templates SET amount_cents=?,category_id=?,account_id=?,updated=? WHERE id=?',(amount,cid,aid,now(),template['id']))
    if source_debit:
     db.execute('''INSERT INTO ft5_debit_templates(template_id,enabled,day,automatic,account_id,to_account_id)
       VALUES(?,?,?,?,?,?) ON CONFLICT(template_id) DO UPDATE SET enabled=excluded.enabled,day=excluded.day,
       automatic=excluded.automatic,account_id=excluded.account_id,to_account_id=excluded.to_account_id''',
       (template['id'],source_debit['enabled'],source_debit['day'],source_debit['automatic'],aid,source_debit['to_account_id']))
   changed=[];skipped=[]
   for m in scopes:
    if m<=month:continue
    st=db.execute('SELECT status FROM ft3_plan_months WHERE month=?',(m,)).fetchone()
    if not st or st['status']!='draft':skipped.append(m);continue
    if source.startswith('tpl:'):
     row=db.execute('SELECT customized FROM ft3_template_plan_items WHERE month=? AND template_id=?',(m,source[4:])).fetchone()
     if not row:skipped.append(m);continue
     # Explicitly selected target drafts are updated even if they had previous customizations.
     db.execute('UPDATE ft3_template_plan_items SET amount_cents=?,category_id=?,account_id=?,customized=1 WHERE month=? AND template_id=?',(amount,cid,aid,m,source[4:]))
    else:
     if not db.execute('SELECT 1 FROM ft3_positions WHERE id=?',(source,)).fetchone():skipped.append(m);continue
     db.execute('INSERT INTO ft3_plan_values VALUES(?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET amount_cents=excluded.amount_cents,updated=excluded.updated',(m,source,amount,now()))
     if cid:db.execute('INSERT INTO ft3_plan_categories VALUES(?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET category_id=excluded.category_id',(m,source,cid))
     else:db.execute('DELETE FROM ft3_plan_categories WHERE month=? AND position_id=?',(m,source))
     if aid:
      db.execute('INSERT INTO ft3_plan_accounts VALUES(?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET account_id=excluded.account_id,updated=excluded.updated',(m,source,aid,now()))
     else:db.execute('DELETE FROM ft3_plan_accounts WHERE month=? AND position_id=?',(m,source))
    if source_debit:
     db.execute('''INSERT INTO ft5_debit_positions(month,position_id,enabled,day,automatic,account_id,to_account_id)
       VALUES(?,?,?,?,?,?,?) ON CONFLICT(month,position_id) DO UPDATE SET enabled=excluded.enabled,day=excluded.day,
       automatic=excluded.automatic,account_id=excluded.account_id,to_account_id=excluded.to_account_id''',
       (m,source,source_debit['enabled'],source_debit['day'],source_debit['automatic'],aid,source_debit['to_account_id']))
    changed.append(m)
   return {'updated':changed,'skipped':skipped,'template_updated':change_template}
  raise HomeAssistantError('Unbekannte Vorlagenaktion')
