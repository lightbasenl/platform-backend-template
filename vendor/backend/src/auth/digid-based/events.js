import { createSign, createVerify, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import https from "node:https";
import { promisify } from "node:util";
import { deflate as asyncDeflate } from "node:zlib";
import {
  AppError,
  dirnameForModule,
  eventStart,
  eventStop,
  isNil,
  isStaging,
  newEventFromEvent,
  pathJoin,
  uuid,
} from "@compas/stdlib";
import { queueWorkerAddJob } from "@compas/store";
import xmldom from "@xmldom/xmldom";
import axios from "axios";
import xmlCrypto from "xml-crypto";
import xpath from "xpath";
import { queries, queryUser, userBuilder } from "../../services.js";
import { authEventNames } from "../constants.js";

const deflate = promisify(asyncDeflate);

// Static reused options
const digestAlgorithm = "http://www.w3.org/2001/04/xmlenc#sha256";
const signatureAlgorithm = "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256";
const cryptoSignAlgorithm = "RSA-SHA256";

/**
 * Certificate chain including root PKI certs, used for a two-way TLS connection to DigiD
 * to resolve the artifact.
 *
 * @type {Buffer|undefined}
 */
let certificateChain = undefined;

/**
 * Public key used to verify payload signatures that we got from DigiD
 *
 * @type {string|undefined}
 */
let digidPublicKey = undefined;

/**
 * @typedef {object} AuthDigidBasedRegisterBody
 * @property {string} bsn
 * @property {object|undefined} [eventMetadata]
 */

/**
 * Register an Digid based user
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {AuthUser} dbUser
 * @param {AuthDigidBasedRegisterBody} body
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authDigidBasedRegister(event, sql, dbUser, body) {
  eventStart(event, "authDigidBased.register");

  if (typeof body?.bsn !== "string") {
    throw AppError.validationError("authDigidBased.register.invalidBsn");
  }

  body.bsn = body.bsn.padStart(9, "0");

  // @ts-expect-error
  //
  // SQL should be in a transaction
  if (typeof sql.savepoint !== "function") {
    throw AppError.serverError({
      message: "Function should be called inside a sql transaction.",
    });
  }

  if (isNil(dbUser?.id)) {
    throw AppError.validationError(`${event.name}.missingUser`);
  }

  const [digidLogin] = await queries.digidLoginInsert(sql, {
    bsn: body.bsn,
    user: dbUser.id,
  });

  await queueWorkerAddJob(sql, {
    name: authEventNames.authDigidBasedUserRegistered,
    priority: 4,
    data: {
      digidLoginId: digidLogin.id,
      metadata: {
        ...(body.eventMetadata ?? {}),
      },
    },
  });

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      id: dbUser.id,
    },
  }).exec(sql);

  eventStop(event);

  return user;
}

/**
 * Verify if a public and private key can be used to sign things.
 * This is a synchronous operation. The functions throws on invalid key pair
 *
 * @param {AuthDigidBasedKeyPair} keyPair
 * @returns {void}
 */
export function authDigidBasedVerifyKeyPair(keyPair) {
  const randomString = uuid();
  let verifyResult = false;

  try {
    const sign = createSign("sha256")
      .update(randomString)
      .sign(keyPair.privateKey, "base64");

    verifyResult = createVerify("sha256")
      .update(randomString)
      .verify(keyPair.publicKey, sign, "base64");
  } catch {
    // Ignore any error since the default verifyResult is false
  }

  if (!verifyResult) {
    throw AppError.validationError(
      "authDigidBased.verifyKeyPair.invalidKeyPair",
    );
  }
}

/**
 * Find a user by the resolved bsn
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {import("@compas/store").Postgres} sql
 * @param {QueryResultBackendTenant} tenant
 * @param {string} bsn
 * @returns {Promise<QueryResultAuthUser>}
 */
export async function authDigidBasedFindByBsn(event, sql, tenant, bsn) {
  eventStart(event, "authDigidBased.findByBsn");

  const [user] = await queryUser({
    ...userBuilder,
    where: {
      viaDigidLogin: {
        where: {
          bsn,
        },
      },
      viaTenants: {
        where: {
          tenant: tenant.id,
        },
      },
    },
  }).exec(sql);

  if (isNil(user)) {
    throw AppError.validationError("authDigidBased.findByBsn.unknownBsn");
  }

  user.lastLogin = new Date();
  await queries.userUpdate(sql, {
    update: {
      lastLogin: new Date(),
    },
    where: {
      id: user.id,
    },
  });

  eventStop(event);

  return user;
}

/**
 * Build the metadata file for statically import by DigiD
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthDigidBasedKeyPair} keyPair
 * @param {string} issuer Issuer name, most likely the public url for the frontend
 * @returns {Promise<string>}
 */
export async function authDigidBasedFormatMetadata(event, keyPair, issuer) {
  eventStart(event, "authDigidBased.formatMetadata");

  const keyName = issuer.startsWith("https") ? issuer.substring(8) : issuer;
  const certParts = keyPair.publicKey.trim().split("\n");
  certParts.shift();
  certParts.pop();

  const cert = certParts.join("\n");

  const metadata = `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:ec="http://www.w3.org/2001/10/xml-exc-c14n#"
  ID="_${getRandomId()}" entityID="${issuer}"
>
  <md:SPSSODescriptor 
    WantAssertionsSigned="true"
    AuthnRequestsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"
  >
    <md:KeyDescriptor use="signing">
      <ds:KeyInfo>
        <ds:KeyName>${keyName}</ds:KeyName>
        <ds:X509Data>
          <ds:X509Certificate>${cert} </ds:X509Certificate>
        </ds:X509Data>
      </ds:KeyInfo>
    </md:KeyDescriptor>
    <md:AssertionConsumerService
    Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Artifact"
    Location="${issuer}/digid" index="0"/>
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;

  const signedXml = await authDigidBasedGetSignatureForPayload(
    newEventFromEvent(event),
    keyPair,
    metadata,
    "//*[local-name(.)='EntityDescriptor']",
  );

  eventStop(event);

  return signedXml;
}

/**
 * Build signature url to redirect to
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthDigidBasedKeyPair} keyPair
 * @param {string} issuer Issuer name, most likely the public url for the frontend
 * @returns {Promise<string>}
 */
export async function authDigidBasedGetRedirectUrl(event, keyPair, issuer) {
  eventStart(event, "authDigidBased.getRedirectUrl");

  // Relatively static payload, only Issues
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="_${getRandomId()}"
  Version="2.0"
  IssueInstant="${new Date().toISOString()}"
  AssertionConsumerServiceIndex="0"
>
  <saml:Issuer>${issuer}</saml:Issuer>
  <samlp:RequestedAuthnContext Comparison="minimum">
    <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
  </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`;

  const url = `${getDigidUrl(
    false,
  )}/saml/idp/request_authentication?${await authDigidBasedGetSignedQueryComponent(
    newEventFromEvent(event),
    keyPair,
    payload,
  )}`;

  eventStop(event);

  return url;
}

/**
 * Resolve an artifact that the frontend send to us.
 * Resolves with a 'bsn' or throws a 401 if any of the preconditions fail
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthDigidBasedKeyPair} keyPair
 * @param {string} artifact
 * @param {string} issuer
 * @returns {Promise<string>}
 */
export async function authDigidBasedResolveArtifact(
  event,
  keyPair,
  artifact,
  issuer,
) {
  eventStart(event, "authDigidBased.resolveArtifact");

  const decodedArtifact = decodeURIComponent(artifact);
  const ID = getRandomId();
  const issueInstant = new Date().toISOString();

  const signedXml = await authDigidBasedGetSignatureForPayload(
    newEventFromEvent(event),
    keyPair,
    `<samlp:ArtifactResolve
 xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
 xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
 ID="_${ID}"
 Version="2.0"
 IssueInstant="${issueInstant}"
>
  <saml:Issuer>${issuer}</saml:Issuer>
  <samlp:Artifact>${decodedArtifact}</samlp:Artifact>
</samlp:ArtifactResolve>`,
    "//*[local-name(.)='ArtifactResolve']",
  );

  const resolvePayload = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
   xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
   xmlns:xsd="http://www.w3.org/2001/XMLSchema"
   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
>
  <soapenv:Body>
    ${signedXml}
  </soapenv:Body>
</soapenv:Envelope>
`;

  let xmlResponse = undefined;

  try {
    // Note that we create a httpsAgent on every digiD login
    // A good optimization would be to keep a 'service' agent in sync with the global
    // municipality
    const response = await axios.request({
      method: "POST",
      url: `${getDigidUrl(true)}/saml/idp/resolve_artifact`,
      data: resolvePayload,
      headers: {
        Accept: "text/xml",
        "content-type": "text/xml; charset=utf-8",
        SOAPAction: "",
      },
      httpsAgent: new https.Agent({
        key: keyPair.privateKey,
        cert: keyPair.publicKey,
        ca: getCertificateChain(),
      }),
    });

    xmlResponse = response.data;

    await authDigidBasedVerifySignaturesForXmlPayload(
      newEventFromEvent(event),
      xmlResponse,
    );
  } catch (/** @type {any} */ e) {
    throw AppError.serverError(
      {
        message: "Unknown DigiD error",
      },
      e,
    );
  }

  const doc = new xmldom.DOMParser().parseFromString(xmlResponse);
  const [mainStatus, subStatus, subSubStatus] = xpath.select(
    "//*[local-name(.)='StatusCode']/@Value",
    doc,
  );

  authDigidBasedVerifyArtifactStatus(
    // @ts-expect-error
    mainStatus?.value ?? "",
    // @ts-expect-error
    subStatus?.value ?? "",
    // @ts-expect-error
    subSubStatus?.value ?? "",
  );

  let bsn = authDigidBasedExtractBsnFromPayload(doc, issuer);
  // Ensure a bsn is 9 characters
  bsn = bsn.padStart(9, "0");

  eventStop(event);

  return bsn;
}

/**
 * Call the settings function and verify the result
 *
 * @param {import("@compas/server").Context<any, any, any>} ctx
 * @param {AuthDigidBasedGetSettings} getSettingsFn
 * @param {AuthDigidBasedGetSettingsOptions|undefined} [options]
 */
export async function authDigidBasedCallGetSettingsFunction(
  ctx,
  getSettingsFn,
  options,
) {
  const settings = await getSettingsFn(ctx, options ?? {});

  // Arbitrary length, to prevent empty string
  if (
    isNil(settings?.issuer) ||
    typeof settings.issuer !== "string" ||
    settings.issuer.length < 5 ||
    !settings.issuer.includes("://")
  ) {
    throw AppError.validationError("authDigidBased.getSettings.invalidIssuer");
  }

  // Arbitrary length, to prevent empty string
  if (
    isNil(settings?.keyPair?.privateKey) ||
    typeof settings.keyPair.privateKey !== "string" ||
    settings.keyPair.privateKey.length < 5
  ) {
    throw AppError.validationError(
      "authDigidBased.getSettings.invalidPrivateKey",
    );
  }

  // Arbitrary length, to prevent empty string
  if (
    isNil(settings?.keyPair?.publicKey) ||
    typeof settings.keyPair.publicKey !== "string" ||
    settings.keyPair.publicKey.length < 5
  ) {
    throw AppError.validationError(
      "authDigidBased.getSettings.invalidPublicKey",
    );
  }

  return settings;
}

/**
 * Sign a xml payload for use in request urls
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthDigidBasedKeyPair} keyPair
 * @param {string} payload
 * @returns {Promise<string>}
 */
async function authDigidBasedGetSignedQueryComponent(event, keyPair, payload) {
  eventStart(event, "authDigidBased.getSignedQueryComponent");

  const samlRequest = encodeURIComponent(
    (await deflate(payload)).toString("base64"),
  );
  const sigAlg = encodeURIComponent(signatureAlgorithm);

  const signer = createSign(cryptoSignAlgorithm);
  signer.update(`SAMLRequest=${samlRequest}&SigAlg=${sigAlg}`);

  const signature = signer.sign(keyPair.privateKey, "base64");

  eventStop(event);

  return `SAMLRequest=${samlRequest}&SigAlg=${sigAlg}&Signature=${encodeURIComponent(
    signature,
  )}`;
}

/**
 * Generate a signature for the provided payload.
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {AuthDigidBasedKeyPair} keyPair
 * @param {string} payload
 * @param {string} xpath
 * @returns {Promise<string>}
 */
async function authDigidBasedGetSignatureForPayload(
  event,
  keyPair,
  payload,
  xpath,
) {
  eventStart(event, "authDigidBased.getSignatureForPayload");

  const xmlSigner = new xmlCrypto.SignedXml({
    signatureAlgorithm,
    privateKey: keyPair.privateKey,
  });

  const transforms = [
    "http://www.w3.org/2000/09/xmldsig#enveloped-signature",
    "http://www.w3.org/2001/10/xml-exc-c14n#",
  ];

  xmlSigner.addReference({
    xpath,
    transforms,
    digestAlgorithm,
  });

  await new Promise((resolve, reject) => {
    xmlSigner.computeSignature(
      payload,
      {
        prefix: "ds",
      },
      (err, value) => {
        if (err) {
          reject(err);
        } else {
          resolve(value);
        }
      },
    );
  });

  const result = xmlSigner.getSignedXml();

  eventStop(event);

  return result;
}

/**
 * Verify a payload with the DigiD public key.
 * Loops over all signatures and expects at least a single signature.
 * Resolves without a value if all signatures are valid
 *
 * @param {import("@compas/stdlib").InsightEvent} event
 * @param {string} payload
 * @returns {Promise<void>}
 */
async function authDigidBasedVerifySignaturesForXmlPayload(event, payload) {
  eventStart(event, "authDigidBased.verifySignaturesForXmlPayload");

  const doc = new xmldom.DOMParser().parseFromString(payload);
  const signatures = xpath.select("//*[local-name(.)='Signature']", doc);
  if (signatures.length === 0) {
    throw AppError.serverError({
      message: "XML couldn't find signatures",
      payload,
    });
  }

  for (const sig of signatures) {
    const xmlSigner = new xmlCrypto.SignedXml({
      publicCert: getDigidPublicKey(),
    });

    xmlSigner.loadSignature(sig);
    await new Promise((resolve, reject) => {
      xmlSigner.checkSignature(payload, (err, result) => {
        if (err) {
          reject(
            AppError.serverError(
              { message: "Could not check artifact resolve signature" },
              err,
            ),
          );
        } else {
          if (!result) {
            reject(
              AppError.serverError(
                { message: "Invalid artifact resolve signature" },
                err,
              ),
            );
          } else {
            eventStop(event);
            resolve(undefined);
          }
        }
      });
    });
  }

  eventStop(event);
}

/**
 * Does some static validations on the artifact resolve document.
 * Expects that signatures are checked, and returns a bsn.
 *
 * @param {*} doc
 * @param {string} issuer
 * @returns {string}
 */
function authDigidBasedExtractBsnFromPayload(doc, issuer) {
  const responseDoc = xpath.select("//*[local-name(.)='Response']", doc)[0];
  if (!responseDoc) {
    throw AppError.serverError({
      message: "Can't get the response doc",
    });
  }

  const audience = xpath.select(
    "string(//*[local-name(.)='AudienceRestriction']/Audience)",
    // @ts-expect-error
    responseDoc,
  )[0];

  // @ts-expect-error
  if (audience && audience.length > 0 && audience !== issuer) {
    // We need to check if the audience corresponds to our issuer. If it's invalid, it
    // most likely is a configuration mismatch between DigiD metadata that we delivered
    // and the globalMunicipality.publicUrl
    throw new AppError("authDigidBased.resolveArtifact.invalidAudience", 401);
  }

  // Date checks, may be out of bounds for some reason
  const rawNotBefore = xpath.select(
    "//*[local-name(.)='Conditions']/@NotBefore",
    // @ts-expect-error
    responseDoc,
  )[0];
  // @ts-expect-error
  if (rawNotBefore?.value && new Date(rawNotBefore).getTime() < Date.now()) {
    throw new AppError("authDigidBased.resolveArtifact.invalidDateRange", 401);
  }

  const rawNotOnOrAfter = xpath.select(
    "//*[local-name(.)='Conditions']/@NotOnOrAfter",
    // @ts-expect-error
    responseDoc,
  )[0];
  if (
    // @ts-expect-error
    rawNotOnOrAfter?.value &&
    // @ts-expect-error
    new Date(rawNotOnOrAfter).getTime() > Date.now()
  ) {
    throw new AppError("authDigidBased.resolveArtifact.invalidDateRange", 401);
  }

  // Extract the bsn
  // @ts-expect-error
  const name = xpath.select("string(//*[local-name(.)='NameID'])", responseDoc);
  const bsnPrefix = "s00000000:";

  // @ts-expect-error
  if (!name || !name.startsWith(bsnPrefix)) {
    // Can also be a sofi-number
    throw new AppError(
      "authDigidBased.resolveArtifact.notResolvedWithBSN",
      401,
    );
  }

  // @ts-expect-error
  return name.substring(bsnPrefix.length);
}

/**
 * Send custom errors for each status combination
 *
 * @param {string} mainStatus
 * @param {string} subStatus
 * @param {string} subSubStatus
 */
function authDigidBasedVerifyArtifactStatus(
  mainStatus,
  subStatus,
  subSubStatus,
) {
  if (mainStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:Success") !== -1) {
    if (
      subSubStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:AuthnFailed") !==
      -1
    ) {
      throw new AppError("authDigidBased.resolveArtifact.aborted", 401);
    }
    return;
  }

  let ourError = true;
  if (
    mainStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:Responder") !== -1
  ) {
    ourError = false;
  }

  if (
    subStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:AuthnFailed") !== -1
  ) {
    throw new AppError("authDigidBased.resolveArtifact.aborted", 401);
  }

  if (
    subStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:NoAuthnContext") !==
    -1
  ) {
    throw new AppError(
      "authDigidBased.resolveArtifact.insufficientSecurityLevel",
      401,
    );
  }

  if (
    subStatus.indexOf("urn:oasis:names:tc:SAML:2.0:status:RequestDenied") !== -1
  ) {
    throw new AppError("authDigidBased.resolveArtifact.invalidSAMLArt", 401);
  }

  throw AppError.serverError({
    message: "Unknown DigiD SAML error when resolving artifact",
    ourError,
  });
}

/**
 * Get the static url based on if we should use staging certs vs real certs.
 * Also a different url for back-channel communication vs redirect url.
 *
 * @param {boolean} isBackChannel
 * @returns {string}
 */
function getDigidUrl(isBackChannel = false) {
  if (isBackChannel) {
    return isStaging()
      ? `https://was-preprod1.digid.nl`
      : `https://was.digid.nl`;
  }

  return isStaging() ? `https://preprod1.digid.nl` : `https://digid.nl`;
}

/**
 * Generate random value for the SOAP _ID field
 *
 * @returns {string}
 */
function getRandomId() {
  return randomBytes(21).toString("hex");
}

/**
 * Sync read operation, since it only happens once.
 *
 * @returns {Buffer}
 */
function getCertificateChain() {
  if (isNil(certificateChain)) {
    certificateChain = readFileSync(
      pathJoin(dirnameForModule(import.meta), "assets/chain.pem"),
    );
  }

  return certificateChain;
}

/**
 * Sync read operation, since it only happens once.
 *
 * @returns {string}
 */
function getDigidPublicKey() {
  if (isNil(digidPublicKey)) {
    if (isStaging()) {
      digidPublicKey = readFileSync(
        pathJoin(dirnameForModule(import.meta), "assets/digid-dev.pub.pem"),
        "utf-8",
      );
    } else {
      digidPublicKey = readFileSync(
        pathJoin(dirnameForModule(import.meta), "assets/digid-prod.pub.pem"),
        "utf-8",
      );
    }
  }

  return digidPublicKey;
}
