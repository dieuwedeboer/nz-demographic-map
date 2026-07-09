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

  // 100% = dark blue, 75% = medium blue, 50% = light blue
  if (percentage >= 50) {
    const t = (percentage - 50) / 50
    if (t < 0.5) {
      const u = t / 0.5
      return `rgb(${Math.round(120 + u * -90)}, ${Math.round(180 + u * -80)}, ${Math.round(240 + u * -40)})`
    }
    const u = (t - 0.5) / 0.5
    return `rgb(${Math.round(30 + u * -20)}, ${Math.round(100 + u * -70)}, ${Math.round(200 + u * -80)})`
  }

  // 50% = light blue, 25% = orange, 0% = dark brown
  if (percentage >= 25) {
    const t = (percentage - 25) / 25
    return `rgb(${Math.round(200 + t * -80)}, ${Math.round(110 + t * 70)}, ${Math.round(30 + t * 210)})`
  }
  const t = percentage / 25
  return `rgb(${Math.round(80 + t * 120)}, ${Math.round(30 + t * 80)}, ${Math.round(10 + t * 20)})`
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
