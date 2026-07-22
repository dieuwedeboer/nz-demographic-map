import { topLevelIdFor } from './overlay'
import type { EthnicityCounts, RegionData, RegionEntry } from './types'
import { CATEGORY_COLORS, SA2_ZOOM_THRESHOLD, TA_ZOOM_THRESHOLD } from './types'

export { getEuropeanData, getOverlayMetricData } from './overlay'

/** Unique map accent for NZ European & Maori combined (not a pie dual colour). */
export const EUROPEAN_MAORI_COMBINED_COLOR = '#166534' // forest green

/** Pie-chart / map accent colour for a choropleth overlay group. */
const OVERLAY_PIE_COLORS: Record<string, string> = {
  european: CATEGORY_COLORS.European,
  'european-maori': EUROPEAN_MAORI_COMBINED_COLOR,
  maori: CATEGORY_COLORS.Maori,
  asian: CATEGORY_COLORS.Asian,
  pacific: CATEGORY_COLORS['Pacific Islander'],
  melaa: CATEGORY_COLORS['MELAA & Other'],
}

export function normalizeName(name: string): string {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function buildNameIndex(regionData: RegionData): Map<string, string> {
  const index = new Map<string, string>()
  for (const key of Object.keys(regionData)) {
    index.set(normalizeName(key), key)
  }
  return index
}

export function findRegionData(
  regionData: RegionData,
  regionName: string,
  nameIndex?: Map<string, string>,
): RegionEntry | null {
  if (!regionName) return null
  if (regionData[regionName]) return regionData[regionName]

  if (nameIndex) {
    const key = nameIndex.get(normalizeName(regionName))
    return key ? (regionData[key] ?? null) : null
  }

  const normalized = normalizeName(regionName)
  for (const key of Object.keys(regionData)) {
    if (normalizeName(key) === normalized) return regionData[key]
  }
  return null
}

type Rgb = readonly [number, number, number]
type ScaleStop = { readonly pct: number; readonly color: Rgb }

/** Shared low end of the European-style diverging scale (brown → cream). */
const DIVERGING_LOW_STOPS: readonly ScaleStop[] = [
  { pct: 0, color: [140, 81, 10] },
  { pct: 25, color: [216, 179, 101] },
  { pct: 50, color: [246, 232, 170] },
]

const EUROPEAN_SCALE_STOPS: readonly ScaleStop[] = [
  ...DIVERGING_LOW_STOPS,
  { pct: 75, color: [116, 173, 209] },
  { pct: 100, color: [33, 102, 172] },
]

/** Same as European, but high end is forest green instead of blue. */
const EUROPEAN_MAORI_COMBINED_SCALE_STOPS: readonly ScaleStop[] = [
  ...DIVERGING_LOW_STOPS,
  { pct: 75, color: [106, 163, 119] },
  { pct: 100, color: [22, 101, 52] }, // #166534
]

function multiStopFillColor(percentage: number | undefined, stops: readonly ScaleStop[]): string {
  if (percentage === undefined || Number.isNaN(percentage)) {
    return '#888'
  }

  const value = Math.max(0, Math.min(100, percentage))
  for (let index = 1; index < stops.length; index++) {
    const start = stops[index - 1]
    const end = stops[index]
    if (value <= end.pct) {
      const t = (value - start.pct) / (end.pct - start.pct)
      return interpolateRgb(start.color, end.color, t)
    }
  }

  const last = stops[stops.length - 1].color
  return interpolateRgb(last, last, 0)
}

/** Diverging brown→blue scale used for European share (historical default). */
export function europeanFillColor(percentage?: number): string {
  return multiStopFillColor(percentage, EUROPEAN_SCALE_STOPS)
}

/** Same diverging shape as European, with forest green on the high end. */
export function europeanMaoriCombinedFillColor(percentage?: number): string {
  return multiStopFillColor(percentage, EUROPEAN_MAORI_COMBINED_SCALE_STOPS)
}

/** Full-strength pie colour for the overlay’s top-level group. */
export function overlayAccentColor(overlayId: string): string {
  const groupId = topLevelIdFor(overlayId)
  return OVERLAY_PIE_COLORS[groupId] ?? CATEGORY_COLORS.European
}

/** True when the group uses a single accent (white → colour) scale. */
export function usesMonochromeOverlayScale(overlayId: string): boolean {
  // European-style multi-stop scales for European / Euro+Maori; monochrome elsewhere.
  const groupId = topLevelIdFor(overlayId)
  return groupId !== 'european' && groupId !== 'european-maori'
}

/** Colour domain for choropleth + legend (percentages). */
export interface ColourScaleDomain {
  min: number
  max: number
}

export const DEFAULT_SCALE_DOMAIN: ColourScaleDomain = { min: 0, max: 100 }

/** Lowest and highest finite percentages in a metrics map. */
export function metricsMinMax(metrics: Record<string, number>): ColourScaleDomain {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const value of Object.values(metrics)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      if (value < min) min = value
      if (value > max) max = value
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ...DEFAULT_SCALE_DOMAIN }
  return { min, max }
}

/**
 * Round a data max up to a whole number for the legend ceiling.
 * Min is always 0. Ensures the domain covers rawMax with a non-zero span.
 */
