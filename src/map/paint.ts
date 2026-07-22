import type maplibregl from 'maplibre-gl'
import type { ColourScaleDomain } from '../domain/overlayColour'
import { overlayFillColor, parseHexColor } from '../domain/overlayColour'

export function colorExpression(
  metrics: Record<string, number>,
  nameProp: string,
  overlayId: string,
  scale: ColourScaleDomain,
): maplibregl.ExpressionSpecification {
  const entries = Object.entries(metrics)
  if (entries.length === 0) return hoverColorExpression('#888')

  const matchExpr: unknown[] = ['match', ['get', nameProp]]
  const hoverMatchExpr: unknown[] = ['match', ['get', nameProp]]
  for (const [name, pct] of entries) {
    const color = overlayFillColor(pct, overlayId, scale.min, scale.max)
    matchExpr.push(name, color)
    hoverMatchExpr.push(name, lightenColor(color))
  }
  matchExpr.push('#888')
  hoverMatchExpr.push(lightenColor('#888'))
  return hoverColorExpression(
    matchExpr as maplibregl.ExpressionSpecification,
    hoverMatchExpr as maplibregl.ExpressionSpecification,
  )
}

export function hoverColorExpression(
  baseColor: string | maplibregl.ExpressionSpecification,
  hoverColor: string | maplibregl.ExpressionSpecification = typeof baseColor === 'string'
    ? lightenColor(baseColor)
    : baseColor,
): maplibregl.ExpressionSpecification {
  return [
    'case',
    ['boolean', ['feature-state', 'hover'], false],
    typeof hoverColor === 'string' ? ['literal', hoverColor] : hoverColor,
    typeof baseColor === 'string' ? ['literal', baseColor] : baseColor,
  ]
}

function lightenColor(color: string, amount = 0.16): string {
  const channels = parseColor(color)
  if (!channels) return color
  const [red, green, blue] = channels
  return `rgb(${lightenChannel(red, amount)}, ${lightenChannel(green, amount)}, ${lightenChannel(
    blue,
    amount,
  )})`
}

function lightenChannel(value: number, amount: number) {
  return Math.round(value + (255 - value) * amount)
}

function parseColor(color: string): [number, number, number] | null {
  const hex = parseHexColor(color)
  if (hex) return hex

  const rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (!rgb) return null
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
}
