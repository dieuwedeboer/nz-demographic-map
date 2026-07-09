// scripts/cache-structure-data.mjs
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseStringPromise } from 'xml2js'
//import dotenv from 'dotenv'

// Determine the project root directory to find the .env file
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..') // Assumes script is in project_root/scripts

// Load environment variables from .env file in the project root
//dotenv.config({ path: path.join(projectRoot, '.env') })



async function cacheStructureData() {
  const apiKey = process.env.STATSNZ_API_KEY

  if (!apiKey) {
    console.error('Error: STATSNZ_API_KEY environment variable is not set.')
    console.error('Please ensure it is set in your .env file at the project root.')
    process.exit(1) // Exit with an error code
  }

  const dataLevels = [
    { name: 'detailed_single', dataflow: 'STATSNZ/CEN23_ECI_008/1.0' },
    { name: 'level_3', dataflow: 'STATSNZ/CEN23_ECI_016/1.0' }
  ]

  const outputDir = path.join(projectRoot, 'public', 'data')

  for (const level of dataLevels) {
    const structureApiUrl = `https://api.data.stats.govt.nz/rest/dataflow/${level.dataflow}?references=all`
    const outputPath = path.join(outputDir, `statsnz_structure_${level.name}.json`)

    console.log(`Fetching structure data for ${level.name} from: ${structureApiUrl}`)

    try {
      const response = await fetch(structureApiUrl, {
        headers: {
          'Ocp-Apim-Subscription-Key': apiKey,
          'Accept-Language': 'en-NZ',
          'Accept': 'application/vnd.sdmx.structure+xml;version=2.1'
        }
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`API structure response status: ${response.status} ${response.statusText}. Body: ${errorBody}`)
      }

      const xmlData = await response.text()
      console.log(`Structure XML for ${level.name} fetched successfully. Parsing...`)

      // Parse XML to JSON
      const parsed = await parseStringPromise(xmlData, {
        explicitArray: false,
        tagNameProcessors: [ (name) => name.replace(/^.*:/, '') ] // Strip namespaces
      })

      console.log(`Parsed complete structure XML for ${level.name}`)

      // Ensure output directory exists
      try {
        await fs.mkdir(outputDir, { recursive: true })
      } catch (dirError) {
        // Ignore if directory already exists, but throw for other errors
        if (dirError.code !== 'EEXIST') {
          throw dirError
        }
      }

      await fs.writeFile(outputPath, JSON.stringify(parsed, null, 2), 'utf-8')
      console.log(`Structure data for ${level.name} successfully cached to: ${outputPath}`)

    } catch (error) {
      console.error(`Failed to cache structure data for ${level.name}:`, error.message)
      process.exit(1) // Exit with an error code
    }
  }
}

cacheStructureData()
