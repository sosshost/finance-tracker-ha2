# Dashboard-Einrichtung – Finance Tracker 4.3.1

1. Integration vollständig installieren und HA neu starten. Bei Neuinstallation Integration unter Einstellungen / Geräte & Dienste hinzufügen.
2. Als HA-Administrator einmal das bisherige Sidebar-Panel „Finance“ oder das native Dashboard öffnen. Im Storage-Modus werden die JavaScript-Ressource und, falls der Standardpfad frei ist, das Dashboard „Finanzen“ mit vier Ansichten automatisch eingerichtet.
3. App/Browser neu laden. Das neue Dashboard ist zunächst nur für Administratoren sichtbar; gewünschte Sichtbarkeit über HA-Dashboard-Einstellungen konfigurieren. Persönliches Standard-Dashboard im Benutzerprofil auswählen.

Bestehende Dashboards werden nicht überschrieben; eine einzelne vorhandene Finance-Tracker-Ressource wird aktualisiert. Doppelte Ressourcen werden nicht automatisch gelöscht. Bei YAML-Ressourcenmodus oder einem Fehler bleibt das Sidebar-Panel nutzbar. Falls nach einem Fehler ein leeres Dashboard entstanden ist, dessen Inhalt manuell aus dashboard.yaml übernehmen. Erneuter Versuch durch vollständiges Neuladen und Öffnen des Sidebar-Panels. Kein Eingriff in Finanzdaten oder Datenbank.

## Manueller Fallback

1. Integration über HACS aktualisieren oder vollständig unter `custom_components/finance_tracker` installieren. HA neu starten. Bei Neuinstallation die Integration unter Einstellungen / Geräte & Dienste hinzufügen.
2. Einstellungen / Dashboards / Ressourcen (ggf. erweiterten Modus aktivieren): `/api/finance_tracker/ui/main.js?v=4_3_1` als JavaScript-Modul hinzufügen. Bestehenden Finance-Tracker-Ressourceneintrag aktualisieren, nicht duplizieren.
3. Neues leeres Dashboard „Finanzen“ mit URL `dashboard-finanzen` und Icon `mdi:cash-multiple` erstellen. Zugriff nach Bedarf konfigurieren.
4. Dashboard bearbeiten, Rohkonfigurationseditor öffnen und den Inhalt der mitgelieferten `dashboard.yaml` übernehmen. Bei abweichendem Dashboard-Pfad alle `dashboard_path`-Werte entsprechend ändern.
5. App bzw. Browser vollständig neu laden. Im Benutzerprofil bei Bedarf als Standard-Dashboard auswählen. Die erste Ansicht ist Monatsübersicht.

Bei bestehendem Finance-Dashboard mit Standardpfad genügt die Ressourcenaktualisierung; die YAML bleibt unverändert. Das bisherige Sidebar-Panel bleibt verfügbar. Keine Datenbankmigration. Dashboard-Sichtbarkeit ersetzt keine Backend-Berechtigungen.

Als Administrator kann die Einrichtung zusätzlich über ? → Dashboard einrichten erneut ausgelöst werden. Bestehende Dashboards werden nicht überschrieben.
