import { ageGroupSlug } from '../domain/geo'
import { DEFAULT_OVERLAY_ID, getOverlayMetric } from '../domain/overlay'
import type { AgeGroup } from '../domain/types'

export const AREA_QUERY_PARAM = 'area'
export const YEAR_QUERY_PARAM = 'year'
export const AGE_QUERY_PARAM = 'age'
export const METRIC_QUERY_PARAM = 'metric'

export function getUrlSearchParams(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

export function ageGroupFromSlug(
  slug: string | null,
  availableAgeGroups: readonly AgeGroup[],
): AgeGroup | null {
  if (!slug) return null
  return availableAgeGroups.find((ageGroup) => ageGroupSlug(ageGroup) === slug) ?? null
}

export function overlayIdFromParam(param: string | null): string {
  if (!param) return DEFAULT_OVERLAY_ID
  return getOverlayMetric(param).id
}

/** Build a shareable absolute URL (or empty string off-window). */
export function shareUrlForState({
  slug,
  year,
  ageGroup,
  overlayId,
}: {
  slug: string | null
  year: string
  ageGroup: string
  overlayId?: string
}): string {
  if (!slug || typeof window === 'undefined') return ''
  const url = new URL(window.location.href)
  applyShareParams(url.searchParams, { slug, year, ageGroup, overlayId })
  return url.href
}

export function setShareUrlParams({
  slug,
  year,
  ageGroup,
  overlayId,
  mode = 'push',
}: {
  slug: string | null
  year: string
  ageGroup: string
  overlayId: string
  mode?: 'push' | 'replace'
}): void {
  if (typeof window === 'undefined') return

  const url = new URL(window.location.href)
  applyShareParams(url.searchParams, { slug, year, ageGroup, overlayId })

  const nextUrl = `${url.pathname}${url.search}${url.hash}`
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
  if (nextUrl === currentUrl) return

  window.history[mode === 'replace' ? 'replaceState' : 'pushState']({}, '', nextUrl)
}

function applyShareParams(
  params: URLSearchParams,
  {
    slug,
    year,
    ageGroup,
    overlayId,
  }: {
    slug: string | null
    year: string
    ageGroup: string
    overlayId?: string
  },
) {
  if (slug) params.set(AREA_QUERY_PARAM, slug)
  else params.delete(AREA_QUERY_PARAM)

  if (year) params.set(YEAR_QUERY_PARAM, year)
  if (ageGroup) params.set(AGE_QUERY_PARAM, ageGroupSlug(ageGroup))

  if (overlayId) {
    const metric = getOverlayMetric(overlayId)
    if (metric.id === DEFAULT_OVERLAY_ID) params.delete(METRIC_QUERY_PARAM)
    else params.set(METRIC_QUERY_PARAM, metric.id)
  }
}
