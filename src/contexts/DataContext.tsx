import type { ReactNode } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  getOverlayMetric,
  metricIdFromSelection,
  type OverlaySelection,
  selectionFromMetricId,
} from '../domain/overlay'
import {
  AGE_GROUPS,
  type AgeGroup,
  type GeographyTier,
  NATIONAL_KEY,
  type RegionData,
  type UnifiedData,
} from '../domain/types'
import {
  AGE_QUERY_PARAM,
  ageGroupFromSlug,
  METRIC_QUERY_PARAM,
  overlayIdFromParam,
  YEAR_QUERY_PARAM,
} from '../lib/shareUrl'
import {
  type AreaDetail,
  type DataManifest,
  loadAreaBySlug,
  loadManifest,
  loadMetricsPack,
  loadNameIndex,
  loadNational,
  type MetricsPack,
  type NameIndexEntry,
  resolveIndexEntry,
} from '../services/dataLoader'

function isGeographyTier(value: string | undefined | null): value is GeographyTier {
  return value === 'rc' || value === 'ta' || value === 'sa2'
}

interface DataContextType {
  selectedArea: string
  /**
   * Select an area. Pass `tier` when known (map click, search, URL) so display
   * labels like "Auckland Region" work. Omit to infer from name index.
   */
  setSelectedArea: (area: string, tier?: GeographyTier | null) => void
  /** Geography tier for the current selection; null at national view. */
  selectedTier: GeographyTier | null
  selectedYear: string
  setSelectedYear: (year: string) => void
  selectedAgeGroup: AgeGroup
  setSelectedAgeGroup: (age: AgeGroup) => void
  /** Canonical map-colour selection (group + detail + include dual). */
  overlaySelection: OverlaySelection
  setOverlaySelection: (selection: OverlaySelection) => void
  /** Derived metric id used for metrics load + share URLs. */
  selectedOverlayId: string
  setSelectedOverlayId: (overlayId: string) => void
  availableYears: string[]
  availableAgeGroups: AgeGroup[]
  metrics: Record<string, number>
  nameIndex: Map<string, NameIndexEntry>
  loading: boolean
  detailLoading: boolean
  error: string | null
  ensureMetrics: (tiers: GeographyTier[], year?: string, ageGroup?: AgeGroup) => Promise<void>
  nationalKey: string
  nationalDetail: AreaDetail | null
  manifest: DataManifest | null
  selectedDetail: AreaDetail | null
  regionData: RegionData
  unifiedData: UnifiedData
}

const DataContext = createContext<DataContextType | undefined>(undefined)

function packKey(tier: GeographyTier, year: string, age: string) {
  return `${tier}|${year}|${age}`
}

