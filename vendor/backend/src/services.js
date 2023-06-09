import {
  AppError,
  environment,
  isNil,
  isPlainObject,
  isStaging,
} from "@compas/stdlib";
import { importProjectResource } from "./util.js";

/**
 * Should user be prompted to reset password after 6 months
 *
 * TODO: extract to config file
 *
 * @type {boolean}
 */
export let passwordBasedForcePasswordResetAfterSixMonths = false;

/**
 * Block repeated log in attempts for a specific password login.
 * We use a time window of 5 minutes and block logins when more than 10 attempts are done
 * in a rolling window.
 *
 * TODO: extract to config file
 *
 * @type {boolean}
 */
export let passwordBasedRollingLoginAttemptBlock = false;

/**
 *
 * @type {{
 *   allowedNumberOfMobileDeviceSessions?: number;
 *   requireDeviceInformationOnLogin?: boolean;
 * }}
 */
export let sessionDeviceSettings = {};

/**
 * TODO: remove?
 *
 * @type {object}
 */
export let globalEventMetadata = {};

/**
 * @type {BackendFeatureFlagDefinition}
 */
export let featureFlags = {
  availableFlags: [],
};

/**
 * @type {import("@compas/server").Application}
 */
export let app;

/**
 * @type {import("@compas/store").Postgres}
 */
export let sql;

export let queries = undefined;

/**
 * @type {typeof import("../../../src/generated/application/database/user.js").queryUser}
 */
export let queryUser = undefined;

/**
 * @type {typeof
 *   import("../../../src/generated/application/database/tenant.js").queryTenant}
 */
export let queryTenant = undefined;

/**
 * @type {AuthUserQueryBuilder}
 */
export let userBuilder = {
  roles: {
    role: {
      permissions: {
        permission: {},
      },
    },
  },
  anonymousLogin: {},
  digidLogin: {},
  keycloakLogin: {},
  passwordLogin: {
    resetTokens: {},
  },
  totpSettings: {},
  tenants: {
    tenant: {},
  },
};

/**
 * @type {BackendTenantQueryBuilder}
 */
export let tenantBuilder = {};

/** @type {import("@compas/store").SessionTransportSettings} */
// @ts-expect-error
//
// Initializes later
export let sessionTransportSettings = {};

/** @type {import("@compas/store").SessionStoreSettings} */
// @ts-expect-error
//
// Initializes later
export let sessionStoreSettings = {};

/**
 * Set various services used by this package to add routes, implement logic, etc.
 *
 * Optional items are;
 * - userBuilder: custom joins to add on all `QueryResultAuthUser` returns
 * - tenantBuilder: custom joins to add on all `QueryResultBackendTenant` returns
 * - eventMetadata: Metadata object to add to each fired event.
 * - shouldPasswordBasedForcePasswordResetAfterSixMonths: enforce password rotation
 * - shouldPasswordBasedRollingLoginAttemptBlock: block an password login after X failed
 * attempts in N time window
 * - sessionDeviceSettings.allowedNumberOfMobileDeviceSessions: enforce that max N number
 * of mobile sessions are allowed (platform: apple or android).
 * - sessionDeviceSettings.requireDeviceInformationOnLogin: enforce the the `device`
 * field is filled in on all ways of logging in.
 *
 * @param {{
 *   userBuilder?: AuthUserQueryBuilder,
 *   tenantBuilder?: BackendTenantQueryBuilder,
 *   eventMetadata?: any,
 *   shouldPasswordBasedForcePasswordResetAfterSixMonths?: boolean,
 *   shouldPasswordBasedRollingLoginAttemptBlock?: boolean,
 *   sessionDeviceSettings?: {
 *     allowedNumberOfMobileDeviceSessions?: number,
 *     requireDeviceInformationOnLogin?: boolean,
 *   }
 * }} other
 */
