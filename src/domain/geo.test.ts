import { describe, expect, it } from 'vitest'
import {
  ageGroupSlug,
  buildNameIndex,
  findRegionData,
  normalizeName,
  tierForZoom,
} from '../domain/geo'
import type { RegionData } from '../domain/types'

const sample: RegionData = {
  'Auckland Region': {
    ethnicityData: {
      '2023': {
        'Total - age': {
          'European only': 50,
          'Total stated - ethnicity': 100,
        },
        'Under 15 years': {
          'European only': 30,
          'Total stated - ethnicity': 60,
        },
      },
    },
  },
}

describe('normalizeName', () => {
  it('strips diacritics and lowercases', () => {
    expect(normalizeName('Māori')).toBe('maori')
    expect(normalizeName('Auckland Region')).toBe('auckland region')
  })
})

describe('buildNameIndex / findRegionData', () => {
  it('finds by exact and normalized name', () => {
    const index = buildNameIndex(sample)
    expect(findRegionData(sample, 'Auckland Region', index)?.ethnicityData).toBeTruthy()
    expect(findRegionData(sample, 'auckland region', index)?.ethnicityData).toBeTruthy()
    expect(findRegionData(sample, 'missing', index)).toBeNull()
  })
})

describe('ageGroupSlug', () => {
  it('maps total age to all', () => {
    expect(ageGroupSlug('Total - age')).toBe('all')
    expect(ageGroupSlug('Under 15 years')).toBe('under-15-years')
  })
})

describe('tierForZoom', () => {
  it('returns geography tier for zoom', () => {
    expect(tierForZoom(5)).toBe('rc')
    expect(tierForZoom(8)).toBe('ta')
    expect(tierForZoom(12)).toBe('sa2')
  })
})
