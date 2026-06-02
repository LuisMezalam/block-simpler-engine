# Block Diagram Simplifier

A React/Vite control-systems workspace for reducing block diagrams, checking course identities, and studying controller behavior with pole-zero, step, Bode, Nyquist, Nichols, and root-locus views.

## Local Development

```sh
npm ci
npm run dev
```

The development server defaults to Vite. If another local server is already using the default port, pass a port explicitly:

```sh
npm run dev -- --host 127.0.0.1 --port 5176
```

## Verification

```sh
npm test -- --run
npm run build
npm run lint
```

## Project Sharing

The Builder tab can export the current transfer-function setup as JSON, load it back later, or copy a shareable URL with the project encoded in the `project` query parameter.

## GitHub Pages Deployment

This repository includes `.github/workflows/deploy-pages.yml`. After pushing to `main` or `master`, enable GitHub Pages in repository settings and choose GitHub Actions as the publishing source. The workflow installs dependencies, runs tests, builds Vite with the repository-name base path, uploads `dist`, and deploys it to Pages.

For custom hosting paths, set:

```sh
VITE_BASE_PATH=/your-base-path/ npm run build
```

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- shadcn/ui primitives
- Vitest
