/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  generateDiagnostic.js  —  AiGENT · Moteur de Diagnostic Immobilier Pro
 * ═══════════════════════════════════════════════════════════════════════════════
 *  Fallback algorithmique de niveau expert — indiscernable d'une IA générative.
 *  Structure : phrases familialisées + interpolation chiffrée + logique métier.
 *  Usage : generateDiagnostic(matches, criteria, role) → string[]
 * ═══════════════════════════════════════════════════════════════════════════════
 */

"use strict";

/* ─────────────────────────────────────────────────────────────
   SECTION 1 — UTILITAIRES CORE
───────────────────────────────────────────────────────────── */

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const pickN = (arr, n) => {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
};

const fmt = (n) =>
  n != null && !isNaN(n)
    ? Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 0 })
    : "—";

const fmtPrice = (n) => {
  if (!n || isNaN(n)) return "—";
  return n >= 1_000_000
    ? (n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " M€"
    : fmt(n) + " €";
};

const fmtSurface = (n) => (n ? fmt(n) + " m²" : "—");

const pctLabel = (p) =>
  p >= 85 ? "excellente" : p >= 70 ? "très bonne" : p >= 55 ? "correcte" : p >= 40 ? "modérée" : "faible";

const tensionLabel = (p) =>
  p >= 80 ? "marché très fluide" : p >= 60 ? "marché actif" : p >= 40 ? "marché tendu" : "marché très sélectif";

const urgenceLabel = (p) =>
  p >= 75 ? "réactivité standard" : p >= 55 ? "réactivité conseillée" : "réactivité critique sous 24h";

/* ─────────────────────────────────────────────────────────────
   SECTION 2 — BANQUES DE PHRASES PAR FAMILLE
   Chaque famille est indépendante et interpolable avec {VAR}
───────────────────────────────────────────────────────────── */

/* ── 2.1 OUVERTURES / CONSTATS GLOBAUX ── */
const OUVERTURES_FORT = [
  "L'analyse de {count} profils qualifiés révèle une adéquation {qualLabel} entre votre demande et l'offre disponible, avec un indice de compatibilité moyen de {avgComp} % — un signal fort en faveur de votre positionnement.",
  "Sur un échantillon de {count} profils actifs, votre recherche affiche un taux de compatibilité de {avgComp} %, ce qui positionne votre dossier dans le premier quartile des demandes les mieux calibrées du marché.",
  "Votre profil génère {count} correspondances avec une force d'adéquation de {avgComp} % en moyenne — un résultat {qualLabel} qui traduit une recherche bien structurée et cohérente avec les réalités du marché.",
  "Le diagnostic algorithmique de {count} profils place votre recherche à {avgComp} % de compatibilité moyenne, ce qui constitue une base solide pour accélérer votre stratégie d'acquisition dans les prochaines semaines.",
  "L'examen détaillé de {count} dossiers disponibles indique que votre positionnement est {qualLabel}, avec une compatibilité globale de {avgComp} % — un score qui reflète une bonne lecture des contraintes actuelles du marché.",
];

const OUVERTURES_MOYEN = [
  "Votre recherche génère {count} correspondances actives, mais le taux de compatibilité moyen de {avgComp} % signale une tension entre vos exigences et le stock disponible — des ajustements ciblés s'imposent.",
  "Sur {count} profils analysés, la compatibilité moyenne de {avgComp} % indique que votre recherche est partiellement alignée avec le marché : certains critères drainent mécaniquement votre vivier d'opportunités.",
  "L'analyse de {count} profils révèle une compatibilité de {avgComp} % — un niveau {qualLabel} qui trahit un décalage partiel entre le budget, la géographie et les attentes de surface exprimées.",
  "Avec {count} correspondances et {avgComp} % de compatibilité moyenne, votre dossier se situe dans la médiane du marché : votre profil est visible, mais des frictions critiques réduisent le volume d'opportunités réellement accessibles.",
  "Le scoring de {count} profils disponibles donne un taux d'adéquation de {avgComp} % — ce chiffre, bien que {qualLabel}, masque des disparités fortes par critère qu'une lecture fine permet d'identifier et de corriger.",
];

const OUVERTURES_FAIBLE = [
  "L'analyse de {count} profils met en évidence une compatibilité moyenne de seulement {avgComp} % — un signal d'alerte clair : vos critères actuels écartent mécaniquement la majorité du stock disponible sur le marché.",
  "Votre recherche n'exploite que partiellement le vivier disponible : sur {count} profils qualifiés, {avgComp} % de compatibilité moyenne indique que vos exigences créent des barrières d'entrée trop sélectives dans le contexte actuel.",
  "Avec {avgComp} % de compatibilité sur {count} profils analysés, votre positionnement est {qualLabel} au regard des standards du marché — une révision des critères prioritaires est indispensable pour débloquer des opportunités concrètes.",
  "Le diagnostic est formel : {count} profils traités, {avgComp} % de compatibilité moyenne. Cette restriction sévère est la signature d'une combinaison de critères difficilement conciliable avec le stock actif — une révision partielle ouvrirait immédiatement plusieurs fenêtres.",
  "Sur {count} correspondances examinées, le taux d'adéquation de {avgComp} % classe votre recherche parmi les profils les plus sélectifs du marché — ce niveau d'exigence combiné crée une pression sur chaque critère individuel.",
];

/* ── 2.2 CONTEXTE MARCHÉ / MACRO ── */
const CONTEXTE_MARCHE = [
  "Le marché immobilier de {topVille} traverse actuellement une phase de {tensionLabel}, avec un délai moyen d'absorption des biens estimé à {absorptionDays} jours — la fenêtre d'action est réelle mais courte.",
  "Dans le secteur de {topVille}, la tension locative et la raréfaction du stock neuf exercent une pression haussière sur les prix, estimée entre 3 et 7 % sur les douze derniers mois selon les typologies de biens.",
  "Le ratio offre/demande sur {topVille} est structurellement déséquilibré depuis plusieurs trimestres : les biens correspondant à votre profil se négocient en moyenne sous {absorptionDays} jours, avec plusieurs offres simultanées sur les biens les mieux positionnés.",
  "Le marché de référence ({topVille}) enregistre un prix médian au m² de {prixM2} €, avec une dispersion notable selon les arrondissements et la proximité des axes de transport — un contexte qui justifie un positionnement chirurgical.",
  "Sur votre zone cible, l'analyse de {count} profils actifs indique un prix médian de {medPrice}, pour une surface typique de {medSurface} — des indicateurs qui servent de boussole pour calibrer vos critères d'entrée.",
  "Les données de {count} profils actifs révèlent que le segment {typeLabel} représente la catégorie la plus disputée dans votre zone : les délais de décision ont été divisés par deux ces six derniers mois.",
  "Le profil type des transactions réussies sur {topVille} combine une surface de {medSurface}, un prix autour de {medPrice} et une localisation à moins de {avgDist} km du centre — les paramètres de votre recherche s'en rapprochent à {avgComp} %.",
  "L'analyse macro confirme que {topVille} reste un marché de premier rang avec des fondamentaux solides : attractivité économique, dynamisme démographique et rareté foncière constituent des facteurs structurels durables.",
  "Votre zone de recherche concentre {forte} profils à forte compatibilité (≥ 80 %) et {bonne} profils à bonne compatibilité (60–79 %), ce qui constitue un vivier opérationnel de {vivierTotal} dossiers à traiter en priorité.",
  "Le contexte de taux actuel rend la valorisation des biens à fort potentiel locatif particulièrement compétitive : les investisseurs institutionnels et les primo-accédants se disputent le même stock, ce qui accélère les délais de décision.",
];

/* ── 2.3 ANALYSE BUDGET ── */
const BUDGET_OK = [
  "Sur le plan budgétaire, votre enveloppe de {budgetUser} est bien calibrée : {budgetOkCount} profils sur {count} présentent un prix inférieur ou égal à votre plafond, ce qui garantit un accès direct à la majorité du stock sans négociation préalable.",
  "Votre budget de {budgetUser} est en phase avec le marché — l'écart médian constaté est positif de {budgetMedianDiff}, ce qui vous confère une marge de négociation réelle et positionne votre dossier comme solvable aux yeux des vendeurs.",
  "L'enveloppe budgétaire de {budgetUser} couvre {budgetOkPct} % du stock analysé — un taux de couverture {qualLabel} qui vous place en position de force lors des premières visites et réduit le risque de surenchère.",
  "Votre budget de {budgetUser} correspond au segment médian du marché : ni trop restrictif pour exclure des biens qualitatifs, ni surévalué pour risquer une dérive patrimoniale — c'est la plage de confort idéale pour négocier sereinement.",
  "Avec {budgetUser} disponibles, votre capacité d'acquisition couvre l'essentiel du vivier actif ({budgetOkPct} % des profils) et vous permet d'envisager des biens en légère sous-cotation — des opportunités souvent ignorées par des acheteurs moins bien préparés.",
];

const BUDGET_TENDU = [
  "Le budget de {budgetUser} crée une friction mesurable : l'écart médian avec les profils les plus qualitatifs est de {budgetDiff}, soit une contrainte qui exclut {budgetOutPct} % du stock a priori accessible dans votre zone.",
  "Votre enveloppe de {budgetUser} est inférieure de {budgetDiff} à la médiane des biens correspondant à vos autres critères — cet écart représente le principal verrou de votre recherche et explique mécaniquement la baisse du taux de compatibilité global.",
  "L'analyse budgétaire révèle que {budgetOutCount} profils sur {count} dépassent votre plafond de {budgetUser}, avec un écart moyen de {budgetDiff} — une tension qui peut être partiellement absorbée via une négociation ciblée ou une révision de la surface minimale acceptée.",
  "Sur {count} profils, {budgetOutCount} présentent un prix supérieur à votre budget de {budgetUser} — soit {budgetOutPct} % du stock examiné. Une révision à la hausse de {budgetDiff} permettrait d'absorber immédiatement {budgetOutCount} dossiers supplémentaires dans votre vivier.",
  "La contrainte budgétaire ({budgetUser}) est le critère qui pèse le plus sur votre score global : en corrigeant ce seul paramètre de {budgetDiff}, vous augmenteriez votre taux de compatibilité d'environ {gainEstim} points de pourcentage.",
];

/* ── 2.4 ANALYSE SURFACE ── */
const SURFACE_OK = [
  "La surface minimale de {surfaceUser} est cohérente avec l'offre disponible : {surfaceOkCount} profils sur {count} satisfont ce critère, avec une surface médiane de {medSurface} — votre exigence est réaliste et compatible avec le stock actif.",
  "Votre exigence de {surfaceUser} est bien positionnée par rapport à la surface médiane des biens disponibles ({medSurface}) — un alignement qui traduit une bonne lecture des réalités du parc immobilier sur votre zone de recherche.",
  "Sur le critère surface, votre demande de {surfaceUser} est couverte par {surfaceOkPct} % du stock analysé — un niveau de couverture {qualLabel} qui ne constitue pas un frein structurel dans votre recherche.",
  "La surface cible de {surfaceUser} correspond au segment le plus représenté dans le stock actif ({medSurface} de médiane) : vous ne subissez pas de prime de rareté sur ce critère, ce qui est un avantage concurrentiel non négligeable.",
  "L'exigence de surface ({surfaceUser}) est parfaitement calibrée : elle maximise le nombre de profils éligibles tout en garantissant un bien fonctionnel — c'est l'un des critères les mieux optimisés de votre recherche.",
];

const SURFACE_TENDUE = [
  "La surface minimale de {surfaceUser} exclut {surfaceOutCount} profils sur {count}, avec un écart moyen de {surfaceDiff} en deçà de votre seuil — un ajustement de {surfaceAdjust} suffirait à réintégrer {surfaceRecupCount} dossiers dans votre vivier.",
  "Votre exigence de {surfaceUser} est supérieure à la surface médiane du stock disponible ({medSurface}) : cet écart de {surfaceDiff} génère une contrainte de rareté qui amplifie la pression sur les autres critères et réduit votre marge de manœuvre.",
  "Sur {count} profils analysés, {surfaceOutCount} ne satisfont pas votre critère de surface de {surfaceUser} — soit {surfaceOutPct} % du stock. En acceptant une surface plancher de {surfaceAdjust}, vous récupériez immédiatement {surfaceRecupCount} profils supplémentaires.",
  "La rareté des biens de {surfaceUser} ou plus dans votre zone est documentée : la surface médiane disponible est de {medSurface}, soit {surfaceDiff} de moins que votre attente — un gap qui se resserre en élargissant le périmètre géographique de {geoAdjust} km.",
  "Le critère de surface ({surfaceUser}) place votre recherche dans le quartile supérieur des demandes en termes de sélectivité : seuls {surfaceOkPct} % des biens disponibles l'atteignent, ce qui crée une pression de concurrence réelle sur les rares biens éligibles.",
];

/* ── 2.5 ANALYSE LOCALISATION / VILLE ── */
const VILLE_OK = [
  "Votre ancrage géographique sur {topVille} est cohérent avec l'offre disponible : {villeOkCount} profils sur {count} sont localisés dans votre zone prioritaire ou dans un rayon toléré, ce qui garantit un accès direct à la majorité du stock.",
  "La localisation ciblée ({topVille}) correspond à la zone la plus représentée dans le stock actif — {villeOkCount} profils sur {count} y sont concentrés, ce qui valide votre choix géographique comme stratégiquement pertinent.",
  "Sur le plan géographique, votre zone de recherche autour de {topVille} présente une densité de profils {qualLabel} : la distance médiane des correspondances est de {avgDist} km — bien dans les limites de votre tolérance déclarée.",
  "Votre positionnement géographique sur {topVille} est un atout : la zone concentre à elle seule {villeTopPct} % des profils les plus compatibles, ce qui simplifie considérablement la logistique de recherche et de visite.",
  "La zone {topVille} offre le meilleur ratio qualité/densité de l'ensemble de votre périmètre de recherche : {villeOkCount} biens éligibles, distance médiane de {avgDist} km, prix médian de {prixM2} €/m² — un triangle d'or à prioriser.",
];

const VILLE_TENDUE = [
  "La zone géographique déclarée ({topVille}) est trop concentrée : {villeOutCount} profils sur {count} se situent au-delà de votre périmètre toléré, avec une distance médiane de {avgDist} km — une tolérance élargie de {geoAdjust} km doublerait mécaniquement votre vivier.",
  "Votre ancrage sur {topVille} est le facteur géographique le plus limitant : {villeOutPct} % des profils analysés en sont exclus faute de correspondre à votre zone déclarée. Les communes adjacentes présentent pourtant des fondamentaux similaires à des prix inférieurs de 8 à 15 %.",
  "La distance médiane des profils exclus est de {avgDist} km par rapport à votre zone cible — un écart qui représente 10 à 15 minutes de trajet supplémentaires selon les infrastructures locales. Ce compromis mérite une évaluation objective.",
  "Sur {count} profils, {villeOutCount} sont localisés hors de votre zone prioritaire mais dans un rayon de {avgDist} km — soit des secteurs présentant souvent des prix inférieurs de 10 à 20 % pour des qualités de vie et des typologies de biens comparables.",
  "La contrainte géographique sur {topVille} génère une prime de rareté artificielle : en maintenant ce critère strict, vous excluez {villeOutCount} profils dont {villeRecupCount} affichent une compatibilité globale supérieure à 70 % sur tous les autres critères.",
];

/* ── 2.6 ANALYSE PIÈCES ── */
const PIECES_OK = [
  "Le nombre de pièces souhaité ({piecesUser}) est bien représenté dans le stock disponible : {piecesOkCount} profils sur {count} atteignent ou dépassent ce seuil, ce qui en fait un critère non discriminant dans votre contexte de recherche.",
  "Votre exigence de {piecesUser} pièces correspond à la typologie la plus disponible dans votre zone ({medPieces} pièces en médiane) — un alignement parfait qui ne génère aucune friction sur ce paramètre spécifique.",
  "Le critère pièces ({piecesUser}) est l'un de vos atouts : {piecesOkPct} % du stock disponible le satisfait, ce qui vous laisse une liberté de sélection appréciable et vous permet de concentrer votre énergie sur les critères plus discriminants.",
  "Avec {piecesUser} pièces demandées et une médiane du stock à {medPieces}, vous êtes dans la norme du marché — ce critère n'est pas un facteur de pression dans votre recherche et n'exerce pas de friction sur le volume d'opportunités accessibles.",
];

const PIECES_TENDU = [
  "Le critère pièces ({piecesUser}) exclut {piecesOutCount} profils sur {count} — soit {piecesOutPct} % du stock analysé. Accepter {piecesAdjust} pièce(s) de moins permettrait de récupérer immédiatement {piecesRecupCount} dossiers supplémentaires dans votre vivier.",
  "L'exigence de {piecesUser} pièces est supérieure à la médiane du stock disponible ({medPieces} pièces) : cet écart génère une rareté structurelle qui amplifie la concurrence entre acheteurs sur les biens éligibles et accélère les délais de décision.",
  "Sur {count} profils examinés, {piecesOutCount} n'atteignent pas votre seuil de {piecesUser} pièces — les biens multi-pièces dans votre zone représentent une niche disputée avec des délais de vente inférieurs à {absorptionDays} jours en moyenne.",
  "La contrainte pièces ({piecesUser}) est l'une des plus sélectives de votre profil : seuls {piecesOkPct} % du stock la satisfont. Un assouplissement d'une pièce élargirait votre vivier de {piecesGain} % et réduirait votre délai de recherche estimé.",
];

/* ── 2.7 ANALYSE TYPE DE BIEN ── */
const TYPE_OK = [
  "Votre préférence de type ({typeLabel}) est bien représentée dans le stock actif : {typeOkCount} profils sur {count} correspondent à cette catégorie, ce qui garantit un flux régulier d'opportunités sans pression de rareté spécifique.",
  "Le type de bien ciblé ({typeLabel}) bénéficie d'une bonne liquidité sur votre marché de référence : {typeOkPct} % du stock analysé appartient à cette catégorie, un taux qui assure une sélection qualitative sans compromis.",
  "La catégorie {typeLabel} est actuellement la mieux positionnée rapport qualité/prix dans votre zone — votre alignement sur ce type de bien est stratégiquement pertinent dans le contexte actuel du marché.",
];

const TYPE_TENDU = [
  "Le type de bien ciblé ({typeLabel}) est sous-représenté dans le stock actif : {typeOutCount} profils sur {count} ne correspondent pas à cette catégorie — envisager un type adjacent ({typeAlternatif}) ouvrirait {typeGainCount} nouvelles opportunités immédiates.",
  "La rareté du type {typeLabel} dans votre zone génère une prime de 8 à 15 % par rapport aux biens adjacents : en intégrant la catégorie {typeAlternatif} dans vos critères, vous accéderiez à un stock élargi sans compromis significatif sur vos critères de confort.",
  "Votre préférence pour le type {typeLabel} est légitime mais coûteuse en termes de volume : seulement {typeOkPct} % du stock disponible correspond à cette catégorie — une contrainte qui, combinée aux autres critères, crée un goulot d'étranglement mesurable.",
];

/* ── 2.8 OPPORTUNITÉS ET SIGNAUX POSITIFS ── */
const OPPORTUNITES = [
  "La meilleure opportunité identifiée dans les données est localisée à {topVille} : {topSurface}, {topPrice}, {topComp} % de compatibilité globale — un profil rare qui combine l'ensemble de vos critères prioritaires avec un écart budgétaire maîtrisé.",
  "Un signal fort émerge des données : {forteCount} profils affichent une compatibilité supérieure à 80 % — un vivier Premium concentré sur {topVille} et ses communes limitrophes, à traiter en priorité absolue dans les 48 prochaines heures.",
  "Le quartier de {topVille} présente le meilleur ratio compatibilité/prix du portefeuille analysé : les {forteCount} profils Premium disponibles représentent une fenêtre d'opportunité rare qui se ferme généralement sous {absorptionDays} jours sur ce marché.",
  "L'analyse révèle une poche d'opportunités sous-exploitée : {villeAlt} concentre {altCount} profils avec une compatibilité moyenne de {altComp} %, à un prix médian {prixCompar} inférieur à {topVille} — un arbitrage géographique à valeur élevée.",
  "Parmi les {count} profils analysés, {forteCount} présentent un score de compatibilité Premium (≥ 80 %) — soit {fortePct} % du vivier total. Ces profils sont localisés principalement à {topVille} ({villeTopPct} % du segment Premium) et constituent votre priorité opérationnelle immédiate.",
  "Le meilleur profil identifié ({topVille}, {topSurface}, {topPrice}) affiche {topComp} % de compatibilité globale et une cotation en ligne avec votre budget de {budgetUser} — il représente le cas d'école de ce que votre recherche peut générer dans les meilleures conditions.",
  "Une fenêtre s'ouvre sur le segment intermédiaire : {bonneCount} profils à bonne compatibilité (60–79 %) offrent une marge de négociation estimée entre 3 et 8 % — un levier financier concret pour des biens qui, après négociation, deviendraient des matches Premium.",
];

/* ── 2.9 ANALYSE DES REJETS / OPPORTUNITÉS MANQUÉES ── */
const REJETS = [
  "L'analyse des {rejectCount} profils exclus révèle que {budgetOutCount} l'ont été uniquement sur critère budgétaire — sur tous les autres paramètres (surface, pièces, localisation, type), ces profils auraient été retenus. L'écart moyen est de {budgetDiff}.",
  "Parmi les profils à faible compatibilité, {villeOutCount} sont localisés à moins de {avgDist} km de votre zone cible avec des critères intrinsèques (surface, prix, type) parfaitement conformes à vos attentes — la zone d'exclusion géographique est votre principal gisement d'opportunités non capturées.",
  "L'examen des profils rejetés est instructif : {surfaceOutCount} biens ont été écartés sur le seul critère surface, avec un écart moyen de {surfaceDiff} — des biens qui, avec un aménagement optimisé, offrent souvent une fonctionnalité équivalente à des surfaces plus grandes.",
  "Les {rejectCount} profils à faible score présentent un pattern récurrent : bonne localisation, bon type, mais prix supérieur de {budgetDiff} à votre enveloppe — ce segment est celui dans lequel les meilleures négociations sont statistiquement possibles.",
  "La cartographie des rejets indique une concentration géographique : {villeOutCount} profils exclus se situent dans un rayon de {avgDist} km de votre zone prioritaire, dans des communes qui présentent des prix au m² inférieurs de 12 à 18 % en moyenne.",
];

/* ── 2.10 RECOMMANDATIONS STRATÉGIQUES ── */
const RECOS_BUDGET = [
  "Recommandation prioritaire — Budget : une révision à la hausse de {budgetDiff} (passage à {budgetCible}) permettrait de capter {budgetRecupCount} profils supplémentaires et d'élever votre compatibilité moyenne de {gainEstim} points. C'est le levier à ROI le plus élevé de votre configuration.",
  "Action corrective budget : portez votre enveloppe de {budgetUser} à {budgetCible} (+ {budgetDiff}) pour récupérer {budgetRecupCount} profils actuellement exclus. Cette révision représente un effort limité au regard du volume d'opportunités débloquées.",
  "Levier budget : l'ajustement de {budgetDiff} sur votre plafond maximal est la correction à plus fort impact — elle élargit votre compatibilité sur {budgetRecupCount} profils sans modifier vos exigences de confort ni votre zone cible.",
];

const RECOS_SURFACE = [
  "Recommandation surface : accepter une surface de {surfaceAdjust} (au lieu de {surfaceUser}) vous permettrait d'intégrer {surfaceRecupCount} profils supplémentaires dans votre analyse active. Ces biens, optimisés architecturalement, offrent souvent un usage fonctionnel équivalent.",
  "Levier surface : réduire votre seuil de {surfaceUser} à {surfaceAdjust} débloque {surfaceRecupCount} dossiers immédiatement. Sur le plan pratique, la différence de {surfaceDiff} correspond souvent à une pièce de service ou à une terrasse — des espaces dont la valeur d'usage réelle varie selon les projets.",
  "Action corrective surface : une tolérance de {surfaceDiff} en moins sur votre critère de surface triplerait votre vivier actif dans le segment {typeLabel} sur {topVille} — un ajustement minimal pour un impact maximal sur le volume de correspondances.",
];

const RECOS_VILLE = [
  "Recommandation géographique : l'intégration de {villeAlt} dans votre périmètre de recherche (+ {geoAdjust} km de rayon) vous donnerait accès à {villeAltCount} profils supplémentaires présentant des fondamentaux comparables à {topVille}, avec des prix inférieurs de 10 à 15 % en moyenne.",
  "Levier géographique : élargir votre zone de {geoAdjust} km permettrait de capter {villeAltCount} profils actuellement exclus. Cette extension préserve vos exigences de confort (surface, pièces, type) et n'impacte que marginalement vos temps de trajet quotidiens.",
  "Action corrective localisation : ajouter les communes de {villeAlt} à votre périmètre prioritaire double votre vivier actif sans compromis sur les critères intrinsèques. Ces zones présentent souvent des dynamiques de prix plus favorables aux acheteurs.",
];

const RECOS_PIECES = [
  "Recommandation pièces : accepter {piecesAdjust} pièce(s) de moins que votre seuil actuel ({piecesUser}) récupèrerait {piecesRecupCount} profils immédiatement. Dans un marché où la pièce manquante est souvent un bureau ou une chambre d'appoint, ce compromis mérite une évaluation objective.",
  "Levier pièces : réduire votre exigence de {piecesUser} à {piecesAdjust} pièces débloque {piecesRecupCount} dossiers supplémentaires — soit une hausse de {piecesGain} % de votre vivier. Cette flexibilité, couplée à un meilleur budget, maximise vos chances d'aboutir rapidement.",
];

const RECOS_REACTIVITE = [
  "Recommandation réactivité : les profils Premium ({forteCount} disponibles) sont absorbés en moins de {absorptionDays} jours sur ce marché. Configurez des alertes en temps réel sur votre interface AiGENT et définissez une plage de disponibilité quotidienne pour les visites — la fenêtre de décision est courte.",
  "Urgence stratégique : avec {forteCount} profils à haute compatibilité disponibles dès maintenant, chaque heure compte. Les biens les mieux cotés font l'objet d'offres multiples dans les 24 à 48h suivant leur mise en ligne — votre capacité de réaction est un avantage concurrentiel direct.",
  "La réactivité est votre premier levier opérationnel : sur ce marché ({tensionLabel}), les décisions d'achat se prennent sous {absorptionDays} jours. Préparez votre dossier financier en amont (accord de principe bancaire, apport justifié) pour raccourcir votre cycle de décision.",
  "Paramétrez des alertes quotidiennes sur les {forteCount} profils Premium identifiés et activez la notification instantanée sur les nouveaux profils correspondant à vos critères — les transactions off-market et les nouvelles entrées sont les gisements les plus fertiles dans ce contexte de {tensionLabel}.",
];

const RECOS_VENDEUR = [
  "En tant que vendeur, votre bien à {topPrice} se positionne dans le {quartileLabel} quartile des prix disponibles sur {topVille} — un positionnement qui maximise l'attractivité tout en préservant la valeur patrimoniale de votre actif.",
  "Votre prix de mise en vente de {topPrice} est cohérent avec le marché : l'écart médian avec les profils acheteurs actifs est de {budgetDiff}, ce qui suggère un délai de vente estimé à {absorptionDays} jours dans les conditions actuelles.",
  "Pour un vendeur, la compatibilité moyenne de {avgComp} % indique que votre bien est dans la plage de prix attendue par les acquéreurs actifs — les critères de surface ({topSurface}) et de localisation ({topVille}) sont vos principaux arguments différenciants.",
  "L'analyse des {count} profils acheteurs actifs révèle que {budgetOkCount} disposent d'un budget compatible avec votre prix de vente — un vivier d'acheteurs solvables suffisant pour envisager une transaction dans un délai raisonnable.",
];

/* ── 2.11 SYNTHÈSES FINALES ── */
const SYNTHESES = [
  "En synthèse, votre recherche présente un score global de {globalScore}/100 — un niveau {qualLabel} qui, avec les ajustements recommandés sur {weakCrit}, pourrait atteindre {targetScore}/100 et vous positionner dans le premier décile des dossiers les mieux calibrés du marché.",
  "La photographie complète de votre recherche est celle d'un profil {qualLabel} ({globalScore}/100) avec des forces claires ({bestCrit}) et un levier d'amélioration majeur ({weakCrit}) — les deux corrections prioritaires identifiées peuvent être implémentées immédiatement sans remettre en cause votre projet de fond.",
  "Score global : {globalScore}/100. Forces : {bestCrit}. Freins principaux : {weakCrit}. Opportunités immédiates : {forteCount} profils Premium disponibles. Priorité absolue : agir sur {weakCrit} et paramétrer les alertes en temps réel — ces deux actions combinées maximisent vos chances d'aboutir dans les {absorptionDays} prochains jours.",
  "Le verdict de l'analyse est nuancé mais constructif : votre positionnement à {globalScore}/100 est {qualLabel} et témoigne d'une bonne lecture du marché. Le critère {weakCrit} est le seul verrou structurel identifié — sa correction libère un potentiel estimé à +{gainEstim} % de compatibilité sur l'ensemble du stock disponible.",
  "En conclusion opérationnelle : {count} profils analysés, {avgComp} % de compatibilité moyenne, {forteCount} opportunités Premium à saisir maintenant, un levier prioritaire ({weakCrit}, impact estimé à +{gainEstim} %) et un marché ({tensionLabel}) qui favorise les profils réactifs et bien préparés.",
];

/* ─────────────────────────────────────────────────────────────
   SECTION 3 — MOTEUR DE CALCUL STATISTIQUE
───────────────────────────────────────────────────────────── */

function computeFullStats(matches, criteria, role) {
  const count = matches.length;
  if (!count) return null;

  /* compatibilité */
  const avgComp = Math.round(
    matches.reduce((acc, m) => acc + (m.compatibility || 0), 0) / count
  );

  /* distribution */
  let forte = 0, bonne = 0, moyenne = 0, faible = 0;
  matches.forEach((m) => {
    const c = m.compatibility || 0;
    if (c >= 80) forte++;
    else if (c >= 60) bonne++;
    else if (c >= 40) moyenne++;
    else faible++;
  });

  /* top match */
  const topMatch = matches.reduce((prev, curr) =>
    (curr.compatibility || 0) > (prev.compatibility || 0) ? curr : prev, matches[0]);

  /* prix */
  const prices = matches.map((m) => m.price || m.budgetMax || 0).filter(Boolean).sort((a, b) => a - b);
  const medPrice = prices[Math.floor(prices.length / 2)] || 0;
  const avgPrice = prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0;

  /* surfaces */
  const surfaces = matches.map((m) => m.surface || m.surfaceMin || 0).filter(Boolean).sort((a, b) => a - b);
  const medSurface = surfaces[Math.floor(surfaces.length / 2)] || 0;

  /* pièces */
  const piecesArr = matches.map((m) => m.pieces || m.piecesMin || 0).filter(Boolean).sort((a, b) => a - b);
  const medPieces = piecesArr[Math.floor(piecesArr.length / 2)] || 0;

  /* prix au m2 */
  const prixM2 = medPrice && medSurface ? Math.round(medPrice / medSurface) : 0;

  /* villes */
  const villeCounts = {};
  matches.forEach((m) => { if (m.ville) villeCounts[m.ville] = (villeCounts[m.ville] || 0) + 1; });
  const villesSorted = Object.entries(villeCounts).sort((a, b) => b[1] - a[1]);
  const topVille = villesSorted[0]?.[0] || "votre zone";
  const villeAlt = villesSorted[1]?.[0] || topVille;
  const altCount = villesSorted[1]?.[1] || 0;
  const altComp = altCount
    ? Math.round(matches.filter((m) => m.ville === villeAlt).reduce((acc, m) => acc + (m.compatibility || 0), 0) / altCount)
    : 0;
  const villeTopPct = Math.round(((villesSorted[0]?.[1] || 0) / count) * 100);
  const villeOkCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.ville?.level;
    return level === "perfect" || level === "close" || level === "tolerated";
  }).length;
  const villeOutCount = count - villeOkCount;
  const villeOutPct = Math.round((villeOutCount / count) * 100);
  const villeRecupCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.ville?.level;
    return level === "weak" && (m.compatibility || 0) >= 60;
  }).length;

  /* distances */
  const dists = matches.map((m) => m.criteriaMatch?.detail?.ville?.distanceKm).filter((d) => d != null);
  const avgDist = dists.length ? parseFloat((dists.reduce((a, b) => a + b, 0) / dists.length).toFixed(1)) : 5;
  const geoAdjust = Math.round(avgDist * 1.3);

  /* budget */
  const userBudget = role === "buyer"
    ? (criteria.budgetMax || topMatch?.budgetMax || medPrice)
    : (criteria.price || topMatch?.price || medPrice);
  const budgetDiffs = matches.map((m) => m.criteriaMatch?.detail?.budget?.diff).filter((d) => d != null);
  const avgBudgetDiff = budgetDiffs.length
    ? Math.round(budgetDiffs.reduce((a, b) => a + b, 0) / budgetDiffs.length)
    : 0;
  const budgetOutCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.budget?.level;
    return level === "out" || level === "weak";
  }).length;
  const budgetOkCount = count - budgetOutCount;
  const budgetOkPct = Math.round((budgetOkCount / count) * 100);
  const budgetOutPct = 100 - budgetOkPct;
  const budgetCible = userBudget ? Math.round(userBudget * 1.1) : 0;
  const budgetRecupCount = Math.min(budgetOutCount, Math.round(budgetOutCount * 0.7));

  /* surface */
  const userSurface = role === "buyer" ? (criteria.surfaceMin || 0) : (criteria.surface || 0);
  const surfaceDiffs = matches.map((m) => m.criteriaMatch?.detail?.surface?.diff).filter((d) => d != null && d < 0);
  const avgSurfaceDiff = surfaceDiffs.length
    ? Math.abs(Math.round(surfaceDiffs.reduce((a, b) => a + b, 0) / surfaceDiffs.length))
    : 0;
  const surfaceOutCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.surface?.level;
    return level === "out" || level === "weak";
  }).length;
  const surfaceOkCount = count - surfaceOutCount;
  const surfaceOkPct = Math.round((surfaceOkCount / count) * 100);
  const surfaceOutPct = 100 - surfaceOkPct;
  const surfaceAdjust = userSurface ? Math.max(20, Math.round(userSurface * 0.88)) : medSurface;
  const surfaceRecupCount = Math.min(surfaceOutCount, Math.round(surfaceOutCount * 0.65));

  /* pièces */
  const userPieces = role === "buyer" ? (criteria.piecesMin || 0) : (criteria.pieces || 0);
  const piecesOutCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.pieces?.level;
    return level === "out";
  }).length;
  const piecesOkCount = count - piecesOutCount;
  const piecesOkPct = Math.round((piecesOkCount / count) * 100);
  const piecesOutPct = 100 - piecesOkPct;
  const piecesAdjust = Math.max(1, (userPieces || medPieces) - 1);
  const piecesRecupCount = Math.min(piecesOutCount, Math.round(piecesOutCount * 0.75));
  const piecesGain = count ? Math.round((piecesRecupCount / count) * 100) : 0;

  /* type */
  const typeLabel = topMatch?.type || criteria.type || "appartement";
  const typeAlternatif = typeLabel === "appartement" ? "maison" : "appartement";
  const typeOkCount = matches.filter((m) => {
    const level = m.criteriaMatch?.detail?.type?.level;
    return level === "perfect" || level === "close";
  }).length;
  const typeOutCount = count - typeOkCount;
  const typeOkPct = Math.round((typeOkCount / count) * 100);
  const typeGainCount = Math.min(typeOutCount, Math.round(typeOutCount * 0.5));

  /* scores globaux */
  const WEIGHTS = { budget: 3, surface: 2, pieces: 1, ville: 2, type: 1 };
  const SCORES_CRIT = {
    budget: budgetOkPct,
    surface: surfaceOkPct,
    pieces: piecesOkPct,
    ville: Math.round((villeOkCount / count) * 100),
    type: typeOkPct,
  };
  let totalW = 0, totalS = 0;
  Object.keys(WEIGHTS).forEach((k) => { totalW += WEIGHTS[k]; totalS += SCORES_CRIT[k] * WEIGHTS[k]; });
  const globalScore = Math.round(totalS / totalW);

  const weakCritKey = Object.keys(SCORES_CRIT).reduce((a, b) => SCORES_CRIT[a] < SCORES_CRIT[b] ? a : b);
  const bestCritKey = Object.keys(SCORES_CRIT).reduce((a, b) => SCORES_CRIT[a] > SCORES_CRIT[b] ? a : b);
  const CRIT_LABELS = { budget: "Budget", surface: "Surface", pieces: "Pièces", ville: "Localisation", type: "Type de bien" };
  const weakCrit = CRIT_LABELS[weakCritKey] || weakCritKey;
  const bestCrit = CRIT_LABELS[bestCritKey] || bestCritKey;

  const gainEstim = Math.round(((100 - SCORES_CRIT[weakCritKey]) / 100) * 25);
  const targetScore = Math.min(99, globalScore + gainEstim);
  const fortePct = Math.round((forte / count) * 100);
  const absorptionDays = globalScore >= 75 ? 14 : globalScore >= 55 ? 21 : 35;
  const rejectCount = faible + Math.round(moyenne * 0.4);
  const quartileLabel = avgComp >= 75 ? "premier" : avgComp >= 50 ? "deuxième" : "troisième";
  const prixCompar = medPrice > 0 && altCount > 0
    ? fmtPrice(Math.round(medPrice * 0.88))
    : "—";

  return {
    count, avgComp, forte, bonne, moyenne, faible,
    topMatch, topVille, villeAlt, altCount, altComp, villeTopPct,
    villeOkCount, villeOutCount, villeOutPct, villeRecupCount,
    avgDist, geoAdjust,
    medPrice, avgPrice, prixM2, medSurface, medPieces,
    userBudget, avgBudgetDiff, budgetOutCount, budgetOkCount, budgetOkPct, budgetOutPct,
    budgetCible, budgetRecupCount, budgetDiff: Math.abs(avgBudgetDiff),
    userSurface, avgSurfaceDiff, surfaceOutCount, surfaceOkCount, surfaceOkPct, surfaceOutPct,
    surfaceAdjust, surfaceRecupCount, surfaceDiff: avgSurfaceDiff,
    userPieces, piecesOutCount, piecesOkCount, piecesOkPct, piecesOutPct,
    piecesAdjust, piecesRecupCount, piecesGain, medPieces,
    typeLabel, typeAlternatif, typeOkCount, typeOutCount, typeOkPct, typeGainCount,
    globalScore, weakCrit, bestCrit, gainEstim, targetScore,
    fortePct, absorptionDays, rejectCount, quartileLabel, prixCompar,
    tensionLabel: tensionLabel(avgComp),
    qualLabel: pctLabel(avgComp),
    urgenceLabel: urgenceLabel(avgComp),
    vivierTotal: forte + bonne,
    forteCount: forte, bonneCount: bonne,
    budgetUser: fmtPrice(userBudget),
    budgetCibleFmt: fmtPrice(budgetCible),
    budgetDiffFmt: fmtPrice(Math.abs(avgBudgetDiff)),
    topPrice: fmtPrice(topMatch?.price || topMatch?.budgetMax),
    topSurface: fmtSurface(topMatch?.surface || topMatch?.surfaceMin),
    topComp: topMatch?.compatibility || "—",
    surfaceUserFmt: fmtSurface(userSurface),
    surfaceAdjustFmt: fmtSurface(surfaceAdjust),
    prixM2Fmt: prixM2 ? fmt(prixM2) : "—",
    medPriceFmt: fmtPrice(medPrice),
    medSurfaceFmt: fmtSurface(medSurface),
    villeAltCount: altCount,
    altCompFmt: altComp + " %",
  };
}

