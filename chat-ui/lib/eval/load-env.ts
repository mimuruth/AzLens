import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

// Load chat-ui/.env.local into process.env for the eval run (Vitest doesn't do
// this the way Next.js does). Existing env vars win; malformed lines are ignored.
const file = path.resolve(process.cwd(), ".env.local");
if (existsSync(file)) {
  for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    } else if (val.startsWith("#")) {
      val = "";
    } else {
      const hash = val.search(/\s#/); // strip inline "  # comment"
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    if (key && val && process.env[key] === undefined) process.env[key] = val;
  }
}
