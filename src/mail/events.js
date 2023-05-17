import { eventStart, eventStop, newEventFromEvent } from "@compas/stdlib";
import mjml2html from "mjml";
import { validateMailAddressHeaders } from "../generated/application/mail/validators.js";
import { mailTransporter } from "../services/mail.js";
import { mailGeneric } from "./template/generic.js";

/**
 * @type {MailAddress}
 */
const MAIL_FROM_ADDRESS = {
  name: "Lightbase Platforms",
  address: "no-reply@platforms.lightbase.nl",
};

/**
 * Mail: send generic mail
 *
 * @param {InsightEvent} event
 * @param {MailAddress} email
 * @param {MailGeneric} payload
 * @returns {Promise<void>}
 */
export async function mailSendGeneric(event, email, payload) {
  eventStart(event, "mail.sendGeneric");

  await mailSend(
    newEventFromEvent(event),
    mailGeneric,
    constructMailAddressHeaders(MAIL_FROM_ADDRESS, email),
    payload,
  );

  eventStop(event);
}

/**
 * Mail: send a mail
 *
 * @template T
 *
 * @param {InsightEvent} event
 * @param {function(MailAddressHeaders, T): MailTemplateResponse} template
 * @param {MailAddressHeaders} addresses
 * @param {T} [payload={}]
 * @param {import("@types/nodemailer").Attachment[]} [attachments]
 * @returns {Promise<void>}
 */
async function mailSend(
  event,
  template,
  addresses,
  payload = {},
  attachments = undefined,
) {
  eventStart(event, `mail.send.${template.name}`);

  // We don't use the result since, nodemailer doesn't like Object.create(null), and the
  // validator doesn't do any transformation like convert or default values.
  const validateResult = validateMailAddressHeaders(addresses, event.name);
  if (validateResult.error) {
    throw validateResult.error;
  }

  // render template (with payload)
  const { mjml, subject } = await template(addresses, payload);
  const html = mjml2html(mjml)?.html ?? "";

  if (!mailTransporter) {
    event.log.info({
      type: `${event.name}.transporterNotSet`,
      data: {
        addresses,
        payload,
        template: template.name,
      },
    });
    eventStop(event);
    return;
  }

  await mailTransporter.sendMail({
    ...addresses,
    subject,
    attachments: attachments ?? [],
    html: html.replace("/\r?\n|\r/g", ""),
  });

  eventStop(event);
}

/**
 * Construct a mail header object for nodemailer
 *
 * @param {MailAddress} from
 * @param {MailAddress|MailAddress[]} to
 * @param {MailAddress[]|undefined} [cc]
 * @param {MailAddress[]|undefined} [bcc]
 * @returns {MailAddressHeaders}
 */
function constructMailAddressHeaders(from, to, cc, bcc) {
  return {
    from,
    to: Array.isArray(to) ? to : [to],
    cc: cc ?? [],
    bcc: bcc ?? [],
  };
}
