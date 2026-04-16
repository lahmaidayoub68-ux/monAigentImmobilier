import { db } from "./db.js";

async function debugUser(username) {
  try {
    const user = await db
      .prepare(`SELECT * FROM users WHERE username = ?`)
      .get(username);

    if (!user) {
      console.log("❌ Utilisateur introuvable :", username);
      return;
    }

    console.log("🧨 PROFIL COMPLET :", username);
    console.log(user);

    console.log("📌 DÉTAIL PAR CHAMP :");
    for (const key in user) {
      console.log(`${key} =>`, user[key]);
    }

    console.log("📞 CONTACT CHECK :", user.contact);
  } catch (err) {
    console.error("❌ Erreur debug user :", err);
  }
}

// 👉 ton utilisateur
debugUser("labelsvend");
