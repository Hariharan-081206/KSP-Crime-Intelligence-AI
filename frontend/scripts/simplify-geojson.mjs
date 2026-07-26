#!/usr/bin/env node
/**
 * Shrink the Karnataka districts GeoJSON for the Catalyst deploy bundle.
 *
 * The source `src/assets/karnataka-districts.geojson` stores coordinates at 14
 * decimal places (~sub-millimetre) with heavy unused properties — 6.7 MB, which
 * the map page fetches at runtime. For a state-level district-outline map that
 * precision is pointless. This regenerates a functionally identical but far
 * smaller `karnataka-districts.min.geojson` by:
 *   1. rounding every coordinate to PRECISION decimals (4 dp ≈ 11 m),
 *   2. dropping consecutive duplicate points created by that rounding
 *      (ring closure preserved),
 *   3. keeping only the properties DistrictOutlines.jsx actually reads
 *      (dtname, dtcode11, Dist_LGD) plus stname for context.
 *
 * Lossless at map zoom levels; no topology/vertex-decimation, so no risk of
 * gaps or self-intersections. Re-run after replacing the source file:
 *   node scripts/simplify-geojson.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PRECISION = 4
const KEEP_PROPS = ['dtname', 'dtcode11', 'Dist_LGD', 'stname']

const here = dirname(fileURLToPath(import.meta.url))
const SRC = join(here, '..', 'src', 'assets', 'karnataka-districts.geojson')
const OUT = join(here, '..', 'src', 'assets', 'karnataka-districts.min.geojson')

const round = (n) => Number(n.toFixed(PRECISION))

// Recursively round a coordinate tree, then drop consecutive duplicate points
// in each linear ring (the innermost array of [lng,lat] pairs).
function processCoords(node) {
  if (typeof node[0] === 'number') return node.map(round)
  // A ring = array whose elements are [number, number]. Dedupe consecutive pts.
  if (typeof node[0]?.[0] === 'number') {
    const rounded = node.map((pt) => pt.map(round))
    const deduped = rounded.filter(
      (pt, i) => i === 0 || pt[0] !== rounded[i - 1][0] || pt[1] !== rounded[i - 1][1],
    )
    // Preserve ring closure (first === last) if dedup broke it.
    const first = deduped[0]
    const last = deduped[deduped.length - 1]
    if (deduped.length > 2 && (first[0] !== last[0] || first[1] !== last[1])) {
      deduped.push([first[0], first[1]])
    }
    return deduped
  }
  return node.map(processCoords)
}

const src = JSON.parse(readFileSync(SRC, 'utf8'))
let before = 0
let after = 0
const countVerts = (a) => {
  if (typeof a[0] === 'number') { after++; return }
  a.forEach(countVerts)
}
const countSrc = (a) => {
  if (typeof a[0] === 'number') { before++; return }
  a.forEach(countSrc)
}

const out = {
  type: 'FeatureCollection',
  features: src.features.map((f) => {
    countSrc(f.geometry.coordinates)
    const props = {}
    for (const k of KEEP_PROPS) if (f.properties?.[k] != null) props[k] = f.properties[k]
    const geometry = { ...f.geometry, coordinates: processCoords(f.geometry.coordinates) }
    countVerts(geometry.coordinates)
    return { type: 'Feature', properties: props, geometry }
  }),
}

writeFileSync(OUT, JSON.stringify(out))

const kb = (p) => (readFileSync(p).length / 1024).toFixed(0)
console.log(`districts:      ${out.features.length}`)
console.log(`vertices:       ${before} -> ${after}  (${(100 * (1 - after / before)).toFixed(1)}% fewer)`)
console.log(`size:           ${kb(SRC)} KB -> ${kb(OUT)} KB  (${(100 * (1 - readFileSync(OUT).length / readFileSync(SRC).length)).toFixed(1)}% smaller)`)
console.log(`wrote:          ${OUT}`)
