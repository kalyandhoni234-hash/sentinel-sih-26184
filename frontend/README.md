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
│   ├── health/page.tsx     # API status page
│   └── investigations/
│       ├── page.tsx        # Case list
│       └── [caseId]/page.tsx  # Case detail + ranking
├── components/
│   ├── MapPlaceholder.tsx  # GIS map placeholder
│   └── RankingTable.tsx    # Tabular ranking view
├── lib/
│   └── api.ts              # API client
└── types/
    └── api.ts              # TypeScript types
```
