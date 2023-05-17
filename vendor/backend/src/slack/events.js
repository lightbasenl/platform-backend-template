import {
  AppError,
  environment,
  eventStart,
  eventStop,
  isProduction,
  newEventFromEvent,
} from "@compas/stdlib";
import axios from "axios";

/**
 * Send a Slack message to a user in the Lightbase workspace. Currently only supports
 * sending a simple text message. May be expanded later on.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {string} slackUserId
 * @param {string} message
 * @returns {Promise<void>}
 */
export async function slackSendMessageToUser(event, slackUserId, message) {
  eventStart(event, "slack.sendMessageToUser");

  await slackCredentialsValidate();
  await slackUserBelongsToWorkspace(newEventFromEvent(event), slackUserId);

  const { ok, error } = await slackApiCall({
    url: `/chat.postMessage`,
    method: "POST",
    data: JSON.stringify({
      channel: slackUserId,
      text: message,
    }),
  });

  if (!ok) {
    throw AppError.serverError({
      message: "Could not execute chat.postMessage",
      error,
    });
  }

  eventStop(event);
}

/**
 * Remove all messages send to users.
 *
 * A user could have accessed authorization like 20 times a day. This would clutter their
 * messages with repeated messages that look basically the same. By removing each message
 * every night, it is much easier for the user to see which link to click on.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @returns {Promise<void>}
 */
export async function slackInvalidateConversations(event) {
  eventStart(event, "slack.invalidateConversations");

  if (!isProduction()) {
    eventStop(event);
    return;
  }

  const { ok, error, channels } = await slackApiCall({
    url: `/conversations.list`,
    method: "GET",
    params: {
      types: "im",
    },
  });

  if (!ok) {
    throw AppError.serverError({
      message: "Could not execute conversations.list",
      error,
    });
  }

  for (const channel of channels) {
    const { ok, error, messages } = await slackApiCall({
      url: "/conversations.history",
      method: "GET",
      params: {
        channel: channel.id,
      },
    });

    if (!ok && error === "channel_not_found") {
      // Channel could be removed by another instance of LPC which is running the same
      // job.
      continue;
    }

    if (!ok) {
      throw AppError.serverError({
        message: "Could not execute conversations.history",
        error,
      });
    }

    for (const message of messages) {
      // Only try to remove messages created by the bot.
      // The bot id shouldn't change, while the app_id may change when reautorizing the
      // bot.
      if (message.bot_profile?.id !== "B043W52PBAS") {
        continue;
      }

      const { ok, error } = await slackApiCall({
        url: "/chat.delete",
        method: "POST",
        data: JSON.stringify({
          channel: channel.id,
          ts: message.ts,
        }),
      });

      if (!ok && error === "message_not_found") {
        // Message could be removed by another instance of LPC which is executing this function, so we can safely continue;
        continue;
      }

      if (!ok) {
        throw AppError.serverError({
          message: "Could not execute chat.delete",
          error,
        });
      }
    }
  }

  eventStop(event);
}

/**
 * Check if the provided user id exists and belongs to the workspace. We have a lot of
 * shared channels. Without this check, all these users could also access this panel, but
 * that's not the way we want to work.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {string} slackUserId
 * @returns {Promise<void>}
 */
export async function slackUserBelongsToWorkspace(event, slackUserId) {
  eventStart(event, "slack.userBelongsToWorkspace");

  const { ok, user } = await slackApiCall({
    url: "/users.info",
    method: "GET",
    params: {
      user: slackUserId,
    },
  });

  if (!ok) {
    throw AppError.validationError("slack.sendMessageToUser.invalidUser", {
      message: "The user is not authorized to access this functionality.",
    });
  }

  if (user.is_stranger) {
    throw AppError.validationError("slack.sendMessageToUser.invalidUser", {
      message: "User is not authorized to access this functionality.",
    });
  }

  eventStop(event);
}

/**
 * Ensure that the auth token we have is correct.
 *
 * Docs:
 *  - https://api.slack.com/methods/auth.test#errors
 *
 * @returns {Promise<void>}
 */
export async function slackCredentialsValidate() {
  const { ok, error } = await slackApiCall({
    url: `/auth.test`,
    method: "POST",
    data: JSON.stringify({}),
  });

  if (!ok) {
    throw AppError.serverError({
      message: "Could not connect to Slack.",
      error,
    });
  }
}

/**
 * Call the Slack API. Hardcoded authentication token, this is limited to the single
 * Lightbase workspace.
 *
 * @param {Partial<import("axios").AxiosRequestConfig>} request
 * @returns {Promise<any>}
 */
async function slackApiCall(request) {
  const response = await axios.request({
    baseURL: "https://slack.com/api",
    headers: {
      Authorization: `Bearer ${slackGetToken()}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    ...request,
  });

  return response.data;
}

/**
 * Get the slack token. Environments could set it base64 encoded. This way potential
 * scanning services won't trigger false positives.
 *
 * The token has the following permissions:
 * - Send messages as @platform_backend
 * - View basic information about direct messages that Platform backend has been added to
 * - View basic information about public channels in a workspace
 * - View basic information about group direct messages that Platform backend has been
 * added to
 * - View basic information about private channels that Platform backend has been added
 * to
 * - View messages and other content in direct messages that Platform backend has been
 * added to
 * - View people in a workspace
 *
 * @returns {string}
 */
function slackGetToken() {
  const token = environment.LPC_MANAGEMENT_SLACK_TOKEN;

  if (typeof token !== "string" || token.length === 0) {
    throw AppError.serverError({
      message: `Missing environment variable 'LPC_MANAGEMENT_SLACK_TOKEN'. Please add it to your '.env' file.`,
    });
  }

  if (token.startsWith("xoxb")) {
    return token;
  }

  environment.LPC_MANAGEMENT_SLACK_TOKEN = Buffer.from(
    token,
    "base64",
  ).toString("utf-8");

  return environment.LPC_MANAGEMENT_SLACK_TOKEN;
}
