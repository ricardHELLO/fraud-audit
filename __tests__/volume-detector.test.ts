import { describe, it, expect } from 'vitest'
import { detectVolume } from '@/lib/volume-detector'
import { UPLOAD_MAX_BYTES, UPLOAD_MAX_MB, UPLOAD_MAX_ROWS } from '@/lib/constants/upload'

describe('detectVolume — empty and degenerate inputs', () => {
  it('empty string throws (so /api/upload can return 400 con mensaje claro)', () => {
    // Un string vacío no es un CSV válido; el endpoint convierte este throw
    // en un 400 "No se pudo analizar la estructura del archivo". El contrato
    // debe preservarse: si alguien cambia esto a un retorno silencioso,
    // uploads corruptos pasarían validación.
    expect(() => detectVolume('', 'lastapp')).toThrow(/CSV parsing failed/i)
  })

  it('header-only CSV returns zero rows', () => {
    const csv = 'fecha,local,importe\n'
    const result = detectVolume(csv, 'lastapp')
    expect(result.totalRows).toBe(0)
    expect(result.creditsRequired).toBe(1)
  })

  it('rows without date/location columns fall back to defaults, not NaN', () => {
    const csv = 'colA,colB\na,1\nb,2\nc,3\n'
    const result = detectVolume(csv, 'lastapp')
    expect(result.totalRows).toBe(3)
    expect(result.locations).toEqual([])
    expect(result.dateFrom).toBe('')
    expect(result.dateTo).toBe('')
    // monthsCovered fallback = 1 → ceil(1/3)=1 block, locations<1 → 1 block
    expect(result.creditsRequired).toBe(1)
  })

  it('single-row CSV counts as 1 month covered', () => {
    const csv = 'fecha,local\n2026-01-15,Local A\n'
    const result = detectVolume(csv, 'lastapp')
    expect(result.totalRows).toBe(1)
    expect(result.monthsCovered).toBe(1)
    expect(result.locations).toEqual(['Local A'])
  })

  it('credits formula: 6 months × 10 locations → 2 × 2 = 4 credits', () => {
    const rows: string[] = ['fecha,local']
    for (let month = 1; month <= 6; month++) {
      for (let loc = 1; loc <= 10; loc++) {
        const mm = String(month).padStart(2, '0')
        rows.push(`2026-${mm}-01,Local ${loc}`)
      }
    }
    const result = detectVolume(rows.join('\n'), 'lastapp')
    expect(result.monthsCovered).toBe(6)
    expect(result.locations).toHaveLength(10)
    // ceil(6/3)=2 * ceil(10/5)=2 → 4 credits
    expect(result.creditsRequired).toBe(4)
  })

  it('dedups duplicated locations and trims whitespace', () => {
    const csv = 'fecha,local\n2026-01-01,  Local A  \n2026-01-02,Local A\n2026-01-03,Local B\n'
    const result = detectVolume(csv, 'lastapp')
    expect(result.locations).toEqual(['Local A', 'Local B'])
  })
})

describe('UPLOAD_MAX_BYTES — SEC-03 / PERF-01 guard', () => {
  it('is exactly 50 MB in bytes', () => {
    expect(UPLOAD_MAX_BYTES).toBe(50 * 1024 * 1024)
    expect(UPLOAD_MAX_BYTES).toBe(52_428_800)
  })

  it('human-readable MB value matches the byte constant', () => {
    expect(UPLOAD_MAX_MB).toBe(50)
  })
})

describe('UPLOAD_MAX_ROWS — PERF-02 guard', () => {
  it('is exactly 500 000 rows', () => {
    // Freezing the value in a test so bumping it requires updating both
    // the constant and this assertion — forces a conscious choice. The
    // /api/upload route rejects with 413 above this cap.
    expect(UPLOAD_MAX_ROWS).toBe(500_000)
  })

  it('is well below the theoretical OOM limit of the Vercel worker', () => {
    // Vercel Node workers have ~1024 MB RAM. At ~600 bytes/row in the
    // PapaParse row-object representation, ~1.7M rows is the OOM ceiling.
    // We want a firm margin — at least 3× headroom.
    expect(UPLOAD_MAX_ROWS).toBeLessThan(1_700_000 / 3)
  })
})
