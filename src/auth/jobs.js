/* eslint-disable @compas/enforce-event-stop */
import { eventStart, eventStop } from "@compas/stdlib";
import { queryUser } from "../generated/application/database/user.js";

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthAnonymousBasedUserRegisteredEventData }} job
 * @returns {Promise<void>}
 */
export async function authAnonymousBasedUserRegisteredEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.anonymousBasedUserRegisteredEvent");

  const [user] = await queryUser({
    where: {
      viaAnonymousLogin: {
        where: {
          id: data.anonymousLoginId,
        },
      },
    },
    anonymousLogin: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedUserRegisteredEventData }} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedUserRegisteredEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.passwordBasedUserRegisteredEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
          viaResetTokens: {
            where: {
              id: data.passwordLoginResetId,
            },
          },
        },
      },
    },
    passwordLogin: {
      resetTokens: {
        where: {
          id: data.passwordLoginResetId,
        },
      },
    },
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedForgotPasswordEventData}} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedForgotPasswordEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.passwordBasedForgotPasswordEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
          viaResetTokens: {
            where: {
              id: data.passwordLoginResetId,
            },
          },
        },
      },
    },
    passwordLogin: {
      resetTokens: {
        where: {
          id: data.passwordLoginResetId,
        },
      },
    },
    settings: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedPasswordUpdatedEventData}} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedPasswordUpdatedEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.passwordBasedPasswordUpdatedEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
        },
      },
    },
    passwordLogin: {},
    settings: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedEmailUpdatedEventData}} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedEmailUpdatedEvent(event, sql, { data }) {
  eventStart(event, "auth.passwordBasedEmailUpdatedEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
          viaResetTokens: {
            where: {
              id: data.passwordLoginResetId,
            },
          },
        },
      },
    },
    passwordLogin: {
      resetTokens: {
        where: {
          id: data.passwordLoginResetId,
        },
      },
    },
    settings: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedLoginVerifiedEventData}} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedLoginVerifiedEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.passwordBasedLoginVerifiedEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
        },
      },
    },
    passwordLogin: {},
    settings: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}

/**
 * Job(event):
 * https://github.com/lightbasenl/platform-components/tree/main/packages/backend#authentication-providers
 *
 * @param {InsightEvent} event
 * @param {Postgres} sql
 * @param {{ data: AuthPasswordBasedPasswordResetEventData}} job
 * @returns {Promise<void>}
 */
export async function authPasswordBasedPasswordResetEvent(
  event,
  sql,
  { data },
) {
  eventStart(event, "auth.passwordBasedPasswordResetEvent");

  const [user] = await queryUser({
    where: {
      viaPasswordLogin: {
        where: {
          id: data.passwordLoginId,
        },
      },
    },
    passwordLogin: {},
    settings: {},
  }).exec(sql);

  if (!user) {
    // User is probably removed
    eventStop(event);
    return;
  }

  // TODO(platform): Act
  // eslint-disable-next-line no-unused-vars
  const x = 5;

  eventStop(event);
}
