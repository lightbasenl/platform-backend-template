import { newEvent } from "@compas/stdlib";
import {
  authPermissions,
  backendInit,
  backendInitServices,
} from "@lightbasenl/backend";
import { buildMandatoryRoles, permissions } from "../constants.js";
import { serviceLogger } from "./logger.js";

/**
 * @returns {Promise<void>}
 */
export async function serviceBackendInit() {
  await backendInitServices({
    userBuilder: {
      settings: {},
    },
  });

  await backendInit(newEvent(serviceLogger), {
    multitenant: {
      syncUsersAcrossAllTenants: true,
    },
    management: {},
    featureFlag: {},
    auth: {
      sessionTransportSettings: {
        sessionStoreSettings: {
          accessTokenMaxAgeInSeconds: 10 * 60, // 10 minutes
          refreshTokenMaxAgeInSeconds: 60 * 60, // 1 hour
        },
      },
      permissionIdentifiers: [
        ...Object.values(authPermissions),
        ...Object.values(permissions),
      ],
      mandatoryRoles: buildMandatoryRoles,
      anonymousBased: {},
      passwordBased: {},
      totpProvider: {},
      permission: {},
    },
  });
}
