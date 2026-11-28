# Finance Tracker HA2.0

Lokale Home-Assistant-Integration zur Haushaltsfinanzplanung, Buchungserfassung, Kontenverwaltung und zum Monatsabschluss.

## Installation

Über HACS als benutzerdefiniertes Integrationsrepository `https://github.com/sosshost/finance-tracker-ha2` hinzufügen oder den vollständigen Ordner `finance_tracker` nach `custom_components/` kopieren. Home Assistant neu starten und die Integration unter Einstellungen / Geräte & Dienste hinzufügen. Bei Updates bestehende Finanzdaten sichern und die Integration nicht entfernen.

## Dashboard (ab 4.3.0)

Optional kann der Finance Tracker als natives HA-Dashboard mit vier Ansichten und persönlicher Startansicht verwendet werden. Siehe [Dashboard-Einrichtung](DASHBOARD_SETUP.md) und [Dashboard-Vorlage](dashboard.yaml). Das bisherige Sidebar-Panel bleibt verfügbar.

## Benachrichtigungen

Das lokale HA-Ereignis `finance_tracker_direct_debit` meldet erfolgreiche (`posted`) und blockierte (`blocked`) automatische Lastschriften. Die globalen Ereignisfreigaben befinden sich unter Stammdaten / Benachrichtigungen. Empfänger und Push-Aktionen werden separat in HA-Automationen definiert. Ereignisse können Finanzinformationen enthalten; Zugriff und Empfänger entsprechend beschränken.

## Änderungen

Siehe [Changelog](CHANGELOG.md) und [Release Notes](RELEASE_NOTES.md).
