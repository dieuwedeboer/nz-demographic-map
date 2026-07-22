import type { EthnicityCounts, EuropeanMetric, RegionEntry } from './types'
import { LEVEL3_KEY_MAP } from './types'

export type OverlaySource = 'single' | 'level3'

/** Choropleth overlay metric (top-level group or level-3 sub-ethnicity). */
export interface OverlayMetric {
  id: string
  label: string
  /** Short label for compact UI (defaults to label). */
  shortLabel?: string
  legendTitle: string
  source: OverlaySource
  /** Census ethnicity keys to sum from the age slice. */
  keys: string[]
  /** Top-level group this drills into; null for top-level metrics. */
  parentId: string | null
  /**
   * UI group id when this metric is a variant of a top-level group
   * (e.g. european-incl-eur-maori → european).
   */
  baseGroupId?: string
  /** True when European/Māori dual responses are included with European or Maori only. */
  includesEurMaori?: boolean
}

const MINIMUM_STATED_ETHNICITY_COUNT = 50

const EUROPEAN_ONLY = 'European only'
const MAORI_ONLY = 'Māori only'
const EUROPEAN_MAORI = 'European/Māori'

function topLevel(id: string, label: string, keys: string[], shortLabel?: string): OverlayMetric {
  return {
    id,
    label,
    shortLabel,
    legendTitle: `${label} ethnicity share (%)`,
    source: 'single',
    keys,
    parentId: null,
  }
}

function level3Child(
  id: string,
  label: string,
  parentId: string,
  censusKey: string,
): OverlayMetric {
  return {
    id,
    label,
    legendTitle: `${label} ethnicity share (%)`,
    source: 'level3',
    keys: [censusKey],
    parentId,
  }
}

/** Top-level choropleth groupings shown in the Group dropdown. */
export const TOP_LEVEL_OVERLAYS: OverlayMetric[] = [
  topLevel('european', 'NZ European only', [EUROPEAN_ONLY]),
  topLevel('maori', 'NZ Maori only', [MAORI_ONLY]),
  // European only + Maori only + European/Māori dual responses
  topLevel('european-maori', 'NZ European & Maori combined', [
    EUROPEAN_ONLY,
    MAORI_ONLY,
    EUROPEAN_MAORI,
  ]),
  topLevel('asian', 'Asian only', ['Asian only']),
  topLevel('pacific', 'Pacific Islander only', ['Pacific Peoples only']),
  topLevel('melaa', 'MELAA only', ['Middle Eastern/Latin American/African only']),
]

/**
 * Optional European/Maori dual-response variants for European and Maori filters.
 * Not listed in the Group dropdown; selected via checkbox.
 */
export const INCLUDE_EUR_MAORI_VARIANTS: OverlayMetric[] = [
  {
    id: 'european-incl-eur-maori',
    label: 'NZ European only',
    legendTitle: 'NZ European only ethnicity share (%)',
    source: 'single',
    keys: [EUROPEAN_ONLY, EUROPEAN_MAORI],
    parentId: null,
    baseGroupId: 'european',
    includesEurMaori: true,
  },
  {
    id: 'maori-incl-eur-maori',
    label: 'NZ Maori only',
    legendTitle: 'NZ Maori only ethnicity share (%)',
    source: 'single',
    keys: [MAORI_ONLY, EUROPEAN_MAORI],
    parentId: null,
    baseGroupId: 'maori',
    includesEurMaori: true,
  },
]

// European level-3 subgroups are intentionally omitted: shares are too small
// for a national choropleth and clutter the Map colour controls.

const ASIAN_CHILDREN: Array<[string, string]> = [
  ['chinese', 'Chinese'],
  ['indian', 'Indian'],
  ['filipino', 'Filipino'],
  ['japanese', 'Japanese'],
  ['korean', 'Korean'],
  ['sri-lankan', 'Sri Lankan'],
  ['vietnamese', 'Vietnamese'],
  ['cambodian', 'Cambodian'],
]

const PACIFIC_CHILDREN: Array<[string, string]> = [
  ['samoan', 'Samoan'],
  ['cook-islands-maori', 'Cook Islands Maori'],
  ['tongan', 'Tongan'],
  ['niuean', 'Niuean'],
  ['tokelauan', 'Tokelauan'],
  ['fijian', 'Fijian'],
]

const MELAA_CHILDREN: Array<[string, string]> = [
  ['middle-eastern', 'Middle Eastern'],
  ['latin-american', 'Latin American'],
  ['african', 'African'],
]

function childrenFor(parentId: string, pairs: Array<[string, string]>): OverlayMetric[] {
  return pairs.map(([id, label]) => {
    const censusKey = LEVEL3_KEY_MAP[label]
    if (!censusKey) {
      throw new Error(`Missing LEVEL3_KEY_MAP entry for overlay child "${label}"`)
    }
    return level3Child(id, label, parentId, censusKey)
  })
}

/** Level-3 drill-downs available under top-level groups. */
export const CHILD_OVERLAYS: OverlayMetric[] = [
  ...childrenFor('asian', ASIAN_CHILDREN),
  ...childrenFor('pacific', PACIFIC_CHILDREN),
  ...childrenFor('melaa', MELAA_CHILDREN),
]

export const ALL_OVERLAYS: OverlayMetric[] = [
  ...TOP_LEVEL_OVERLAYS,
  ...INCLUDE_EUR_MAORI_VARIANTS,
  ...CHILD_OVERLAYS,
]