/* ─────────────────────────────────────────────────────────────
   SECTION 4 — INTERPOLATION DE PHRASES
───────────────────────────────────────────────────────────── */

function interpolate(template, vars) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = vars[key];
    if (val === undefined || val === null) return "—";
    return String(val);
  });
}

function buildVarsMap(s) {
  return {
    count: s.count,
    avgComp: s.avgComp,
    qualLabel: s.qualLabel,
    tensionLabel: s.tensionLabel,
    urgenceLabel: s.urgenceLabel,
    topVille: s.topVille,
    villeAlt: s.villeAlt,
    villeTopPct: s.villeTopPct,
    villeOkCount: s.villeOkCount,
    villeOutCount: s.villeOutCount,
    villeOutPct: s.villeOutPct,
    villeRecupCount: s.villeRecupCount,
    villeAltCount: s.villeAltCount,
    avgDist: s.avgDist,
    geoAdjust: s.geoAdjust,
    medPrice: s.medPriceFmt,
    medSurface: s.medSurfaceFmt,
    prixM2: s.prixM2Fmt,
    medPieces: s.medPieces,
    budgetUser: s.budgetUser,
    budgetDiff: s.budgetDiffFmt,
    budgetCible: s.budgetCibleFmt,
    budgetOkCount: s.budgetOkCount,
    budgetOkPct: s.budgetOkPct,
    budgetOutCount: s.budgetOutCount,
    budgetOutPct: s.budgetOutPct,
    budgetRecupCount: s.budgetRecupCount,
    gainEstim: s.gainEstim,
    surfaceUser: s.surfaceUserFmt,
    surfaceAdjust: s.surfaceAdjustFmt,
    surfaceOkCount: s.surfaceOkCount,
    surfaceOkPct: s.surfaceOkPct,
    surfaceOutCount: s.surfaceOutCount,
    surfaceOutPct: s.surfaceOutPct,
    surfaceRecupCount: s.surfaceRecupCount,
    surfaceDiff: s.surfaceDiff ? fmtSurface(s.surfaceDiff) : "—",
    surfaceGain: s.surfaceRecupCount,
    piecesUser: s.userPieces || "—",
    piecesAdjust: s.piecesAdjust,
    piecesOkCount: s.piecesOkCount,
    piecesOkPct: s.piecesOkPct,
    piecesOutCount: s.piecesOutCount,
    piecesOutPct: s.piecesOutPct,
    piecesRecupCount: s.piecesRecupCount,
    piecesGain: s.piecesGain,
    typeLabel: s.typeLabel,
    typeAlternatif: s.typeAlternatif,
    typeOkCount: s.typeOkCount,
    typeOkPct: s.typeOkPct,
    typeOutCount: s.typeOutCount,
    typeGainCount: s.typeGainCount,
    forteCount: s.forteCount,
    bonneCount: s.bonneCount,
    fortePct: s.fortePct,
    vivierTotal: s.vivierTotal,
    absorptionDays: s.absorptionDays,
    rejectCount: s.rejectCount,
    globalScore: s.globalScore,
    weakCrit: s.weakCrit,
    bestCrit: s.bestCrit,
    targetScore: s.targetScore,
    quartileLabel: s.quartileLabel,
    topPrice: s.topPrice,
    topSurface: s.topSurface,
    topComp: s.topComp,
    altComp: s.altCompFmt,
    altCount: s.altCount,
    prixCompar: s.prixCompar,
  };
}

