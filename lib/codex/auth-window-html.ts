import { escapeHtml } from "@/lib/shared/html-escape"

/**
 * Standalone HTML shell for the Codex/ChatGPT auth windows (device-code page
 * and the post-redirect message page). These render outside the React tree, so
 * they cannot use the app's components — instead they mirror the design-system
 * tokens from `app/globals.css` (colors, radius, button + card treatments) so
 * the popups look like the rest of Cloudcode in both light and dark.
 */

const CODEX_AUTH_WINDOW_BASE_CSS = `
:root {
  color-scheme: light dark;
  --background: oklch(1 0 0);
  --foreground: oklch(0.145 0 0);
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.145 0 0);
  --primary: oklch(0.205 0 0);
  --primary-foreground: oklch(0.985 0 0);
  --secondary: oklch(0.97 0 0);
  --secondary-foreground: oklch(0.205 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --border: oklch(0.922 0 0);
  --field: oklch(0 0 0 / 0.07);
  --ring: oklch(0.708 0 0);
  --radius: 0.45rem;
}
@media (prefers-color-scheme: dark) {
  :root {
    --background: oklch(0.145 0 0);
    --foreground: oklch(0.985 0 0);
    --card: oklch(0.205 0 0);
    --card-foreground: oklch(0.985 0 0);
    --primary: oklch(0.922 0 0);
    --primary-foreground: oklch(0.205 0 0);
    --secondary: oklch(0.269 0 0);
    --secondary-foreground: oklch(0.985 0 0);
    --muted: oklch(0.269 0 0);
    --muted-foreground: oklch(0.708 0 0);
    --destructive: oklch(0.704 0.191 22.216);
    --border: oklch(1 0 0 / 10%);
    --field: oklch(1 0 0 / 10%);
    --ring: oklch(0.556 0 0);
  }
}
* {
  box-sizing: border-box;
}
html,
body {
  height: 100%;
}
body {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 0.875rem;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.card {
  width: 100%;
  max-width: 24rem;
  padding: 2rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.8);
  background: var(--card);
  color: var(--card-foreground);
  text-align: center;
}
.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  margin: 0 auto 1.25rem;
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.8);
  background: var(--secondary);
  color: var(--foreground);
}
.brand svg {
  width: 1.4rem;
  height: 1.4rem;
}
h1 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.subtitle {
  margin: 0.5rem 0 0;
  color: var(--muted-foreground);
}
.code {
  display: block;
  width: fit-content;
  margin: 1.5rem auto;
  padding: 0.75rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--secondary);
  color: var(--foreground);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: clamp(1.75rem, 7vw, 2.5rem);
  font-weight: 600;
  letter-spacing: 0.18em;
  text-indent: 0.18em;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  height: 2.25rem;
  padding: 0 0.75rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: var(--foreground);
  color: var(--background);
  font: inherit;
  font-weight: 500;
  white-space: nowrap;
  text-decoration: none;
  cursor: pointer;
  transition: opacity 0.15s ease, background-color 0.15s ease;
}
.btn:hover {
  opacity: 0.9;
}
.btn-secondary {
  background: var(--secondary);
  color: var(--secondary-foreground);
}
.btn:focus-visible {
  outline: none;
  border-color: var(--ring);
  box-shadow: 0 0 0 3px color-mix(in oklch, var(--ring) 30%, transparent);
}
.status {
  margin: 1.25rem 0 0;
  color: var(--muted-foreground);
}
.status.error,
.error {
  color: var(--destructive);
}
.hint {
  margin: 1.5rem 0 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--border);
  color: var(--muted-foreground);
  font-size: 0.8125rem;
  line-height: 1.45;
}
.hint a {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;
}
`.trim()

/** OpenAI/ChatGPT brand mark, mirrored from `components/ui/brand-icons.tsx`. */
export const CODEX_AUTH_WINDOW_OPENAI_ICON = `<svg viewBox="0 0 256 260" preserveAspectRatio="xMidYMid" aria-hidden="true" fill="currentColor"><path d="M239.184 106.203a64.716 64.716 0 0 0-5.576-53.103C219.452 28.459 191 15.784 163.213 21.74A65.586 65.586 0 0 0 52.096 45.22a64.716 64.716 0 0 0-43.23 31.36c-14.31 24.602-11.061 55.634 8.033 76.74a64.665 64.665 0 0 0 5.525 53.102c14.174 24.65 42.644 37.324 70.446 31.36a64.72 64.72 0 0 0 48.754 21.744c28.481.025 53.714-18.361 62.414-45.481a64.767 64.767 0 0 0 43.229-31.36c14.137-24.558 10.875-55.423-8.083-76.483Zm-97.56 136.338a48.397 48.397 0 0 1-31.105-11.255l1.535-.87 51.67-29.825a8.595 8.595 0 0 0 4.247-7.367v-72.85l21.845 12.636c.218.111.37.32.409.563v60.367c-.056 26.818-21.783 48.545-48.601 48.601Zm-104.466-44.61a48.345 48.345 0 0 1-5.781-32.589l1.534.921 51.722 29.826a8.339 8.339 0 0 0 8.441 0l63.181-36.425v25.221a.87.87 0 0 1-.358.665l-52.335 30.184c-23.257 13.398-52.97 5.431-66.404-17.803ZM23.549 85.38a48.499 48.499 0 0 1 25.58-21.333v61.39a8.288 8.288 0 0 0 4.195 7.316l62.874 36.272-21.845 12.636a.819.819 0 0 1-.767 0L41.353 151.53c-23.211-13.454-31.171-43.144-17.804-66.405v.256Zm179.466 41.695-63.08-36.63L161.73 77.86a.819.819 0 0 1 .768 0l52.233 30.184a48.6 48.6 0 0 1-7.316 87.635v-61.391a8.544 8.544 0 0 0-4.4-7.213Zm21.742-32.69-1.535-.922-51.619-30.081a8.39 8.39 0 0 0-8.492 0L99.98 99.808V74.587a.716.716 0 0 1 .307-.665l52.233-30.133a48.652 48.652 0 0 1 72.236 50.391v.205ZM88.061 139.097l-21.845-12.585a.87.87 0 0 1-.41-.614V65.685a48.652 48.652 0 0 1 79.757-37.346l-1.535.87-51.67 29.825a8.595 8.595 0 0 0-4.246 7.367l-.051 72.697Zm11.868-25.58 28.138-16.217 28.188 16.218v32.434l-28.086 16.218-28.188-16.218-.052-32.434Z" /></svg>`

/**
 * Wrap auth-window body markup in the shared document shell (head + tokens +
 * base styles). `body` is injected verbatim, so callers must escape any
 * untrusted content before passing it in. `script` is optional inline JS.
 */
export function renderCodexAuthWindowDocument({
  body,
  script,
  title,
}: {
  body: string
  script?: string
  title: string
}) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
${CODEX_AUTH_WINDOW_BASE_CSS}
    </style>
  </head>
  <body>
    <main class="card">${body}</main>${
      script
        ? `
    <script>
${script}
    </script>`
        : ""
    }
  </body>
</html>`
}
