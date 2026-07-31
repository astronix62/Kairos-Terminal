// ============================================================
// PERSISTANCE SUPABASE — remplace loadState()/saveState() du fichier source
// ============================================================
// Principe : `state` reste un objet JS synchrone en mémoire, exactement
// comme dans le fichier original. Toute la logique métier (scoring,
// corrélations, rapports) continue de le lire sans un seul `await`.
//
// Ce qui change : au lieu d'écrire dans localStorage, on pousse vers
// Supabase en arrière-plan (fire-and-forget, avec gestion d'erreur),
// et au chargement on hydrate `state` depuis Supabase avant de démarrer
// le rendu.
//
// Conséquence acceptée : pas de fonctionnement hors-ligne (choix validé
// avec l'utilisateur). Chaque saveState() suppose une connexion active.

let currentUserId = null;

// ---------- Hydratation : Supabase -> state (objet JS) ----------
async function hydrateStateFromSupabase() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) return null;
  currentUserId = session.user.id;

  const [{ data: profileRow }, { data: daysRows }, { data: entriesRows }] = await Promise.all([
    supabaseClient.from('profile').select('*').eq('user_id', currentUserId).maybeSingle(),
    supabaseClient.from('days').select('*').eq('user_id', currentUserId),
    supabaseClient.from('entries').select('*').eq('user_id', currentUserId).order('entry_date', { ascending: true }),
  ]);

  // Si aucun profil n'existe encore (première connexion), on le crée avec les valeurs par défaut.
  let profileData = profileRow;
  if (!profileData) {
    const fresh = freshState(); // fonction déjà définie dans le moteur KAIROS
    const { data: created } = await supabaseClient
      .from('profile')
      .insert({ user_id: currentUserId, name: fresh.profile.name, rules: fresh.profile.rules, settings: {} })
      .select()
      .single();
    profileData = created;
  }

  // Reconstruction de l'objet `days` au format attendu par le moteur : { [iso]: {type, objectives, checklist} }
  const daysObj = {};
  (daysRows || []).forEach((row) => {
    daysObj[row.date] = {
      type: row.day_type,
      objectives: row.objectives || [],
      checklist: row.checklist || [],
    };
  });

  // Reconstruction des entries au format attendu : array plat avec les mêmes clés que le code source
  const entriesArr = (entriesRows || []).map((row) => ({
    id: row.id,
    date: row.entry_date,
    time: row.entry_time,
    mode: row.mode,
    dayType: row.day_type,
    setup: row.setup,
    grade: row.grade,
    context: row.context,
    emotion: row.emotion,
    energy: row.energy,
    planRespected: row.plan_respected,
    impulsive: row.impulsive,
    pnl: row.pnl,
    notes: row.notes,
    screenshot: row.screenshot_path ? null : null, // résolu à l'affichage via resolveScreenshotUrl()
    screenshotPath: row.screenshot_path, // conservé pour résolution paresseuse de l'URL signée
  }));

  return {
    profile: { name: profileData.name, rules: profileData.rules || [] },
    days: daysObj,
    entries: entriesArr,
    settings: {
      apiKey: localStorage.getItem('kairos_llm_key') || '', // la clé reste locale, jamais en base
      model: (profileData.settings && profileData.settings.model) || 'gpt-4o-mini',
      endpoint: (profileData.settings && profileData.settings.endpoint) || 'https://api.openai.com/v1/chat/completions',
      appearance: (profileData.settings && profileData.settings.appearance) || undefined,
      features: (profileData.settings && profileData.settings.features) || undefined,
      vacation: (profileData.settings && profileData.settings.vacation) || undefined,
      demo: false,
    },
    ui: (profileData.ui_state && Object.keys(profileData.ui_state).length) ? profileData.ui_state : { calMonth: todayISO().slice(0, 7) },
  };
}

// ---------- loadState() : remplace la version localStorage ----------
// Reste synchrone en apparence pour ne rien casser au boot() du fichier source :
// on initialise avec un état vide, puis on hydrate en arrière-plan et on
// relance le rendu une fois les données arrivées (voir boot() adapté dans app.js).
function loadState() {
  return null; // toujours null au premier appel synchrone ; l'hydratation réelle est asynchrone (voir boot())
}

