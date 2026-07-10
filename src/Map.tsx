import maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import AreaSearch, { type SearchHit } from './AreaSearch'
import ControlPanel from './ControlPanel'
import { useData } from './contexts/DataContext'
import { europeanFillColor, getEuropeanData } from './domain/geo'
import {
  type GeographyTier,
  NATIONAL_KEY,
  SA2_ZOOM_THRESHOLD,
  TA_ZOOM_THRESHOLD,
  TILE_SOURCES,
} from './domain/types'
import InfoPanel from './InfoPanel'
import { assetUrl } from './lib/paths'
import MapLegend from './MapLegend'

const NZ_CENTER: [number, number] = [174.7762, -41.2865]
// Wide enough for all of NZ including Chathams when zoomed out
const NZ_BOUNDS: [[number, number], [number, number]] = [
  [160.0, -50.0],
  [185.0, -32.0],
]

const EMPTY_SELECTION_FILTER: maplibregl.FilterSpecification = [
  '==',
  ['literal', ''],
  ['literal', 'selected-area'],
]

function ensureBorderLayer(map: maplibregl.Map, tier: GeographyTier) {
  const sourceId = `${tier}-borders`
  const layerId = `${tier}-border`
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: assetUrl(`tiles/${tier}-borders.geojson`),
      buffer: 512,
      tolerance: 0,
    })
  }
  if (!map.getLayer(layerId)) {
    map.addLayer(
      {
        id: layerId,
        type: 'line',
        source: sourceId,
        paint: {
          'line-color': '#555',
          'line-width': borderLineWidth(tier),
          'line-opacity': borderLineOpacity(tier),
        },
        layout: {
          visibility: 'none',
          'line-cap': 'round',
          'line-join': 'round',
        },
      },
      `${tier}-selected-fill`,
    )
  }
}

function borderLineWidth(tier: GeographyTier): maplibregl.ExpressionSpecification {
  if (tier === 'rc') {
    return ['interpolate', ['linear'], ['zoom'], 2, 0.35, 5, 0.65, 8, 1]
  }
  if (tier === 'ta') {
    return ['interpolate', ['linear'], ['zoom'], 8, 0.5, 10, 0.8, 11, 1]
  }
  return ['interpolate', ['linear'], ['zoom'], 11, 0.35, 12, 0.5, 14, 0.7]
}

function borderLineOpacity(tier: GeographyTier): maplibregl.ExpressionSpecification {
  if (tier === 'rc') {
    return ['interpolate', ['linear'], ['zoom'], 2, 0.5, 5, 0.65, 8, 0.95]
  }
  if (tier === 'ta') {
    return ['interpolate', ['linear'], ['zoom'], 8, 0.6, 10, 0.8, 11, 0.95]
  }
  return ['interpolate', ['linear'], ['zoom'], 11, 0.5, 12, 0.65, 14, 0.8]
}

function colorExpression(
  metrics: Record<string, number>,
  nameProp: string,
): maplibregl.ExpressionSpecification {
  const entries = Object.entries(metrics)
  if (entries.length === 0) {
    return ['literal', '#888']
  }

  const matchExpr: unknown[] = ['match', ['get', nameProp]]
  for (const [name, pct] of entries) {
    matchExpr.push(name, europeanFillColor(pct))
  }
  matchExpr.push('#888')
  return matchExpr as maplibregl.ExpressionSpecification
}

function activeGeographyTier(
  zoom: number,
  showRegionalCouncils: boolean,
  showTerritorialAuthorities: boolean,
  showSA2: boolean,
): GeographyTier | null {
  const showRc =
    showRegionalCouncils &&
    (zoom < TA_ZOOM_THRESHOLD ||
      (!showTerritorialAuthorities && zoom < SA2_ZOOM_THRESHOLD) ||
      (!showTerritorialAuthorities && !showSA2))
  const showTa =
    showTerritorialAuthorities &&
    zoom >= TA_ZOOM_THRESHOLD &&
    (zoom < SA2_ZOOM_THRESHOLD || !showSA2)
  const showSa2Layer = showSA2 && zoom >= SA2_ZOOM_THRESHOLD

  if (showSa2Layer) return 'sa2'
  if (showTa) return 'ta'
  if (showRc) return 'rc'
  if (showTerritorialAuthorities) return 'ta'
  if (showSA2) return 'sa2'
  return null
}

