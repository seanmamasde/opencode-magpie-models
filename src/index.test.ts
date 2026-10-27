import { expect, test } from "bun:test"
import { parseList, toModels } from "./index"

test("maps Magpie's /v1/models entry to OpenCode's model shape", () => {
  const [m] = toModels("magpie", [{
    id: "claude/claude-sonnet-5-5",
    magpie_label: "Claude Sonnet 5.5 · Claude Code",
    context_length: 1_000_000,
    max_output_tokens: 128_000,
    modalities: { input: ["text", "image"], output: ["text"] },
    reasoning: true,
    reasoning_levels: ["low", "max"],
  }])
  expect(m.name).toBe("Claude Sonnet 5.5 · Claude Code")
  expect(m.limit).toEqual({ context: 1_000_000, output: 128_000 })
  expect(m.capabilities.input).toEqual(["text", "image"])
  expect(m.variants).toEqual([
    { id: "low", settings: { reasoningEffort: "low" } },
    { id: "max", settings: { reasoningEffort: "max" } },
  ] as any)
})

test("missing metadata: text only, no variants, default limits", () => {
  const [m] = toModels("magpie", [{ id: "x", reasoning_levels: ["high"], context_length: -1 }])
  expect(m.capabilities.input).toEqual(["text"])
  expect(m.variants).toEqual([])
  expect(m.limit.context).toBe(200_000)
})

test("reasoning levels are lower-cased", () => {
  const [m] = toModels("magpie", [{ id: "zed/gemini", reasoning: true, reasoning_levels: ["LOW", "HIGH"] }])
  expect(m.variants.map((v) => v.id)).toEqual(["low", "high"] as any)
})

test("rejects a response without a data array and drops entries without an id", () => {
  expect(() => parseList({ error: "nope" })).toThrow()
  expect(parseList({ data: [{ id: "a" }, { id: 3 }, null] }).map((m) => m.id)).toEqual(["a"])
})
