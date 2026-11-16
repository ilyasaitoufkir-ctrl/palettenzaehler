import { describe, expect, it } from 'vitest'
import { laplaceVarianz, UNSCHARF_SCHWELLE } from '../src/lib/utils/bild'

function raster(b: number, h: number, f: (x: number, y: number) => number): Float32Array {
  const r = new Float32Array(b * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < b; x++) r[y * b + x] = f(x, y)
  return r
}

describe('laplaceVarianz', () => {
  it('ist bei einer einfarbigen Fläche null', () => {
    expect(laplaceVarianz(raster(20, 20, () => 128), 20, 20)).toBe(0)
  })

  it('ist bei scharfem Schachbrett deutlich größer als die Schwelle', () => {
    const v = laplaceVarianz(raster(40, 40, (x, y) => ((x >> 2) + (y >> 2)) % 2 ? 255 : 0), 40, 40)
    expect(v).toBeGreaterThan(UNSCHARF_SCHWELLE * 10)
  })

  it('ist bei weichem Verlauf kleiner als bei scharfer Kante', () => {
    const weich = laplaceVarianz(raster(40, 40, (x) => x * 2), 40, 40)
    const scharf = laplaceVarianz(raster(40, 40, (x) => (x < 20 ? 0 : 255)), 40, 40)
    expect(weich).toBeLessThan(scharf)
    expect(weich).toBeLessThan(UNSCHARF_SCHWELLE)
  })

  it('liefert 0 für zu kleine Bilder', () => {
    expect(laplaceVarianz([1, 2, 3, 4], 2, 2)).toBe(0)
  })
})
