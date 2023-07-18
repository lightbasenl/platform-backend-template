import {
  AppError,
  environment,
  eventStart,
  eventStop,
  isNil,
  isProduction,
  uuid,
} from "@compas/stdlib";
import { queryTenant, sql, tenantBuilder } from "../services.js";
import { multitenantLoadConfig } from "./config.js";

const tenantOriginHeaderName = `x-lpc-tenant-origin`;

/**
 * Require a tenant based on the request context, name or id. Returns a resolved tenant,
 * which contains the database entity, url config and the publicUrl applicable for this
 * request.
 *
 * If `name` or `id` is used, the publicUrl and api url resolve to the first url defined
 * in the urlConfig that can be applied to the current environment. They are always
 * forced to be `https`, please use the url config if you need something else.
 *
 * If the request context is used the publicUrl and apiUrl are appropriately resolved,
 * with the correct protocol attached. It uses the following order of resolving;
 * - If each tenant has a unique api url, the Host header is mandatory and used
 * - Else the 'Origin' or 'x-lpc-tenant-origin' is mandatory and used to resolve the
 * tenant
 *
 * In development environments the 'x-lpc-tenant-origin' header can be used to 'spoof' a
 * specific tenant. Is has precedence above the other methods described above.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/server").Context<any, any, any>|string} contextOrIdOrName
 * @returns {Promise<BackendResolvedTenant>}
 */
export async function multitenantRequireTenant(event, contextOrIdOrName) {
  eventStart(event, "multitenant.requireTenant");

  if (typeof contextOrIdOrName === "string") {
    const result = await multitenantLoadByNameOrId(contextOrIdOrName);

    eventStop(event);
    return result;
  }

  if (typeof contextOrIdOrName.get !== "function") {
    throw AppError.validationError(`${event.name}.invalidArguments`);
  }

  const result = await multitenantLoadByContext(contextOrIdOrName);

  eventStop(event);
  return result;
}

/**
 * Resolve tenant based on ID or name
 *
 * @param {string} idOrName
 * @returns {Promise<BackendResolvedTenant>}
 */
async function multitenantLoadByNameOrId(idOrName) {
  const { tenantsByName } = await multitenantLoadConfig();

  if (isNil(idOrName)) {
    throw AppError.validationError(`multitenant.require.invalidTenant`);
  }

  const where = {};
  if (uuid.isValid(idOrName)) {
    where.id = idOrName;
  } else {
    where.name = idOrName;
  }

  const [tenant] = await queryTenant({
    ...tenantBuilder,
    where,
  }).exec(sql);

  if (isNil(tenantsByName[tenant?.name])) {
    throw AppError.validationError(`multitenant.require.invalidTenant`);
  }

  const urlConfig = tenantsByName[tenant.name].urlConfig;

  return {
    tenant,
    urlConfig,
    publicUrl: `https://${Object.keys(urlConfig)[0]}`,
    apiUrl: `https://${Object.values(urlConfig)[0].apiUrl}`,
  };
}

/**
 * Cheap way of getting the tenant, publicUrl and apiUrl that is used for the current
 * request. The tenant is not the one in the database. To fetch it, query the tenant
 * table based on the returned `tenant.name`.
 *
 * Has a specialized implementation to support local backend development as well as local
 * frontend development against remote environment.
 *
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @returns {Promise<BackendResolvedTenant>}
 */
