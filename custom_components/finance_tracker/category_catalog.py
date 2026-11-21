"""Finance Tracker 3.0: neutral category seed and source mapping.

The built-in catalog intentionally contains no household- or person-specific
names. Existing source mappings stored in the database remain authoritative so
upgrades keep historical category assignments without shipping private labels
in the integration source code.
"""

import sqlite3
from pathlib import Path
from uuid import uuid4

from .finance_planning import read_planning


SPEC = [
    ("Wohnen & Haushalt", "Haus & Nebenkosten", "expense", ["Grundsteuer", "Müllgebühren", "Wasser", "Schornsteinfeger"]),
    ("Wohnen & Haushalt", "Haus & Einrichtung", "expense", ["Möbel & Einrichtung", "Pflanzen & Dekoration"]),
    ("Wohnen & Haushalt", "Hausinvestitionen", "expense", ["Hausinvestitionen"]),
    ("Energie", "Strom", "expense", ["Strom"]),
    ("Energie", "Heizung", "expense", ["Heizung", "Gas", "Holz"]),
    ("Lebensmittel & Alltag", "Lebensmittel", "expense", []),
    ("Lebensmittel & Alltag", "Drogerie & Haushalt", "expense", []),
    ("Lebensmittel & Alltag", "Alltag sonstiges", "expense", []),
    ("Mobilität", "Kraftstoff", "expense", ["Tanken", "Kraftstoff"]),
    ("Mobilität", "Fahrzeugunterhalt", "expense", ["KFZ TÜV + ASU", "KFZ Steuer", "Reifen und Reparatur"]),
    ("Versicherungen & Vorsorge", "Versicherungen", "expense", ["KFZ Versicherung", "Unfallversicherung", "Reisekostenversicherung", "Zahnversicherung", "Privathaftpflicht", "Hausratversicherung", "Gebäudeversicherung", "Risikolebensversicherung", "Rechtsschutzversicherung", "Pflegeversicherung"]),
    ("Versicherungen & Vorsorge", "Berufsunfähigkeit", "expense", ["Berufsunfähigkeit"]),
    ("Versicherungen & Vorsorge", "Altersvorsorge", "expense", ["RiesterRente", "Lebensversicherung (vermögensbildend)"]),
    ("Kinder & Bildung", "Schule & Bildung", "expense", ["Schulgebühren", "Schulbus Tickets", "Schulequipment", "Klassenfahrt"]),
    ("Kinder & Bildung", "Kinder & Taschengeld", "expense", ["Taschengeld", "Kinderkosten"]),
    ("Kommunikation & Medien", "Mobilfunk", "expense", ["Mobilfunk", "Handy"]),
    ("Kommunikation & Medien", "Internet & Abos", "expense", ["Internet und Telefon", "Abonnements"]),
    ("Kommunikation & Medien", "Rundfunk", "expense", ["Rundfunkbeitrag"]),
    ("Gesundheit & Sport", "Gesundheit", "expense", ["Arztkosten", "Sport", "Apotheke"]),
    ("Konsum & Freizeit", "Geschenke & Spenden", "expense", ["Geschenke", "Spenden"]),
    ("Konsum & Freizeit", "Kleidung", "expense", ["Kleidung"]),
    ("Konsum & Freizeit", "Urlaub & Freizeit", "expense", ["Urlaub", "Freizeit"]),
    ("Technik & Investitionen", "Technik & Geräte", "expense", ["Werkzeug", "Geräte", "Software"]),
    ("Einnahmen", "Gehalt", "income", ["Gehalt", "Lohn"]),
    ("Einnahmen", "Sonderzahlungen", "income", ["Sondereinnahmen Arbeitgeber", "Urlaubs-/Weihnachtsgeld"]),
    ("Einnahmen", "Familienleistungen", "income", ["Kindergeld", "Kindkrankengeld"]),
    ("Einnahmen", "Erstattungen", "income", ["Erstattungen", "Netzentgeltreduzierung", "Steuerausgleich"]),
    ("Einnahmen", "Kapital & Energie", "income", ["Vergütung Einspeisung", "sonstige Erträge Bank"]),
    ("Einnahmen", "Sonstige Einnahmen", "income", ["Sondereinnahmen sonst."]),
    ("Sparen & Vermögen", "Spartransfers", "saving_transfer", ["Sparen"]),
]


def initialize(hass):
    path = Path(hass.config.path("finance/household_v2.db"))
    with sqlite3.connect(path) as db:
        db.execute("PRAGMA busy_timeout=5000")
        db.execute(
            """CREATE TABLE IF NOT EXISTS ft3_category_mapping (
            source_name TEXT NOT NULL, source_kind TEXT NOT NULL,
            category_id TEXT NOT NULL, PRIMARY KEY(source_name,source_kind),
            FOREIGN KEY(category_id) REFERENCES ft_categories(id))"""
        )
        for group, sub, kind, names in SPEC:
            if kind == "saving_transfer":
                continue  # transfer is never a spending category
            # Preserve renamed category IDs by following any existing source mapping.
            mapped = None
            for name in names:
                row = db.execute(
                    "SELECT category_id FROM ft3_category_mapping WHERE source_name=? AND source_kind=?",
                    (name, kind),
                ).fetchone()
                if row:
                    mapped = row
                    break
            if mapped:
                ident = mapped[0]
            else:
                title = f"{group} · {sub}"
                row = db.execute(
                    "SELECT id FROM ft_categories WHERE name=? AND kind=?", (title, kind)
                ).fetchone()
                if row:
                    ident = row[0]
                else:
                    ident = uuid4().hex
                    db.execute(
                        "INSERT INTO ft_categories(id,name,kind) VALUES(?,?,?)",
                        (ident, title, kind),
                    )
            for name in names:
                db.execute(
                    "INSERT OR IGNORE INTO ft3_category_mapping(source_name,source_kind,category_id) VALUES(?,?,?)",
                    (name, kind, ident),
                )


def summary(hass, month):
    # Existing mappings in the database are authoritative. This keeps historical
    # assignments working after anonymization without embedding old source labels.
    d = read_planning(hass.config.path("finance/household_v2.db"), month)
    with sqlite3.connect(hass.config.path("finance/household_v2.db")) as db:
        rows = db.execute(
            """SELECT m.source_name,m.source_kind,c.name
               FROM ft3_category_mapping m
               JOIN ft_categories c ON c.id=m.category_id"""
        ).fetchall()
        lookup = {}
        for source_name, source_kind, category_name in rows:
            if " · " in category_name:
                group, sub = category_name.split(" · ", 1)
            else:
                group, sub = "Weitere Kategorien", category_name
            lookup[(source_name, source_kind)] = (group, sub)

        out = {}
        unmapped = []
        for row in d["rows"]:
            kind = row["kind"]
            if kind not in ("expense", "income"):
                continue
            label = lookup.get((row["name"], kind))
            if not label:
                unmapped.append(
                    {
                        "name": row["name"],
                        "kind": kind,
                        "source_cell": row.get("source_cell"),
                    }
                )
                continue
            key = (kind,) + label
            value = out.setdefault(
                key,
                {
                    "kind": kind,
                    "group": label[0],
                    "subcategory": label[1],
                    "amount_cents": 0,
                    "count": 0,
                },
            )
            value["amount_cents"] += row.get("amount_cents") or 0
            value["count"] += 1
        return {
            "month": d["month"],
            "categories": sorted(
                out.values(), key=lambda x: (x["kind"], x["group"], x["subcategory"])
            ),
            "unmapped": unmapped,
            "note": "Nur zugeordnete Planungspositionen; keine echten Kontobuchungen addiert.",
        }
