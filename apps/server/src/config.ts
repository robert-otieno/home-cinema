import "dotenv/config";
import { resolve } from "node:path";
import { z } from "zod";
const env = z
  .object({
    HOST: z.string().default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65535).default(8094),
    DATA_DIR: z.string().default("./data"),
    FFMPEG_PATH: z.string().default("ffmpeg"),
    FFPROBE_PATH: z.string().default("ffprobe"),
    HARDWARE_ACCELERATION: z
      .enum(["auto", "cpu", "h264_qsv", "h264_nvenc", "h264_amf", "h264_vaapi"])
      .default("auto"),
    VAAPI_DEVICE: z.string().default("/dev/dri/renderD128"),
    TRANSCODE_CACHE_GB: z.coerce.number().min(1).max(100).default(8),
    MAX_TRANSCODES: z.coerce.number().int().min(1).max(4).default(1),
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    SECURE_COOKIES: z.enum(["true", "false"]).default("false"),
    TMDB_TOKEN: z.string().default(""),
  })
  .parse(process.env);
export const config = { ...env, DATA_DIR: resolve(env.DATA_DIR) };
