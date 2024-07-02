import { AppError, eventStart, eventStop, isNil } from "@compas/stdlib";
import { featureFlags, queries, queryFeatureFlag, sql } from "../services.js";
import { featureFlagCache } from "./cache.js";

/**
 * Get current feature flags.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {QueryResultBackendTenant} tenant
 * @returns {Promise<FeatureFlagCurrentResponse>}
 */
export async function featureFlagCurrent(event, tenant) {
  eventStart(event, "featureFlag.current");

  let flags = featureFlagCache.getAll();
  if (!featureFlagCache.isEnabled()) {
    flags = await queryFeatureFlag({}).exec(sql);
  }

  if (
    featureFlagCache.isEnabled() &&
    flags.length !== featureFlags.availableFlags.length
  ) {
    // The cache is empty / everything expired, fetch a single key to prime the cache.
    await featureFlagCache.get(featureFlags.availableFlags[0]);
    flags = featureFlagCache.getAll();
  }

  /**
   * @type {FeatureFlagCurrentResponse}
   */
  // @ts-expect-error
  //
  // Result is filled in the loop.
  const result = {};

  for (const flag of flags) {
    if (!featureFlags.availableFlags.includes(flag.name)) {
      // Don't return flags which are not yet known to this instance.
      continue;
    }

    const tenantSpecificValue = flag?.tenantValues?.[tenant?.name];

    result[flag.name] = !isNil(tenantSpecificValue)
      ? tenantSpecificValue
      : flag.globalValue;
  }

  for (const flag of featureFlags.availableFlags) {
    // Add flags which are not yet in the database, but are present in the config. These
    // default to false
    result[flag] ??= false;
  }

  eventStop(event);

  return result;
}

/**
 * Remove obsolete flags, provision new flags to the database.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @returns {Promise<void>}
 */
export async function featureFlagSyncAvailableFlags(event, sql) {
  eventStart(event, "featureFlag.syncAvailableFlags");

  if (featureFlags.availableFlags.length === 0) {
    featureFlags.availableFlags.push("__FEATURE_LPC_EXAMPLE_FLAG");
  }

  await queries.featureFlagDelete(sql, {
    nameNotIn: featureFlags.availableFlags,
  });

  const databaseKnownFlags = await queryFeatureFlag({}).exec(sql);

  const databaseKnownIdentifiers = databaseKnownFlags.map((it) => it.name);

  const inserts = [];

  for (const flag of featureFlags.availableFlags) {
    if (!databaseKnownIdentifiers.includes(flag)) {
      inserts.push({
        name: flag,
      });
    }
  }

  await queries.featureFlagInsert(sql, inserts);

  eventStop(event);
}

/**
 * Resolve the feature flag identifier.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {BackendResolvedTenant} tenant
 * @param {QueryResultAuthUser} user
 * @param {FeatureFlagIdentifier} identifier
 * @returns {Promise<boolean>}
 */
export async function featureFlagGetDynamic(event, tenant, user, identifier) {
  eventStart(event, "featureFlag.getDynamic");

  const flag = await featureFlagCache.get(identifier);
  const tenantSpecificValue = flag?.tenantValues?.[tenant?.tenant?.name];

  eventStop(event);

  return !isNil(tenantSpecificValue) ? tenantSpecificValue : flag.globalValue;
}

/**
 * Set the value of a feature flag. Should be used while testing different scenario's
 * based.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {FeatureFlagIdentifier} identifier
 * @param {boolean} value
 * @param {BackendFeatureFlag["tenantValues"]} tenantValues
 * @returns {Promise<void>}
 */
export async function featureFlagSetDynamic(
  event,
  identifier,
  value,
  tenantValues = undefined,
) {
  eventStart(event, "featureFlag.setDynamic");

  const [flag] = await queryFeatureFlag({
    where: {
      name: identifier,
    },
  }).exec(sql);

  if (isNil(flag) || flag.name !== identifier) {
    throw AppError.serverError({
      message: "Received a feature flag identifier that doesn't exist.",
      identifier,
    });
  }

  await queries.featureFlagUpdate(sql, {
    where: {
      name: identifier,
    },
    update: {
      globalValue: value,
      tenantValues,
    },
  });

  if (featureFlagCache.isEnabled()) {
    // Clear the cache if enabled. This method function is often only used in test code, which most likely disables the cache anyways.
    featureFlagCache.clearAll();
  }

  eventStop(event);
}
