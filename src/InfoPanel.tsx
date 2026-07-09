import { useMemo, useState } from 'react'
import { useData, useSelectedRegionData } from './contexts/DataContext'
import { useTheme } from './contexts/ThemeContext'
import { describeArc, processUnifiedData } from './domain/ethnicity'
import { AGE_GROUPS, CATEGORY_COLORS, type DisplayItem, LEVEL3_KEY_MAP } from './domain/types'

interface PieSlice {
  name: string
  value: number
  color: string
  startAngle: number
  endAngle: number
}

function EthnicityPie({ items, isDark }: { items: DisplayItem[]; isDark: boolean }) {
  const slices = useMemo(() => {
    const positive = items.filter((i) => i.value > 0)
    const sum = positive.reduce((s, i) => s + i.value, 0)
    if (sum <= 0) return [] as PieSlice[]

    let angle = 0
    return positive.map((item) => {
      const sweep = (item.value / sum) * 360
      const slice: PieSlice = {
        name: item.name,
        value: item.value,
        color: CATEGORY_COLORS[item.name] || '#888',
        startAngle: angle,
        endAngle: angle + sweep,
      }
      angle += sweep
      return slice
    })
  }, [items])

  if (slices.length === 0) return null

  const size = 160
  const cx = size / 2
  const cy = size / 2
  const r = 70

  return (
    <div className="pie-wrap">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-label="Ethnicity pie chart"
      >
        {slices.map((slice) => {
          if (slice.endAngle - slice.startAngle >= 359.99) {
            return <circle key={slice.name} cx={cx} cy={cy} r={r} fill={slice.color} />
          }
          return (
            <path
              key={slice.name}
              d={describeArc(cx, cy, r, slice.startAngle, slice.endAngle)}
              fill={slice.color}
              stroke={isDark ? '#333' : '#f0f0f0'}
              strokeWidth={1}
            >
              <title>{`${slice.name}: ${slice.value.toLocaleString()}`}</title>
            </path>
          )
        })}
      </svg>
      <div className="pie-legend">
        {slices.map((slice) => (
          <div key={slice.name} className="pie-legend-row">
            <span className="pie-swatch" style={{ background: slice.color }} />
            <span className="pie-legend-label">{slice.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AgeBreakdown({
  yearData,
  isDark,
}: {
  yearData: Record<string, Record<string, number>> | undefined
  isDark: boolean
}) {
  if (!yearData) return null

  const rows = AGE_GROUPS.filter((ag) => ag !== 'Total - age')
    .map((ag) => {
      const total = yearData[ag]?.['Total stated - ethnicity'] || 0
      const european = yearData[ag]?.['European only'] || 0
      const pct = total > 0 ? (european / total) * 100 : 0
      return { ag, total, european, pct }
    })
    .filter((r) => r.total > 0)

  if (rows.length === 0) return null

  const maxTotal = Math.max(...rows.map((r) => r.total))

  return (
    <div className="age-breakdown">
      <div className="age-breakdown-title">Age groups (European % of stated)</div>
      {rows.map((row) => (
        <div key={row.ag} className="age-bar-row">
          <span className="age-bar-label">
            {row.ag.replace(' years', '').replace(' and over', '+')}
          </span>
          <div className="age-bar-track">
            <div
              className="age-bar-fill"
              style={{
                width: `${maxTotal > 0 ? (row.total / maxTotal) * 100 : 0}%`,
                background: isDark ? '#4b5563' : '#d1d5db',
              }}
            >
              <div
                className="age-bar-euro"
                style={{ width: `${row.pct}%`, background: '#3b82f6' }}
              />
            </div>
          </div>
          <span className="age-bar-pct">{row.pct.toFixed(0)}%</span>
        </div>
      ))}
    </div>
  )
}

function InfoPanel() {
  const { theme } = useTheme()
  const isDark = theme === 'dark'
  const { selectedArea, selectedYear, selectedAgeGroup, selectedDetail, detailLoading } = useData()
  const data = useSelectedRegionData()
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const toggleExpand = (name: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const selectedYearAgeGroupData = data?.ethnicityData?.[selectedYear]?.[selectedAgeGroup]
  const baseYearAgeGroupData = data?.ethnicityData?.['2013']?.[selectedAgeGroup]
  const total = selectedYearAgeGroupData?.['Total stated - ethnicity']
  const baseTotal = baseYearAgeGroupData?.['Total stated - ethnicity']

  const level3SelectedYearData =
    selectedDetail?.level3?.ethnicityData?.[selectedYear]?.[selectedAgeGroup]

  if (!data || !selectedYearAgeGroupData || typeof total !== 'number') {
    return (
      <div className={`info-panel ${isDark ? 'dark' : 'light'}`}>
        <div className="info-panel-content">
          <h4>{selectedArea}</h4>
          <p>
            {detailLoading || !data
              ? 'Loading...'
              : !selectedYearAgeGroupData
                ? `No data for ${selectedYear}`
                : 'No ethnicity data for this area'}
          </p>
        </div>
      </div>
    )
  }

  const items = processUnifiedData(
    selectedYearAgeGroupData,
    total,
    baseYearAgeGroupData,
    baseTotal,
    selectedYear,
  )

  const yearAllAges = data.ethnicityData?.[selectedYear]
  const ageLabel = selectedAgeGroup === 'Total - age' ? 'All ages' : selectedAgeGroup

  return (
    <div className={`info-panel ${isDark ? 'dark' : 'light'}`}>
      <div className="info-panel-content">
        <h4>{selectedArea}</h4>
        <p>
          {selectedYear} · {ageLabel} · single/combination responses
        </p>

        <EthnicityPie items={items} isDark={isDark} />

        {selectedAgeGroup === 'Total - age' && (
          <AgeBreakdown yearData={yearAllAges} isDark={isDark} />
        )}

        {items.map((item) => (
          <div key={item.name}>
            <div
              className={`info-row depth-0 ${!item.isExpandable ? 'no-expand' : ''}`}
              onClick={() => item.isExpandable && toggleExpand(item.name)}
            >
              <span className="info-label">
                {item.isExpandable && (
                  <span className="expand-icon">
                    {expandedCategories.has(item.name) ? '▼' : '▶'}
                  </span>
                )}
                <span>{item.name}</span>
              </span>
              <span className="info-value">{item.value.toLocaleString()}</span>
              <span className="info-pct">({item.percentage}%)</span>
              <span className={`info-change ${item.changeColorClass}`} title={item.changeTooltip}>
                {item.changeIcon}
              </span>
            </div>
            {item.isExpandable &&
              expandedCategories.has(item.name) &&
              (item.children ?? [])
                .map((childName) => ({
                  name: childName,
                  data: level3SelectedYearData?.[LEVEL3_KEY_MAP[childName] || childName] || 0,
                }))
                .sort((a, b) => b.data - a.data)
                .map((child) => {
                  const childPct = total > 0 ? ((child.data / total) * 100).toFixed(1) : '0.0'
                  return (
                    <div key={`${item.name}-child-${child.name}`} className="info-row depth-1">
                      <span className="info-label child">
                        <span className="expand-icon-placeholder" />
                        <span>{child.name}</span>
                      </span>
                      <span className="info-value">{child.data.toLocaleString()}</span>
                      <span className="info-pct">({childPct}%)</span>
                    </div>
                  )
                })}
          </div>
        ))}

        <div className="info-total">
          <span>Total stated:</span>
          <span>{total.toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

export default InfoPanel
