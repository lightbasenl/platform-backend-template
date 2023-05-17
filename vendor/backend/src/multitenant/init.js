import {
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { query } from "@compas/store";
import { queries, queryTenant } from "../services.js";
import { importProjectResource } from "../util.js";
import { multitenantLoadConfig } from "./config.js";
import { multitenantRequireTenant } from "./events.js";

/**
 * Initialize multitenant system.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendConfig} config
 * @returns {Promise<void>}
 */
export async function multitenantInit(event, sql, config) {
  eventStart(event, "multitenant.init");

  const { tenantsByName } = await multitenantLoadConfig();
  await multitenantSyncToDatabase(newEventFromEvent(event), sql, tenantsByName);

  if (config.multitenant.syncUsersAcrossAllTenants) {
    await multitenantSyncUsersAcrossAllTenants(newEventFromEvent(event), sql);
  }

  /**
   * @type {typeof
   *   import("../../../../src/generated/application/multitenant/controller.js")}
   */
  const controller = await importProjectResource(
    "./src/generated/application/multitenant/controller.js",
  );

  controller.multitenantHandlers.current = async (ctx, next) => {
    const { tenant } = await multitenantRequireTenant(
      newEventFromEvent(ctx.event),
      ctx,
    );

    ctx.body = {
      tenant: {
        id: tenant.id,
        data: tenant.data,
        name: tenant.name,
      },
    };

    if (next) {
      return next();
    }
  };

  eventStop(event);
}

/**
 * Insert and update tenants, loaded from the config. Does not remove tenants that are
 * disabled.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {Record<string, LoadedTenant>} tenants
 */
async function multitenantSyncToDatabase(event, sql, tenants) {
  eventStart(event, "multitenant.syncToDatabase");

  const databaseTenants = await queryTenant({}).exec(sql);

  const dbTenantsByName = {};
  for (const dbTenant of databaseTenants) {
    dbTenantsByName[dbTenant.name] = dbTenant;
  }

  for (const tenant of Object.values(tenants)) {
    const existingTenant = dbTenantsByName[tenant.name];
    if (isNil(existingTenant)) {
      await queries.tenantInsert(sql, {
        name: tenant.name,
        data: tenant.data,
      });
    } else {
      await queries.tenantUpdate(sql, {
        update: {
          name: tenant.name,
          data: tenant.data,
        },
        where: {
          id: existingTenant.id,
        },
      });
    }
  }

  eventStop(event);
}

/**
 * Make sure that all users belong to all tenants. This allows adding tenants, without
 * the hassle of custom queries afterwards.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @returns {Promise<void>}
 */
async function multitenantSyncUsersAcrossAllTenants(event, sql) {
  eventStart(event, "multitenant.syncUsersAcrossAllTenants");

  await query`INSERT INTO "userTenant" ("user", "tenant") SELECT u.id, t.id FROM "user" u, "tenant" t ON CONFLICT ("user", "tenant") DO NOTHING`.exec(
    sql,
  );

  eventStop(event);
}
