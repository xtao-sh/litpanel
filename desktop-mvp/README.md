# Lit Panel Desktop

This directory contains the Electron wrapper and reproducible macOS packaging
pipeline for Lit Panel.

Packaged builds include:

- the FastAPI backend and reader agents;
- a portable Python 3.11 runtime with backend dependencies;
- the Next.js standalone production server and static assets;
- a clean synthetic demo database and demo data files;
- Electron as the frontend server runtime and desktop shell.

Private `.env` files, working databases, PDFs, local paths, and Python bytecode
are excluded from the bundle.

## Install Build Dependencies

```bash
cd desktop-mvp
npm install
```

## Run The Desktop Shell From Source

```bash
npm start
```

Local desktop development uses backend port `38000` and frontend port `38001`.
The normal browser development stack can continue using `8050` and `3050`.

## Smoke Test

```bash
npm run smoke
```

The smoke test starts both local services, checks their health endpoints, and
then stops managed processes.

## Build The macOS App And DMG

```bash
npm run dist:dmg
```

The command:

1. generates the Lit Panel app icon;
2. builds the Next.js standalone frontend;
3. downloads and verifies the pinned portable Python archive;
4. installs backend dependencies into the portable runtime;
5. creates the public demo seed;
6. removes build-only bytecode and executables;
7. packages and ad-hoc signs the Electron app;
8. creates the compressed DMG.

Outputs for version `0.1.0`:

- `dist/mac-arm64/Lit Panel.app`
- `dist/Lit Panel-0.1.0-arm64.dmg`

The current target is macOS Apple Silicon (`arm64`). The build is not
Apple-notarized because no Developer ID credentials are stored in the project.

## Runtime Data And Logs

On first packaged launch, the immutable demo seed is copied to:

```text
~/Library/Application Support/Lit Panel/
```

Subsequent launches reuse this writable database and data directory. The signed
application resources are never modified at runtime.

Packaged logs are stored under:

```text
~/Library/Logs/LitPanel-main.log
~/Library/Application Support/Lit Panel/runtime/logs/backend.log
~/Library/Application Support/Lit Panel/runtime/logs/frontend.log
```

Source-mode runtime files remain under `desktop-mvp/.runtime/`.

## Package Safety Checks

Before publishing, verify at minimum:

```bash
npm audit
codesign --verify --deep --strict "dist/mac-arm64/Lit Panel.app"
hdiutil verify "dist/Lit Panel-0.1.0-arm64.dmg"
```

The package preparation script also sanitizes Next.js build-root metadata and
stores portable data-root placeholders in the seed database. At runtime those
placeholders are rebased to the user's Application Support directory.
