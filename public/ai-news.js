/**
 * ai-news.js — AiGENT Immobilier
 * Pipeline IA : NewsData.io → Cerebras (serveur) → Articles
 * Fix : génération séquentielle, parsing robuste, style violet/rose/noir
 */
const AiNews = (() => {
  /* ─── CONFIG ─── */
  const CONFIG = {
    newsDataKey: "",
    cacheKey: "aigent_articles_v5",
    cacheTTL: 3 * 60 * 60 * 1000,
    maxArticles: 9,
    lang: "fr",
    country: "fr",
    keywords: "immobilier OR taux OR logement OR marché immobilier OR DPE",
  };

  /* ─── CATÉGORIES ─── */
  const CATEGORIES = {
    marche: {
      label: "Marché",
      icon: "◈",
      color: "#7c3aed",
      bg: "rgba(124,58,237,.12)",
    },
    investissement: {
      label: "Investissement",
      icon: "◆",
      color: "#be185d",
      bg: "rgba(190,24,93,.10)",
    },
    guide: {
      label: "Guide",
      icon: "◉",
      color: "#5b21b6",
      bg: "rgba(91,33,182,.10)",
    },
    "ia-tech": {
      label: "IA & Tech",
      icon: "⬡",
      color: "#9333ea",
      bg: "rgba(147,51,234,.10)",
    },
    dpe: {
      label: "DPE",
      icon: "◎",
      color: "#4f46e5",
      bg: "rgba(79,70,229,.10)",
    },
    actualite: {
      label: "Actualité",
      icon: "◷",
      color: "#db2777",
      bg: "rgba(219,39,119,.10)",
    },
    tendance: {
      label: "Tendance",
      icon: "◬",
      color: "#7e22ce",
      bg: "rgba(126,34,206,.10)",
    },
    juridique: {
      label: "Juridique",
      icon: "◈",
      color: "#6d28d9",
      bg: "rgba(109,40,217,.10)",
    },
  };

  /* ─── STATE ─── */
  let state = {
    articles: [],
    loading: false,
    currentFilter: "all",
    page: 1,
    perPage: 9,
    container: null,
    onArticleClick: null,
    generationLog: [],
  };

  /* ─── UTILS ─── */
  const slugify = (str = "") =>
    str
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80);

  const formatDate = (iso) =>
    new Date(iso || Date.now()).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

  /* ─── CACHE ─── */
  const getCached = () => {
    try {
      const raw = sessionStorage.getItem(CONFIG.cacheKey);
      if (!raw) return null;
      const { ts, data } = JSON.parse(raw);
      if (Date.now() - ts > CONFIG.cacheTTL) return null;
      return data;
    } catch {
      return null;
    }
  };
  const setCache = (data) => {
    try {
      sessionStorage.setItem(
        CONFIG.cacheKey,
        JSON.stringify({ ts: Date.now(), data }),
      );
    } catch {}
  };

  /* ─── IMAGES FALLBACK ─── */
  const FALLBACK_IMAGES = {
    marche:
      "https://images.unsplash.com/photo-1560472355-536de3962603?auto=format&fit=crop&w=900&q=80",
    investissement:
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?auto=format&fit=crop&w=900&q=80",
    guide:
      "https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=900&q=80",
    "ia-tech":
      "https://images.unsplash.com/photo-1677442135703-1787eea5ce01?auto=format&fit=crop&w=900&q=80",
    dpe: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
    actualite:
      "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80",
    tendance:
      "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=80",
    juridique:
      "https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?auto=format&fit=crop&w=900&q=80",
    default:
      "https://images.unsplash.com/photo-1570129477492-45c003edd2be?auto=format&fit=crop&w=900&q=80",
  };
  const getFallback = (cat) => FALLBACK_IMAGES[cat] || FALLBACK_IMAGES.default;

  /* ─── CHARGEMENT CONFIG SERVEUR ─── */
  async function loadConfigFromServer() {
    try {
      const res = await fetch("/api/config");
      if (!res.ok) return;
      const cfg = await res.json();
      if (cfg.newsDataKey) CONFIG.newsDataKey = cfg.newsDataKey;
    } catch {}
  }

  /* ═══════════════════════════════════════════
     ÉTAPE 1 : FETCH NEWSDATA.IO
  ═══════════════════════════════════════════ */
  async function fetchNews() {
    if (!CONFIG.newsDataKey) {
      console.warn("[AiNews] Pas de newsDataKey → mode démo");
      return null;
    }
    const url = new URL("https://newsdata.io/api/1/news");
    url.searchParams.set("apikey", CONFIG.newsDataKey);
    url.searchParams.set("q", CONFIG.keywords);
    url.searchParams.set("language", CONFIG.lang);
    url.searchParams.set("country", CONFIG.country);
    url.searchParams.set("category", "business,top");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsData ${res.status}`);
    const json = await res.json();
    console.log("[AiNews] NewsData:", json.totalResults, "articles bruts");
    return (json.results || []).filter((a) => a.title && a.description);
  }

  /* ═══════════════════════════════════════════
     ÉTAPE 2 : SÉLECTION
  ═══════════════════════════════════════════ */
  async function selectArticles(items) {
    try {
      const res = await fetch("/api/select-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) return items.slice(0, 6);
      const { selected } = await res.json();
      if (Array.isArray(selected))
        return selected.map((i) => items[i]).filter(Boolean);
    } catch (e) {
      console.warn("[AiNews] select-articles fail:", e.message);
    }
    return items.slice(0, 6);
  }

  /* ═══════════════════════════════════════════
     ÉTAPE 3 : GÉNÉRATION SÉQUENTIELLE
     Fix principal : on génère 1 par 1 avec délai
     pour éviter le rate-limit Cerebras
  ═══════════════════════════════════════════ */
  async function generateArticle(newsItem) {
    try {
      const res = await fetch("/api/generate-article", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newsItem.title,
          description: newsItem.description || "",
        }),
      });

      if (!res.ok) return buildFallback(newsItem);

      const data = await res.json();
      if (!data.article) return buildFallback(newsItem);

      const art = data.article;
      return {
        ...art,
        id: slugify(art.title || newsItem.title),
        slug: art.slug || slugify(art.title || newsItem.title),
        publishedAt: newsItem.pubDate || new Date().toISOString(),
        sourceUrl: newsItem.link || "",
        imageUrl: newsItem.image_url || getFallback(art.category),
        aiGenerated: true,
      };
    } catch (e) {
      console.warn("[AiNews] generate-article fail:", e.message);
      return buildFallback(newsItem);
    }
  }

  async function generateAllSequential(items) {
    const results = [];
    for (let i = 0; i < items.length; i++) {
      updateProgress(i, items.length, items[i].title);
      const art = await generateArticle(items[i]);
      if (art) results.push(art);
      // Délai entre chaque appel pour éviter le rate-limit
      if (i < items.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
    return results;
  }

  function buildFallback(item) {
    const title = item.title || "Actualité immobilière";
    const cat = detectCategory(title + " " + (item.description || ""));
    return {
      id: slugify(title),
      title,
      slug: slugify(title),
      category: cat,
      tags: ["immobilier"],
      metaDescription: item.description || title,
      excerpt: item.description || title,
      content: `<p>${item.content || item.description || ""}</p>`,
      readTime: 3,
      publishedAt: item.pubDate || new Date().toISOString(),
      sourceUrl: item.link || "",
      imageUrl: item.image_url || getFallback(cat),
      aiGenerated: false,
    };
  }

  function detectCategory(text) {
    const t = text.toLowerCase();
    if (t.includes("dpe") || t.includes("énergie") || t.includes("thermique"))
      return "dpe";
    if (t.includes("taux") || t.includes("marché") || t.includes("prix"))
      return "marche";
    if (
      t.includes("investis") ||
      t.includes("rendement") ||
      t.includes("locatif")
    )
      return "investissement";
    if (t.includes("ia") || t.includes("intelligence") || t.includes("tech"))
      return "ia-tech";
    if (t.includes("guide") || t.includes("conseil") || t.includes("comment"))
      return "guide";
    if (t.includes("loi") || t.includes("juridique") || t.includes("réforme"))
      return "juridique";
    if (t.includes("tendance") || t.includes("évolution")) return "tendance";
    return "actualite";
  }

  /* ─── PROGRESS ─── */
  function updateProgress(current, total, title) {
    const el = document.getElementById("ain-progress-text");
    const bar = document.getElementById("ain-progress-bar");
    if (el)
      el.textContent = `Génération ${current + 1}/${total} — ${title?.slice(0, 50)}…`;
    if (bar) bar.style.width = `${((current + 1) / total) * 100}%`;
  }

  /* ═══════════════════════════════════════════
     ARTICLES DÉMO
  ═══════════════════════════════════════════ */
  function getDemoArticles() {
    return [
      {
        id: "taux-mai-2026",
        title:
          "Baromètre mai 2026 : les taux passent sous 3,4 % — que faire maintenant ?",
        slug: "taux-mai-2026",
        category: "marche",
        tags: ["taux", "crédit", "baromètre"],
        metaDescription:
          "Les taux immobiliers baissent en mai 2026. Analyse complète.",
        excerpt:
          "Pour la première fois depuis 18 mois, les banques jouent la carte de l'attractivité. Ce que ça change pour votre projet immobilier et comment en profiter avant l'été.",
        content: `<h2>Un tournant historique pour le crédit</h2><p>Pour la première fois depuis 18 mois, les taux moyens sur 20 ans sont passés sous la barre symbolique des <strong>3,4 %</strong>. Un signal fort qui devrait relancer une partie de la demande comprimée depuis fin 2022.</p><h2>Pourquoi maintenant ?</h2><p>La BCE a abaissé ses taux directeurs en mars puis en mai. Les banques ont besoin de reconstituer leurs encours de crédit. La compétition s'intensifie et profite aux emprunteurs.</p><ul><li>Sur 15 ans : taux moyen à <strong>3,15 %</strong></li><li>Sur 20 ans : taux moyen à <strong>3,38 %</strong></li><li>Sur 25 ans : taux moyen à <strong>3,52 %</strong></li></ul><h2>Notre conseil</h2><p>Consolidez votre apport, comparez au moins 3 établissements et déposez votre dossier avant juillet. Les délais d'accord raccourcissent et les banques sont ouvertes.</p>`,
        readTime: 6,
        publishedAt: "2026-05-01T08:00:00Z",
        imageUrl: FALLBACK_IMAGES.marche,
        aiGenerated: true,
      },
      {
        id: "top-5-villes-2026",
        title: "Top 5 des villes françaises à saisir avant le rebond du marché",
        slug: "top-5-villes-investir-2026",
        category: "investissement",
        tags: ["investissement", "villes", "rentabilité"],
        metaDescription:
          "Marseille, Toulouse, Rennes : les 5 marchés à saisir en 2026.",
        excerpt:
          "Certains marchés régionaux affichent des rendements locatifs supérieurs à 6 % avec des prix encore accessibles. Notre sélection exclusive.",
        content: `<h2>Le marché reprend — mais pas partout</h2><p>Après deux ans de correction, certains marchés régionaux offrent une combinaison rare : prix bas et demande locative solide.</p><h2>1. Marseille — jusqu'à 7 % de rendement brut</h2><p>Avec un prix médian sous les <strong>3 300 €/m²</strong> et une croissance de +4,2 % sur douze mois, Marseille cumule accessibilité et momentum.</p><h2>2. Toulouse — la tech comme moteur</h2><p>Capital de l'aéronautique européenne, Toulouse attire chaque année 15 000 nouveaux actifs. Loyer médian : 13 €/m².</p><h2>3. Rennes — le marché qui ne dort jamais</h2><p>Ville universitaire en expansion, Rennes affiche un taux de vacance parmi les plus bas de France.</p><h2>4. Nantes — le rebond annoncé</h2><p>Après une correction de -8 % en 2024, Nantes montre des signes clairs de stabilisation.</p><h2>5. Bordeaux — les opportunités de la décote</h2><p>Bordeaux a subi une correction plus forte (-12 %). Pour l'investisseur patient, c'est un point d'entrée historique.</p>`,
        readTime: 5,
        publishedAt: "2026-04-22T09:00:00Z",
        imageUrl: FALLBACK_IMAGES.investissement,
        aiGenerated: true,
      },
      {
        id: "ia-estimation-2026",
        title: "Comment l'IA révolutionne l'estimation immobilière en 2026",
        slug: "ia-estimation-immobiliere-2026",
        category: "ia-tech",
        tags: ["IA", "estimation", "technologie"],
        metaDescription:
          "Les algorithmes d'IA estiment les biens avec une précision de ±2,8 %.",
        excerpt:
          "Les modèles modernes analysent 40+ critères en temps réel et surpassent les estimations des agents traditionnels. Démonstration.",
        content: `<h2>La fin des estimations approximatives</h2><p>En 2026, les modèles d'IA intègrent plus de <strong>40 variables</strong> pour une précision de ±2,8 %. Voici comment.</p><h2>Les données utilisées</h2><ul><li><strong>DVF</strong> : toutes les transactions notariées des 5 dernières années</li><li><strong>Caractéristiques</strong> : surface, étage, exposition, DPE, travaux récents</li><li><strong>Environnement</strong> : score bruit, transports, commerces, écoles</li><li><strong>Tension marché</strong> : offre/demande dans un rayon de 500 m</li></ul><h2>AiGENT vs agence : le test</h2><p>Sur 300 biens vendus en 2025, notre modèle a estimé avec une erreur moyenne de <strong>2,8 %</strong>, contre 7,4 % pour un panel d'agents expérimentés.</p>`,
        readTime: 4,
        publishedAt: "2026-04-15T10:00:00Z",
        imageUrl: FALLBACK_IMAGES["ia-tech"],
        aiGenerated: true,
      },
      {
        id: "dpe-2026-juillet",
        title: "DPE G : l'interdiction de juillet 2026 impacte 400 000 biens",
        slug: "dpe-2026-interdictions-logements-g",
        category: "dpe",
        tags: ["DPE", "rénovation", "passoires thermiques"],
        metaDescription:
          "À partir de juillet 2026, les logements G ne peuvent plus être loués.",
        excerpt:
          "L'interdiction de louer les passoires thermiques crée une pression vendeuse inédite sur 400 000 biens en France. Ce que ça implique.",
        content: `<h2>400 000 logements concernés</h2><p>À compter du <strong>1er juillet 2026</strong>, les propriétaires de logements classés G au DPE ne peuvent plus proposer de nouveaux contrats de location.</p><h2>Deux scénarios</h2><h3>La décote</h3><p>Des propriétaires vendent en dessous du marché, créant des opportunités pour les investisseurs prêts à rénover. Décotes constatées : <strong>8 à 15 %</strong>.</p><h3>La rénovation forcée</h3><p>D'autres engagent des travaux. Coût moyen pour passer de G à D : 15 000 à 35 000 €.</p><h2>Que faire ?</h2><ul><li>Faire un audit énergétique complet</li><li>Demander MaPrimeRénov', CEE, éco-PTZ</li><li>Si vente : anticiper la décote dans le prix</li></ul>`,
        readTime: 5,
        publishedAt: "2026-04-08T11:00:00Z",
        imageUrl: FALLBACK_IMAGES.dpe,
        aiGenerated: true,
      },
      {
        id: "guide-premier-achat",
        title: "Premier achat : les 12 étapes que personne ne vous explique",
        slug: "guide-premier-achat-12-etapes",
        category: "guide",
        tags: ["premier achat", "guide", "acheteur"],
        metaDescription:
          "Du budget à la signature : le guide complet du premier achat en France.",
        excerpt:
          "De la définition du budget à la signature chez le notaire, voici les étapes que les agences omettent souvent d'expliquer à leurs clients.",
        content: `<h2>Avant de visiter quoi que ce soit</h2><h3>Étape 1 — Votre capacité réelle</h3><p>Calculez votre taux d'endettement (max 35 %), incluez les charges de copropriété et les frais de notaire (7-8 % dans l'ancien).</p><h3>Étape 2 — La simulation bancaire</h3><p>Obtenez une simulation ferme auprès d'au moins deux banques avant de visiter. C'est votre budget réel.</p><h3>Étape 3 — Vos critères non-négociables</h3><p>Listez 3 critères absolus et 5 souhaitables. Cette liste vous protège contre l'emballement émotionnel.</p><h2>Pendant les visites</h2><p>Visitez le matin ET le soir. Revenez un jour de pluie. Parlez aux voisins. Lisez les 3 derniers PV d'AG. Ne jamais signer sans avoir tout lu.</p>`,
        readTime: 8,
        publishedAt: "2026-03-28T09:00:00Z",
        imageUrl: FALLBACK_IMAGES.guide,
        aiGenerated: true,
      },
      {
        id: "transactions-t1-2026",
        title: "Transactions T1 2026 : le rebond confirmé à +12 % sur un an",
        slug: "transactions-t1-2026-rebond",
        category: "actualite",
        tags: ["transactions", "marché", "volumes"],
        metaDescription:
          "Les notaires confirment +12 % de transactions au T1 2026.",
        excerpt:
          "Les Notaires de France publient des données encourageantes. Le marché reprend des couleurs avec 248 000 transactions enregistrées.",
        content: `<h2>Un rebond significatif</h2><p>Avec <strong>248 000 transactions</strong> au T1 2026, le marché immobilier confirme son redressement. C'est +12 % par rapport au T1 2025.</p><h2>En province et en IDF</h2><p>Le rebond est plus marqué en province (+14 %) qu'en Île-de-France (+7 %). Les primo-accédants reviennent, portés par la baisse des taux et le PTZ élargi.</p><h2>Perspectives 2026</h2><p>Les notaires anticipent entre 900 000 et 950 000 transactions sur l'année complète, contre 870 000 en 2025.</p>`,
        readTime: 3,
        publishedAt: "2026-04-02T14:00:00Z",
        imageUrl: FALLBACK_IMAGES.actualite,
        aiGenerated: true,
      },
      {
        id: "terrasse-prime-28",
        title: "Terrasse, extérieur : la prime qui explose à +28 % post-Covid",
        slug: "terrasse-exterieur-prime-28-pourcent",
        category: "tendance",
        tags: ["terrasse", "extérieur", "valeur"],
        metaDescription: "Les biens avec terrasse se vendent 28 % plus cher.",
        excerpt:
          "La pandémie a redéfini les critères de choix. Les espaces extérieurs sont devenus le premier facteur de décision dans les grandes métropoles.",
        content: `<h2>L'extérieur, nouveau luxe urbain</h2><p>Une terrasse de 10 m² dans un appartement parisien ajoute en moyenne <strong>28 % au prix au mètre carré</strong>.</p><h2>Par type d'extérieur</h2><ul><li><strong>Terrasse privative</strong> : +22 à +35 %</li><li><strong>Balcon</strong> : +8 à +15 %</li><li><strong>Jardin privatif</strong> : +15 à +45 %</li><li><strong>Vue dégagée</strong> : +6 à +12 %</li></ul><h2>Pour les vendeurs</h2><p>Investir 2 000 € dans l'aménagement d'une terrasse peut rapporter 20 000 € à la revente. Valorisez en photos, en heure dorée.</p>`,
        readTime: 3,
        publishedAt: "2026-03-20T10:00:00Z",
        imageUrl: FALLBACK_IMAGES.tendance,
        aiGenerated: true,
      },
      {
        id: "lmnp-fiscalite-2026",
        title:
          "LMNP 2026 : les nouvelles règles fiscales à connaître absolument",
        slug: "lmnp-fiscalite-2026",
        category: "juridique",
        tags: ["LMNP", "fiscalité", "investissement locatif"],
        metaDescription:
          "La réforme du LMNP change les règles pour les investisseurs en 2026.",
        excerpt:
          "La loi de finances 2026 referme partiellement la fenêtre LMNP. Ce qui change, ce qui reste avantageux, et la stratégie à adopter.",
        content: `<h2>La fin d'un avantage historique ?</h2><p>Le LMNP permettait d'amortir le bien et de déduire les charges. La loi 2026 change deux points clés.</p><h2>Ce qui change</h2><h3>Réintégration des amortissements</h3><p>Lors de la cession, les amortissements déduits seront <strong>réintégrés dans le calcul de la plus-value</strong>.</p><h3>Seuil abaissé</h3><p>La limite de revenus passe de 77 700 € à 50 000 € par an pour rester en LMNP classique.</p><h2>Ce qui reste avantageux</h2><p>Pendant la détention, le régime réel LMNP reste très compétitif. Stratégie : allonger la durée de détention et privilégier les zones à plus-value modérée.</p>`,
        readTime: 6,
        publishedAt: "2026-03-10T09:00:00Z",
        imageUrl: FALLBACK_IMAGES.juridique,
        aiGenerated: true,
      },
      {
        id: "negociation-7-leviers",
        title:
          "7 leviers de négociation que les agents ne veulent pas vous révéler",
        slug: "7-leviers-negociation-immobiliere",
        category: "guide",
        tags: ["négociation", "achat", "conseils"],
        metaDescription:
          "7 techniques pour obtenir jusqu'à 8 % de remise sur le prix affiché.",
        excerpt:
          "Un acheteur bien préparé peut obtenir jusqu'à 8 % de remise. Voici les leviers que peu d'agents vous conseillent d'utiliser.",
        content: `<h2>La négociation, c'est de la préparation</h2><p>80 % des acheteurs ne négocient pas ou négocient mal. Voici les 7 leviers qui font la différence.</p><h2>Levier 1 — Le délai de vente</h2><p>Un bien sur le marché depuis plus de <strong>90 jours</strong> se négocie sans état d'âme.</p><h2>Levier 2 — Les travaux chiffrés</h2><p>Venez avec des devis. "J'ai un devis salle de bain à 12 000 €" est bien plus convaincant que "elle est vieille".</p><h2>Levier 3 — Le DPE comme arme</h2><p>Un logement F ou G justifie 10 à 15 % de remise avec un audit à l'appui.</p><h2>Levier 4 — La rapidité</h2><p>Un vendeur pressé préférera 5 % de moins à un acquéreur avec accord bancaire ferme.</p><h2>Leviers 5 à 7</h2><p>Citez les prix DVF précisément. Proposez de reprendre les meubles. Faites une offre basse écrite : psychologiquement, elle est difficile à ignorer.</p>`,
        readTime: 5,
        publishedAt: "2026-02-28T11:00:00Z",
        imageUrl: FALLBACK_IMAGES.guide,
        aiGenerated: true,
      },
    ];
  }

  /* ═══════════════════════════════════════════
     PIPELINE
  ═══════════════════════════════════════════ */
  async function runPipeline() {
    state.loading = true;
    notifyLoading(true, "Initialisation du pipeline IA…");

    try {
      const cached = getCached();
      if (cached?.length) {
        console.log("[AiNews] Cache valide —", cached.length, "articles");
        state.articles = cached;
        notifyLoading(false);
        render();
        return;
      }

      let articles;

      if (!CONFIG.newsDataKey) {
        console.log("[AiNews] Mode démo (pas de clé NewsData)");
        notifyLoading(true, "Chargement des articles de démonstration…");
        await new Promise((r) => setTimeout(r, 600));
        articles = getDemoArticles();
      } else {
        notifyLoading(true, "Récupération des actualités immobilières…");
        const newsItems = await fetchNews();
        if (!newsItems?.length) throw new Error("Aucun article NewsData");

        notifyLoading(true, "Sélection des articles les plus pertinents…");
        const selected = await selectArticles(newsItems);
        const toGenerate = selected.slice(0, CONFIG.maxArticles);

        notifyLoading(
          true,
          `Génération de ${toGenerate.length} articles par l'IA…`,
        );
        articles = await generateAllSequential(toGenerate);
      }

      state.articles = articles.filter(Boolean);
      setCache(state.articles);
      console.log("[AiNews] ✓", state.articles.length, "articles prêts");
    } catch (err) {
      console.error("[AiNews] Pipeline error → démo:", err.message);
      state.articles = getDemoArticles();
    } finally {
      state.loading = false;
      notifyLoading(false);
      render();
    }
  }

  /* ═══════════════════════════════════════════
     MODAL
  ═══════════════════════════════════════════ */
  function injectModal() {
    if (document.getElementById("ain-modal")) return;
    const el = document.createElement("div");
    el.id = "ain-modal";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.innerHTML = `
      <div class="am-bg"></div>
      <div class="am-panel" tabindex="-1">
        <div class="am-topbar">
          <div class="am-topbar-left" id="am-cat-pill"></div>
          <button class="am-close" id="am-close" aria-label="Fermer">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="am-scroll">
          <div class="am-hero" id="am-hero"></div>
          <div class="am-body">
            <div class="am-meta" id="am-meta"></div>
            <h1 class="am-title" id="am-title"></h1>
            <p class="am-lede" id="am-lede"></p>
            <hr class="am-rule">
            <div class="am-content" id="am-content"></div>
            <div class="am-source" id="am-source"></div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    el.querySelector(".am-bg").addEventListener("click", closeModal);
    el.querySelector("#am-close").addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function openModal(article) {
    const modal = document.getElementById("ain-modal");
    const cat = CATEGORIES[article.category] || CATEGORIES.actualite;

    document.getElementById("am-cat-pill").innerHTML =
      `<span class="am-cat" style="color:${cat.color};background:${cat.bg};border:1px solid ${cat.color}30">${cat.icon} ${cat.label}</span>
       ${article.aiGenerated ? '<span class="am-ai-tag">⬡ DeepSeek IA</span>' : ""}`;

    document.getElementById("am-hero").innerHTML =
      `<img src="${article.imageUrl}" alt="${article.title}" referrerpolicy="no-referrer">
       <div class="am-hero-fade"></div>`;

    document.getElementById("am-meta").innerHTML =
      `<span>${formatDate(article.publishedAt)}</span>
       <span class="am-dot"></span>
       <span>${article.readTime} min de lecture</span>
       ${
         article.tags?.length
           ? `<span class="am-dot"></span>${article.tags
               .slice(0, 3)
               .map((t) => `<span class="am-tag">#${t}</span>`)
               .join("")}`
           : ""
       }`;

    document.getElementById("am-title").textContent = article.title;
    document.getElementById("am-lede").textContent = article.excerpt;
    document.getElementById("am-content").innerHTML = article.content;
    document.getElementById("am-source").innerHTML = article.sourceUrl
      ? `<a href="${article.sourceUrl}" target="_blank" rel="noopener noreferrer">Consulter la source originale →</a>`
      : "";

    modal.classList.add("open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
      modal.querySelector(".am-panel").scrollTop = 0;
      modal.querySelector(".am-panel").focus();
    });
  }

  function closeModal() {
    const m = document.getElementById("ain-modal");
    if (m) m.classList.remove("open");
    document.body.style.overflow = "";
  }

  /* ═══════════════════════════════════════════
     RENDU CARTES
  ═══════════════════════════════════════════ */
  function getFiltered() {
    return state.currentFilter === "all"
      ? state.articles
      : state.articles.filter((a) => a.category === state.currentFilter);
  }

  function render() {
    if (!state.container) return;
    const filtered = getFiltered();
    const shown = filtered.slice(0, state.page * state.perPage);

    state.container.innerHTML = "";
    if (!shown.length) {
      state.container.innerHTML = `<div class="ain-empty">Aucun article dans cette catégorie.</div>`;
      return;
    }

    shown.forEach((art, i) => state.container.appendChild(createCard(art, i)));

    if (shown.length < filtered.length) {
      const wrap = document.createElement("div");
      wrap.className = "ain-more-wrap";
      wrap.innerHTML = `<button class="ain-more">Charger la suite <span>(${filtered.length - shown.length})</span></button>`;
      wrap.addEventListener("click", () => {
        state.page++;
        render();
      });
      state.container.appendChild(wrap);
    }

    // Animate in
    requestAnimationFrame(() => {
      state.container.querySelectorAll(".ain-card").forEach((c, i) => {
        c.style.animationDelay = `${i * 60}ms`;
        c.classList.add("ain-card-in");
      });
    });

    // Update filter counts
    updateFilterCounts(filtered.length);
  }

  function updateFilterCounts(count) {
    const allBtn = document.querySelector("[data-filter='all']");
    if (allBtn) {
      const span = allBtn.querySelector(".fc");
      if (span) span.textContent = state.articles.length;
    }
    const cur = document.querySelector(
      `[data-filter="${state.currentFilter}"]`,
    );
    if (cur && state.currentFilter !== "all") {
      const span = cur.querySelector(".fc");
      if (span) span.textContent = count;
    }
  }

  function createCard(article, index) {
    const cat = CATEGORIES[article.category] || CATEGORIES.actualite;
    const isFeatured = index === 0;
    const card = document.createElement("article");
    card.className = `ain-card${isFeatured ? " ain-card--feat" : ""}`;
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");

    const open = (e) => {
      e.preventDefault();
      openModal(article);
      if (state.onArticleClick) state.onArticleClick(article);
    };
    card.addEventListener("click", open);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open(e);
      }
    });

    card.innerHTML = `
      <div class="ain-card-img">
        <img src="${article.imageUrl}" alt="${article.title}" loading="lazy" referrerpolicy="no-referrer">
        <div class="ain-card-img-fade"></div>
        ${article.aiGenerated ? '<span class="ain-card-ia">⬡ IA</span>' : ""}
        <span class="ain-card-rt">${article.readTime}min</span>
      </div>
      <div class="ain-card-bd">
        <div class="ain-card-cat" style="color:${cat.color}">${cat.icon} ${cat.label}</div>
        <h3 class="ain-card-h">${article.title}</h3>
        <p class="ain-card-ex">${article.excerpt}</p>
        <div class="ain-card-ft">
          <time>${formatDate(article.publishedAt)}</time>
          <span class="ain-card-arrow">→</span>
        </div>
      </div>`;
    return card;
  }

  /* ─── LOADING ─── */
  function notifyLoading(on, msg) {
    const el = document.getElementById("ain-loading");
    const ct = state.container;
    if (el) {
      el.style.display = on ? "flex" : "none";
      const txt = el.querySelector("#ain-loading-msg");
      if (txt && msg) txt.textContent = msg;
    }
    if (ct) ct.style.opacity = on ? "0" : "1";
  }

  /* ─── FILTRES ─── */
  function bindFilters(nav) {
    if (!nav) return;
    nav.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      nav
        .querySelectorAll("[data-filter]")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.currentFilter = btn.dataset.filter;
      state.page = 1;
      render();
    });
  }

  /* ─── API PUBLIQUE ─── */
  function configure(opts = {}) {
    for (const [k, v] of Object.entries(opts)) {
      if (v !== "" && v != null) CONFIG[k] = v;
    }
  }

  function init(options = {}) {
    const {
      containerId = "ain-articles",
      filtersId = "ain-filters",
      perPage = 9,
      onArticleClick,
    } = options;
    state.container = document.getElementById(containerId);
    state.onArticleClick = onArticleClick || null;
    state.perPage = perPage;
    if (!state.container) {
      console.error(`[AiNews] #${containerId} not found`);
      return;
    }

    injectModal();
    bindFilters(document.getElementById(filtersId));
    loadConfigFromServer().then(runPipeline);
  }

  function refresh() {
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith("aigent_articles"))
      .forEach((k) => sessionStorage.removeItem(k));
    state.page = 1;
    runPipeline();
  }

  function getArticles() {
    return [...state.articles];
  }
  function getCategories() {
    return { ...CATEGORIES };
  }

  return { configure, init, refresh, getArticles, getCategories };
})();

