import {
  AppError,
  eventStart,
  eventStop,
  isNil,
  newEventFromEvent,
} from "@compas/stdlib";
import { query, sessionStoreGet } from "@compas/store";
import {
  queries,
  sessionDeviceSettings,
  sessionStoreSettings,
  sql,
} from "../../services.js";
import {
  importProjectResource,
  normalizeSessionErrorsToUnauthorizedAndThrow,
} from "../../util.js";

/**
 * List the sessions for the currently logged in user.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultAuthUser} user
 * @param {QueryResultStoreSessionStore} session
 * @returns {Promise<SessionListResponse>}
 */
export async function authSessionList(event, user, session) {
  eventStart(event, "authSession.list");

  /** @type {typeof import("../../../../../src/generated/application/database/sessionStore.js").querySessionStore} */
  const querySessionStore = await importProjectResource(
    "./src/generated/application/database/sessionStore.js",
    "querySessionStore",
  );

  const sessions = await querySessionStore({
    device: {},
    where: {
      $raw: query`ss."data"->>'userId' = ${user.id}`,
    },
  }).exec(sql);

  /** @type {SessionListResponse} */
  const result = {
    sessions: sessions.map((it) => ({
      sessionId: it.id,
      isCurrentSession: it.id === session.id,
      device: it.device
        ? {
            name: it.device.name,
            platform: it.device.platform,
            notificationToken: it.device.notificationToken,
          }
        : undefined,
    })),
  };

  eventStop(event);

  return result;
}

/**
 * Assign a notification token to the current session
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultAuthUser} user
 * @param {QueryResultStoreSessionStore} session
 * @param {SessionSetDeviceNotificationTokenBody} body
 * @returns {Promise<void>}
 */
export async function authSessionSetDeviceNotificationToken(
  event,
  user,
  session,
  body,
) {
  eventStart(event, "authSession.setDeviceNotificationToken");

  /** @type {typeof import("../../../../../src/generated/application/database/sessionStore.js").querySessionStore} */
  const querySessionStore = await importProjectResource(
    "./src/generated/application/database/sessionStore.js",
    "querySessionStore",
  );

  const [userSession] = await querySessionStore({
    device: {},
    where: {
      id: session.id,
      $raw: query`ss."data"->>'userId' = ${user.id}`,
    },
  }).exec(sql);

  if (isNil(userSession) || isNil(userSession.device)) {
    throw AppError.validationError(`${event.name}.unknown`);
  }

  await queries.deviceUpdate(sql, {
    where: {
      id: userSession.device.id,
    },
    update: {
      notificationToken: body.notificationToken,
    },
  });

  eventStop(event);
}

/**
 * Assign a notification token to the current session
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultAuthUser} user
 * @param {QueryResultStoreSessionStore} session
 * @param {SessionLogoutBody} body
 * @returns {Promise<void>}
 */
export async function authSessionLogout(event, user, session, body) {
  eventStart(event, "authSession.logout");

  /** @type {typeof import("../../../../../src/generated/application/database/sessionStore.js").querySessionStore} */
  const querySessionStore = await importProjectResource(
    "./src/generated/application/database/sessionStore.js",
    "querySessionStore",
  );

  const [userSession] = await querySessionStore({
    device: {},
    where: {
      id: body.sessionId,
      $raw: query`ss."data"->>'userId' = ${user.id}`,
    },
  }).exec(sql);

  if (isNil(userSession)) {
    throw AppError.validationError(`${event.name}.unknown`);
  }

  await queries.sessionStoreDelete(sql, {
    id: userSession.id,
  });

  eventStop(event);
}

/**
 * Resolve the session based on the access token and insert the provided device.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {string} userId
 * @param {string} accessToken
 * @param {SessionLoginDevice} [device]
 * @returns {Promise<void>}
 */
export async function authSessionAppendDevice(
  event,
  sql,
  userId,
  accessToken,
  device,
) {
  eventStart(event, "authSession.appendDevice");

  /** @type {typeof import("../../../../../src/generated/application/database/sessionStore.js").querySessionStore} */
  const querySessionStore = await importProjectResource(
    "./src/generated/application/database/sessionStore.js",
    "querySessionStore",
  );

  if (!device && sessionDeviceSettings.requireDeviceInformationOnLogin) {
    throw AppError.validationError(`${event.name}.deviceRequired`);
  }

  if (!device) {
    // Device linked to session is not enforced. Early return.
    eventStop(event);
    return;
  }

  if (
    !isNil(sessionDeviceSettings.allowedNumberOfMobileDeviceSessions) &&
    ["apple", "android"].includes(device.platform)
  ) {
    const sessions = await querySessionStore({
      device: {},
      where: {
        $raw: query`ss.data->>'userId' = ${userId}`,
      },
    }).exec(sql);

    const mobileSessions = sessions.filter(
      (it) => it.device && ["apple", "android"].includes(it.device.platform),
    );

    if (
      mobileSessions.length >=
      sessionDeviceSettings.allowedNumberOfMobileDeviceSessions
    ) {
      throw AppError.validationError(`${event.name}.maxDeviceLimitReached`);
    }
  }

  const { value, error } = await sessionStoreGet(
    newEventFromEvent(event),
    sql,
    sessionStoreSettings,
    accessToken,
  );

  if (error) {
    normalizeSessionErrorsToUnauthorizedAndThrow(error);
  }

  await queries.deviceInsert(sql, {
    ...device,
    session: value.session.id,
  });

  eventStop(event);
}
