import { validateMailGeneric } from "../../generated/application/mail/validators.js";
import { GeneralFooter, LogoHeader } from "../sections.js";

/**
 * Renders a button.
 *
 * @param {MailButton} element
 * @returns {string}
 */
const mailElementButton = (element) => `
<mj-button href=${element.url} align="left" font-size="14px" border-radius="4px" height="40px" background-color="#F47515" color="white">
  ${element.label}
</mj-button
<mj-text>
  <p>Indien de bovenstaande knop niet werkt, kun je deze link gebruiken:</p>
  <a href="${element.url}" target="_blank" style="color:#105DFD">${element.url}</a>
</mj-text>
`;

/**
 * Renders a text line.
 *
 * @param {MailLine} element
 * @returns {string}
 */
const mailElementLine = (element) => `
<mj-text font-size="16px" line-height="24px">
  <mj-raw><p>${element.content}</p></mj-raw>
</mj-text>`;

/**
 * Template: generic mail
 *
 * @param {MailAddressHeaders} addresses
 * @param {MailGeneric} data
 * @returns {MailTemplateResponse}
 */
export function mailGeneric(addresses, data) {
  const validatedData = validateMailGeneric(data, "mail.template.generic");
  if (validatedData.error) {
    throw validatedData.error;
  }

  const { mail, urls } = validatedData.value;

  const template = `
    <mjml>
      <mj-body width="650px">
        ${LogoHeader({ publicUrl: urls.publicUrl })}
        
        <mj-section background-color="#FFFFFF">
          <mj-column>
            ${mail.content.map((element) => {
              switch (element.type) {
                case "line":
                  return mailElementLine(element);
                case "button":
                  return mailElementButton(element);
              }
            })}
          </mj-column>
        </mj-section>

        ${GeneralFooter({ publicUrl: urls.publicUrl })}
      </mj-body>
    </mjml>
  `;

  return { mjml: template, subject: mail.subject };
}
