"""Editable category hierarchy. Keeps existing ledger category identifiers stable."""
import sqlite3
from uuid import uuid4
from pathlib import Path
from homeassistant.exceptions import HomeAssistantError

KINDS=('expense','saving_transfer','income')

def _connect(hass):
    db=sqlite3.connect(Path(hass.config.path('finance/household_v2.db')))
    db.row_factory=sqlite3.Row
    db.execute('PRAGMA foreign_keys=ON')
    db.execute('PRAGMA busy_timeout=5000')
    db.execute('''CREATE TABLE IF NOT EXISTS ft3_category_groups
      (id TEXT PRIMARY KEY,kind TEXT NOT NULL,name TEXT NOT NULL,UNIQUE(kind,name))''')
    db.execute('''CREATE TABLE IF NOT EXISTS ft3_category_hierarchy
      (category_id TEXT PRIMARY KEY,group_id TEXT NOT NULL,sub_name TEXT NOT NULL,
       FOREIGN KEY(category_id) REFERENCES ft_categories(id),
       FOREIGN KEY(group_id) REFERENCES ft3_category_groups(id))''')
    # Non-destructive migration of existing categories, including user-created ones.
    for c in db.execute('SELECT id,name,kind FROM ft_categories').fetchall():
        if c['kind'] not in KINDS: continue
        if db.execute('SELECT 1 FROM ft3_category_hierarchy WHERE category_id=?',(c['id'],)).fetchone(): continue
        parts=c['name'].split(' · ',1)
        group,sub=(parts[0].strip(),parts[1].strip()) if len(parts)==2 else ('Weitere Kategorien',c['name'].strip())
        if not group or not sub:continue
        db.execute('INSERT OR IGNORE INTO ft3_category_groups VALUES(?,?,?)',(uuid4().hex,c['kind'],group))
        gid=db.execute('SELECT id FROM ft3_category_groups WHERE kind=? AND name=?',(c['kind'],group)).fetchone()[0]
        db.execute('INSERT OR IGNORE INTO ft3_category_hierarchy VALUES(?,?,?)',(c['id'],gid,sub))
    db.execute("CREATE TABLE IF NOT EXISTS ft_category_archive(id TEXT PRIMARY KEY)")
    db.commit()
    return db

def _name(v):
    v=str(v or '').strip()
    if not v or len(v)>100 or ' · ' in v:raise HomeAssistantError('Name muss 1–100 Zeichen haben und darf kein „ · “ enthalten')
    return v

