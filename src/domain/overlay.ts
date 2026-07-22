import catalogue from './overlay-metrics.json'
import type { EthnicityCounts, OverlayMetricValue, RegionEntry } from './types'

export type OverlaySource = 'single' | 'level3'
export type OverlayPalette = 'european-diverging' | 'euro-maori-diverging' | 'monochrome'
type OverlayScaleMode = 'fixed-0-100' | 'data-max'

/** Choropleth overlay metric (top-level group, include-variant, or level-3 sub-ethnicity). */
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
  palette: OverlayPalette
  scale: OverlayScaleMode
  accent: string
}

/** Canonical UI selection; encodes to a metric id for URL + metrics load. */
export interface OverlaySelection {
  groupId: string
  detailId: string | null
  includeEurMaori: boolean
}

const MINIMUM_STATED_ETHNICITY_COUNT = catalogue.minimumStatedEthnicityCount
export const DEFAULT_OVERLAY_ID = catalogue.defaultOverlayId

export const ALL_OVERLAYS: OverlayMetric[] = catalogue.metrics as OverlayMetric[]

const OVERLAY_BY_ID = new Map(ALL_OVERLAYS.map((metric) => [metric.id, metric]))

/** Top-level choropleth groupings shown in the Group dropdown. */
export const TOP_LEVEL_OVERLAYS: OverlayMetric[] = ALL_OVERLAYS.filter(
  (metric) => !metric.parentId && !metric.baseGroupId,
)

/** Level-3 drill-downs available under top-level groups. */
const CHILD_OVERLAYS: OverlayMetric[] = ALL_OVERLAYS.filter((metric) => Boolean(metric.parentId))

export function getOverlayMetric(id: string | null | undefined): OverlayMetric {
  if (id && OVERLAY_BY_ID.has(id)) return OVERLAY_BY_ID.get(id)!
  return OVERLAY_BY_ID.get(DEFAULT_OVERLAY_ID)!
}

export function childrenOfOverlay(parentId: string): OverlayMetric[] {
  return CHILD_OVERLAYS.filter((metric) => metric.parentId === parentId)
}

/** Map colour top-level id → pie chart category name (InfoPanel). */
const OVERLAY_PARENT_TO_PIE_CATEGORY: Record<string, string> = {
  asian: 'Asian',
  pacific: 'Pacific Islander',
  melaa: 'MELAA & Other',
}

/**
 * Level-3 map detail for the info panel: carved into the single-response pie
 * (approximate, capped to parent) and shown as a callout with the true count.
 * Mixing level-3 multi-response into the single-response pie is intentional.
 */
export interface PieDetailHighlight {
  parentCategory: string
  subLabel: string
  subValue: number
}

/**
 * When a level-3 map colour is selected, return the multi-response sub-count
 * for pie illustration + callout (see PieDetailHighlight).
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

export function supportsIncludeEurMaori(groupId: string): boolean {
  return groupId === 'european' || groupId === 'maori'
}

export function includesEurMaori(overlayId: string): boolean {
  return Boolean(getOverlayMetric(overlayId).includesEurMaori)
}

export function metricIdFromSelection(selection: OverlaySelection): string {
  if (selection.detailId) {
    const detail = getOverlayMetric(selection.detailId)
    if (detail.parentId === selection.groupId) return detail.id
  }
  if (supportsIncludeEurMaori(selection.groupId) && selection.includeEurMaori) {
    if (selection.groupId === 'european') return 'european-incl-eur-maori'
    if (selection.groupId === 'maori') return 'maori-incl-eur-maori'
  }
  return getOverlayMetric(selection.groupId).id
}

/**
 * Decode a metric id into UI selection.
 * When the metric is not a European/Maori include variant, `includeEurMaori`
 * is taken from `previous` so the preference survives Asian/Pacific detail.
 */
export function selectionFromMetricId(
  metricId: string | null | undefined,
  previous?: OverlaySelection,
): OverlaySelection {
  const metric = getOverlayMetric(metricId)
  if (metric.parentId) {
    return {
      groupId: metric.parentId,
      detailId: metric.id,
      includeEurMaori: previous?.includeEurMaori ?? false,
    }
  }
  const groupId = metric.baseGroupId ?? metric.id
  if (supportsIncludeEurMaori(groupId)) {
    return {
      groupId,
      detailId: null,
      includeEurMaori: Boolean(metric.includesEurMaori),
    }
  }
  return {
    groupId,
    detailId: null,
    includeEurMaori: previous?.includeEurMaori ?? false,
  }
}

/** Prepare-data / manifest export: id + source + keys only. */
export function overlayMetricsForPrepare(): Array<{
  id: string
  source: OverlaySource
  keys: string[]
}> {
  return ALL_OVERLAYS.map((metric) => ({
    id: metric.id,
    source: metric.source,
    keys: metric.keys,
  }))
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
): OverlayMetricValue | null {
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
