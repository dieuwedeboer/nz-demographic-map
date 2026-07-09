import { useState } from 'react'
import { europeanFillColor } from './domain/geo'

const GRADIENT_SAMPLES = 50
const LABELS = [0, 25, 50, 75, 100]

const gradientStops = Array.from({ length: GRADIENT_SAMPLES + 1 }, (_, i) => {
  const pct = (i / GRADIENT_SAMPLES) * 100
  return `${europeanFillColor(pct)} ${pct}%`
}).join(', ')

const gradient = `linear-gradient(to right, ${gradientStops})`

function MapLegend() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className={`map-legend ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-header">
        <span className="panel-header-label">Legend</span>
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand legend' : 'Collapse legend'}
        >
          {collapsed ? '▶' : '▼'}
        </button>
      </div>
      {!collapsed && (
        <>
          <div className="map-legend-title">European ethnicity share (%)</div>
          <div className="map-legend-bar" style={{ background: gradient }} />
          <div className="map-legend-labels">
            {LABELS.map((pct) => (
              <span key={pct} className="map-legend-label" style={{ left: `${pct}%` }}>
                {pct}
              </span>
            ))}
          </div>
          <div className="map-legend-row">
            <span className="map-legend-swatch" style={{ background: '#888' }} />
            <span className="map-legend-note">No data</span>
          </div>
        </>
      )}
    </div>
  )
}

export default MapLegend
