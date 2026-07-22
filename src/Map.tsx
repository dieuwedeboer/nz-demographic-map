import maplibregl from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import AreaSearch, { type SearchHit } from './AreaSearch'
import ControlPanel from './ControlPanel'
import { useData } from './contexts/DataContext'
import { useTheme } from './contexts/ThemeContext'
import { getOverlayMetric, getOverlayMetricData } from './domain/overlay'
import { overlayFillColor, overlayScaleDomain } from './domain/overlayColour'
import { displayAreaName } from './domain/geo'
import { type GeographyTier, NATIONAL_KEY, TILE_SOURCES } from './domain/types'
import InfoPanel from './InfoPanel'
import { assetUrl } from './lib/paths'
import {
  AGE_QUERY_PARAM,
  AREA_QUERY_PARAM,
  ageGroupFromSlug,
  getUrlSearchParams,
  METRIC_QUERY_PARAM,
  overlayIdFromParam,
  setShareUrlParams,
  YEAR_QUERY_PARAM,
} from './lib/shareUrl'
import MapLegend from './MapLegend'
import {
  activeGeographyTier,
  BORDER_COLOR,
  ensureTierLayers,
  loadedFillLayers,
  removeTierLayers,
  tierFromFillLayer,
  zoomForTier,
} from './map/layers'
import { colorExpression, hoverColorExpression } from './map/paint'
import {
  type BoundaryFeature,
  drawSelectedHatch,
  loadSelectedBoundaryFeature,
} from './map/selectionHatch'
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
const MAP_BACKGROUND = {
  light: '#eef2f1',
  dark: '#101820',
} as const

function hasFineHoverPointer() {
  return (
    typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches
  )
}

function fitNzBounds(map: maplibregl.Map, duration = 0) {
  map.fitBounds(NZ_FIT_BOUNDS, {
    padding: NZ_FIT_PADDING,
    duration,
  })
}

interface HoveredFeature {
  source: string
  id: string | number
}

function clearHoveredFeature(map: maplibregl.Map, hoveredFeature: HoveredFeature | null) {
  if (!hoveredFeature) return
  // Tier sources are lazy-loaded and removed on zoom; skip if already gone.
  if (!map.getSource(hoveredFeature.source)) return
  map.setFeatureState(hoveredFeature, { hover: false })
}

function isGeographyTier(value: string): value is GeographyTier {
  return value === 'rc' || value === 'ta' || value === 'sa2'
}

