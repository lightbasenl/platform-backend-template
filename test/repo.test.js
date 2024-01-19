import { mainTestFn, test } from "@compas/cli";
import { migrationsGetInfo, migrationsInitContext } from "@compas/store";
import { sql } from "../src/services/postgres.js";

mainTestFn(import.meta);

test("repo/migrations", (t) => {
  t.test("migrations have been applied", async (t) => {
    const mc = await migrationsInitContext(sql);
    const { migrationQueue, hashChanges } = await migrationsGetInfo(mc);

    const message = `Tests are not running with the latest migrations, please run 'npx compas docker clean --project && npx compas migrate'.`;
    t.equal(migrationQueue.length, 0, message);
    t.equal(hashChanges.length, 0, message);
  });
});
