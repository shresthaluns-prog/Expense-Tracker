import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(path);
      return entry.isFile() && path.endsWith(".js") ? [path] : [];
    }),
  );
  return nested.flat();
}

const files = [
  "index.js",
  ...(await javascriptFiles("src")),
  ...(await javascriptFiles("test")),
];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (process.exitCode === undefined) {
  console.info(`Syntax checked ${files.length} backend JavaScript files.`);
}
