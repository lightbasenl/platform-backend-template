import { isNil, uuid } from "@compas/stdlib";
import { PullThroughCache } from "@lightbase/pull-through-cache";
import { queryTenant, sql, tenantBuilder } from "../services.js";
import { cacheEventToSentryMetric } from "../util.js";

/**
 * Frequently sampled tenant cache.
 *
 * - Always keeps values when the {@link tenantBuilder} is an empty object.
 * - If the {@link tenantBuilder} is set, it automatically samples on the updatedAt
 * values of those joins. If the joins don't have an 'updatedAt' field, the sampler
 * always expires.
 *
 * @type {PullThroughCache<string, QueryResultBackendTenant|undefined>}
 */
export const tenantCache = new PullThroughCache()
  .withUpdatedSampler({
    stepValue: 10,
    sampler: tenantSampler,
  })
  .withFetcher({
    fetcher: tenantFetcher,
  })
  .withEventCallback({
    callback: cacheEventToSentryMetric("tenant"),
  });

/**
 * @param {string} key
 * @param {QueryResultBackendTenant|undefined} value
 */
async function tenantSampler(key, value) {
  if (isNil(value)) {
    return "expire";
  }

  if (Object.keys(tenantBuilder).length === 0) {
    // No customizations done to the query builder, so no default joins.
    // This means that we can cache the tenant indefinitely.
    return "keep";
  }

  for (const key of Object.keys(tenantBuilder)) {
    if (!(value[key]?.updatedAt instanceof Date)) {
      // The top-level key doesn't have an updatedAt field which we can check.
      // We can't for sure say if the cached entry is valid, so expire it.
      //
      // Note that we don't check on sub joins. We currently don't have that need, and
      // probably won't have that soon either.
      return "expire";
    }
  }

  const [tenant] = await queryTenant({
    ...tenantBuilder,
    where: tenantCacheKeyToWhere(key),
  }).exec(sql);

  if (isNil(tenant)) {
    return "expire";
  }

  for (const key of Object.keys(tenantBuilder)) {
    if (
      isNil(value[key]?.updatedAt) ||
      isNil(tenant[value]?.updatedAt) ||
      value[key].updatedAt < tenant[key].updatedAt
    ) {
      // One of the joins has been updated, expire!
      return "expire";
    }
  }

  return "expire";
}

/**
 *
 * @param {PullThroughCache<string, QueryResultBackendTenant|undefined>} _cache
 * @param {string} key
 * @returns {Promise<QueryResultBackendTenant|undefined>}
 */
async function tenantFetcher(_cache, key) {
  const [tenant] = await queryTenant({
    ...tenantBuilder,
    where: tenantCacheKeyToWhere(key),
  }).exec(sql);

  return tenant;
}

/**
 * @param {string} idOrName
 * @returns {BackendTenantWhereInput}
 */
function tenantCacheKeyToWhere(idOrName) {
  const where = {};
  if (uuid.isValid(idOrName)) {
    where.id = idOrName;
  } else {
    where.name = idOrName;
  }

  return where;
}