function initialSearchParams() {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

export function useData() {
  const context = useContext(DataContext)
  if (!context) throw new Error('useData must be used within a DataProvider')
  return context
}

export function DataProvider({ children }: { children: ReactNode }) {
  const initialUrlYear = useMemo(() => initialSearchParams().get(YEAR_QUERY_PARAM), [])
  const initialUrlAge = useMemo(() => initialSearchParams().get(AGE_QUERY_PARAM), [])
  const initialUrlMetric = useMemo(() => initialSearchParams().get(METRIC_QUERY_PARAM), [])
  const initialAgeGroup = ageGroupFromSlug(initialUrlAge, AGE_GROUPS)
  const [metricsPacksByKey, setMetricsPacksByKey] = useState<Record<string, MetricsPack>>({})
  const packsLoadedRef = useRef<Set<string>>(new Set())
  const areaCacheRef = useRef<Map<string, AreaDetail>>(new Map())

  const [nameIndex, setNameIndex] = useState<Map<string, NameIndexEntry>>(new Map())
  const [manifest, setManifest] = useState<DataManifest | null>(null)
  const [selectedArea, setSelectedAreaState] = useState(NATIONAL_KEY)
  const [selectedTier, setSelectedTier] = useState<GeographyTier | null>(null)
  const [selectedYear, setSelectedYear] = useState(initialUrlYear || '2023')
  const [selectedAgeGroup, setSelectedAgeGroup] = useState<AgeGroup>(
    initialAgeGroup || 'Total - age',
  )
  const [overlaySelection, setOverlaySelectionState] = useState<OverlaySelection>(() =>
    selectionFromMetricId(overlayIdFromParam(initialUrlMetric)),
  )
  const selectedOverlayId = metricIdFromSelection(overlaySelection)

  const setOverlaySelection = useCallback((next: OverlaySelection) => {
    setOverlaySelectionState(next)
  }, [])

  const setSelectedOverlayId = useCallback((overlayId: string) => {
    setOverlaySelectionState((prev) => selectionFromMetricId(overlayId, prev))
  }, [])

  const setSelectedArea = useCallback(
    (area: string, tier?: GeographyTier | null) => {
      setSelectedAreaState(area)
      if (tier !== undefined) {
        setSelectedTier(tier)
        return
      }
      const entry = resolveIndexEntry(nameIndex, area)
      setSelectedTier(isGeographyTier(entry?.tier) ? entry.tier : null)
    },
    [nameIndex],
  )

  const [selectedDetail, setSelectedDetail] = useState<AreaDetail | null>(null)
  const [nationalDetail, setNationalDetail] = useState<AreaDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeMetricTiers, setActiveMetricTiers] = useState<GeographyTier[]>(['rc'])

  const ensureMetrics = useCallback(
    async (tiers: GeographyTier[], year = selectedYear, ageGroup = selectedAgeGroup) => {
      setActiveMetricTiers(tiers)
      if (!year) return

      const missing = tiers.filter(
        (tier) => !packsLoadedRef.current.has(packKey(tier, year, ageGroup)),
      )
      if (missing.length === 0) return

      const results = await Promise.all(
        missing.map(async (tier) => {
          const pack = await loadMetricsPack(tier, year, ageGroup)
          return { tier, pack }
        }),
      )

      for (const r of results) {
        packsLoadedRef.current.add(packKey(r.tier, year, ageGroup))
      }

      setMetricsPacksByKey((prev) => {
        const next = { ...prev }
        for (const r of results) {
          next[packKey(r.tier, year, ageGroup)] = r.pack
        }
        return next
      })
    },
    [selectedYear, selectedAgeGroup],
  )

  // Bootstrap: manifest + name index + national detail + RC metrics pack
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [man, index, national] = await Promise.all([
          loadManifest(),
          loadNameIndex(),
          loadNational(),
        ])
        if (cancelled) return
        setManifest(man)
        setNameIndex(index)
        setNationalDetail(national)
        areaCacheRef.current.set(national.name, national)
        setSelectedDetail(national)
        setSelectedAreaState(man.nationalKey || NATIONAL_KEY)
        setSelectedTier(null)
        const urlAgeGroup = ageGroupFromSlug(
          initialUrlAge,
          (man.ageGroups as AgeGroup[]) ?? AGE_GROUPS,
        )
        const year =
          initialUrlYear && man.years.includes(initialUrlYear)
            ? initialUrlYear
            : man.years[man.years.length - 1] || '2023'
        const ageGroup = urlAgeGroup || 'Total - age'
        const overlayId = overlayIdFromParam(initialUrlMetric)
        setSelectedYear(year)
        setSelectedAgeGroup(ageGroup)
        setOverlaySelectionState(selectionFromMetricId(overlayId))
        const rcPack = await loadMetricsPack('rc', year, ageGroup)
        if (cancelled) return
        packsLoadedRef.current.add(packKey('rc', year, ageGroup))
        setMetricsPacksByKey({ [packKey('rc', year, ageGroup)]: rcPack })
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [initialUrlAge, initialUrlMetric, initialUrlYear])

  // Reload metrics packs when year/age changes for active tiers
  useEffect(() => {
    if (loading) return
    void ensureMetrics(activeMetricTiers)
  }, [loading, ensureMetrics, activeMetricTiers])

  // Load area detail on selection (~40KB)
  useEffect(() => {
    let cancelled = false
    const areaName = selectedArea
    if (!areaName) return

    const cached = areaCacheRef.current.get(areaName)
    if (cached) {
      setSelectedDetail(cached)
      return
    }

    const entry = resolveIndexEntry(nameIndex, areaName)
    if (!entry && nameIndex.size === 0) return

    ;(async () => {
      setDetailLoading(true)
      try {
        let detail: AreaDetail
        if (entry) {
          detail = await loadAreaBySlug(entry.slug)
        } else if (manifest?.nationalSlug) {
          detail = await loadAreaBySlug(manifest.nationalSlug)
        } else {
          detail = await loadNational()
        }
        if (cancelled) return
        areaCacheRef.current.set(detail.name, detail)
        areaCacheRef.current.set(areaName, detail)
        setSelectedDetail(detail)
      } catch (err) {
        console.error('Failed to load area detail', err)
      } finally {
        if (!cancelled) setDetailLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedArea, nameIndex, manifest])

  const metrics = useMemo(() => {
    const metricId = getOverlayMetric(selectedOverlayId).id
    const parts: Record<string, number>[] = []
    for (const tier of activeMetricTiers) {
      const key = packKey(tier, selectedYear, selectedAgeGroup)
      const pack = metricsPacksByKey[key]
      if (pack?.[metricId]) parts.push(pack[metricId])
    }
    return Object.assign({}, ...parts)
  }, [activeMetricTiers, metricsPacksByKey, selectedYear, selectedAgeGroup, selectedOverlayId])

  const regionData = useMemo<RegionData>(() => {
    if (!selectedDetail) return {}
    return { [selectedDetail.name]: selectedDetail.single }
  }, [selectedDetail])

  const unifiedData = useMemo<UnifiedData>(() => {
    if (!selectedDetail) {
      return { detailedSingle: {}, level3: {} }
    }
    return {
      detailedSingle: { [selectedDetail.name]: selectedDetail.single },
      level3: selectedDetail.level3 ? { [selectedDetail.name]: selectedDetail.level3 } : {},
    }
  }, [selectedDetail])

  const availableYears = manifest?.years ?? ['2013', '2018', '2023']
  const availableAgeGroups = (manifest?.ageGroups as AgeGroup[]) ?? AGE_GROUPS

  const value: DataContextType = {
    selectedArea,
    setSelectedArea,
    selectedTier,
    selectedYear,
    setSelectedYear,
    selectedAgeGroup,
    setSelectedAgeGroup,
    overlaySelection,
    setOverlaySelection,
    selectedOverlayId,
    setSelectedOverlayId,
    availableYears,
    availableAgeGroups,
    metrics,
    nameIndex,
    loading,
    detailLoading,
    error,
    ensureMetrics,
    nationalKey: manifest?.nationalKey ?? NATIONAL_KEY,
    nationalDetail,
    manifest,
    selectedDetail,
    regionData,
    unifiedData,
  }

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useSelectedRegionData() {
  const { selectedDetail } = useData()
  return selectedDetail?.single ?? null
}
