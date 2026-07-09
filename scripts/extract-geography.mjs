import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const STRUCTURE_FILE = path.join(__dirname, '../public/data/statsnz_structure_detailed_single.json')
const OUTPUT_FILE = path.join(__dirname, '../public/data/geographic-hierarchy.json')

function extractHierarchy() {
  console.log('Reading structure file...')
  const data = JSON.parse(fs.readFileSync(STRUCTURE_FILE, 'utf-8'))
  
  const codelists = data.Structure.Structures.Codelists.Codelist
  const geoCodelist = codelists.find((cl) => cl.$.id === 'CL_CEN23_GEO_002')
  
  if (!geoCodelist) {
    throw new Error('Geographic codelist not found')
  }

  const codes = geoCodelist.Code
  const hierarchy = []

  codes.forEach((code) => {
    const id = code.$.id
    const name = code.Name?._ || 'Unknown'
    const parentId = code.Parent?.Ref?.$.id || null
    
    let level
    // 9999 = national total
    if (id === '9999' || id === '999999') {
      level = 'total'
    } else if (parentId === '9999') {
      level = 'regional_council'
    } else if (parentId === '001' || parentId === '002' || parentId === '003') {
      // 001-003 are usually area outside regions
      level = 'territorial_authority'
    } else if (parentId === '076') {
      // Auckland local boards
      level = 'auckland_local_boards'
    } else if (id.length === 6 && parseInt(id) >= 100 && parseInt(id) <= 999999) {
      // 6-digit codes are SA2 (except those starting with 07 which are Auckland local boards)
      if (!id.startsWith('07')) {
        level = 'sa2'
      } else {
        level = 'other'
      }
    } else if (parentId && parentId.length === 3 && parseInt(parentId) >= 4 && parseInt(parentId) <= 75) {
      level = 'district'
    } else if (parentId && parentId.length === 3) {
      level = 'territorial_authority'
    } else {
      level = 'other'
    }

    hierarchy.push({ id, name, level, parentId })
  })

  const byLevel = {}
  hierarchy.forEach(item => {
    if (!byLevel[item.level]) byLevel[item.level] = []
    byLevel[item.level].push(item)
  })

  console.log('Geographic hierarchy extracted:')
  Object.keys(byLevel).forEach(level => {
    console.log(`  ${level}: ${byLevel[level].length} areas`)
  })

  const output = {
    extractedAt: new Date().toISOString(),
    totalAreas: hierarchy.length,
    byLevel,
    all: hierarchy
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2))
  console.log(`\nSaved to ${OUTPUT_FILE}`)
}

extractHierarchy()
