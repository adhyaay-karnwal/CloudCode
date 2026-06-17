import { observeCurrentUserDaytonaBilling } from "@/lib/billing/server"
import {
  deleteDaytonaSandboxQuietly,
  readDaytonaSandboxInfo,
} from "@/lib/daytona/sandbox"

export async function deleteCurrentUserDaytonaSandbox(sandboxId: string) {
  const info = await readDaytonaSandboxInfo(sandboxId).catch(() => null)
  if (info) {
    await observeCurrentUserDaytonaBilling({
      resources: {
        cpu: info.cpu,
        diskGiB: info.diskGiB,
        memoryGiB: info.memoryGiB,
      },
      sandboxId,
      state: "deleted",
    }).catch((error) => {
      console.warn("Unable to observe deleted sandbox billing.", error)
    })
  }

  await deleteDaytonaSandboxQuietly(sandboxId)
}

export async function deleteCurrentUserDaytonaSandboxes(sandboxIds: string[]) {
  const uniqueSandboxIds = [...new Set(sandboxIds)]
  await Promise.all(uniqueSandboxIds.map(deleteCurrentUserDaytonaSandbox))
}