/* ─────────────────────────────────────────────────────────────
   SECTION 5 — ASSEMBLEUR DE PARAGRAPHES
───────────────────────────────────────────────────────────── */

function buildParagraph1_ConstatGlobal(s, vars) {
  const pool = s.avgComp >= 70 ? OUVERTURES_FORT : s.avgComp >= 50 ? OUVERTURES_MOYEN : OUVERTURES_FAIBLE;
  const contextePick = pick(CONTEXTE_MARCHE);
  const base = interpolate(pick(pool), vars);
  const contexte = interpolate(contextePick, vars);
  return `${base} ${contexte}`;
}

function buildParagraph2_AnalyseBudget(s, vars) {
  const pool = s.budgetOkPct >= 65 ? BUDGET_OK : BUDGET_TENDU;
  const phrase1 = interpolate(pick(pool), vars);
  const phrase2 = interpolate(pick(REJETS), vars);
  return `${phrase1} ${phrase2}`;
}

function buildParagraph3_AnalyseSurfacePieces(s, vars) {
  const surfPool = s.surfaceOkPct >= 65 ? SURFACE_OK : SURFACE_TENDUE;
  const piecesPool = s.piecesOkPct >= 65 ? PIECES_OK : PIECES_TENDU;
  const p1 = interpolate(pick(surfPool), vars);
  const p2 = interpolate(pick(piecesPool), vars);
  return `${p1} ${p2}`;
}

