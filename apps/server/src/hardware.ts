import { run } from "@cinema/media-core";
import { config } from "./config.ts";
const cache = new Map<
  string,
  Promise<{ advertised: string[]; supported: string[] }>
>();
export async function hardwareCapabilities(binary = config.FFMPEG_PATH) {
  if (!cache.has(binary))
    cache.set(
      binary,
      (async () => {
        let list = "";
        try {
          list = await run(binary, ["-hide_banner", "-encoders"]);
        } catch {
          return { advertised: [], supported: [] };
        }
        const advertised = [
            "h264_qsv",
            "h264_nvenc",
            "h264_amf",
            "h264_vaapi",
            "libx264",
          ].filter((e) => list.includes(e)),
          supported: string[] = [];
        const candidates =
          process.platform === "win32"
            ? ["h264_qsv", "h264_nvenc", "h264_amf"]
            : ["h264_nvenc", "h264_qsv", "h264_vaapi"];
        for (const encoder of candidates.filter((e) =>
          advertised.includes(e),
        )) {
          const args = ["-hide_banner", "-loglevel", "error"];
          if (encoder === "h264_vaapi")
            args.push("-vaapi_device", config.VAAPI_DEVICE);
          args.push(
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=128x128:r=1",
            "-t",
            "1",
            "-vf",
            encoder === "h264_vaapi" ? "format=nv12,hwupload" : "format=nv12",
            "-c:v",
            encoder,
            "-f",
            "null",
            "-",
          );
          try {
            await run(binary, args, 8000);
            supported.push(encoder);
          } catch {}
        }
        return { advertised, supported };
      })(),
    );
  return cache.get(binary)!;
}
export const failedEncoders = new Set<string>();
export async function chooseEncoder() {
  const cap = await hardwareCapabilities();
  if (config.HARDWARE_ACCELERATION === "cpu") return "libx264";
  const supported = cap.supported.filter((e) => !failedEncoders.has(e));
  return config.HARDWARE_ACCELERATION === "auto"
    ? supported[0] || "libx264"
    : supported.includes(config.HARDWARE_ACCELERATION)
      ? config.HARDWARE_ACCELERATION
      : "libx264";
}
