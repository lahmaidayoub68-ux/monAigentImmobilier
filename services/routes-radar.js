// ════════════════════════════════════════════════════════════════════════════
//  DEAL RADAR — ROUTES EXPRESS (drop-in)
//  Remplace les 3 routes existantes + ajoute /profile/:username pour le modal.
//
//  USAGE (dans server.js) :
//    import { mountDealRadarRoutes } from "./deal-radar-routes.js";
//    mountDealRadarRoutes(app, {
//      authenticateToken,
//      db,
//      SELLERS, BUYERS,
//      computeRadarEntry,
//      cap,
//    });
//
//  Aucune dépendance ajoutée. Mêmes contrats de réponse que l'existant ;
//  on enrichit simplement les payloads pour que le front puisse rendre
//  un modal "profil" sans appel supplémentaire (mais l'endpoint est là).
// ════════════════════════════════════════════════════════════════════════════

import {
  getDepartement,
  matchSellerToBuyers,
  getStatsMatches,
} from "./matchingEngine.js";

export function mountDealRadarRoutes(app, deps) {
  const {
    authenticateToken,
    db,
    SELLERS,
    BUYERS,
    computeRadarEntry,
    cap = (s) =>
      s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : "",
  } = deps;

  // ── helpers ───────────────────────────────────────────────────────────────
  const lower = (s) => (s || "").trim().toLowerCase();

  function findProfile(username) {
    const u = lower(username);
    return (
      SELLERS.find((s) => lower(s.username) === u) ||
      BUYERS.find((b) => lower(b.username) === u) ||
      null
    );
  }

  function roleOf(p) {
    if (!p) return null;
    return SELLERS.some((s) => s.username === p.username) ? "seller" : "buyer";
  }

  // ── GET /api/deal-radar ───────────────────────────────────────────────────
  app.get("/api/deal-radar", authenticateToken, async (req, res) => {
    try {
      const username = req.user.username;
      const role = req.user.role;
      const threshold = Math.min(
        95,
        Math.max(40, parseInt(req.query.threshold || "65", 10)),
      );
      const limit = Math.min(
        20,
        Math.max(1, parseInt(req.query.limit || "12", 10)),
      );

      const userRow = await db
        .prepare(
          `SELECT ville, type, budgetmax, budgetmin, surfacemin, surfacemax,
                  piecesmin, piecesmax, tolerancekm, price, pieces, surface,
                  niveauenergetique, etatbien
             FROM users
            WHERE LOWER(TRIM(username)) = $1`,
        )
        .get(lower(username));

      if (!userRow) {
        return res.json({
          mode: role,
          threshold,
          alerts: [],
          myBien: null,
          criteria: {},
          summary: { totalOpportunities: 0, avgUrgency: 0 },
        });
      }
      const criteria = {
        ville: userRow.ville || null,
        type: userRow.type || null,
        price: role === "seller" ? userRow.price || null : null, // ← AJOUT explicit
        budgetMax:
          role === "buyer" ? userRow.budgetmax || null : userRow.price || null,
        budgetMin: role === "buyer" ? userRow.budgetmin || null : null,
        surfaceMin:
          role === "buyer"
            ? userRow.surfacemin || null
            : userRow.surface || null,
        surfaceMax: role === "buyer" ? userRow.surfacemax || null : null,
        piecesMin:
          role === "buyer" ? userRow.piecesmin || null : userRow.pieces || null,
        piecesMax: role === "buyer" ? userRow.piecesmax || null : null,
        toleranceKm: role === "buyer" ? userRow.tolerancekm || null : null,
        niveauEnergetique: userRow.niveauenergetique || null,
        etatBien: userRow.etatbien || null,
      };

      // ── MODE ACHETEUR ─────────────────────────────────────────
      if (role === "buyer") {
        const buyerProfile = BUYERS.find((b) => b.username === username);
        if (!buyerProfile) {
          return res.json({
            mode: "buyer",
            threshold,
            alerts: [],
            criteria,
            summary: { totalOpportunities: 0, avgUrgency: 0 },
          });
        }

        const recentSellers = [...SELLERS]
          .sort((a, b) => (b.id || 0) - (a.id || 0))
          .slice(0, 50);

        const alerts = [];
        for (const seller of recentSellers) {
          const entry = computeRadarEntry(seller, [buyerProfile], threshold);
          if (entry.qualifiedBuyers > 0) {
            alerts.push({
              ...entry,
              // ENRICHI : tout ce qu'il faut pour le modal côté client
              username: seller.username,
              surface: seller.surface,
              pieces: seller.pieces,
              price: seller.price,
              niveauEnergetique: seller.niveauEnergetique || null,
              etatBien: seller.etatBien || null,
              proximite: seller.proximite || null,
              region: seller.region || null,
              contact: seller.contact || null,
              imagesbien: seller.imagesbien || [],
            });
          }
        }

        alerts.sort((a, b) => b.urgencyScore - a.urgencyScore);

        return res.json({
          mode: "buyer",
          threshold,
          alerts: alerts.slice(0, limit),
          criteria,
          summary: {
            totalOpportunities: alerts.length,
            avgUrgency: alerts.length
              ? Math.round(
                  alerts.reduce((s, a) => s + a.urgencyScore, 0) /
                    alerts.length,
                )
              : 0,
          },
        });
      }

      // ── MODE VENDEUR ──────────────────────────────────────────
      const sellerProfile = SELLERS.find((s) => s.username === username);
      if (!sellerProfile) {
        return res.json({
          mode: "seller",
          threshold,
          myBien: null,
          criteria,
          summary: { totalOpportunities: 0, avgUrgency: 0 },
        });
      }

      const myEntry = computeRadarEntry(sellerProfile, BUYERS, threshold);

      const topBuyers = (myEntry.topBuyers || []).map((b) => {
        // hydrate depuis BUYERS pour avoir les vrais champs
        const full = BUYERS.find((x) => x.username === b.username) || {};
        return {
          username: b.username,
          ville: b.ville,
          compatibility: b.compatibility,
          budgetMax: b.budgetMax,
          budgetMin: full.budgetMin || null,
          surfaceMin: b.surfaceMin,
          surfaceMax: full.surfaceMax || null,
          piecesMin: b.piecesMin,
          piecesMax: full.piecesMax || null,
          type: b.type,
          toleranceKm: b.toleranceKm,
          region: full.region || null,
          etatBien: full.etatBien || null,
          niveauEnergetique: full.niveauEnergetique || null,
        };
      });

      return res.json({
        mode: "seller",
        threshold,
        myBien: {
          ...myEntry,
          topBuyers,
          surface: sellerProfile.surface,
          pieces: sellerProfile.pieces,
          price: sellerProfile.price,
          type: sellerProfile.type,
          niveauEnergetique: sellerProfile.niveauEnergetique,
          etatBien: sellerProfile.etatBien,
        },
        criteria,
        summary: {
          totalOpportunities: myEntry.qualifiedBuyers,
          avgUrgency: myEntry.urgencyScore,
          estimatedWindowHours: myEntry.estimatedWindowHours,
        },
      });
    } catch (err) {
      console.error("[/api/deal-radar] ERREUR:", err);
      res.status(500).json({ error: "Erreur calcul radar" });
    }
  });

  // ── GET /api/deal-radar/profile/:username  (NOUVEAU) ──────────────────────
  // Renvoie le profil complet d'un seller ou buyer pour alimenter le modal
  // « Voir profil ». Pas de PII supplémentaire : on lit BUYERS/SELLERS + users.
  app.get(
    "/api/deal-radar/profile/:username",
    authenticateToken,
    async (req, res) => {
      try {
        const target = req.params.username;
        const profile = findProfile(target);
        if (!profile)
          return res.status(404).json({ error: "Profil introuvable" });

        const role = roleOf(profile);

        // Données DB complémentaires (description, dates, etc.)
        let dbRow = null;
        try {
          dbRow = await db
            .prepare(
              `SELECT username, role, ville, region, type, price, surface, pieces,
                    budgetmin, budgetmax, surfacemin, surfacemax,
                    piecesmin, piecesmax, tolerancekm,
                    niveauenergetique, etatbien, imagesbien, created_at
               FROM users
              WHERE LOWER(TRIM(username)) = $1`,
            )
            .get(lower(target));
        } catch (_) {
          /* table peut différer */
        }

        // Compatibilité vis-à-vis du user connecté
        let compatibility = null;
        try {
          const me = req.user;
          if (role === "seller" && me.role === "buyer") {
            const myBuyer = BUYERS.find((b) => b.username === me.username);
            if (myBuyer) {
              const e = computeRadarEntry(profile, [myBuyer], 0);
              compatibility = e.avgCompatibility;
            }
          } else if (role === "buyer" && me.role === "seller") {
            const mySeller = SELLERS.find((s) => s.username === me.username);
            if (mySeller) {
              const e = computeRadarEntry(mySeller, [profile], 0);
              compatibility = e.avgCompatibility;
            }
          }
        } catch (_) {}

        res.json({
          username: profile.username,
          role,
          compatibility,
          ville: profile.ville || dbRow?.ville || null,
          region: profile.region || dbRow?.region || null,
          type: profile.type || dbRow?.type || null,
          price: profile.price ?? dbRow?.price ?? null,
          surface: profile.surface ?? dbRow?.surface ?? null,
          pieces: profile.pieces ?? dbRow?.pieces ?? null,
          budgetMin: profile.budgetMin ?? dbRow?.budgetmin ?? null,
          budgetMax: profile.budgetMax ?? dbRow?.budgetmax ?? null,
          surfaceMin: profile.surfaceMin ?? dbRow?.surfacemin ?? null,
          surfaceMax: profile.surfaceMax ?? dbRow?.surfacemax ?? null,
          piecesMin: profile.piecesMin ?? dbRow?.piecesmin ?? null,
          piecesMax: profile.piecesMax ?? dbRow?.piecesmax ?? null,
          toleranceKm: profile.toleranceKm ?? dbRow?.tolerancekm ?? null,
          niveauEnergetique:
            profile.niveauEnergetique ?? dbRow?.niveauenergetique ?? null,
          etatBien: profile.etatBien ?? dbRow?.etatbien ?? null,
          images: (() => {
            try {
              const raw = profile.imagesbien ?? dbRow?.imagesbien;
              if (!raw) return [];
              if (Array.isArray(raw)) return raw;
              return JSON.parse(raw);
            } catch {
              return [];
            }
          })(),
          createdAt: dbRow?.created_at || null,
        });
      } catch (err) {
        console.error("[/api/deal-radar/profile/:username]", err);
        res.status(500).json({ error: "Erreur récupération profil" });
      }
    },
  );

  // ── POST /api/deal-radar/subscribe ────────────────────────────────────────
  // ── DEAL RADAR : Subscribe / Unsubscribe ──────────────────────────────────
  app.post("/api/deal-radar/subscribe", authenticateToken, async (req, res) => {
    try {
      const { threshold = 70, active = true } = req.body;
      const username = req.user.username;
      const role = req.user.role;

      if (!global._silentMatchingRegistry) global._silentMatchingRegistry = {};

      if (!active) {
        delete global._silentMatchingRegistry[username];
        return res.json({ success: true, active: false });
      }

      global._silentMatchingRegistry[username] = {
        threshold: Math.max(40, Math.min(95, Number(threshold))),
        subscribedAt: new Date().toISOString(),
        role,
        lastNotified: null,
        lastMatchCount: 0,
      };

      res.json({ success: true, active: true, threshold });
    } catch (err) {
      console.error("[deal-radar/subscribe]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ── SCAN PÉRIODIQUE RADAR (toutes les 5 min) ─────────────────────────────
  async function runSilentRadarScan() {
    if (!global._silentMatchingRegistry) return;
    const entries = Object.entries(global._silentMatchingRegistry);
    if (!entries.length) return;

    console.log(`[RADAR SCAN] ${entries.length} utilisateur(s) surveillé(s)`);

    for (const [username, config] of entries) {
      try {
        const threshold = config.threshold || 70;

        // Récupérer l'user en DB
        const userRow = await db
          .prepare(
            `SELECT id, role FROM users WHERE LOWER(TRIM(username)) = $1`,
          )
          .get(username.trim().toLowerCase());
        if (!userRow) continue;

        // Calculer les matches selon le rôle
        const buyerProfile = BUYERS.find((b) => b.username === username);
        const sellerProfile = SELLERS.find((s) => s.username === username);

        let qualifiedMatches = [];

        if (buyerProfile && config.role === "buyer") {
          const allMatches = getStatsMatches(buyerProfile, 50);
          qualifiedMatches = allMatches.filter(
            (m) => (m.compatibility || 0) >= threshold,
          );
        } else if (sellerProfile && config.role === "seller") {
          const allMatches = matchSellerToBuyers(sellerProfile, 50);
          qualifiedMatches = allMatches.filter(
            (m) => (m.compatibility || 0) >= threshold,
          );
        }

        const currentCount = qualifiedMatches.length;
        const previousCount = config.lastMatchCount || 0;
        const newMatches = currentCount - previousCount;

        // Notifier seulement si nouveaux matches OU si premier scan avec matches
        const shouldNotify =
          (newMatches > 0 || (previousCount === 0 && currentCount > 0)) &&
          currentCount > 0;

        // Throttle : max 1 notif par heure par user
        const lastNotified = config.lastNotified
          ? new Date(config.lastNotified)
          : null;
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (lastNotified && lastNotified > hourAgo) continue;

        if (shouldNotify) {
          const topMatch = qualifiedMatches[0];
          const body =
            newMatches > 0
              ? `${newMatches} nouveau${newMatches > 1 ? "x" : ""} profil${newMatches > 1 ? "s" : ""} ≥ ${threshold}% · ${topMatch?.ville || "—"} ${topMatch?.compatibility || 0}%`
              : `${currentCount} profil${currentCount > 1 ? "s" : ""} ≥ ${threshold}% · ${topMatch?.ville || "—"} ${topMatch?.compatibility || 0}%`;

          // Créer notification DB
          await db
            .prepare(
              `
          INSERT INTO notifications (user_id, type, title, body, data, read)
          VALUES ($1, $2, $3, $4, $5, false)
        `,
            )
            .run(
              userRow.id,
              "radar",
              `🎯 Deal Radar — ${newMatches > 0 ? "Nouveau match" : "Opportunité active"}`,
              body,
              JSON.stringify({
                type: "radar",
                threshold,
                matchCount: currentCount,
                newMatches,
                topMatch: topMatch
                  ? {
                      ville: topMatch.ville,
                      compatibility: topMatch.compatibility,
                      type: topMatch.type,
                      price: topMatch.price || topMatch.budgetMax,
                    }
                  : null,
              }),
            );

          // Notifier aussi sur les intégrations connectées
          if (global._notifyUserOnIntegrations) {
            await global._notifyUserOnIntegrations(
              userRow.id,
              username,
              "radar",
              {
                qualifiedBuyers: currentCount,
                urgencyScore: Math.min(
                  100,
                  currentCount * 10 + (topMatch?.compatibility || 0) / 2,
                ),
                estimatedWindowHours: Math.max(12, 72 - currentCount * 8),
                ville: topMatch?.ville,
                compatibility: topMatch?.compatibility,
              },
            );
          }

          // Mettre à jour le registre
          global._silentMatchingRegistry[username] = {
            ...config,
            lastNotified: new Date().toISOString(),
            lastMatchCount: currentCount,
          };

          console.log(
            `[RADAR SCAN] Notif envoyée → ${username} : ${currentCount} match(es)`,
          );
        } else {
          // Mettre à jour le count sans notifier
          global._silentMatchingRegistry[username] = {
            ...config,
            lastMatchCount: currentCount,
          };
        }
      } catch (err) {
        console.warn(`[RADAR SCAN] Erreur pour ${username}:`, err.message);
      }
    }
  }

  // Lancer le scan toutes les 5 minutes
  setInterval(runSilentRadarScan, 5 * 60 * 1000);
  // Premier scan 30s après démarrage
  setTimeout(runSilentRadarScan, 30 * 1000);

  // ── GET /api/deal-radar/notifications ─────────────────────────────────────
  app.get(
    "/api/deal-radar/notifications",
    authenticateToken,
    async (req, res) => {
      try {
        const username = req.user.username;
        const registry = global._silentMatchingRegistry || {};

        if (!registry[username]) {
          return res.json({ subscribed: false, notifications: [] });
        }

        const sub = registry[username];
        const threshold = sub.threshold;
        const notifications = [];

        if (sub.role === "buyer") {
          const buyerProfile = BUYERS.find((b) => b.username === username);
          if (buyerProfile) {
            const newSellers = SELLERS.filter(
              (s) => s.id > (sub.lastCheckId || 0),
            ).slice(-15);

            for (const seller of newSellers) {
              const entry = computeRadarEntry(
                seller,
                [buyerProfile],
                threshold,
              );
              if (entry.qualifiedBuyers > 0) {
                notifications.push({
                  type: "new_match",
                  seller: {
                    username: seller.username,
                    ville: seller.ville,
                    type: seller.type,
                    price: seller.price,
                    surface: seller.surface,
                    niveauEnergetique: seller.niveauEnergetique,
                  },
                  compatibility: entry.avgCompatibility,
                  urgencyScore: entry.urgencyScore,
                  estimatedWindowHours: entry.estimatedWindowHours,
                });
              }
            }

            if (SELLERS.length > 0) {
              sub.lastCheckId = Math.max(...SELLERS.map((s) => s.id || 0));
            }
          }
        }

        if (notifications.length > 0) {
          sub.lastNotified = new Date().toISOString();
          try {
            const userRow = await db
              .prepare(`SELECT id FROM users WHERE LOWER(TRIM(username)) = $1`)
              .get(lower(username));
            if (userRow) {
              for (const n of notifications) {
                await db
                  .prepare(
                    `INSERT INTO notifications (user_id, type, title, body, data, read)
                 VALUES ($1, $2, $3, $4, $5, false)`,
                  )
                  .run(
                    userRow.id,
                    "radar",
                    `Profil détecté — ${n.compatibility}%`,
                    `${n.seller?.type ? cap(n.seller.type) : "Bien"} à ${n.seller?.ville || "—"} · ${
                      n.seller?.price
                        ? Number(n.seller.price).toLocaleString("fr-FR") + " €"
                        : ""
                    }`,
                    JSON.stringify(n),
                  );
              }
            }
          } catch (e) {
            console.warn("[NOTIF radar poll DB]", e.message);
          }
        }

        res.json({ subscribed: true, threshold, notifications });
      } catch (err) {
        console.error("[/api/deal-radar/notifications]", err);
        res.status(500).json({ error: "Erreur notifications" });
      }
    },
  );
  // ── GET full profile for criteria modal ──
  app.get("/api/me/full-profile", authenticateToken, async (req, res) => {
    try {
      const user = await db
        .prepare(
          `
      SELECT username, role, ville, region, type, price,
             budget, budgetmin, budgetmax,
             pieces, piecesmin, piecesmax,
             surface, surfacemin, surfacemax,
             tolerancekm, etatbien, niveauenergetique, proximite
      FROM users WHERE LOWER(TRIM(username)) = $1
    `,
        )
        .get(req.user.username.trim().toLowerCase());

      if (!user) return res.status(404).json({ error: "Introuvable" });
      res.json(user);
    } catch (err) {
      console.error("[GET /api/me/full-profile]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ── POST /api/me/update-criteria ──
  app.post("/api/me/update-criteria", authenticateToken, async (req, res) => {
    try {
      const username = req.user.username;
      const role = req.user.role;
      const {
        ville,
        type,
        budgetMin,
        budgetMax,
        surfaceMin,
        surfaceMax,
        piecesMin,
        piecesMax,
        toleranceKm,
        niveauEnergetique, // ← nouveau champ vendeur
      } = req.body;

      const normalized = {
        ville: ville || "",
        type: type || "",
        budgetMin: Number(budgetMin) || 0,
        budgetMax: Number(budgetMax) || Number(budgetMin) || 0,
        surfaceMin: Number(surfaceMin) || 0,
        surfaceMax: Number(surfaceMax) || Number(surfaceMin) || 9999,
        piecesMin: Number(piecesMin) || 0,
        piecesMax: Number(piecesMax) || Number(piecesMin) || 999,
        toleranceKm: toleranceKm != null ? Number(toleranceKm) : null,
        niveauEnergetique: niveauEnergetique || null,
      };

      // getDepartement maintenant importé en tête de fichier
      const dept = getDepartement(normalized.ville) || "";

      // ── DB update ──────────────────────────────────────────────────────
      await db
        .prepare(
          `
        UPDATE users SET
          ville = $1, type = $2,
          budgetmin = $3, budgetmax = $4,
          surfacemin = $5, surfacemax = $6,
          piecesmin = $7, piecesmax = $8,
          tolerancekm = $9,
          niveauenergetique = $10,
          price  = $11,
          pieces = $12,
          surface = $13
        WHERE LOWER(TRIM(username)) = $14
      `,
        )
        .run(
          normalized.ville,
          normalized.type,
          normalized.budgetMin,
          normalized.budgetMax,
          normalized.surfaceMin,
          normalized.surfaceMax,
          normalized.piecesMin,
          normalized.piecesMax,
          normalized.toleranceKm,
          normalized.niveauEnergetique,
          role === "seller" ? normalized.budgetMin : 0,
          role === "seller" ? normalized.piecesMin : 0,
          role === "seller" ? normalized.surfaceMin : 0,
          username.trim().toLowerCase(),
        );

      // ── Sync in-memory pools ───────────────────────────────────────────
      if (role === "buyer") {
        const idx = BUYERS.findIndex((b) => b.username === username);
        const updated = {
          username,
          role: "buyer",
          ville: normalized.ville,
          type: normalized.type,
          budgetMin: normalized.budgetMin,
          budgetMax: normalized.budgetMax,
          surfaceMin: normalized.surfaceMin,
          surfaceMax: normalized.surfaceMax,
          piecesMin: normalized.piecesMin,
          piecesMax: normalized.piecesMax,
          toleranceKm: normalized.toleranceKm,
          contact: req.user.contact || "",
          departement: dept,
        };
        if (idx >= 0) BUYERS[idx] = { ...BUYERS[idx], ...updated };
        else BUYERS.push(updated);
      } else {
        const idx = SELLERS.findIndex((s) => s.username === username);
        const updated = {
          username,
          role: "seller",
          ville: normalized.ville,
          type: normalized.type,
          price: normalized.budgetMin,
          surface: normalized.surfaceMin,
          pieces: normalized.piecesMin,
          budgetMin: normalized.budgetMin,
          budgetMax: normalized.budgetMax,
          surfaceMin: normalized.surfaceMin,
          surfaceMax: normalized.surfaceMax,
          piecesMin: normalized.piecesMin,
          piecesMax: normalized.piecesMax,
          niveauEnergetique: normalized.niveauEnergetique,
          contact: req.user.contact || "",
          departement: dept,
        };
        if (idx >= 0) SELLERS[idx] = { ...SELLERS[idx], ...updated };
        else SELLERS.push(updated);
      }

      // Reset session criteria
      if (global.sessions?.[username]) {
        global.sessions[username].criteria = {
          ...global.sessions[username].criteria,
          ville: normalized.ville,
          type: normalized.type,
          budgetMin: normalized.budgetMin,
          budgetMax: normalized.budgetMax,
          surfaceMin: normalized.surfaceMin,
          surfaceMax: normalized.surfaceMax,
          piecesMin: normalized.piecesMin,
          piecesMax: normalized.piecesMax,
          toleranceKm: normalized.toleranceKm,
          niveauEnergetique: normalized.niveauEnergetique,
        };
      }

      res.json({ success: true });
    } catch (err) {
      console.error("[POST /api/me/update-criteria]", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });
}
