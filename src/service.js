import { environment } from "@compas/stdlib";
import {
  serviceAppInit,
  serviceAppLoadAndInjectRoutes,
} from "./services/app.js";
import { serviceLoggerInit } from "./services/logger.js";
import { serviceBackendInit } from "./services/lpc.js";
import { serviceMailTransporterInit } from "./services/mail.js";
import { serviceSqlInit } from "./services/postgres.js";
import { serviceQueriesInit } from "./services/queries.js";
import { serviceS3EnsureBuckets, serviceS3Init } from "./services/s3.js";

/**
 * Create all services / service contexts upfront
 * We can do this because of how ES module exports are live bindings
 *
 * @returns {Promise<void>}
 */
export async function injectServices(
  { sqlConnectionMax } = { sqlConnectionMax: 20 },
) {
  serviceLoggerInit();
  await serviceSqlInit({
    connectionCount: sqlConnectionMax,
  });
  serviceS3Init({
    bucketName: environment.BUCKET_NAME ?? environment.APP_NAME,
  });
  serviceMailTransporterInit();
  await serviceAppInit();
  serviceQueriesInit();

  await serviceS3EnsureBuckets();
  await serviceBackendInit();
  await serviceAppLoadAndInjectRoutes();
}