function MapView() {
  const {
    selectedArea,
    setSelectedArea,
    selectedYear,
    setSelectedYear,
    selectedAgeGroup,
    setSelectedAgeGroup,
    availableYears,
    availableAgeGroups,
    metrics,
    loading,
    error,
    ensureMetrics,
    nationalKey,
    nationalDetail,
    detailLoading,
  } = useData()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [zoomLevel, setZoomLevel] = useState(6)
  const [mapReady, setMapReady] = useState(false)
  const [showRegionalCouncils, setShowRegionalCouncils] = useState(true)
  const [showTerritorialAuthorities, setShowTerritorialAuthorities] = useState(true)
  const [showSA2, setShowSA2] = useState(true)

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          national: {
            type: 'geojson',
            data: assetUrl('tiles/national-fills.geojson'),
            buffer: 512,
            tolerance: 0,
          },
          'national-borders': {
            type: 'geojson',
            data: assetUrl('tiles/national-borders.geojson'),
            buffer: 512,
            tolerance: 0,
          },
          rc: {
            type: 'geojson',
            data: assetUrl('tiles/rc-fills.geojson'),
            buffer: 512,
            tolerance: 0,
          },
          ta: {
            type: 'geojson',
            data: assetUrl('tiles/ta-fills.geojson'),
            buffer: 512,
            tolerance: 0,
          },
          sa2: {
            type: 'geojson',
            data: assetUrl('tiles/sa2-fills.geojson'),
            buffer: 512,
            tolerance: 0,
          },
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': '#f8f9fa',
            },
          },
          {
            id: 'national-fill',
            type: 'fill',
            source: 'national',
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.88,
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'national-border',
            type: 'line',
            source: 'national-borders',
            paint: {
              'line-color': '#555',
              'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 0.9, 9, 1.2],
              'line-opacity': 0.75,
            },
            layout: {
              visibility: 'none',
              'line-cap': 'round',
              'line-join': 'round',
            },
          },
          {
            id: 'rc-fill',
            type: 'fill',
            source: 'rc',
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.88,
              'fill-antialias': false,
            },
          },
          {
            id: 'rc-selected-fill',
            type: 'fill',
            source: 'rc',
            paint: {
              'fill-color': '#000',
              'fill-opacity': 0.14,
              'fill-antialias': false,
            },
            filter: EMPTY_SELECTION_FILTER,
          },
          {
            id: 'ta-fill',
            type: 'fill',
            source: 'ta',
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.88,
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'ta-selected-fill',
            type: 'fill',
            source: 'ta',
            paint: {
              'fill-color': '#000',
              'fill-opacity': 0.14,
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
            filter: EMPTY_SELECTION_FILTER,
          },
          {
            id: 'sa2-fill',
            type: 'fill',
            source: 'sa2',
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.88,
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'sa2-selected-fill',
            type: 'fill',
            source: 'sa2',
            paint: {
              'fill-color': '#000',
              'fill-opacity': 0.14,
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
            filter: EMPTY_SELECTION_FILTER,
          },
        ],
      },
      center: NZ_CENTER,
      zoom: 5,
      maxBounds: NZ_BOUNDS,
      minZoom: 2,
      maxZoom: 14,
      attributionControl: false,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

    map.on('load', () => {
      setMapReady(true)
      setZoomLevel(map.getZoom())
    })

    map.on('zoomend', () => setZoomLevel(map.getZoom()))

    const clickHandler = (tier: GeographyTier) => (e: maplibregl.MapMouseEvent) => {
      const nameProp = TILE_SOURCES[tier].nameProp
      const features = map.queryRenderedFeatures(e.point, {
        layers: [`${tier}-fill`],
      })
      const name = features[0]?.properties?.[nameProp]
      if (typeof name === 'string' && name) {
        setSelectedArea(name)
      }
    }

    map.on('click', 'rc-fill', clickHandler('rc'))
    map.on('click', 'ta-fill', clickHandler('ta'))
    map.on('click', 'sa2-fill', clickHandler('sa2'))
    map.on('click', 'national-fill', () => setSelectedArea(nationalKey))

    for (const layer of ['national-fill', 'rc-fill', 'ta-fill', 'sa2-fill']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, () => {
        map.getCanvas().style.cursor = ''
      })
    }

    mapRef.current = map
    return () => {
      map.remove()
      mapRef.current = null
    }
  }, [setSelectedArea, nationalKey])

  // Lazy-load choropleth metrics only (KB), not full census tables
  useEffect(() => {
    const active = activeGeographyTier(
      zoomLevel,
      showRegionalCouncils,
      showTerritorialAuthorities,
      showSA2,
    )
    void ensureMetrics(active ? [active] : [])
  }, [zoomLevel, showRegionalCouncils, showTerritorialAuthorities, showSA2, ensureMetrics])

  // Layer visibility by zoom + toggles
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const showNational = !showRegionalCouncils && !showTerritorialAuthorities && !showSA2
    const active = activeGeographyTier(
      zoomLevel,
      showRegionalCouncils,
      showTerritorialAuthorities,
      showSA2,
    )

    if (active) ensureBorderLayer(map, active)

    if (map.getLayer('national-fill')) {
      map.setLayoutProperty('national-fill', 'visibility', showNational ? 'visible' : 'none')
    }
    if (map.getLayer('national-border')) {
      map.setLayoutProperty('national-border', 'visibility', showNational ? 'visible' : 'none')
    }

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      const vis = active === tier ? 'visible' : 'none'
      if (map.getLayer(`${tier}-fill`)) map.setLayoutProperty(`${tier}-fill`, 'visibility', vis)
      if (map.getLayer(`${tier}-border`)) map.setLayoutProperty(`${tier}-border`, 'visibility', vis)
      if (map.getLayer(`${tier}-selected-fill`)) {
        map.setLayoutProperty(`${tier}-selected-fill`, 'visibility', vis)
      }
    }

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      if (!map.getLayer(`${tier}-selected-fill`)) continue
      const isSelectedActive =
        active === tier &&
        selectedArea &&
        selectedArea !== NATIONAL_KEY &&
        selectedArea !== nationalKey
      map.setFilter(
        `${tier}-selected-fill`,
        isSelectedActive
          ? ['==', ['get', TILE_SOURCES[tier].nameProp], selectedArea]
          : EMPTY_SELECTION_FILTER,
      )
    }
  }, [
    zoomLevel,
    showRegionalCouncils,
    showTerritorialAuthorities,
    showSA2,
    mapReady,
    selectedArea,
    nationalKey,
  ])

  // Apply metrics to fill colors
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const nationalMetric = getEuropeanData(
      nationalDetail?.single ?? null,
      selectedYear,
      selectedAgeGroup,
    )
    if (map.getLayer('national-fill')) {
      map.setPaintProperty(
        'national-fill',
        'fill-color',
        europeanFillColor(nationalMetric?.percentage),
      )
    }

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      const layerId = `${tier}-fill`
      if (!map.getLayer(layerId)) continue
      const nameProp = TILE_SOURCES[tier].nameProp
      map.setPaintProperty(layerId, 'fill-color', colorExpression(metrics, nameProp))
    }
  }, [metrics, mapReady, nationalDetail, selectedYear, selectedAgeGroup])

  const flyToSearch = (hit: SearchHit, zoom: number) => {
    setSelectedArea(hit.name)
    const map = mapRef.current
    if (!map || !hit.center) return
    map.flyTo({
      center: hit.center,
      zoom,
      essential: true,
      duration: 1200,
    })
  }

  return (
    <>
      <div ref={containerRef} style={{ height: '100vh', width: '100%' }} />
      <AreaSearch onSelect={flyToSearch} disabled={loading} />
      <ControlPanel
        availableYears={availableYears}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        availableAgeGroups={availableAgeGroups}
        selectedAgeGroup={selectedAgeGroup}
        onAgeGroupChange={setSelectedAgeGroup}
        showRegionalCouncils={showRegionalCouncils}
        onShowRegionalCouncilsChange={setShowRegionalCouncils}
        showTerritorialAuthorities={showTerritorialAuthorities}
        onShowTerritorialAuthoritiesChange={setShowTerritorialAuthorities}
        showSA2={showSA2}
        onShowSA2Change={setShowSA2}
        disabled={loading}
      />
      <InfoPanel />
      <MapLegend />
      {loading && <div className="map-overlay-message">Loading map...</div>}
      {detailLoading && !loading && <div className="map-overlay-detail">Loading area...</div>}
      {error && <div className="map-overlay-error">Error: {error}</div>}
    </>
  )
}

export default MapView
