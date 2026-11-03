import type { AsrConfig } from "./asr-config";
import { MosslandAsrStream } from "./mossland-asr-engine";
import { MiniMaxAsrStream } from "./minimax-asr-engine";
import { AliyunAsrStream } from "./aliyun-asr-engine";
import { LocalAsrStream } from "./local-asr-engine";

export interface AsrStreamSession {
  start(): Promise<void>;
  sendAudio(frame: Buffer): void;
  stop(): void | Promise<string>;
}

export function createAsrStream(
  config: AsrConfig,
  onPartial: (text: string) => void,
  onFinal: (text: string) => void,
): AsrStreamSession {
  if (config.engine === "local") {
    // 本地听写：不要密钥，但只有 final（整段识别），没有 partial
    return new LocalAsrStream(config.language, onFinal);
  }
  if (config.engine === "mossland") {
    return new MosslandAsrStream(config.apiKey, onFinal);
  }
  if (config.engine === "minimax") {
    return new MiniMaxAsrStream(config.apiKey, onFinal);
  }

  const stream = new AliyunAsrStream(onPartial, onFinal);
  return {
    start: () => stream.start(
      config.appKey,
      config.accessKeyId,
      config.accessKeySecret,
      config.language,
    ),
    sendAudio: (frame) => stream.sendAudio(frame),
    stop: () => stream.stop(),
  };
}
