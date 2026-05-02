# Cloudcode

Cloudcode runs OpenAI Codex CLI tasks inside disposable E2B `codex` sandboxes.
Instead of using an OpenAI API key, it stores the Codex CLI ChatGPT OAuth
`auth.json` in Upstash Redis and writes it into `$CODEX_HOME/auth.json` inside
the sandbox just before `codex exec` runs.

## Environment

Create `.env.local` with:

```bash
E2B_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
GITHUB_TOKEN=... # optional, required for private repos or pushing elsewhere
```

## OAuth setup

1. Sign in locally with the Codex CLI using ChatGPT OAuth:

   ```bash
   codex login
   ```

2. Store the contents of `~/.codex/auth.json` through `POST /api/codex-auth`.
3. Run a task through `POST /api/codex-run`.

Codex OAuth refresh tokens can be single-use during refresh. This app stores one
canonical `auth.json` per profile in Redis and hydrates it into a fresh sandbox
for each run. If Codex reports that the refresh token was reused, revoked, or
expired, run `codex logout && codex login` locally and store the new `auth.json`.

## API

Store OAuth credentials:

```bash
curl -X POST http://localhost:3000/api/codex-auth \
  -H 'content-type: application/json' \
  -d '{"authJson":"<contents of ~/.codex/auth.json>"}'
```

Run Codex on a cloned GitHub repository:

```bash
curl -X POST http://localhost:3000/api/codex-run \
  -H 'content-type: application/json' \
  -d '{
    "repoUrl": "https://github.com/your-org/your-repo.git",
    "baseBranch": "main",
    "branchName": "cloudcode/my-change",
    "prompt": "Add error handling to all API endpoints"
  }'
```

The runner creates an E2B sandbox from the `codex` template, clones the repo to
`/home/user/repo`, creates the requested branch, runs `codex exec -C
/home/user/repo`, and returns the branch name, status, diff, stdout, stderr, and
final Codex message.

## Run

```bash
pnpm dev
```