export async function backendInitServices(other) {
  const importedApp = await importProjectResource(
    "./src/services/app.js",
    "app",
  );
  const importedSql = await importProjectResource(
    "./src/services/postgres.js",
    "sql",
  );

  try {
    // Code-gen experimental
    const importedQueries = await importProjectResource(
      "./src/generated/application/common/database.js",
      "queries",
    );
    queries = importedQueries;
  } catch {
    // Old code-gen
    const importedQueries = await importProjectResource(
      "./src/generated/application/database/index.js",
      "queries",
    );
    queries = importedQueries;
  }

  const importedQueryUser = await importProjectResource(
    "./src/generated/application/database/user.js",
    "queryUser",
  );
  const importedQueryTenant = await importProjectResource(
    "./src/generated/application/database/tenant.js",
    "queryTenant",
  );

  const importedFeatureFlagDefinition = await importProjectResource(
    "./src/constants.js",
    "featureFlagDefinition",
  );
  const validateBackendFeatureFlagDefinition = await importProjectResource(
    "./src/generated/application/backend/validators.js",
    "validateBackendFeatureFlagDefinition",
  );

  app = importedApp;
  sql = importedSql;
  queryUser = importedQueryUser;
  queryTenant = importedQueryTenant;

  {
    const { value, error } = validateBackendFeatureFlagDefinition(
      importedFeatureFlagDefinition,
    );

    if (error) {
      throw error;
    }

    featureFlags = value;
  }

  if (!isNil(other.eventMetadata) && !isPlainObject(other.eventMetadata)) {
    throw AppError.serverError({
      message:
        "If 'eventMetadata' is provided, it should be a plain old JS object.",
    });
  }

  if (other.userBuilder) {
    userBuilder = { ...other.userBuilder, ...userBuilder };
  }
  if (other.tenantBuilder) {
    tenantBuilder = { ...other.tenantBuilder, ...tenantBuilder };
  }

  passwordBasedForcePasswordResetAfterSixMonths =
    other.shouldPasswordBasedForcePasswordResetAfterSixMonths ?? false;
  passwordBasedRollingLoginAttemptBlock =
    other.shouldPasswordBasedRollingLoginAttemptBlock ?? false;

  globalEventMetadata = other.eventMetadata ?? {};

  sessionDeviceSettings = other.sessionDeviceSettings ?? {};
}

/**
 * These settings are used in pretty much all routes, so set them as services.
 */
export function setSessionTransportAndStore(settings) {
  if (isNil(settings)) {
    throw AppError.serverError({
      message: `Auth settings should have a 'sessionTransportSettings' object.`,
    });
  }

  if (isNil(settings.sessionStoreSettings)) {
    throw AppError.serverError({
      message: `Auth settings should have a 'sessionTransportSettings.sessionStoreSettings' object.`,
    });
  }

  sessionTransportSettings = settings;
  sessionStoreSettings = settings.sessionStoreSettings;

  if (isNil(sessionStoreSettings.signingKey)) {
    if (!isStaging()) {
      sessionStoreSettings.signingKey = environment.APP_KEYS;
    } else {
      sessionStoreSettings.signingKey = "@lightbase/backend - persistent key";
    }
  }
}

/**
 * Reset services to default values in between tests
 */
export function backendResetServices() {
  globalEventMetadata = {};
  featureFlags = {
    availableFlags: [],
  };
  passwordBasedForcePasswordResetAfterSixMonths = false;
  passwordBasedRollingLoginAttemptBlock = false;

  // @ts-expect-error
  app = undefined;

  // @ts-expect-error
  //
  // SQL instance should be undefined here, other checks will fail if we don't reset this.
  sql = undefined;
  queries = undefined;
  queryUser = undefined;
  queryTenant = undefined;
  userBuilder = {
    roles: {
      role: {
        permissions: {
          permission: {},
        },
      },
    },
    anonymousLogin: {},
    digidLogin: {},
    keycloakLogin: {},
    passwordLogin: {
      resetTokens: {},
    },
    totpSettings: {},
    tenants: {
      tenant: {},
    },
  };
  tenantBuilder = {};
  // @ts-expect-error
  //
  // Resetting is necessary
  sessionTransportSettings = {};

  // @ts-expect-error
  //
  // Resetting is necessary
  sessionStoreSettings = {};
}
