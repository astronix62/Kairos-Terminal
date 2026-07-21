# KAIROS — Discipline Cockpit

> **Mesurer le trader, pas le marché.**
> Application de structuration de la discipline, de la qualité du processus et — seulement ensuite — de la performance financière.

---

## 🚀 Démarrage

1. Téléchargez `kairos-cockpit.html`
2. Ouvrez-le dans un navigateur moderne (Chrome, Firefox, Safari, Edge) — double-clic suffit
3. L'application se lance avec **75 jours de données de démonstration** réalistes (améliorables et dégradées volontairement pour montrer les patterns : vendredi fragiles, impulsivité d'après 15h, fatigue…). Paramètres ⚙ → *Tout effacer* pour repartir de zéro avec vos vraies données.

> ℹ️ **Dans l'aperçu Arena**, les données vivent en mémoire (le sandbox bloque `localStorage`). Ouvrez le fichier directement dans votre navigateur : tout est alors **sauvegardé localement et persistant**.

---

## 📦 Ce qui est livré

Un **fichier HTML unique et autonome** (aucune dépendance, aucun CDN, fonctionne hors-ligne) qui implémente l'intégralité du cahier des charges :

| Bloc du cahier des charges | Statut | Emplacement |
|---|---|---|
| a) Dashboard focus & clarté | ✅ | Vue *Dashboard* — score du jour, état de la journée, objectifs, checklist, accès journal, actions récentes |
| b) Calendrier intelligent | ✅ | Vue *Calendrier* — 6 types de journées, alertes pop-up contextuelles non bloquantes (vendredi trading, 3e jour consécutif, journée mixte) |
| c) Journal double flux | ✅ | Vue *Journal* — trading / analyse, screenshots compressés, contexte, setup, émotion, énergie, plan, impulsivité, notes |
| d) Discipline Score (80/10/10) | ✅ | Vue *Scoring* — détail process/exécution/résultat, agrégation jour → semaine → mois |
| e) Profil trader | ✅ | Vue *Profil* — identité quantifiée : score global, streaks, drawdown max, meilleure période, forces/faiblesses |
| f) Statistiques comportementales | ✅ | Vue *Statistiques* — winrate (non central), profit factor, qualité setups A/B/C, horaires, jours, corrélations erreurs × conditions |
| g) Centre de progression | ✅ | Vue *Progression* — 60 jours, moyennes 12 semaines, comparatif 30 j vs période précédente |
| Moteur IA hybride | ✅ | Vue *Coach IA* — proactif (interventions contextuelles) + réactif (conversation) + rapports quotidien/hebdo/mensuel |
| Temps réel structurant | ✅ | Horloge live, phase de session (Europe/creux/US/fin), dashboard et coaching contextualisés, rapport quotidien auto à 20h |
| Non-blocage | ✅ | Aucune action n'est jamais empêchée : toasts, rappels du plan (⛨ dans la barre haute), alertes statistiques |
| Design cockpit sombre | ✅ | Thème sombre profond, cartes minimalistes, hiérarchie forte, peu d'éléments simultanés |

### Formule du Discipline Score
```
Processus   /80 : checklist (24) + journal complété (12) + plan respecté (26) + absence d'impulsion (18)
Exécution   /10 : qualité du setup A/B/C (trade) ou profondeur de l'analyse documentée
Résultat    /10 : volontairement marginal (et neutre les jours sans trade)
```

### Le moteur IA
Deux couches :
- **Moteur de règles local (toujours actif)** : analyse rétrospective, détection de patterns (« trades après 15h : winrate −X pts »), recommandation du type de journée optimal, rapports narratifs expliquant *ce qui s'améliore, ce qui se dégrade, pourquoi, et le levier prioritaire*.
- **Mode LLM (optionnel)** : Paramètres ⚙ → clé API (compatible OpenAI : endpoint/modèle configurables, fonctionne avec OpenAI, OpenRouter, Mistral, Ollama local…). Le coach envoie alors vos données temps réel (date, heure, phase de session, scores, stats, dernières entrées, règles du plan) comme contexte. Sans clé, tout reste pleinement fonctionnel en local.

---

## 🔧 Adaptations techniques (et comment brancher la cible réelle)

Le cahier des charges mentionnait **Supabase** et un **moteur IA connecté**. Dans cet environnement de livraison, j'ai adapté sans rien sacrifier aux fonctionnalités :

| Cible du cahier des charges | Implémentation livrée | Chemin de migration |
|---|---|---|
| Base centrale **Supabase** | `localStorage` (persistance navigateur) + export/import **JSON** et export **CSV** du journal | Le modèle de données (`state = {profile, days, entries, settings}`) est déjà structuré en tables. Créer dans Supabase : `profiles`, `days(date, type, objectives, checklist)`, `entries(...)`, puis remplacer `loadState()/saveState()` par des appels PostgREST — toute la logique métier reste inchangée |
| **IA** toujours connectée | Moteur de règles embarqué + slot LLM optionnel | Renseigner la clé API dans ⚙ (stockée uniquement en local). Pour la proactivité temps réel côté serveur : cron Supabase Edge Function qui génère les rapports et les pousse (notification) |
| **Screenshots** | Import manuel, compression canvas automatique (max 900 px, JPEG 72 %) stockée localement | Brancher un bucket Supabase Storage : remplacer l'affectation `shot = dataURL` par un `upload()` |
| Temps réel | Horloge + `Date` locale, conscience permanente date/heure/jour/phase de session | Identique en prod ; ajouter fuseau horaire marché si multi-places |

---

## 🧭 Philosophie d'utilisation

1. **Ouverture** → le Dashboard impose le focus : score, checklist, suggestion du coach. Rien d'autre.
2. **Avant le marché** → checklist de préparation (24 pts de score à eux seuls).
3. **Pendant** → le système n'empêche rien ; il rappelle le plan (bouton ⛨) et signale les créneaux à risque en pop-up.
4. **Après** → journal à chaud (trade **ou** analyse : une journée sans position reste mesurée).
5. **Soir / semaine / mois** → rapports du coach : pas une liste de chiffres, une explication + **un seul levier prioritaire**.

> Le trading est traité comme une **conséquence indirecte de la qualité du processus**.

---

## 📁 Fichiers
- `kairos-cockpit.html` — l'application complète
- `README.md` — ce document

*KAIROS v1.0 — Process 80 · Exécution 10 · Résultat 10.*
