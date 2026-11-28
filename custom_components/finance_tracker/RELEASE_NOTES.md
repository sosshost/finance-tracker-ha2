# Finance Tracker v4.3.1

## Added
- Automatische Dashboard- und Ressourcenanlage beim ersten Administrator-Aufruf im Storage-Modus.
- Aktion „Dashboard einrichten“ im Hilfe-Dialog.

## Fixed
- Versionsabgleich der Ressource, Wiederholungslogik und Fehlerdiagnostik.

## Changed
- Historische separate Entwicklungs-Changelogs entfernt.

## Migration / Compatibility
- Keine Datenbankmigration; bestehende Dashboards werden nicht überschrieben. HA-Neustart und Frontend-Neuladen erforderlich.

## Known limitations
- Installation des Entwicklungsstands auf der Haupt-HA bestätigt; automatische Neuanlage auf unabhängiger HA noch nicht live bestätigt.
- Administrator-Aufruf erforderlich; YAML-Modus und teilweise angelegte Dashboards benötigen ggf. manuellen Fallback.

## 4.3.1-dev.4 (Entwicklungsstand)

- Changed: Installationsarchiv bereinigt; 21 separate historische Entwicklungs-Changelogs entfernt.
- Compatibility: keine Änderung an Fachlogik, Schnittstellen oder Datenbankschema; zentrale Historie und Dashboard-Fallback erhalten.
- Known limitations: Live-Validierung der automatischen Dashboard-Neuanlage weiterhin offen.

## 4.3.1-dev.3 (Entwicklungsstand)

- Added: Administrator-Aktion „Dashboard einrichten“ im Hilfe-Dialog.
- Fixed: gemeinsame Einrichtungssperre pro Frontend-Version und Abgleich mit ausgelieferter Manifest-Version.
- Compatibility: bestehende Dashboards unverändert; keine Datenmigration.
- Known limitations: Storage-Modus erforderlich; bei teilweise angelegtem Dashboard manuelle Prüfung; Live-Neuanlage noch offen.

## 4.3.1-dev.2 (Entwicklungsstand)

Ausgangsbasis: 4.3.1-dev.1.

### Fixed
- Dashboard-Einrichtung auch im nativen Dashboard-Modus; keine Pflicht für hass.panels.
- Bis zu drei Versuche mit Wartezeit, Freigabe der Ausführungssperre nach Fehlern und Browserdiagnostik.
- Bestehende Dashboards werden weiterhin nicht überschrieben; keine Datenmigration.
### Known limitations
- Admin-Aufruf erforderlich; bei teilweise angelegtem Dashboard manueller Fallback. Live-Test ausstehend.

## 4.3.1-dev.1 (Entwicklungsstand)

### Added
- Administrative Dashboard-Ersteinrichtung beim Öffnen des bisherigen Finance-Panels über native Lovelace-WebSocket-Befehle.
- Automatische Ressourcenanlage bzw. Aktualisierung einer vorhandenen Finance-Tracker-Ressource.
### Compatibility
- Bestehende Dashboards bleiben unangetastet; neue Dashboards zunächst nur für Administratoren sichtbar.
- YAML-Ressourcenmodus und Fehler: manueller Fallback; keine direkten Storage-Dateizugriffe.
- Keine Datenbankmigration. Persönliches Standard-Dashboard bleibt Benutzerentscheidung.
### Known limitations
- Erster Aufruf als Administrator erforderlich; keine Anlage allein durch HACS-Download.
- Gleichzeitige Einrichtung in unterschiedlichen Browsern nicht vollständig atomar; bei Fehler nach Dashboard-Anlage manuelle YAML-Übernahme erforderlich.

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
