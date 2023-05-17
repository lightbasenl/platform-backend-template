import { environment, isProduction } from "@compas/stdlib";
import {
  objectStorageCreateClient,
  objectStorageEnsureBucket,
  objectStorageGetDevelopmentConfig,
} from "@compas/store";
import { ensureEnvironmentVars } from "./core.js";
import { serviceLogger } from "./logger.js";

/**
 * @type {S3Client}
 */
export let s3Client = undefined;

/**
 * @type {string}
 */
export let bucketName = undefined;

/**
 * @param {string} newBucketName
 */
export function setBucketName(newBucketName) {
  serviceLogger.info("setting bucketName");
  bucketName = newBucketName;
  return bucketName;
}

/**
 * Make sure all buckets exist
 *
 * @returns {Promise<void>}
 */
export async function serviceS3EnsureBuckets() {
  serviceLogger.info("ensure bucket exists");
  await objectStorageEnsureBucket(s3Client, {
    bucketName,
    LocationConstraint: environment.AWS_DEFAULT_REGION ?? "eu-central-1",
  });
}

/**
 * Create an s3 client. For local development and testing we use the Compas provided
 * development config. In production, we require AWS native authentication environment
 * variables.
 *
 * @param {{
 *   bucketName: string,
 * }} options
 */
export function serviceS3Init(options) {
  serviceLogger.info("Setting S3 client");

  if (isProduction()) {
    ensureEnvironmentVars(["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]);
  }

  s3Client = objectStorageCreateClient(
    isProduction() ? {} : objectStorageGetDevelopmentConfig(),
  );
  bucketName = options.bucketName;
}
