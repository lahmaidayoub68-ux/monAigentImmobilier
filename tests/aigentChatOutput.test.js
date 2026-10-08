import test from "node:test";
import assert from "node:assert/strict";
import { detectChatArtifactRequest, normalizeChatOutput } from "../services/aigentChatOutput.js";
import { __aiModelTestHooks } from "../services/aiParsee-aigent.js";

const parseJson = (value) => {
  const fenced = value.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  try { return JSON.parse(fenced); } catch { return null; }
};

test("normalise une réponse JSON clôturée et conserve les métadonnées", () => {
  const result = normalizeChatOutput('```json\n{"reply":"Plan clair.","title":"Plan de révisions"}\n```', parseJson);
  assert.equal(result.reply, "Plan clair.");
  assert.equal(result.payload.title, "Plan de révisions");
});

test("n'expose jamais un objet JSON mal formé dans la bulle de réponse", () => {
  const result = normalizeChatOutput('{"reply": "réponse tronquée",', parseJson);
  assert.equal(result.reply, "");
  assert.equal(result.payload, null);
});

test("garde le texte conversationnel brut quand le fournisseur n'a pas répondu en JSON", () => {
  const result = normalizeChatOutput("Voici trois étapes concrètes.", parseJson);
  assert.equal(result.reply, "Voici trois étapes concrètes.");
});

test("sépare le texte naturel d'un livrable JSON facultatif", () => {
  const result = normalizeChatOutput('Voici la synthèse.\n[[AIGENT_DATA]]{"title":"Comparaison","suggestions":["Évaluer les risques"]}[[/AIGENT_DATA]]', parseJson);
  assert.equal(result.reply, "Voici la synthèse.");
  assert.equal(result.payload.title, "Comparaison");
});

test("le filtre conversationnel accepte les réponses longues et les livrables JSON facultatifs", () => {
  const response = `Analyse structurée. ${"Une piste concrète à vérifier. ".repeat(50)} [[AIGENT_DATA]]{"artifact":{"type":"plan"}}[[/AIGENT_DATA]]`;
  assert.equal(__aiModelTestHooks.isUnusableOutput(response, { profile: "chat", maxChars: 900 }), false);
  assert.equal(__aiModelTestHooks.isUnusableOutput(response, { profile: "fast", maxChars: 900 }), false);
  assert.equal(__aiModelTestHooks.isUnusableOutput(response, { profile: "json", expectJson: true }), false);
});

test("conserve une réponse complète sans troncature artificielle", () => {
  const longReply = `## Analyse\n\n${"Une conclusion complète. ".repeat(3000).trimEnd()}`;
  assert.equal(normalizeChatOutput(longReply, parseJson).reply, longReply);
});

test("repère les demandes de livrables explicites et combinés", () => {
  assert.equal(detectChatArtifactRequest("Crée un tableau Excel et un graphique pour comparer ces options"), "tableau et graphique");
  assert.equal(detectChatArtifactRequest("Dessine un schéma du second degré"), "schéma ou carte");
  assert.equal(detectChatArtifactRequest("Rédige un compte rendu structuré"), "document");
  assert.equal(detectChatArtifactRequest("Prépare une checklist de lancement"), "plan");
  assert.equal(detectChatArtifactRequest("Aide-moi à clarifier ce problème"), "");
});
