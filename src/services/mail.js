import { environment } from "@compas/stdlib";
import nodemailer from "nodemailer";
import htmlToText from "nodemailer-html-to-text";
import { ensureEnvironmentVars } from "./core.js";
import { serviceLogger } from "./logger.js";

/**
 * @type {import("nodemailer").Transporter}
 */
export let mailTransporter = undefined;

/**
 * Initialize the nodemailer mail transport.
 * Note that for testing, we skip sending mails by default by not setting a mail
 * transporter at all.
 */
export function serviceMailTransporterInit() {
  serviceLogger.info("Setting mail transporter");

  ensureEnvironmentVars(["SMTP_HOST", "SMTP_USERNAME", "SMTP_PASSWORD"]);

  const transporter = nodemailer.createTransport({
    host: environment.SMTP_HOST,
    port: 2525,
    auth: {
      user: environment.SMTP_USERNAME,
      pass: environment.SMTP_PASSWORD,
    },
    debug: true,
  });
  transporter.use("compile", htmlToText.htmlToText());
  mailTransporter = transporter;
}
