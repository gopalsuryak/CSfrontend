# Equity Desk Frontend (Next.js)

This folder contains a professional Next.js frontend for the Share Certificates workspace.

## Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS v4

## Run Locally

From this folder:

```bash
npm install
npm run dev
```

App URL:

- http://localhost:3000

## Quality Checks

```bash
npm run lint
npm run build
```

## Project Structure

- `src/app/layout.tsx`: global layout, fonts, metadata
- `src/app/globals.css`: design tokens and app styling
- `src/app/page.tsx`: operations dashboard UI

## Notes for Integration

- This frontend is integrated directly with the Python workflows through Next.js API bridge routes.
- No separate legacy UI process is required for day-to-day frontend usage.

## Python Bridge Integration

This project now includes live bridge routes that call your existing Python codebase:

- `GET /api/bridge/companies`
- `GET /api/bridge/dashboard?companyId=<id>`
- `POST /api/bridge/registers/generate`
- `POST /api/bridge/assistant/chat`

The bridge script is located at:

- `../web_api_bridge.py`

By default, Next.js executes:

- `../.venv/Scripts/python.exe`

You can override these with env vars when needed:

- `PYTHON_EXE`
- `BRIDGE_SCRIPT`

For the AI assistant layer (optional but recommended):

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, defaults to `gpt-4.1-mini`)

If `OPENAI_API_KEY` is not set, the assistant still works in a limited heuristic mode for shareholding queries and transfer-detail collection.
