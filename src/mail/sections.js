/**
 * @param {{ publicUrl: string }} config
 * @returns {string}
 */
export const LogoHeader = ({ publicUrl }) => `
  <mj-section background-color="#292949">
    <mj-column>
      <mj-image align="left" width="200px" src="${publicUrl}/mail/logo.svg"></mj-image>
    </mj-column>
  </mj-section>
`;

/**
 * @param {{ publicUrl: string }} config
 * @returns {string}
 */
export const GeneralFooter = ({ publicUrl }) => `
  <mj-section background-color="#FFFFFF">
    <mj-column>
      <mj-text font-size="12px" color="#B8C6CB" line-height="20px">
        © ${new Date().getFullYear()} Lightbase (Send from ${publicUrl})
      </mj-text>
    </mj-column>
  </mj-section>
`;
