import { ageGroupSlug, normalizeName } from '../domain/geo'
import type { GeographyTier, RegionEntry } from '../domain/types'
import { assetUrl } from '../lib/paths'

export interface DataManifest {
  years: string[]
  ageGroups: string[]
  tiers: GeographyTier[]
  overlayMetrics?: string[]
  defaultOverlayMetric?: string
  nationalKey: string
  nationalSlug: string
  ethnicities: Record<string, string>
  areaCount: number
  preparedAt: string
}

export interface NameIndexEntry {
  name: string
  slug: string
  tier: string
  center?: [number, number] | null
}

export interface AreaDetail {
  name: string
  tier: string
  single: RegionEntry
  level3: RegionEntry | null
}

const cache = new Map<string, unknown>()
const inflight = new Map<string, Promise<unknown>>()

async function fetchJson<T>(url: string): Promise<T> {
  if (cache.has(url)) return cache.get(url) as T
  if (inflight.has(url)) return inflight.get(url) as Promise<T>

  const promise = fetch(url)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
      const contentType = res.headers.get('content-type') ?? ''
      // Vite falls through missing public assets to index.html (often 200 text/html).
      if (contentType.includes('text/html')) {
        throw new Error(
          `Failed to load ${url}: got HTML instead of JSON (missing asset or stale Vite public cache — restart the dev server after data:prepare)`,
        )
      }
      const data = (await res.json()) as T
      cache.set(url, data)
      return data
    })
    .finally(() => {
      inflight.delete(url)
    })

  inflight.set(url, promise)
  return promise
}

export async function loadManifest(): Promise<DataManifest> {
  return fetchJson<DataManifest>(assetUrl('data/prepared/manifest.json'))
}

export async function loadMetrics(
  tier: GeographyTier,
  year: string,
  ageGroup: string,
  overlayMetricId = 'european',
): Promise<Record<string, number>> {
  const ageSlug = ageGroupSlug(ageGroup)
  const metricSlug = overlayMetricId || 'european'
  return fetchJson<Record<string, number>>(
    assetUrl(`data/prepared/metrics/${tier}/${year}-${ageSlug}-${metricSlug}.json`),
  )
}

export async function loadNameIndex(): Promise<Map<string, NameIndexEntry>> {
  const obj = await fetchJson<Record<string, NameIndexEntry>>(
    assetUrl('data/prepared/name-index.json'),
  )
  return new Map(Object.entries(obj))
}

export async function loadAreaBySlug(slug: string): Promise<AreaDetail> {
  return fetchJson<AreaDetail>(assetUrl(`data/prepared/areas/${slug}.json`))
}

export async function loadNational(): Promise<AreaDetail> {
  return fetchJson<AreaDetail>(assetUrl('data/prepared/national.json'))
}

export function resolveIndexEntry(
  nameIndex: Map<string, NameIndexEntry>,
  name: string,
): NameIndexEntry | undefined {
  if (!name) return undefined
  return nameIndex.get(normalizeName(name))
}
