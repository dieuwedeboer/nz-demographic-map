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
// Wide enough for all of NZ including Chathams when fitting the national view.
const NZ_FIT_BOUNDS: [[number, number], [number, number]] = [
  [160.0, -50.0],
  [185.0, -32.0],
]
const NZ_NAVIGATION_BOUNDS: [[number, number], [number, number]] = [
  [130.0, -65.0],
  [210.0, -15.0],
]
const NZ_FIT_PADDING = 32
const GEOGRAPHY_TIERS: GeographyTier[] = ['rc', 'ta', 'sa2']
const BORDER_COLOR = '#2f2f2f'
const SELECTED_DOT_SPACING = 7
const SELECTED_DOT_RADIUS = 1

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
    map.addLayer({
      id: layerId,
      type: 'line',
      source: sourceId,
      paint: {
        'line-color': BORDER_COLOR,
        'line-width': borderLineWidth(tier),
      },
      layout: {
        visibility: 'none',
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }
}

function fitNzBounds(map: maplibregl.Map, duration = 0) {
  map.fitBounds(NZ_FIT_BOUNDS, {
    padding: NZ_FIT_PADDING,
    duration,
  })
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

function colorExpression(
  metrics: Record<string, number>,
  nameProp: string,
): maplibregl.ExpressionSpecification {
  const entries = Object.entries(metrics)
  if (entries.length === 0) return hoverColorExpression('#888')

  const matchExpr: unknown[] = ['match', ['get', nameProp]]
  const hoverMatchExpr: unknown[] = ['match', ['get', nameProp]]
  for (const [name, pct] of entries) {
    const color = europeanFillColor(pct)
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

function hoverColorExpression(
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
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const value =
      hex[1].length === 3
        ? hex[1]
            .split('')
            .map((character) => character + character)
            .join('')
        : hex[1]
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ]
  }

  const rgb = color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/)
  if (!rgb) return null
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
}

interface HoveredFeature {
  source: string
  id: string | number
}

type Position = [number, number]
type PolygonCoordinates = Position[][]
type MultiPolygonCoordinates = PolygonCoordinates[]

interface BoundaryFeature {
  type: 'Feature'
  properties: Record<string, unknown>
  geometry: {
    type: 'Polygon' | 'MultiPolygon'
    coordinates: PolygonCoordinates | MultiPolygonCoordinates
  }
}

interface BoundaryFeatureCollection {
  type: 'FeatureCollection'
  features: BoundaryFeature[]
}

const boundaryCache = new Map<GeographyTier, Promise<BoundaryFeatureCollection>>()

function loadBoundaryCollection(tier: GeographyTier) {
  const cached = boundaryCache.get(tier)
  if (cached) return cached

  const promise = fetch(assetUrl(`tiles/${tier}-fills.geojson`)).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Failed to load selected geometry for ${tier}: ${response.status}`)
    }
    return (await response.json()) as BoundaryFeatureCollection
  })
  boundaryCache.set(tier, promise)
  return promise
}

async function loadSelectedBoundaryFeature(tier: GeographyTier, name: string) {
  const collection = await loadBoundaryCollection(tier)
  const nameProp = TILE_SOURCES[tier].nameProp
  return collection.features.find((feature) => feature.properties?.[nameProp] === name) ?? null
}

function drawSelectedHatch(
  map: maplibregl.Map,
  canvas: HTMLCanvasElement,
  feature: BoundaryFeature | null,
) {
  const mapCanvas = map.getCanvas()
  const width = mapCanvas.clientWidth
  const height = mapCanvas.clientHeight
  const pixelRatio = window.devicePixelRatio || 1

  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`
  canvas.width = Math.max(1, Math.round(width * pixelRatio))
  canvas.height = Math.max(1, Math.round(height * pixelRatio))

  const context = canvas.getContext('2d')
  if (!context) return

  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
  context.clearRect(0, 0, width, height)
  if (!feature) return

  context.save()
  context.beginPath()
  forEachPolygon(feature, (polygon) => {
    for (const ring of polygon) {
      ring.forEach((coordinate, index) => {
        const point = map.project(normalizeMapCoordinate(coordinate))
        if (index === 0) context.moveTo(point.x, point.y)
        else context.lineTo(point.x, point.y)
      })
      context.closePath()
    }
  })
  context.clip('evenodd')

  context.fillStyle = BORDER_COLOR
  const centerX = width / 2
  const centerY = height / 2
  const angle = (-map.getBearing() * Math.PI) / 180
  const anchor = map.project([180, 0])
  const localAnchor = rotatePoint(anchor.x - centerX, anchor.y - centerY, -angle)
  const extent = Math.hypot(width, height)
  const startX = gridStart(localAnchor.x, -extent, SELECTED_DOT_SPACING)
  const startY = gridStart(localAnchor.y, -extent, SELECTED_DOT_SPACING)

  context.translate(centerX, centerY)
  context.rotate(angle)

  for (let y = startY; y < extent; y += SELECTED_DOT_SPACING) {
    for (let x = startX; x < extent; x += SELECTED_DOT_SPACING) {
      context.beginPath()
      context.arc(x, y, SELECTED_DOT_RADIUS, 0, Math.PI * 2)
      context.fill()
    }
  }
  context.restore()
}

function rotatePoint(x: number, y: number, angle: number) {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }
}

