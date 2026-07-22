import type { EthnicityCounts, RegionData, RegionEntry } from './types'
import { SA2_ZOOM_THRESHOLD, TA_ZOOM_THRESHOLD } from './types'

export function normalizeName(name: string): string {
  if (!name) return ''
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function buildNameIndex(regionData: RegionData): Map<string, string> {
  const index = new Map<string, string>()
  for (const key of Object.keys(regionData)) {
    index.set(normalizeName(key), key)
  }
  return index
}

export function findRegionData(
  regionData: RegionData,
  regionName: string,
  nameIndex?: Map<string, string>,
): RegionEntry | null {
  if (!regionName) return null
  if (regionData[regionName]) return regionData[regionName]

  if (nameIndex) {
    const key = nameIndex.get(normalizeName(regionName))
    return key ? (regionData[key] ?? null) : null
  }

  const normalized = normalizeName(regionName)
  for (const key of Object.keys(regionData)) {
    if (normalizeName(key) === normalized) return regionData[key]
  }
  return null
}

export function getValue(data: EthnicityCounts | undefined, key: string): number {
  return data?.[key] ?? 0
}

export function ageGroupSlug(ageGroup: string): string {
  if (ageGroup === 'Total - age') return 'all'
  return ageGroup.replace(/\s+/g, '-').toLowerCase()
}

export function tierForZoom(zoom: number): 'rc' | 'ta' | 'sa2' {
  if (zoom >= SA2_ZOOM_THRESHOLD) return 'sa2'
  if (zoom >= TA_ZOOM_THRESHOLD) return 'ta'
  return 'rc'
}
