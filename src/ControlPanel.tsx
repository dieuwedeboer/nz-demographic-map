import { useState } from 'react'
import { useTheme } from './contexts/ThemeContext'
import type { AgeGroup } from './domain/types'

interface ControlPanelProps {
  availableYears: string[]
  selectedYear: string
  onYearChange: (year: string) => void
  availableAgeGroups: AgeGroup[]
  selectedAgeGroup: AgeGroup
  onAgeGroupChange: (ageGroup: AgeGroup) => void
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
  const layerToggles = [
    {
      id: 'regional-councils-layer',
      label: 'Regional Councils',
      description: 'Broad regions',
      checked: showRegionalCouncils,
      onChange: onShowRegionalCouncilsChange,
    },
    {
      id: 'territorial-authorities-layer',
      label: 'Territorial Authorities',
      description: 'Districts and cities',
      checked: showTerritorialAuthorities,
      onChange: onShowTerritorialAuthoritiesChange,
    },
    {
      id: 'statistical-areas-layer',
      label: 'Statistical Areas',
      description: 'Local SA2 areas',
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
