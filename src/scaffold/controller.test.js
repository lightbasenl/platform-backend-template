import { mainTestFn, test } from "@compas/cli";
import { createTestAppAndClient } from "@compas/server";
import { queryUser } from "../generated/application/database/user.js";
import { apiScaffoldCreateUser } from "../generated/application/scaffold/apiClient.js";
import { app } from "../services/app.js";
import { sql } from "../services/postgres.js";
import { createTestAxiosInstance } from "../testing.js";

mainTestFn(import.meta);

test("scaffold/controller", async (t) => {
  const axiosInstance = await createTestAxiosInstance();
  await createTestAppAndClient(app, axiosInstance);

  t.test("apiScaffoldCreateUser", async (t) => {
    const { loginToken } = await apiScaffoldCreateUser(axiosInstance);

    const [user] = await queryUser({
      where: {
        viaAnonymousLogin: {
          where: {
            loginToken,
          },
        },
      },
    }).exec(sql);

    t.ok(loginToken);
    t.ok(user);
  });
});
