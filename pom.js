import { db } from "./db.js";
import { SELLERS } from "./services/matchingEngine.js";

// ================== REGEX CIBLES ==================
const FAKE_SELLER_REGEX = /^seller\d+$/i;

// ================== 1. CLEAN DB ==================
async function cleanFakeSellersDB() {
  console.log("🚀 CLEAN FAKE SELLERS START");

  const sellers = await db
    .prepare("SELECT username FROM users WHERE role = 'seller'")
    .all();

  let deleted = 0;

  for (const s of sellers) {
    const username = s.username;

    const isSeed = username.startsWith("seller_seed_");
    const isFake = FAKE_SELLER_REGEX.test(username);

    if (!isSeed && isFake) {
      await db.prepare("DELETE FROM users WHERE username = ?").run(username);

      console.log("🗑️ Deleted fake seller:", username);
      deleted++;
    }
  }

  console.log(`✅ CLEAN DONE → ${deleted} fake sellers supprimés`);
}

// ================== MEMORY ==================
function cleanFakeSellersMemory() {
  console.log("🧠 CLEAN MEMORY SELLERS");

  const before = SELLERS.length;

  const filtered = SELLERS.filter((s) => {
    const isSeed = s.username?.startsWith("seller_seed_");
    const isFake = FAKE_SELLER_REGEX.test(s.username || "");

    return isSeed || !isFake;
  });

  SELLERS.length = 0;
  SELLERS.push(...filtered);

  console.log(
    `🧹 Memory cleaned → ${before - filtered.length} fake sellers removed`,
  );
}

// ================== EXEC DIRECT ICI ==================
(async () => {
  console.log("🔥 SCRIPT CLEAN STARTED");

  await cleanFakeSellersDB();
  cleanFakeSellersMemory();

  console.log("🏁 SCRIPT FINISHED");
})();
