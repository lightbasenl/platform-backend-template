import { createTestAppAndClient } from "@compas/server";
import { uuid } from "@compas/stdlib";
import {
  cleanupTestPostgresDatabase,
  objectStorageRemoveBucket,
} from "@compas/store";
import {
  authInjectTokenInterceptors,
  multitenantInjectAxios,
} from "@lightbasenl/backend";
import axios from "axios";
import { axiosInterceptErrorAndWrapWithAppError } from "./generated/application/common/api-client.js";
import {
  app,
  serviceAppInit,
  serviceAppLoadAndInjectRoutes,
} from "./services/app.js";
import { serviceLogger, serviceLoggerTestInit } from "./services/logger.js";
import { serviceBackendInit } from "./services/lpc.js";
import { serviceSqlTestInit, sql } from "./services/postgres.js";
import { serviceQueriesInit } from "./services/queries.js";
import {
  bucketName,
  s3Client,
  serviceS3EnsureBuckets,
  serviceS3Init,
} from "./services/s3.js";

/**
 * Initialize all services based on an empty database and fresh s3 bucket.
 * Note that by default expensive network operations are not injected, and should be
 * enabled on a case by case basis.
 *
 * @returns {Promise<void>}
 */
export async function injectTestServices() {
  serviceLoggerTestInit();
  await serviceSqlTestInit();
  serviceS3Init({
    bucketName: uuid(),
  });
  await serviceAppInit();
  serviceQueriesInit();

  await serviceS3EnsureBuckets();
  await serviceBackendInit();
  await serviceAppLoadAndInjectRoutes();
}

/**
 * Remove test database and test s3 bucket
 *
 * @returns {Promise<void>}
 */
export async function cleanupTestServices() {
  serviceLogger.info("cleanup test services");

  await cleanupTestPostgresDatabase(sql);
  await objectStorageRemoveBucket(s3Client, {
    bucketName,
    includeAllObjects: true,
  });
}

/**
 * Creates an axios instance with cookie support and
 * injects it into the generated api client.
 *
 * @returns {Promise<AxiosInstance>}
 */
export async function createTestAxiosInstance() {
  const axiosInstance = axios.create({});

  axiosInterceptErrorAndWrapWithAppError(axiosInstance);
  authInjectTokenInterceptors(axiosInstance);
  multitenantInjectAxios(axiosInstance, "scaffold.acc.lightbase.nl");
  await createTestAppAndClient(app, axiosInstance);

  return axiosInstance;
}