def action(hass,op,data):
    with _connect(hass) as db:
        if op=='list':
            groups=[dict(x) for x in db.execute('SELECT * FROM ft3_category_groups ORDER BY kind,name COLLATE NOCASE')]
            categories=[dict(x) for x in db.execute('''SELECT h.category_id,h.group_id,h.sub_name,g.kind,g.name AS group_name
               FROM ft3_category_hierarchy h JOIN ft3_category_groups g ON g.id=h.group_id
               ORDER BY g.kind,g.name COLLATE NOCASE,h.sub_name COLLATE NOCASE''')]
            archived={r[0] for r in db.execute('SELECT id FROM ft_category_archive')}
            for x in groups: x['archived']=x['id'] in archived
            for x in categories: x['archived']=x['category_id'] in archived
            return {'groups':groups,'categories':categories}
        if op in ('inspect_remove','remove','restore'):
            gid=data.get('group_id');cid=data.get('category_id');ident=gid or cid
            db.execute('BEGIN IMMEDIATE')
            table='ft3_category_groups' if gid else 'ft3_category_hierarchy'
            key='id' if gid else 'category_id'
            if not db.execute(f'SELECT 1 FROM {table} WHERE {key}=?',(ident,)).fetchone():raise HomeAssistantError('Kategorie nicht gefunden')
            ids=[r[0] for r in db.execute('SELECT category_id FROM ft3_category_hierarchy WHERE group_id=?',(gid,))] if gid else [cid]
            refs={}
            for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ft%'").fetchall():
                t=row[0]; quoted='"'+t.replace('"','""')+'"'
                if t=='ft3_category_hierarchy' or not ids:continue
                if 'category_id' not in {r[1] for r in db.execute(f'PRAGMA table_info({quoted})')}:continue
                placeholders=','.join('?' for _ in ids)
                n=db.execute(f'SELECT COUNT(*) FROM {quoted} WHERE category_id IN ({placeholders})',ids).fetchone()[0]
                if n:refs[t]=n
            mode='archive' if refs else 'delete'
            if op=='inspect_remove':return {'mode':mode,'references':refs,'children':len(ids) if gid else 0}
            if op=='restore':
                if not gid:
                    parent=db.execute('SELECT group_id FROM ft3_category_hierarchy WHERE category_id=?',(cid,)).fetchone()[0]
                    if db.execute('SELECT 1 FROM ft_category_archive WHERE id=?',(parent,)).fetchone():raise HomeAssistantError('Zuerst Oberkategorie reaktivieren')
                db.executemany('DELETE FROM ft_category_archive WHERE id=?',[(i,) for i in set(ids+[ident])])
            elif data.get('mode')!=mode:raise HomeAssistantError('Verwendung geändert. Bitte erneut prüfen.')
            elif mode=='archive':
                db.executemany('INSERT OR IGNORE INTO ft_category_archive VALUES(?)',[(i,) for i in set(ids+[ident])])
            else:
                for i in ids:
                    db.execute('DELETE FROM ft3_category_hierarchy WHERE category_id=?',(i,))
                    db.execute('DELETE FROM ft_categories WHERE id=?',(i,))
                if gid:db.execute('DELETE FROM ft3_category_groups WHERE id=?',(gid,))
                db.executemany('DELETE FROM ft_category_archive WHERE id=?',[(i,) for i in set(ids+[ident])])
            db.commit()
            return {'mode':mode}

        if op=='add_group':
            kind=data.get('kind');name=_name(data.get('name'))
            if kind not in KINDS:raise HomeAssistantError('Ungültiger Kategorietyp')
            if db.execute('SELECT 1 FROM ft3_category_groups WHERE kind=? AND name=?',(kind,name)).fetchone():raise HomeAssistantError('Oberkategorie existiert bereits')
            db.execute('INSERT INTO ft3_category_groups VALUES(?,?,?)',(uuid4().hex,kind,name))
        elif op=='rename_group':
            gid=data.get('group_id');name=_name(data.get('name'))
            kind=data.get('kind')
            if kind not in KINDS:raise HomeAssistantError('Ungültiger Kategorietyp')
            g=db.execute('SELECT * FROM ft3_category_groups WHERE id=?',(gid,)).fetchone()
            if not g:raise HomeAssistantError('Oberkategorie nicht gefunden')
            if db.execute('SELECT 1 FROM ft3_category_groups WHERE kind=? AND name=? AND id<>?',(kind,name,gid)).fetchone():raise HomeAssistantError('Oberkategorie existiert bereits')
            if kind!=g['kind']:
                children=[r['category_id'] for r in db.execute('SELECT category_id FROM ft3_category_hierarchy WHERE group_id=?',(gid,))]
                if children:
                    placeholders=','.join('?' for _ in children)
                    # Never silently invalidate existing bookings or planning assignments.
                    for table,column in [('ft_transactions','category_id'),('ft_recurring','category_id'),('ft_budgets','category_id'),('ft3_plan_categories','category_id')]:
                        exists=db.execute('SELECT 1 FROM sqlite_master WHERE type="table" AND name=?',(table,)).fetchone()
                        if exists and db.execute(f'SELECT 1 FROM {table} WHERE {column} IN ({placeholders}) LIMIT 1',children).fetchone():
                            raise HomeAssistantError('Typwechsel nicht möglich: Unterkategorien werden bereits in Buchungen oder Planungen verwendet. Bitte zunächst die Zuordnungen prüfen.')
                    for cid in children:
                        db.execute('UPDATE ft_categories SET kind=? WHERE id=?',(kind,cid))
            for c in db.execute('SELECT category_id,sub_name FROM ft3_category_hierarchy WHERE group_id=?',(gid,)).fetchall():
                db.execute('UPDATE ft_categories SET name=? WHERE id=?',(name+' · '+c['sub_name'],c['category_id']))
            db.execute('UPDATE ft3_category_groups SET name=?,kind=? WHERE id=?',(name,kind,gid))
        elif op in ('add_sub','save_sub'):
            name=_name(data.get('name'));gid=data.get('group_id')
            g=db.execute('SELECT * FROM ft3_category_groups WHERE id=?',(gid,)).fetchone()
            if not g:raise HomeAssistantError('Bitte eine gültige Oberkategorie auswählen')
            if db.execute('SELECT 1 FROM ft_category_archive WHERE id=?',(gid,)).fetchone():raise HomeAssistantError('Oberkategorie ist archiviert')
            full=g['name']+' · '+name
            if op=='add_sub':
                if db.execute('SELECT 1 FROM ft_categories WHERE kind=? AND name=?',(g['kind'],full)).fetchone():raise HomeAssistantError('Unterkategorie existiert bereits')
                cid=uuid4().hex
                db.execute('INSERT INTO ft_categories(id,name,kind) VALUES(?,?,?)',(cid,full,g['kind']))
                db.execute('INSERT INTO ft3_category_hierarchy VALUES(?,?,?)',(cid,gid,name))
            else:
                cid=data.get('category_id')
                old=db.execute('''SELECT h.category_id,g.kind FROM ft3_category_hierarchy h
                     JOIN ft3_category_groups g ON g.id=h.group_id WHERE h.category_id=?''',(cid,)).fetchone()
                if not old:raise HomeAssistantError('Unterkategorie nicht gefunden')
                if old['kind']!=g['kind']:raise HomeAssistantError('Wechsel zwischen Ausgabe und Einnahme nicht erlaubt')
                if db.execute('SELECT 1 FROM ft_categories WHERE kind=? AND name=? AND id<>?',(g['kind'],full,cid)).fetchone():raise HomeAssistantError('Unterkategorie existiert bereits')
                db.execute('UPDATE ft_categories SET name=? WHERE id=?',(full,cid))
                db.execute('UPDATE ft3_category_hierarchy SET group_id=?,sub_name=? WHERE category_id=?',(gid,name,cid))
        else:raise HomeAssistantError('Unbekannte Kategorieaktion')
        db.commit()
    return action(hass,'list',{})