function gridStart(anchor: number, min: number, spacing: number) {
  return anchor + Math.floor((min - anchor) / spacing) * spacing
}

function forEachPolygon(feature: BoundaryFeature, callback: (polygon: PolygonCoordinates) => void) {
  if (feature.geometry.type === 'Polygon') {
    callback(feature.geometry.coordinates as PolygonCoordinates)
    return
  }

  for (const polygon of feature.geometry.coordinates as MultiPolygonCoordinates) {
    callback(polygon)
  }
}

function normalizeMapCoordinate([lng, lat]: Position): maplibregl.LngLatLike {
  return [lng < 0 ? lng + 360 : lng, lat]
}

function clearHoveredFeature(map: maplibregl.Map, hoveredFeature: HoveredFeature | null) {
  if (!hoveredFeature) return
  map.setFeatureState(hoveredFeature, { hover: false })
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
  const selectedCanvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [zoomLevel, setZoomLevel] = useState(6)
  const [mapReady, setMapReady] = useState(false)
  const [selectedFeature, setSelectedFeature] = useState<BoundaryFeature | null>(null)
  const [showRegionalCouncils, setShowRegionalCouncils] = useState(true)
  const [showTerritorialAuthorities, setShowTerritorialAuthorities] = useState(true)
  const [showSA2, setShowSA2] = useState(true)
  const activeTier = activeGeographyTier(
    zoomLevel,
    showRegionalCouncils,
    showTerritorialAuthorities,
    showSA2,
  )

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
            generateId: true,
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
            generateId: true,
          },
          ta: {
            type: 'geojson',
            data: assetUrl('tiles/ta-fills.geojson'),
            buffer: 512,
            tolerance: 0,
            generateId: true,
          },
          sa2: {
            type: 'geojson',
            data: assetUrl('tiles/sa2-fills.geojson'),
            buffer: 512,
            tolerance: 0,
            generateId: true,
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
              'fill-color': hoverColorExpression('#888'),
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'national-border',
            type: 'line',
            source: 'national-borders',
            paint: {
              'line-color': BORDER_COLOR,
              'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.5, 6, 0.9, 9, 1.2],
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
              'fill-color': hoverColorExpression('#888'),
              'fill-antialias': false,
            },
          },
          {
            id: 'ta-fill',
            type: 'fill',
            source: 'ta',
            paint: {
              'fill-color': hoverColorExpression('#888'),
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
          {
            id: 'sa2-fill',
            type: 'fill',
            source: 'sa2',
            paint: {
              'fill-color': hoverColorExpression('#888'),
              'fill-antialias': false,
            },
            layout: { visibility: 'none' },
          },
        ],
      },
      center: NZ_CENTER,
      zoom: 5,
      maxBounds: NZ_NAVIGATION_BOUNDS,
      minZoom: 1,
      maxZoom: 14,
      attributionControl: false,
      fadeDuration: 0,
    })

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left')

    map.on('load', () => {
      fitNzBounds(map)
      setMapReady(true)
      setZoomLevel(map.getZoom())
    })

    map.on('zoomend', () => setZoomLevel(map.getZoom()))
    const hoverPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 12,
      className: 'area-hover-popup',
    })
    let hoveredFeature: HoveredFeature | null = null

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
    const hoverHandler =
      (source: string, nameProp: string) => (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        const name = feature?.properties?.[nameProp]
        if (typeof name !== 'string' || !name) return
        if (feature.id === undefined || feature.id === null) {
          hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
          return
        }

        const nextHoveredFeature = { source, id: feature.id }
        if (
          hoveredFeature?.source === nextHoveredFeature.source &&
          hoveredFeature.id === nextHoveredFeature.id
        ) {
          return
        }

        clearHoveredFeature(map, hoveredFeature)
        hoveredFeature = nextHoveredFeature
        map.setFeatureState(hoveredFeature, { hover: true })
        hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
      }
    const leaveHandler = () => {
      map.getCanvas().style.cursor = ''
      clearHoveredFeature(map, hoveredFeature)
      hoveredFeature = null
      hoverPopup.remove()
    }

    map.on('click', 'rc-fill', clickHandler('rc'))
    map.on('click', 'ta-fill', clickHandler('ta'))
    map.on('click', 'sa2-fill', clickHandler('sa2'))
    map.on('click', 'national-fill', () => setSelectedArea(nationalKey))

    map.on('mousemove', 'national-fill', hoverHandler('national', 'name'))
    map.on('mousemove', 'rc-fill', hoverHandler('rc', TILE_SOURCES.rc.nameProp))
    map.on('mousemove', 'ta-fill', hoverHandler('ta', TILE_SOURCES.ta.nameProp))
    map.on('mousemove', 'sa2-fill', hoverHandler('sa2', TILE_SOURCES.sa2.nameProp))

    for (const layer of ['national-fill', 'rc-fill', 'ta-fill', 'sa2-fill']) {
      map.on('mouseenter', layer, () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', layer, leaveHandler)
    }

    mapRef.current = map
    return () => {
      hoverPopup.remove()
      map.remove()
      mapRef.current = null
    }
  }, [setSelectedArea, nationalKey])

  // Lazy-load choropleth metrics only (KB), not full census tables
  useEffect(() => {
    void ensureMetrics(activeTier ? [activeTier] : [])
  }, [activeTier, ensureMetrics])

  useEffect(() => {
    let cancelled = false
    const isAreaSelection =
      activeTier && selectedArea && selectedArea !== NATIONAL_KEY && selectedArea !== nationalKey

    if (!isAreaSelection) {
      setSelectedFeature(null)
      return
    }

    loadSelectedBoundaryFeature(activeTier, selectedArea)
      .then((feature) => {
        if (!cancelled) setSelectedFeature(feature)
      })
      .catch((error) => {
        console.error('Failed to load selected area geometry', error)
        if (!cancelled) setSelectedFeature(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeTier, selectedArea, nationalKey])

  // Layer visibility by zoom + toggles
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const showNational = !showRegionalCouncils && !showTerritorialAuthorities && !showSA2
    const active = activeTier

    if (active) ensureBorderLayer(map, active)

    if (map.getLayer('national-fill')) {
      map.setLayoutProperty('national-fill', 'visibility', showNational ? 'visible' : 'none')
    }
    if (map.getLayer('national-border')) {
      map.setLayoutProperty('national-border', 'visibility', showNational ? 'visible' : 'none')
    }
    for (const tier of GEOGRAPHY_TIERS) {
      const vis = active === tier ? 'visible' : 'none'
      if (map.getLayer(`${tier}-fill`)) map.setLayoutProperty(`${tier}-fill`, 'visibility', vis)
      if (map.getLayer(`${tier}-border`)) map.setLayoutProperty(`${tier}-border`, 'visibility', vis)
    }
  }, [activeTier, showRegionalCouncils, showTerritorialAuthorities, showSA2, mapReady])

  useEffect(() => {
    const map = mapRef.current
    const container = containerRef.current
    if (!map || !container || !mapReady) return

    let frame = 0
    const resize = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        map.resize()
        const canvas = selectedCanvasRef.current
        if (canvas) drawSelectedHatch(map, canvas, selectedFeature)
      })
    }

    const observer = new ResizeObserver(resize)
    observer.observe(container)
    window.addEventListener('resize', resize)
    resize()

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', resize)
    }
  }, [mapReady, selectedFeature])

  useEffect(() => {
    const map = mapRef.current
    const canvas = selectedCanvasRef.current
    if (!map || !canvas || !mapReady) return

    const redraw = () => drawSelectedHatch(map, canvas, selectedFeature)
    redraw()

    map.on('move', redraw)
    map.on('resize', redraw)
    return () => {
      map.off('move', redraw)
      map.off('resize', redraw)
    }
  }, [mapReady, selectedFeature])

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
        hoverColorExpression(europeanFillColor(nationalMetric?.percentage)),
      )
    }

    for (const tier of GEOGRAPHY_TIERS) {
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
      <div style={{ position: 'absolute', inset: 0 }}>
        <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
        <canvas
          ref={selectedCanvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 1,
          }}
        />
      </div>
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
