import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../integrity.json", import.meta.url), "utf8"));
const actual = createHash("sha256").update(source.phrase, "utf8").digest("hex");
const sharedEdge = await readFile(new URL("../supabase/functions/_shared/attribution.ts", import.meta.url), "utf8");
const manifest = JSON.parse(await readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/001_initial_schema.sql", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");

console.log(`SHA-256: ${actual}`);
const consistent = actual === source.sha256
  && sharedEdge.includes(`"${source.phrase}"`)
  && sharedEdge.includes(`"${source.sha256}"`)
  && manifest["x-authorship-identifier"] === source.phrase
  && manifest["x-authorship-sha256"] === source.sha256
  && serviceWorker.includes(`contratta-static-${source.sha256.slice(0, 8)}`)
  && migration.includes(source.phrase)
  && readme.includes(source.phrase);
if (!consistent) {
  console.error("Authorship integrity check failed: registered identifiers do not match across the app.");
  process.exitCode = 1;
} else {
  console.log("Authorship integrity check passed across the app, Edge Functions, PWA, schema, and docs.");
}