// ---------- saveState() : remplace la version localStorage ----------
// Stratégie "diff naïf mais explicite" : on ne pousse que ce qui a plausiblement
// changé en comparant le nombre d'entrées / la présence de la clé de jour modifiée
// n'est pas trivial sans réécrire tout le state management. Choix pragmatique :
// on repousse profil + tous les jours + toutes les entrées à chaque save,
// en upsert (idempotent). Sur un usage mono-user avec un volume raisonnable
// (quelques centaines d'entrées), le coût réseau reste négligeable.
// Si le volume grossit significativement (>2000 entrées), il faudra passer
// à un système de tracking des lignes modifiées (dirty flags) — pas nécessaire maintenant.
let saveInFlight = false;
let savePending = false;

async function saveState() {
  if (!currentUserId) return; // pas encore authentifié / hydraté
  if (saveInFlight) { savePending = true; return; } // évite les écritures concurrentes qui s'écrasent
  saveInFlight = true;

  try {
    // Profil
    await supabaseClient.from('profile').update({
      name: state.profile.name,
      rules: state.profile.rules,
      settings: {
        model: state.settings.model,
        endpoint: state.settings.endpoint,
        appearance: state.settings.appearance,
        features: state.settings.features,
        vacation: state.settings.vacation,
      },
      ui_state: state.ui,
    }).eq('user_id', currentUserId);

    // Sauvegarde de la clé LLM en localStorage uniquement (jamais envoyée à Supabase)
    if (state.settings.apiKey) {
      localStorage.setItem('kairos_llm_key', state.settings.apiKey);
    } else {
      localStorage.removeItem('kairos_llm_key');
    }

    // Jours : upsert de tous les jours présents dans state.days
    const dayRows = Object.entries(state.days).map(([iso, d]) => ({
      user_id: currentUserId,
      date: iso,
      day_type: d.type,
      objectives: d.objectives || [],
      checklist: d.checklist || [],
    }));
    if (dayRows.length) {
      await supabaseClient.from('days').upsert(dayRows, { onConflict: 'user_id,date' });
    }

    // Entrées : upsert par id. Les entrées supprimées côté client (splice/filter)
    // doivent être supprimées explicitement — voir deleteEntryRemote() appelée
    // depuis les handlers de suppression dans app.js.
    if (state.entries.length) {
      const entryRows = state.entries.map((e) => ({
        id: e.id,
        user_id: currentUserId,
        entry_date: e.date,
        entry_time: e.time,
        mode: e.mode,
        day_type: e.dayType,
        setup: e.setup,
        grade: e.grade,
        context: e.context,
        emotion: e.emotion,
        energy: e.energy,
        plan_respected: e.planRespected,
        impulsive: e.impulsive,
        pnl: e.pnl,
        notes: e.notes,
        screenshot_path: e.screenshotPath || null,
      }));
      await supabaseClient.from('entries').upsert(entryRows, { onConflict: 'id' });
    }
  } catch (err) {
    console.error('Erreur de sauvegarde Supabase :', err);
    if (typeof toast === 'function') {
      toast('Erreur de synchronisation — vérifiez votre connexion. Vos modifications récentes peuvent ne pas être sauvegardées.', 'bad', 8000);
    }
  } finally {
    saveInFlight = false;
    if (savePending) { savePending = false; saveState(); } // rejoue le dernier save demandé pendant l'écriture en cours
  }
}

// ---------- Suppression explicite (upsert ne supprime jamais une ligne) ----------
async function deleteEntryRemote(entryId) {
  if (!currentUserId) return;
  await supabaseClient.from('entries').delete().eq('id', entryId).eq('user_id', currentUserId);
}
async function deleteDayRemote(iso) {
  if (!currentUserId) return;
  await supabaseClient.from('days').delete().eq('date', iso).eq('user_id', currentUserId);
}

// ---------- Upload screenshot vers Storage (remplace le dataURL base64) ----------
async function uploadScreenshot(dataURL, entryId) {
  if (!currentUserId || !dataURL) return null;
  const res = await fetch(dataURL);
  const blob = await res.blob();
  const path = `${currentUserId}/${entryId}.jpg`;
  const { error } = await supabaseClient.storage.from('kairos-screenshots').upload(path, blob, { upsert: true });
  if (error) {
    console.error('Erreur upload screenshot :', error);
    return null;
  }
  return path;
}

// ---------- Résolution d'une URL signée pour affichage (bucket privé) ----------
async function resolveScreenshotUrl(path) {
  if (!path) return null;
  const { data, error } = await supabaseClient.storage.from('kairos-screenshots').createSignedUrl(path, 3600);
  if (error) return null;
  return data.signedUrl;
}
