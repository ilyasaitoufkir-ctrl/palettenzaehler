import { describe, expect, it } from 'vitest'
import { kameraFehlerText } from '../src/features/erfassung/BarcodeScanner'

describe('kameraFehlerText', () => {
  it('erklärt Berechtigung, fehlende Kamera und belegte Kamera verständlich', () => {
    expect(kameraFehlerText('NotAllowedError')).toMatch(/Kamerazugriff/)
    expect(kameraFehlerText('NotFoundError')).toMatch(/keine passende Kamera/)
    expect(kameraFehlerText('NotReadableError')).toMatch(/anderen App/)
    expect(kameraFehlerText('Irgendwas')).toBe('Die Kamera konnte nicht gestartet werden.')
  })
})