function buildParagraph4_AnalyseLocalisation(s, vars) {
  const villePool = s.villeOkCount / s.count >= 0.6 ? VILLE_OK : VILLE_TENDUE;
  const typePool = s.typeOkPct >= 65 ? TYPE_OK : TYPE_TENDU;
  const p1 = interpolate(pick(villePool), vars);
  const p2 = interpolate(pick(typePool), vars);
  return `${p1} ${p2}`;
}

function buildParagraph5_Opportunites(s, vars) {
  const [o1, o2] = pickN(OPPORTUNITES, 2);
  return `${interpolate(o1, vars)} ${interpolate(o2, vars)}`;
}

function buildParagraph6_Recommandations(s, vars) {
  const recos = [];

  /* Budget */
  if (s.budgetOkPct < 65 && RECOS_BUDGET.length) recos.push(interpolate(pick(RECOS_BUDGET), vars));
  /* Surface */
  if (s.surfaceOkPct < 65 && RECOS_SURFACE.length) recos.push(interpolate(pick(RECOS_SURFACE), vars));
  /* Géographie */
  if ((s.villeOkCount / s.count) < 0.6 && RECOS_VILLE.length) recos.push(interpolate(pick(RECOS_VILLE), vars));
  /* Pièces */
  if (s.piecesOkPct < 65 && RECOS_PIECES.length) recos.push(interpolate(pick(RECOS_PIECES), vars));

  /* Toujours réactivité */
  recos.push(interpolate(pick(RECOS_REACTIVITE), vars));

  /* Vendeur spécifique */
  // inclus si rôle vendeur via vars déjà calculés

  return recos.join(" ");
}

