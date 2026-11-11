import { afterEach, describe, expect, it, vi } from 'vitest'

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70]).toString('base64')
const ki = {
  artikel_match: null, beschreibung: 'Kanister', gebindeart: 'Kanister', etikett_text: null,
  stueck_pro_lage: 10, lagen: 2, fehlende_stueck: 0, gesamt_geschaetzt: 20, konfidenz: 'mittel', hinweise: '',
}
const req = (token: string) =>
  new Request('http://x/api/analyze', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ bilder: [{ mediaType: 'image/jpeg', daten: jpeg }] }),
  })

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('Zugangscode Modus', () => {
  it('akzeptiert richtigen Code und ruft die Anthropic API serverseitig auf', async () => {
    vi.stubEnv('APP_ZUGANGSCODE', 'lager-2026-geheim')
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(ki) }] })))
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('../api/analyze')
    const r = await POST(req('code:lager-2026-geheim'))
    expect(r.status).toBe(200)
    const aufruf = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(aufruf[0]).toBe('https://api.anthropic.com/v1/messages')
    expect((aufruf[1].headers as Record<string, string>)['x-api-key']).toBe('test-key')
  })
  it('lehnt falschen Code ab, ohne die KI aufzurufen', async () => {
    vi.stubEnv('APP_ZUGANGSCODE', 'lager-2026-geheim')
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { POST } = await import('../api/analyze')
    expect((await POST(req('code:falsch'))).status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it('meldet fehlende Konfiguration verständlich', async () => {
    vi.stubEnv('APP_ZUGANGSCODE', '')
    const { POST } = await import('../api/analyze')
    const r = await POST(req('code:irgendwas'))
    expect(r.status).toBe(500)
    expect(((await r.json()) as { fehler: string }).fehler).toMatch(/APP_ZUGANGSCODE/)
  })
})