export async function multitenantLoadByContext(ctx) {
  const { properties, tenantsByApiUrl, tenantsByPublicUrl } =
    await multitenantLoadConfig();

  let originWithProtocol = ctx.get("origin");
  const originWithoutProtocol = originWithProtocol?.split("://")?.[1];
  let hostWithoutProtocol = ctx.get("host");
  const hostWithProtocol = `${ctx.protocol}://${hostWithoutProtocol}`;
  let tenantOriginWithoutProtocol = ctx.get(tenantOriginHeaderName);
  let tenantOriginWithProtocol = `https://${tenantOriginWithoutProtocol}`;

  if (!originWithProtocol || originWithProtocol.trim().length === 0) {
    originWithProtocol = undefined;
  }
  if (!hostWithoutProtocol || hostWithoutProtocol.trim().length === 0) {
    hostWithoutProtocol = undefined;
  }
  if (
    !tenantOriginWithoutProtocol ||
    tenantOriginWithoutProtocol.trim().length === 0
  ) {
    tenantOriginWithoutProtocol = undefined;
    // @ts-expect-error
    tenantOriginWithProtocol = undefined;
  }

  if (isNil(hostWithoutProtocol)) {
    throw AppError.validationError(`multitenant.require.missingHostHeader`);
  }

  const allowedDevelopmentRequests =
    !isProduction() ||
    environment.LPC_BACKEND_ENVIRONMENT === "development" ||
    environment.LPC_BACKEND_ENVIRONMENT === "acceptance";

  /**
   * @type {BackendResolvedTenant}
   */
  const result = {};
  /** @type {Partial<LoadedTenant>} */
  let configTenant = {};

  if (properties.hasUniqueApiUrls && !allowedDevelopmentRequests) {
    result.apiUrl = hostWithProtocol;
    configTenant = tenantsByApiUrl[hostWithoutProtocol];

    for (const [publicUrl, spec] of Object.entries(
      configTenant?.urlConfig ?? {},
    )) {
      if (spec.apiUrl === hostWithoutProtocol) {
        // We can't really check if the publicUrl is same as origin, since SSR does not send an origin header
        result.publicUrl = `${ctx.protocol}://${publicUrl}`;
        break;
      }
    }
  } else if (!allowedDevelopmentRequests) {
    result.publicUrl = originWithProtocol ?? tenantOriginWithProtocol;
    configTenant =
      tenantsByPublicUrl[originWithoutProtocol ?? tenantOriginWithoutProtocol];
    result.apiUrl = `${ctx.protocol}://${configTenant?.urlConfig?.[
      originWithoutProtocol ?? tenantOriginWithoutProtocol
    ]?.apiUrl}`;
  } else {
    // We also resolve the 'other' url here,
    // Using either the host or origin header, this way local development resolves to the
    // url used in the request.
    if (tenantOriginWithoutProtocol) {
      configTenant = tenantsByPublicUrl[tenantOriginWithoutProtocol];

      if (originWithProtocol) {
        // If frontend uses tenant origin header we want all urls to resolve to the
        // localhost of the dev, and not to the origin.
        result.publicUrl = originWithProtocol;
      } else {
        result.publicUrl = tenantOriginWithProtocol;
      }

      result.apiUrl = hostWithProtocol;
    } else if (properties.hasUniqueApiUrls) {
      configTenant = tenantsByApiUrl[hostWithoutProtocol];

      result.apiUrl = hostWithProtocol;
      result.publicUrl = originWithProtocol ?? tenantOriginWithProtocol;

      if (isNil(result.publicUrl)) {
        for (const [publicUrl, spec] of Object.entries(
          configTenant?.urlConfig ?? {},
        )) {
          if (spec.apiUrl === hostWithoutProtocol) {
            // We can't really check if the publicUrl is same as origin, since SSR / Apps does not send an origin header
            result.publicUrl = `${ctx.protocol}://${publicUrl}`;
            break;
          }
        }
      }
    } else {
      result.publicUrl = originWithProtocol;
      result.apiUrl = hostWithProtocol;

      configTenant = tenantsByPublicUrl[originWithoutProtocol];
    }
  }

  if (isNil(configTenant) || isNil(result.publicUrl) || isNil(result.apiUrl)) {
    throw AppError.validationError(`multitenant.require.invalidTenant`);
  }

  const [tenant] = await queryTenant({
    ...tenantBuilder,
    where: {
      name: configTenant.name,
    },
  }).exec(sql);

  if (isNil(tenant)) {
    throw AppError.validationError(`multitenant.require.invalidTenant`);
  }

  result.tenant = tenant;
  // @ts-expect-error
  result.urlConfig = configTenant.urlConfig;

  return result;
}

/**
 * Set the tenant for all requests executed via the provided Axios instance.
 * It uses the 'x-lpc-tenant-origin' header to force the tenant. This is only necessary
 * for local testing.
 *
 * @param {import("axios").AxiosInstance} axios
 * @param {string} tenantUrl
 * @returns {void}
 */
export function multitenantInjectAxios(axios, tenantUrl) {
  axios.defaults.headers[tenantOriginHeaderName] = tenantUrl;
}
