/**
 * i18n-emploi.js — Mon AiGENT Emploi · Langue / Devise / Unité
 *
 * Doit être chargé AVANT profil-emploi.js (et avant tout autre script de
 * page Emploi). Expose `window.EmploiPrefs` avec l'API déjà attendue par
 * profil-emploi.js :
 *
 *   EmploiPrefs.applyAll(prefs)        → applique langue + devise + unité
 *                                         + <html lang> en une fois (appelé
 *                                         au chargement des préférences)
 *   EmploiPrefs.applyLanguage(lang)    → change juste la langue
 *   EmploiPrefs.applyCurrency(devise)  → change juste la devise
 *   EmploiPrefs.applyUnit(unite)       → change juste l'unité de distance
 *   EmploiPrefs.t(key)                 → traduction courte par clé
 *   EmploiPrefs.formatPrice(n)         → n (EUR) formaté dans la devise active
 *   EmploiPrefs.formatDistance(km)     → km formaté dans l'unité active
 *
 * PRINCIPE DE TRADUCTION (sans toucher au HTML) :
 * Un dictionnaire FR/EN/ES/DE de tous les libellés fixes de l'app est
 * construit une fois. Chaque chaîne, dans N'IMPORTE QUELLE des 4 langues,
 * pointe vers le même enregistrement. Un TreeWalker parcourt les noeuds de
 * texte du document, retrouve les correspondances exactes (après trim) et
 * les remplace par la langue cible — dans n'importe quel sens (fr→en,
 * en→es, etc.), sans jamais perdre le texte source. Un MutationObserver
 * retraduit automatiquement tout ce que profil-emploi.js insère dans le
 * DOM après coup (listes d'annonces, préférences, notifications...), donc
 * aucune modification du HTML ni de profil-emploi.js n'est nécessaire.
 *
 * Pour l'étendre à une autre page Emploi : inclure ce même fichier et
 * ajouter les nouvelles chaînes de cette page au tableau STRINGS.
 */
