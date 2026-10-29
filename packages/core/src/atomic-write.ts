import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/** Writes through a uniquely named sibling so concurrent exports never share a temporary file. */
export async function atomicWriteFile(target: string, contents: string | Uint8Array): Promise<string> {
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}-${randomUUID().slice(0, 8)}.tmp`;
  try {
    await writeFile(temporary, contents, typeof contents === "string" ? "utf8" : undefined);
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
  return target;
}
