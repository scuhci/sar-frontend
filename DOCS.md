# SMAR Frontend — Developer Documentation

## Overview

SMAR (Systematic Mobile Application Reviews) is a React web app built at the Santa Clara University HCI Lab. It lets academic researchers keyword-search the Google Play Store and iOS App Store and retrieve app metadata and reviews in structured CSV format. Live site: [smar-tool.org](http://smar-tool.org/)

---

## Tech Stack

| Concern | Library/Tool |
|---|---|
| UI Framework | React 18 |
| Routing | React Router DOM v6 |
| Component Library | MUI (Material UI + MUI Joy + MUI X DataGrid) |
| HTTP Client | Axios |
| ZIP Downloads | JSZip |
| Mobile Detection | UA-Parser-JS |
| Build Tooling | Create React App (react-scripts) |

---

## Project Structure

```
src/
├── App.js                        # Root router and mobile detection
├── index.js                      # React DOM entry point
├── pages/
│   ├── Home.js                   # Keyword search page
│   ├── TopCharts.jsx             # Top charts/collections page
│   ├── BulkReviews.jsx           # Bulk review scraper page
│   ├── UserGuide.jsx             # In-app user documentation
│   └── About.jsx                 # Team and project info
├── components/
│   ├── SearchBar.js              # Search input + results DataGrid
│   ├── TopLists.js               # Top charts search controls
│   ├── BulkReviewSearchBar.jsx   # Two-step bulk reviews UI
│   ├── BulkReviewStepper.jsx     # Stepper indicator for bulk flow
│   ├── DownloadReviews.js        # Per-app review download button
│   ├── RenderRow.js              # DataGrid custom row renderer
│   ├── NavigationBar.js          # Top nav bar with active route state
│   ├── Footer.jsx                # Footer with HCI Lab links
│   ├── MobileScreen.js           # Mobile device warning screen
│   ├── Loading.js                # Loading modal (keyword search)
│   ├── LoadingTopLists.js        # Loading modal (top lists)
│   ├── ReviewsLoading.js         # Loading modal (reviews)
│   ├── NoResults.js              # Empty state display
│   ├── Citation.js               # Research citation card
│   ├── Dropdown.js               # Country selector autocomplete
│   ├── ListBox.js                # Generic list picker
│   ├── TeamMemberCard.js         # Team profile card
│   ├── ExampleSearches.jsx       # Suggested search chips
│   ├── ExampleTopCharts.jsx      # Example top charts links
│   ├── NotifyMe.js               # Email notification signup
│   └── SelectedScraperProvider.jsx # Context: Play Store / App Store selection
├── constants/
│   ├── columns.js                # DataGrid column definitions (per store)
│   ├── permissionColumns.js      # Android permissions columns
│   ├── topListCategories.js      # Collection/category options (both stores)
│   ├── countryCodes.js           # Country code → name mapping
│   ├── TeamMembers.js            # Team member profile data
│   ├── alumni.js                 # Alumni data
│   ├── externalLinks.js          # External URL references
│   └── urlConstants.js           # API endpoint constants
├── css/                          # Per-component stylesheets
└── res/                          # Static images (screenshots, logos)
```

---

## Routing

Defined in `App.js` using React Router v6:

| Path | Page Component | Description |
|---|---|---|
| `/` | `Home.js` | Keyword search |
| `/toplists` | `TopCharts.jsx` | Top charts/collections |
| `/bulkreviews` | `BulkReviews.jsx` | Bulk review scraper |
| `/userguide` | `UserGuide.jsx` | User documentation |
| `/about` | `About.jsx` | Team info |

All routes are wrapped in `SelectedScraperProvider` so every page shares the active store selection.

---

## Global State

### `SelectedScraperProvider` (`src/components/SelectedScraperProvider.jsx`)

A React Context that tracks which app store is active ("Play Store" or "App Store"). The value is persisted to `localStorage` so it survives page refreshes. Default value: `"Play Store"`.

**Usage:**
```jsx
import { useContext } from 'react';
import { ScraperContext } from '../components/SelectedScraperProvider';

const { selectedScraper, setSelectedScraper } = useContext(ScraperContext);
```

---

## Backend API

The proxy base URL is set in `package.json`:

```json
"proxy": "https://54.215.190.5"
```

To point at a local backend, change this value to `http://localhost:<port>`.

### Endpoints

#### Keyword Search
| Store | Method | Endpoint |
|---|---|---|
| Play Store | GET | `/api/search?query=&includePermissions=&countryCode=&time=` |
| App Store | GET | `/ios/search?query=&countryCode=&time=` |

#### Top Lists
| Store | Method | Endpoint |
|---|---|---|
| Play Store | GET | `/api/toplists?collection=&category=&country=&includePermissions=` |
| App Store | GET | `/ios/toplists?collection=&category=&categoryName=&country=` |

#### Reviews
| Store | Method | Endpoint |
|---|---|---|
| Play Store | GET | `/api/reviews?appId=&countryCode=&sortBy=` |
| App Store | GET | `/ios/reviews?appId=&countryCode=&sortBy=` |

#### CSV Downloads
| Purpose | Method | Endpoint |
|---|---|---|
| Search results | GET | `/api/download-csv?query=&includePermissions=&countryCode=` |
| Reproducibility log | GET | `/api/download-relog?query=&...` |
| Top lists CSV | GET | `/api/download-top-csv?query=&includePermissions=` |
| Reviews relog | GET | `/api/download-reviews-relog?appId=&countryCode=&store=&sorting=` |

All download endpoints return binary blobs with a `Content-Disposition` header containing the filename.

---

## Key Features

### 1. Keyword Search

1. User enters a keyword or package name, selects a country
2. Optional: enable permission scraping (Play Store only; adds 1–5 min)
3. GET request fires to `/api/search` or `/ios/search`
4. Results display in an MUI X DataGrid with pagination
5. Each row has a "Scrape Reviews" button (disabled if 0 or >100k reviews)
6. "Download" packages results + reproducibility log into a ZIP

### 2. Top Lists / Collections

1. Select collection (Top Free, Top Paid, Top Grossing, etc.) and category
2. Same DataGrid + download flow as keyword search
3. App Store adds device type selector (iOS / iPad / Mac)

### 3. Bulk Review Scraper

A two-step stepper:

- **Step 1:** Paste comma-separated app IDs (max 20), backend fetches metadata for each
- **Step 2:** Select review sort order (Recency, Rating, Helpfulness), trigger download
- Reviews from all apps are merged into a single CSV; a linear progress bar tracks completion
- Limits: 10,000 reviews/app (Play Store), 500 reviews/app (App Store)

### 4. Download System

All downloads go through the same pattern:
1. Two parallel Axios requests: CSV data + reproducibility log
2. Filenames extracted from `Content-Disposition` response headers
3. UTF-8 BOM prepended to CSV blobs for Excel compatibility
4. JSZip bundles both files
5. A temporary `<a>` element triggers the browser download, then is removed

---

## Components Reference

### `SearchBar.js`
Core search UI. Manages: query input, country selection, permissions toggle, results DataGrid, loading state, and download buttons. Uses `AbortController` to cancel in-flight requests on new searches.

### `TopLists.js`
Handles top charts searches. Extends SearchBar's pattern with collection/category dropdowns populated from `constants/topListCategories.js`.

### `BulkReviewSearchBar.jsx`
Two-phase review scraper. Phase 1 validates and fetches app metadata. Phase 2 triggers paginated review downloads across all selected apps with aggregated progress.

### `NavigationBar.js`
Fixed header. Uses `useLocation` to highlight the active route.

### `Loading.js` / `LoadingTopLists.js` / `ReviewsLoading.js`
Modal dialogs shown during async operations. Include search metadata display and `NotifyMe` email signup.

### `MobileScreen.js`
Rendered instead of page content on mobile devices (detected via UAParser). Shows a message directing users to the desktop site.

---

## Running Locally

```bash
# 1. Install dependencies (first time only)
npm install

# 2. Switch to the stable branch
git checkout production

# 3. Start dev server
npm start
```

The app proxies API calls to `https://54.215.190.5` by default. To use a local backend, update `"proxy"` in `package.json` before starting.

### Backend repositories

| Repo | Branch | Start command |
|---|---|---|
| SAR-backend (Play Store) | `gplay-backend` | `node index.js` |
| SAR-backend (App Store) | `ios-backend` | `node index.js` |

---

## Content Security Policy

Set in `public/index.html`. Relevant directives:

- **img-src:** Allows Google Play CDN, Apple CDN, and AWS S3 (for app icons)
- **script-src:** Self only
- **style-src:** Self + `unsafe-inline`
- **font-src:** Self only

If you add a new image source, update the `img-src` directive.

---

## Adding a New Store or Feature

1. Add endpoint constants to `src/constants/urlConstants.js`
2. Add column definitions to `src/constants/columns.js`
3. Add any new collections/categories to `src/constants/topListCategories.js`
4. Extend `SelectedScraperProvider` if a new global toggle is needed
5. Add a route in `App.js` if a new page is required
