import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_DIR = path.join(__dirname, '../public/data')
const STRUCTURE_FILE = path.join(OUTPUT_DIR, 'statsnz_structure_level_3.json')

const API_KEY = process.env.STATSNZ_API_KEY
if (!API_KEY) {
  console.error('Error: STATSNZ_API_KEY environment variable is not set.')
  process.exit(1)
}
const DATAFLOW = 'STATSNZ,CEN23_ECI_016,1.0'
const BASE_URL = 'https://api.data.stats.govt.nz'

const YEARS = ['2013', '2018', '2023']

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

function extractEthnicityMappings() {
  console.log('Extracting Level 3 ethnicity mappings from structure file...')
  
  const structure = JSON.parse(fs.readFileSync(STRUCTURE_FILE, 'utf-8'))
  
  const codelist = structure.Structure.Structures.Codelists.Codelist.find(
    (cl) => cl.$.id === 'CL_CEN23_ETH_003'
  )
  
  if (!codelist) {
    throw new Error('Could not find CL_CEN23_ETH_003 codelist')
  }
  
  const ethnicities = {}
  for (const code of codelist.Code) {
    const id = code.$.id
    const name = code.Name._
    ethnicities[id] = name
  }
  
  console.log(`  Found ${Object.keys(ethnicities).length} ethnicity codes`)
  
  return ethnicities
}

async function fetchDimensionInfo() {
  console.log('Fetching dimension info...')
  
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
    ethnicities: {},
    ageGroups: {},
    gender: {}
  }
  
  for (const val of dimensions[0].values || []) {
    mappings.years[val.id] = val.name
  }
  for (const val of dimensions[1].values || []) {
    mappings.regions[val.id] = val.name
  }
  
  // Add age group mappings
  mappings.ageGroups = { '99': 'Total - age', ...AGE_GROUP_NAMES }
  
  for (const val of dimensions[4].values || []) {
    mappings.gender[val.id] = val.name
  }
  
  console.log(`  Years: ${Object.keys(mappings.years).length}`)
  console.log(`  Regions: ${Object.keys(mappings.regions).length}`)
  console.log(`  Age groups: ${Object.keys(mappings.ageGroups).length}`)
  
  return mappings
}

async function fetchData() {
  console.log('=== Fetching Stats NZ Census Data (Level 3) with Age Groups ===\n')
  
  const ethnicityMappings = extractEthnicityMappings()
  
  const mappings = await fetchDimensionInfo()
  mappings.ethnicities = ethnicityMappings
  
  console.log(`\nTotal ethnicities: ${Object.keys(ethnicityMappings).length}`)
  console.log(`Age groups: ${Object.keys(AGE_GROUP_NAMES).map(k => k + ':' + AGE_GROUP_NAMES[k]).join(', ')}`)
  
  const ethnicityCodes = Object.keys(ethnicityMappings)
  
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
          const ethnicityName = ethnicityMappings[ethnicityId] || ethnicityId
          
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
  
  const outputFile = path.join(OUTPUT_DIR, 'statsnz_census_data_level3.json')
  fs.writeFileSync(outputFile, JSON.stringify(combinedData, null, 2))
  console.log(`  Saved to ${path.basename(outputFile)}`)
  
  const mappingsFile = path.join(OUTPUT_DIR, 'statsnz_dimensions_level3.json')
  fs.writeFileSync(mappingsFile, JSON.stringify(mappings, null, 2))
  console.log(`  Saved to ${path.basename(mappingsFile)}`)
  
  console.log('\n=== Summary ===')
  console.log(`Total regions: ${Object.keys(combinedData).length}`)
  console.log(`Years: ${YEARS.join(', ')}`)
  console.log(`Age groups: ${Object.keys(mappings.ageGroups).join(', ')}`)
  
  console.log('\n=== Done! ===')
}

fetchData().catch(console.error)
