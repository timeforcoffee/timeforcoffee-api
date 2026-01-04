# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NestJS-based API backend for the Time for Coffee iOS app, providing Swiss public transport departure information. Aggregates data from multiple transit APIs (ZVV, search.ch, OpenTransportData) with intelligent fallback and caching.

## Common Commands

```bash
# Development
npm run start:dev          # Start in watch mode
npm run start              # Start without watch

# Build
npm run build              # Build to dist/

# Lint and format
npm run lint               # ESLint with auto-fix
npm run format             # Prettier

# Tests
npm run test               # Run all tests
npm run test:watch         # Watch mode
npm run test:e2e           # E2E tests

# Docker build
docker run -p 6455:6379 --rm -d redis:6-alpine  # Start Redis
./build-docker.sh          # Build Docker image
```

## Architecture

### Data Flow
1. Requests hit `ChController` (`src/ch/ch.controller.ts`) which is the main entry point
2. `DbService` looks up station info from SQLite (`stations.sqlite`) to determine which API backend to use
3. Multiple backends are tried with fallback: ZVV → search.ch → OpenTransportData
4. Results are cached using Redis with a custom `@Cache()` decorator

### Key Modules

- **ch/**: Main controller orchestrating stationboard requests with multi-backend fallback logic
- **zvv/**: ZVV HAFAS API integration (primary for Zürich region, uses `zvv.hafas.cloud`)
- **search/**: search.ch API integration (fallback, provides accessibility info)
- **opentransportdata/**: OTD API integration (secondary fallback)
- **db/**: SQLite service for station metadata and API routing decisions
- **helpers/**: Shared utilities including the `@Cache()` decorator and HTTP client
- **stations/**: Station search endpoint

### Caching Strategy
`src/helpers/helpers.cache.ts` implements a Redis-based cache with:
- Cache stampede prevention using locking
- Automatic fallback to in-memory cache when Redis unavailable
- TTL-based expiration
- Decorator-based application via `@Cache({ ttl: seconds })`

### API Endpoints
- `GET /api/ch/stationboard/:id` - Main departure board
- `GET /api/:api/stationboard/:id/:starttime` - Departures from specific time
- `GET /api/ch/connections/:from/:to/:datetime` - Connection search
- `GET /api/:api/stations/:name` - Station search

### Environment Variables
- `REDIS_HOST` - Redis hostname (default: `redis-service.tfc`)
- `REDIS_PORT` - Redis port (default: 6379)

## Important Patterns

- Station IDs may need stripping via `stripId()` function from `ch.service.ts`
- Date/time handling uses `moment-timezone` with Europe/Zurich timezone
- Output date format constant: `OUTPUT_DATE_FORMAT` in `ch.service.ts`
- `DEFAULT_DEPARTURES_LIMIT` controls how many departures to fetch per request
