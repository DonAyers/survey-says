# Deploying Survey Says

Vercel only runs stateless serverless/edge functions — it can't host the
persistent Bun process with native WebSockets and in-memory `Map<string, Room>`
game state that this app is built on. So we split the deploy:

- **Frontend** (static Vite/SolidJS build) → **Vercel**
- **Backend** (`server.ts`, the Bun WS/game server) → **Fly.io** (or any host
  that runs a long-lived process — Railway/Render work too with minor tweaks)

## 1. Backend on Fly.io

Prereqs: [`fly` CLI](https://fly.io/docs/flyctl/install/) installed, `fly auth login`.

```bash
fly launch --no-deploy --copy-config --name <your-app-name>   # first time only
fly deploy
```

This builds `Dockerfile` (installs deps with `bun install`, runs
`bun run server.ts`) and starts the game server on Fly's internal port 8080
(see `fly.toml`). Note `min_machines_running = 0` — the machine may sleep
when idle, and **in-memory room state is lost on restart**. That's fine for
a prototype; bump `min_machines_running = 1` in `fly.toml` if you want rooms
to survive idle periods (costs more since the VM stays up).

Once deployed, note your app's URL, e.g. `https://survey-says.fly.dev`.

## 2. Frontend on Vercel

Prereqs: [Vercel CLI](https://vercel.com/docs/cli) or just connect the GitHub
repo in the Vercel dashboard.

1. Import `DonAyers/survey-says` in Vercel (or run `vercel` from this repo).
2. `vercel.json` already sets the build command (`npm run build`) and output
   dir (`dist`) — Vercel should auto-detect these too.
3. Set an environment variable in the Vercel project settings:
   - `VITE_WS_URL` = `wss://<your-fly-app>.fly.dev` (the backend from step 1,
     **no trailing slash, no `/ws` suffix** — the frontend appends that).
4. Deploy. The frontend will connect its WebSocket to the Fly backend instead
   of same-origin.

## Local development

Unchanged — `npm run dev-stack` still runs both the Vite dev server (proxying
`/ws` to `localhost:5551`) and the Bun server together on one machine.
`VITE_WS_URL` is only needed when frontend and backend are on different hosts.

## Continuous deployment

- **Frontend (Vercel)**: already automatic. The GitHub repo is connected to
  the Vercel project, so every push to `main` triggers a production deploy —
  no extra setup needed.
- **Backend (Fly.io)**: automated via `.github/workflows/fly-deploy.yml`,
  which runs `flyctl deploy` on every push to `main` that touches
  `server.ts`, `Dockerfile`, `fly.toml`, `package.json`, or `bun.lock` (or can
  be triggered manually from the Actions tab). To enable it:
  1. Generate a deploy token: `fly tokens create deploy -a survey-says`.
  2. Add it as a repo secret named `FLY_API_TOKEN`
     (Settings → Secrets and variables → Actions → New repository secret).
  3. Push to `main` — the workflow builds and deploys automatically. You can
     still run `fly deploy` locally any time for out-of-band deploys.

## Custom domain / CORS

The Bun server sends permissive CORS headers (`Access-Control-Allow-Origin: *`)
on its plain HTTP routes, and WebSocket upgrades aren't subject to CORS, so no
further config is needed if you put a custom domain in front of either side.