/* ════════════════════════════════════════
   STYLES INJECTÉS
════════════════════════════════════════ */
(function injectStyles() {
  if (document.getElementById("ain-styles")) return;
  const s = document.createElement("style");
  s.id = "ain-styles";
  s.textContent = `
    /* ── CARDS ── */
    @keyframes ainFadeUp {
      from { opacity: 0; transform: translateY(20px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .ain-card {
      background: #fff;
      border: 1px solid #ede8f8;
      border-radius: 18px;
      overflow: hidden;
      cursor: pointer;
      transition: transform .24s cubic-bezier(.2,.8,.2,1), box-shadow .24s, border-color .2s;
      opacity: 0;
      position: relative;
    }
    .ain-card-in { animation: ainFadeUp .5s ease forwards; }
    .ain-card:hover { transform: translateY(-6px); box-shadow: 0 20px 52px rgba(99,40,180,.15); border-color: rgba(124,58,237,.25); }
    .ain-card:focus-visible { outline: 2px solid #7c3aed; outline-offset: 3px; }
    .ain-card--feat { grid-column: span 2; }

    .ain-card-img { position: relative; overflow: hidden; aspect-ratio: 16/9; }
    .ain-card--feat .ain-card-img { aspect-ratio: 21/9; }
    .ain-card-img img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.88); transition: transform .7s ease, filter .3s; }
    .ain-card:hover .ain-card-img img { transform: scale(1.07); filter: brightness(.75); }
    .ain-card-img-fade { position: absolute; inset: 0; background: linear-gradient(to top, rgba(10,5,28,.55) 0%, transparent 60%); }
    .ain-card-ia { position: absolute; top: 12px; left: 12px; font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; background: rgba(91,20,200,.85); color: #d4bbff; padding: 4px 10px; border-radius: 7px; backdrop-filter: blur(10px); border: 1px solid rgba(180,140,255,.2); }
    .ain-card-rt { position: absolute; bottom: 12px; right: 12px; font-size: 10px; font-weight: 600; background: rgba(10,5,28,.75); color: rgba(255,255,255,.75); padding: 3px 9px; border-radius: 6px; backdrop-filter: blur(8px); }

    .ain-card-bd { padding: 18px 20px 20px; }
    .ain-card--feat .ain-card-bd { padding: 22px 26px 24px; }
    .ain-card-cat { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 9px; display: flex; align-items: center; gap: 5px; }
    .ain-card-h { font-size: 15px; font-weight: 700; line-height: 1.35; letter-spacing: -.01em; color: #12082a; margin-bottom: 9px; transition: color .2s; }
    .ain-card--feat .ain-card-h { font-size: 20px; }
    .ain-card:hover .ain-card-h { color: #7c3aed; }
    .ain-card-ex { font-size: 13px; color: #8878a8; line-height: 1.65; margin-bottom: 14px; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .ain-card-ft { display: flex; align-items: center; justify-content: space-between; font-size: 11px; color: #bbaedd; }
    .ain-card-arrow { font-size: 16px; color: #7c3aed; opacity: 0; transition: opacity .2s, transform .2s; }
    .ain-card:hover .ain-card-arrow { opacity: 1; transform: translateX(4px); }

    .ain-more-wrap { grid-column: 1/-1; text-align: center; padding: 16px 0 8px; }
    .ain-more { font-size: 13px; font-weight: 700; color: #7c3aed; padding: 13px 32px; border: 1.5px solid rgba(124,58,237,.25); border-radius: 100px; cursor: pointer; transition: all .2s; background: rgba(124,58,237,.04); font-family: inherit; }
    .ain-more span { opacity: .5; font-weight: 400; margin-left: 4px; }
    .ain-more:hover { background: #7c3aed; color: #fff; border-color: #7c3aed; }
    .ain-empty { grid-column: 1/-1; text-align: center; padding: 60px 20px; color: #9988bb; font-size: 15px; }

    @media (max-width: 720px) {
      .ain-card--feat { grid-column: auto; }
      .ain-card--feat .ain-card-img { aspect-ratio: 16/9; }
      .ain-card--feat .ain-card-h { font-size: 16px; }
    }

    /* ── MODAL ── */
    #ain-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 20px; opacity: 0; pointer-events: none; transition: opacity .28s ease; }
    #ain-modal.open { opacity: 1; pointer-events: all; }
    .am-bg { position: absolute; inset: 0; background: rgba(8,3,22,.8); backdrop-filter: blur(18px); }
    .am-panel {
      position: relative; z-index: 1;
      width: 100%; max-width: 740px;
      max-height: 90vh;
      background: #0e0820;
      border: 1px solid rgba(124,58,237,.2);
      border-radius: 24px;
      display: flex; flex-direction: column;
      box-shadow: 0 40px 100px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.04);
      transform: scale(.96) translateY(16px);
      transition: transform .32s cubic-bezier(.2,.8,.2,1);
      outline: none;
      overflow: hidden;
    }
    #ain-modal.open .am-panel { transform: scale(1) translateY(0); }

    .am-topbar { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,.05); flex-shrink: 0; }
    .am-topbar-left { display: flex; align-items: center; gap: 8px; }
    .am-cat { font-size: 10px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; padding: 4px 12px; border-radius: 8px; }
    .am-ai-tag { font-size: 9px; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #c4a8ff; background: rgba(124,58,237,.15); border: 1px solid rgba(124,58,237,.25); padding: 3px 10px; border-radius: 6px; }
    .am-close { width: 32px; height: 32px; border-radius: 9px; border: 1px solid rgba(255,255,255,.1); background: rgba(255,255,255,.05); color: rgba(255,255,255,.5); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; font-family: inherit; }
    .am-close:hover { background: rgba(190,24,93,.2); border-color: rgba(190,24,93,.4); color: #f472b6; }

    .am-scroll { flex: 1; overflow-y: auto; scroll-behavior: smooth; }
    .am-scroll::-webkit-scrollbar { width: 3px; }
    .am-scroll::-webkit-scrollbar-thumb { background: rgba(124,58,237,.3); border-radius: 3px; }

    .am-hero { position: relative; height: 260px; overflow: hidden; flex-shrink: 0; }
    .am-hero img { width: 100%; height: 100%; object-fit: cover; display: block; filter: brightness(.7); }
    .am-hero-fade { position: absolute; inset: 0; background: linear-gradient(to top, #0e0820 0%, transparent 50%); }

    .am-body { padding: 24px 28px 40px; }
    .am-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 11.5px; color: rgba(255,255,255,.3); margin-bottom: 14px; }
    .am-dot { width: 3px; height: 3px; border-radius: 50%; background: rgba(255,255,255,.2); flex-shrink: 0; }
    .am-tag { font-size: 10px; color: #a78bfa; background: rgba(124,58,237,.15); padding: 2px 8px; border-radius: 5px; font-weight: 600; }
    .am-title { font-size: clamp(20px,3.5vw,30px); font-weight: 800; line-height: 1.18; letter-spacing: -.02em; color: #f0ebff; margin-bottom: 14px; }
    .am-lede { font-size: 15.5px; line-height: 1.7; color: #9980cc; margin-bottom: 22px; font-style: italic; }
    .am-rule { border: none; border-top: 1px solid rgba(255,255,255,.06); margin-bottom: 24px; }
    .am-content { font-size: 15px; line-height: 1.82; color: rgba(240,235,255,.7); }
    .am-content h2 { font-size: 19px; font-weight: 800; color: #f0ebff; margin: 28px 0 12px; letter-spacing: -.01em; }
    .am-content h3 { font-size: 15px; font-weight: 700; color: #d4bbff; margin: 20px 0 8px; }
    .am-content p { margin-bottom: 16px; }
    .am-content ul { margin: 0 0 16px 20px; display: flex; flex-direction: column; gap: 7px; }
    .am-content li::marker { color: #7c3aed; }
    .am-content strong { color: #e9d5ff; font-weight: 700; }
    .am-source { margin-top: 28px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.06); }
    .am-source a { font-size: 12.5px; font-weight: 700; color: #a78bfa; text-decoration: underline; text-underline-offset: 3px; letter-spacing: .01em; }
    .am-source a:hover { color: #c4b5fd; }

    @media (max-width: 500px) {
      #ain-modal { padding: 0; align-items: flex-end; }
      .am-panel { border-radius: 20px 20px 0 0; max-height: 94vh; max-width: 100%; }
      .am-body { padding: 18px 18px 32px; }
    }
  `;
  document.head.appendChild(s);
})();
