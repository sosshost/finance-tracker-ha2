"""Read planning snapshots and non-destructive overlays."""
import sqlite3
from .closing_balance import differences
from pathlib import Path
KINDS=('income','expense','balance','saving_transfer','derived','household_aggregate','clearing','status')
def category_trends(db, year, periods, historical, timeline):
 """Read-only category totals using the same plan overlays and closing precedence."""
 tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
 def exists(name): return name in tables
 groups={}
 if exists('ft_categories'):
  for r in db.execute('SELECT id,name FROM ft_categories'):
   groups[r[0]]=('name:'+ (r[1].split(' · ')[0] if ' · ' in r[1] else 'Weitere Kategorien'),r[1].split(' · ')[0] if ' · ' in r[1] else 'Weitere Kategorien')
 if exists('ft3_category_hierarchy') and exists('ft3_category_groups'):
  for r in db.execute('SELECT h.category_id,g.id,g.name FROM ft3_category_hierarchy h JOIN ft3_category_groups g ON g.id=h.group_id'):
   groups[r[0]]=(r[1],r[2])
 mappings={(r[0],r[1]):r[2] for r in db.execute('SELECT source_name,source_kind,category_id FROM ft3_category_mapping')} if exists('ft3_category_mapping') else {}
 sources={r['period']:r['source'] for r in historical}
 available={r['period'] for r in timeline}
 result=[]
 for item in periods:
  period=item['period']
  if not (int(year)-2 <= int(period[:4]) <= int(year)): continue
  source=sources.get(period,'plan')
  totals={}
  def add(kind,cid,amount):
   if amount is None: return
   gid,name=groups.get(cid,('uncategorized','Ohne Kategorie'))
   key=(kind,gid,name)
   totals[key]=totals.get(key,0)+int(amount)*( -1 if kind=='expense' else 1)
  if source=='closing':
   for r in db.execute("SELECT kind,category_id,SUM(amount_cents) FROM ft_transactions WHERE booked LIKE ? AND voided=0 AND kind IN ('income','expense') GROUP BY kind,category_id",(period+'%',)):
    add(*r)
  elif period in available:
   overlay=item['status'] in ('draft','released') and exists('ft3_plan_values')
   values=dict(db.execute('SELECT position_id,amount_cents FROM ft3_plan_values WHERE month=?',(period,))) if overlay else {}
   excluded={r[0] for r in db.execute('SELECT position_id FROM ft3_plan_exclusions WHERE month=?',(period,))} if overlay and exists('ft3_plan_exclusions') else set()
   assigned=dict(db.execute('SELECT position_id,category_id FROM ft3_plan_categories WHERE month=?',(period,))) if exists('ft3_plan_categories') else {}
   for r in db.execute("SELECT p.id,p.name,p.kind,v.amount_cents FROM ft3_positions p LEFT JOIN ft3_monthly_values v ON v.position_id=p.id AND v.period=? WHERE p.kind IN ('income','expense')",(period,)):
    if r[0] not in excluded: add(r[2],assigned.get(r[0]) or mappings.get((r[1],r[2])),values.get(r[0],r[3]))
   if overlay and exists('ft3_template_plan_items') and exists('ft3_templates'):
    for r in db.execute("SELECT t.kind,i.category_id,i.amount_cents FROM ft3_template_plan_items i JOIN ft3_templates t ON t.id=i.template_id WHERE i.month=? AND t.kind IN ('income','expense')",(period,)): add(*r)
  else: continue
  result.append({'period':period,'source':source,'groups':[{'kind':k,'id':g,'name':n,'amount_cents':v} for (k,g,n),v in totals.items()]})
 return result

