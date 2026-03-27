# Delivery Flow Lab

Static TypeScript frontend for exploring product-development queues across sequential stages such as shaping, build, review, and release.

## What it does

- Models left-to-right workflow stages as queues.
- Lets you change active workstreams, handoff frequency, staffing, and variability.
- Highlights the likely bottleneck and estimates a comfortable concurrency limit.

## Run locally

```bash
npm install
npm run dev
```

## Build for static hosting

```bash
npm run build
```

The project includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.

## Publish on GitHub Pages

1. Create a GitHub repository named `delivery-flow-lab`.
2. Push this project to the `main` branch.
3. In GitHub, open `Settings -> Pages` and set the source to `GitHub Actions`.
4. Push again or run the `Deploy to GitHub Pages` workflow manually.

The Vite config is set up for the repository path `/delivery-flow-lab/`.
