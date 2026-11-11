# Palettenzähler

Mobile PWA für die Paletteninventur: Palette fotografieren, KI schlägt Artikel und Menge vor, Mensch bestätigt, Inventur als CSV exportieren. Mit Soll/Ist Abgleich, Barcode Erkennung (wo das Gerät sie unterstützt) und Offline Warteschlange.

**Grundprinzip:** Die KI unterstützt, der Mensch entscheidet. Die Gesamtmenge wird immer selbst berechnet (`Lagen × Stück pro Lage − fehlende Stück`), nie blind aus der KI übernommen.

## Schnellstart (Demo Modus, ohne Schlüssel)

```bash
npm install
npm run dev
```

Ohne Firebase Variablen startet die App automatisch im **Demo Modus**: Beispielartikel und eine Beispielinventur, Daten bleiben im Browser, die KI Erkennung ist **simuliert** (das Foto wird nicht ausgewertet, das steht auch in der App). Erzwingen lässt sich der Demo Modus mit `VITE_DEMO_MODE=true`.

## Stack

React 18, TypeScript, Vite 6, Tailwind CSS 4, Firebase (Auth, Firestore mit Offline Cache, Storage), Vercel Function `/api/analyze` mit Claude Vision, Zod Validierung, IndexedDB Warteschlange, eigener Service Worker, Vitest. Schrift Inter lokal eingebunden (kein Google Fonts, DSGVO).

## Struktur

```
src/
  app/            Router, Layout, globaler Zustand (AppContext)
  components/     UI Bausteine (Badges, Zahlfeld, Sheet, Dialoge)
  features/
    auth/         Login, Passwort zurücksetzen, Freischaltung
    dashboard/    Übersicht und Kennzahlen
    inventur/     Inventuren, Inventurliste, Soll/Ist
    artikel/      Artikelstamm, CSV Import, Referenzfotos
    erfassung/    Kamera, Bestätigung, manuelle Erfassung, recognizePallet()
    offline/      IndexedDB Warteschlange und Verarbeitung
  lib/
    data/         DataRepo Schnittstelle, Firebase und Demo Umsetzung
    firebase/     Firebase Initialisierung
    utils/        Mengenberechnung, CSV, Bildverarbeitung
api/
  analyze.ts      POST /api/analyze (Token Prüfung, Claude Vision)
  _lib/           Validierung, Prompt, testbarer Handler
sw/               Vorlage für den Service Worker (wird beim Build erzeugt)
tests/            Vitest Tests
```

Die Erkennung liegt hinter `RecognizePallet = (bilder, artikel) => Promise<ErkennungsErgebnis>` in `src/features/erfassung/erkennung.ts`. Ein anderes Modell, reiner Barcode Scan oder eine Power Platform Anbindung lässt sich dort ergänzen.

## Produktiv einrichten

### 1. Firebase

1. Projekt in der [Firebase Konsole](https://console.firebase.google.com) anlegen, Web App hinzufügen, Konfiguration notieren.
2. **Authentication** → Anmeldemethode **E-Mail/Passwort** aktivieren.
3. **Firestore** anlegen (Region z. B. `europe-west3` Frankfurt).
4. **Storage** aktivieren (gleiche Region).
5. Regeln deployen: `npx firebase-tools login` und `npx firebase-tools deploy --only firestore:rules,storage --project <projekt-id>` (oder Inhalt von `firestore.rules` und `storage.rules` in der Konsole einfügen).
6. **Nutzer freischalten:** Unter Authentication Nutzer anlegen. Dann in Firestore ein Dokument `users/<UID>` anlegen, z. B. `{ "email": "name@firma.de", "rolle": "team" }`. Ohne dieses Dokument gibt es keinen Datenzugriff, auch nicht mit gültigem Login.
7. **Dienstkonto:** Projekteinstellungen → Dienstkonten → Neuen privaten Schlüssel generieren. Der JSON Inhalt wird `FIREBASE_SERVICE_ACCOUNT_JSON`.

### 2. Vercel

Repository in Vercel importieren (Framework wird als Vite erkannt) und unter Settings → Environment Variables eintragen:

| Variable | Wo | Geheim |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` | Firebase Web App Konfiguration | nein (öffentlich) |
| `ANTHROPIC_API_KEY` | Anthropic Konsole | **ja** |
| `ANTHROPIC_MODEL` | z. B. `claude-sonnet-5-5` | nein |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Dienstkonto JSON, eine Zeile | **ja** |

Danach neu deployen. Die Vercel Domain zusätzlich in Firebase Authentication unter **Autorisierte Domains** eintragen.

### 3. Auf dem Handy installieren

- **Android (Chrome):** Seite öffnen → Menü → **App installieren** bzw. **Zum Startbildschirm hinzufügen**.
- **iPhone (Safari):** Seite öffnen → Teilen → **Zum Home Bildschirm**.

## Sicherheit

- `ANTHROPIC_API_KEY` und das Dienstkonto existieren nur serverseitig. `npm run check:bundle` durchsucht `dist/` nach Schlüsseln.
- `/api/analyze` prüft das Firebase ID Token und die Freischaltung (`users/{uid}`), max. 3 Bilder, Magic Byte Prüfung, Größenlimit 4,4 MB (Vercel erlaubt max. 4,5 MB Request Body).
- KI Antworten werden mit Zod streng geprüft, bei ungültigem JSON einmal neu angefragt. Artikelnummern, die nicht im Stamm sind, werden verworfen.
- Firestore und Storage Rules: nur freigeschaltete Konten, keine öffentlichen Schreibzugriffe, Positionen nur in aktiven Inventuren, nur JPEG bis 3 MB.
- CSV Export schützt vor Formel Injection in Excel.

## Offline

Fotos ohne Netz landen in IndexedDB (Status "Wartet auf Verbindung") und werden bei Wiederverbindung automatisch analysiert. Bestätigte Positionen werden unter der ID des Warteschlangeneintrags gespeichert, wiederholtes Speichern erzeugt keine Dubletten. Firestore hält Schreibvorgänge offline im lokalen Cache. Fotos werden nach erfolgreichem Upload vom Gerät gelöscht. Für die erste Anmeldung braucht es Internet.

## Befehle

```bash
npm run dev           # Entwicklung
npm run test          # Unit Tests
npm run typecheck     # TypeScript
npm run build         # Produktionsbuild nach dist/
npm run check         # alles zusammen inkl. Bundle Prüfung
```

## Grenzen

- Bilderkennung zählt nur Sichtbares. Verdeckte Gebinde im Palettenkern kann keine Kamera sehen, daher bestätigt immer ein Mensch.
- Barcode Erkennung nutzt die BarcodeDetector API des Browsers (z. B. Chrome auf Android). Safari auf dem iPhone unterstützt sie derzeit nicht, dann wird der Schritt übersprungen.
- Kein Import des Sollbestands aus dem ERP: Sollwerte kommen aus dem Artikelstamm (Feld oder CSV Import).
