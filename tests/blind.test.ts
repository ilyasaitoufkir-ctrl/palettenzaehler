import { describe, expect, it } from 'vitest'
import { sollSichtbar } from '../src/lib/utils/pruefung'

describe('sollSichtbar', () => {
  it('blendet das Soll nur bei aktiver Blind-Zählung aus', () => {
    expect(sollSichtbar({ blind: true, status: 'aktiv' })).toBe(false)
    expect(sollSichtbar({ blind: true, status: 'abgeschlossen' })).toBe(true)
    expect(sollSichtbar({ blind: false, status: 'aktiv' })).toBe(true)
    expect(sollSichtbar(undefined)).toBe(true)
  })
})
