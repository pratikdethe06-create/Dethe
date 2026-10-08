# DetheAI — dethe.in

Static frontend plus Node API functions for Vercel. `nextjs-source/` is preserved historical source; the active app is in `public/`, `api/` and `shared/`.

## Run and validate

Use Node 24 (root package has no external dependencies):

```sh
node --env-file=.env server.js   # copy .env.example to .env and configure first
# Or: node server.js with environment supplied by your shell
npm run build
npm test
```

Local URL: http://localhost:8080. Use `APP_ORIGIN=http://localhost:8080` and register the matching Google callback for local login. With no credentials the public pages still load; account/provider operations report unavailable.

## Required configuration

See [.env.example](.env.example) and [BACKEND.md](BACKEND.md). Production login and credits require Google OAuth, a session signing secret, and a private GitHub data repository with a scoped Contents read/write token. Payments require Razorpay credentials. Sarvam enables premium speech and transcription; AI writing needs a configured supported provider. Set secrets in the deployment environment, never in frontend files.

## Deploy

1. Configure the environment in the existing Vercel project. Preserve the existing private data repository and payment credentials for migration.
2. Deploy the repository root with `vercel.json`: build `npm run build`, output `dist`, Node API functions under `api/`.
3. Verify Google callback, signed-in credits, captured payment verification, key creation/revocation and the real speech providers on the deployed URL.
4. Verify `/`, `/voices`, `/ai-script`, `/video-to-text`, policy pages and unknown-path 404s. Inspect the sitemap in Search Console using site-owner access.

A branch push alone does not confirm deployment. Production publication requires access to the Vercel project and successful live checks.

## Search-friendly pages

The build copies `public/` into ignored `dist/` and generates distinct initial HTML for the four public tool routes. Do not deploy only `public/`: retain the root API functions and routing configuration.

Metadata and page copy live in `public/assets/page-metadata.js`; `shared/seo-pages.js` renders them for both build and local server. The active bundle calls `detheUpdateMetadata` on navigation. Preserve this hook when replacing the bundle. Unknown routes return 404.

Metadata and crawlability improvements do not guarantee indexing or traffic. Actual impressions and clicks require Search Console/analytics access.
