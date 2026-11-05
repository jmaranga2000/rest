import "./_env";
import { getDb } from "@/platform/db";
import { prepareDatabase } from "@/platform/bootstrap";

/** Creates indexes, seeds the default plans and re-syncs built-in roles for every organisation. Idempotent. */
async function main() {
  const db = await getDb();
  const { orgs, roleChanges } = await prepareDatabase(db);
  console.log(`Indexes ensured. Roles synced for 
    ${orgs} organisation(s)
    ${roleChanges ? `, 
    ${roleChanges} change(s)` : ""}.`
  );
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
