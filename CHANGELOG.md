# Finance Tracker v4.3.0

Ausgangsbasis: 4.3.0-dev.4 (vom Anwender live freigegeben). Vorheriges offizielles Release: 4.2.2.

## Added
- Native HA-Dashboard-Integration mit vier Panel-Ansichten: Monatsübersicht, Finanzplanung, Stammdaten und Abschluss. Als persönliches Standard-Dashboard auswählbar.
- Custom Card `custom:finance-tracker-card`, Dashboard-Vorlage und Installationsanleitung.
- HA-Ereignis `finance_tracker_direct_debit` (Schema 1) für erfolgreiche und blockierte automatische Lastschriftbuchungen; Versand nach Datenbank-Commit, unveränderte Fehler werden nicht erneut gemeldet.
- Stammdaten / Benachrichtigungen: globale Freigaben für beide Ereignistypen, standardmäßig aktiv. Änderung nur durch Administratoren; Empfängersteuerung über externe HA-Automationen.

## Changed
- Native Navigation ersetzt den eigenen Main-Header im Dashboard-Modus; Hilfe im Inhaltsheader. Gemeinsamer Frontend-Core je Benutzer und Dashboard, interne Absprünge synchronisieren den URL-Pfad.
- Standardpfad `dashboard-finanzen`; bisheriges Sidebar-Panel bleibt verfügbar.
- Manifest, Komponentenkennungen und Cache-Referenzen auf 4.3.0 harmonisiert.

## Fixed
- Dashboard-Header: korrekte Grid-Zuordnung für Titel, Hilfe und Monatssteuerung nach Ausblenden des Sidebar-Buttons; verhindert buchstabenweisen Titelumbruch.

## Migration
- Keine zusätzliche SQLite-Migration gegenüber 4.2.2. Die Datei `finance/notification_settings.json` wird bei erster Änderung automatisch angelegt. Bestehende Daten bleiben erhalten; Backup vor Update empfohlen.

## Compatibility
- HA-Neustart und Frontend-Neuladen erforderlich. Dashboard optional; keine automatische Änderung der HA-Konfiguration.
- Dashboard-Ressource bei bestehenden Entwicklungsinstallationen auf `/api/finance_tracker/ui/main.js?v=4_3_0` ändern. Details in DASHBOARD_SETUP.md.
- Keine fest hinterlegten Empfänger; externe Automationen sind separat einzurichten.

## Known limitations
- Native HA-Header und Overlays unterliegen dem HA-Frontend. Ungespeicherte Editoren werden beim Hauptansichtswechsel wie bisher verworfen.
- Ereignisversand ohne dauerhafte Outbox: Prozessabbruch nach Commit kann ein Ereignis verlieren. Bei unlesbaren Benachrichtigungseinstellungen wird der Versand unterdrückt. Weitere Ereignistypen sind nicht implementiert.

## Validation
- Entwicklungsstand dev.4 durch Anwender live freigegeben. Release-Aufbereitung ausschließlich Versionierung und Dokumentation; finaler Release-Build noch nicht live getestet.

---

## 4.3.0-dev.4 – Dashboard-Header Hotfix

- Fixed: explizite Grid-Zuordnung für Titel, Hilfe und Monatssteuerung nach Ausblenden des Sidebar-Buttons; nur Dashboard-Modus.
- Changed: Standardpfad dashboard-finanzen und Cache-Version.
- Migration: keine; Backend unverändert. Browser-/Live-Prüfung ausstehend.

## 4.3.0-dev.3 – Native Dashboard-Ansichten (Entwicklung)

- Added: `custom:finance-tracker-card` und Dashboard-Vorlage `dashboard.yaml` mit vier nativen Panel-Views.
- Changed: Dashboard-Modus blendet den eigenen Main-Header und die redundanten Sidebar-Buttons aus; Hilfe im jeweiligen Inhaltsheader. Gemeinsamer Frontend-Core pro Benutzer und Dashboard; interne Absprünge synchronisieren die native URL.
- Compatibility: bisheriges Sidebar-Panel bleibt erhalten; Backend, WebSocket-Verträge, Push und Datenbank unverändert. Keine Migration.
- Installation: Integration ersetzen, HA neu starten, Lovelace-Ressource `/api/finance_tracker/ui/main.js?v=4_3_0_dev3` als JavaScript-Modul registrieren. Dashboard mit URL-Pfad `finanzen` erstellen und `dashboard.yaml` im Rohkonfigurationseditor einfügen. Als Standard-Dashboard im Benutzerprofil auswählen. Keine automatische Änderung der HA-Konfiguration.
- Known limitations: native HA-Header und Overlay-Verhalten, View-Lifecycle, interne Absprünge und mobile Darstellung müssen live getestet werden. Wie im bisherigen Panel werden ungespeicherte Editoren beim Hauptansichtswechsel verworfen. Keine Veröffentlichung vor Live-Freigabe.

