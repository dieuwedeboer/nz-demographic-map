import { useMemo } from 'react'
import { getOverlayMetric } from './domain/overlay'
import { legendTickValues, overlayFillColor } from './domain/overlayColour'

const GRADIENT_SAMPLES = 50

interface MapLegendProps {
  overlayId?: string
  /** Percentage that maps to weakest colour (default 0). */
  scaleMin?: number
  /** Percentage that maps to full colour strength (default 100). */
  scaleMax?: number
}

function MapLegend({ overlayId, scaleMin = 0, scaleMax = 100 }: MapLegendProps) {
  const metric = getOverlayMetric(overlayId)
  const min = scaleMin
  const max = scaleMax > scaleMin ? scaleMax : scaleMin + 1
  const labels = useMemo(() => legendTickValues(min, max), [min, max])

  const gradient = useMemo(() => {
    const stops = Array.from({ length: GRADIENT_SAMPLES + 1 }, (_, i) => {
      const t = i / GRADIENT_SAMPLES
      const pct = min + (max - min) * t
      // CSS gradient positions are always 0–100% of the bar width
      return `${overlayFillColor(pct, metric.id, min, max)} ${t * 100}%`
    }).join(', ')
    return `linear-gradient(to right, ${stops})`
  }, [max, metric.id, min])

  return (
    <div className="map-legend">
      <div className="map-legend-title">{metric.legendTitle}</div>
      <div className="map-legend-scale">
        <div className="map-legend-bar" style={{ background: gradient }} />
      </div>
      <div className="map-legend-labels">
        {labels.map((value, index) => {
          const left = labels.length === 1 ? 0 : (index / (labels.length - 1)) * 100
          return (
            <span key={value} className="map-legend-label" style={{ left: `${left}%` }}>
              {formatLabel(value)}
            </span>
          )
        })}
      </div>
      <div className="map-legend-row">
        <span className="map-legend-swatch" style={{ background: '#888' }} />
        <span className="map-legend-note">No data or sample &lt;50</span>
      </div>
    </div>
  )
}

function formatLabel(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return value.toFixed(1)
}

export default MapLegend
