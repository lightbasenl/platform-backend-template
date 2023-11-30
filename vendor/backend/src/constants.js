/**
 * LPC Internal feature flags
 *
 * @type {string[]}
 */
export const lpcInternalFeatureFlags = [
  // If this feature flag is set, frontend gets a different set of error keys, conveying
  // less information to protect against enumeration attacks and the like.
  "__FEATURE_LPC_AUTH_REDUCE_ERROR_KEY_INFO",
];
