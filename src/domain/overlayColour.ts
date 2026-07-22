import { getOverlayMetric, type OverlayMetric, type OverlayPalette } from './overlay'

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
const EURO_MAORI_SCALE_STOPS: readonly ScaleStop[] = [
  ...DIVERGING_LOW_STOPS,
  { pct: 75, color: [106, 163, 119] },
  { pct: 100, color: [22, 101, 52] }, // #166534
]

const PALETTE_STOPS: Record<Exclude<OverlayPalette, 'monochrome'>, readonly ScaleStop[]> = {
  'european-diverging': EUROPEAN_SCALE_STOPS,
  'euro-maori-diverging': EURO_MAORI_SCALE_STOPS,
}

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
  return multiStopFillColor(percentage, EURO_MAORI_SCALE_STOPS)
}

/** Full-strength accent colour for the overlay metric. */
export function overlayAccentColor(overlayId: string): string {
  return getOverlayMetric(overlayId).accent
}

/**
 * Darker shade of the overlay accent — used for level-3 pie carve and callout
 * so the detail stands out against the parent category colour.
 */
export function overlayDetailAccentColor(overlayId: string, amount = 0.34): string {
  return darkenHexColor(overlayAccentColor(overlayId), amount)
}

/** Darken a hex colour toward black by `amount` (0–1). */
export function darkenHexColor(hex: string, amount = 0.32): string {
  const channels = parseHexColor(hex)
  if (!channels) return hex
  const factor = Math.max(0, Math.min(1, 1 - amount))
  return `rgb(${channels.map((channel) => Math.round(channel * factor)).join(', ')})`
}

/** Colour domain for choropleth + legend (percentages). */
export interface ColourScaleDomain {
  min: number
  max: number
}

const DEFAULT_SCALE_DOMAIN: ColourScaleDomain = { min: 0, max: 100 }

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
 * Colour domain for the active overlay.
 * - Always starts at 0
 * - fixed-0-100 metrics → max 100
 * - data-max metrics → max = rounded data maximum
 */
export function overlayScaleDomain(
  overlayId: string,
  metrics: Record<string, number>,
): ColourScaleDomain {
  const metric = getOverlayMetric(overlayId)
  if (metric.scale === 'fixed-0-100') return { ...DEFAULT_SCALE_DOMAIN }
  const { max } = metricsMinMax(metrics)
  return niceScaleDomain(max)
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
  const metric = getOverlayMetric(overlayId)
  return fillForMetric(normalized, metric)
}

function fillForMetric(normalized: number, metric: OverlayMetric): string {
  if (metric.palette === 'monochrome') {
    return monochromeFillColor(normalized, metric.accent)
  }
  return multiStopFillColor(normalized, PALETTE_STOPS[metric.palette])
}

/** White (0%) → full accent colour (100% of scale). */
export function monochromeFillColor(percentage: number, accentHex: string): string {
  const value = Math.max(0, Math.min(100, percentage))
  const end = parseHexColor(accentHex)
  if (!end) return accentHex
  return interpolateRgb([255, 255, 255], end, value / 100)
}

export function parseHexColor(hex: string): [number, number, number] | null {
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
