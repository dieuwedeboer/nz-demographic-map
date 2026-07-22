import { describe, expect, it } from 'vitest'
import {
  europeanFillColor,
  europeanMaoriCombinedFillColor,
  legendTickValues,
  metricsMinMax,
  monochromeFillColor,
  niceScaleDomain,
  normalizeToScale,
  overlayAccentColor,
  overlayFillColor,
  overlayScaleDomain,
} from './overlayColour'

describe('overlayFillColor', () => {
  it('uses the European multi-stop palette for european overlays', () => {
    // Midpoint of absolute 0–100 domain
    expect(overlayFillColor(50, 'european', 0, 100)).toBe(europeanFillColor(50))
  })

  it('uses European-style scale with forest green high end for combined group', () => {
    expect(overlayAccentColor('european-maori')).toBe('#166534')
    // Same low half as European (brown → cream)
    expect(europeanMaoriCombinedFillColor(0)).toBe(europeanFillColor(0))
    expect(europeanMaoriCombinedFillColor(25)).toBe(europeanFillColor(25))
    expect(europeanMaoriCombinedFillColor(50)).toBe(europeanFillColor(50))
    // High half is green, not blue
    expect(europeanMaoriCombinedFillColor(100)).toBe('rgb(22, 101, 52)')
    expect(europeanMaoriCombinedFillColor(75)).not.toBe(europeanFillColor(75))
    expect(overlayFillColor(100, 'european-maori', 0, 100)).toBe(
      europeanMaoriCombinedFillColor(100),
    )
  })

  it('maps other groups to catalogue accent colours', () => {
    expect(overlayAccentColor('maori')).toBe('#ef4444')
    expect(overlayAccentColor('asian')).toBe('#10b981')
    expect(overlayAccentColor('pacific')).toBe('#f59e0b')
    expect(overlayAccentColor('melaa')).toBe('#6b7280')
    expect(overlayAccentColor('chinese')).toBe('#10b981')
  })

  it('uses white-to-accent monochrome for monochrome groups', () => {
    expect(overlayFillColor(0, 'maori', 0, 100)).toBe('rgb(255, 255, 255)')
    expect(overlayFillColor(100, 'maori', 0, 100)).toBe(monochromeFillColor(100, '#ef4444'))
    expect(overlayFillColor(undefined, 'maori')).toBe('#888')
  })

  it('stretches monochrome colour from 0 to a smart max', () => {
    // 10% on a 0–20 scale is half strength
    expect(overlayFillColor(10, 'maori', 0, 20)).toBe(monochromeFillColor(50, '#ef4444'))
    expect(overlayFillColor(20, 'maori', 0, 20)).toBe(monochromeFillColor(100, '#ef4444'))
  })
})

describe('europeanFillColor', () => {
  it('returns rgb for known stops and grey for missing', () => {
    expect(europeanFillColor(80)).toMatch(/^rgb\(/)
    expect(europeanFillColor(undefined)).toBe('#888')
    expect(europeanFillColor(50)).toBe('rgb(246, 232, 170)')
    expect(europeanFillColor(25)).toBe('rgb(216, 179, 101)')
    expect(europeanFillColor(75)).toBe('rgb(116, 173, 209)')
  })
})

describe('smart legend scale', () => {
  it('finds min and max percentages in metrics', () => {
    expect(metricsMinMax({ a: 3.2, b: 12.1, c: 8 })).toEqual({ min: 3.2, max: 12.1 })
    expect(metricsMinMax({})).toEqual({ min: 0, max: 100 })
  })

  it('rounds max to a whole number covering the data, always from 0', () => {
    expect(niceScaleDomain(12.1)).toEqual({ min: 0, max: 13 })
    expect(niceScaleDomain(18.2)).toEqual({ min: 0, max: 19 })
    expect(niceScaleDomain(0)).toEqual({ min: 0, max: 100 })
  })

  it('fixes NZ European groups at 0–100 and stretches the rest', () => {
    const metrics = { a: 40.2, b: 78.8, c: 55 }
    expect(overlayScaleDomain('european', metrics)).toEqual({ min: 0, max: 100 })
    expect(overlayScaleDomain('european-incl-eur-maori', metrics)).toEqual({ min: 0, max: 100 })
    expect(overlayScaleDomain('european-maori', metrics)).toEqual({ min: 0, max: 100 })
    expect(overlayScaleDomain('maori', { a: 3.2, b: 12.1 })).toEqual({ min: 0, max: 13 })
    expect(overlayScaleDomain('chinese', { a: 2.1, b: 8.4 })).toEqual({ min: 0, max: 9 })
  })

  it('normalizes values into the scale domain', () => {
    expect(normalizeToScale(10, 0, 20)).toBe(50)
    expect(normalizeToScale(0, 0, 20)).toBe(0)
    expect(normalizeToScale(20, 0, 20)).toBe(100)
  })

  it('builds evenly spaced legend ticks from 0 to max', () => {
    expect(legendTickValues(0, 20)).toEqual([0, 5, 10, 15, 20])
    expect(legendTickValues(0, 100)).toEqual([0, 25, 50, 75, 100])
  })
})