def read_planning(db_path,month=None):
 path=Path(db_path)
 if not path.is_file():raise ValueError('Finanzdatenbank nicht vorhanden')
 with sqlite3.connect(path.as_uri()+'?mode=ro',uri=True,timeout=5) as db:
  db.row_factory=sqlite3.Row
  db.execute('PRAGMA query_only=ON')
  periods=[dict(r) for r in db.execute('SELECT period,status FROM ft3_periods ORDER BY period')]
  has_plan=bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_months'").fetchone())
  released_plan_months=[]
  if has_plan:
   released_plan_months=[r[0] for r in db.execute("SELECT month FROM ft3_plan_months WHERE status='released' ORDER BY month")]
   drafts=[dict(r) for r in db.execute('SELECT month AS period,status FROM ft3_plan_months')]
   periods=sorted({p['period']:p for p in periods+drafts}.values(),key=lambda x:x['period'])
  selected=month or (periods[-1]['period'] if periods else __import__('datetime').date.today().strftime('%Y-%m'))
  if not __import__('re').fullmatch(r'\d{4}-(0[1-9]|1[0-2])',selected):raise ValueError('Ungültiger Monat')
  rows=[dict(r) for r in db.execute('''SELECT p.id AS position_id,p.name,p.kind,p.group_name,p.source_row,v.amount_cents,v.text_value,v.value_type,v.source_cell FROM ft3_monthly_values v JOIN ft3_positions p ON p.id=v.position_id WHERE v.period=? ORDER BY p.source_row''',(selected,))]
  if has_plan:
   overlays={r['position_id']:r['amount_cents'] for r in db.execute('SELECT position_id,amount_cents FROM ft3_plan_values WHERE month=?',(selected,))}
   by_id={r['position_id']:r for r in rows}
   for p in db.execute('SELECT id,name,kind,group_name,source_row FROM ft3_positions ORDER BY source_row'):
    if p['id'] in overlays:
     row=by_id.get(p['id'])
     if row is None:
      row={'position_id':p['id'],'name':p['name'],'kind':p['kind'],'group_name':p['group_name'],'source_row':p['source_row'],'text_value':None,'value_type':'number','source_cell':'Planentwurf'}
      rows.append(row)
     row['amount_cents']=overlays[p['id']]
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_exclusions'").fetchone():
    excluded={r['position_id'] for r in db.execute('SELECT position_id FROM ft3_plan_exclusions WHERE month=?',(selected,))}
    rows=[r for r in rows if r['position_id'] not in excluded]
   if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_template_plan_items'").fetchone():
    for t in db.execute('''SELECT i.template_id,i.amount_cents,t.name,t.kind FROM ft3_template_plan_items i JOIN ft3_templates t ON t.id=i.template_id WHERE i.month=? ORDER BY t.name''',(selected,)):
     rows.append({'position_id':'tpl:'+t['template_id'],'name':t['name'],'kind':t['kind'],'group_name':'Vorlagen','source_row':999999,'amount_cents':t['amount_cents'],'text_value':None,'value_type':'number','source_cell':'Planungsvorlage'})
   rows.sort(key=lambda x:(x['source_row'],x['name']))
  balances=[dict(r) for r in db.execute('''SELECT p.name,p.source_row,b.balance_cents,b.source_cell FROM ft3_balance_snapshots b JOIN ft3_positions p ON p.id=b.position_id WHERE b.period=? ORDER BY p.source_row''',(selected,))]
  timeline=[]
  for r in db.execute('''SELECT v.period,p.kind,SUM(v.amount_cents) amount FROM ft3_monthly_values v JOIN ft3_positions p ON p.id=v.position_id WHERE p.kind IN ('income','expense') GROUP BY v.period,p.kind ORDER BY v.period'''):
   timeline.append(dict(r))
  if has_plan:
   existing={(r['period'],r['kind']):r for r in timeline}
   for period in [p['period'] for p in periods if p['status'] in ('draft','released')]:
    source={r['position_id']:r['amount_cents'] for r in db.execute('SELECT position_id,amount_cents FROM ft3_plan_values WHERE month=?',(period,))}
    excluded={r['position_id'] for r in db.execute('SELECT position_id FROM ft3_plan_exclusions WHERE month=?',(period,))} if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_plan_exclusions'").fetchone() else set()
    for kind in ('income','expense'):
     total=0
     for r in db.execute('SELECT p.id,v.amount_cents FROM ft3_positions p LEFT JOIN ft3_monthly_values v ON v.position_id=p.id AND v.period=? WHERE p.kind=?',(period,kind)):
      if r['id'] not in excluded:total+=(source[r['id']] if r['id'] in source else r['amount_cents']) or 0
     if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ft3_template_plan_items'").fetchone():
      total+=(db.execute('SELECT COALESCE(SUM(i.amount_cents),0) FROM ft3_template_plan_items i JOIN ft3_templates t ON t.id=i.template_id WHERE i.month=? AND t.kind=?',(period,kind)).fetchone()[0] or 0)
     existing[(period,kind)]={'period':period,'kind':kind,'amount':total}
   timeline=sorted(existing.values(),key=lambda x:(x['period'],x['kind']))
  # Historical comparison: never synthesize future periods. A fully closed ledger month
  # is authoritative and therefore uses final booked income/expense. Otherwise the
  # available planning/import values remain the comparison basis.
  current_month=__import__('datetime').date.today().strftime('%Y-%m')
  timeline_by_period={}
  for item in timeline:
   timeline_by_period.setdefault(item['period'],{})[item['kind']]=int(item.get('amount') or 0)
  historical_months=[]
  ledger_ready=all(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",(name,)).fetchone() for name in ('ft_accounts','ft_transactions','ft_closings'))
  for period in sorted({p['period'] for p in periods if p['period']<current_month}):
   plan=timeline_by_period.get(period,{})
   use_closing=False
   income=int(plan.get('income') or 0);expense=int(plan.get('expense') or 0)
   if ledger_ready:
    end_day=(__import__('datetime').date.fromisoformat(period+'-01').replace(day=28)+__import__('datetime').timedelta(days=4))
    end_day=(end_day-__import__('datetime').timedelta(days=end_day.day)).isoformat()
    account_ids=[r[0] for r in db.execute('SELECT id FROM ft_accounts WHERE opening_date<=?',(end_day,))]
    closed_ids={r[0] for r in db.execute('SELECT account_id FROM ft_closings WHERE month=?',(period,))}
    use_closing=bool(account_ids) and all(aid in closed_ids for aid in account_ids)
    if use_closing:
     actual=db.execute("""SELECT COALESCE(SUM(CASE WHEN kind='income' THEN amount_cents ELSE 0 END),0),
                                COALESCE(SUM(CASE WHEN kind='expense' THEN amount_cents ELSE 0 END),0)
                         FROM ft_transactions WHERE booked LIKE ? AND voided=0""",(period+'%',)).fetchone()
     income=int(actual[0] or 0);expense=int(actual[1] or 0)
   if use_closing or plan:
    historical_months.append({'period':period,'income':income,'expense':expense,'source':'closing' if use_closing else 'plan'})
  totals={kind:sum(r.get('amount_cents') or 0 for r in rows if r['kind']==kind) for kind in KINDS}
  closing_differences={}
  if ledger_ready:
   for (period,aid),v in differences(db).items():
    closing_differences[period]=closing_differences.get(period,0)+v['actual']-v['calculated']
   for period in list(closing_differences):
    required={r[0] for r in db.execute('SELECT id FROM ft_accounts WHERE opening_date<=? AND active=1',(period+'-31',))}
    confirmed={r[0] for r in db.execute('SELECT account_id FROM ft_closings WHERE month=?',(period,))}
    if not required.issubset(confirmed): del closing_differences[period]
  return {'category_trends':category_trends(db,selected[:4],periods,historical_months,timeline),'closing_differences':closing_differences,'month':selected,'periods':periods,'released_plan_months':released_plan_months,'rows':rows,'balances':balances,'timeline':timeline,'historical_months':historical_months,'totals_cents':totals,'source':'Excel-Monatsplanung','note':'Keine Einzelbuchungen. Summen je Typ ohne abgeleitete Kontrollwerte; Kontostände sind Bestandsgrößen und nicht zu addieren.'}
