#!/usr/bin/env node
/**
 * Every endpoint the mobile app calls must exist, answer the verb it sends,
 * and be reachable with a Bearer token.
 *
 * Two failure modes have reached production, both silent on a phone:
 *
 *   1. The client sends a verb the route does not export. Next answers 405
 *      and the client shows a generic error, so it looks like nothing
 *      happened at all. Editing a lead was broken this way — the app sent
 *      PATCH to a route exporting only GET, PUT and DELETE.
 *
 *   2. The route authenticates from cookies only. The phone has no cookie
 *      jar and sends `Authorization: Bearer`, so it gets 401 no matter who
 *      is signed in.
 *
 * Neither is a type error: the path is a string, so nothing connects the call
 * site to the route file. This does.
 *
 * Limits worth knowing. It only sees calls written literally as
 * api.get('/api/…'); a path assembled at runtime is invisible to it. And it
 * proves reachability, not correctness — a route can answer perfectly and
 * still do the wrong thing.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const NATIVE = path.join(ROOT, "apps", "native");
const API = path.join(ROOT, "apps", "web", "app", "api");

const VERBS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

/** Every source file under a directory, skipping installed and build output. */
function sourceFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** api.patch<T>('/api/leads/${id}') -> { verb: PATCH, path: /api/leads/* } */
function collectCalls() {
  const calls = new Map();
  const rx = /api\.(get|post|patch|put|delete)\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)/g;
  for (const file of sourceFiles(NATIVE)) {
    const src = fs.readFileSync(file, "utf8");
    for (const [, verb, raw] of src.matchAll(rx)) {
      const clean = raw.split("?")[0].replace(/\$\{[^}]*\}/g, "*").trim();
      if (!clean.startsWith("/api")) continue;
      if (!calls.has(clean)) calls.set(clean, { verbs: new Set(), files: new Set() });
      calls.get(clean).verbs.add(verb.toUpperCase());
      calls.get(clean).files.add(path.relative(ROOT, file).replaceAll("\\", "/"));
    }
  }
  return calls;
}

/** Walk app/api segment by segment; a wildcard segment takes the [param] dir. */
function resolveRoute(urlPath) {
  const segs = urlPath.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  let dir = API;
  for (const seg of segs) {
    const literal = path.join(dir, seg);
    if (fs.existsSync(literal) && fs.statSync(literal).isDirectory()) {
      dir = literal;
      continue;
    }
    const dynamic = fs
      .readdirSync(dir, { withFileTypes: true })
      .find((e) => e.isDirectory() && e.name.startsWith("["));
    if (!dynamic) return null;
    dir = path.join(dir, dynamic.name);
  }
  const file = path.join(dir, "route.ts");
  return fs.existsSync(file) ? file : null;
}

function exportedVerbs(src) {
  const found = new Set();
  for (const [, v] of src.matchAll(
    /export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g,
  )) found.add(v);
  // `export const PATCH = PUT` is a legitimate alias, not a missing handler.
  for (const [, v] of src.matchAll(
    /export\s+const\s+(GET|POST|PATCH|PUT|DELETE)\s*=/g,
  )) found.add(v);
  return found;
}

const calls = collectCalls();
const problems = [];

for (const [urlPath, { verbs, files }] of [...calls].sort()) {
  const routeFile = resolveRoute(urlPath);
  const where = [...files].sort()[0];

  if (!routeFile) {
    problems.push(
      `${urlPath}\n    calls ${[...verbs].sort().join(", ")} from ${where}\n` +
        `    no route file found under apps/web/app/api`,
    );
    continue;
  }

  const src = fs.readFileSync(routeFile, "utf8");
  const rel = path.relative(ROOT, routeFile).replaceAll("\\", "/");
  const missing = [...verbs].filter((v) => !exportedVerbs(src).has(v)).sort();

  if (missing.length) {
    problems.push(
      `${urlPath}\n    app sends ${missing.join(", ")} — ${rel} does not export it\n` +
        `    called from ${where}\n` +
        `    Next answers 405. Export the verb (an alias such as ` +
        `\`export const PATCH = PUT\` is fine when the handler already does a partial update).`,
    );
  }

  // The phone sends a Bearer token and has no cookies. getUserFromRequest
  // handles both; createSupabaseRouteClient alone reads cookies only.
  if (src.includes("createSupabaseRouteClient") && !src.includes("getUserFromRequest")) {
    problems.push(
      `${urlPath}\n    ${rel} authenticates from cookies only\n` +
        `    called from ${where}\n` +
        `    The app sends Authorization: Bearer, so this returns 401. ` +
        `Use getUserFromRequest(request).`,
    );
  }
}

const label = `${calls.size} mobile endpoint(s) checked`;
if (problems.length) {
  console.error(`\n✗ ${label} — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log(`✓ ${label}: every verb is exported and reachable with a Bearer token.`);