## 4.3.0-dev.2 – Benachrichtigungseinstellungen

- Added: Stammdaten / Benachrichtigungen, zwei persistente globale Ereignisfreigaben, WebSocket `finance_tracker/notifications`.
- Changed: Lastschrift-Ereignisse werden vor Versand anhand der Freigaben gefiltert; beide standardmäßig aktiv.
- Compatibility: Nur Administratoren dürfen Einstellungen ändern; Empfängersteuerung bleibt extern. Keine Änderung der Buchungslogik oder SQLite-Struktur.
- Migration: JSON-Datei `finance/notification_settings.json` wird bei erster Änderung atomar angelegt.
- Known limitations: Weitere Ereignistypen noch nicht implementiert; bei unlesbaren Einstellungen wird Versand unterdrückt. Live-UI und reale Lastschrift noch zu prüfen.

## 4.3.0-dev.1 (development, not released)

- Added: `finance_tracker_direct_debit` HA event, schema_version 1, status posted/blocked, month, position_id, name, kind, amount_cents (absolute), booked; transaction_id for success, reason for blocked.
- Changed: emit only after SQLite commit; identical persisted failure reasons are not emitted again until resolved or changed. Both scheduled and manual automatic runs use the same path. One event per plan position, including transfers.
- Compatibility: no schema migration, no changes to websocket response or posting eligibility. No hardcoded recipients. Event data is available on the local HA event bus; configure access and notification recipients appropriately.
- Known limitations: best-effort event delivery, no durable outbox; process interruption after commit may lose an event. No live validation yet. Notification settings and batch summaries are deferred.
- Frontend: versioned element names and module cache keys updated; no layout changes.

# Finance Tracker 4.2.2

Basis: 4.2.1-dev.6 (live bestätigt); vorherige offizielle Version 4.2.0.

## Added
- Kategorieentwicklung: getrennte Einnahmen- und Ausgabendiagramme, 36 Monate in drei Kalenderjahren, maximal 12 ausgewählte Monate, horizontales 6×2-Raster, Jahreszahl im Januar, Kategorienfilter im 3-Spalten-Raster.
- Visuelles Anwenderhandbuch mit fünf Kapiteln, Workflows, Symbolen und Beispielen; responsive Navigation.

## Changed
- Drei standardmäßig geschlossene Kacheln: Kategorieentwicklung, Monatsbilanz, Monatsvergleich.
- Dynamische Achsenteilung in Vielfachen von 100 EUR; linksbündige Farbpunkte und zentrierte Beschriftungen.
- Redundante Jahresanzeige und Navigationspfeile oberhalb des Monatsrasters entfernt; Wischen und jahresbezogene Sammelauswahl bleiben erhalten.

## Fixed
- Lokale Diagrammaktualisierung bei Kategorie- und Monatsauswahl statt vollständigem Panel-Neuaufbau.

## Migration / Compatibility
- Keine zusätzliche Datenbankmigration; additive lesende Zeitreihenabfrage. HA-Neustart und Frontend-Neuladen erforderlich.

## Known limitations
- Historische Kategorien werden nach aktueller Hierarchie gruppiert. Abgeschlossene Monate zeigen Ist, sonst Plan. Fehlende Monate bleiben Lücken.
- Letzte Entfernung der redundanten Jahresanzeige noch nicht live bestätigt.

---

# 4.2.1-dev.2
Basis: bestätigtes Archiv 4.2.1-dev.1.
Changed: nahezu bildschirmfüllendes Anwenderhandbuch, fünf exklusive Kapitel, Hauptnavigation 2×2, ein scrollbarer Inhaltsbereich, Querformat-Seitennavigation, Tastaturbedienung und Fokusführung.
Added: visuelle Workflows, Beispielsalden, Plan-Ist-Balken, SVG-Kategorietrend, Monatsraster, Archivierungsentscheidung und Symbolreferenz. Alle Beispiele fiktiv.
Migration: keine; keine Änderung an Backend-Fachlogik, Daten oder Schnittstellen.
Compatibility: HA-Neustart und Frontend-Neuladen wegen Komponentenkennung.
Known limitations: Browser-/Mobil- und Live-Test ausstehend.

---