function MapView() {
  const {
    selectedArea,
    setSelectedArea,
    selectedYear,
    setSelectedYear,
    selectedAgeGroup,
    setSelectedAgeGroup,
    selectedOverlayId,
    setSelectedOverlayId,
    overlaySelection,
    setOverlaySelection,
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

  const colourScale = useMemo(
    () => overlayScaleDomain(selectedOverlayId, metrics),
    [metrics, selectedOverlayId],
  )

  const containerRef = useRef<HTMLDivElement>(null)
  const selectedCanvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const nameIndexRef = useRef(nameIndex)
  const selectedYearRef = useRef(selectedYear)
  const selectedAgeGroupRef = useRef(selectedAgeGroup)
  const selectedOverlayIdRef = useRef(selectedOverlayId)
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
    selectedOverlayIdRef.current = selectedOverlayId
  }, [selectedOverlayId])

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
      const nextOverlayId = overlayIdFromParam(searchParams.get(METRIC_QUERY_PARAM))
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
      if (nextOverlayId !== selectedOverlayIdRef.current) {
        selectedOverlayIdRef.current = nextOverlayId
        setSelectedOverlayId(nextOverlayId)
      }

      if (!slug) {
        appliedAreaSlugRef.current = null
        setSelectedArea(nationalKey, null)
        if (map) fitNzBounds(map)
        return
      }

      if (appliedAreaSlugRef.current === slug) return

      const entry = [...nameIndex.values()].find((item) => item.slug === slug)
      if (!entry || !isGeographyTier(entry.tier)) return

      appliedAreaSlugRef.current = slug
      void ensureMetricsRef.current([entry.tier], nextYear, nextAgeGroup)
      setSelectedArea(entry.name, entry.tier)
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
    setSelectedOverlayId,
    setSelectedYear,
  ])

  useEffect(() => {
    const slug = getUrlSearchParams().get(AREA_QUERY_PARAM)
    setShareUrlParams({
      slug,
      year: selectedYear,
      ageGroup: selectedAgeGroup,
      overlayId: selectedOverlayId,
      mode: 'replace',
    })
  }, [selectedAgeGroup, selectedOverlayId, selectedYear])

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
        setSelectedArea(nationalKey, null)
        setShareUrlParams({
          slug: null,
          year: selectedYearRef.current,
          ageGroup: selectedAgeGroupRef.current,
          overlayId: selectedOverlayIdRef.current,
        })
        leaveHandler()
        return
      }
      if (!tier) return

      const nameProp = TILE_SOURCES[tier].nameProp
      const name = feature?.properties?.[nameProp]
      if (typeof name === 'string' && name) {
        setSelectedArea(name, tier)
        setShareUrlParams({
          slug: resolveIndexEntry(nameIndexRef.current, name)?.slug ?? null,
          year: selectedYearRef.current,
          ageGroup: selectedAgeGroupRef.current,
          overlayId: selectedOverlayIdRef.current,
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

      const label = displayAreaName(name, tier === 'national' ? null : tier)
      map.getCanvas().style.cursor = 'pointer'
      if (feature.id === undefined || feature.id === null) {
        hoverPopup.setLngLat(e.lngLat).setText(label).addTo(map)
        return
      }

      const nextHoveredFeature = { source: feature.source, id: feature.id }
      if (
        hoveredFeature?.source === nextHoveredFeature.source &&
        hoveredFeature.id === nextHoveredFeature.id
      ) {
        hoverPopup.setLngLat(e.lngLat).setText(label).addTo(map)
        return
      }

      clearHoveredFeature(map, hoveredFeature)
      hoveredFeature = nextHoveredFeature
      if (map.getSource(hoveredFeature.source)) {
        map.setFeatureState(hoveredFeature, { hover: true })
      }
      hoverPopup.setLngLat(e.lngLat).setText(label).addTo(map)
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

    const overlay = getOverlayMetric(selectedOverlayId)
    const nationalEntry =
      overlay.source === 'level3'
        ? (nationalDetail?.level3 ?? null)
        : (nationalDetail?.single ?? null)
    const nationalMetric = getOverlayMetricData(
      nationalEntry,
      selectedYear,
      selectedAgeGroup,
      selectedOverlayId,
    )
    if (map.getLayer('national-fill')) {
      map.setPaintProperty(
        'national-fill',
        'fill-color',
        hoverColorExpression(
          overlayFillColor(
            nationalMetric?.percentage,
            selectedOverlayId,
            colourScale.min,
            colourScale.max,
          ),
        ),
      )
    }

    for (const tier of GEOGRAPHY_TIERS) {
      const layerId = `${tier}-fill`
      if (!map.getLayer(layerId)) continue
      const nameProp = TILE_SOURCES[tier].nameProp
      map.setPaintProperty(
        layerId,
        'fill-color',
        colorExpression(metrics, nameProp, selectedOverlayId, colourScale),
      )
    }
  }, [
    metrics,
    mapReady,
    nationalDetail,
    selectedYear,
    selectedAgeGroup,
    selectedOverlayId,
    colourScale,
  ])

  const flyToSearch = (hit: SearchHit, zoom: number) => {
    setSelectedArea(hit.name, hit.tier)
    setShareUrlParams({
      slug: hit.slug,
      year: selectedYear,
      ageGroup: selectedAgeGroup,
      overlayId: selectedOverlayId,
    })
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
            overlaySelection={overlaySelection}
            onOverlaySelectionChange={setOverlaySelection}
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
      <MapLegend
        overlayId={selectedOverlayId}
        scaleMin={colourScale.min}
        scaleMax={colourScale.max}
      />
      {loading && <div className="map-overlay-message">Loading map...</div>}
      {detailLoading && !loading && <div className="map-overlay-detail">Loading area...</div>}
      {error && <div className="map-overlay-error">Error: {error}</div>}
    </>
  )
}

export default MapView
