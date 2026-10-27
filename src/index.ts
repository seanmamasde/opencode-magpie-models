import { mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { Model, Plugin, Provider } from "@opencode/plugin"

// One entry of Magpie's /v1/models (only the fields used here).
type Raw = {
  id: string
  magpie_label?: string
  display_name?: string
  context_length?: number
  max_output_tokens?: number
  modalities?: { input?: string[]; output?: string[] }
  reasoning?: boolean
  reasoning_levels?: string[]
}

const positive = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n > 0
const strings = (a: unknown): a is string[] => Array.isArray(a) && a.length > 0 && a.every((s) => typeof s === "string")

export function toModels(providerID: string, raws: readonly Raw[]): Model.Info[] {
  const pid = Provider.ID.make(providerID)
  return raws.map((raw) => {
    const base = Model.Info.default(pid, Model.ID.make(raw.id))
    const levels = raw.reasoning && strings(raw.reasoning_levels) ? raw.reasoning_levels : []
    return {
      ...base,
      name: raw.magpie_label ?? raw.display_name ?? raw.id,
      capabilities: {
        ...base.capabilities,
        // Magpie rejects images for a model it marks blind, and OpenCode only sends what is declared
        input: strings(raw.modalities?.input) ? raw.modalities.input : ["text"],
        output: strings(raw.modalities?.output) ? raw.modalities.output : ["text"],
      },
      variants: levels.map((e) => ({ id: Model.VariantID.make(e), settings: { reasoningEffort: e } })),
      limit: {
        context: positive(raw.context_length) ? raw.context_length : base.limit.context,
        output: positive(raw.max_output_tokens) ? raw.max_output_tokens : base.limit.output,
      },
    }
  })
}

export function parseList(body: unknown): Raw[] {
  const data = (body as { data?: unknown })?.data
  if (!Array.isArray(data)) throw new Error("no data array in the models response")
  return data.filter((m): m is Raw => typeof m?.id === "string" && m.id !== "")
}

const home = (p: string) => (p.startsWith("~/") ? join(homedir(), p.slice(2)) : p)

export default Plugin.define({
  id: "opencode-magpie-models",
  async setup(ctx) {
    const o = ctx.options as { baseURL?: unknown; keyFile?: unknown; id?: unknown; name?: unknown; refreshMinutes?: unknown }
    if (typeof o.baseURL !== "string" || typeof o.keyFile !== "string")
      throw new Error("opencode-magpie-models: options baseURL and keyFile are required")
    const baseURL = o.baseURL.replace(/\/+$/, "")
    const id = typeof o.id === "string" ? o.id : "magpie"
    const name = typeof o.name === "string" ? o.name : "Magpie"
    const key = (await readFile(home(o.keyFile), "utf8")).trim()
    const cacheFile = join(process.env.XDG_CACHE_HOME || join(homedir(), ".cache"), "opencode-magpie-models", `${id}.json`)

    const fetchList = async () => {
      const res = await fetch(`${baseURL}/models`, {
        headers: { authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`GET ${baseURL}/models: HTTP ${res.status}`)
      const list = parseList(await res.json())
      await mkdir(dirname(cacheFile), { recursive: true })
      await writeFile(cacheFile, JSON.stringify(list), { mode: 0o600 })
      return list
    }

    let list: Raw[]
    try {
      list = await fetchList()
    } catch (e) {
      console.error(`opencode-magpie-models: ${e}; using the last saved list`)
      list = await readFile(cacheFile, "utf8").then(JSON.parse, () => [])
    }

    await ctx.provider.transform((editor) => {
      editor.add({
        info: {
          ...Provider.Info.empty(Provider.ID.make(id)),
          name,
          activation: "enabled",
          package: "@opencode/ai/providers/openai-compatible",
          settings: { baseURL, apiKey: key },
        },
        models: toModels(id, list),
      })
    })

    // The background service lives for days: pick up models Magpie adds meanwhile.
    const minutes = typeof o.refreshMinutes === "number" && o.refreshMinutes > 0 ? o.refreshMinutes : 60
    const timer = setInterval(async () => {
      try {
        const next = await fetchList()
        if (JSON.stringify(next) === JSON.stringify(list)) return
        list = next
        await ctx.provider.reload()
      } catch (e) {
        console.error(`opencode-magpie-models: refresh failed: ${e}`)
      }
    }, minutes * 60_000)
    return () => clearInterval(timer)
  },
})
