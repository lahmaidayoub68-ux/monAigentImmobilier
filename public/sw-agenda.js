// sw-agenda.js — Service Worker pour notifications agenda hors page
const CACHE = "aigent-agenda-v1";
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Réception d'un message depuis la page pour démarrer le checker
self.addEventListener("message", (event) => {
  if (event.data?.type === "AGENDA_START") {
    const { token, apiOrigin } = event.data;
    // Stocker pour les checks périodiques
    self._agendaToken = token;
    self._agendaOrigin = apiOrigin;
    // Lancer immédiatement un check
    checkAgendaEvents(token, apiOrigin);
  }
  if (event.data?.type === "AGENDA_DISMISS") {
    const { evId } = event.data;
    markEventNotified(evId, self._agendaToken, self._agendaOrigin);
  }
});

// Vérification périodique via setInterval dans le SW
let _swInterval = null;

function startSwInterval(token, apiOrigin) {
  if (_swInterval) clearInterval(_swInterval);
  _swInterval = setInterval(() => {
    if (token) checkAgendaEvents(token, apiOrigin);
  }, CHECK_INTERVAL_MS);
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "AGENDA_START") {
    startSwInterval(event.data.token, event.data.apiOrigin);
  }
});

async function checkAgendaEvents(token, apiOrigin) {
  if (!token || !apiOrigin) return;
  try {
    const res = await fetch(`${apiOrigin}/api/agenda`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const events = await res.json();

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const nowMinutes = now.getHours() * 60 + now.getMinutes();

    for (const ev of events) {
      if (ev.date !== todayStr) continue;
      if (ev.notified) continue;
      const evTime = (ev.time || "").trim().slice(0, 5);
      if (!evTime) continue;

      const [evH, evM] = evTime.split(":").map(Number);
      const evMinutes = evH * 60 + evM;

      // Fenêtre : événement passé depuis moins de 8h et pas encore notifié
      if (nowMinutes >= evMinutes && nowMinutes - evMinutes <= 480) {
        await showSwNotification(ev, apiOrigin, token);
      }
    }
  } catch (e) {
    console.warn("[SW Agenda] check error:", e);
  }
}

async function showSwNotification(ev, apiOrigin, token) {
  const title = `📅 ${ev.name}`;
  const body = ev.description
    ? ev.description.slice(0, 80)
    : `Événement prévu à ${ev.time}`;

  // Vérifier si une notif pour cet event n'a pas déjà été affichée
  const tag = `agenda-${ev.id}`;
  const existing = await self.registration.getNotifications({ tag });
  if (existing.length > 0) return; // déjà affiché

  await self.registration.showNotification(title, {
    body,
    icon: "/images/logo.png",
    badge: "/images/logo.png",
    tag,
    requireInteraction: true,
    data: { evId: String(ev.id), apiOrigin, token },
    actions: [{ action: "dismiss", title: "Vu ✓" }],
  });

  // Marquer notifié en DB immédiatement
  await markEventNotified(String(ev.id), token, apiOrigin);
}

async function markEventNotified(evId, token, apiOrigin) {
  if (!evId || !token || !apiOrigin) return;
  try {
    await fetch(`${apiOrigin}/api/agenda/${evId}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ notified: true }),
    });
  } catch {}
}

// Clic sur la notification
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const { evId, apiOrigin, token } = event.notification.data || {};

  if (event.action === "dismiss" || !event.action) {
    markEventNotified(evId, token, apiOrigin);
  }

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(apiOrigin) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(apiOrigin + "/profil.html?section=agenda");
    }),
  );
});
