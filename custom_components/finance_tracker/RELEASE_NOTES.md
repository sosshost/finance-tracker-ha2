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
