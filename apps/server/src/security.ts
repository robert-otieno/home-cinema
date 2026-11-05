import {
  scrypt as scryptCallback,
  randomBytes,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return salt + ":" + key.toString("hex");
}
export async function verifyPassword(password: string, stored: string) {
  try {
    const [salt, key] = stored.split(":");
    const actual = (await scrypt(password, salt, 64)) as Buffer;
    const expected = Buffer.from(key, "hex");
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    );
  } catch {
    return false;
  }
}
export function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function secret() {
  return randomBytes(32).toString("base64url");
}
