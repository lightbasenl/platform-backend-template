import { newEventFromEvent } from "@compas/stdlib";
import { scaffoldHandlers } from "../generated/application/scaffold/controller.js";
import { sql } from "../services/postgres.js";
import { authCreateUser, multitenantRequireTenant } from "@lightbasenl/backend";

// TODO(platform): remove this;
scaffoldHandlers.createUser = async (ctx) => {
  await multitenantRequireTenant(newEventFromEvent(ctx.event), ctx);

  const user = await sql.begin(async (sql) => {
    return await authCreateUser(
      newEventFromEvent(ctx.event),
      sql,
      {},
      {
        withAnonymousBased: {
          isAllowedToLogin: true,
        },
        withMultitenant: {
          syncUsersAcrossAllTenants: true,
        },
      },
    );
  });

  ctx.body = {
    loginToken: user.anonymousLogin.loginToken,
  };
};
