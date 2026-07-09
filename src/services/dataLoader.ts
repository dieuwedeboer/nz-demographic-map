import { ageGroupSlug, normalizeName } from '../domain/geo'
import type { GeographyTier, RegionEntry } from '../domain/types'

export interface DataManifest {
  years: string[]
  ageGroups: string[]
  tiers: GeographyTier[]
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

  const promise = fetch(url).then(async (res) => {
    if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`)
    const data = (await res.json()) as T
    cache.set(url, data)
    inflight.delete(url)
    return data
  })

  inflight.set(url, promise)
  return promise
}

export async function loadManifest(): Promise<DataManifest> {
  return fetchJson<DataManifest>('/data/prepared/manifest.json')
}

export async function loadMetrics(
  tier: GeographyTier,
  year: string,
  ageGroup: string,
): Promise<Record<string, number>> {
  const slug = ageGroupSlug(ageGroup)
  return fetchJson<Record<string, number>>(`/data/prepared/metrics/${tier}/${year}-${slug}.json`)
}

export async function loadNameIndex(): Promise<Map<string, NameIndexEntry>> {
  const obj = await fetchJson<Record<string, NameIndexEntry>>('/data/prepared/name-index.json')
  return new Map(Object.entries(obj))
}

export async function loadAreaBySlug(slug: string): Promise<AreaDetail> {
  return fetchJson<AreaDetail>(`/data/prepared/areas/${slug}.json`)
}

export async function loadNational(): Promise<AreaDetail> {
  return fetchJson<AreaDetail>('/data/prepared/national.json')
}

export function resolveIndexEntry(
  nameIndex: Map<string, NameIndexEntry>,
  name: string,
): NameIndexEntry | undefined {
  if (!name) return undefined
  return nameIndex.get(normalizeName(name))
}
