# Agent Guidelines for Right Minds Maps

## Build Commands
- `npm run build` - Type-check and build production bundle
- `npm run dev` - Start development server (assume already running)
- `npm run lint` - Run Biome check
- `npm run lint:fix` - Auto-fix Biome issues
- `npm run typecheck` - TypeScript project references check
- `npm run knip` - Find unused exports/deps
- `npm run data:prepare` - Split census JSON into tiered/metrics caches

## Test Commands
- `npm test` - Vitest (jsdom)
- `npm run test:watch` - Vitest watch mode

## Code Style Guidelines

### TypeScript
- No semicolons
- Single quotes for strings
- Strict type checking enabled
- Use interfaces for complex object types
- Avoid `any` type; use proper typing

### React
- Functional components with hooks
- useState/useEffect for state management
- useCallback for stable function references
- Props: interface definitions required

### Imports
- React imports first
- Third-party libraries second
- Local imports last
- Single quotes, no semicolons

### Naming
- camelCase: variables, functions, hooks
- PascalCase: components, interfaces
- UPPER_SNAKE: constants

### Error Handling
- try/catch for async operations
- console.error for API failures
- Graceful fallbacks for missing data

### Formatting
- 2-space indentation
- Consistent spacing around operators
- Line breaks for readability
