import type maplibregl from 'maplibre-gl'
import type { GeographyTier } from '../domain/types'
import { SA2_ZOOM_THRESHOLD, TA_ZOOM_THRESHOLD } from '../domain/types'
import { assetUrl } from '../lib/paths'
import { hoverColorExpression } from './paint'

export const BORDER_COLOR = '#2f2f2f'

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

export function ensureTierLayers(map: maplibregl.Map, tier: GeographyTier) {
  ensureFillLayer(map, tier)
  ensureBorderLayer(map, tier)
}

function removeLayerIfPresent(map: maplibregl.Map, layerId: string) {
  if (map.getLayer(layerId)) map.removeLayer(layerId)
}

function removeSourceIfPresent(map: maplibregl.Map, sourceId: string) {
  if (map.getSource(sourceId)) map.removeSource(sourceId)
}

export function removeTierLayers(map: maplibregl.Map, tier: GeographyTier) {
  removeLayerIfPresent(map, `${tier}-border`)
  removeLayerIfPresent(map, `${tier}-fill`)
  removeSourceIfPresent(map, `${tier}-borders`)
  removeSourceIfPresent(map, tier)
}

export function loadedFillLayers(map: maplibregl.Map) {
  return ['national-fill', 'rc-fill', 'ta-fill', 'sa2-fill'].filter((layerId) =>
    map.getLayer(layerId),
  )
}

export function tierFromFillLayer(layerId: string): GeographyTier | 'national' | null {
  if (layerId === 'national-fill') return 'national'
  if (layerId === 'rc-fill') return 'rc'
  if (layerId === 'ta-fill') return 'ta'
  if (layerId === 'sa2-fill') return 'sa2'
  return null
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

export function activeGeographyTier(
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

export function zoomForTier(tier: GeographyTier) {
  if (tier === 'rc') return Math.max(5, TA_ZOOM_THRESHOLD - 1)
  if (tier === 'ta') return (TA_ZOOM_THRESHOLD + SA2_ZOOM_THRESHOLD) / 2
  return SA2_ZOOM_THRESHOLD + 2
}
