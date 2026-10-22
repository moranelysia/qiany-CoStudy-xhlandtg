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
      toggleFullscreen: () => Promise<boolean>
      isFullscreen: () => Promise<boolean>
      onFullscreenChange: (cb: (on: boolean) => void) => void
    }
    __toast?: (msg: string) => void
  }
}