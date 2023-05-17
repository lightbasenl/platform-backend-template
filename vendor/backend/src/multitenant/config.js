import { AppError, configLoaderGet, environment, isNil } from "@compas/stdlib";
import { importProjectResource } from "../util.js";

/**
 * @typedef {object} LoadedTenant
 * @property {string} name
 * @property {BackendTenantData} data
 * @property {BackendTenantUrlConfig} urlConfig
 */

/**
 * @typedef {object} TenantConfig
 * @property {Record<string, LoadedTenant>} tenantsByName
 * @property {Record<string, LoadedTenant>} tenantsByPublicUrl
 * @property {Record<string, LoadedTenant>} tenantsByApiUrl
 * @property {{
 *   hasUniqueApiUrls: boolean,
 * }} properties Statically analyzed properties of the config, to easy some operations.
 */

/**
 *
 * @type {{
 *   _isLoaded: boolean,
 * } & TenantConfig}
 */
const loadedTenantConfig = {
  _isLoaded: false,
  tenantsByName: {},
  tenantsByPublicUrl: {},
  tenantsByApiUrl: {},
  properties: {
    hasUniqueApiUrls: true,
  },
};

/**
 * Read the config file and return an object with the enabled tenants.
 *
 * @returns {Promise<TenantConfig>}
 */
export async function multitenantLoadConfig() {
  if (loadedTenantConfig._isLoaded) {
    return {
      tenantsByName: loadedTenantConfig.tenantsByName,
      tenantsByPublicUrl: loadedTenantConfig.tenantsByPublicUrl,
      tenantsByApiUrl: loadedTenantConfig.tenantsByApiUrl,
      properties: loadedTenantConfig.properties,
    };
  }

  /** @type {typeof import("../../../../src/generated/application/backend/validators.js").validateBackendTenantConfig} */
  const validateBackendTenantConfig = await importProjectResource(
    "./src/generated/application/backend/validators.js",
    "validateBackendTenantConfig",
  );

  if (
    !["production", "acceptance", "development"].includes(
      environment.LPC_BACKEND_ENVIRONMENT,
    )
  ) {
    throw AppError.serverError({
      message:
        "Environment variable 'LPC_BACKEND_ENVIRONMENT' is not set, but is required to load the tenant configuration.",
      allowedValues: ["production", "acceptance", "development"],
    });
  }

  const config = await configLoaderGet({
    name: "tenants",
    location: "project",
  });

  const { error, value } = validateBackendTenantConfig(config.data);
  if (error) {
    throw AppError.serverError(
      {
        message: "Error loading tenants.",
      },
      AppError.validationError("validator.error", error),
    );
  }

  const byPublicUrl = {};
  const byApiUrl = {};

  // Filter out disabled urls and then tenants without active urls in the url config.
  for (const [tenantName, config] of Object.entries(value.tenants)) {
    // @ts-expect-error
    config.name = tenantName;

    for (const [publicUrl, settings] of Object.entries(config.urlConfig)) {
      if (settings.environment !== environment.LPC_BACKEND_ENVIRONMENT) {
        delete config.urlConfig[publicUrl];
      } else {
        byPublicUrl[publicUrl] = config;
        byApiUrl[settings.apiUrl] = config;
      }
    }

    if (Object.keys(config.urlConfig).length === 0) {
      delete value.tenants[tenantName];
    }
  }

  if (Object.keys(value.tenants).length === 0) {
    throw AppError.serverError({
      // @ts-expect-error
      message: `'config/${config.resolvedLocation.filename}' should specify at least a single enabled tenant.`,
    });
  }

  loadedTenantConfig._isLoaded = true;
  // @ts-expect-error
  loadedTenantConfig.tenantsByName = value.tenants;
  // @ts-expect-error
  loadedTenantConfig.tenantsByPublicUrl = byPublicUrl;
  // @ts-expect-error
  loadedTenantConfig.tenantsByApiUrl = byApiUrl;
  loadedTenantConfig.properties = tenancyDetermineConfigProperties(
    // @ts-expect-error
    value.tenants,
  );

  return {
    tenantsByName: loadedTenantConfig.tenantsByName,
    tenantsByPublicUrl: loadedTenantConfig.tenantsByPublicUrl,
    tenantsByApiUrl: loadedTenantConfig.tenantsByApiUrl,
    properties: loadedTenantConfig.properties,
  };
}

/**
 * Get a list of all enabled tenants in the current environment.
 *
 * @returns {Promise<string[]>}
 */
export async function multitenantEnabledTenantNames() {
  const { tenantsByName } = await multitenantLoadConfig();

  return Object.keys(tenantsByName);
}

/**
 * Get tenant config data for the specified tenant
 *
 * @param {string} name
 * @returns {Promise<LoadedTenant>}
 */
export async function multitenantConfigForTenant(name) {
  const { tenantsByName } = await multitenantLoadConfig();
  const tenant = tenantsByName[name];

  if (isNil(tenant)) {
    throw AppError.validationError(
      "multitenant.configForTenant.invalidTenant",
      {
        name,
      },
    );
  }

  return tenant;
}

/**
 *
 * @param {Record<string, LoadedTenant>} tenants
 * @returns {TenantConfig["properties"]}
 */
function tenancyDetermineConfigProperties(tenants) {
  /** @type {TenantConfig["properties"]} */
  const properties = {
    hasUniqueApiUrls: true,
  };

  // Check if the api urls are all unique, this allows us to skip enforcing a Origin or
  // `X-LPC-Origin` header and instead use the request host.
  const apiUrls = new Set();
  for (const config of Object.values(tenants)) {
    for (const settings of Object.values(config.urlConfig)) {
      if (apiUrls.has(settings.apiUrl)) {
        properties.hasUniqueApiUrls = false;
        break;
      }

      apiUrls.add(settings.apiUrl);
    }

    if (!properties.hasUniqueApiUrls) {
      break;
    }
  }

  return properties;
}
