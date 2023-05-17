import { mainFn, newEvent } from "@compas/stdlib";
import {
  jobFileCleanup,
  jobFileGeneratePlaceholderImage,
  jobFileTransformImage,
  jobQueueCleanup,
  jobQueueInsights,
  jobSessionStoreCleanup,
  jobSessionStoreProcessLeakedSession,
  queueWorkerCreate,
  queueWorkerRegisterCronJobs,
} from "@compas/store";
import {
  authEventNames,
  authJobNames,
  authPasswordBasedInvalidateResetTokens,
  managementInvalidateUsers,
} from "@lightbasenl/backend";
import {
  authAnonymousBasedUserRegisteredEvent,
  authPasswordBasedEmailUpdatedEvent,
  authPasswordBasedForgotPasswordEvent,
  authPasswordBasedLoginVerifiedEvent,
  authPasswordBasedPasswordResetEvent,
  authPasswordBasedPasswordUpdatedEvent,
  authPasswordBasedUserRegisteredEvent,
} from "../src/auth/jobs.js";
import { injectServices } from "../src/service.js";
import { serviceLogger } from "../src/services/logger.js";
import { sql } from "../src/services/postgres.js";
import { bucketName, s3Client } from "../src/services/s3.js";

mainFn(import.meta, main);

async function main() {
  const workerCount = 3;

  await injectServices({ sqlConnectionMax: workerCount + 1 });
  await queueWorkerRegisterCronJobs(newEvent(serviceLogger), sql, {
    jobs: [
      {
        // Daily at 1 AM UTC
        name: "compas.queue.cleanup",
        cronExpression: "0 1 * * *",
      },
      {
        // Hourly at 0th minute
        name: "compas.queue.insights",
        cronExpression: "0 * * * *",
      },
      {
        // Daily at 2 AM UTC
        name: "compas.file.cleanup",
        cronExpression: "0 2 * * *",
      },
      {
        // Daily at 2 AM UTC
        name: "compas.sessionStore.cleanup",
        cronExpression: "0 2 * * *",
      },
      {
        // Every 2 hours
        name: authJobNames.authPasswordBasedInvalidateResetTokens,
        cronExpression: "0 */2 * * *",
      },
      {
        // Every night a bit after 2 AM
        name: "backendManagement.invalidateUsers",
        cronExpression: "2 2 * * *",
      },
    ],
  });

  const { start } = new queueWorkerCreate(sql, {
    handler: {
      // Recurring cleanups for low-level features
      "compas.queue.cleanup": jobQueueCleanup({ queueHistoryInDays: 5 }),
      "compas.queue.insights": jobQueueInsights(),
      "compas.file.generatePlaceholderImage": jobFileGeneratePlaceholderImage(
        s3Client,
        bucketName,
      ),
      "compas.file.transformImage": jobFileTransformImage(s3Client),
      "compas.file.cleanup": jobFileCleanup(s3Client, bucketName),
      "compas.sessionStore.cleanup": jobSessionStoreCleanup({
        maxRevokedAgeInDays: 14,
      }),

      // Potential session hijacks
      "compas.sessionStore.potentialLeakedSession":
        jobSessionStoreProcessLeakedSession({}),

      // @lightbasenl/backend
      [authEventNames.authAnonymousBasedUserRegistered]:
        authAnonymousBasedUserRegisteredEvent,
      [authEventNames.authPasswordBasedUserRegistered]:
        authPasswordBasedUserRegisteredEvent,
      [authEventNames.authPasswordBasedForgotPassword]:
        authPasswordBasedForgotPasswordEvent,
      [authEventNames.authPasswordBasedPasswordUpdated]:
        authPasswordBasedPasswordUpdatedEvent,
      [authEventNames.authPasswordBasedEmailUpdated]:
        authPasswordBasedEmailUpdatedEvent,
      [authEventNames.authPasswordBasedLoginVerified]:
        authPasswordBasedLoginVerifiedEvent,
      [authEventNames.authPasswordBasedPasswordReset]:
        authPasswordBasedPasswordResetEvent,
      [authJobNames.authPasswordBasedInvalidateResetTokens]:
        authPasswordBasedInvalidateResetTokens,
      "backendManagement.invalidateUsers": managementInvalidateUsers,
    },
    parallelCount: workerCount,
  });

  start();
}
