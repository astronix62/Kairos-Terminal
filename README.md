# KAIROS — Discipline Cockpit

> **Mesurer le trader, pas le marché.**  
> KAIROS est une application web de discipline trading : elle structure la préparation, mesure la qualité du processus, aide à documenter les décisions et transforme les données comportementales en axes de progression concrets.

---

## 🎯 Objectif principal

KAIROS ne cherche pas à prédire le marché ni à générer des signaux.  
Son rôle est de faciliter la réflexion, accélérer la prise de recul et rendre visibles les comportements qui améliorent ou dégradent l'exécution.

La philosophie reste simple :

1. **Préparer** la journée.
2. **Exécuter** uniquement selon le plan.
3. **Documenter** à chaud.
4. **Analyser** sans se noyer dans les chiffres.
5. **Corriger un seul levier prioritaire à la fois.**

L'application doit rester rapide, lisible et non prise de tête. Les nouvelles options sont donc pensées pour être utiles, désactivables et non bloquantes.

---

## ✅ Fonctionnalités déjà présentes

| Module | Rôle |
|---|---|
| **Dashboard** | Vue de focus : score du jour, checklist, objectifs, suggestion du coach, actions récentes. |
| **Calendrier intelligent** | Planification des journées : trading, analyse, backtest, formation, repos, mixte. Alertes contextuelles non bloquantes. |
| **Journal double flux** | Entrées de trading et d'analyse : setup, émotion, énergie, respect du plan, impulsivité, notes, screenshots. |
| **Discipline Score** | Score orienté processus : préparation, journal, plan, impulsivité, exécution, résultat financier marginal. |
| **Statistiques comportementales** | Patterns par horaires, jours, setups A/B/C, impulsivité, respect du plan, corrélations. |
| **Progression** | Suivi sur 60 jours, moyenne hebdomadaire, comparaison 30 jours vs période précédente. |
| **Profil trader** | Identité quantifiée : score global, streaks, drawdown, forces/faiblesses. |
| **Coach IA hybride** | Moteur local de règles + option LLM connectée si clé API configurée. |
| **Paramètres & données** | Profil, plan de trading, clé API, export/import JSON, export CSV, réinitialisation. |
| **Responsive mobile/tablette** | Interface adaptée aux petits écrans avec navigation mobile et modales optimisées. |

---

## 🎨 Personnalisation ajoutée

Une importance particulière est donnée à la personnalisation, sans transformer l'application en usine à gaz.

Dans **Paramètres → Apparence & personnalisation**, l'utilisateur peut désormais modifier l'ambiance globale de l'application.

### Thèmes disponibles

| Thème | Description |
|---|---|
| **basique** | Thème original de KAIROS : sombre, turquoise, analytique. |
| **Atlantique** | Bleu profond, frais et très lisible. |
| **Graphite** | Sobre, neutre, peu saturé, confortable pour longues sessions. |
| **Améthyste** | Violet calme, plus mental et introspectif. |
| **Forêt** | Vert profond, stable et reposant. |
| **Ambre** | Ambiance chaude, concentrée, moins clinique. |

Le thème actuel d'origine porte maintenant le nom **basique**.

### Couleurs personnalisables

L'utilisateur peut aussi activer ses propres couleurs :

- accent principal ;
- accent secondaire ;
- fond ;
- panneaux/cartes.

Un bouton permet de réinitialiser rapidement les couleurs du thème choisi.

### Densité et effets

Options ajoutées :

- **Densité confort** : interface plus respirante.
- **Densité compacte** : plus d'informations visibles à l'écran.
- **Effets normaux** : ambiance cockpit complète.
- **Effets discrets** : moins de glow, moins de flou, moins d'animations.

Ces options permettent d'adapter KAIROS selon le support, la fatigue visuelle ou la préférence personnelle.

---

## 🔔 Options activables / désactivables

Dans **Paramètres → Interventions & rappels**, certaines interventions automatiques peuvent être contrôlées :

- alertes contextuelles du calendrier ;
- message du coach à l'ouverture ;
- rappel du rapport quotidien à 20h.

Le principe reste inchangé : **aucune action n'est bloquée**. KAIROS informe, rappelle et mesure, mais ne force pas.

---

## 🧮 Discipline Score

Formule actuelle :

```text
Processus   /80 : checklist + journal complété + plan respecté + absence d'impulsion
Exécution   /10 : qualité du setup A/B/C ou profondeur de l'analyse
Résultat    /10 : volontairement marginal et secondaire
```

Le score ne cherche pas à féliciter le P&L. Il sert à identifier si le trader a respecté ce qu'il contrôle réellement.

---

## 🤖 Coach IA

Deux niveaux de fonctionnement :

### 1. Moteur local

Toujours disponible. Il analyse les données enregistrées et produit :

- rapports quotidiens, hebdomadaires et mensuels ;
- recommandations contextuelles ;
- détection de patterns comportementaux ;
- identification de forces/faiblesses ;
- rappel du levier prioritaire.

### 2. Mode LLM optionnel

Depuis les paramètres, une clé API compatible OpenAI peut être renseignée.  
La clé reste stockée localement dans le navigateur. Sans clé, l'application reste utilisable.

---

## 🧭 Roadmap validée, hors PWA pour le moment

L'application n'est pas encore transformée en application installable/PWA. Cette étape est volontairement gardée pour plus tard.

Les évolutions fonctionnelles validées pour rester dans le cœur de KAIROS sont :

1. **Suivi détaillé des règles violées** au lieu d'un simple “plan respecté / non respecté”.
2. **Ticket de pré-engagement avant trade** pour mesurer l'écart entre intention et exécution.
3. **Risk Guard non bloquant** : perte max, nombre de trades, heure limite, pertes consécutives.
4. **Protocole de pause / reset** après perte, impulsivité ou dérive émotionnelle.
5. **Levier prioritaire de la semaine** affiché clairement sur le dashboard.
6. **Revue guidée de fin de journée** avec synthèse rapide et action pour demain.
7. **Brouillons automatiques mobile** pour ne jamais perdre une entrée en cours.
8. **Recherche et filtres avancés dans le journal**.
9. **Suivi en R-multiple** en complément du P&L en euros.
10. **Mode Focus Session** pour n'afficher que l'essentiel pendant le marché.

Ces ajouts devront respecter une règle : **ne pas surcharger l'interface**. Les fonctions avancées doivent rester simples, rapides et configurables.

---

## 📁 Structure des fichiers

```text
index.html              Application principale
login.html              Page de connexion
css/style.css           Thème, responsive, personnalisation
js/kairos-engine.js     Logique métier, vues, scoring, coach, paramètres
js/persistence.js       Hydratation/sauvegarde Supabase
js/auth.js              Authentification
js/supabase-client.js   Client Supabase
README.md               Présentation et roadmap
```

---

## 🧠 Philosophie produit

KAIROS doit rester un cockpit de discipline, pas un tableau de bord surchargé.

Les réglages existent pour adapter l'application à l'utilisateur, pas pour lui ajouter de la charge mentale. L'objectif reste :

> **ouvrir, comprendre vite, agir juste, progresser proprement.**

*KAIROS — Process 80 · Exécution 10 · Résultat 10.*
