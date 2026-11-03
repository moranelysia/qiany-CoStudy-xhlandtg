export interface AliyunAsrConfig {
  engine: "aliyun";
  appKey: string;
  accessKeyId: string;
  accessKeySecret: string;
  language: string;
}

export interface MosslandAsrConfig {
  engine: "mossland";
  apiKey: string;
}

export interface MiniMaxAsrConfig {
  engine: "minimax";
  apiKey: string;
}

/** 本地系统听写（Windows System.Speech，不要密钥） */
export interface LocalAsrConfig {
  engine: "local";
  language: string;
}

export type AsrConfig = AliyunAsrConfig | MosslandAsrConfig | MiniMaxAsrConfig | LocalAsrConfig;

let asrConfigGetter: (() => AsrConfig | null) | null = null;

export function setAsrConfig(getter: () => AsrConfig | null): void {
  asrConfigGetter = getter;
}

export function getAsrConfig(): AsrConfig | null {
  return asrConfigGetter?.() ?? null;
}
