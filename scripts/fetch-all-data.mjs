import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_DIR = path.join(__dirname, '../public/data')

const API_KEY = process.env.STATSNZ_API_KEY
if (!API_KEY) {
  console.error('Error: STATSNZ_API_KEY environment variable is not set.')
  process.exit(1)
}
const DATAFLOW = 'STATSNZ,CEN23_ECI_008,1.0'
const BASE_URL = 'https://api.data.stats.govt.nz'

const YEARS = ['2013', '2018', '2023']

const ETHNICITY_MAPPINGS = {
  '9999': 'Total - ethnicity',
  '111': 'European only',
  '112': 'Māori only',
  '113': 'Pacific Peoples only',
  '114': 'Asian only',
  '115': 'Middle Eastern/Latin American/African only',
  '116': 'Other Ethnicity only',
  '211': 'European/Māori',
  '212': 'European/Pacific Peoples',
  '213': 'European/Asian',
  '214': 'European/Middle Eastern/Latin American/African',
  '215': 'European/Other Ethnicity',
  '216': 'Māori/Pacific Peoples',
  '217': 'Māori/Asian',
  '218': 'Māori/Middle Eastern/Latin American/African',
  '219': 'Māori/Other Ethnicity',
  '221': 'Pacific Peoples/Asian',
  '222': 'Pacific Peoples/Middle Eastern/Latin American/African',
  '223': 'Pacific Peoples/Other Ethnicity',
  '224': 'Asian/Middle Eastern/Latin American/African',
  '225': 'Asian/Other Ethnicity',
  '226': 'Middle Eastern/Latin American/African/Other Ethnicity',
  '311': 'European/Māori/Pacific Peoples',
  '312': 'European/Māori/Asian',
  '313': 'European/Māori/Middle Eastern/Latin American/African',
  '314': 'European/Māori/Other Ethnicity',
  '315': 'European/Middle Eastern/Latin American/African/Other Ethnicity',
  '321': 'Pacific Peoples/European/Asian',
  '322': 'Pacific Peoples/European/Middle Eastern/Latin American/African',
  '323': 'Pacific Peoples/European/Other Ethnicity',
  '331': 'Asian/Middle Eastern/Latin American/African/European',
  '332': 'Asian/European/Other Ethnicity',
  '341': 'Māori/Pacific Peoples/Asian',
  '342': 'Māori/Pacific Peoples/Middle Eastern/Latin American/African',
  '343': 'Māori/Asian/Middle Eastern/Latin American/African',
  '344': 'Māori/Asian/Other Ethnicity',
  '345': 'Māori/Middle Eastern/Latin American/African/Other Ethnicity',
  '351': 'Pacific Peoples/Māori/Other Ethnicity',
  '352': 'Pacific Peoples/Middle Eastern/Latin American/African/Other Ethnicity',
  '353': 'Asian/Pacific Peoples/Middle Eastern/Latin American/African',
  '354': 'Asian/Pacific Peoples/Other Ethnicity',
  '355': 'Asian/Middle Eastern/Latin American/African/Other Ethnicity',
  '411': 'Four ethnic groups',
  '511': 'Five ethnic groups',
  '611': 'Six ethnic groups',
  '7777': 'Total stated - ethnicity',
  '999': 'Not elsewhere included'
}

const AGE_GROUP_CODES = ['1', '2', '3', '4']  // Under 15, 15-29, 30-64, 65+
const AGE_GROUP_NAMES = {
  '1': 'Under 15 years',
  '2': '15-29 years',
  '3': '30-64 years',
  '4': '65 years and over'
}

const DELAY_MS = 300

function getHeaders() {
  return {
    'Ocp-Apim-Subscription-Key': API_KEY,
    'Accept-Language': 'en-NZ'
  }
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, options, timeout = 120000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    return response
  } finally {
    clearTimeout(id)
  }
}

async function fetchDimensionInfo() {
  console.log('Fetching dimension info...')
  
  // First get basic dimensions
  const query = '2013..9999.99.99'
  const url = `${BASE_URL}/rest/data/${DATAFLOW}/${query}?dimensionAtObservation=AllDimensions&format=jsondata`
  
  const response = await fetchWithTimeout(url, { headers: getHeaders() })
  
  if (!response.ok) {
    throw new Error(`Error: ${response.status} ${response.statusText}`)
  }
  
  const json = await response.json()
  const dimensions = json.data.structures[0].dimensions.observation
  
  const mappings = {
    years: {},
    regions: {},
    ethnicities: ETHNICITY_MAPPINGS,
    ageGroups: {},
    gender: {}
  }
  
  for (const val of dimensions[0].values || []) {
    mappings.years[val.id] = val.name
  }
  for (const val of dimensions[1].values || []) {
    mappings.regions[val.id] = val.name
  }
  
  // Add our age group mappings
  mappings.ageGroups = { '99': 'Total - age', ...AGE_GROUP_NAMES }
  
  for (const val of dimensions[4].values || []) {
    mappings.gender[val.id] = val.name
  }
  
  console.log(`  Years: ${Object.keys(mappings.years).length}`)
  console.log(`  Regions: ${Object.keys(mappings.regions).length}`)
  console.log(`  Ethnicities: ${Object.keys(mappings.ethnicities).length}`)
  console.log(`  Age groups: ${Object.keys(mappings.ageGroups).length}`)
  
  return mappings
}

