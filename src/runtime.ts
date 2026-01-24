import { OpencodeAI } from "@tarquinen/opencode-auth-provider"
import path from "path"
import os from "os"

type OpencodeAIInstance = {
  reset(): void
  listProviders(): Promise<Record<string, unknown>>
  getProvider(providerID: string): Promise<unknown>
  getModel(providerID: string, modelID: string): Promise<unknown>
  getLanguageModel(providerID: string, modelID: string): Promise<unknown>
}

let instance: OpencodeAIInstance | null = null

/**
 * Get the OpenCode data directory.
 * Priority: OPENCODE_DATA_DIR > XDG_DATA_HOME/opencode > ~/.local/share/opencode
 */
export function getDataDir(): string {
  if (process.env.OPENCODE_DATA_DIR) {
    return process.env.OPENCODE_DATA_DIR
  }
  const xdgData = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local/share")
  return path.join(xdgData, "opencode")
}

export function getRuntime(): OpencodeAIInstance {
  if (!instance) {
    // Set XDG_DATA_HOME if OPENCODE_DATA_DIR is specified (for the auth-provider library)
    if (process.env.OPENCODE_DATA_DIR) {
      // The library expects XDG_DATA_HOME/opencode, so we set XDG_DATA_HOME to parent dir
      const parentDir = path.dirname(process.env.OPENCODE_DATA_DIR)
      process.env.XDG_DATA_HOME = parentDir
    }
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
