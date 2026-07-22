import { useMemo, useState } from 'react'
import { useTheme } from './contexts/ThemeContext'
import {
  childrenOfOverlay,
  type OverlaySelection,
  supportsIncludeEurMaori,
  TOP_LEVEL_OVERLAYS,
} from './domain/overlay'
import type { AgeGroup } from './domain/types'

interface ControlPanelProps {
  availableYears: string[]
  selectedYear: string
  onYearChange: (year: string) => void
  availableAgeGroups: AgeGroup[]
  selectedAgeGroup: AgeGroup
  onAgeGroupChange: (ageGroup: AgeGroup) => void
  overlaySelection: OverlaySelection
  onOverlaySelectionChange: (selection: OverlaySelection) => void
  showRegionalCouncils: boolean
  onShowRegionalCouncilsChange: (show: boolean) => void
  showTerritorialAuthorities: boolean
  onShowTerritorialAuthoritiesChange: (show: boolean) => void
  showSA2: boolean
  onShowSA2Change: (show: boolean) => void
  disabled?: boolean
  embedded?: boolean
}

function ControlPanel({
  availableYears,
  selectedYear,
  onYearChange,
  availableAgeGroups,
  selectedAgeGroup,
  onAgeGroupChange,
  overlaySelection,
  onOverlaySelectionChange,
  showRegionalCouncils,
  onShowRegionalCouncilsChange,
  showTerritorialAuthorities,
  onShowTerritorialAuthoritiesChange,
  showSA2,
  onShowSA2Change,
  disabled = false,
  embedded = false,
}: ControlPanelProps) {
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)

  const childOptions = useMemo(
    () => childrenOfOverlay(overlaySelection.groupId),
    [overlaySelection.groupId],
  )
  const showIncludeEurMaori = supportsIncludeEurMaori(overlaySelection.groupId)
  const detailSelectValue = overlaySelection.detailId ?? 'all'

  const layerToggles = [
    {
      id: 'regional-councils-layer',
      label: 'Regional Councils',
      description: '16 regions',
      checked: showRegionalCouncils,
      onChange: onShowRegionalCouncilsChange,
    },
    {
      id: 'territorial-authorities-layer',
      label: 'Territorial Authorities',
      description: '67 city and district councils',
      checked: showTerritorialAuthorities,
      onChange: onShowTerritorialAuthoritiesChange,
    },
    {
      id: 'statistical-areas-layer',
      label: 'Statistical Areas',
      description: '2,400 census neighbourhoods (SA2)',
      checked: showSA2,
      onChange: onShowSA2Change,
    },
  ]

  const body = (
    <div className="control-panel-body">
      <section className="control-section" aria-label="Census filters">
        <div className="control-section-title">Census</div>
        <div className="control-grid">
          {availableYears.length > 0 && (
            <label className="field-control" htmlFor="year-selector">
              <span>Year</span>
              <select
                id="year-selector"
                name="year"
                value={selectedYear}
                onChange={(e) => onYearChange(e.target.value)}
                disabled={disabled}
              >
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="field-control" htmlFor="age-group-selector">
            <span>Age</span>
            <select
              id="age-group-selector"
              name="age-group"
              value={selectedAgeGroup}
              onChange={(e) => onAgeGroupChange(e.target.value as AgeGroup)}
              disabled={disabled}
            >
              {availableAgeGroups.map((ag) => (
                <option key={ag} value={ag}>
                  {ag === 'Total - age' ? 'All' : ag}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="control-section" aria-label="Map colour by ethnicity">
        <div className="control-section-title">Map colour by ethnicity</div>
        <div
          className={childOptions.length > 0 ? 'control-grid' : 'control-grid control-grid-single'}
        >
          <label className="field-control" htmlFor="overlay-group-selector">
            <span>Group</span>
            <select
              id="overlay-group-selector"
              name="overlay-group"
              value={overlaySelection.groupId}
              onChange={(e) =>
                onOverlaySelectionChange({
                  groupId: e.target.value,
                  detailId: null,
                  includeEurMaori: overlaySelection.includeEurMaori,
                })
              }
              disabled={disabled}
            >
              {TOP_LEVEL_OVERLAYS.map((metric) => (
                <option key={metric.id} value={metric.id}>
                  {metric.label}
                </option>
              ))}
            </select>
          </label>

          {childOptions.length > 0 && (
            <label className="field-control" htmlFor="overlay-detail-selector">
              <span>Detail</span>
              <select
                id="overlay-detail-selector"
                name="overlay-detail"
                value={detailSelectValue}
                onChange={(e) =>
                  onOverlaySelectionChange({
                    groupId: overlaySelection.groupId,
                    detailId: e.target.value === 'all' ? null : e.target.value,
                    includeEurMaori: overlaySelection.includeEurMaori,
                  })
                }
                disabled={disabled}
              >
                <option value="all">All</option>
                {childOptions.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {showIncludeEurMaori ? (
          <label className="layer-toggle overlay-include-toggle" htmlFor="include-eur-maori">
            <input
              id="include-eur-maori"
              name="include-eur-maori"
              type="checkbox"
              checked={overlaySelection.includeEurMaori}
              onChange={(e) =>
                onOverlaySelectionChange({
                  groupId: overlaySelection.groupId,
                  detailId: overlaySelection.detailId,
                  includeEurMaori: e.target.checked,
                })
              }
              disabled={disabled}
            />
            <span className="toggle-track" aria-hidden="true">
              <span className="toggle-thumb" />
            </span>
            <span className="layer-toggle-copy">
              <strong>Include European Maori</strong>
              <small>
                Add dual European/Maori share to count. This is commonly done in govt reporting.
              </small>
            </span>
          </label>
        ) : null}
      </section>

      <section className="control-section" aria-label="Map layers">
        <div className="control-section-title">Layers</div>
        <div className="layer-toggle-list">
          {layerToggles.map((layer) => (
            <label key={layer.id} className="layer-toggle" htmlFor={layer.id}>
              <input
                id={layer.id}
                name={layer.id}
                type="checkbox"
                checked={layer.checked}
                onChange={(e) => layer.onChange(e.target.checked)}
                disabled={disabled}
              />
              <span className="toggle-track" aria-hidden="true">
                <span className="toggle-thumb" />
              </span>
              <span className="layer-toggle-copy">
                <strong>{layer.label}</strong>
                <small>{layer.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="theme-row">
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          <span className="theme-toggle-label">Theme</span>
          <span className="theme-toggle-value">{theme === 'light' ? 'Light' : 'Dark'}</span>
        </button>
      </div>
    </div>
  )

  if (embedded) return body

  return (
    <div className={`control-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="panel-header">
        <span className="panel-header-label">Map Controls</span>
        <button
          type="button"
          className="panel-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand controls' : 'Collapse controls'}
          aria-expanded={!collapsed}
        >
          <span className="panel-toggle-icon" aria-hidden="true" />
        </button>
      </div>
      {!collapsed && body}
    </div>
  )
}

export default ControlPanel
