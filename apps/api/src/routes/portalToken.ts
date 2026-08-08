import { Router } from "express";
import {
  SignJWT,
  calculateJwkThumbprint,
  exportJWK,
  generateKeyPair,
  importPKCS8,
  type JWK,
} from "jose";
import { env } from "../lib/env.js";
import { asyncHandler } from "../lib/guards.js";

/**
 * Identidad RS256 del backend frente a Portal.
 *
 * Portal verifica nuestros tokens por JWKS (clave publica servida en
 * /.well-known/jwks.json), no por secreto compartido. Por eso aqui vive un
 * par de claves RSA, no un HMAC:
 *  - Si JWT_PRIVATE_KEY_PEM esta configurada (produccion), se importa: asi
 *    el JWKS es estable entre despliegues y reinicios.
 *  - Si no (desarrollo), se genera un par efimero al primer uso. Valido solo
 *    para desarrollar: cambia en cada arranque del proceso, asi que el JWKS
 *    tambien cambia y cualquier token emitido antes del reinicio deja de
 *    verificar.
 *
 * PORTAL_PUBLISHABLE_KEY (la clave que usa el SDK del navegador para
 * conectar con Portal) es un asunto aparte de este modulo: aqui solo se
 * firma el JWT que Portal valida por JWKS. Si esa variable no esta puesta
 * (por ejemplo en desarrollo sin cuenta de Portal todavia), la emision de
 * tokens y el JWKS de esta ruta siguen funcionando exactamente igual.
 */

async function construirParClaves() {
  if (env.JWT_PRIVATE_KEY_PEM) {
    const privateKey = await importPKCS8(env.JWT_PRIVATE_KEY_PEM, "RS256");
    const jwkPrivado = await exportJWK(privateKey);

    // El JWK publico son los mismos parametros RSA sin la parte secreta
    // (d, p, q, dp, dq, qi). jose no expone "derivar la publica desde la
    // privada" como funcion aparte, asi que se arma a mano con lo que es
    // publico por definicion.
    const jwkPublico: JWK = { kty: jwkPrivado.kty, n: jwkPrivado.n, e: jwkPrivado.e };
    const kid = await calculateJwkThumbprint(jwkPublico);
    return { privateKey, jwkPublico, kid };
  }

  // Par RSA efimero SOLO para desarrollo: ver comentario de arriba.
  const { publicKey, privateKey } = await generateKeyPair("RS256", { extractable: true });
  const jwkPublico = await exportJWK(publicKey);
  const kid = await calculateJwkThumbprint(jwkPublico);
  return { privateKey, jwkPublico, kid };
}

type ParClaves = Awaited<ReturnType<typeof construirParClaves>>;

/** Se genera/importa una unica vez y se reusa: nunca dos pares en el mismo proceso. */
let parClavesPromise: Promise<ParClaves> | null = null;

function obtenerParClaves(): Promise<ParClaves> {
  if (!parClavesPromise) {
    parClavesPromise = construirParClaves();
  }
  return parClavesPromise;
}

export const rutasPortal = Router();

/**
 * JWKS publico que Portal consulta para verificar nuestros tokens.
 * Se monta en la raiz del servidor (fuera de /api): la ruta final debe
 * coincidir con JWT_ISSUER + "/.well-known/jwks.json", que es el valor que
 * se declara como jwksUrl en portal.config.ts.
 */
rutasPortal.get(
  "/.well-known/jwks.json",
  asyncHandler(async (_req, res) => {
    const { jwkPublico, kid } = await obtenerParClaves();
    res.json({ keys: [{ ...jwkPublico, kid, alg: "RS256", use: "sig" }] });
  }),
);

/**
 * Firma el JWT que un participante presenta a Portal para conectarse a SU
 * canal. El claim "canal" es lo que portal.config.ts revisa en authz para
 * que un token de una historia no sirva para colarse en otra.
 */
export async function emitirTokenPortal(
  userId: string,
  nombre: string,
  canalId: string,
): Promise<string> {
  const { privateKey, kid } = await obtenerParClaves();

  return new SignJWT({ name: nombre, canal: canalId })
    .setProtectedHeader({ alg: "RS256", kid })
    .setSubject(userId)
    .setIssuer(env.JWT_ISSUER)
    .setAudience("portal")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKey);
}
