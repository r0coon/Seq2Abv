# Boom – Ticket-Bot

Discord-Bot für ein modulares Ticket-System. Nutzer öffnen über ein Panel (Dropdown) Tickets in verschiedenen Kategorien (z. B. Support, Bewerbung, Highteam). Bewerbungen können mit Modals und Unterkategorien (z. B. Helper, Developer) laufen. Tickets lassen sich schließen, archivieren, verschieben; es gibt Cooldown, Blacklist, Transcript-Export und optional KI-Zusammenfassung (Ollama).

---

## Befehle (Slash)

| Befehl | Beschreibung |
|--------|--------------|
| `/close` | Aktuelles Ticket schließen (ggf. mit Grund-Modal) |
| `/add @User` | User zum Ticket hinzufügen |
| `/remove @User` | User aus dem Ticket entfernen |
| `/transcript` | Chat als HTML-Transcript per DM exportieren |
| `/archive` | Ticket archivieren (Kanal bleibt, wird nur gesperrt) |
| `/history @User` | Ticket-Verlauf eines Users anzeigen |
| `/summary` | KI-Kurzzusammenfassung des Tickets (Ollama) |
| `/move <Kategorie>` | Ticket in andere Kategorie verschieben |
| `/blacklist add/remove` | User von der Ticket-Erstellung sperren/entsperren (Dauer z. B. `1d`, `7d`, `permanent`) |

Konfiguration über `config/ticket/` (JSON); Datenbank: PostgreSQL (`database/`).

Lg chatgpt