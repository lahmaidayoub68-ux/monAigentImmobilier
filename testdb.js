// test-db.js
import pkg from "pg";
const { Client } = pkg;

// Remplace par ton URL PostgreSQL Render
const client = new Client({
  connectionString:
    "postgresql://monaigentimmobilerdataprod_user:kBvGVC3LAB47BOLFmySA6WVS7B07T5Uk@dpg-d74l02vfte5s73f33qig-a.oregon-postgres.render.com/monaigentimmobilerdataprod",
  ssl: { rejectUnauthorized: false }, // nécessaire pour Render
});

async function testConnection() {
  try {
    await client.connect();
    console.log("Connexion PostgreSQL réussie !");
    await client.end();
  } catch (err) {
    console.error("Erreur de connexion :", err);
  }
}

testConnection();
