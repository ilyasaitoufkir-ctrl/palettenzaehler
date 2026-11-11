import {
  AnalyseAnfrageSchema,
  MAX_BILD_BYTES,
  MAX_REQUEST_BYTES,
  SYSTEM_PROMPT,
  base64Bytes,
  bildSignaturPasst,
  kiAntwortValidieren,
  nutzerText,
  type AnalyseAnfrage,
} from './analyse.js'

export interface ModellNachricht {
  role: 'user' | 'assistant'
  content: unknown
}

export interface HandlerAbhaengigkeiten {
  /** prüft das Firebase ID Token und ob der Nutzer freigeschaltet ist; liefert die UID oder wirft */
  tokenPruefen(token: string): Promise<string>
  /** ruft das Modell auf und liefert den Antworttext */
  modellAufrufen(system: string, nachrichten: ModellNachricht[]): Promise<string>
}

export class HttpFehler extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })

export function createAnalyseHandler(deps: HandlerAbhaengigkeiten) {
  return async function POST(request: Request): Promise<Response> {
    try {
      // 1. Authentifizierung
      const auth = request.headers.get('authorization') ?? ''
      const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
      if (!token) return json(401, { fehler: 'Nicht angemeldet.' })
      try {
        await deps.tokenPruefen(token)
      } catch (e) {
        if (e instanceof HttpFehler) return json(e.status, { fehler: e.message })
        return json(401, { fehler: 'Anmeldung abgelaufen. Bitte neu anmelden.' })
      }

      // 2. Größe begrenzen
      const laenge = Number(request.headers.get('content-length') ?? '0')
      if (laenge > MAX_REQUEST_BYTES) return json(413, { fehler: 'Anfrage zu groß. Bitte weniger oder kleinere Fotos senden.' })
      const text = await request.text()
      if (text.length > MAX_REQUEST_BYTES) return json(413, { fehler: 'Anfrage zu groß. Bitte weniger oder kleinere Fotos senden.' })

      // 3. Eingabe validieren
      let roh: unknown
      try {
        roh = JSON.parse(text)
      } catch {
        return json(400, { fehler: 'Ungültige Anfrage.' })
      }
      const p = AnalyseAnfrageSchema.safeParse(roh)
      if (!p.success) return json(400, { fehler: p.error.issues[0]?.message ?? 'Ungültige Anfrage.' })
      const anfrage: AnalyseAnfrage = p.data

      for (const b of anfrage.bilder) {
        if (base64Bytes(b.daten) > MAX_BILD_BYTES) return json(413, { fehler: 'Ein Foto ist zu groß.' })
        const kopf = Buffer.from(b.daten.slice(0, 24), 'base64')
        if (!bildSignaturPasst(b.mediaType, kopf)) return json(415, { fehler: 'Eine Datei ist kein gültiges Bild.' })
      }

      // 4. KI Aufruf mit einmaliger Wiederholung bei ungültiger Antwort
      const inhalt = [
        ...anfrage.bilder.map((b) => ({
          type: 'image',
          source: { type: 'base64', media_type: b.mediaType, data: b.daten },
        })),
        { type: 'text', text: nutzerText(anfrage.artikel) },
      ]
      const nachrichten: ModellNachricht[] = [{ role: 'user', content: inhalt }]
      const stamm = anfrage.artikel.map((a) => a.nr)

      let antwort = await deps.modellAufrufen(SYSTEM_PROMPT, nachrichten)
      let v = kiAntwortValidieren(antwort, stamm)
      if (!v.ok) {
        nachrichten.push({ role: 'assistant', content: antwort.slice(0, 4000) || '(leer)' })
        nachrichten.push({
          role: 'user',
          content: `Deine Antwort war ungültig (${v.fehler}). Antworte jetzt ausschließlich mit einem gültigen JSON Objekt nach dem Schema, ohne weiteren Text.`,
        })
        antwort = await deps.modellAufrufen(SYSTEM_PROMPT, nachrichten)
        v = kiAntwortValidieren(antwort, stamm)
      }
      if (!v.ok) {
        console.error('KI Antwort ungültig:', v.fehler, '| Antwort:', antwort.slice(0, 500))
        return json(502, {
          fehler: 'Die KI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen oder manuell erfassen.',
          grund: (v.fehler + (antwort.trim() ? ` | Antwort begann mit: ${antwort.trim().slice(0, 80)}` : ' | leere Antwort')).slice(0, 260),
        })
      }
      return json(200, { ergebnis: v.ergebnis })
    } catch (e) {
      if (e instanceof HttpFehler) return json(e.status, { fehler: e.message })
      console.error('analyze fehlgeschlagen', e instanceof Error ? e.message : e)
      return json(500, { fehler: 'Die Analyse ist fehlgeschlagen. Bitte erneut versuchen oder manuell erfassen.' })
    }
  }
}
