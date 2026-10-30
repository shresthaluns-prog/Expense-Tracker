import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create({
  instance: { dbName: "expense_tracker_test" },
});

try {
  const testFiles = (await readdir(new URL(".", import.meta.url)))
    .filter((file) => file.endsWith(".test.js"))
    .sort()
    .map((file) => `test/${file}`);
  const result = spawnSync(
    process.execPath,
    ["--test", "--test-concurrency=1", ...testFiles],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        MONGODB_URI: mongo.getUri("expense_tracker_test"),
      },
      stdio: "inherit",
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await mongo.stop();
}
