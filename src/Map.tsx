import maplibregl from 'maplibre-gl'
import { useEffect, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import AreaSearch, { type SearchHit } from './AreaSearch'
import ControlPanel from './ControlPanel'
import { useData } from './contexts/DataContext'
import { useTheme } from './contexts/ThemeContext'
import { ageGroupSlug, europeanFillColor, getEuropeanData } from './domain/geo'
import {
  type AgeGroup,
  type GeographyTier,
  NATIONAL_KEY,
  SA2_ZOOM_THRESHOLD,
  TA_ZOOM_THRESHOLD,
  TILE_SOURCES,
} from './domain/types'
import InfoPanel from './InfoPanel'
import { assetUrl } from './lib/paths'
import MapLegend from './MapLegend'
import { resolveIndexEntry } from './services/dataLoader'

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
const AREA_QUERY_PARAM = 'area'
const YEAR_QUERY_PARAM = 'year'
const AGE_QUERY_PARAM = 'age'
const BORDER_COLOR = '#2f2f2f'
const SELECTED_DOT_SPACING = 7
const SELECTED_DOT_RADIUS = 1
const MAP_BACKGROUND = {
  light: '#eef2f1',
  dark: '#101820',
} as const

function hasFineHoverPointer() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

function ensureFillLayer(map: maplibregl.Map, tier: GeographyTier) {
  const sourceId = tier
  const layerId = `${tier}-fill`
  if (!map.getSource(sourceId)) {
    map.addSource(sourceId, {
      type: 'geojson',
      data: assetUrl(`tiles/${tier}-fills.geojson`),
      buffer: 512,
      tolerance: 0,
      generateId: true,
    })
  }
  if (!map.getLayer(layerId)) {
    map.addLayer({
      id: layerId,
      type: 'fill',
      source: sourceId,
      paint: {
        'fill-color': hoverColorExpression('#888'),
        'fill-antialias': false,
      },
    })
  }
}

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
        'line-cap': 'round',
        'line-join': 'round',
      },
    })
  }
}

function ensureTierLayers(map: maplibregl.Map, tier: GeographyTier) {
  ensureFillLayer(map, tier)
  ensureBorderLayer(map, tier)
}

function removeLayerIfPresent(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId)
}

