import { describe, expect, it } from 'vitest'
import { describeArc, processUnifiedData } from '../domain/ethnicity'

describe('processUnifiedData', () => {
  const data = {
    'European only': 100,
    'Māori only': 50,
    'Pacific Peoples only': 25,
    'Asian only': 40,
    'European/Māori': 10,
    'Middle Eastern/Latin American/African only': 5,
    'Other Ethnicity only': 5,
    'Total stated - ethnicity': 235,
  }

  const base = {
    'European only': 120,
    'Māori only': 40,
    'Pacific Peoples only': 20,
    'Asian only': 20,
    'European/Māori': 8,
    'Middle Eastern/Latin American/African only': 3,
    'Other Ethnicity only': 2,
    'Total stated - ethnicity': 213,
  }

  it('returns ranked categories with percentages', () => {
    const items = processUnifiedData(data, 235, base, 213, '2023')
    expect(items.length).toBe(6)
    expect(items[0].name).toBe('European')
    expect(items[0].value).toBe(100)
    expect(Number(items[0].percentage)).toBeCloseTo(42.6, 0)
  })

  it('marks expandable categories', () => {
    const items = processUnifiedData(data, 235, undefined, undefined, '2013')
    const european = items.find((i) => i.name === 'European')
    expect(european?.isExpandable).toBe(true)
    expect(european?.children?.length).toBeGreaterThan(0)
  })

  it('computes change vs 2013', () => {
    const items = processUnifiedData(data, 235, base, 213, '2023')
    const european = items.find((i) => i.name === 'European')
    expect(european?.changeIcon).toBe('▼')
  })
})

describe('describeArc', () => {
  it('returns an SVG path', () => {
    const path = describeArc(50, 50, 40, 0, 90)
    expect(path.startsWith('M 50 50')).toBe(true)
    expect(path).toContain('A 40 40')
  })
})