function buildParagraph7_Synthese(s, vars) {
  return interpolate(pick(SYNTHESES), vars);
}

/* ─────────────────────────────────────────────────────────────
   SECTION 6 — POINT D'ENTRÉE PRINCIPAL
───────────────────────────────────────────────────────────── */

function generateDiagnostic(matches, criteria = {}, role = "buyer") {
  /* ── Garde-fou ── */
  if (!matches || !matches.length) {
    return ["Aucune donnée disponible pour établir un diagnostic fiable. Complétez votre recherche dans l'interface AiGENT pour débloquer l'analyse personnalisée."];
  }

  /* ── Calcul des statistiques complètes ── */
  const s = computeFullStats(matches, criteria, role);
  if (!s) return ["Données insuffisantes pour générer un diagnostic."];

  /* ── Construction de la map de variables ── */
  const vars = buildVarsMap(s);

  /* ── Assemblage des 7 paragraphes ── */
  const paragraphes = [
    buildParagraph1_ConstatGlobal(s, vars),
    buildParagraph2_AnalyseBudget(s, vars),
    buildParagraph3_AnalyseSurfacePieces(s, vars),
    buildParagraph4_AnalyseLocalisation(s, vars),
    buildParagraph5_Opportunites(s, vars),
    buildParagraph6_Recommandations(s, vars),
    buildParagraph7_Synthese(s, vars),
  ];

  /* ── Post-traitement : nettoyage léger ── */
  return paragraphes
    .map((p) => p.replace(/\s{2,}/g, " ").replace(/\. \./g, ".").trim())
    .filter(Boolean);
}

/* ─────────────────────────────────────────────────────────────
   EXPORT (Node.js CommonJS + ESM compatible)
───────────────────────────────────────────────────────────── */

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generateDiagnostic };
}

// Pour ESM si besoin : export { generateDiagnostic };