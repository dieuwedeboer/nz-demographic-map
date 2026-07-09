import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  entry: ['scripts/**/*.{mjs,ts}'],
  project: ['src/**/*.{ts,tsx}', 'scripts/**/*.{mjs,ts}'],
}

export default config
