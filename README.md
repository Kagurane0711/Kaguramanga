# Polin Manga

A full-stack **Manga & Korean Manhwa** web reader built with React 19, Vite, Tailwind CSS v4, and Express (TypeScript), featuring strict Japanese Manga vs. Korean Manhwa catalog separation, resilient multi-source chapter fetching, Light / Dark / AMOLED themes, and Vercel / Render / Docker deployment support.

---

## Features

- **Separated Manga & Manhwa Catalogs**
  - **Polin Manga (`/`)**: Japanese manga (`ja`, excluding vertical long-strip webtoons by default) with Featured Series spotlight, sort controls (**Latest**, **Top Read**, **Newest**), status filters (**All**, **Ongoing**, **Completed**), and genre filtering.
  - **Polin Manhwa (`/manhwa`)**: Dedicated Korean manhwa (`ko`) catalog with its own featured spotlight and filters.
- **Full Genre & Tag Directory (`/genres`)**
  - Browse 80+ genres, demographics, themes, and formats with live text filtering and category tabs.
- **Exact Counts & Deep Page Jump Pagination**
  - Displays 24 titles per page with exact total title and page counts across all filters.
  - Click **Page X of Y** to open an inline jump popover with direct page input and one-click shortcuts (`1`, `-10`, `+10`, `+50`, `+100`, last page).
  - Supports navigating past upstream 10,000-offset limits via tail sort inversion and disjoint demographic partitioning.
- **Seamless Manga Reader (`/read/:id/:ch`)**
  - Vertical strip (webtoon) and single-page reading modes, keyboard navigation, chapter switcher, reading progress tracking, and background prefetching of the next chapter.
- **Personal Library & Reading History (`/library`)**
  - Bookmark series and resume reading where you left off.
- **Three Built-in Themes**
  - Switch smoothly between **Light**, **Dark**, and **AMOLED** (pure black) with zero flash on page load.
- **Performance & Serverless Resilience**
  - Catalog pages pull directly from MangaDex + batch follower stats (zero upstream HTML scraping on catalog views) with lazy MangaHook chapter lookup and automatic MangaDex English chapter & search fallbacks.
  - Stale-while-revalidate caching, in-flight request deduplication, gzip compression, streaming `/api/proxy/image` with bounded cover LRU cache, `s-maxage` Edge CDN headers, and lazy-loaded frontend routes.

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 8, React Router 7, Tailwind CSS v4, Zustand, Lucide Icons, Motion, React Toastify
- **Backend**: Express 4, TypeScript (`tsx`), Cheerio, `compression`
- **Deployment**: Vercel Serverless (`/api/index.ts` + `vercel.json`), Render (`render.yaml`), Docker (`Dockerfile`)

---

## Getting Started

### Prerequisites

- **Node.js** 20+ (or **Bun** 1.4+)
- **npm** or **bun**

### Installation & Local Development

1. **Clone the repository**

   ```bash
   git clone <your-repo-url>
   cd <your-repo-folder>
   ```

2. **Install dependencies**

   ```bash
   npm install
   # or
   bun install
   ```

3. **Configure environment variables** (optional — defaults work out of the box)

   ```bash
   cp .env.example .env
   ```

4. **Start the development server**

   ```bash
   npm run dev
   ```

   The app and API run together on **`http://localhost:3000`**.

---

## Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Express + Vite middleware dev server on port `3000` |
| `npm run build` | Builds the production frontend bundle into `dist/` |
| `npm run start` | Runs the production Express server (`server.ts`) serving `dist/` + `/api` |
| `npm run preview` | Previews the built Vite frontend locally |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Removes build output (`dist/`) |

---

## Environment Variables

See `.env.example` for the full template.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Server port (ignored on Vercel serverless) |
| `VITE_API_BASE_URL` | `/api` | Frontend API base path |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed origin for cross-origin API requests |
| `IMAGE_PROXY_ALLOWED_HOSTS` | *(built-in CDN allowlist)* | Comma-separated HTTPS hostnames allowed by `/api/proxy/image` |
| `MANGAKAKALOT_BASE_URL` | `https://www.mangakakalove.com` | Active MangaHook mirror base URL |
| `MANGAHOOK_API_URL` | *(empty)* | Optional external self-hosted MangaHook API server URL |
| `MANGAHOOK_API_KEY` | *(empty)* | Optional API key header when using `MANGAHOOK_API_URL` |

---

## API Overview

All API endpoints are mounted under `/api`:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/genres` | Full list of supported genres, demographics, themes, and formats |
| `GET` | `/api/mangaList` | Paginated Japanese manga catalog (`page`, `type`, `state`, `category`) |
| `GET` | `/api/manhwaList` | Paginated Korean manhwa catalog (`page`, `type`, `state`, `category`) |
| `GET` | `/api/manga/:id` | Series metadata, cover, tags, and deduplicated chapter list |
| `GET` | `/api/manga/:id/:ch` | Chapter page image URLs, navigation metadata, and series cover |
| `GET` | `/api/search/:query` | Search titles with automatic MangaDex fallback |
| `GET` | `/api/proxy/image?url=...` | Allowlisted HTTPS image proxy with cover LRU cache & page streaming |
| `POST` | `/api/auth/login` | Email or demo session sign-in |
| `GET` | `/api/auth/token/renew` | Renew session access token |
| `POST` | `/api/auth/logout` | Revoke active session |
| `GET` / `PUT` / `DELETE` | `/api/user/library` | Manage saved bookmarks |
| `PUT` | `/api/user/history` | Save chapter reading progress |

---

## Project Structure

```text
.
├── api/
│   └── index.ts              # Vercel serverless Express entry point
├── public/                   # Static assets and favicon
├── server/
│   ├── db.ts                 # In-memory user session, bookmark & history store
│   ├── routes/
│   │   └── api.ts            # Express API routes & streaming image proxy
│   ├── services/
│   │   └── mangahook.ts      # MangaDex + MangaHook catalog, chapter & search service
│   └── types.ts              # Shared backend TypeScript types
├── src/
│   ├── components/           # Navbar, Footer, MangaCard, PageJumpControl, SearchBar, etc.
│   ├── routes/               # Home, Manhwa, Genres, MangaDetail, MangaReader, SearchPage, Library, Login
│   ├── services/
│   │   └── api.ts            # Axios client with TTL cache & in-flight deduplication
│   ├── store/                # Zustand stores (theme, catalog brand, auth/library)
│   ├── types/                # Frontend TypeScript interfaces
│   ├── App.tsx               # Lazy-loaded route definitions
│   └── main.tsx              # React entry point
├── server.ts                 # Node/Express entry point (dev Vite middleware + prod static)
├── vercel.json               # Vercel API + SPA rewrite rules
├── render.yaml               # Render Blueprint configuration
├── Dockerfile                # Production Docker image (Node 22 + Bun)
└── vite.config.ts            # Vite + Tailwind CSS v4 configuration
```

---

## Deployment

### Vercel

The repo includes `vercel.json` and `/api/index.ts` out of the box:

1. Import the repository in [Vercel](https://vercel.com).
2. Keep the default Vite framework settings (`npm run build`, output directory `dist`).
3. Deploy — `/api/*` requests automatically route to `api/index.ts` with Edge CDN caching (`s-maxage`), and all client routes rewrite to `/index.html`.

### Render

Use the included `render.yaml` Blueprint to deploy the Dockerized full-stack server with `/api/health` checks pre-configured.

### Docker

```bash
docker build -t polin-manga .
docker run -p 10000:10000 -e PORT=10000 polin-manga
```
