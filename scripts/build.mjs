import { cp, mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");

const entries = ["manifest.json", "src"];

await rm(dist, { force: true, recursive: true });
await mkdir(dist, { recursive: true });

for (const entry of entries) {
  const from = path.join(root, entry);
  const to = path.join(dist, entry);
  const info = await stat(from);

  if (info.isDirectory()) {
    await cp(from, to, { recursive: true });
  } else {
    await cp(from, to);
  }
}

console.log(`Built extension at ${dist}`);
