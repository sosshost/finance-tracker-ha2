"""Finance Tracker 3.0: idempotent category seed and read-only source mapping."""
import sqlite3
from pathlib import Path
from uuid import uuid4
from .ledger import now
from .finance_planning import read_planning

SPEC = [('Wohnen & Haushalt', 'Haus & Nebenkosten', 'expense', ['Grundsteuer', 'Müllgebühren', 'Wasser', 'Essenkehrer']), ('Wohnen & Haushalt', 'Haus & Einrichtung', 'expense', ['Möbel & Pflanzen & Deko']), ('Wohnen & Haushalt', 'Hausinvestitionen', 'expense', ['Hausinvestitionen']), ('Energie', 'Strom', 'expense', ['Strom']), ('Energie', 'Heizung', 'expense', ['Gas + Holz']), ('Lebensmittel & Alltag', 'Lebensmittel', 'expense', []), ('Lebensmittel & Alltag', 'Drogerie & Haushalt', 'expense', []), ('Lebensmittel & Alltag', 'Alltag sonstiges', 'expense', []), ('Mobilität', 'Kraftstoff', 'expense', ['Tanken A', 'Tanken S']), ('Mobilität', 'Fahrzeugunterhalt', 'expense', ['KFZ TÜV + ASU', 'KFZ Steuer', 'KFZ/QUAD/RAD Reifen und Reparatur']), ('Versicherungen & Vorsorge', 'Versicherungen', 'expense', ['KFZ Versicherung S', 'Unfallversicherung S', 'Reisekostenversicherung S', 'Zahnversicherung A', 'Zahnversicherung S', 'Privathaftpflicht S', 'Hausratversicherung S', 'Gebäudeversicherung S', 'Risikolebensvers. A', 'Risikolebensvers. S', 'Rechtsschutzvers. S', 'Pflegeversicherung M+E']), ('Versicherungen & Vorsorge', 'Berufsunfähigkeit', 'expense', ['Berufsunfähigkeit A', 'Berufsunfähigkeit S']), ('Versicherungen & Vorsorge', 'Altersvorsorge', 'expense', ['RiesterRente A', 'RiesterRente S', 'Lebensversicherung (vermögensbildend) A']), ('Kinder & Bildung', 'Schule & Bildung', 'expense', ['Schulgebühren (ohne Essen!)', 'Schulbus Tickets', 'Schulequipment/ Sportschule/ Gitarre/ Camp/Klassenfahrt']), ('Kinder & Bildung', 'Kinder & Taschengeld', 'expense', ['Taschengeld', 'Maximus/Edison']), ('Kommunikation & Medien', 'Mobilfunk', 'expense', ['Handy Andrea', 'Handy Sally', 'Handy Maximus']), ('Kommunikation & Medien', 'Internet & Abos', 'expense', ['Internet und Telefon', 'Abonnements']), ('Kommunikation & Medien', 'Rundfunk', 'expense', ['GEZ']), ('Gesundheit & Sport', 'Gesundheit', 'expense', ['Arztkosten/Sport/Apotheke']), ('Konsum & Freizeit', 'Geschenke & Spenden', 'expense', ['Geschenke allgemein', 'Fördervereine und Spenden']), ('Konsum & Freizeit', 'Kleidung', 'expense', ['Klamotten']), ('Konsum & Freizeit', 'Urlaub & Freizeit', 'expense', ['Urlaub/sonstiges', 'Lotto']), ('Technik & Investitionen', 'Technik & Geräte', 'expense', ['Werkzeug/Geräte/Software']), ('Einnahmen', 'Gehalt', 'income', ['Lohn Andrea', 'Lohn Sally']), ('Einnahmen', 'Sonderzahlungen', 'income', ['IHK Andrea', 'Sondereinnahmen AG Andrea', 'Sondereinnahmen AG Sally', 'Urlaubs-/Weihnachtsgeld A', 'Urlaubs-/Weihnachtsgeld S']), ('Einnahmen', 'Familienleistungen', 'income', ['Kindergeld', 'Kindkrankengeld']), ('Einnahmen', 'Erstattungen', 'income', ['Elli Mobility (Wallbox Erstattungen)', 'Netzentgeltreduzierung', 'Steuerausgleich A+S']), ('Einnahmen', 'Kapital & Energie', 'income', ['Vergütung Einspeisung', 'sonstige Erträge Bank']), ('Einnahmen', 'Sonstige Einnahmen', 'income', ['Sondereinnahmen sonst.', 'SODEXO Sally', 'Lotto']), ('Sparen & Vermögen', 'Spartransfers', 'saving_transfer', ['Sparen Maximus', 'Sparen Edison'])]

def initialize(hass):
    path=Path(hass.config.path('finance/household_v2.db'))
    with sqlite3.connect(path) as db:
        db.execute('PRAGMA busy_timeout=5000')
        db.execute("""CREATE TABLE IF NOT EXISTS ft3_category_mapping (
            source_name TEXT NOT NULL, source_kind TEXT NOT NULL,
            category_id TEXT NOT NULL, PRIMARY KEY(source_name,source_kind),
            FOREIGN KEY(category_id) REFERENCES ft_categories(id))""")
        for group,sub,kind,names in SPEC:
            if kind=='saving_transfer':
                continue # transfer is never a spending category
            # Preserve renamed category IDs by following the original source mapping.
            mapped=next((db.execute('SELECT category_id FROM ft3_category_mapping WHERE source_name=? AND source_kind=?',(n,kind)).fetchone() for n in names if db.execute('SELECT category_id FROM ft3_category_mapping WHERE source_name=? AND source_kind=?',(n,kind)).fetchone()),None)
            if mapped:
                continue
            title=f'{group} · {sub}'
            row=db.execute('SELECT id FROM ft_categories WHERE name=? AND kind=?',(title,kind)).fetchone()
            if row: ident=row[0]
            else:
                ident=uuid4().hex
                db.execute('INSERT INTO ft_categories(id,name,kind) VALUES(?,?,?)',(ident,title,kind))
            for name in names:
                db.execute('INSERT OR IGNORE INTO ft3_category_mapping(source_name,source_kind,category_id) VALUES(?,?,?)',(name,kind,ident))

def summary(hass,month):
    # Read historical planning via existing, unmodified WS logic: this function uses
    # the same SQLite import tables, never creates transactions.
    d=read_planning(hass.config.path('finance/household_v2.db'),month)
    with sqlite3.connect(hass.config.path('finance/household_v2.db')) as db:
        lookup={(name,kind):(group,sub) for group,sub,kind,names in SPEC for name in names}
        out={}
        unmapped=[]
        for row in d['rows']:
            kind=row['kind']
            if kind not in ('expense','income'): continue
            label=lookup.get((row['name'],kind))
            if not label:
                unmapped.append({'name':row['name'],'kind':kind,'source_cell':row.get('source_cell')})
                continue
            key=(kind,)+label
            v=out.setdefault(key,{'kind':kind,'group':label[0],'subcategory':label[1],'amount_cents':0,'count':0})
            v['amount_cents']+=row.get('amount_cents') or 0
            v['count']+=1
        return {'month':d['month'],'categories':sorted(out.values(),key=lambda x:(x['kind'],x['group'],x['subcategory'])), 'unmapped':unmapped,
                'note':'Nur Excel-Einzelpositionen. Keine Sammelzeilen, Spartransfers oder echten Kontobuchungen addiert.'}
