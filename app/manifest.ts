import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cloudcode",
    short_name: "Cloudcode",
    description: "Chat with Codex in a Daytona sandbox.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    // Match the app's default (dark) background so the launch splash and the
    // standalone safe-area bands blend with the UI instead of showing pure
    // black. The live theme-aware override lives in `viewport.themeColor`.
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  }
}
