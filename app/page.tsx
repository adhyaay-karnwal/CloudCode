import type { Metadata } from "next"

import { Chat } from "@/components/chat"

export const metadata: Metadata = {
  title: "Cloudcode",
  description: "Chat with Codex in a Daytona sandbox.",
}

export default function Page() {
  return <Chat />
}
