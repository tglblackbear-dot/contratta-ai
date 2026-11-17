import integrity from "../../integrity.json";

export const AUTHORSHIP_PHRASE = integrity.phrase;
export const AUTHORSHIP_SHA256 = integrity.sha256;

export async function verifyAuthorship() {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(AUTHORSHIP_PHRASE));
  const actual = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return actual === AUTHORSHIP_SHA256;
}
