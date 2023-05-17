import { mainTestFn, test } from "@compas/cli";
import { getMigrationsToBeApplied, newMigrateContext } from "@compas/store";
import { sql } from "../src/services/postgres.js";

mainTestFn(import.meta);

test("repo/migrations", (t) => {
  t.test("migrations have been applied", async (t) => {
    const mc = await newMigrateContext(sql);
    const { migrationQueue, hashChanges } = getMigrationsToBeApplied(mc);

    const message = `Tests are not running with the latest migrations, please run 'yarn compas docker clean --project && yarn compas migrate'.`;
    t.equal(migrationQueue.length, 0, message);
    t.equal(hashChanges.length, 0, message);
  });
});
