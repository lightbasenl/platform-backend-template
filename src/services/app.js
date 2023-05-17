import { createBodyParser, getApp } from "@compas/server";
import { backendGetConfig } from "@lightbasenl/backend";
import { router } from "../generated/application/common/router.js";
import { serviceLogger } from "./logger.js";

/**
 * @type {Application}
 */
export let app = undefined;

/**
 * Create a new Koa app instance.
 *
 * @returns {Promise<void>}
 */
export async function serviceAppInit() {
  serviceLogger.info("setting app");

  const { corsOrigin } = await backendGetConfig();

  app = getApp({
    headers: {
      cors: {
        maxAge: 7200,
        origin: corsOrigin,
      },
    },
    logOptions: {
      requestInformation: {
        includeEventName: true,
        includePath: false,
        includeValidatedParams: true,
      },
    },
  });
}

/**
 * Load all controllers and mount the generated router.
 *
 * @returns {Promise<void>}
 */
export async function serviceAppLoadAndInjectRoutes() {
  serviceLogger.info("loading app");

  await Promise.all([await import("../scaffold/controller.js")]);

  app.use(
    router(
      createBodyParser({
        multipart: true,
        multipartOptions: {
          maxFileSize: 15 * 1024 * 1024,
        },
      }),
    ),
  );
}
