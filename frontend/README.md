# Frontend

This frontend is part of the local research knowledge base workspace.

## Recommended startup

From the project root:

```bash
./scripts/dev.sh start
```

This starts:

- frontend at `http://127.0.0.1:3050`
- backend at `http://127.0.0.1:8050`

The script now prefers `python3.11` for the backend virtual environment when available, because the backend requires Python 3.10+.

## Frontend-only development

If the backend is already running, you can start the frontend alone:

```bash
NEXT_PUBLIC_API_URL=http://127.0.0.1:8050 \
NEXT_PUBLIC_GRAPHQL_URL=http://127.0.0.1:8050/graphql \
npm run dev -- --hostname 127.0.0.1 --port 3050
```

## Production-style local serving

To run the self-restarting local supervisor:

```bash
./scripts/serve.sh
```

This uses:

- frontend at `http://127.0.0.1:3050`
- backend at `http://127.0.0.1:8050`

## Build check

```bash
npm run build
```