export function niceScaleDomain(rawMax: number): ColourScaleDomain {
  if (!Number.isFinite(rawMax) || rawMax <= 0) return { ...DEFAULT_SCALE_DOMAIN }

  // Nearest integer, then ceil if rounding would clip the data max
  let max = Math.round(rawMax)
  if (max < rawMax) max = Math.ceil(rawMax)
  max = Math.max(1, Math.min(100, max))

  return { min: 0, max }
}

/**
 * True for NZ European only (+ include dual) and NZ European & Maori combined —
 * these always use a fixed 0–100% scale.
 */
export function usesFixedHundredScale(overlayId: string): boolean {
  const groupId = topLevelIdFor(overlayId)
  return groupId === 'european' || groupId === 'european-maori'
}

/**
 * Colour domain for the active overlay.
 * - Always starts at 0
 * - NZ European / NZ European & Maori combined → max 100
 * - All other groups → max = rounded data maximum
 */
export function overlayScaleDomain(
  overlayId: string,
  metrics: Record<string, number>,
): ColourScaleDomain {
  if (usesFixedHundredScale(overlayId)) return { ...DEFAULT_SCALE_DOMAIN }
  const { max } = metricsMinMax(metrics)
  return niceScaleDomain(max)
}

/** Highest finite percentage in metrics (0 if empty). */
export function metricsMaxPercentage(metrics: Record<string, number>): number {
  let max = 0
  let found = false
  for (const value of Object.values(metrics)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      found = true
      if (value > max) max = value
    }
  }
  return found ? max : 0
}

/** Evenly spaced legend tick values from scale min to max. */
export function legendTickValues(scaleMin: number, scaleMax: number, tickCount = 5): number[] {
  const min = scaleMin
  const max = scaleMax > scaleMin ? scaleMax : scaleMin + 1
  if (tickCount < 2) return [min, max]
  const ticks: number[] = []
  for (let i = 0; i < tickCount; i++) {
    const value = min + ((max - min) * i) / (tickCount - 1)
    ticks.push(formatLegendTick(value, max - min))
  }
  ticks[0] = min
  ticks[ticks.length - 1] = max
  return ticks
}

function formatLegendTick(value: number, span: number): number {
  if (span <= 5) return Math.round(value * 10) / 10
  if (span <= 20) return Math.round(value * 2) / 2
  return Math.round(value)
}

/**
 * Map a percentage onto 0–100 within [scaleMin, scaleMax].
 */
export function normalizeToScale(percentage: number, scaleMin: number, scaleMax: number): number {
  const span = scaleMax - scaleMin
  if (!(span > 0)) return 50
  const clamped = Math.max(scaleMin, Math.min(scaleMax, percentage))
  return ((clamped - scaleMin) / span) * 100
}

/**
 * Choropleth fill for a percentage under the active overlay.
 * No-data values (undefined/NaN) stay grey.
 * Colours stretch from scaleMin (weakest) to scaleMax (full strength).
 */
export function overlayFillColor(
  percentage?: number,
  overlayId = 'european',
  scaleMin = 0,
  scaleMax = 100,
): string {
  if (percentage === undefined || Number.isNaN(percentage)) {
    return '#888'
  }
  const normalized = normalizeToScale(percentage, scaleMin, scaleMax)
  const groupId = topLevelIdFor(overlayId)
  if (groupId === 'european') return europeanFillColor(normalized)
  if (groupId === 'european-maori') return europeanMaoriCombinedFillColor(normalized)
  return monochromeFillColor(normalized, overlayAccentColor(overlayId))
}

/** White (0%) → full accent colour (100% of scale). */
export function monochromeFillColor(percentage: number, accentHex: string): string {
  const value = Math.max(0, Math.min(100, percentage))
  const end = parseHexColor(accentHex)
  if (!end) return accentHex
  return interpolateRgb([255, 255, 255], end, value / 100)
}

/** Darken a hex colour toward black by amount in [0, 1]. */
export function darkenHexColor(hex: string, amount = 0.32): string {
  const channels = parseHexColor(hex)
  if (!channels) return hex
  const factor = Math.max(0, Math.min(1, 1 - amount))
  return `rgb(${channels.map((channel) => Math.round(channel * factor)).join(', ')})`
}

function parseHexColor(hex: string): [number, number, number] | null {
  const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!match) return null
  const value =
    match[1].length === 3
      ? match[1]
          .split('')
          .map((character) => character + character)
          .join('')
      : match[1]
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

function interpolateRgb(
  start: readonly [number, number, number],
  end: readonly [number, number, number],
  t: number,
) {
  return `rgb(${start.map((channel, index) => Math.round(channel + (end[index] - channel) * t)).join(', ')})`
}

export function getValue(data: EthnicityCounts | undefined, key: string): number {
  return data?.[key] ?? 0
}

export function ageGroupSlug(ageGroup: string): string {
  if (ageGroup === 'Total - age') return 'all'
  return ageGroup.replace(/\s+/g, '-').toLowerCase()
}

export function tierForZoom(zoom: number): 'rc' | 'ta' | 'sa2' {
  if (zoom >= SA2_ZOOM_THRESHOLD) return 'sa2'
  if (zoom >= TA_ZOOM_THRESHOLD) return 'ta'
  return 'rc'
}
