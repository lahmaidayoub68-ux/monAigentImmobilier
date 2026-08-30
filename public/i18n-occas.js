/**
 * i18n-occas.js — Moteur de traduction + devise/unité pour Mon AiGENT Occasion
 *
 * À inclure UNE FOIS par page, AVANT le script propre à la page :
 *   <script src="./i18n-occas.js"></script>
 *   <script src="profil-occas.js"></script>
 *
 * API exposée : window.OccasPrefs
 *   .applyAll(prefs)        → applique langue + devise + unité
 *   .applyLanguage(lang)    → "fr" | "en" | "es" | "de"
 *   .applyCurrency(cur)     → "EUR" | "USD" | "GBP" | "CHF"
 *   .applyUnit(unit)        → "km" | "mi"
 *   .t(key)                 → traduction ponctuelle depuis JS
 *   .formatPrice(n)         → prix formaté dans la devise active
 *   .formatDistance(km)     → distance formatée dans l'unité active
 */
(function () {
  const STORAGE_KEY = "occas_prefs_cache";
  const RATES_FROM_EUR = { EUR: 1, USD: 1.08, GBP: 0.86, CHF: 0.95 };
  const CUR_SYMBOL = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };
  const KM_TO_MI = 0.621371;

  /* ══════════ DICTIONNAIRE COMPLET FR → EN / ES / DE ══════════ */
  const DICT = {
    /* ── STRUCTURE & NAVIGATION ── */
    "Mon AiGENT": { en: "Mon AiGENT", es: "Mon AiGENT", de: "Mon AiGENT" },
    Occasion: { en: "Occasion", es: "Occasion", de: "Occasion" },
    Compte: { en: "Account", es: "Cuenta", de: "Konto" },
    Véhicules: { en: "Vehicles", es: "Vehículos", de: "Fahrzeuge" },
    Identité: { en: "Identity", es: "Identidad", de: "Identität" },
    "Mes annonces": {
      en: "My listings",
      es: "Mis anuncios",
      de: "Meine Anzeigen",
    },
    Agenda: { en: "Calendar", es: "Agenda", de: "Kalender" },
    Activité: { en: "Activity", es: "Actividad", de: "Aktivität" },
    "Coffre CarVertical": {
      en: "CarVertical vault",
      es: "Bóveda CarVertical",
      de: "CarVertical-Tresor",
    },
    "Cote & estimation": {
      en: "Valuation & estimate",
      es: "Cotización y estimación",
      de: "Bewertung & Schätzung",
    },
    "Cote &amp; estimation": {
      en: "Valuation & estimate",
      es: "Cotización y estimación",
      de: "Bewertung & Schätzung",
    },
    Préférences: { en: "Preferences", es: "Preferencias", de: "Einstellungen" },
    Sécurité: { en: "Security", es: "Seguridad", de: "Sicherheit" },
    "Support & aide": {
      en: "Support & help",
      es: "Soporte y ayuda",
      de: "Support & Hilfe",
    },
    "Support &amp; aide": {
      en: "Support & help",
      es: "Soporte y ayuda",
      de: "Support & Hilfe",
    },
    "Zone critique": {
      en: "Danger zone",
      es: "Zona crítica",
      de: "Kritischer Bereich",
    },
    Profil: { en: "Profile", es: "Perfil", de: "Profil" },
    "Retour au chat": {
      en: "Back to chat",
      es: "Volver al chat",
      de: "Zurück zum Chat",
    },
    Déconnexion: { en: "Log out", es: "Cerrar sesión", de: "Abmelden" },
    Menu: { en: "Menu", es: "Menú", de: "Menü" },
    Thème: { en: "Theme", es: "Tema", de: "Design" },
    Notifications: {
      en: "Notifications",
      es: "Notificaciones",
      de: "Benachrichtigungen",
    },
    "Tout marquer comme lu": {
      en: "Mark all as read",
      es: "Marcar todo como leído",
      de: "Alles als gelesen markieren",
    },
    "Voir plus →": {
      en: "View more →",
      es: "Ver más →",
      de: "Mehr anzeigen →",
    },

    /* ── IDENTITÉ & PROFIL ── */
    "Membre depuis": {
      en: "Member since",
      es: "Miembro desde",
      de: "Mitglied seit",
    },
    "Ville non renseignée": {
      en: "City not specified",
      es: "Ciudad no especificada",
      de: "Stadt nicht angegeben",
    },
    "2FA active": { en: "2FA active", es: "2FA activa", de: "2FA aktiv" },
    "2FA inactive": {
      en: "2FA inactive",
      es: "2FA inactiva",
      de: "2FA inaktiv",
    },
    Annonces: { en: "Listings", es: "Anuncios", de: "Anzeigen" },
    Favoris: { en: "Favorites", es: "Favoritos", de: "Favoriten" },
    Échanges: { en: "Conversations", es: "Intercambios", de: "Unterhaltungen" },
    "Informations personnelles": {
      en: "Personal information",
      es: "Información personal",
      de: "Persönliche Daten",
    },
    "Synchronisées avec votre compte": {
      en: "Synced with your account",
      es: "Sincronizado con su cuenta",
      de: "Mit Ihrem Konto synchronisiert",
    },
    Identifiant: { en: "Username", es: "Identificador", de: "Benutzername" },
    "L'identifiant est définitif et sert à la connexion.": {
      en: "Your username is permanent and used to sign in.",
      es: "El identificador es definitivo y sirve para iniciar sesión.",
      de: "Der Benutzername ist endgültig und dient der Anmeldung.",
    },
    "Email / téléphone de contact": {
      en: "Contact email / phone",
      es: "Correo / teléfono de contacto",
      de: "Kontakt-E-Mail / Telefon",
    },
    Enregistrer: { en: "Save", es: "Guardar", de: "Speichern" },
    "Ville de référence": {
      en: "Reference city",
      es: "Ciudad de referencia",
      de: "Referenzstadt",
    },
    "Utilisée pour le rayon de recherche et le matching.": {
      en: "Used for the search radius and matching.",
      es: "Se usa para el radio de búsqueda y el emparejamiento.",
      de: "Wird für den Suchradius und das Matching verwendet.",
    },
    "Aperçu du compte": {
      en: "Account overview",
      es: "Resumen de la cuenta",
      de: "Kontoübersicht",
    },
    "Vos 14 derniers jours": {
      en: "Your last 14 days",
      es: "Sus últimos 14 días",
      de: "Ihre letzten 14 Tage",
    },
    "Temps total": { en: "Total time", es: "Tiempo total", de: "Gesamtzeit" },
    "Jours actifs": {
      en: "Active days",
      es: "Días activos",
      de: "Aktive Tage",
    },
    "Voir l'activité détaillée": {
      en: "View detailed activity",
      es: "Ver actividad detallada",
      de: "Detaillierte Aktivität ansehen",
    },

    /* ── MES ANNONCES ── */
    "Chaque annonce correspond à une conversation avec votre AiGENT.": {
      en: "Each listing corresponds to a conversation with your AiGENT.",
      es: "Cada anuncio corresponde a una conversación con su AiGENT.",
      de: "Jede Anzeige entspricht einer Unterhaltung mit Ihrem AiGENT.",
    },
    "Vos véhicules & recherches": {
      en: "Your vehicles & searches",
      es: "Sus vehículos y búsquedas",
      de: "Ihre Fahrzeuge & Suchen",
    },
    "Vos véhicules &amp; recherches": {
      en: "Your vehicles & searches",
      es: "Sus vehículos y búsquedas",
      de: "Ihre Fahrzeuge & Suchen",
    },
    Toutes: { en: "All", es: "Todos", de: "Alle" },
    Publiées: { en: "Published", es: "Publicados", de: "Veröffentlicht" },
    Publiée: { en: "Published", es: "Publicado", de: "Veröffentlicht" },
    Brouillons: { en: "Drafts", es: "Borradores", de: "Entwürfe" },
    Brouillon: { en: "Draft", es: "Borrador", de: "Entwurf" },
    Vendeur: { en: "Seller", es: "Vendedor", de: "Verkäufer" },
    Acheteur: { en: "Buyer", es: "Comprador", de: "Käufer" },
    "Nouvelle annonce": {
      en: "New listing",
      es: "Nuevo anuncio",
      de: "Neue Anzeige",
    },
    "Aucune annonce": {
      en: "No listings",
      es: "Ningún anuncio",
      de: "Keine Anzeigen",
    },
    "Lancez une conversation avec votre AiGENT pour créer votre première annonce.":
      {
        en: "Start a conversation with your AiGENT to create your first listing.",
        es: "Inicie una conversación con su AiGENT para crear su primer anuncio.",
        de: "Starten Sie eine Unterhaltung mit Ihrem AiGENT, um Ihre erste Anzeige zu erstellen.",
      },
    "Prix à définir": {
      en: "Price to be defined",
      es: "Precio por definir",
      de: "Preis noch festzulegen",
    },
    "Budget libre": {
      en: "Open budget",
      es: "Presupuesto libre",
      de: "Offenes Budget",
    },
    Véhicule: { en: "Vehicle", es: "Vehículo", de: "Fahrzeug" },
    "Voir le détail": {
      en: "View details",
      es: "Ver detalles",
      de: "Details ansehen",
    },
    Conversation: {
      en: "Conversation",
      es: "Conversación",
      de: "Unterhaltung",
    },
    Annonce: { en: "Listing", es: "Anuncio", de: "Anzeige" },
    "Annonce vendeur": {
      en: "Seller listing",
      es: "Anuncio de vendedor",
      de: "Verkäuferanzeige",
    },
    "Recherche acheteur": {
      en: "Buyer search",
      es: "Búsqueda de comprador",
      de: "Käufersuche",
    },
    Année: { en: "Year", es: "Año", de: "Baujahr" },
    Kilométrage: { en: "Mileage", es: "Kilometraje", de: "Kilometerstand" },
    Carburant: { en: "Fuel", es: "Combustible", de: "Kraftstoff" },
    Boîte: { en: "Gearbox", es: "Caja de cambios", de: "Getriebe" },
    Rayon: { en: "Radius", es: "Radio", de: "Radius" },
    Photos: { en: "Photos", es: "Fotos", de: "Fotos" },
    "Rapport CarVertical": {
      en: "CarVertical report",
      es: "Informe CarVertical",
      de: "CarVertical-Bericht",
    },
    Disponible: { en: "Available", es: "Disponible", de: "Verfügbar" },
    "Zones d'état renseignées": {
      en: "Condition zones specified",
      es: "Zonas de estado especificadas",
      de: "Zustandsbereiche angegeben",
    },
    "Ouvrir le rapport CarVertical": {
      en: "Open CarVertical report",
      es: "Abrir informe CarVertical",
      de: "CarVertical-Bericht öffnen",
    },

    /* ── AGENDA ── */
    "Essais, contrôles techniques, révisions et rendez-vous.": {
      en: "Test drives, technical inspections, servicing and appointments.",
      es: "Pruebas, inspecciones técnicas, revisiones y citas.",
      de: "Probefahrten, Hauptuntersuchungen, Wartungen und Termine.",
    },
    "Nouvel évènement": {
      en: "New event",
      es: "Nuevo evento",
      de: "Neues Ereignis",
    },
    "Enregistré en base": {
      en: "Saved to your account",
      es: "Guardado en la base de datos",
      de: "In der Datenbank gespeichert",
    },
    Titre: { en: "Title", es: "Título", de: "Titel" },
    Date: { en: "Date", es: "Fecha", de: "Datum" },
    Heure: { en: "Time", es: "Hora", de: "Uhrzeit" },
    Type: { en: "Type", es: "Tipo", de: "Typ" },
    "Essai véhicule": {
      en: "Test drive",
      es: "Prueba de conducción",
      de: "Probefahrt",
    },
    "Contrôle technique": {
      en: "Technical inspection",
      es: "Inspección técnica",
      de: "Hauptuntersuchung (TÜV)",
    },
    "Révision / entretien": {
      en: "Service / maintenance",
      es: "Revisión / mantenimiento",
      de: "Wartung / Inspektion",
    },
    "Rendez-vous acheteur": {
      en: "Buyer appointment",
      es: "Cita con comprador",
      de: "Käufertermin",
    },
    Autre: { en: "Other", es: "Otro", de: "Andere" },
    Pastille: {
      en: "Color tag",
      es: "Etiqueta de color",
      de: "Farbmarkierung",
    },
    Note: { en: "Note", es: "Nota", de: "Notiz" },
    "Ajouter à l'agenda": {
      en: "Add to calendar",
      es: "Añadir a la agenda",
      de: "Zum Kalender hinzufügen",
    },
    "Mettre à jour l'évènement": {
      en: "Update event",
      es: "Actualizar evento",
      de: "Ereignis aktualisieren",
    },
    "À venir": { en: "Upcoming", es: "Próximos", de: "Bevorstehend" },
    "7 prochains jours": {
      en: "Next 7 days",
      es: "Próximos 7 días",
      de: "Nächste 7 Tage",
    },
    "Rien de prévu": {
      en: "Nothing scheduled",
      es: "Nada previsto",
      de: "Nichts geplant",
    },
    "Ajoutez un essai ou un contrôle technique.": {
      en: "Add a test drive or a technical inspection.",
      es: "Añada una prueba o una inspección técnica.",
      de: "Fügen Sie eine Probefahrt oder Hauptuntersuchung hinzu.",
    },

    /* ── ACTIVITÉ ── */
    "Activité sur le site": {
      en: "Activity on the site",
      es: "Actividad en el sitio",
      de: "Aktivität auf der Website",
    },
    "Temps passé, régularité et intensité d'utilisation.": {
      en: "Time spent, consistency and usage intensity.",
      es: "Tiempo transcurrido, regularidad e intensidad de uso.",
      de: "Verbrachte Zeit, Regelmäßigkeit und Nutzungsintensität.",
    },
    "Temps d'écran": {
      en: "Screen time",
      es: "Tiempo de pantalla",
      de: "Bildschirmzeit",
    },
    "7 jours": { en: "7 days", es: "7 días", de: "7 Tage" },
    "30 jours": { en: "30 days", es: "30 días", de: "30 Tage" },
    "90 jours": { en: "90 days", es: "90 días", de: "90 Tage" },
    "Moyenne / jour actif": {
      en: "Average / active day",
      es: "Promedio / día activo",
      de: "Durchschnitt / aktiver Tag",
    },
    "Meilleur jour": { en: "Best day", es: "Mejor día", de: "Bester Tag" },

    /* ── COFFRE CARVERTICAL ── */
    "Vos rapports d'historique véhicule centralisés, chiffrés côté compte et réutilisables dans vos annonces.":
      {
        en: "Your vehicle history reports centralized, encrypted on your account and reusable in your listings.",
        es: "Sus informes de historial de vehículos centralizados, cifrados en su cuenta y reutilizables en sus anuncios.",
        de: "Ihre Fahrzeughistorienberichte zentralisiert, kontoseitig verschlüsselt und in Ihren Anzeigen wiederverwendbar.",
      },
    "Rapports enregistrés": {
      en: "Saved reports",
      es: "Informes guardados",
      de: "Gespeicherte Berichte",
    },
    "Coffre vide": { en: "Empty vault", es: "Bóveda vacía", de: "Tresor leer" },
    "Déposez vos rapports CarVertical pour les réutiliser en un clic dans vos annonces.":
      {
        en: "Upload your CarVertical reports to reuse them in one click in your listings.",
        es: "Guarde sus informes CarVertical para reutilizarlos con un clic en sus anuncios.",
        de: "Hinterlegen Sie Ihre CarVertical-Berichte, um sie mit einem Klick in Ihren Anzeigen zu verwenden.",
      },
    "Ajouter un rapport": {
      en: "Add a report",
      es: "Añadir un informe",
      de: "Bericht hinzufügen",
    },
    "PDF ou lien CarVertical": {
      en: "PDF or CarVertical link",
      es: "PDF o enlace CarVertical",
      de: "PDF oder CarVertical-Link",
    },
    "Libellé du véhicule": {
      en: "Vehicle label",
      es: "Etiqueta del vehículo",
      de: "Fahrzeugbezeichnung",
    },
    Immatriculation: {
      en: "License plate",
      es: "Matrícula",
      de: "Kennzeichen",
    },
    "Note /10": { en: "Score /10", es: "Nota /10", de: "Bewertung /10" },
    VIN: { en: "VIN", es: "VIN", de: "FIN" },
    "Fichier PDF": { en: "PDF file", es: "Archivo PDF", de: "PDF-Datei" },
    "…ou lien direct": {
      en: "…or direct link",
      es: "…o enlace directo",
      de: "…oder direkter Link",
    },
    "Déposer dans le coffre": {
      en: "Add to vault",
      es: "Guardar en la bóveda",
      de: "Im Tresor speichern",
    },
    "Choisir un fichier": {
      en: "Choose a file",
      es: "Elegir un archivo",
      de: "Datei auswählen",
    },
    "Aucun fichier sélectionné": {
      en: "No file selected",
      es: "Ningún archivo seleccionado",
      de: "Keine Datei ausgewählt",
    },
    "Document personnel": {
      en: "Personal document",
      es: "Documento personal",
      de: "Persönliches Dokument",
    },
    "Rattaché à une annonce": {
      en: "Linked to a listing",
      es: "Vinculado a un anuncio",
      de: "Mit einer Anzeige verknüpft",
    },
    Ouvrir: { en: "Open", es: "Abrir", de: "Öffnen" },

    /* ── COTE & ESTIMATION ── */
    "Valeur marché calculée sur les annonces réelles de la plateforme.": {
      en: "Market value calculated on real listings from the platform.",
      es: "Valor de mercado calculado a partir de anuncios reales de la plataforma.",
      de: "Marktwert berechnet anhand realer Anzeigen auf der Plattform.",
    },
    "Estimer un véhicule": {
      en: "Estimate a vehicle",
      es: "Estimar un vehículo",
      de: "Fahrzeug schätzen",
    },
    "Basé sur les annonces vendeurs": {
      en: "Based on seller listings",
      es: "Basado en anuncios de vendedores",
      de: "Basierend auf Verkäuferanzeigen",
    },
    Marque: { en: "Make", es: "Marca", de: "Marke" },
    Modèle: { en: "Model", es: "Modelo", de: "Modell" },
    "Lancer l'estimation": {
      en: "Run the estimate",
      es: "Iniciar la estimación",
      de: "Schätzung starten",
    },
    Résultat: { en: "Result", es: "Resultado", de: "Ergebnis" },
    "Fourchette de marché": {
      en: "Market range",
      es: "Rango de mercado",
      de: "Marktspanne",
    },
    Fourchette: { en: "Range", es: "Rango", de: "Spanne" },
    Médiane: { en: "Median", es: "Mediana", de: "Median" },
    Moyenne: { en: "Average", es: "Promedio", de: "Durchschnitt" },
    Comparables: { en: "Comparables", es: "Comparables", de: "Vergleichbare" },
    "Aucune estimation": {
      en: "No estimate yet",
      es: "Sin estimación",
      de: "Keine Schätzung",
    },
    "Renseignez au minimum la marque pour obtenir une cote.": {
      en: "Enter at least the make to get a valuation.",
      es: "Indique al menos la marca para obtener una cotización.",
      de: "Geben Sie mindestens die Marke ein, um eine Bewertung zu erhalten.",
    },
    "Données insuffisantes": {
      en: "Insufficient data",
      es: "Datos insuficientes",
      de: "Unzureichende Daten",
    },
    "Pas assez d'annonces comparables sur la plateforme pour ce modèle.": {
      en: "Not enough comparable listings on the platform for this model.",
      es: "No hay suficientes anuncios comparables en la plataforma para este modelo.",
      de: "Nicht genügend vergleichbare Anzeigen auf der Plattform für dieses Modell.",
    },

    /* ── PRÉFÉRENCES ── */
    "Comportement de l'agent, alertes et affichage.": {
      en: "Agent behavior, alerts and display.",
      es: "Comportamiento del agente, alertas y visualización.",
      de: "Agent-Verhalten, Benachrichtigungen und Anzeige.",
    },
    "Agent & matching": {
      en: "Agent & matching",
      es: "Agente y emparejamiento",
      de: "Agent & Matching",
    },
    "Agent &amp; matching": {
      en: "Agent & matching",
      es: "Agente y emparejamiento",
      de: "Agent & Matching",
    },
    "Appliqué à chaque conversation": {
      en: "Applied to every conversation",
      es: "Aplicado a cada conversación",
      de: "Für jede Unterhaltung angewendet",
    },
    "Matching automatique": {
      en: "Automatic matching",
      es: "Emparejamiento automático",
      de: "Automatisches Matching",
    },
    "Lance la recherche de profils dès qu'une annonce est complète.": {
      en: "Starts searching for profiles as soon as a listing is complete.",
      es: "Inicia la búsqueda de perfiles tan pronto como un anuncio esté completo.",
      de: "Startet die Profilsuche, sobald eine Anzeige vollständig ist.",
    },
    "Masquer les véhicules vendus": {
      en: "Hide sold vehicles",
      es: "Ocultar vehículos vendidos",
      de: "Verkaufte Fahrzeuge ausblenden",
    },
    "Les annonces conclues disparaissent des résultats.": {
      en: "Completed listings disappear from results.",
      es: "Los anuncios concluidos desaparecen de los resultados.",
      de: "Abgeschlossene Anzeigen werden ausgeblendet.",
    },
    "Prioriser les annonces CarVertical": {
      en: "Prioritize CarVertical listings",
      es: "Priorizar anuncios CarVertical",
      de: "CarVertical-Anzeigen priorisieren",
    },
    "Les véhicules avec rapport passent en tête des résultats.": {
      en: "Vehicles with reports appear at the top of the results.",
      es: "Los vehículos con informe aparecen primeros en los resultados.",
      de: "Fahrzeuge mit Bericht stehen oben in den Ergebnissen.",
    },
    "Trier par compatibilité": {
      en: "Sort by compatibility",
      es: "Ordenar por compatibilidad",
      de: "Nach Kompatibilität sortieren",
    },
    "Classe les résultats par score de compatibilité plutôt que par date.": {
      en: "Ranks results by compatibility score rather than date.",
      es: "Clasifica los resultados por puntuación de compatibilidad en lugar de por fecha.",
      de: "Sortiert Ergebnisse nach Kompatibilität statt nach Datum.",
    },
    Alertes: { en: "Alerts", es: "Alertas", de: "Benachrichtigungen" },
    "Ce que vous souhaitez recevoir": {
      en: "What you want to receive",
      es: "Lo que desea recibir",
      de: "Was Sie erhalten möchten",
    },
    "Nouveau match": {
      en: "New match",
      es: "Nuevo emparejamiento",
      de: "Neuer Treffer",
    },
    "Un profil correspond à vos critères — coordonnées incluses.": {
      en: "A profile matches your criteria — contact details included.",
      es: "Un perfil coincide con sus criterios — datos de contacto incluidos.",
      de: "Ein Profil passt zu Ihren Kriterien — Kontaktdaten enthalten.",
    },
    "Nouveau message": {
      en: "New message",
      es: "Nuevo mensaje",
      de: "Neue Nachricht",
    },
    "Un acheteur ou vendeur vous contacte.": {
      en: "A buyer or seller is contacting you.",
      es: "Un comprador o vendedor se pone en contacto con usted.",
      de: "Ein Käufer oder Verkäufer kontaktiert Sie.",
    },
    "Baisse de prix": {
      en: "Price drop",
      es: "Bajada de precio",
      de: "Preissenkung",
    },
    "Un véhicule suivi change de prix.": {
      en: "A tracked vehicle has changed price.",
      es: "Un vehículo seguido cambia de precio.",
      de: "Ein beobachtetes Fahrzeug hat den Preis geändert.",
    },
    "Rappel agenda": {
      en: "Calendar reminder",
      es: "Recordatorio de agenda",
      de: "Kalendererinnerung",
    },
    "24h avant chaque rendez-vous.": {
      en: "24h before each appointment.",
      es: "24h antes de cada cita.",
      de: "24 Std. vor jedem Termin.",
    },
    "Actualité marché": {
      en: "Market news",
      es: "Actualidad del mercado",
      de: "Markt-News",
    },
    "Tendances et cote de votre modèle.": {
      en: "Trends and valuation for your model.",
      es: "Tendencias y cotización de su modelo.",
      de: "Trends und Bewertung Ihres Modells.",
    },
    "Affichage & région": {
      en: "Display & region",
      es: "Visualización y región",
      de: "Anzeige & Region",
    },
    "Affichage &amp; région": {
      en: "Display & region",
      es: "Visualización y región",
      de: "Anzeige & Region",
    },
    "Langue, devise, unités": {
      en: "Language, currency, units",
      es: "Idioma, moneda, unidades",
      de: "Sprache, Währung, Einheiten",
    },
    Langue: { en: "Language", es: "Idioma", de: "Sprache" },
    Devise: { en: "Currency", es: "Moneda", de: "Währung" },
    "Unité de distance": {
      en: "Distance unit",
      es: "Unidad de distancia",
      de: "Entfernungseinheit",
    },
    Kilomètres: { en: "Kilometers", es: "Kilómetros", de: "Kilometer" },
    Miles: { en: "Miles", es: "Millas", de: "Meilen" },
    "Rayon de recherche par défaut": {
      en: "Default search radius",
      es: "Radio de búsqueda predeterminado",
      de: "Standard-Suchradius",
    },
    Sombre: { en: "Dark", es: "Oscuro", de: "Dunkel" },
    Clair: { en: "Light", es: "Claro", de: "Hell" },
    "Enregistrer les préférences": {
      en: "Save preferences",
      es: "Guardar preferencias",
      de: "Einstellungen speichern",
    },
    Actif: { en: "Active", es: "Activo", de: "Aktiv" },

    /* ── SÉCURITÉ ── */
    "Mot de passe, double authentification et données.": {
      en: "Password, two-factor authentication and data.",
      es: "Contraseña, autenticación de dos factores y datos.",
      de: "Passwort, Zwei-Faktor-Authentifizierung und Daten.",
    },
    "Mot de passe": { en: "Password", es: "Contraseña", de: "Passwort" },
    "8 caractères minimum recommandés": {
      en: "8 characters minimum recommended",
      es: "Se recomiendan 8 caracteres mínimo",
      de: "Mindestens 8 Zeichen empfohlen",
    },
    "Mot de passe actuel": {
      en: "Current password",
      es: "Contraseña actual",
      de: "Aktuelles Passwort",
    },
    "Nouveau mot de passe": {
      en: "New password",
      es: "Nueva contraseña",
      de: "Neues Passwort",
    },
    Confirmation: { en: "Confirmation", es: "Confirmación", de: "Bestätigung" },
    "Mettre à jour": { en: "Update", es: "Actualizar", de: "Aktualisieren" },
    "Double authentification": {
      en: "Two-factor authentication",
      es: "Autenticación de dos factores",
      de: "Zwei-Faktor-Authentifizierung",
    },
    Activée: { en: "Enabled", es: "Activada", de: "Aktiviert" },
    Inactive: { en: "Disabled", es: "Inactiva", de: "Deaktiviert" },
    "Votre compte est protégé": {
      en: "Your account is protected",
      es: "Su cuenta está protegida",
      de: "Ihr Konto ist geschützt",
    },
    "Un des 3 codes de sécurité est demandé à chaque connexion, en plus du mot de passe.":
      {
        en: "One of 3 security codes is requested at each sign-in, along with your password.",
        es: "Se solicita uno de los 3 códigos de seguridad en cada inicio de sesión, además de la contraseña.",
        de: "Bei jeder Anmeldung wird neben dem Passwort einer der 3 Sicherheitscodes abgefragt.",
      },
    "Désactiver la 2FA": {
      en: "Disable 2FA",
      es: "Desactivar 2FA",
      de: "2FA deaktivieren",
    },
    "Scannez ce QR code dans Google Authenticator, Authy ou 1Password, puis saisissez le code généré.":
      {
        en: "Scan this QR code in Google Authenticator, Authy or 1Password, then enter the generated code.",
        es: "Escanee este código QR en Google Authenticator, Authy o 1Password, luego ingrese el código generado.",
        de: "Scannen Sie diesen QR-Code in Google Authenticator, Authy oder 1Password und geben Sie den generierten Code ein.",
      },
    "Clé manuelle": {
      en: "Manual key",
      es: "Clave manual",
      de: "Manueller Schlüssel",
    },
    "Code à 6 chiffres": {
      en: "6-digit code",
      es: "Código de 6 dígitos",
      de: "6-stelliger Code",
    },
    "Activer la 2FA": {
      en: "Enable 2FA",
      es: "Activar 2FA",
      de: "2FA aktivieren",
    },
    "Vos 3 codes de connexion": {
      en: "Your 3 backup codes",
      es: "Sus 3 códigos de conexión",
      de: "Ihre 3 Backup-Codes",
    },
    "J'ai noté": {
      en: "I noted them",
      es: "Los he anotado",
      de: "Habe ich notiert",
    },
    "Vos données": { en: "Your data", es: "Sus datos", de: "Ihre Daten" },
    "Portabilité RGPD": {
      en: "GDPR data portability",
      es: "Portabilidad RGPD",
      de: "DSGVO-Datenübertragbarkeit",
    },
    "Téléchargez l'ensemble de vos données (compte, annonces, favoris) au format JSON.":
      {
        en: "Download all your data (account, listings, favorites) in JSON format.",
        es: "Descargue todos sus datos (cuenta, anuncios, favoritos) en formato JSON.",
        de: "Laden Sie alle Ihre Daten (Konto, Anzeigen, Favoriten) im JSON-Format herunter.",
      },
    "Exporter mes données": {
      en: "Export my data",
      es: "Exportar mis datos",
      de: "Meine Daten exportieren",
    },

    /* ── SUPPORT & CENTRE D'AIDE ── */
    "Support & centre d'aide": {
      en: "Support & help center",
      es: "Soporte y centro de ayuda",
      de: "Support & Hilfezentrum",
    },
    "Support &amp; centre d'aide": {
      en: "Support & help center",
      es: "Soporte y centro de ayuda",
      de: "Support & Hilfezentrum",
    },
    "Une question ? L'équipe répond sous 24h ouvrées.": {
      en: "Have a question? Our team responds within 24 business hours.",
      es: "¿Una pregunta? El equipo responde en un plazo de 24 horas laborables.",
      de: "Eine Frage? Unser Team antwortet innerhalb von 24 Geschäftsstunden.",
    },
    "Contacter le support": {
      en: "Contact support",
      es: "Contactar con soporte",
      de: "Support kontaktieren",
    },
    "Ticket enregistré et suivi": {
      en: "Ticket logged and tracked",
      es: "Ticket registrado y seguido",
      de: "Ticket erfasst und verfolgt",
    },
    Catégorie: { en: "Category", es: "Categoría", de: "Kategorie" },
    "Question générale": {
      en: "General question",
      es: "Pregunta general",
      de: "Allgemeine Frage",
    },
    "Problème sur une annonce": {
      en: "Issue with a listing",
      es: "Problema con un anuncio",
      de: "Problem mit einer Anzeige",
    },
    "Matching / mise en relation": {
      en: "Matching / connection",
      es: "Emparejamiento / conexión",
      de: "Matching / Vermittlung",
    },
    "Compte & sécurité": {
      en: "Account & security",
      es: "Cuenta y seguridad",
      de: "Konto & Sicherheit",
    },
    "Compte &amp; sécurité": {
      en: "Account & security",
      es: "Cuenta y seguridad",
      de: "Konto & Sicherheit",
    },
    "Bug technique": {
      en: "Technical bug",
      es: "Error técnico",
      de: "Technischer Fehler",
    },
    Sujet: { en: "Subject", es: "Asunto", de: "Betreff" },
    Message: { en: "Message", es: "Mensaje", de: "Nachricht" },
    "Envoyer la demande": {
      en: "Send request",
      es: "Enviar solicitud",
      de: "Anfrage senden",
    },
    "Questions fréquentes": {
      en: "Frequently asked questions",
      es: "Preguntas frecuentes",
      de: "Häufige Fragen",
    },
    "Réponses immédiates": {
      en: "Instant answers",
      es: "Respuestas inmediatas",
      de: "Sofortige Antworten",
    },
    "Comment publier une annonce ?": {
      en: "How to publish a listing?",
      es: "¿Cómo publicar un anuncio?",
      de: "Wie veröffentliche ich eine Anzeige?",
    },
    "Depuis le chat, décrivez votre véhicule à l'AiGENT. Une fois les critères complets, le récapitulatif s'affiche : validez-le pour publier et lancer le matching.":
      {
        en: "From the chat, describe your vehicle to the AiGENT. Once the criteria are complete, the summary is displayed: validate it to publish and start matching.",
        es: "Desde el chat, describa su vehículo al AiGENT. Una vez completos los criterios, se muestra el resumen: valídelo para publicar e iniciar el emparejamiento.",
        de: "Beschreiben Sie Ihr Fahrzeug im Chat dem AiGENT. Sobald die Kriterien vollständig sind, erscheint die Zusammenfassung: Bestätigen Sie diese, um zu veröffentlichen und das Matching zu starten.",
      },
    "À quoi sert le rapport CarVertical ?": {
      en: "What is the CarVertical report for?",
      es: "¿Para qué sirve el informe CarVertical?",
      de: "Wozu dient der CarVertical-Bericht?",
    },
    "Il atteste l'historique du véhicule (kilométrage, sinistres, import). Une annonce accompagnée d'un rapport est mise en avant auprès des acheteurs.":
      {
        en: "It verifies the vehicle history (mileage, accidents, import). A listing with a report is highlighted to buyers.",
        es: "Certifica el historial del vehículo (kilometraje, siniestros, importación). Un anuncio con informe se destaca ante los compradores.",
        de: "Er belegt die Fahrzeughistorie (Kilometerstand, Schäden, Import). Eine Anzeige mit Bericht wird für Käufer hervorgehoben.",
      },
    "Comment fonctionne le matching ?": {
      en: "How does matching work?",
      es: "¿Cómo funciona el emparejamiento?",
      de: "Wie funktioniert das Matching?",
    },
    "L'agent compare vos critères (modèle, budget, énergie, état, distance) à ceux des profils inverses et calcule un score de compatibilité.":
      {
        en: "The agent compares your criteria (model, budget, fuel, condition, distance) to opposite profiles and calculates a compatibility score.",
        es: "El agente compara sus criterios (modelo, presupuesto, combustible, estado, distancia) con los de los perfiles opuestos y calcula una puntuación de compatibilidad.",
        de: "Der Agent vergleicht Ihre Kriterien (Modell, Budget, Kraftstoff, Zustand, Entfernung) mit Gegenprofilen und berechnet einen Kompatibilitätswert.",
      },
    "Puis-je supprimer une annonce publiée ?": {
      en: "Can I delete a published listing?",
      es: "¿Puedo eliminar un anuncio publicado?",
      de: "Kann ich eine veröffentlichte Anzeige löschen?",
    },
    "Oui, depuis l'onglet Mes annonces. La suppression est définitive et retire la conversation du matching.":
      {
        en: "Yes, from the My listings tab. Deletion is permanent and removes the conversation from matching.",
        es: "Sí, desde la pestaña Mis anuncios. La eliminación es definitiva y retira la conversación del emparejamiento.",
        de: "Ja, im Reiter Meine Anzeigen. Die Löschung ist dauerhaft und entfernt die Unterhaltung aus dem Matching.",
      },
    "Mes tickets": { en: "My tickets", es: "Mis tickets", de: "Meine Tickets" },
    Historique: { en: "History", es: "Historial", de: "Verlauf" },
    "Aucun ticket": {
      en: "No tickets",
      es: "Ningún ticket",
      de: "Keine Tickets",
    },
    "Vos demandes apparaîtront ici.": {
      en: "Your requests will appear here.",
      es: "Sus solicitudes aparecerán aquí.",
      de: "Ihre Anfragen werden hier angezeigt.",
    },
    "En cours": { en: "In progress", es: "En curso", de: "In Bearbeitung" },
    Résolu: { en: "Resolved", es: "Resuelto", de: "Gelöst" },

    /* ── ZONE CRITIQUE ── */
    "Actions irréversibles. Lisez attentivement avant de valider.": {
      en: "Irreversible actions. Read carefully before confirming.",
      es: "Acciones irreversibles. Lea atentamente antes de confirmar.",
      de: "Unwiderrufliche Aktionen. Bitte vor Bestätigung sorgfältig lesen.",
    },
    "Actions destructrices": {
      en: "Destructive actions",
      es: "Acciones destructivas",
      de: "Zerstörerische Aktionen",
    },
    "Confirmation requise": {
      en: "Confirmation required",
      es: "Confirmación requerida",
      de: "Bestätigung erforderlich",
    },
    "Réinitialiser mon profil AiGENT": {
      en: "Reset my AiGENT profile",
      es: "Restablecer mi perfil AiGENT",
      de: "Mein AiGENT-Profil zurücksetzen",
    },
    "Efface vos annonces et remet l'agent à zéro. Le compte est conservé.": {
      en: "Erases your listings and resets the agent to zero. The account is kept.",
      es: "Borra sus anuncios y reinicia el agente a cero. La cuenta se conserva.",
      de: "Löscht Ihre Anzeigen und setzt den Agenten zurück. Das Konto bleibt erhalten.",
    },
    Réinitialiser: { en: "Reset", es: "Restablecer", de: "Zurücksetzen" },
    "Supprimer toutes mes données": {
      en: "Delete all my data",
      es: "Eliminar todos mis datos",
      de: "Alle meine Daten löschen",
    },
    "Annonces, favoris et messages sont définitivement supprimés.": {
      en: "Listings, favorites and messages will be permanently deleted.",
      es: "Anuncios, favoritos y mensajes serán eliminados definitivamente.",
      de: "Anzeigen, Favoriten und Nachrichten werden dauerhaft gelöscht.",
    },
    "Supprimer les données": {
      en: "Delete data",
      es: "Eliminar datos",
      de: "Daten löschen",
    },
    "Supprimer mon compte": {
      en: "Delete my account",
      es: "Eliminar mi cuenta",
      de: "Mein Konto löschen",
    },
    "Suppression totale du compte et déconnexion immédiate.": {
      en: "Total account deletion and immediate log out.",
      es: "Eliminación total de la cuenta y cierre de sesión inmediato.",
      de: "Vollständige Kontolöschung und sofortige Abmeldung.",
    },
    "Supprimer le compte": {
      en: "Delete account",
      es: "Eliminar cuenta",
      de: "Konto löschen",
    },

    /* ── MODALS, DIALOGUES & CONFIRMATIONS ── */
    "Choisir un avatar": {
      en: "Choose an avatar",
      es: "Elegir un avatar",
      de: "Avatar wählen",
    },
    Annuler: { en: "Cancel", es: "Cancelar", de: "Abbrechen" },
    Confirmer: { en: "Confirm", es: "Confirmar", de: "Bestätigen" },
    "Réinitialiser le profil AiGENT ?": {
      en: "Reset AiGENT profile?",
      es: "¿Restablecer perfil AiGENT?",
      de: "AiGENT-Profil zurücksetzen?",
    },
    "Vos annonces seront effacées et l'agent repartira de zéro. Votre compte reste actif.":
      {
        en: "Your listings will be deleted and the agent will start from scratch. Your account remains active.",
        es: "Se borrarán sus anuncios y el agente empezará de cero. Su cuenta permanece activa.",
        de: "Ihre Anzeigen werden gelöscht und der Agent startet von vorne. Ihr Konto bleibt aktiv.",
      },
    "Supprimer toutes vos données ?": {
      en: "Delete all your data?",
      es: "¿Eliminar todos sus datos?",
      de: "Alle Ihre Daten löschen?",
    },
    "Supprimer définitivement le compte ?": {
      en: "Permanently delete account?",
      es: "¿Eliminar definitivamente la cuenta?",
      de: "Konto endgültig löschen?",
    },
    "Cette action est irréversible : compte, annonces et historique seront effacés.":
      {
        en: "This action is irreversible: account, listings and history will be deleted.",
        es: "Esta acción es irreversible: cuenta, anuncios e historial serán eliminados.",
        de: "Diese Aktion ist unwiderruflich: Konto, Anzeigen und Verlauf werden gelöscht.",
      },
    "Tapez RESET pour confirmer": {
      en: "Type RESET to confirm",
      es: "Escriba RESET para confirmar",
      de: "Geben Sie RESET ein, um zu bestätigen",
    },
    "Tapez SUPPRIMER pour confirmer": {
      en: "Type SUPPRIMER to confirm",
      es: "Escriba SUPPRIMER para confirmar",
      de: "Geben Sie SUPPRIMER ein, um zu bestätigen",
    },

    /* ── TOASTS & MESSAGES SYSTÈME ── */
    "Avatar mis à jour": {
      en: "Avatar updated",
      es: "Avatar actualizado",
      de: "Avatar aktualisiert",
    },
    "Contact requis": {
      en: "Contact required",
      es: "Contacto requerido",
      de: "Kontakt erforderlich",
    },
    "Contact enregistré": {
      en: "Contact saved",
      es: "Contacto guardado",
      de: "Kontakt gespeichert",
    },
    "Ville enregistrée": {
      en: "City saved",
      es: "Ciudad guardada",
      de: "Stadt gespeichert",
    },
    "Annonce supprimée": {
      en: "Listing deleted",
      es: "Anuncio eliminado",
      de: "Anzeige gelöscht",
    },
    "Titre et date requis": {
      en: "Title and date required",
      es: "Título y fecha requeridos",
      de: "Titel und Datum erforderlich",
    },
    "Évènement ajouté": {
      en: "Event added",
      es: "Evento añadido",
      de: "Ereignis hinzugefügt",
    },
    "Évènement mis à jour": {
      en: "Event updated",
      es: "Evento actualizado",
      de: "Ereignis aktualisiert",
    },
    "Évènement supprimé": {
      en: "Event deleted",
      es: "Evento eliminado",
      de: "Ereignis gelöscht",
    },
    "Document retiré": {
      en: "Document removed",
      es: "Documento eliminado",
      de: "Dokument entfernt",
    },
    "Libellé requis": {
      en: "Label required",
      es: "Etiqueta requerida",
      de: "Bezeichnung erforderlich",
    },
    "Ajoutez un fichier ou un lien": {
      en: "Add a file or a link",
      es: "Añada un archivo o un enlace",
      de: "Fügen Sie eine Datei oder einen Link hinzu",
    },
    "Rapport ajouté au coffre": {
      en: "Report added to vault",
      es: "Informe añadido a la bóveda",
      de: "Bericht zum Tresor hinzugefügt",
    },
    "Marque requise": {
      en: "Make required",
      es: "Marca requerida",
      de: "Marke erforderlich",
    },
    "Préférences enregistrées": {
      en: "Preferences saved",
      es: "Preferencias guardadas",
      de: "Einstellungen gespeichert",
    },
    "Remplissez tous les champs": {
      en: "Please fill in all fields",
      es: "Complete todos los campos",
      de: "Bitte alle Felder ausfüllen",
    },
    "8 caractères minimum": {
      en: "8 characters minimum",
      es: "8 caracteres mínimo",
      de: "Mindestens 8 Zeichen",
    },
    "La confirmation ne correspond pas": {
      en: "Confirmation does not match",
      es: "La confirmación no coincide",
      de: "Bestätigung stimmt nicht überein",
    },
    "Mot de passe mis à jour": {
      en: "Password updated",
      es: "Contraseña actualizada",
      de: "Passwort aktualisiert",
    },
    "2FA activée": {
      en: "2FA enabled",
      es: "2FA activada",
      de: "2FA aktiviert",
    },
    "2FA désactivée": {
      en: "2FA disabled",
      es: "2FA desactivada",
      de: "2FA deaktiviert",
    },
    "Code à 6 chiffres requis": {
      en: "6-digit code required",
      es: "Código de 6 dígitos requerido",
      de: "6-stelliger Code erforderlich",
    },
    "Export téléchargé": {
      en: "Export downloaded",
      es: "Exportación descargada",
      de: "Export heruntergeladen",
    },
    "Sujet et message (10 caractères min.) requis": {
      en: "Subject and message (10 characters min.) required",
      es: "Asunto y mensaje (10 caracteres mín.) requeridos",
      de: "Betreff und Nachricht (mind. 10 Zeichen) erforderlich",
    },
    "Profil réinitialisé": {
      en: "Profile reset",
      es: "Perfil restablecido",
      de: "Profil zurückgesetzt",
    },
    "Données supprimées": {
      en: "Data deleted",
      es: "Datos eliminados",
      de: "Daten gelöscht",
    },
    "Compte supprimé": {
      en: "Account deleted",
      es: "Cuenta eliminada",
      de: "Konto gelöscht",
    },
    "Session expirée": {
      en: "Session expired",
      es: "Sesión expirada",
      de: "Sitzung abgelaufen",
    },
    Erreur: { en: "Error", es: "Error", de: "Fehler" },
    "Aucune notification": {
      en: "No notifications",
      es: "Sin notificaciones",
      de: "Keine Benachrichtigungen",
    },
    "Vous êtes à jour.": {
      en: "You are up to date.",
      es: "Está al día.",
      de: "Sie sind auf dem neuesten Stand.",
    },
  };

  /* ── TRADUCTIONS DES PLACEHOLDERS ── */
  const PH_DICT = {
    "vous@email.fr": {
      en: "you@email.com",
      es: "usted@email.es",
      de: "sie@email.de",
    },
    Lyon: {
      en: "London, Paris…",
      es: "Madrid, Barcelona…",
      de: "Berlin, München…",
    },
    "Essai Peugeot 208": {
      en: "Test drive Peugeot 208",
      es: "Prueba Peugeot 208",
      de: "Probefahrt Peugeot 208",
    },
    "Adresse, contact, points à vérifier…": {
      en: "Address, contact, points to check…",
      es: "Dirección, contacto, puntos a comprobar…",
      de: "Adresse, Kontakt, Prüfpunkte…",
    },
    "Peugeot 208 — 2019": {
      en: "Peugeot 208 — 2019",
      es: "Peugeot 208 — 2019",
      de: "Peugeot 208 — 2019",
    },
    "AB-123-CD": { en: "AB-123-CD", es: "1234-BCD", de: "B-AB 1234" },
    VF3XXXXXXXXXXXXXX: {
      en: "VF3XXXXXXXXXXXXXX",
      es: "VF3XXXXXXXXXXXXXX",
      de: "VF3XXXXXXXXXXXXXX",
    },
    "https://carvertical.com/…": {
      en: "https://carvertical.com/…",
      es: "https://carvertical.com/…",
      de: "https://carvertical.com/…",
    },
    Peugeot: { en: "Peugeot", es: "Peugeot", de: "Peugeot" },
    208: { en: "208", es: "208", de: "208" },
    2019: { en: "2019", es: "2019", de: "2019" },
    80000: { en: "80000", es: "80000", de: "80000" },
    "Résumé en une ligne": {
      en: "One-line summary",
      es: "Resumen en una línea",
      de: "Zusammenfassung in einer Zeile",
    },
    "Décrivez précisément votre situation…": {
      en: "Describe your situation in detail…",
      es: "Describa detalladamente su situación…",
      de: "Beschreiben Sie Ihre Situation genau…",
    },
    SUPPRIMER: { en: "SUPPRIMER", es: "SUPPRIMER", de: "SUPPRIMER" },
    RESET: { en: "RESET", es: "RESET", de: "RESET" },
    "000000": { en: "000000", es: "000000", de: "000000" },
  };

  function getCachedPrefs() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function setCachedPrefs(p) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    } catch {}
  }

  const cached = getCachedPrefs();
  let currentLang = cached.langue || "fr";
  let currentCurrency = cached.devise || "EUR";
  let currentUnit = cached.unite || "km";

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "SVG", "CODE", "TITLE"]);
  const CUR_WORD = {
    EUR: "Euro",
    USD: "Dollar",
    GBP: "Livre sterling",
    CHF: "Franc suisse",
  };

  /* ── Sous-fonctions dynamiques : chacune reçoit le texte ORIGINAL (FR)
   et renvoie soit une chaîne traduite, soit null si elle ne s'applique pas. ── */
  function dynPlural(key, re, en, es, de) {
    const m = key.match(re);
    if (!m) return null;
    const num = m[0].match(/\d+/)[0];
    const plur = Number(num) > 1;
    return { en: en(num, plur), es: es(num, plur), de: de(num, plur) };
  }

  function translateDynamic(key, lang) {
    let out;

    out = dynPlural(
      key,
      /^\d+\s+annonce(s?)\s+affichée(s?)$/i,
      (n, p) => `${n} listing${p ? "s" : ""} displayed`,
      (n, p) => `${n} anuncio${p ? "s" : ""} mostrado${p ? "s" : ""}`,
      (n, p) => `${n} Anzeige${p ? "n" : ""} angezeigt`,
    );
    if (out) return out[lang];

    out = dynPlural(
      key,
      /^\d+\s+évènement(s?)\s+enregistré(s?)$/i,
      (n, p) => `${n} event${p ? "s" : ""} recorded`,
      (n, p) => `${n} evento${p ? "s" : ""} registrado${p ? "s" : ""}`,
      (n, p) => `${n} Ereignis${p ? "se" : ""} erfasst`,
    );
    if (out) return out[lang];

    out = dynPlural(
      key,
      /^\d+\s+jours?\s+analysés?$/i,
      (n, p) => `${n} day${p ? "s" : ""} analyzed`,
      (n, p) => `${n} día${p ? "s" : ""} analizado${p ? "s" : ""}`,
      (n, p) => `${n} Tag${p ? "e" : ""} analysiert`,
    );
    if (out) return out[lang];

    out = dynPlural(
      key,
      /^\d+\s+document(s?)$/i,
      (n, p) => `${n} document${p ? "s" : ""}`,
      (n, p) => `${n} documento${p ? "s" : ""}`,
      (n, p) => `${n} Dokument${p ? "e" : ""}`,
    );
    if (out) return out[lang];

    if (/^Membre depuis /i.test(key)) {
      const rest = key.replace(/^Membre depuis /i, "");
      return {
        en: `Member since ${rest}`,
        es: `Miembro desde ${rest}`,
        de: `Mitglied seit ${rest}`,
      }[lang];
    }

    if (/mis à jour le /i.test(key)) {
      return {
        en: key.replace(/mis à jour le /gi, "updated on "),
        es: key.replace(/mis à jour le /gi, "actualizado el "),
        de: key.replace(/mis à jour le /gi, "aktualisiert am "),
      }[lang];
    }

    if (/^Tapez (.+) pour confirmer$/i.test(key)) {
      const word = key.match(/^Tapez (.+) pour confirmer$/i)[1];
      return {
        en: `Type ${word} to confirm`,
        es: `Escriba ${word} para confirmar`,
        de: `Geben Sie ${word} ein, um zu bestätigen`,
      }[lang];
    }

    if (/^Force\s*:\s*(.+)$/i.test(key)) {
      const rawForce = key.match(/^Force\s*:\s*(.+)$/i)[1].trim();
      const forceMap = {
        "—": { en: "—", es: "—", de: "—" },
        faible: { en: "weak", es: "débil", de: "schwach" },
        moyenne: { en: "medium", es: "media", de: "mittel" },
        bonne: { en: "good", es: "buena", de: "gut" },
        excellente: { en: "strong", es: "excelente", de: "stark" },
      };
      const tf = forceMap[rawForce]?.[lang] || rawForce;
      return {
        en: `Strength: ${tf}`,
        es: `Fuerza: ${tf}`,
        de: `Stärke: ${tf}`,
      }[lang];
    }

    return null;
  }

  /** Traduit une chaîne d'origine (FR) vers la langue active. Renvoie la chaîne
   *  d'origine si la langue est FR ou si rien ne correspond (jamais de "trou"). */
  function translateString(raw) {
    if (currentLang === "fr" || !raw) return raw;
    const lead = raw.match(/^\s*/)[0];
    const trail = raw.match(/\s*$/)[0];
    const key = raw.trim();

    if (DICT[key] && DICT[key][currentLang]) {
      return lead + DICT[key][currentLang] + trail;
    }
    const dyn = translateDynamic(key, currentLang);
    if (dyn) return lead + dyn + trail;
    return raw;
  }

  /* ── Devise & unité : la base est TOUJOURS le texte français d'origine
   (auteur en EUR / km), donc la conversion part toujours de la même source,
   quelle que soit la langue déjà appliquée par-dessus. ── */
  const PRICE_RE = /(-?\d[\d\s\u202f.,]*)\s?€/g;
  const KM_RE = /(-?\d[\d\s\u202f.,]*)\s?km\b/g;

  function parseFrNumber(s) {
    return parseFloat(
      s
        .replace(/[\s\u202f]/g, "")
        .replace(/\./g, "")
        .replace(",", "."),
    );
  }

  function convertPriceText(raw) {
    if (currentCurrency === "EUR") return raw;
    return raw.replace(PRICE_RE, (m, numStr) => {
      const n = parseFrNumber(numStr);
      if (isNaN(n)) return m;
      const converted = Math.round(n * (RATES_FROM_EUR[currentCurrency] || 1));
      const sym = CUR_SYMBOL[currentCurrency] || currentCurrency;
      return currentCurrency === "USD"
        ? `${sym}${converted.toLocaleString("en-US")}`
        : `${converted.toLocaleString("fr-FR")} ${sym}`;
    });
  }

  function convertDistanceText(raw) {
    if (currentUnit === "km") return raw;
    return raw.replace(KM_RE, (m, numStr) => {
      const n = parseFrNumber(numStr);
      if (isNaN(n)) return m;
      const mi = Math.round(n * KM_TO_MI);
      return `${mi.toLocaleString("fr-FR")} mi`;
    });
  }

  /** Pipeline unique : traduction PUIS conversion devise/unité, toujours à
   *  partir du même texte de référence figé (_occasBase). Déterministe,
   *  peu importe l'ordre des changements de préférences. */
  function renderTextNode(node) {
    if (node._occasBase === undefined) node._occasBase = node.nodeValue;
    const base = node._occasBase;
    if (!base || !base.trim()) return;

    let out = translateString(base);
    out = convertPriceText(out);
    out = convertDistanceText(out);
    if (node.nodeValue !== out) node.nodeValue = out;
  }

  function translateInputs(root) {
    root.querySelectorAll?.("input, textarea").forEach((el) => {
      const ph = el.getAttribute("placeholder");
      if (!ph) return;
      if (!el._occasOrigPh) el._occasOrigPh = ph;
      const entry = PH_DICT[el._occasOrigPh] || DICT[el._occasOrigPh];
      const val =
        currentLang === "fr"
          ? el._occasOrigPh
          : entry?.[currentLang] || el._occasOrigPh;
      el.setAttribute("placeholder", val);
    });

    root.querySelectorAll?.("option").forEach((opt) => {
      if (!opt._occasOrigText) opt._occasOrigText = opt.textContent.trim();
      const entry = DICT[opt._occasOrigText];
      opt.textContent =
        currentLang === "fr"
          ? opt._occasOrigText
          : entry?.[currentLang] || opt._occasOrigText;
    });
  }

  function walkAll(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim())
          return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) renderTextNode(n);

    translateInputs(root);

    root.querySelectorAll?.("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      let out = translateString(key);
      out = convertPriceText(out);
      out = convertDistanceText(out);
      el.textContent = out;
    });
    root.querySelectorAll?.("[data-i18n-ph]").forEach((el) => {
      const key = el.getAttribute("data-i18n-ph");
      const entry = PH_DICT[key] || DICT[key];
      el.placeholder = currentLang === "fr" ? key : entry?.[currentLang] || key;
    });
  }

  function applyToDocument() {
    if (!document.body) return;
    walkAll(document.body);
    document.documentElement.lang = currentLang;
  }

  let scheduled = false;
  function scheduleApply() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyToDocument();
    });
  }

  function boot() {
    applyToDocument();
    const observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  function formatPrice(n) {
    if (n == null || n === "") return "";
    const converted = Math.round(
      Number(n) * (RATES_FROM_EUR[currentCurrency] || 1),
    );
    const sym = CUR_SYMBOL[currentCurrency] || "€";
    return currentCurrency === "USD"
      ? `${sym}${converted.toLocaleString("en-US")}`
      : `${converted.toLocaleString("fr-FR")} ${sym}`;
  }

  function formatDistance(km) {
    if (km == null || km === "") return "";
    if (currentUnit === "mi")
      return `${Math.round(km * KM_TO_MI).toLocaleString("fr-FR")} mi`;
    return `${Math.round(km).toLocaleString("fr-FR")} km`;
  }

  function t(key) {
    if (currentLang === "fr") return key;
    return DICT[key]?.[currentLang] || key;
  }

  window.OccasPrefs = {
    applyLanguage(lang) {
      currentLang = lang || "fr";
      setCachedPrefs({ ...getCachedPrefs(), langue: currentLang });
      scheduleApply();
    },
    applyCurrency(cur) {
      currentCurrency = cur || "EUR";
      setCachedPrefs({ ...getCachedPrefs(), devise: currentCurrency });
      scheduleApply();
    },
    applyUnit(unit) {
      currentUnit = unit || "km";
      setCachedPrefs({ ...getCachedPrefs(), unite: currentUnit });
      scheduleApply();
    },
    applyAll(prefs) {
      if (!prefs) return;
      if (prefs.langue) currentLang = prefs.langue;
      if (prefs.devise) currentCurrency = prefs.devise;
      if (prefs.unite) currentUnit = prefs.unite;
      setCachedPrefs({
        langue: currentLang,
        devise: currentCurrency,
        unite: currentUnit,
      });
      scheduleApply();
    },
    t,
    formatPrice,
    formatDistance,
    get lang() {
      return currentLang;
    },
    get currency() {
      return currentCurrency;
    },
    get unit() {
      return currentUnit;
    },
  };
})();
