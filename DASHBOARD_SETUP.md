# Dashboard-Einrichtung – Finance Tracker 4.3.0

1. Integration über HACS aktualisieren oder vollständig unter `custom_components/finance_tracker` installieren. HA neu starten. Bei Neuinstallation die Integration unter Einstellungen / Geräte & Dienste hinzufügen.
2. Einstellungen / Dashboards / Ressourcen (ggf. erweiterten Modus aktivieren): `/api/finance_tracker/ui/main.js?v=4_3_0` als JavaScript-Modul hinzufügen. Bestehenden Finance-Tracker-Ressourceneintrag aktualisieren, nicht duplizieren.
3. Neues leeres Dashboard „Finanzen“ mit URL `dashboard-finanzen` und Icon `mdi:cash-multiple` erstellen. Zugriff nach Bedarf konfigurieren.
4. Dashboard bearbeiten, Rohkonfigurationseditor öffnen und den Inhalt der mitgelieferten `dashboard.yaml` übernehmen. Bei abweichendem Dashboard-Pfad alle `dashboard_path`-Werte entsprechend ändern.
5. App bzw. Browser vollständig neu laden. Im Benutzerprofil bei Bedarf als Standard-Dashboard auswählen. Die erste Ansicht ist Monatsübersicht.

Bei bestehendem dev.4-Dashboard mit Standardpfad genügt die Ressourcenaktualisierung; die YAML bleibt unverändert. Das bisherige Sidebar-Panel bleibt verfügbar. Keine automatische Dashboard-Anlage und keine Datenbankmigration. Dashboard-Sichtbarkeit ersetzt keine Backend-Berechtigungen.
