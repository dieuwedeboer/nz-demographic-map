import maplibregl from 'maplibre-gl'
import { Protocol } from 'pmtiles'
import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import AreaSearch, { type SearchHit } from './AreaSearch'
import ControlPanel from './ControlPanel'
import { useData } from './contexts/DataContext'
import { europeanFillColor, tierForZoom } from './domain/geo'
import {
  type GeographyTier,
  NATIONAL_KEY,
  SA2_ZOOM_THRESHOLD,
  TA_ZOOM_THRESHOLD,
  TILE_SOURCES,
} from './domain/types'
import InfoPanel from './InfoPanel'
import { pmtilesUrl } from './lib/paths'

const NZ_CENTER: [number, number] = [174.7762, -41.2865]
// Wide enough for all of NZ including Chathams when zoomed out
const NZ_BOUNDS: [[number, number], [number, number]] = [
  [160.0, -50.0],
  [185.0, -32.0],
]

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
    detailLoading,
  } = useData()

  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [zoomLevel, setZoomLevel] = useState(6)
  const [mapReady, setMapReady] = useState(false)
  const [showRegionalCouncils, setShowRegionalCouncils] = useState(true)
  const [showTerritorialAuthorities, setShowTerritorialAuthorities] = useState(true)
  const [showSA2, setShowSA2] = useState(true)
  // Register PMTiles protocol once
  useEffect(() => {
    const protocol = new Protocol()
    maplibregl.addProtocol('pmtiles', protocol.tile)
    return () => {
      maplibregl.removeProtocol('pmtiles')
    }
  }, [])

  // Init map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
          },
          rc: {
            type: 'vector',
            url: `pmtiles://${pmtilesUrl('tiles/rc.pmtiles')}`,
          },
          ta: {
            type: 'vector',
            url: `pmtiles://${pmtilesUrl('tiles/ta.pmtiles')}`,
          },
          sa2: {
            type: 'vector',
            url: `pmtiles://${pmtilesUrl('tiles/sa2.pmtiles')}`,
          },
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm' },
          {
            id: 'rc-fill',
            type: 'fill',
            source: 'rc',
            'source-layer': TILE_SOURCES.rc.layer,
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.75,
            },
          },
          {
            id: 'rc-line',
            type: 'line',
            source: 'rc',
            'source-layer': TILE_SOURCES.rc.layer,
            paint: { 'line-color': '#444', 'line-width': 1 },
          },
          {
            id: 'ta-fill',
            type: 'fill',
            source: 'ta',
            'source-layer': TILE_SOURCES.ta.layer,
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.75,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'ta-line',
            type: 'line',
            source: 'ta',
            'source-layer': TILE_SOURCES.ta.layer,
            paint: { 'line-color': '#444', 'line-width': 1 },
            layout: { visibility: 'none' },
          },
          {
            id: 'sa2-fill',
            type: 'fill',
            source: 'sa2',
            'source-layer': TILE_SOURCES.sa2.layer,
            paint: {
              'fill-color': '#888',
              'fill-opacity': 0.75,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'sa2-line',
            type: 'line',
            source: 'sa2',
            'source-layer': TILE_SOURCES.sa2.layer,
            paint: { 'line-color': '#444', 'line-width': 0.5 },
            layout: { visibility: 'none' },
          },
          {
            id: 'selected-line',
            type: 'line',
            source: 'rc',
            'source-layer': TILE_SOURCES.rc.layer,
            paint: { 'line-color': '#000', 'line-width': 3 },
            filter: ['==', ['get', TILE_SOURCES.rc.nameProp], ''],
          },
        ],
      },
      center: NZ_CENTER,
      zoom: 5,
      maxBounds: NZ_BOUNDS,
      minZoom: 2,
      maxZoom: 14,
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

    for (const layer of ['rc-fill', 'ta-fill', 'sa2-fill']) {
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
  }, [setSelectedArea])

  // Lazy-load choropleth metrics only (KB), not full census tables
  useEffect(() => {
    const tier = tierForZoom(zoomLevel)
    const needed: GeographyTier[] = ['rc']
    if (tier === 'ta' || tier === 'sa2') needed.push('ta')
    if (tier === 'sa2') needed.push('sa2')
    void ensureMetrics(needed)
  }, [zoomLevel, ensureMetrics])

  // Layer visibility by zoom + toggles
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const showRc =
      showRegionalCouncils &&
      (zoomLevel < TA_ZOOM_THRESHOLD ||
        (!showTerritorialAuthorities && zoomLevel < SA2_ZOOM_THRESHOLD) ||
        (!showTerritorialAuthorities && !showSA2))
    const showTa =
      showTerritorialAuthorities &&
      zoomLevel >= TA_ZOOM_THRESHOLD &&
      (zoomLevel < SA2_ZOOM_THRESHOLD || !showSA2)
    const showSa2Layer = showSA2 && zoomLevel >= SA2_ZOOM_THRESHOLD

    // Prefer finest enabled tier
    let active: GeographyTier = 'rc'
    if (showSa2Layer) active = 'sa2'
    else if (showTa) active = 'ta'
    else if (showRc) active = 'rc'
    else if (showTerritorialAuthorities) active = 'ta'
    else if (showSA2) active = 'sa2'

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      const vis = tier === active ? 'visible' : 'none'
      if (map.getLayer(`${tier}-fill`)) map.setLayoutProperty(`${tier}-fill`, 'visibility', vis)
      if (map.getLayer(`${tier}-line`)) map.setLayoutProperty(`${tier}-line`, 'visibility', vis)
    }

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      if (!map.getLayer(`${tier}-line`)) continue
      const isActive =
        tier === active &&
        selectedArea &&
        selectedArea !== NATIONAL_KEY &&
        selectedArea !== nationalKey
      if (isActive) {
        map.setPaintProperty(`${tier}-line`, 'line-width', [
          'case',
          ['==', ['get', TILE_SOURCES[tier].nameProp], selectedArea],
          3,
          tier === 'sa2' ? 0.5 : 1,
        ])
        map.setPaintProperty(`${tier}-line`, 'line-color', [
          'case',
          ['==', ['get', TILE_SOURCES[tier].nameProp], selectedArea],
          '#000',
          '#444',
        ])
      } else {
        map.setPaintProperty(`${tier}-line`, 'line-width', tier === 'sa2' ? 0.5 : 1)
        map.setPaintProperty(`${tier}-line`, 'line-color', '#444')
      }
    }

    if (map.getLayer('selected-line')) {
      map.setLayoutProperty('selected-line', 'visibility', 'none')
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

    for (const tier of ['rc', 'ta', 'sa2'] as const) {
      const layerId = `${tier}-fill`
      if (!map.getLayer(layerId)) continue
      const nameProp = TILE_SOURCES[tier].nameProp
      map.setPaintProperty(layerId, 'fill-color', colorExpression(metrics, nameProp))
    }
  }, [metrics, mapReady])

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
      {loading && <div className="map-overlay-message">Loading map...</div>}
      {detailLoading && !loading && <div className="map-overlay-detail">Loading area...</div>}
      {error && <div className="map-overlay-error">Error: {error}</div>}
    </>
  )
}

export default MapView
