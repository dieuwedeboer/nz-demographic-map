import { describe, expect, it } from 'vitest'
import {
  ALL_OVERLAYS,
  childrenOfOverlay,
  DEFAULT_OVERLAY_ID,
  getOverlayMetric,
  getOverlayMetricData,
  includesEurMaori,
  metricIdFromSelection,
  overlayMetricsForPrepare,
  pieDetailHighlightForOverlay,
  selectionFromMetricId,
  sumMetricKeys,
  supportsIncludeEurMaori,
  TOP_LEVEL_OVERLAYS,
  topLevelIdFor,
} from './overlay'
import type { RegionEntry } from './types'

const sample: RegionEntry = {
  ethnicityData: {
    '2023': {
      'Total - age': {
        'European only': 40,
        'Māori only': 20,
        'European/Māori': 10,
        'Asian only': 15,
        'Pacific Peoples only': 5,
        'Total stated - ethnicity': 100,
        Chinese: 8,
        Indian: 4,
      },
    },
  },
}

describe('overlay catalogue', () => {
  it('includes the requested top-level groups in display order', () => {
    expect(TOP_LEVEL_OVERLAYS.map((m) => m.id)).toEqual([
      'european',
      'maori',
      'european-maori',
      'asian',
      'pacific',
      'melaa',
    ])
  })

  it('does not offer European level-3 detail options', () => {
    expect(childrenOfOverlay('european')).toEqual([])
  })

  it('offers MELAA level-3 detail options without residual other', () => {
    expect(childrenOfOverlay('melaa').map((m) => m.id)).toEqual([
      'middle-eastern',
      'latin-american',
      'african',
    ])
  })

  it('excludes residual other groups from Asian and Pacific detail', () => {
    const asianIds = childrenOfOverlay('asian').map((m) => m.id)
    const pacificIds = childrenOfOverlay('pacific').map((m) => m.id)
    expect(asianIds).not.toContain('other-asian')
    expect(asianIds).not.toContain('other-southeast-asian')
    expect(pacificIds).not.toContain('other-pacific')
  })

  it('uses full labels for top-level groups in the catalogue', () => {
    expect(getOverlayMetric('european').label).toBe('NZ European only')
    expect(getOverlayMetric('european-maori').label).toBe('NZ European & Maori combined')
    expect(getOverlayMetric('maori').label).toBe('NZ Maori only')
    expect(getOverlayMetric('melaa').label).toBe('MELAA only')
  })

  it('resolves default and children', () => {
    expect(getOverlayMetric(undefined).id).toBe(DEFAULT_OVERLAY_ID)
    expect(childrenOfOverlay('asian').some((m) => m.id === 'chinese')).toBe(true)
    expect(topLevelIdFor('chinese')).toBe('asian')
    expect(topLevelIdFor('maori')).toBe('maori')
    expect(topLevelIdFor('european-incl-eur-maori')).toBe('european')
    expect(topLevelIdFor('maori-incl-eur-maori')).toBe('maori')
  })

  it('has unique ids', () => {
    const ids = ALL_OVERLAYS.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('declares palette and scale on every metric', () => {
    for (const metric of ALL_OVERLAYS) {
      expect(metric.palette).toMatch(/^(european-diverging|euro-maori-diverging|monochrome)$/)
      expect(metric.scale).toMatch(/^(fixed-0-100|data-max)$/)
      expect(metric.accent).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })

  it('exports prepare-compatible id/source/keys list', () => {
    const prepared = overlayMetricsForPrepare()
    expect(prepared).toHaveLength(ALL_OVERLAYS.length)
    expect(prepared[0]).toEqual({
      id: ALL_OVERLAYS[0].id,
      source: ALL_OVERLAYS[0].source,
      keys: ALL_OVERLAYS[0].keys,
    })
  })
})

describe('OverlaySelection encode/decode', () => {
  it('supports include only on European and Maori group views', () => {
    expect(supportsIncludeEurMaori('european')).toBe(true)
    expect(supportsIncludeEurMaori('maori')).toBe(true)
    expect(supportsIncludeEurMaori('chinese')).toBe(false)
    expect(supportsIncludeEurMaori('european-maori')).toBe(false)
    expect(supportsIncludeEurMaori('asian')).toBe(false)
  })

  it('maps selection to metric ids', () => {
    expect(
      metricIdFromSelection({ groupId: 'european', detailId: null, includeEurMaori: true }),
    ).toBe('european-incl-eur-maori')
    expect(metricIdFromSelection({ groupId: 'maori', detailId: null, includeEurMaori: true })).toBe(
      'maori-incl-eur-maori',
    )
    expect(
      metricIdFromSelection({ groupId: 'european', detailId: null, includeEurMaori: false }),
    ).toBe('european')
    expect(
      metricIdFromSelection({ groupId: 'asian', detailId: 'chinese', includeEurMaori: true }),
    ).toBe('chinese')
    expect(includesEurMaori('european-incl-eur-maori')).toBe(true)
  })

  it('preserves include preference when decoding non-euro/maori metrics', () => {
    const previous = { groupId: 'european', detailId: null, includeEurMaori: true }
    expect(selectionFromMetricId('chinese', previous)).toEqual({
      groupId: 'asian',
      detailId: 'chinese',
      includeEurMaori: true,
    })
    expect(selectionFromMetricId('asian', previous)).toEqual({
      groupId: 'asian',
      detailId: null,
      includeEurMaori: true,
    })
  })

  it('decodes include variants from metric id', () => {
    expect(selectionFromMetricId('european-incl-eur-maori')).toEqual({
      groupId: 'european',
      detailId: null,
      includeEurMaori: true,
    })
    expect(selectionFromMetricId('maori')).toEqual({
      groupId: 'maori',
      detailId: null,
      includeEurMaori: false,
    })
  })
})

describe('getOverlayMetricData', () => {
  it('computes top-level shares from single-response keys', () => {
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'european')?.percentage).toBe(40)
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'maori')?.percentage).toBe(20)
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'european-maori')?.percentage).toBe(
      70,
    )
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'asian')?.percentage).toBe(15)
  })

  it('adds European/Maori dual responses when include variants are selected', () => {
    expect(
      getOverlayMetricData(sample, '2023', 'Total - age', 'european-incl-eur-maori')?.percentage,
    ).toBe(50)
    expect(
      getOverlayMetricData(sample, '2023', 'Total - age', 'maori-incl-eur-maori')?.percentage,
    ).toBe(30)
  })

  it('computes level-3 shares', () => {
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'chinese')?.percentage).toBe(8)
    expect(getOverlayMetricData(sample, '2023', 'Total - age', 'indian')?.count).toBe(4)
  })

  it('returns null below sample cutoff', () => {
    const small: RegionEntry = {
      ethnicityData: {
        '2023': {
          'Total - age': {
            'European only': 10,
            'Total stated - ethnicity': 40,
          },
        },
      },
    }
    expect(getOverlayMetricData(small, '2023', 'Total - age', 'european')).toBeNull()
  })
})

describe('sumMetricKeys', () => {
  it('sums listed keys', () => {
    expect(sumMetricKeys({ a: 1, b: 2, c: 3 }, ['a', 'c'])).toBe(4)
  })
})

describe('pieDetailHighlightForOverlay', () => {
  it('returns level-3 detail for Asian/Pacific/MELAA map colour selections', () => {
    const level3 = { Chinese: 120, Indian: 80, Samoan: 40 }
    expect(pieDetailHighlightForOverlay('chinese', level3)).toEqual({
      parentCategory: 'Asian',
      subLabel: 'Chinese',
      subValue: 120,
    })
    expect(pieDetailHighlightForOverlay('samoan', level3)).toEqual({
      parentCategory: 'Pacific Islander',
      subLabel: 'Samoan',
      subValue: 40,
    })
  })

  it('returns null for top-level groups or missing data', () => {
    expect(pieDetailHighlightForOverlay('asian', { Chinese: 10 })).toBeNull()
    expect(pieDetailHighlightForOverlay('chinese', undefined)).toBeNull()
    expect(pieDetailHighlightForOverlay('chinese', { Chinese: 0 })).toBeNull()
  })
})