async function fetchData() {
  console.log('=== Fetching Stats NZ Census Data with Age Groups ===\n')
  
  const mappings = await fetchDimensionInfo()
  
  const ethnicityCodes = Object.keys(ETHNICITY_MAPPINGS)
  console.log(`Total ethnicities to fetch: ${ethnicityCodes.length}`)
  console.log(`Age groups: ${Object.keys(AGE_GROUP_NAMES).map(k => k + ':' + AGE_GROUP_NAMES[k]).join(', ')}`)
  
  const chunkSize = 20
  const ethnicityChunks = []
  for (let i = 0; i < ethnicityCodes.length; i += chunkSize) {
    ethnicityChunks.push(ethnicityCodes.slice(i, i + chunkSize))
  }
  console.log(`Fetching in ${ethnicityChunks.length} chunks of up to ${chunkSize} ethnicities\n`)
  
  let combinedData = {}
  
  // Build list of all age groups to fetch: 99 (total) + 1,2,3,4
  const allAgeGroups = ['99', ...AGE_GROUP_CODES]
  
  for (const year of YEARS) {
    for (const ageGroupCode of allAgeGroups) {
      const ageGroupName = mappings.ageGroups[ageGroupCode]
      console.log(`Fetching ${year} ${ageGroupName}...`)
      
      for (let i = 0; i < ethnicityChunks.length; i++) {
        const chunk = ethnicityChunks[i]
        
        const ethString = chunk.join('+')
        const query = `${year}..${ethString}.${ageGroupCode}.99`
        const url = `${BASE_URL}/rest/data/${DATAFLOW}/${query}?dimensionAtObservation=AllDimensions&format=jsondata`
        
        const response = await fetchWithTimeout(url, { headers: getHeaders() }, 180000)
        
        if (!response.ok) {
          console.error(`    Error: ${response.status} ${response.statusText}`)
          continue
        }
        
        const json = await response.json()
        const dimensions = json.data.structures[0].dimensions.observation
        const observations = json.data.dataSets[0].observations
        
        const geoDim = dimensions[1]
        const ethDim = dimensions[2]
        
        for (const [key, values] of Object.entries(observations)) {
          const indices = key.split(':').map(Number)
          
          const regionId = geoDim.values[indices[1]]?.id
          const ethnicityId = ethDim.values[indices[2]]?.id
          
          if (!regionId) continue
          
          const regionName = mappings.regions[regionId]
          const ethnicityName = ETHNICITY_MAPPINGS[ethnicityId] || ethnicityId
          
          if (!combinedData[regionName]) {
            combinedData[regionName] = { ethnicityData: {} }
          }
          if (!combinedData[regionName].ethnicityData[year]) {
            combinedData[regionName].ethnicityData[year] = {}
          }
          if (!combinedData[regionName].ethnicityData[year][ageGroupName]) {
            combinedData[regionName].ethnicityData[year][ageGroupName] = {}
          }
          
          combinedData[regionName].ethnicityData[year][ageGroupName][ethnicityName] = values[0]
        }
        
        await delay(DELAY_MS)
      }
    }
  }
  
  console.log('\n=== Saving data ===')
  
  const outputFile = path.join(OUTPUT_DIR, 'statsnz_census_data.json')
  fs.writeFileSync(outputFile, JSON.stringify(combinedData, null, 2))
  console.log(`  Saved to ${path.basename(outputFile)}`)
  
  const mappingsFile = path.join(OUTPUT_DIR, 'statsnz_dimensions.json')
  fs.writeFileSync(mappingsFile, JSON.stringify(mappings, null, 2))
  console.log(`  Saved to ${path.basename(mappingsFile)}`)
  
  console.log('\n=== Summary ===')
  console.log(`Total regions: ${Object.keys(combinedData).length}`)
  console.log(`Years: ${YEARS.join(', ')}`)
  console.log(`Age groups: ${Object.keys(mappings.ageGroups).join(', ')}`)
  
  console.log('\n=== Sample data ===')
  const sampleRegion = 'Total - New Zealand by regional council'
  if (combinedData[sampleRegion]) {
    console.log(`${sampleRegion} - 2023 Age Groups:`, Object.keys(combinedData[sampleRegion].ethnicityData['2023'] || {}))
    console.log(`${sampleRegion} - 2023 Total - European only:`, combinedData[sampleRegion].ethnicityData['2023']?.['Total - age']?.['European only'])
    console.log(`${sampleRegion} - 2023 Under 15 - European only:`, combinedData[sampleRegion].ethnicityData['2023']?.['Under 15 years']?.['European only'])
  }
  
  console.log('\n=== Done! ===')
}

fetchData().catch(console.error)
