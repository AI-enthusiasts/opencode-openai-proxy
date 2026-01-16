// @ts-expect-error - opencode-auth-provider has no type declarations
import { OpencodeAI } from "@tarquinen/opencode-auth-provider"

type OpencodeAIInstance = {
  reset(): void
  listProviders(): Promise<Record<string, unknown>>
  getProvider(providerID: string): Promise<unknown>
  getModel(providerID: string, modelID: string): Promise<unknown>
  getLanguageModel(providerID: string, modelID: string): Promise<unknown>
}

let instance: OpencodeAIInstance | null = null

export function getRuntime(): OpencodeAIInstance {
  if (!instance) {
    instance = new OpencodeAI({ workspaceDir: process.cwd() }) as OpencodeAIInstance
  }
  return instance
}

export function resetRuntime(): void {
  if (instance) {
    instance.reset()
    instance = null
  }
}

export function parseModel(model: string): { providerID: string; modelID: string } {
  const [providerID, ...rest] = model.split("/")
  if (!providerID || rest.length === 0) {
    throw new Error(`Invalid model format: "${model}". Expected "provider/model"`)
  }
  return { providerID, modelID: rest.join("/") }
}
