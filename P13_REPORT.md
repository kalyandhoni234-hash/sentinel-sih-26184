# P13: Full Frontend / Intelligence Platform Redesign

## Summary
Transformed the SENTINEL frontend from a generic dashboard into an intelligence operations center aesthetic. All visual surfaces redesigned while preserving backend, models, ranking logic, evaluation, and API contracts untouched.

## Files Modified

### 1. `frontend/src/app/globals.css` (283 lines)
- **Added CSS custom properties** (`--background`, `--surface`, `--surface-alt`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--danger`, `--warning`, `--success`) with OLED dark variants
- **New component classes** (raw CSS, no `@apply` to avoid circular dependency):
  - `.intel-panel` — Primary container with border-radius, border, background
  - `.intel-section`, `.intel-header` — Sectioned panel internals
  - `.section-label` — 10px uppercase tracking label
  - `.intel-metric`, `.intel-metric-value`, `.intel-metric-label` — KPI display
  - `.priority-indicator`, `.priority-high/medium/low` — Badge system with ring insets
  - `.alert-card`, `.alert-high`, `.alert-disagreement` — Alert containers
  - `.btn-primary`, `.btn-secondary` — Action buttons
  - `.badge-*` (blue, green, yellow, red, gray, purple) — Status badges
  - `.evidence-chip`, `.evidence-*` — Evidence group chips
  - `.split-view` — 60/40 grid layout for map + candidates
  - `.skeleton` — Loading animation
- **Fixed circular dependency**: OLED `.dark .text-gray-*` overrides moved from unlayered CSS into `@layer utilities`. All `@apply` references to gray-* utilities in `@layer components` replaced with raw CSS values.
- **Preserved**: All print styles, report-* classes, leaflet overrides, OLED color scheme

### 2. `frontend/src/app/layout.tsx` (75 lines)
- **Header**: Reduced to 12px height, sticky, blur backdrop (`backdrop-blur-xl`), thin border-bottom
- **Logo area**: "SENTINEL" in 13px bold + "Synthetic Data" amber badge + "Evidence-Based Decision Support" tagline
- **Navigation**: Cases + Status links
- **Actions**: ThemeToggle (OLED/light) + "+ New" primary button
- **Font**: Inter loaded via Google Fonts with `display=swap`
- **FOUC prevention**: Inline `<script>` in head reads `sentinel-theme` from localStorage

### 3. `frontend/src/app/page.tsx` (Command Center, ~680 lines)
- **System status bar**: Connection status, risk engine ready, 241 tests passing indicators
- **Intelligence Overview**: 6 KPI cards (Total Cases, Locations, Models, Avg Priority, Data Status)
- **Priority Distribution**: HIGH / MEDIUM / LOW counts with color-coded badges
- **Investigator Attention**: Alert cards with priority indicators
- **Geographic Intelligence**: Full-width map + Top Priority Locations split view
- **Investigation Queue**: Case cards with scenario badges, amounts, dates, locations
- **Scenario Distribution**: Breakdown by fraud type
- **Quick Actions**: New Investigation, View All, System Status buttons
- **Disclaimer**: Synthetic data notice at bottom

### 4. `frontend/src/app/investigations/[caseId]/page.tsx` (Investigation Detail, ~1686 lines)
- **Header**: intel-panel with Investigation + Synthetic Demo badges, case metadata, back link
- **At a Glance**: intel-panel with 8 metrics in grid layout
- **Analysis Context**: Left-bordered intel-panel with clock icon, analysis point explanation
- **#1 Priority Result**: Maintained existing structure, updated to intel-panel styling
- **Map + Candidates**: `split-view` class for 60/40 grid, "Geographic Intelligence" label
- **Controls bar**: Section labels, border-bottom separator
- **Model Comparison**: intel-panel with compare button
- **Forward-Looking Priorities**: intel-panel with numbered steps
- **Disclaimer**: Yellow-bordered warning box
- **Bottom Actions**: "← All Cases", "Generate Intelligence Report →", "New Investigation"

### 5. `frontend/src/app/investigations/[caseId]/report/page.tsx` (Report, ~760 lines)
- **ReportHeader**: Added "Intelligence Report" badge next to SENTINEL logo
- **Top bar**: Added breadcrumb ("← Back to Investigation | Intelligence Report")
- **Loading state**: Uses `var(--background)` and skeleton + "Generating intelligence report..." text
- **Error state**: Uses `.alert-card .alert-high` class
- **No data state**: Uses `.intel-panel` class
- **Preserved**: All print-* styles, report-* classes, section structure

### 6. `tests/test_rf_explanation_honesty.py`
- Fixed cp1252 Unicode decode error on Windows by adding `encoding="utf-8"` to two `.read_text()` calls (lines 231, 249)

## What Was NOT Changed (Frozen)
- Backend code, models, ranking logic, evaluation metrics
- API contracts, schemas, routes
- Ground-truth generation, leakage protections, temporal boundary
- Heatmap calculations, alert generation logic
- SentinelMap.tsx, SentinelMapDashboard.tsx, SentinelMapWrapper.tsx (already consistent)
- ThemeProvider.tsx, ThemeToggle.tsx (already working)

## Validation Results
- **pytest**: 241/241 passed (47.25s)
- **ruff check**: All checks passed
- **ruff format**: 65 files already formatted
- **tsc --noEmit**: Clean (no errors)
- **next lint**: Only known `no-page-custom-font` warning (pre-existing)
- **next build**: Compiled successfully, all 7 routes generated
- **Claim discipline**: CLEAN — no forbidden RF phrases, no ground-truth leakage
- **Analysis point**: Verified present in API schema, TS types, UI

## Design Principles Applied
- **Information hierarchy over decoration**: Border-radius 0.5rem, thin borders, no gradients
- **Restrained borders**: 1px solid var(--border), no heavy outlines
- **Typography hierarchy**: 10px section labels, 14px body, 24px headings
- **Location intelligence visually dominant**: Split-view map layout, full-width geographic section
- **"Priority Score" terminology**: Consistent across all pages
- **"Synthetic Data" indicator**: Visible in header and report
- **OLED dark theme**: Pure black (#000000) backgrounds, no blue tints
