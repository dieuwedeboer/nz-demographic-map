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
}: ControlPanelProps) {
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="control-panel">
      <div className="control-section-title">Census</div>
      {availableYears.length > 0 && (
        <div className="selector-container">
          <select
            id="year-selector"
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
        </div>
      )}

      <div className="control-section-title">Age</div>
      <div className="selector-container">
        <select
          id="age-group-selector"
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
      </div>

      <div className="control-section-title">Layers</div>
      <div className="selector-container">
        <label>
          <input
            type="checkbox"
            checked={showRegionalCouncils}
            onChange={(e) => onShowRegionalCouncilsChange(e.target.checked)}
            disabled={disabled}
          />{' '}
          Regional Councils
        </label>
        <label>
          <input
            type="checkbox"
            checked={showTerritorialAuthorities}
            onChange={(e) => onShowTerritorialAuthoritiesChange(e.target.checked)}
            disabled={disabled}
          />{' '}
          Territorial Authorities
        </label>
        <label>
          <input
            type="checkbox"
            checked={showSA2}
            onChange={(e) => onShowSA2Change(e.target.checked)}
            disabled={disabled}
          />{' '}
          Statistical Areas
        </label>
      </div>

      <div className="selector-container theme-row">
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
        >
          {theme === 'light' ? 'Dark' : 'Light'}
        </button>
      </div>
    </div>
  )
}

export default ControlPanel
