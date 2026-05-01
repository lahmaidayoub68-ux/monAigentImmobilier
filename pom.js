import { db } from "./db.js";
import fs from "fs";
import { URL } from "url";

const TABLES_TO_SYNC = ["users", "properties", "searches"];

export const backupManager = {
  async diagnostic() {
    console.log("\n🔍 --- DIAGNOSTIC DE CONNEXION ---");

    // 1. Vérification de l'URL
    const urlStr = process.env.DATABASE_URL;
    if (!urlStr) {
      console.error("❌ Erreur: DATABASE_URL est indéfinie dans le .env");
      return false;
    }

    try {
      const myUrl = new URL(urlStr);
      console.log(`📡 Tentative de connexion vers : ${myUrl.hostname}`);
      console.log(`👤 Utilisateur : ${myUrl.username}`);
      console.log(` database : ${myUrl.pathname.replace("/", "")}`);

      if (myUrl.hostname.includes("render.com") && !urlStr.includes("dpg-")) {
        console.warn(
          "⚠️ Attention : L'URL ne semble pas être l'URL 'External' de Render.",
        );
      }
    } catch (e) {
      console.error("❌ Erreur: Le format de DATABASE_URL est invalide.");
      return false;
    }

    // 2. Test de connectivité simple (SELECT NOW)
    try {
      // Par :
      const time = await db.prepare("SELECT NOW() as now").get();
      console.log(
        "✅ Connexion établie avec succès. Heure serveur :",
        time.now,
      );
    } catch (err) {
      console.error("❌ ÉCHEC DE CONNEXION CRITIQUE :");
      console.error(`   👉 Code erreur : ${err.code}`);
      console.error(`   👉 Message : ${err.message}`);

      if (
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("terminated unexpectedly")
      ) {
        console.error(
          "\n💡 CAUSE PROBABLE : Votre IP n'est pas autorisée sur Render !",
        );
        console.error(
          "   Allez dans Dashboard > PostgreSQL > Networking > Access Control et ajoutez votre IP.",
        );
      }
      return false;
    }
    return true;
  },

  async exportData() {
    const isOk = await this.diagnostic();
    if (!isOk) return;

    console.log("\n🚀 --- DÉBUT DE L'EXPORTATION ---");
    const backup = {};

    for (const table of TABLES_TO_SYNC) {
      try {
        console.log(`⏳ Lecture de la table [${table}]...`);
        const rows = await db.prepare(`SELECT * FROM ${table}`).all();

        backup[table] = rows;
        console.log(`   ✅ ${rows.length} lignes récupérées.`);
      } catch (err) {
        console.error(`   ❌ Erreur sur la table [${table}] :`);
        console.error(`      ${err.message}`);

        if (err.message.includes("does not exist")) {
          console.error(
            `      💡 Conseil : Vérifiez que le nom de la table est bien en minuscules.`,
          );
        }
      }
    }

    const fileName = "backup_aigent.json";
    const dataCount = Object.values(backup).flat().length;

    if (dataCount > 0) {
      fs.writeFileSync(fileName, JSON.stringify(backup, null, 2));
      console.log(`\n💾 --- SUCCÈS ---`);
      console.log(`Fichier créé : ${fileName}`);
      console.log(`Total lignes sauvegardées : ${dataCount}`);
    } else {
      console.error(
        "\n⚠️ Exportation terminée mais AUCUNE donnée n'a été récupérée.",
      );
    }
  },

  async importData() {
    console.log("\n📥 --- DÉBUT DE L'IMPORTATION ---");
    if (!fs.existsSync("backup_aigent.json")) {
      console.error("❌ Erreur : Fichier backup_aigent.json introuvable.");
      return;
    }

    const backup = JSON.parse(fs.readFileSync("backup_aigent.json", "utf8"));

    for (const table in backup) {
      const rows = backup[table];
      console.log(`⏳ Restauration de [${table}] : ${rows.length} lignes...`);

      let successCount = 0;
      for (const row of rows) {
        try {
          await db.prepare("").upsert(table, row, "id");
          successCount++;
        } catch (err) {
          console.error(
            `   ❌ Erreur d'insertion ligne ID ${row.id}: ${err.message}`,
          );
        }
      }
      console.log(`   ✅ ${successCount}/${rows.length} lignes traitées.`);
    }
    console.log("\n✨ Importation terminée.");
  },
};
// Remplace les dernières lignes par ça :
const mode = process.argv[2];

async function main() {
  if (mode === "export") await backupManager.exportData();
  else if (mode === "import") await backupManager.importData();
  else console.log("Utilisation: node backup-tool.js [export|import]");

  process.exit(0); // ← force la fermeture propre après la fin
}

main().catch((err) => {
  console.error("Erreur fatale:", err);
  process.exit(1);
});
