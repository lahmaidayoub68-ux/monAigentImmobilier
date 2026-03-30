import { db } from "./db.js";

async function main() {
  try {
    await db
      .prepare(
        `
      ALTER TABLE users
      ADD CONSTRAINT users_username_unique UNIQUE (username);
    `,
      )
      .run();

    console.log("Contrainte UNIQUE ajoutée ✅");
  } catch (err) {
    console.error("Erreur :", err);
  }
}

main();
