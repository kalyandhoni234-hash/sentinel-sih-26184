# SENTINEL Frontend

Next.js + React + Tailwind CSS dashboard for the SENTINEL cybercrime investigation system.

## Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API URL |

## Build

```bash
npm run build
npm start
```

## Structure

```
src/
├── app/                    # Next.js App Router pages
│   ├── layout.tsx          # Root layout with nav
│   ├── page.tsx            # Home page
│   ├── globals.css         # Tailwind + Leaflet CSS overrides
│   ├── health/page.tsx     # API status page
│   └── investigations/
│       ├── page.tsx        # Case list (search, sort, table)
│       └── [caseId]/page.tsx  # Case detail + ranking + map
├── components/
│   ├── SentinelMap.tsx     # Leaflet GIS map (origin, candidates, popups, legend)
│   └── SentinelMapWrapper.tsx  # SSR-safe dynamic import wrapper
├── lib/
│   ├── api.ts              # API client (health, list, detail, rank)
│   └── leaflet-fix.ts      # Leaflet default icon fix
└── types/
    └── api.ts              # TypeScript types matching backend schemas
```
