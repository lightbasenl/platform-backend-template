import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import { authRequireUser } from "./auth/user.events.js";
import { multitenantRequireTenant } from "./multitenant/events.js";
import { sql } from "./services.js";

/**
 * Wraps both {@link multitenantRequireTenant} and {@link authRequireUser} in to a single
 * function.
 *
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {AuthRequireUserOptions} [userOptions]
 * @returns {Promise<{
 *   resolvedTenant: BackendResolvedTenant,
 *   user: QueryResultAuthUser,
 * }>}
 */
export async function backendGetTenantAndUser(ctx, userOptions) {
  const event = newEventFromEvent(ctx.event);

  eventStart(event, "backend.getTenantAndUser");

  const resolvedTenant = await multitenantRequireTenant(
    newEventFromEvent(event),
    ctx,
  );

  const user = await authRequireUser(
    newEventFromEvent(event),
    sql,
    resolvedTenant.tenant,
    ctx,
    userOptions,
  );

  eventStop(event);

  return {
    resolvedTenant,
    user,
  };
}
