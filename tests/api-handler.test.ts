import { describe, expect, it, vi } from 'vitest'
import { HttpFehler, createAnalyseHandler } from '../api/_lib/handler'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70]).toString('base64')
const antwortOk = JSON.stringify({
  artikel_match: 'D-1',
  beschreibung: 'Kanister',
  gebindeart: 'Kanister 5 l',
  etikett_text: null,
  stueck_pro_lage: 40,
  lagen: 3,
  fehlende_stueck: 0,
  gesamt_geschaetzt: 120,
  konfidenz: 'hoch',
  hinweise: '',
})

function anfrage(body: unknown, token: string | null = 'gueltig') {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  return new Request('http://localhost/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: text,
  })
}
const body = { bilder: [{ mediaType: 'image/jpeg', daten: jpeg }], artikel: [{ nr: 'D-1', bez: 'Orangenöl' }] }

function handler(antworten: string[] = [antwortOk]) {
  const modell = vi.fn(async () => antworten.shift() ?? '')
  const token = vi.fn(async (t: string) => {
    if (t === 'gesperrt') throw new HttpFehler(403, 'Dieses Konto ist noch nicht freigeschaltet.')
    if (t !== 'gueltig') throw new Error('ungültig')
    return 'uid-1'
  })
  return { POST: createAnalyseHandler({ tokenPruefen: token, modellAufrufen: modell }), modell, token }
}

describe('/api/analyze', () => {
  it('lehnt Aufrufe ohne Token ab', async () => {
    const { POST, modell } = handler()
    const r = await POST(anfrage(body, null))
    expect(r.status).toBe(401)
    expect(modell).not.toHaveBeenCalled()
  })
  it('lehnt ungültige Tokens ab', async () => {
    const { POST } = handler()
    expect((await POST(anfrage(body, 'falsch'))).status).toBe(401)
  })
  it('lehnt nicht freigeschaltete Konten ab', async () => {
    const { POST } = handler()
    expect((await POST(anfrage(body, 'gesperrt'))).status).toBe(403)
  })
  it('liefert validiertes Ergebnis', async () => {
    const { POST, modell } = handler()
    const r = await POST(anfrage(body))
    expect(r.status).toBe(200)
    const j = (await r.json()) as { ergebnis: { gesamt_geschaetzt: number } }
    expect(j.ergebnis.gesamt_geschaetzt).toBe(120)
    expect(modell).toHaveBeenCalledTimes(1)
  })
  it('fragt bei ungültigem JSON genau einmal erneut', async () => {
    const { POST, modell } = handler(['kein json', antwortOk])
    const r = await POST(anfrage(body))
    expect(r.status).toBe(200)
    expect(modell).toHaveBeenCalledTimes(2)
  })
  it('meldet verständlichen Fehler nach zweitem ungültigen Ergebnis', async () => {
    const { POST, modell } = handler(['kaputt', 'wieder kaputt'])
    const r = await POST(anfrage(body))
    expect(r.status).toBe(502)
    expect(((await r.json()) as { fehler: string }).fehler).toMatch(/manuell/)
    expect(modell).toHaveBeenCalledTimes(2)
  })
  it('lehnt mehr als drei Bilder ab', async () => {
    const { POST } = handler()
    const b = { mediaType: 'image/jpeg', daten: jpeg }
    expect((await POST(anfrage({ bilder: [b, b, b, b] }))).status).toBe(400)
  })
  it('lehnt Dateien ab, die keine Bilder sind', async () => {
    const { POST } = handler()
    const fake = Buffer.from('<script>alert(1)</script>').toString('base64')
    expect((await POST(anfrage({ bilder: [{ mediaType: 'image/jpeg', daten: fake }] }))).status).toBe(415)
  })
  it('lehnt zu große Anfragen ab', async () => {
    const { POST } = handler()
    const gross = 'A'.repeat(4_500_000)
    expect((await POST(anfrage({ bilder: [{ mediaType: 'image/jpeg', daten: gross }] }))).status).toBe(413)
  })
  it('lehnt kaputten Body ab', async () => {
    const { POST } = handler()
    expect((await POST(anfrage('{nicht json'))).status).toBe(400)
  })
  it('reicht Serverfehler der KI verständlich durch', async () => {
    const POST = createAnalyseHandler({
      tokenPruefen: async () => 'uid',
      modellAufrufen: async () => {
        throw new HttpFehler(503, 'Die KI ist gerade ausgelastet.')
      },
    })
    expect((await POST(anfrage(body))).status).toBe(503)
  })
})
