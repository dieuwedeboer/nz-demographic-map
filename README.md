## TODO

- [x] Instead of tooltips have a fixed box that shows the entire country and then update it based on the selected region and highlight that region on the map.
- [x] Add tooltip for not-stated numbers and other technical info. (Added explanatory tooltips for MELAA & Other and Mixed categories)
- [x] Display and filter age breakdowns. (Age selector drives map + panel; age bars when All ages selected)
- [x] Add data by territorial authority. (TA + SA2 layers with full census join)
- [x] Add 3rd tier data to show ethnic group rather than only race. (Expandable level-3 groups in info panel)
- [x] Lock map down to only show New Zealand. (Map centered on NZ with default zoom)
- [x] Find official council geodata to replace placeholder data. (Stats NZ 2025 clipped RC/TA/SA2 GeoJSON → PMTiles)
- [x] Investigate showing data as pie charts. (SVG ethnicity pie in info panel)
- [x] Increase colour gradient distinction with mesh shading. (Changed to dark grey/brown/blue scheme with European count labels on map)
- [x] Split/cache census JSON by geography tier and year (`npm run data:prepare`)
- [x] Index region lookup by normalized name once
- [x] MapLibre + PMTiles for RC/TA/SA2 geometry
- [x] Progressive load: metrics for map colour (~KB), full detail per area on click (~40KB)

### Follow-ups

- [ ] Show mixed multi-ethnicity combinations more explicitly in the panel
- [ ] Optional: pie of age structure, not only ethnicity
- [ ] Drop monorepo-sized raw JSON from deploy artifacts (serve prepared + tiles only)

## Stack

- React 19 + TypeScript + Vite 6
- MapLibre GL + PMTiles (static vector tiles)
- Biome (lint/format), Vitest, Knip
- Offline Stats NZ census caches under `public/data/prepared/`

## Data pipeline

Raw census dumps and SHP geometry are **gitignored** (large + secrets live only in `.env`).

1. Copy `.env.example` → `.env` and set `STATSNZ_API_KEY` (never commit `.env`)
2. `npm run data:fetch-all` / `data:fetch-level3` — pull from Stats NZ API
3. `npm run data:prepare` — writes:
   - `prepared/metrics/{rc,ta,sa2}/{year}-{age}.json` — choropleth only
   - `prepared/areas/{slug}.json` — full single+level3 for one place (~40KB)
   - `prepared/national.json`, `name-index.json`, `search-index.json`, `manifest.json`
4. Geometry: tippecanoe → mbtiles → `pmtiles convert` into `public/tiles/{rc,ta,sa2}.pmtiles`

A fresh clone can run the app from committed `public/data/prepared/` + `public/tiles/` without re-fetching.

### Runtime download budget (approx)

| Action | What loads | Size |
|--------|------------|------|
| First paint | JS + RC metrics + national + name index | ~1.5MB + ~250KB JSON |
| Zoom to TA | TA metrics only | ~5–15KB |
| Zoom to SA2 | SA2 metrics only | ~30–50KB |
| Click an area | `areas/{slug}.json` | ~40KB |
| Map tiles | PMTiles range requests | viewport only |

## NZ Data Explorer API

"The application programming interface (API) based on the SDMX standard allows a developer to programmatically access the data using simple RESTful URL and HTTP header options for various choices of response formats including JSON." - Data Explorer API

This application uses two datasets from the explorer. One of detailed single responses and another of level 3 responses. The level 3 responses contain specific ethnicity rather than just continent, but contains multiple responses for individuals who selected more than one response. The single/combination responses contains "only" data points.

### Structure queries

Ethnicity (detailed single / combination), age, and gender for the census usually resident population count, (RC, TALB, SA2, Health), 2013, 2018, and 2023 Censuses: https://api.data.stats.govt.nz/rest/dataflow/STATSNZ/CEN23_ECI_008/1.0?references=all

Ethnicity (detailed total responses level 3), age, and gender for the census usually resident population count, (RC, TALB, SA2, Health), 2013, 2018, and 2023 Censuses: https://api.data.stats.govt.nz/rest/dataflow/STATSNZ/CEN23_ECI_016/1.0?references=all

### Data queries

Ethnicity (detailed single / combination): https://api.data.stats.govt.nz/rest/data/STATSNZ,CEN23_ECI_008,1.0/?dimensionAtObservation=AllDimensions

Ethnicity (detailed total responses level 3): https://api.data.stats.govt.nz/rest/data/STATSNZ,CEN23_ECI_016,1.0/?dimensionAtObservation=AllDimensions

### Map Data

Map objects are from Stats NZ with clipped 2025 versions. Exported as Shapefile vectors, converted/simplified to GeoJSON, then packaged as PMTiles.

https://datafinder.stats.govt.nz/
