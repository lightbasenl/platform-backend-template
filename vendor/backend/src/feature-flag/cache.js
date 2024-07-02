import { AppError } from "@compas/stdlib";
import { PullThroughCache } from "@lightbase/pull-through-cache";
import { queryFeatureFlag, sql } from "../services.js";
import { cacheEventToSentryMetric } from "../util.js";

/**
 * Short TTL feature flag cache. Keeps all flags for 5 seconds in memory,
 *
 * @type {PullThroughCache<FeatureFlagIdentifier, BackendFeatureFlag>}
 */
export const featureFlagCache = new PullThroughCache()
  .withTTL({
    // Note the value is in milliseconds.
    // We don't want to expand this value too much. This could enable
    // race-conditions between the TTL in different instances.
    ttl: 5 * 1000,
  })
  .withFetcher({
    fetcher: featureFlagFetcher,
  })
  .withEventCallback({
    callback: cacheEventToSentryMetric("featureFlag"),
  });

/**
 *
 * @param {PullThroughCache<FeatureFlagIdentifier, BackendFeatureFlag>} _cache
 * @param {FeatureFlagIdentifier} key
 * @returns {Promise<BackendFeatureFlag>}
 */
async function featureFlagFetcher(_cache, key) {
  const flags = await queryFeatureFlag({}).exec(sql);
  _cache.setMany(flags.map((it) => [it.name, it]));

  const foundValue = flags.find((it) => it.name === key);
  if (!foundValue) {
    throw AppError.serverError({
      message: "Received a feature flag identifier that doesn't exist.",
      identifier: key,
    });
  }

  return foundValue;
}
