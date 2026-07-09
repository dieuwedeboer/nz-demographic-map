import type { EthnicityCounts, EuropeanMetric, RegionData, RegionEntry } from './types'

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

export function getEuropeanData(
  regionEntry: RegionEntry | null,
  year: string,
  ageGroup = 'Total - age',
): EuropeanMetric | null {
  if (!regionEntry || !year) return null
  const yearData = regionEntry.ethnicityData[year]
  if (!yearData) return null
  const ageData = yearData[ageGroup] || yearData['Total - age']
  if (!ageData) return null

  const total = ageData['Total stated - ethnicity']
  if (typeof total !== 'number' || total <= 0) return null

  const european = ageData['European only'] || 0
  return {
    count: european,
    percentage: (european / total) * 100,
  }
}

export function europeanFillColor(percentage?: number): string {
  if (percentage === undefined || Number.isNaN(percentage)) {
    return '#888'
  }

  if (percentage > 70) {
    const t = Math.min((percentage - 70) / 30, 1)
    return `rgb(${Math.round(30 + t * 100)}, ${Math.round(120 + t * 120)}, ${Math.round(220 + t * 30)})`
  }
  if (percentage >= 50) {
    const t = (percentage - 50) / 20
    return `rgb(${Math.round(30)}, ${Math.round(100 + t * 20)}, ${Math.round(200 + t * 20)})`
  }
  const t = percentage / 50
  return `rgb(${Math.round(180 * (1 - t) + 30 * t)}, ${Math.round(120 * (1 - t) + 40 * t)}, ${Math.round(80 * (1 - t) + 30 * t)})`
}

export function getValue(data: EthnicityCounts | undefined, key: string): number {
  return data?.[key] ?? 0
}

export function ageGroupSlug(ageGroup: string): string {
  if (ageGroup === 'Total - age') return 'all'
  return ageGroup.replace(/\s+/g, '-').toLowerCase()
}

export function tierForZoom(zoom: number): 'rc' | 'ta' | 'sa2' {
  if (zoom >= 11) return 'sa2'
  if (zoom >= 8) return 'ta'
  return 'rc'
}
