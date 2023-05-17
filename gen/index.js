import { storeGetStructure } from "@compas/store";
import {
  authPermissions,
  extendWithAuthAnonymousBased,
  extendWithAuthPasswordBased,
  extendWithAuthPermission,
  extendWithAuthTotpProvider,
  extendWithBackendBase,
  extendWithFeatureFlag,
  extendWithManagement,
} from "@lightbasenl/backend";
import { featureFlagDefinition, permissions } from "../src/constants.js";
import { extendWithAuthCustom } from "./auth.js";
import { extendWithDatabase } from "./database.js";
import { extendWithMail } from "./mail.js";
import { extendWithScaffold } from "./scaffold.js";
import { extendWithType } from "./type.js";

/**
 * Extend with compas additional/optional package  structures
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithCompasPackages(generator) {
  generator.addStructure(storeGetStructure());
}

/**
 * Extend with @lightbasenl/backend (LPC) structures/services
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export async function extendWithBackend(generator) {
  await extendWithBackendBase(generator);
  await extendWithFeatureFlag(generator, {
    flagDefinition: featureFlagDefinition,
  });

  await extendWithAuthPermission(generator, {
    permissions: {
      ...authPermissions,
      ...permissions,
    },
    addManagementRoutes: true,
  });

  await extendWithAuthAnonymousBased(generator);
  await extendWithAuthPasswordBased(generator);
  await extendWithAuthTotpProvider(generator);
  await extendWithManagement(generator);
}

/**
 * Internal structures
 *
 * @param {import("@compas/code-gen").Generator} generator
 */
export function extendWithInternal(generator) {
  // General
  extendWithDatabase(generator);
  extendWithType(generator);
  extendWithMail(generator);

  // Dep overwrites
  extendWithAuthCustom(generator);

  // entities
  extendWithScaffold(generator);
}
