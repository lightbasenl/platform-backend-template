import {
  eventStart,
  eventStop,
  isProduction,
  newEventFromEvent,
} from "@compas/stdlib";
import { authCreateUser } from "../auth/user.events.js";
import { backendGetTenantAndUser } from "../events.js";
import { slackSendMessageToUser } from "../slack/events.js";
import { managementConstants } from "./constants.js";

/**
 * Create a anonymous user that is able to manage the feature flags on this platform and
 * send a magic link via Slack.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {BackendResolvedTenant} resolvedTenant
 * @param {ManagementRequestMagicLinkBody} body
 * @returns {Promise<ManagementRequestMagicLinkResponse>}
 */
export async function managementRequestMagicLink(
  event,
  sql,
  resolvedTenant,
  body,
) {
  eventStart(event, "management.requestMagicLink");

  const user = await authCreateUser(
    newEventFromEvent(event),
    sql,
    {
      name: `Lightbase management ${body.slackUserId}`,
    },
    {
      withAnonymousBased: {
        isAllowedToLogin: true,
      },
      withMultitenant: {
        syncUsersAcrossAllTenants: true,
      },
      withPermissionRoles: {
        identifierIn: [managementConstants.role],
      },
    },
  );

  const magicLink = `${resolvedTenant.publicUrl}/_lightbase/auth/${user.anonymousLogin?.loginToken}`;

  if (!isProduction()) {
    eventStop(event);

    return {
      magicLink,
    };
  }

  await slackSendMessageToUser(
    newEventFromEvent(event),
    body.slackUserId,
    `Hi there, you can manage features of '${resolvedTenant.tenant.name}' (\`${resolvedTenant.publicUrl}\`) by clicking on the following link; ${magicLink}.\n\n _This message be removed tonight._`,
  );

  eventStop(event);

  return {
    magicLink: undefined,
  };
}

/**
 * Pre-checks to execute before allowing the user to use one of the management crud
 * routes.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {any} ctx
 * @returns {Promise<void>}
 */
export async function managementFeatureFlagCrudModifier(event, ctx) {
  eventStart(event, "managementFeatureFlag.crudModifier");

  await backendGetTenantAndUser(ctx, {
    requiredPermissions: [managementConstants.permission],
  });

  eventStop(event);
}