const OVERLAY_BY_ID = new Map(ALL_OVERLAYS.map((metric) => [metric.id, metric]))

export const DEFAULT_OVERLAY_ID = 'european'

export function getOverlayMetric(id: string | null | undefined): OverlayMetric {
  if (id && OVERLAY_BY_ID.has(id)) return OVERLAY_BY_ID.get(id)!
  return OVERLAY_BY_ID.get(DEFAULT_OVERLAY_ID)!
}

export function childrenOfOverlay(parentId: string): OverlayMetric[] {
  return CHILD_OVERLAYS.filter((metric) => metric.parentId === parentId)
}

/** Map colour top-level id → pie chart category name (InfoPanel). */
export const OVERLAY_PARENT_TO_PIE_CATEGORY: Record<string, string> = {
  asian: 'Asian',
  pacific: 'Pacific Islander',
  melaa: 'MELAA & Other',
}

/** Active map-detail sub-group to carve out of a pie parent slice. */
export interface PieDetailHighlight {
  parentCategory: string
  subLabel: string
  subValue: number
}

/**
 * When a level-3 map colour is selected, return the sub-count to shade inside
 * the parent pie category (e.g. Chinese within Asian).
 */
export function pieDetailHighlightForOverlay(
  overlayId: string,
  level3Counts: EthnicityCounts | undefined,
): PieDetailHighlight | null {
  const metric = getOverlayMetric(overlayId)
  if (!metric.parentId || metric.source !== 'level3') return null
  const parentCategory = OVERLAY_PARENT_TO_PIE_CATEGORY[metric.parentId]
  if (!parentCategory) return null
  const key = metric.keys[0]
  if (!key || !level3Counts) return null
  const raw = level3Counts[key]
  const subValue = typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
  if (subValue <= 0) return null
  return {
    parentCategory,
    subLabel: metric.label,
    subValue,
  }
}

/** Group dropdown id for a metric (strips include-variant / detail child). */
export function topLevelIdFor(overlayId: string): string {
  const metric = getOverlayMetric(overlayId)
  if (metric.baseGroupId) return metric.baseGroupId
  return metric.parentId ?? metric.id
}

/**
 * True when Map colour is European or Maori (including include-dual variants).
 * Uses the group id so the checkbox stays available for those filters.
 */
export function supportsIncludeEurMaori(overlayId: string): boolean {
  const groupId = topLevelIdFor(overlayId)
  return groupId === 'european' || groupId === 'maori'
}

export function includesEurMaori(overlayId: string): boolean {
  return Boolean(getOverlayMetric(overlayId).includesEurMaori)
}

/**
 * Map a base European/Maori group id to the metric id for the include-dual checkbox.
 * Non european/maori ids are returned unchanged.
 */
export function overlayIdWithIncludeEurMaori(baseGroupId: string, include: boolean): string {
  if (baseGroupId === 'european') return include ? 'european-incl-eur-maori' : 'european'
  if (baseGroupId === 'maori') return include ? 'maori-incl-eur-maori' : 'maori'
  return baseGroupId
}

/**
 * When switching group/detail selection, preserve the include-dual preference for European/Maori.
 */
export function resolveOverlaySelection(nextId: string, includeEurMaori: boolean): string {
  const metric = getOverlayMetric(nextId)
  // Level-3 detail: use as-is
  if (metric.parentId) return metric.id
  // Include variants: normalize via preference
  const groupId = metric.baseGroupId ?? metric.id
  if (groupId === 'european' || groupId === 'maori') {
    return overlayIdWithIncludeEurMaori(groupId, includeEurMaori)
  }
  return metric.id
}

export function overlayMetricSlug(id: string): string {
  return getOverlayMetric(id).id
}

export function sumMetricKeys(data: EthnicityCounts | undefined, keys: string[]): number {
  if (!data) return 0
  let sum = 0
  for (const key of keys) {
    const value = data[key]
    if (typeof value === 'number' && Number.isFinite(value)) sum += value
  }
  return sum
}

/**
 * Share of total stated ethnicity for an overlay metric.
 * Returns null when the sample is missing or below the reliability cutoff.
 */
export function getOverlayMetricData(
  regionEntry: RegionEntry | null | undefined,
  year: string,
  ageGroup = 'Total - age',
  overlayId: string = DEFAULT_OVERLAY_ID,
): EuropeanMetric | null {
  if (!regionEntry || !year) return null
  const metric = getOverlayMetric(overlayId)
  const yearData = regionEntry.ethnicityData[year]
  if (!yearData) return null
  const ageData = yearData[ageGroup] || yearData['Total - age']
  if (!ageData) return null

  const total = ageData['Total stated - ethnicity']
  if (typeof total !== 'number' || total < MINIMUM_STATED_ETHNICITY_COUNT) return null

  const count = sumMetricKeys(ageData, metric.keys)
  return {
    count,
    percentage: (count / total) * 100,
  }
}

/** @deprecated Prefer getOverlayMetricData — kept for call-site migration. */
export function getEuropeanData(
  regionEntry: RegionEntry | null,
  year: string,
  ageGroup = 'Total - age',
): EuropeanMetric | null {
  return getOverlayMetricData(regionEntry, year, ageGroup, 'european')
}