function removeSourceIfPresent(map: maplibregl.Map, sourceId: string) {
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

function removeTierLayers(map: maplibregl.Map, tier: GeographyTier) {
  removeLayerIfPresent(map, `${tier}-border`)
  removeLayerIfPresent(map, `${tier}-fill`)
  removeSourceIfPresent(map, `${tier}-borders`)
  removeSourceIfPresent(map, tier)
}

function loadedFillLayers(map: maplibregl.Map) {
  return ['national-fill', 'rc-fill', 'ta-fill', 'sa2-fill'].filter((layerId) =>
    map.getLayer(layerId),
  )
}

function tierFromFillLayer(layerId: string): GeographyTier | 'national' | null {
  if (layerId === 'national-fill') return 'national'
  if (layerId === 'rc-fill') return 'rc'
  if (layerId === 'ta-fill') return 'ta'
  if (layerId === 'sa2-fill') return 'sa2'
  return null
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

function isGeographyTier(value: string): value is GeographyTier {
  return value === 'rc' || value === 'ta' || value === 'sa2'
}

function zoomForTier(tier: GeographyTier) {
  if (tier === 'rc') return Math.max(5, TA_ZOOM_THRESHOLD - 1)
  if (tier === 'ta') return (TA_ZOOM_THRESHOLD + SA2_ZOOM_THRESHOLD) / 2
  return SA2_ZOOM_THRESHOLD + 2
}

function setShareUrlParams({
  slug,
  year,
  ageGroup,
  mode = 'push',
}: {
  slug: string | null
  year: string
  ageGroup: string
  mode?: 'push' | 'replace'
}) {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  if (slug) url.searchParams.set(AREA_QUERY_PARAM, slug)
  else url.searchParams.delete(AREA_QUERY_PARAM)
  if (year) url.searchParams.set(YEAR_QUERY_PARAM, year)
  if (ageGroup) url.searchParams.set(AGE_QUERY_PARAM, ageGroupSlug(ageGroup))

  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return

  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl)
}

function getUrlSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function ageGroupFromSlug(slug: string | null, availableAgeGroups: AgeGroup[]) {
  if (!slug) return null
  return availableAgeGroups.find((ageGroup) => ageGroupSlug(ageGroup) === slug) ?? null
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
    nameIndex,
    detailLoading,
  } = useData()
  const { theme } = useTheme()

  const containerRef = useRef<HTMLDivElement>(null)
  const selectedCanvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const nameIndexRef = useRef(nameIndex)
  const selectedYearRef = useRef(selectedYear)
  const selectedAgeGroupRef = useRef(selectedAgeGroup)
  const ensureMetricsRef = useRef(ensureMetrics)
  const appliedAreaSlugRef = useRef<string | null>(null)
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

  useEffect(() => {
    nameIndexRef.current = nameIndex
  }, [nameIndex])

  useEffect(() => {
    selectedYearRef.current = selectedYear
  }, [selectedYear])

  useEffect(() => {
    selectedAgeGroupRef.current = selectedAgeGroup
  }, [selectedAgeGroup])

  useEffect(() => {
    ensureMetricsRef.current = ensureMetrics
  }, [ensureMetrics])

  useEffect(() => {
    if (!mapReady || nameIndex.size === 0) return

    const applyAreaFromUrl = () => {
      const searchParams = getUrlSearchParams()
      const slug = searchParams.get(AREA_QUERY_PARAM)
      const year = searchParams.get(YEAR_QUERY_PARAM)
      const ageGroup = ageGroupFromSlug(searchParams.get(AGE_QUERY_PARAM), availableAgeGroups)
      const map = mapRef.current
      const nextYear = year && availableYears.includes(year) ? year : selectedYearRef.current
      const nextAgeGroup = ageGroup ?? selectedAgeGroupRef.current

      if (nextYear !== selectedYearRef.current) {
        selectedYearRef.current = nextYear
        setSelectedYear(nextYear)
      }
      if (nextAgeGroup !== selectedAgeGroupRef.current) {
        selectedAgeGroupRef.current = nextAgeGroup
        setSelectedAgeGroup(nextAgeGroup)
      }

      if (!slug) {
        appliedAreaSlugRef.current = null
        setSelectedArea(nationalKey)
        if (map) fitNzBounds(map)
        return
      }

      if (appliedAreaSlugRef.current === slug) return

      const entry = [...nameIndex.values()].find((item) => item.slug === slug)
      if (!entry || !isGeographyTier(entry.tier)) return

      appliedAreaSlugRef.current = slug
      void ensureMetricsRef.current([entry.tier], nextYear, nextAgeGroup)
      setSelectedArea(entry.name)
      if (map && entry.center) {
        const zoom = zoomForTier(entry.tier)
        setZoomLevel(zoom)
        map.jumpTo({
          center: entry.center,
          zoom,
        })
      }
    }

    applyAreaFromUrl()
    window.addEventListener('popstate', applyAreaFromUrl)
    return () => {
      window.removeEventListener('popstate', applyAreaFromUrl)
    }
  }, [
    availableAgeGroups,
    availableYears,
    mapReady,
    nameIndex,
    nationalKey,
    setSelectedAgeGroup,
    setSelectedArea,
    setSelectedYear,
  ])

  useEffect(() => {
    const slug = getUrlSearchParams().get(AREA_QUERY_PARAM)
    if (!slug) return
    setShareUrlParams({
      slug,
      year: selectedYear,
      ageGroup: selectedAgeGroup,
      mode: 'replace',
    })
  }, [selectedAgeGroup, selectedYear])

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
        },
        layers: [
          {
            id: 'background',
            type: 'background',
            paint: {
              'background-color': MAP_BACKGROUND.light,
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

    const leaveHandler = () => {
      map.getCanvas().style.cursor = ''
      clearHoveredFeature(map, hoveredFeature)
      hoveredFeature = null
      hoverPopup.remove()
    }
    const clearHoverOnTouch = (_event: TouchEvent) => {
      leaveHandler()
    }
    const clickHandler = (e: maplibregl.MapMouseEvent) => {
      const layers = loadedFillLayers(map)
      if (layers.length === 0) return
      const features = map.queryRenderedFeatures(e.point, { layers })
      const feature = features[0]
      const tier = tierFromFillLayer(feature?.layer.id ?? '')
      if (tier === 'national') {
        setSelectedArea(nationalKey)
        setShareUrlParams({
          slug: null,
          year: selectedYearRef.current,
          ageGroup: selectedAgeGroupRef.current,
        })
        leaveHandler()
        return
      }
      if (!tier) return

      const nameProp = TILE_SOURCES[tier].nameProp
      const name = feature?.properties?.[nameProp]
      if (typeof name === 'string' && name) {
        setSelectedArea(name)
        setShareUrlParams({
          slug: resolveIndexEntry(nameIndexRef.current, name)?.slug ?? null,
          year: selectedYearRef.current,
          ageGroup: selectedAgeGroupRef.current,
        })
      }
      leaveHandler()
    }
    const hoverHandler = (e: maplibregl.MapMouseEvent) => {
      if (!hasFineHoverPointer()) {
        leaveHandler()
        return
      }

      const layers = loadedFillLayers(map)
      if (layers.length === 0) {
        leaveHandler()
        return
      }
      const features = map.queryRenderedFeatures(e.point, { layers })
      const feature = features[0]
      const tier = tierFromFillLayer(feature?.layer.id ?? '')
      if (!tier || !feature) {
        leaveHandler()
        return
      }

      const nameProp = tier === 'national' ? 'name' : TILE_SOURCES[tier].nameProp
      const name = feature.properties?.[nameProp]
      if (typeof name !== 'string' || !name) {
        leaveHandler()
        return
      }

      map.getCanvas().style.cursor = 'pointer'
      if (feature.id === undefined || feature.id === null) {
        hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
        return
      }

      const nextHoveredFeature = { source: feature.source, id: feature.id }
      if (
        hoveredFeature?.source === nextHoveredFeature.source &&
        hoveredFeature.id === nextHoveredFeature.id
      ) {
        hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
        return
      }

      clearHoveredFeature(map, hoveredFeature)
      hoveredFeature = nextHoveredFeature
      map.setFeatureState(hoveredFeature, { hover: true })
      hoverPopup.setLngLat(e.lngLat).setText(name).addTo(map)
    }

    map.on('click', clickHandler)
    map.on('mousemove', hoverHandler)
    map.on('mouseout', leaveHandler)

    const canvas = map.getCanvas()
    canvas.addEventListener('touchend', clearHoverOnTouch)
    canvas.addEventListener('touchcancel', clearHoverOnTouch)

    mapRef.current = map
    return () => {
      canvas.removeEventListener('touchend', clearHoverOnTouch)
      canvas.removeEventListener('touchcancel', clearHoverOnTouch)
      map.off('click', clickHandler)
      map.off('mousemove', hoverHandler)
      map.off('mouseout', leaveHandler)
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

  // Keep only the active geography sources loaded (avoids fetching SA2 fills until needed).
  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    const showNational = !showRegionalCouncils && !showTerritorialAuthorities && !showSA2
    const active = activeTier

    if (map.getLayer('national-fill')) {
      map.setLayoutProperty('national-fill', 'visibility', showNational ? 'visible' : 'none')
    }
    if (map.getLayer('national-border')) {
      map.setLayoutProperty('national-border', 'visibility', showNational ? 'visible' : 'none')
    }

    for (const tier of GEOGRAPHY_TIERS) {
      if (active === tier) {
        ensureTierLayers(map, tier)
      } else {
        removeTierLayers(map, tier)
      }
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

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady || !map.getLayer('background')) return
    map.setPaintProperty('background', 'background-color', MAP_BACKGROUND[theme])
  }, [theme, mapReady])

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
    setShareUrlParams({ slug: hit.slug, year: selectedYear, ageGroup: selectedAgeGroup })
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
      <InfoPanel
        controls={
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
            embedded
          />
        }
      />
      <MapLegend />
      {loading && <div className="map-overlay-message">Loading map...</div>}
      {detailLoading && !loading && <div className="map-overlay-detail">Loading area...</div>}
      {error && <div className="map-overlay-error">Error: {error}</div>}
    </>
  )
}

export default MapView
