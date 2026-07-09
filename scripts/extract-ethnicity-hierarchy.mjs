import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const OUTPUT_DIR = path.join(__dirname, '../public/data')
const STRUCTURE_FILE = path.join(OUTPUT_DIR, 'statsnz_structure_level_3.json')

function extractHierarchy() {
  console.log('Extracting ethnicity hierarchy from Level 3 structure...')
  
  const structure = JSON.parse(fs.readFileSync(STRUCTURE_FILE, 'utf-8'))
  
  const codelist = structure.Structure.Structures.Codelists.Codelist.find(
    (cl) => cl.$.id === 'CL_CEN23_ETH_003'
  )
  
  if (!codelist) {
    throw new Error('Could not find CL_CEN23_ETH_003 codelist')
  }
  
  const nodes = {}
  
  for (const code of codelist.Code) {
    const id = code.$.id
    const name = code.Name._
    const parentId = code.Parent?.Ref?.$?.id || null
    
    nodes[id] = { id, name, parentId }
  }
  
  console.log(`  Found ${Object.keys(nodes).length} ethnicity codes`)
  
  const hierarchy = buildHierarchy(nodes)
  
  console.log('  Built hierarchy tree')
  
  const outputFile = path.join(OUTPUT_DIR, 'ethnicity_hierarchy.json')
  fs.writeFileSync(outputFile, JSON.stringify(hierarchy, null, 2))
  console.log(`  Saved to ${path.basename(outputFile)}`)
  
  printHierarchy(hierarchy, 0)
  
  console.log('\n=== Done! ===')
}

function buildHierarchy(nodes) {
  const root = { id: '9999', name: 'Total - ethnicity', children: [] }
  
  const nodeMap = {}
  
  for (const [id, node] of Object.entries(nodes)) {
    nodeMap[id] = { ...node, children: [] }
  }
  
  for (const node of Object.values(nodeMap)) {
    if (node.parentId && nodeMap[node.parentId]) {
      nodeMap[node.parentId].children.push({
        id: node.id,
        name: node.name,
        children: []
      })
    } else if (!node.parentId) {
      root.children.push({
        id: node.id,
        name: node.name,
        children: []
      })
    }
  }
  
  function addChildrenRecursive(parent) {
    for (const child of parent.children) {
      const node = nodeMap[child.id]
      if (node && node.children.length > 0) {
        child.children = node.children.map(c => ({
          id: c.id,
          name: c.name,
          children: []
        }))
        addChildrenRecursive(child)
      }
    }
  }
  
  addChildrenRecursive(root)
  
  return root
}

function printHierarchy(node, depth) {
  const indent = '  '.repeat(depth)
  console.log(`${indent}${node.name} (${node.id})`)
  for (const child of node.children) {
    printHierarchy(child, depth + 1)
  }
}

extractHierarchy()
