import { db } from "./db.js";

async function deleteSeededProfiles() {
  try {
    console.log("🧹 Suppression des profils seedés...");

    // Supprime tous les sellers
    const deleteSellers = await db
      .prepare(`DELETE FROM users WHERE username LIKE 'seller%'`)
      .run();

    // Supprime tous les buyers
    const deleteBuyers = await db
      .prepare(`DELETE FROM users WHERE username LIKE 'buyer%'`)
      .run();

    console.log("✅ Sellers supprimés :", deleteSellers.changes);
    console.log("✅ Buyers supprimés :", deleteBuyers.changes);

    console.log("🎉 Nettoyage terminé !");
  } catch (err) {
    console.error("❌ Erreur suppression :", err);
  }
}

deleteSeededProfiles();
