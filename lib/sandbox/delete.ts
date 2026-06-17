import type { ConvexHttpClient } from "convex/browser"

import { api } from "@/convex/_generated/api"
import { observeCurrentUserDaytonaBilling } from "@/lib/billing/server"
import type { DaytonaBillingResources } from "@/lib/billing/model"
import {
  deleteDaytonaSandboxQuietly,
  readDaytonaSandboxInfo,
} from "@/lib/daytona/sandbox"

type ObserveDeletedSandboxBilling = (input: {
  resources: DaytonaBillingResources
  sandboxId: string
}) => Promise<unknown>

async function deleteDaytonaSandboxWithBilling(
  sandboxId: string,
  observeDeletedSandboxBilling: ObserveDeletedSandboxBilling
) {
  const info = await readDaytonaSandboxInfo(sandboxId).catch(() => null)
  if (info) {
    await observeDeletedSandboxBilling({
      resources: {
        cpu: info.cpu,
        diskGiB: info.diskGiB,
        memoryGiB: info.memoryGiB,
      },
      sandboxId,
    }).catch((error) => {
      console.warn("Unable to observe deleted sandbox billing.", error)
    })
  }

  await deleteDaytonaSandboxQuietly(sandboxId)
}

export async function deleteCurrentUserDaytonaSandbox(sandboxId: string) {
  await deleteDaytonaSandboxWithBilling(sandboxId, async (input) => {
    await observeCurrentUserDaytonaBilling({
      resources: input.resources,
      sandboxId: input.sandboxId,
      state: "deleted",
    })
  })
}

export async function deleteCurrentUserDaytonaSandboxes(sandboxIds: string[]) {
  const uniqueSandboxIds = [...new Set(sandboxIds)]
  await Promise.all(uniqueSandboxIds.map(deleteCurrentUserDaytonaSandbox))
}

export async function deleteCurrentUserDaytonaSandboxesWithClient(
  sandboxIds: string[],
  client: ConvexHttpClient
) {
  const uniqueSandboxIds = [...new Set(sandboxIds)]
  await Promise.all(
    uniqueSandboxIds.map((sandboxId) =>
      deleteDaytonaSandboxWithBilling(sandboxId, async (input) => {
        await client.action(api.billing.observeCurrentUserDaytonaSandbox, {
          cpu: input.resources.cpu,
          diskGiB: input.resources.diskGiB,
          memoryGiB: input.resources.memoryGiB,
          observedAt: Date.now(),
          sandboxId: input.sandboxId,
          source: "observed",
          state: "deleted",
        })
      })
    )
  )
}
