import { z } from "zod";
import { eq } from "drizzle-orm";
import { settings } from "@cinema/database";
import type { Database } from "./context.ts";
export const settingsSchema = z.object({
  serverName: z.string().trim().min(1).max(60).default("Home Cinema"),
  defaultQuality: z.enum(["auto", "original", "1080p", "720p"]).default("auto"),
  hardwareAcceleration: z
    .enum(["auto", "cpu", "h264_qsv", "h264_nvenc", "h264_amf", "h264_vaapi"])
    .default("auto"),
  maxTranscodes: z.number().int().min(1).max(4).default(1),
  transcodeCacheGb: z.number().min(1).max(100).default(8),
});
export type CinemaSettings = z.infer<typeof settingsSchema>;
export async function readSettings(db: Database) {
  const row = await db.query.settings.findFirst({
    where: eq(settings.key, "cinema"),
  });
  return settingsSchema.parse(row ? JSON.parse(row.value) : {});
}
export async function writeSettings(db: Database, value: CinemaSettings) {
  await db
    .insert(settings)
    .values({ key: "cinema", value: JSON.stringify(value) })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: JSON.stringify(value) },
    });
}
