import type maplibregl from 'maplibre-gl'
import type { GeographyTier } from '../domain/types'
import { TILE_SOURCES } from '../domain/types'
import { assetUrl } from '../lib/paths'
import { BORDER_COLOR } from './layers'

const SELECTED_DOT_SPACING = 7
const SELECTED_DOT_RADIUS = 1

type Position = [number, number]
type PolygonCoordinates = Position[][]
type MultiPolygonCoordinates = PolygonCoordinates[]

export interface BoundaryFeature {
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

export async function loadSelectedBoundaryFeature(tier: GeographyTier, name: string) {
  const collection = await loadBoundaryCollection(tier)
  const nameProp = TILE_SOURCES[tier].nameProp
  return collection.features.find((feature) => feature.properties?.[nameProp] === name) ?? null
}

export function drawSelectedHatch(
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