(function () {
  "use strict";

  /* ═══════════════════ 1. DICTIONNAIRE ═══════════════════
     Chaque ligne : { fr, en, es, de, key? }
     `key` optionnel = identifiant stable pour EmploiPrefs.t(key). */
  const STRINGS = [
    // ── Marque / structure ──
    { key: "brand.sub", fr: "Emploi", en: "Jobs", es: "Empleo", de: "Jobs" },
    { fr: "Profil", en: "Profile", es: "Perfil", de: "Profil" },
    {
      fr: "Retour au chat",
      en: "Back to chat",
      es: "Volver al chat",
      de: "Zurück zum Chat",
    },
    { fr: "Déconnexion", en: "Log out", es: "Cerrar sesión", de: "Abmelden" },

    // ── Nav groupes ──
    { fr: "Compte", en: "Account", es: "Cuenta", de: "Konto" },
    {
      fr: "Candidature",
      en: "Application",
      es: "Candidatura",
      de: "Bewerbung",
    },

    // ── Nav items ──
    {
      key: "nav.identite",
      fr: "Identité",
      en: "Identity",
      es: "Identidad",
      de: "Identität",
    },
    {
      key: "nav.annonces",
      fr: "Mes annonces",
      en: "My listings",
      es: "Mis anuncios",
      de: "Meine Anzeigen",
    },
    {
      key: "nav.agenda",
      fr: "Agenda",
      en: "Calendar",
      es: "Agenda",
      de: "Kalender",
    },
    {
      key: "nav.activite",
      fr: "Activité",
      en: "Activity",
      es: "Actividad",
      de: "Aktivität",
    },
    {
      key: "nav.coffre",
      fr: "Coffre CV & lettres",
      en: "CV & cover letter vault",
      es: "Caja fuerte de CV y cartas",
      de: "CV- & Anschreiben-Tresor",
    },
    {
      key: "nav.diagnostic",
      fr: "Diagnostic marché",
      en: "Market diagnostic",
      es: "Diagnóstico de mercado",
      de: "Marktdiagnose",
    },
    {
      key: "nav.preferences",
      fr: "Préférences",
      en: "Preferences",
      es: "Preferencias",
      de: "Einstellungen",
    },
    {
      key: "nav.securite",
      fr: "Sécurité",
      en: "Security",
      es: "Seguridad",
      de: "Sicherheit",
    },
    {
      key: "nav.support",
      fr: "Support & aide",
      en: "Support & help",
      es: "Soporte y ayuda",
      de: "Support & Hilfe",
    },
    {
      key: "nav.zone",
      fr: "Zone critique",
      en: "Danger zone",
      es: "Zona crítica",
      de: "Kritischer Bereich",
    },

    // ── Hero / identité ──
    { fr: "Candidat", en: "Candidate", es: "Candidato", de: "Kandidat" },
    {
      fr: "Recruteur",
      en: "Recruiter",
      es: "Reclutador",
      de: "Personalvermittler",
    },
    { fr: "2FA active", en: "2FA on", es: "2FA activa", de: "2FA aktiv" },
    {
      fr: "2FA inactive",
      en: "2FA off",
      es: "2FA inactiva",
      de: "2FA inaktiv",
    },
    {
      fr: "Zone non renseignée",
      en: "No area set",
      es: "Zona no indicada",
      de: "Kein Gebiet angegeben",
    },
    { fr: "Annonces", en: "Listings", es: "Anuncios", de: "Anzeigen" },
    { fr: "Favoris", en: "Favorites", es: "Favoritos", de: "Favoriten" },
    {
      fr: "Échanges",
      en: "Conversations",
      es: "Intercambios",
      de: "Austausche",
    },

    {
      fr: "Informations personnelles",
      en: "Personal information",
      es: "Información personal",
      de: "Persönliche Informationen",
    },
    {
      fr: "Synchronisées avec votre compte",
      en: "Synced with your account",
      es: "Sincronizadas con tu cuenta",
      de: "Mit deinem Konto synchronisiert",
    },
    {
      fr: "Identifiant",
      en: "Username",
      es: "Identificador",
      de: "Benutzername",
    },
    {
      fr: "L'identifiant est définitif et sert à la connexion.",
      en: "Your username is permanent and used to log in.",
      es: "El identificador es definitivo y sirve para iniciar sesión.",
      de: "Der Benutzername ist endgültig und dient zur Anmeldung.",
    },
    {
      fr: "Email / téléphone de contact",
      en: "Contact email / phone",
      es: "Email / teléfono de contacto",
      de: "E-Mail / Telefon",
    },
    {
      fr: "Ville / zone de référence",
      en: "City / reference area",
      es: "Ciudad / zona de referencia",
      de: "Stadt / Referenzgebiet",
    },
    {
      fr: "Utilisée pour le rayon de recherche et le matching.",
      en: "Used for the search radius and matching.",
      es: "Usada para el radio de búsqueda y el matching.",
      de: "Wird für den Suchradius und das Matching verwendet.",
    },
    { fr: "Enregistrer", en: "Save", es: "Guardar", de: "Speichern" },

    {
      fr: "Aperçu du compte",
      en: "Account overview",
      es: "Resumen de la cuenta",
      de: "Kontoübersicht",
    },
    {
      fr: "Vos 14 derniers jours",
      en: "Your last 14 days",
      es: "Tus últimos 14 días",
      de: "Deine letzten 14 Tage",
    },
    {
      fr: "Temps total",
      en: "Total time",
      es: "Tiempo total",
      de: "Gesamtzeit",
    },
    {
      fr: "Jours actifs",
      en: "Active days",
      es: "Días activos",
      de: "Aktive Tage",
    },
    {
      fr: "Voir l'activité détaillée",
      en: "View detailed activity",
      es: "Ver actividad detallada",
      de: "Detaillierte Aktivität ansehen",
    },

    // ── Mes annonces ──
    {
      fr: "Chaque publication (candidature ou offre) confirmée depuis le tunnel de discussion.",
      en: "Every listing (application or job offer) confirmed via the chat flow.",
      es: "Cada publicación (candidatura u oferta) confirmada desde el flujo de chat.",
      de: "Jede über den Chat-Flow bestätigte Anzeige (Bewerbung oder Angebot).",
    },
    {
      fr: "Historique de publications",
      en: "Publishing history",
      es: "Historial de publicaciones",
      de: "Veröffentlichungsverlauf",
    },
    { fr: "Toutes", en: "All", es: "Todas", de: "Alle" },
    {
      fr: "Candidatures",
      en: "Applications",
      es: "Candidaturas",
      de: "Bewerbungen",
    },
    { fr: "Offres", en: "Job offers", es: "Ofertas", de: "Angebote" },
    {
      fr: "Nouvelle annonce",
      en: "New listing",
      es: "Nuevo anuncio",
      de: "Neue Anzeige",
    },
    {
      fr: "Voir le détail",
      en: "View details",
      es: "Ver detalle",
      de: "Details ansehen",
    },
    {
      fr: "Conversation",
      en: "Conversation",
      es: "Conversación",
      de: "Unterhaltung",
    },
    {
      fr: "Aucune annonce",
      en: "No listings",
      es: "Sin anuncios",
      de: "Keine Anzeigen",
    },
    {
      fr: "Lancez une conversation avec votre AiGENT pour publier votre première candidature ou offre.",
      en: "Start a conversation with your AiGENT to publish your first application or job offer.",
      es: "Inicia una conversación con tu AiGENT para publicar tu primera candidatura u oferta.",
      de: "Starte ein Gespräch mit deinem AiGENT, um deine erste Bewerbung oder Anzeige zu veröffentlichen.",
    },
    { fr: "Offre", en: "Offer", es: "Oferta", de: "Angebot" },
    {
      fr: "Salaire libre",
      en: "Salary not set",
      es: "Salario libre",
      de: "Gehalt offen",
    },
    {
      fr: "Zone libre",
      en: "Any area",
      es: "Zona libre",
      de: "Beliebiges Gebiet",
    },
    {
      fr: "Supprimer cette annonce ?",
      en: "Delete this listing?",
      es: "¿Eliminar este anuncio?",
      de: "Diese Anzeige löschen?",
    },
    {
      fr: "L'annonce sera retirée de l'historique et du matching. Action irréversible.",
      en: "The listing will be removed from history and matching. This cannot be undone.",
      es: "El anuncio se eliminará del historial y del matching. Acción irreversible.",
      de: "Die Anzeige wird aus Verlauf und Matching entfernt. Das kann nicht rückgängig gemacht werden.",
    },
    {
      fr: "Annonce supprimée",
      en: "Listing deleted",
      es: "Anuncio eliminado",
      de: "Anzeige gelöscht",
    },
    { fr: "Rôle", en: "Role", es: "Rol", de: "Rolle" },
    {
      fr: "Offre (recruteur)",
      en: "Job offer (recruiter)",
      es: "Oferta (reclutador)",
      de: "Angebot (Personalvermittler)",
    },
    {
      fr: "Candidature (candidat)",
      en: "Application (candidate)",
      es: "Candidatura (candidato)",
      de: "Bewerbung (Kandidat)",
    },
    { fr: "Zone", en: "Area", es: "Zona", de: "Gebiet" },
    { fr: "Salaire", en: "Salary", es: "Salario", de: "Gehalt" },
    { fr: "Expérience", en: "Experience", es: "Experiencia", de: "Erfahrung" },
    { fr: "Diplôme", en: "Degree", es: "Título", de: "Abschluss" },
    {
      fr: "Type de contrat",
      en: "Contract type",
      es: "Tipo de contrato",
      de: "Vertragsart",
    },
    { fr: "Compétences", en: "Skills", es: "Competencias", de: "Fähigkeiten" },
    {
      fr: "CV joint",
      en: "CV attached",
      es: "CV adjunto",
      de: "Lebenslauf beigefügt",
    },
    {
      fr: "Lettre jointe",
      en: "Cover letter attached",
      es: "Carta adjunta",
      de: "Anschreiben beigefügt",
    },
    { fr: "Oui", en: "Yes", es: "Sí", de: "Ja" },

    // ── Agenda ──
    {
      fr: "Entretiens, relances et échéances de candidature.",
      en: "Interviews, follow-ups and application deadlines.",
      es: "Entrevistas, seguimientos y plazos de candidatura.",
      de: "Vorstellungsgespräche, Nachfassaktionen und Bewerbungsfristen.",
    },
    { fr: "Calendrier", en: "Calendar", es: "Calendario", de: "Kalender" },
    {
      fr: "Nouvel évènement",
      en: "New event",
      es: "Nuevo evento",
      de: "Neues Ereignis",
    },
    {
      fr: "Enregistré en base",
      en: "Saved to your account",
      es: "Guardado en la base",
      de: "In der Datenbank gespeichert",
    },
    { fr: "Titre", en: "Title", es: "Título", de: "Titel" },
    { fr: "Date", en: "Date", es: "Fecha", de: "Datum" },
    { fr: "Heure", en: "Time", es: "Hora", de: "Uhrzeit" },
    { fr: "Type", en: "Type", es: "Tipo", de: "Typ" },
    {
      fr: "Entretien",
      en: "Interview",
      es: "Entrevista",
      de: "Vorstellungsgespräch",
    },
    { fr: "Relance", en: "Follow-up", es: "Seguimiento", de: "Nachfassen" },
    {
      fr: "Journée d'essai",
      en: "Trial day",
      es: "Día de prueba",
      de: "Probetag",
    },
    {
      fr: "Échéance candidature",
      en: "Application deadline",
      es: "Plazo de candidatura",
      de: "Bewerbungsfrist",
    },
    { fr: "Autre", en: "Other", es: "Otro", de: "Sonstiges" },
    {
      fr: "Pastille",
      en: "Color tag",
      es: "Etiqueta de color",
      de: "Farbmarkierung",
    },
    { fr: "Note", en: "Note", es: "Nota", de: "Notiz" },
    {
      fr: "Ajouter à l'agenda",
      en: "Add to calendar",
      es: "Añadir a la agenda",
      de: "Zum Kalender hinzufügen",
    },
    {
      fr: "Mettre à jour l'évènement",
      en: "Update event",
      es: "Actualizar evento",
      de: "Ereignis aktualisieren",
    },
    {
      fr: "Titre et date requis",
      en: "Title and date required",
      es: "Título y fecha requeridos",
      de: "Titel und Datum erforderlich",
    },
    {
      fr: "Évènement mis à jour",
      en: "Event updated",
      es: "Evento actualizado",
      de: "Ereignis aktualisiert",
    },
    {
      fr: "Évènement ajouté",
      en: "Event added",
      es: "Evento añadido",
      de: "Ereignis hinzugefügt",
    },
    {
      fr: "Évènement supprimé",
      en: "Event deleted",
      es: "Evento eliminado",
      de: "Ereignis gelöscht",
    },
    { fr: "À venir", en: "Upcoming", es: "Próximos", de: "Bevorstehend" },
    {
      fr: "Prochaines échéances",
      en: "Next deadlines",
      es: "Próximos plazos",
      de: "Nächste Termine",
    },
    {
      fr: "Rien de prévu",
      en: "Nothing planned",
      es: "Nada previsto",
      de: "Nichts geplant",
    },
    {
      fr: "Ajoutez un entretien ou une relance.",
      en: "Add an interview or a follow-up.",
      es: "Añade una entrevista o un seguimiento.",
      de: "Füge ein Gespräch oder eine Nachfassaktion hinzu.",
    },

    // ── Activité ──
    {
      fr: "Activité sur le site",
      en: "Site activity",
      es: "Actividad en el sitio",
      de: "Website-Aktivität",
    },
    {
      fr: "Temps passé, régularité et intensité d'utilisation.",
      en: "Time spent, regularity and intensity of use.",
      es: "Tiempo dedicado, regularidad e intensidad de uso.",
      de: "Verbrachte Zeit, Regelmäßigkeit und Nutzungsintensität.",
    },
    {
      fr: "Temps d'écran",
      en: "Screen time",
      es: "Tiempo de pantalla",
      de: "Bildschirmzeit",
    },
    { fr: "7 jours", en: "7 days", es: "7 días", de: "7 Tage" },
    { fr: "30 jours", en: "30 days", es: "30 días", de: "30 Tage" },
    { fr: "90 jours", en: "90 days", es: "90 días", de: "90 Tage" },
    {
      fr: "Moyenne / jour actif",
      en: "Average / active day",
      es: "Media / día activo",
      de: "Durchschnitt / aktiver Tag",
    },
    { fr: "Meilleur jour", en: "Best day", es: "Mejor día", de: "Bester Tag" },

    // ── Coffre ──
    {
      fr: "Coffre CV & lettres",
      en: "CV & cover letter vault",
      es: "Caja fuerte de CV y cartas",
      de: "CV- & Anschreiben-Tresor",
    },
    {
      fr: "Tous les documents déposés depuis vos candidatures, centralisés et réutilisables.",
      en: "All documents from your applications, centralized and reusable.",
      es: "Todos los documentos de tus candidaturas, centralizados y reutilizables.",
      de: "Alle Dokumente aus deinen Bewerbungen, zentral und wiederverwendbar.",
    },
    {
      fr: "Documents enregistrés",
      en: "Saved documents",
      es: "Documentos guardados",
      de: "Gespeicherte Dokumente",
    },
    {
      fr: "Ajouter un document",
      en: "Add a document",
      es: "Añadir un documento",
      de: "Dokument hinzufügen",
    },
    {
      fr: "CV ou lettre de motivation",
      en: "CV or cover letter",
      es: "CV o carta de presentación",
      de: "Lebenslauf oder Anschreiben",
    },
    {
      fr: "Type de document",
      en: "Document type",
      es: "Tipo de documento",
      de: "Dokumenttyp",
    },
    { fr: "CV", en: "CV", es: "CV", de: "Lebenslauf" },
    {
      fr: "Lettre de motivation",
      en: "Cover letter",
      es: "Carta de presentación",
      de: "Anschreiben",
    },
    { fr: "Libellé", en: "Label", es: "Etiqueta", de: "Bezeichnung" },
    { fr: "Fichier", en: "File", es: "Archivo", de: "Datei" },
    {
      fr: "Déposer dans le coffre",
      en: "Add to vault",
      es: "Guardar en la caja fuerte",
      de: "Im Tresor speichern",
    },
    {
      fr: "Choisir un fichier",
      en: "Choose a file",
      es: "Elegir un archivo",
      de: "Datei auswählen",
    },
    {
      fr: "Aucun fichier sélectionné",
      en: "No file selected",
      es: "Ningún archivo seleccionado",
      de: "Keine Datei ausgewählt",
    },
    {
      fr: "Coffre vide",
      en: "Empty vault",
      es: "Caja fuerte vacía",
      de: "Tresor leer",
    },
    {
      fr: "Déposez vos CV et lettres pour les réutiliser en un clic dans vos candidatures.",
      en: "Add your CVs and cover letters to reuse them in one click.",
      es: "Sube tus CV y cartas para reutilizarlos con un clic.",
      de: "Lade deinen Lebenslauf und Anschreiben hoch, um sie mit einem Klick wiederzuverwenden.",
    },
    { fr: "Ouvrir", en: "Open", es: "Abrir", de: "Öffnen" },
    {
      fr: "Document retiré",
      en: "Document removed",
      es: "Documento eliminado",
      de: "Dokument entfernt",
    },
    {
      fr: "Document ajouté au coffre",
      en: "Document added to the vault",
      es: "Documento añadido a la caja fuerte",
      de: "Dokument zum Tresor hinzugefügt",
    },
    {
      fr: "Libellé requis",
      en: "Label required",
      es: "Etiqueta requerida",
      de: "Bezeichnung erforderlich",
    },
    {
      fr: "Sélectionnez un fichier",
      en: "Select a file",
      es: "Selecciona un archivo",
      de: "Datei auswählen",
    },

    // ── Diagnostic marché ──
    {
      fr: "Diagnostic marché",
      en: "Market diagnostic",
      es: "Diagnóstico de mercado",
      de: "Marktdiagnose",
    },
    {
      fr: "Votre positionnement réel face au marché de la plateforme — salaire, compétences, attractivité.",
      en: "Your real position on the platform's market — salary, skills, attractiveness.",
      es: "Tu posicionamiento real frente al mercado de la plataforma — salario, competencias, atractivo.",
      de: "Deine reale Marktposition auf der Plattform — Gehalt, Fähigkeiten, Attraktivität.",
    },
    {
      fr: "Score d'attractivité",
      en: "Attractiveness score",
      es: "Puntuación de atractivo",
      de: "Attraktivitäts-Score",
    },
    {
      fr: "Basé sur votre dernière annonce publiée",
      en: "Based on your latest published listing",
      es: "Basado en tu último anuncio publicado",
      de: "Basierend auf deiner zuletzt veröffentlichten Anzeige",
    },
    { fr: "Actualiser", en: "Refresh", es: "Actualizar", de: "Aktualisieren" },
    {
      fr: "Aucun diagnostic pour l'instant",
      en: "No diagnostic yet",
      es: "Sin diagnóstico por ahora",
      de: "Noch keine Diagnose",
    },
    {
      fr: "Publiez une annonce, puis lancez le diagnostic.",
      en: "Publish a listing, then run the diagnostic.",
      es: "Publica un anuncio y luego ejecuta el diagnóstico.",
      de: "Veröffentliche eine Anzeige und starte dann die Diagnose.",
    },
    {
      fr: "Positionnement salarial",
      en: "Salary positioning",
      es: "Posicionamiento salarial",
      de: "Gehaltspositionierung",
    },
    {
      fr: "Comparé aux profils similaires",
      en: "Compared to similar profiles",
      es: "Comparado con perfiles similares",
      de: "Verglichen mit ähnlichen Profilen",
    },
    {
      fr: "Lancez le diagnostic pour voir votre positionnement.",
      en: "Run the diagnostic to see your positioning.",
      es: "Ejecuta el diagnóstico para ver tu posicionamiento.",
      de: "Starte die Diagnose, um deine Position zu sehen.",
    },
    { fr: "Le vôtre", en: "Yours", es: "El tuyo", de: "Deins" },
    {
      fr: "Moyenne marché",
      en: "Market average",
      es: "Media de mercado",
      de: "Marktdurchschnitt",
    },
    { fr: "Percentile", en: "Percentile", es: "Percentil", de: "Perzentil" },
    {
      fr: "Aucun salaire renseigné sur votre dernière annonce.",
      en: "No salary set on your latest listing.",
      es: "No hay salario indicado en tu último anuncio.",
      de: "Kein Gehalt in deiner letzten Anzeige angegeben.",
    },
    {
      fr: "Compétences les plus demandées",
      en: "Most in-demand skills",
      es: "Competencias más demandadas",
      de: "Gefragteste Fähigkeiten",
    },
    {
      fr: "Dans votre domaine",
      en: "In your field",
      es: "En tu ámbito",
      de: "In deinem Bereich",
    },
    {
      fr: "Sur l'ensemble de la plateforme",
      en: "Across the whole platform",
      es: "En toda la plataforma",
      de: "Auf der gesamten Plattform",
    },
    {
      fr: "Aucune donnée pour l'instant.",
      en: "No data yet.",
      es: "Sin datos por ahora.",
      de: "Noch keine Daten.",
    },
    {
      fr: "Pas assez de données pour établir un classement des compétences.",
      en: "Not enough data to rank skills yet.",
      es: "No hay suficientes datos para clasificar competencias.",
      de: "Nicht genug Daten, um Fähigkeiten zu ranken.",
    },
    {
      fr: "Compétences en tension chez vous",
      en: "Skill gaps in your profile",
      es: "Competencias en tensión en tu perfil",
      de: "Fähigkeitslücken in deinem Profil",
    },
    {
      fr: "Recommandations",
      en: "Recommendations",
      es: "Recomendaciones",
      de: "Empfehlungen",
    },
    {
      fr: "Actions concrètes pour améliorer votre score",
      en: "Concrete actions to improve your score",
      es: "Acciones concretas para mejorar tu puntuación",
      de: "Konkrete Maßnahmen zur Verbesserung deines Scores",
    },
    {
      fr: "Lancez le diagnostic pour obtenir des recommandations.",
      en: "Run the diagnostic to get recommendations.",
      es: "Ejecuta el diagnóstico para obtener recomendaciones.",
      de: "Starte die Diagnose, um Empfehlungen zu erhalten.",
    },
    {
      fr: "Diagnostic indisponible",
      en: "Diagnostic unavailable",
      es: "Diagnóstico no disponible",
      de: "Diagnose nicht verfügbar",
    },
    {
      fr: "Comparé à",
      en: "Compared to",
      es: "Comparado con",
      de: "Verglichen mit",
    },
    {
      fr: "profil(s) du même domaine",
      en: "profile(s) in the same field",
      es: "perfil(es) del mismo ámbito",
      de: "Profil(e) im gleichen Bereich",
    },
    {
      fr: "profil(s) sur la plateforme",
      en: "profile(s) on the platform",
      es: "perfil(es) en la plataforma",
      de: "Profil(e) auf der Plattform",
    },

    // ── Préférences ──
    {
      fr: "Comportement de l'agent, alertes et affichage.",
      en: "Agent behavior, alerts and display.",
      es: "Comportamiento del agente, alertas y visualización.",
      de: "Agentenverhalten, Benachrichtigungen und Anzeige.",
    },
    {
      fr: "Agent & matching",
      en: "Agent & matching",
      es: "Agente y matching",
      de: "Agent & Matching",
    },
    {
      fr: "Appliqué à chaque conversation",
      en: "Applied to every conversation",
      es: "Aplicado en cada conversación",
      de: "Wird bei jedem Gespräch angewendet",
    },
    { fr: "Alertes", en: "Alerts", es: "Alertas", de: "Benachrichtigungen" },
    {
      fr: "Ce que vous souhaitez recevoir",
      en: "What you want to receive",
      es: "Lo que deseas recibir",
      de: "Was du erhalten möchtest",
    },
    {
      fr: "Affichage & région",
      en: "Display & region",
      es: "Visualización y región",
      de: "Anzeige & Region",
    },
    {
      fr: "Langue, devise, unités",
      en: "Language, currency, units",
      es: "Idioma, moneda, unidades",
      de: "Sprache, Währung, Einheiten",
    },
    { fr: "Langue", en: "Language", es: "Idioma", de: "Sprache" },
    { fr: "Devise", en: "Currency", es: "Moneda", de: "Währung" },
    { fr: "€ Euro", en: "€ Euro", es: "€ Euro", de: "€ Euro" },
    {
      fr: "CHF Franc suisse",
      en: "CHF Swiss Franc",
      es: "CHF Franco suizo",
      de: "CHF Schweizer Franken",
    },
    {
      fr: "£ Livre sterling",
      en: "£ British Pound",
      es: "£ Libra esterlina",
      de: "£ Britisches Pfund",
    },
    {
      fr: "Unité de distance",
      en: "Distance unit",
      es: "Unidad de distancia",
      de: "Entfernungseinheit",
    },
    { fr: "Kilomètres", en: "Kilometers", es: "Kilómetros", de: "Kilometer" },
    { fr: "Miles", en: "Miles", es: "Millas", de: "Meilen" },
    {
      fr: "Rayon de recherche par défaut",
      en: "Default search radius",
      es: "Radio de búsqueda por defecto",
      de: "Standard-Suchradius",
    },
    { fr: "Thème", en: "Theme", es: "Tema", de: "Design" },
    { fr: "Sombre", en: "Dark", es: "Oscuro", de: "Dunkel" },
    { fr: "Clair", en: "Light", es: "Claro", de: "Hell" },
    {
      fr: "Enregistrer les préférences",
      en: "Save preferences",
      es: "Guardar preferencias",
      de: "Einstellungen speichern",
    },
    {
      fr: "Préférences enregistrées",
      en: "Preferences saved",
      es: "Preferencias guardadas",
      de: "Einstellungen gespeichert",
    },
    { fr: "Actif", en: "Active", es: "Activa", de: "Aktiv" },
    {
      fr: "Le matching automatique est toujours activé.",
      en: "Automatic matching is always on.",
      es: "El matching automático siempre está activo.",
      de: "Automatisches Matching ist immer aktiv.",
    },

    // Libellés générés en JS (SEARCH_PREFS / ALERT_PREFS)
    {
      fr: "Matching automatique",
      en: "Automatic matching",
      es: "Matching automático",
      de: "Automatisches Matching",
    },
    {
      fr: "Lance la recherche de profils dès qu'une annonce est complète.",
      en: "Starts searching profiles as soon as a listing is complete.",
      es: "Inicia la búsqueda de perfiles en cuanto un anuncio está completo.",
      de: "Startet die Profilsuche, sobald eine Anzeige vollständig ist.",
    },
    {
      fr: "Masquer les postes pourvus",
      en: "Hide filled positions",
      es: "Ocultar puestos cubiertos",
      de: "Besetzte Stellen ausblenden",
    },
    {
      fr: "Les offres et candidatures conclues disparaissent des résultats.",
      en: "Closed offers and applications disappear from results.",
      es: "Las ofertas y candidaturas cerradas desaparecen de los resultados.",
      de: "Abgeschlossene Angebote und Bewerbungen verschwinden aus den Ergebnissen.",
    },
    {
      fr: "Prioriser les profils avec CV complet",
      en: "Prioritize profiles with a complete CV",
      es: "Priorizar perfiles con CV completo",
      de: "Profile mit vollständigem Lebenslauf priorisieren",
    },
    {
      fr: "Les profils avec CV et lettre passent en tête des résultats.",
      en: "Profiles with a CV and cover letter appear first.",
      es: "Los perfiles con CV y carta aparecen primero en los resultados.",
      de: "Profile mit Lebenslauf und Anschreiben erscheinen zuerst.",
    },
    {
      fr: "Trier par compatibilité",
      en: "Sort by compatibility",
      es: "Ordenar por compatibilidad",
      de: "Nach Kompatibilität sortieren",
    },
    {
      fr: "Classe les résultats par score de compatibilité plutôt que par date.",
      en: "Ranks results by compatibility score instead of by date.",
      es: "Ordena los resultados por puntuación de compatibilidad en lugar de por fecha.",
      de: "Sortiert Ergebnisse nach Kompatibilitäts-Score statt nach Datum.",
    },
    {
      fr: "Nouveau match",
      en: "New match",
      es: "Nuevo match",
      de: "Neuer Match",
    },
    {
      fr: "Un profil correspond à vos critères — coordonnées incluses.",
      en: "A profile matches your criteria — contact details included.",
      es: "Un perfil coincide con tus criterios — datos de contacto incluidos.",
      de: "Ein Profil entspricht deinen Kriterien — inkl. Kontaktdaten.",
    },
    {
      fr: "Nouveau message",
      en: "New message",
      es: "Nuevo mensaje",
      de: "Neue Nachricht",
    },
    {
      fr: "Un candidat ou recruteur vous contacte.",
      en: "A candidate or recruiter contacts you.",
      es: "Un candidato o reclutador te contacta.",
      de: "Ein Kandidat oder Personalvermittler kontaktiert dich.",
    },
    {
      fr: "Rappel agenda",
      en: "Calendar reminder",
      es: "Recordatorio de agenda",
      de: "Kalendererinnerung",
    },
    {
      fr: "24h avant chaque entretien.",
      en: "24h before every interview.",
      es: "24h antes de cada entrevista.",
      de: "24 Std. vor jedem Gespräch.",
    },
    {
      fr: "Évolution du diagnostic marché",
      en: "Market diagnostic changes",
      es: "Evolución del diagnóstico de mercado",
      de: "Entwicklung der Marktdiagnose",
    },
    {
      fr: "Votre score d'attractivité change significativement.",
      en: "Your attractiveness score changes significantly.",
      es: "Tu puntuación de atractivo cambia significativamente.",
      de: "Dein Attraktivitäts-Score ändert sich deutlich.",
    },

    // ── Sécurité ──
    {
      fr: "Mot de passe, double authentification et données.",
      en: "Password, two-factor authentication and data.",
      es: "Contraseña, doble autenticación y datos.",
      de: "Passwort, Zwei-Faktor-Authentifizierung und Daten.",
    },
    { fr: "Mot de passe", en: "Password", es: "Contraseña", de: "Passwort" },
    {
      fr: "8 caractères minimum recommandés",
      en: "8 characters minimum recommended",
      es: "Se recomiendan 8 caracteres como mínimo",
      de: "Mindestens 8 Zeichen empfohlen",
    },
    {
      fr: "Mot de passe actuel",
      en: "Current password",
      es: "Contraseña actual",
      de: "Aktuelles Passwort",
    },
    {
      fr: "Nouveau mot de passe",
      en: "New password",
      es: "Nueva contraseña",
      de: "Neues Passwort",
    },
    {
      fr: "Confirmation",
      en: "Confirmation",
      es: "Confirmación",
      de: "Bestätigung",
    },
    {
      fr: "Mettre à jour",
      en: "Update",
      es: "Actualizar",
      de: "Aktualisieren",
    },
    { fr: "Force : —", en: "Strength: —", es: "Fuerza: —", de: "Stärke: —" },
    { fr: "faible", en: "weak", es: "débil", de: "schwach" },
    { fr: "moyenne", en: "medium", es: "media", de: "mittel" },
    { fr: "bonne", en: "good", es: "buena", de: "gut" },
    { fr: "excellente", en: "excellent", es: "excelente", de: "ausgezeichnet" },
    {
      fr: "Remplissez tous les champs",
      en: "Fill in all fields",
      es: "Completa todos los campos",
      de: "Fülle alle Felder aus",
    },
    {
      fr: "8 caractères minimum",
      en: "8 characters minimum",
      es: "Mínimo 8 caracteres",
      de: "Mindestens 8 Zeichen",
    },
    {
      fr: "La confirmation ne correspond pas",
      en: "Confirmation doesn't match",
      es: "La confirmación no coincide",
      de: "Bestätigung stimmt nicht überein",
    },
    {
      fr: "Mot de passe mis à jour",
      en: "Password updated",
      es: "Contraseña actualizada",
      de: "Passwort aktualisiert",
    },
    {
      fr: "Double authentification",
      en: "Two-factor authentication",
      es: "Autenticación de dos factores",
      de: "Zwei-Faktor-Authentifizierung",
    },
    { fr: "Activée", en: "Enabled", es: "Activada", de: "Aktiviert" },
    { fr: "Inactive", en: "Disabled", es: "Inactiva", de: "Deaktiviert" },
    {
      fr: "Votre compte est protégé",
      en: "Your account is protected",
      es: "Tu cuenta está protegida",
      de: "Dein Konto ist geschützt",
    },
    {
      fr: "Un des 3 codes de sécurité est demandé à chaque connexion, en plus du mot de passe.",
      en: "One of your 3 security codes is required at every login, in addition to your password.",
      es: "En cada inicio de sesión se pide uno de los 3 códigos de seguridad, además de la contraseña.",
      de: "Bei jeder Anmeldung wird zusätzlich zum Passwort einer der 3 Sicherheitscodes verlangt.",
    },
    {
      fr: "Désactiver la 2FA",
      en: "Disable 2FA",
      es: "Desactivar 2FA",
      de: "2FA deaktivieren",
    },
    {
      fr: "2FA désactivée",
      en: "2FA disabled",
      es: "2FA desactivada",
      de: "2FA deaktiviert",
    },
    {
      fr: "Scannez ce QR code dans Google Authenticator, Authy ou 1Password, puis saisissez le code généré.",
      en: "Scan this QR code in Google Authenticator, Authy or 1Password, then enter the generated code.",
      es: "Escanea este código QR en Google Authenticator, Authy o 1Password y luego introduce el código generado.",
      de: "Scanne diesen QR-Code mit Google Authenticator, Authy oder 1Password und gib dann den generierten Code ein.",
    },
    {
      fr: "Clé manuelle",
      en: "Manual key",
      es: "Clave manual",
      de: "Manueller Schlüssel",
    },
    {
      fr: "Code à 6 chiffres",
      en: "6-digit code",
      es: "Código de 6 dígitos",
      de: "6-stelliger Code",
    },
    {
      fr: "Activer la 2FA",
      en: "Enable 2FA",
      es: "Activar 2FA",
      de: "2FA aktivieren",
    },
    {
      fr: "Code à 6 chiffres requis",
      en: "6-digit code required",
      es: "Se requiere un código de 6 dígitos",
      de: "6-stelliger Code erforderlich",
    },
    {
      fr: "2FA activée",
      en: "2FA enabled",
      es: "2FA activada",
      de: "2FA aktiviert",
    },
    {
      fr: "Vos 3 codes de connexion",
      en: "Your 3 login codes",
      es: "Tus 3 códigos de inicio de sesión",
      de: "Deine 3 Anmeldecodes",
    },
    { fr: "J'ai noté", en: "Got it", es: "Anotado", de: "Notiert" },
    { fr: "Vos données", en: "Your data", es: "Tus datos", de: "Deine Daten" },
    {
      fr: "Portabilité RGPD",
      en: "Data portability (GDPR)",
      es: "Portabilidad RGPD",
      de: "Datenübertragbarkeit (DSGVO)",
    },
    {
      fr: "Téléchargez l'ensemble de vos données (compte, annonces, agenda, coffre) au format JSON.",
      en: "Download all your data (account, listings, calendar, vault) as JSON.",
      es: "Descarga todos tus datos (cuenta, anuncios, agenda, caja fuerte) en formato JSON.",
      de: "Lade alle deine Daten (Konto, Anzeigen, Kalender, Tresor) als JSON herunter.",
    },
    {
      fr: "Exporter mes données",
      en: "Export my data",
      es: "Exportar mis datos",
      de: "Meine Daten exportieren",
    },
    {
      fr: "Export téléchargé",
      en: "Export downloaded",
      es: "Exportación descargada",
      de: "Export heruntergeladen",
    },

    // ── Support ──
    {
      fr: "Support & centre d'aide",
      en: "Support & help center",
      es: "Soporte y centro de ayuda",
      de: "Support & Hilfecenter",
    },
    {
      fr: "Une question ? L'équipe répond sous 24h ouvrées.",
      en: "A question? Our team replies within 24 business hours.",
      es: "¿Una pregunta? El equipo responde en 24h laborables.",
      de: "Eine Frage? Unser Team antwortet innerhalb von 24 Werkstunden.",
    },
    {
      fr: "Contacter le support",
      en: "Contact support",
      es: "Contactar con soporte",
      de: "Support kontaktieren",
    },
    {
      fr: "Ticket enregistré et suivi",
      en: "Ticket logged and tracked",
      es: "Ticket registrado y seguido",
      de: "Ticket erfasst und verfolgt",
    },
    { fr: "Catégorie", en: "Category", es: "Categoría", de: "Kategorie" },
    {
      fr: "Question générale",
      en: "General question",
      es: "Pregunta general",
      de: "Allgemeine Frage",
    },
    {
      fr: "Problème sur une candidature",
      en: "Issue with an application",
      es: "Problema con una candidatura",
      de: "Problem mit einer Bewerbung",
    },
    {
      fr: "Problème sur une offre",
      en: "Issue with a job offer",
      es: "Problema con una oferta",
      de: "Problem mit einem Angebot",
    },
    {
      fr: "Matching / mise en relation",
      en: "Matching / introductions",
      es: "Matching / puesta en contacto",
      de: "Matching / Kontaktvermittlung",
    },
    {
      fr: "CV / lettre de motivation",
      en: "CV / cover letter",
      es: "CV / carta de presentación",
      de: "Lebenslauf / Anschreiben",
    },
    {
      fr: "Compte & sécurité",
      en: "Account & security",
      es: "Cuenta y seguridad",
      de: "Konto & Sicherheit",
    },
    {
      fr: "Bug technique",
      en: "Technical bug",
      es: "Error técnico",
      de: "Technischer Fehler",
    },
    { fr: "Sujet", en: "Subject", es: "Asunto", de: "Betreff" },
    {
      fr: "Résumé en une ligne",
      en: "One-line summary",
      es: "Resumen en una línea",
      de: "Zusammenfassung in einer Zeile",
    },
    { fr: "Message", en: "Message", es: "Mensaje", de: "Nachricht" },
    {
      fr: "Décrivez précisément votre situation…",
      en: "Describe your situation precisely…",
      es: "Describe tu situación con precisión…",
      de: "Beschreibe deine Situation genau…",
    },
    {
      fr: "Envoyer la demande",
      en: "Send request",
      es: "Enviar solicitud",
      de: "Anfrage senden",
    },
    {
      fr: "Sujet et message (10 caractères min.) requis",
      en: "Subject and message (10 characters min.) required",
      es: "Se requieren asunto y mensaje (mín. 10 caracteres)",
      de: "Betreff und Nachricht (mind. 10 Zeichen) erforderlich",
    },
    {
      fr: "Questions fréquentes",
      en: "Frequently asked questions",
      es: "Preguntas frecuentes",
      de: "Häufig gestellte Fragen",
    },
    {
      fr: "Réponses immédiates",
      en: "Instant answers",
      es: "Respuestas inmediatas",
      de: "Sofortige Antworten",
    },
    {
      fr: "Comment publier une candidature ou une offre ?",
      en: "How do I publish an application or a job offer?",
      es: "¿Cómo publico una candidatura o una oferta?",
      de: "Wie veröffentliche ich eine Bewerbung oder ein Angebot?",
    },
    {
      fr: "Depuis le chat, décrivez votre recherche ou votre poste à l'AiGENT. Une fois les critères complets, validez le récapitulatif pour publier et lancer le matching.",
      en: "From the chat, describe your search or job to the AiGENT. Once the criteria are complete, confirm the summary to publish and start matching.",
      es: "Desde el chat, describe tu búsqueda o tu puesto al AiGENT. Una vez completos los criterios, confirma el resumen para publicar e iniciar el matching.",
      de: "Beschreibe deine Suche oder Stelle im Chat dem AiGENT. Sobald die Kriterien vollständig sind, bestätige die Zusammenfassung, um zu veröffentlichen und das Matching zu starten.",
    },
    {
      fr: "Comment fonctionne le diagnostic marché ?",
      en: "How does the market diagnostic work?",
      es: "¿Cómo funciona el diagnóstico de mercado?",
      de: "Wie funktioniert die Marktdiagnose?",
    },
    {
      fr: "Il compare votre dernière annonce publiée à l'ensemble des profils similaires sur la plateforme : salaire, compétences demandées, et calcule un score d'attractivité.",
      en: "It compares your latest published listing to similar profiles on the platform — salary, requested skills — and computes an attractiveness score.",
      es: "Compara tu último anuncio publicado con perfiles similares en la plataforma: salario, competencias solicitadas, y calcula una puntuación de atractivo.",
      de: "Sie vergleicht deine zuletzt veröffentlichte Anzeige mit ähnlichen Profilen auf der Plattform — Gehalt, gefragte Fähigkeiten — und berechnet einen Attraktivitäts-Score.",
    },
    {
      fr: "Puis-je réutiliser un CV entre plusieurs candidatures ?",
      en: "Can I reuse a CV across several applications?",
      es: "¿Puedo reutilizar un CV entre varias candidaturas?",
      de: "Kann ich einen Lebenslauf für mehrere Bewerbungen wiederverwenden?",
    },
    {
      fr: "Oui. Chaque CV et lettre déposés sont conservés dans le Coffre et peuvent être réutilisés depuis le tunnel de candidature.",
      en: "Yes. Every CV and cover letter you add is kept in the Vault and can be reused from the application flow.",
      es: "Sí. Cada CV y carta que subas se guardan en la Caja fuerte y pueden reutilizarse desde el flujo de candidatura.",
      de: "Ja. Jeder hochgeladene Lebenslauf und jedes Anschreiben wird im Tresor gespeichert und kann im Bewerbungsablauf wiederverwendet werden.",
    },
    {
      fr: "Comment supprimer une annonce publiée ?",
      en: "How do I delete a published listing?",
      es: "¿Cómo elimino un anuncio publicado?",
      de: "Wie lösche ich eine veröffentlichte Anzeige?",
    },
    {
      fr: "Depuis l'onglet Mes annonces. La suppression retire l'annonce de l'historique et du matching, définitivement.",
      en: "From the My Listings tab. Deleting permanently removes the listing from history and matching.",
      es: "Desde la pestaña Mis anuncios. La eliminación retira el anuncio del historial y del matching de forma definitiva.",
      de: "Über den Tab „Meine Anzeigen“. Das Löschen entfernt die Anzeige endgültig aus Verlauf und Matching.",
    },
    {
      fr: "Mes tickets",
      en: "My tickets",
      es: "Mis tickets",
      de: "Meine Tickets",
    },
    { fr: "Historique", en: "History", es: "Historial", de: "Verlauf" },
    {
      fr: "Aucun ticket",
      en: "No tickets",
      es: "Sin tickets",
      de: "Keine Tickets",
    },
    {
      fr: "Vos demandes apparaîtront ici.",
      en: "Your requests will appear here.",
      es: "Tus solicitudes aparecerán aquí.",
      de: "Deine Anfragen werden hier angezeigt.",
    },
    { fr: "En cours", en: "In progress", es: "En curso", de: "In Bearbeitung" },
    { fr: "Résolu", en: "Resolved", es: "Resuelto", de: "Gelöst" },

    // ── Zone critique ──
    {
      fr: "Actions irréversibles. Lisez attentivement avant de valider.",
      en: "Irreversible actions. Read carefully before confirming.",
      es: "Acciones irreversibles. Lee atentamente antes de confirmar.",
      de: "Unwiderrufliche Aktionen. Bitte vor dem Bestätigen sorgfältig lesen.",
    },
    {
      fr: "Actions destructrices",
      en: "Destructive actions",
      es: "Acciones destructivas",
      de: "Destruktive Aktionen",
    },
    {
      fr: "Confirmation requise",
      en: "Confirmation required",
      es: "Confirmación requerida",
      de: "Bestätigung erforderlich",
    },
    {
      fr: "Réinitialiser mon profil AiGENT",
      en: "Reset my AiGENT profile",
      es: "Restablecer mi perfil AiGENT",
      de: "Mein AiGENT-Profil zurücksetzen",
    },
    {
      fr: "Efface vos annonces et remet l'agent à zéro. Le compte est conservé.",
      en: "Clears your listings and resets the agent. Your account is kept.",
      es: "Borra tus anuncios y reinicia el agente. La cuenta se conserva.",
      de: "Löscht deine Anzeigen und setzt den Agenten zurück. Das Konto bleibt erhalten.",
    },
    { fr: "Réinitialiser", en: "Reset", es: "Restablecer", de: "Zurücksetzen" },
    {
      fr: "Supprimer toutes mes données",
      en: "Delete all my data",
      es: "Eliminar todos mis datos",
      de: "Alle meine Daten löschen",
    },
    {
      fr: "Annonces, agenda, coffre et messages sont définitivement supprimés.",
      en: "Listings, calendar, vault and messages are permanently deleted.",
      es: "Anuncios, agenda, caja fuerte y mensajes se eliminan definitivamente.",
      de: "Anzeigen, Kalender, Tresor und Nachrichten werden endgültig gelöscht.",
    },
    {
      fr: "Supprimer les données",
      en: "Delete data",
      es: "Eliminar datos",
      de: "Daten löschen",
    },
    {
      fr: "Supprimer mon compte",
      en: "Delete my account",
      es: "Eliminar mi cuenta",
      de: "Mein Konto löschen",
    },
    {
      fr: "Suppression totale du compte et déconnexion immédiate.",
      en: "Total account deletion and immediate logout.",
      es: "Eliminación total de la cuenta y cierre de sesión inmediato.",
      de: "Vollständige Kontolöschung und sofortige Abmeldung.",
    },
    {
      fr: "Supprimer le compte",
      en: "Delete account",
      es: "Eliminar cuenta",
      de: "Konto löschen",
    },
    {
      fr: "Réinitialiser mon profil AiGENT ?",
      en: "Reset my AiGENT profile?",
      es: "¿Restablecer mi perfil AiGENT?",
      de: "Mein AiGENT-Profil zurücksetzen?",
    },
    {
      fr: "Supprimer toutes vos données ?",
      en: "Delete all your data?",
      es: "¿Eliminar todos tus datos?",
      de: "Alle deine Daten löschen?",
    },
    {
      fr: "Supprimer définitivement le compte ?",
      en: "Permanently delete your account?",
      es: "¿Eliminar la cuenta definitivamente?",
      de: "Konto endgültig löschen?",
    },
    {
      fr: "Cette action est irréversible : compte, annonces et historique seront effacés.",
      en: "This action cannot be undone: account, listings and history will be erased.",
      es: "Esta acción es irreversible: cuenta, anuncios e historial se borrarán.",
      de: "Diese Aktion ist unwiderruflich: Konto, Anzeigen und Verlauf werden gelöscht.",
    },
    {
      fr: "Profil réinitialisé",
      en: "Profile reset",
      es: "Perfil restablecido",
      de: "Profil zurückgesetzt",
    },
    {
      fr: "Données supprimées",
      en: "Data deleted",
      es: "Datos eliminados",
      de: "Daten gelöscht",
    },
    {
      fr: "Compte supprimé",
      en: "Account deleted",
      es: "Cuenta eliminada",
      de: "Konto gelöscht",
    },
    { fr: "Confirmer", en: "Confirm", es: "Confirmar", de: "Bestätigen" },
    { fr: "Annuler", en: "Cancel", es: "Cancelar", de: "Abbrechen" },

    // ── Modales / divers ──
    {
      fr: "Choisir un avatar",
      en: "Choose an avatar",
      es: "Elegir un avatar",
      de: "Avatar auswählen",
    },
    {
      fr: "Avatar mis à jour",
      en: "Avatar updated",
      es: "Avatar actualizado",
      de: "Avatar aktualisiert",
    },
    {
      fr: "Notifications",
      en: "Notifications",
      es: "Notificaciones",
      de: "Benachrichtigungen",
    },
    {
      fr: "Tout marquer comme lu",
      en: "Mark all as read",
      es: "Marcar todo como leído",
      de: "Alles als gelesen markieren",
    },
    {
      fr: "Aucune notification",
      en: "No notifications",
      es: "Sin notificaciones",
      de: "Keine Benachrichtigungen",
    },
    {
      fr: "Vous êtes à jour.",
      en: "You're all caught up.",
      es: "Estás al día.",
      de: "Du bist auf dem neuesten Stand.",
    },
    {
      fr: "Contact requis",
      en: "Contact required",
      es: "Contacto requerido",
      de: "Kontakt erforderlich",
    },
    {
      fr: "Contact enregistré",
      en: "Contact saved",
      es: "Contacto guardado",
      de: "Kontakt gespeichert",
    },
    {
      fr: "Zone enregistrée",
      en: "Area saved",
      es: "Zona guardada",
      de: "Gebiet gespeichert",
    },
    {
      fr: "Session expirée",
      en: "Session expired",
      es: "Sesión expirada",
      de: "Sitzung abgelaufen",
    },
    {
      fr: "Voir plus →",
      en: "See more →",
      es: "Ver más →",
      de: "Mehr ansehen →",
    },
    {
      fr: "Contactez ce profil depuis la messagerie.",
      en: "Contact this profile from your messages.",
      es: "Contacta con este perfil desde la mensajería.",
      de: "Kontaktiere dieses Profil über die Nachrichten.",
    },
    { fr: "Tapez", en: "Type", es: "Escribe", de: "Gib" },
    {
      fr: "pour confirmer",
      en: "to confirm",
      es: "para confirmar",
      de: "zur Bestätigung ein",
    },
  ];

  /* ═══════════════════ 2. INDEX bidirectionnel ═══════════════════ */
  const LANGS = ["fr", "en", "es", "de"];
  const LOOKUP = { fr: new Map(), en: new Map(), es: new Map(), de: new Map() };
  const BY_KEY = new Map();

  for (const rec of STRINGS) {
    for (const l of LANGS) {
      const val = rec[l];
      if (val) LOOKUP[l].set(val.trim().toLowerCase(), rec);
    }
    if (rec.key) BY_KEY.set(rec.key, rec);
  }

  /* ═══════════════════ 3. DEVISES & UNITÉS ═══════════════════ */
  // Taux indicatifs relative à l'EUR (base de stockage des salaires).
  const FX = { EUR: 1, CHF: 0.95, GBP: 0.855 };
  const CURRENCY_SYMBOL = { EUR: "€", CHF: "CHF", GBP: "£" };
  const CURRENCY_LOCALE = { EUR: "fr-FR", CHF: "fr-CH", GBP: "en-GB" };
  const PER_YEAR = { fr: "/an", en: "/yr", es: "/año", de: "/Jahr" };
  const KM_TO_MI = 0.621371;

  /* ═══════════════════ 4. ÉTAT ═══════════════════ */
  const STORAGE_KEY = "emploi_display_prefs";
  let state = { langue: "fr", devise: "EUR", unite: "km" };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    state = { ...state, ...saved };
  } catch {}

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  /* ═══════════════════ 5. TRADUCTION DU DOM ═══════════════════ */
  const SKIP_TAGS = new Set([
    "SCRIPT",
    "STYLE",
    "TEXTAREA",
    "INPUT",
    "NOSCRIPT",
  ]);

  function translateTextNode(node, targetLang) {
    const raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    const leading = raw.match(/^\s*/)[0];
    const trailing = raw.match(/\s*$/)[0];
    const core = raw.trim();
    const key = core.toLowerCase();
    for (const l of LANGS) {
      const rec = LOOKUP[l].get(key);
      if (rec && rec[targetLang]) {
        const next = leading + rec[targetLang] + trailing;
        if (next !== raw) node.nodeValue = next;
        return;
      }
    }
  }

  function translateAttr(el, attr, targetLang) {
    const raw = el.getAttribute(attr);
    if (!raw || !raw.trim()) return;
    const key = raw.trim().toLowerCase();
    for (const l of LANGS) {
      const rec = LOOKUP[l].get(key);
      if (rec && rec[targetLang] && rec[targetLang] !== raw) {
        el.setAttribute(attr, rec[targetLang]);
        return;
      }
    }
  }

  function translateSubtree(root, targetLang) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || SKIP_TAGS.has(p.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    nodes.forEach((node) => translateTextNode(node, targetLang));

    // placeholders + title/aria-label
    root
      .querySelectorAll?.("[placeholder]")
      .forEach((el) => translateAttr(el, "placeholder", targetLang));
    if (root.hasAttribute?.("placeholder"))
      translateAttr(root, "placeholder", targetLang);
  }

  let observer = null;
  function watchDom(targetLangGetter) {
    if (observer) observer.disconnect();
    observer = new MutationObserver((mutations) => {
      const lang = targetLangGetter();
      if (lang === "fr") return; // rien à faire, le FR est la langue source du HTML
      for (const m of mutations) {
        m.addedNodes.forEach((node) => {
          if (node.nodeType === 1) translateSubtree(node, lang);
          else if (node.nodeType === 3) translateTextNode(node, lang);
        });
        if (m.type === "characterData") translateTextNode(m.target, lang);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  /* ═══════════════════ 6. API PUBLIQUE ═══════════════════ */
  function applyLanguage(lang) {
    if (!LANGS.includes(lang)) lang = "fr";
    state.langue = lang;
    persist();
    document.documentElement.lang = lang;
    translateSubtree(document.body, lang);
  }

  function applyCurrency(devise) {
    state.devise = FX[devise] ? devise : "EUR";
    persist();
  }

  function applyUnit(unite) {
    state.unite = unite === "mi" ? "mi" : "km";
    persist();
  }

  function applyAll(prefs = {}) {
    if (prefs.devise) applyCurrency(prefs.devise);
    if (prefs.unite) applyUnit(prefs.unite);
    applyLanguage(prefs.langue || state.langue || "fr");
  }

  function t(key) {
    const rec = BY_KEY.get(key);
    if (!rec) return key;
    return rec[state.langue] || rec.fr || key;
  }

  function formatPrice(n) {
    if (n == null || n === "" || isNaN(n)) return t("common.unset") || "—";
    const converted = Math.round(Number(n) * (FX[state.devise] || 1));
    const locale = CURRENCY_LOCALE[state.devise] || "fr-FR";
    const symbol = CURRENCY_SYMBOL[state.devise] || "€";
    const per = PER_YEAR[state.langue] || PER_YEAR.fr;
    const num = converted.toLocaleString(locale);
    return state.devise === "GBP"
      ? `${symbol}${num}${per}`
      : `${num} ${symbol}${per}`;
  }

  function formatDistance(km) {
    if (km == null || isNaN(km)) return "—";
    if (state.unite === "mi") {
      const mi = Number(km) * KM_TO_MI;
      return `${mi.toFixed(mi < 10 ? 1 : 0)} mi`;
    }
    return `${Number(km).toFixed(km < 10 ? 1 : 0)} km`;
  }

  window.EmploiPrefs = {
    applyAll,
    applyLanguage,
    applyCurrency,
    applyUnit,
    t,
    formatPrice,
    formatDistance,
    getState: () => ({ ...state }),
  };

  /* ═══════════════════ 7. BOOT ═══════════════════ */
  document.addEventListener("DOMContentLoaded", () => {
    // Applique immédiatement la langue/devise mémorisée localement, avant
    // même que profil-emploi.js n'ait fini de charger /emploi/api/preferences
    // (évite le flash "FR/EUR" au chargement).
    if (state.langue !== "fr") applyLanguage(state.langue);
    watchDom(() => state.langue);
  });
})();