# 4.2.1-dev.1
Basis: vollständiges Referenzarchiv 4.2.0.
Added: Jahresbezogene Oberkategorien-Zeitreihe, getrennte Einnahmen/Ausgaben, 6×2 Monatswahl, Legendenfilter.
Changed: Beide vorhandenen Entwicklungskacheln klappbar, neue Kachel zuerst und geöffnet. Aktualisierung setzt Kachelzustand zurück. Auswahl bleibt innerhalb des Jahres erhalten.
Data: Abschlusswerte für vollständig abgeschlossene historische Monate, sonst Plan einschließlich Überlagerungen, Ausschlüssen und Vorlagen. Umbuchungen ausgeschlossen. Fehlende Monate bleiben Lücken. Historische Kategorien werden nicht nach Archivstatus gefiltert; aktuelle Hierarchie maßgeblich.
Migration: keine, ausschließlich lesender Zugriff; WebSocket-Antwort additiv erweitert.
Compatibility: HA-Neustart und Frontend-Neuladen erforderlich; Komponenten- und Cache-Kennungen harmonisiert.
Known limitations: Browser-/Mobil- und Live-Test ausstehend; historische Hierarchieänderungen werden nicht rückwirkend versioniert.

---

# Finance Tracker 4.2.0

## Added / Changed
- Kategorien: referenzsicheres Löschen, Archivierung und Reaktivierung.
- Einheitliche Buchungseditoren und Plan-Ist-Zuordnung; Aktionsbuttons in Prüfbefunden und Historie.
- Kontostände, Historienfilter und überarbeitete Monatsabschlussansichten.
- Kategorienlayout: feste rechtsbündige Aktionsspalten, 32 px Symbolbuttons, umbrechende Namen.

## Version harmonization
- Basis: bereitgestelltes vollständiges Archiv 4.1.5 mit DEV10 und Kategorienlayout-Fix. Manifest, Komponentenkennungen und Cache-Referenzen auf 4.2.0 harmonisiert; keine zusätzliche funktionelle Änderung.

## Migration
Die Archivtabelle wird automatisch angelegt. Backup vor Aktualisierung empfohlen.

## Validation
Statische Python- und JavaScript-Prüfung; kein vollständiger Live-Regressionstest der finalen Version.

---

# Finance Tracker 4.1.4

## Added
- Aufklappbare Lastschriftdiagnose unter Buchungen & Konten → Änderungen.
- Kontogruppierung nach Inhaber, Bank und Konto mit getrennten Summen für Einnahmen, Ausgaben und Umbuchungen.

## Changed
- Neue Monatsentwürfe ausschließlich aus aktuellen Monatsvorlagen; individuelle Ergänzungen bleiben möglich.
- Versionsanzeige aus dem Manifest.

## Fixed
- Konto- und Kategoriezuordnungen von Vorlagenpositionen beim erneuten Laden.
- Konsistente Übernahme von Lastschriftmerkmalen in Monatsentwürfe.
- Anzeige beider Umbuchungsseiten und Bearbeitung nicht zugeordneter Buchungen.
- Reduzierte Schema-Schreibzugriffe bei Leseoperationen.

## Migration
Keine manuelle Datenbankmigration. Bestehende Pläne und Buchungen bleiben erhalten.

## Compatibility
Home Assistant 2026.11; Neustart und Frontend-Neuladen erforderlich. Alle Module gemeinsam aktualisieren.

## Known limitations
Historische Lastschriftkonflikte werden nicht automatisch bereinigt. Bestehende Monatspläne werden nicht rückwirkend aus Vorlagen aktualisiert.

# 4.2.1-dev.3
Basis: 4.2.1-dev.2 (bestätigt).
- Kategorieentwicklung: drei Kalenderjahre, maximal zwölf ausgewählte Monate, horizontales 6×2-Raster mit Jahresmarkierung und Pfeilen. Jahresbezogene Sammelauswahl respektiert das globale Limit.
- Kategorienfilter: drei Spalten, 42 px bisherige Mindesthöhe, zweizeilige Beschriftung.
- Kategorieentwicklung, Monatsbilanz, Monatsvergleich: standardmäßig geschlossen; Hilfe aktualisiert.
- Backend: ausschließlich lesende Erweiterung des Zeitfensters; keine Migration. Bestehende Plan-/Abschlusslogik unverändert.
- Versionierung: Manifest, const und fünf Panelmodule harmonisiert.

## 4.2.1-dev.4

Fixed: Category filters update only the affected chart, retaining button focus, card state and month selector position. Empty charts retain the same SVG dimensions. No backend or database changes. Live validation pending.

## 4.2.1-dev.5

Basis: 4.2.1-dev.4. Kategorieentwicklung: dynamische Y-Achse mit Teilungen in Vielfachen von 100 EUR, mindestens 100 EUR Obergrenze; negative Werte bleiben sichtbar. Kategoriebuttons: feste linke Farbpunktspalte, zentrierter Text, unveränderte 42 px Höhe. Scrollstabilisierung unverändert. Manifest und Panelkennungen harmonisiert. Keine Backend-Fachlogik oder Migration. Live-Test ausstehend.

## 4.2.1-dev.6

- Fixed: month selection and bulk actions update only plots, checkbox states and selection labels; no full panel render.
- Changed: removed redundant year navigation arrows; horizontal scrolling and year label remain.
- Migration: none. Backend unchanged. Live scroll verification pending.
