export {}

declare global {
  interface AppInfo {
    name: string
    version: string
    electron: string
    node: string
    platform: string
  }

  interface Window {
    costudy?: {
      info: () => Promise<AppInfo>
    }
    __toast?: (msg: string) => void
  }
}