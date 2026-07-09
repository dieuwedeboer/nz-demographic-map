// scripts/fetch-data.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

async function fetchData() {
  const apiKey = process.env.STATSNZ_API_KEY

  if (!apiKey) {
    console.error('Error: STATSNZ_API_KEY environment variable is not set.')
    process.exit(1)
  }

  // Import the API service (assuming it's built)
  // For simplicity, inline the logic or assume it's available
  // Since this is a script, we can duplicate the logic

  const dataLevels = [
    { name: 'detailed_single', dataflow: 'STATSNZ,CEN23_ECI_008,1.0' },
    { name: 'level_3', dataflow: 'STATSNZ,CEN23_ECI_016,1.0' }
  ]

  const outputDir = path.join(projectRoot, 'public', 'data')

  for (const level of dataLevels) {
    console.log(`Fetching data for ${level.name}...`)

    // For now, fetch one year at a time
    const years = ['2013', '2018', '2023']
    const regionData = {}

    for (const year of years) {
      console.log(`Fetching ${year} for ${level.name}...`)

      // Build query - simplified
      const query = `${year}.999999.99.99.99`
      const url = `https://api.data.stats.govt.nz/rest/data/${level.dataflow}/${query}?dimensionAtObservation=AllDimensions&format=jsondata`

      try {
        const response = await fetch(url, {
          headers: {
            'Ocp-Apim-Subscription-Key': apiKey,
            'Accept-Language': 'en-NZ'
          }
        })

        if (!response.ok) {
          throw new Error(`Data fetch failed: ${response.status}`)
        }

        const json = await response.json()

        // Process similar to the app
        const { observations } = json.data.dataSets[0]
        const dimensions = json.data.structures[0].dimensions.observation

        for (const [key, values] of Object.entries(observations)) {
          const indices = key.split(':').map(Number)
          const regionCode = dimensions[1].values[indices[1]].name
          const ethnicity = dimensions[2].values[indices[2]].name

          if (!regionData[regionCode]) {
            regionData[regionCode] = { ethnicityData: {} }
          }
          if (!regionData[regionCode].ethnicityData[year]) {
            regionData[regionCode].ethnicityData[year] = {}
          }

          regionData[regionCode].ethnicityData[year][ethnicity] = values[0]
        }

      } catch (error) {
        console.error(`Error fetching ${year} for ${level.name}:`, error.message)
      }
    }

    // Save to file
    const outputPath = path.join(outputDir, `statsnz_data_${level.name}.json`)
    await fs.writeFile(outputPath, JSON.stringify(regionData, null, 2), 'utf-8')
    console.log(`Data for ${level.name} saved to ${outputPath}`)
  }
}

fetchData().catch(console.error)