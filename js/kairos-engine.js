"use strict";
/* ═══════════════════════════════════════════════════════════════
   KAIROS — Discipline Cockpit
   Application autonome (HTML/CSS/JS). Persistance : localStorage
   (fallback mémoire dans les environnements sandboxés).
   Le moteur IA fonctionne en local (moteur de règles contextuel)
   et peut optionnellement se connecter à une API LLM (OpenAI-compatible).
   ═══════════════════════════════════════════════════════════════ */

/* ---------- Utilitaires ---------- */
const $=s=>document.querySelector(s);
const $$=s=>[...document.querySelectorAll(s)];
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const pad=n=>String(n).padStart(2,"0");
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const now=()=>new Date();
const isoOf=d=>d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const todayISO=()=>isoOf(new Date());
function parseISO(s){const[a,b,c]=s.split("-").map(Number);return new Date(a,b-1,c);}
function addDays(iso,n){const d=parseISO(iso);d.setDate(d.getDate()+n);return isoOf(d);}
function fmtFR(iso){const d=parseISO(iso);return d.toLocaleDateString("fr-FR",{weekday:"short",day:"numeric",month:"short"});}
function fmtFull(iso){const d=parseISO(iso);return d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long",year:"numeric"});}
const dowOf=iso=>parseISO(iso).getDay(); // 0=dim
const hourOf=dt=>dt?parseInt(String(dt).split(":")[0],10):null;
function startOfWeek(iso){const d=parseISO(iso);const wd=(d.getDay()+6)%7;d.setDate(d.getDate()-wd);return isoOf(d);}
function avg(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}
function pct(a){return a.length?Math.round(100*a.filter(Boolean).length/a.length):0;}
const money=v=>v==null?"—":(v>=0?"+":"")+v.toFixed(0)+" €";

/* ---------- Stockage ---------- */
// loadState() et saveState() sont désormais définies dans js/persistence.js
// (persistance Supabase au lieu de localStorage). storageOK reste utilisé
// par le reste du moteur pour l'affichage de la notice, toujours vrai ici
// puisque Supabase gère ses propres erreurs réseau via toast().
let storageOK=true;
let state=null; // hydraté de façon asynchrone dans boot(), voir fin de fichier

/* ---------- Référentiels ---------- */
const DAY_TYPES={
  trading:{label:"Trading",cls:"type-trading",color:"#38e1c6"},
  analyse:{label:"Analyse",cls:"type-analyse",color:"#5aa7ff"},
  backtest:{label:"Backtest",cls:"type-backtest",color:"#9d8cff"},
  formation:{label:"Formation",cls:"type-formation",color:"#f5b544"},
  repos:{label:"Repos",cls:"type-repos",color:"#6e7f9e"},
  mix:{label:"Mixte",cls:"type-mix",color:"#3fd68c"},
};
const CHECKLIST_TEMPLATE=[
  "Revue macro & calendrier économique",
  "Niveaux clés tracés (supports / résistances)",
  "Plan de la journée écrit (scénarios + invalidation)",
  "État mental & énergie évalués honnêtement",
  "Risk maximum journalier défini",
  "Environnement de travail dégagé, notifications coupées",
];
const EMOTIONS=["Calme","Confiant","Neutre","Stressé","Fatigué","Frustré","Revanchard","Euphorique"];
const DEFAULT_RULES=[
  "Maximum 2 trades par jour",
  "Pas de nouveau trade après 16h30",
  "Setup écrit AVANT chaque entrée (entrée / stop / cible)",
  "Risk maximum : 0,75 % du capital par trade",
  "Pause obligatoire 12h30 – 14h00",
  "Pas de trade le vendredi après 15h00",
];

function freshState(){
  return{
    profile:{name:"Trader",rules:DEFAULT_RULES.slice()},
    days:{}, entries:[],
    settings:{apiKey:"",model:"gpt-4o-mini",endpoint:"https://api.openai.com/v1/chat/completions",demo:true},
    ui:{calMonth:todayISO().slice(0,7)},
  };
}

/* ═══════════════════════════════════════════════════════════════
   SEED — données de démonstration réalistes (75 jours)
   ═══════════════════════════════════════════════════════════════ */
function seedDemo(){
  state=freshState(); state.settings.demo=true;
  state.profile.name="Trader";
  const t=todayISO();
  const setups=["Breakout range asiatique","Pullback VWAP","Cassure OB H1","Retest ordre block","Continuation trend M15","Faux breakout — fade"];
  const ctxs=[
    "Macro calme, pas de publication majeure. DXY stable, indices en range.",
    "CPI US attendu 14h30 — réduction de taille prévue avant annonce.",
    "Ton hawkish BCE, EUR sous pression. Corrélation DXY surveillée.",
    "Ouverture US volatile, spreads élargis les 5 premières minutes.",
    "Session Londres liquide, tendance claire dès 09h30.",
    "Marché en compression 3 jours, expansion probable.",
  ];
  const notesGood=[
    "Plan respecté de bout en bout. Entrée sur confirmation, sortie partielle à +1R.",
    "Bonne patience : attendu le retest au lieu de chasser la cassure.",
    "Analyse propre, niveaux respectés. Aucun trade = bonne décision aujourd'hui.",
    "Exécution nette, pas d'hésitation. Journal complété à chaud.",
  ];
  const notesBad=[
    "Entrée impulsive après un stop touché, volonté de 'refaire'. À corriger.",
    "Trade pris tard, fatigue visible. Pas dans le plan.",
    "Taille doublée sans raison. Émotion > process.",
    "FOMO sur un move déjà parti. Résultat : stop chassé.",
  ];
  for(let i=74;i>=0;i--){
    const iso=addDays(t,-i);
    const wd=dowOf(iso);
    const progress=(74-i)/74; // amélioration graduelle
    const form=clamp(0.34+0.34*progress+ (Math.random()-0.5)*0.22,0.05,0.97);
    const weekend=wd===0||wd===6;
    let type;
    if(weekend){type=Math.random()<0.72?"repos":(Math.random()<0.5?"analyse":"formation");}
    else{
      const r=Math.random();
      type=r<0.42?"trading":r<0.66?"analyse":r<0.76?"backtest":r<0.84?"formation":r<0.95?"repos":"mix";
    }
    // journée
    const doneRate=type==="repos"&&Math.random()<0.5?0:clamp(form+(Math.random()-0.5)*0.3,0,1);
    const items=CHECKLIST_TEMPLATE.map(label=>({label,done:Math.random()<doneRate}));
    const objs=type==="trading"?["Max 2 trades","Exécuter le plan sans déviation","Revue 15h00"]:
              type==="analyse"?["Étude de 3 configurations","Backtest express du setup A"]:
              type==="backtest"?["50 itérations du setup pullback"]:
              type==="formation"?["Module gestion du risque"]:["Récupération complète"];
    state.days[iso]={type,objectives:objs,checklist:items};
    // entrées
    if(type==="trading"||type==="mix"){
      const n=type==="mix"?1:1+Math.floor(Math.random()*2.4);
      for(let k=0;k<n;k++){
        const late=Math.random()<(0.30-0.18*progress);
        const hour=late?15+Math.floor(Math.random()*4):8+Math.floor(Math.random()*7);
        const min=Math.floor(Math.random()*60);
        const impulsive=Math.random()<(0.26-0.2*progress+(late?0.12:0)+(wd===5?0.08:0));
        const energy=impulsive?1+Math.floor(Math.random()*2):2+Math.floor(Math.random()*4);
        const gradeR=Math.random()+ (impulsive?-0.25:0)+(form-0.5)*0.3;
        const grade=gradeR>0.72?"A":gradeR>0.4?"B":"C";
        const planOK=!impulsive&&Math.random()<0.78+0.2*progress;
        const winP=clamp(0.50+0.14*progress+(grade==="A"?0.10:grade==="C"?-0.12:0)-(hour>=15?0.15:0)-(wd===5?0.10:0)-(impulsive?0.18:0),0.12,0.8);
        const win=Math.random()<winP;
        const pnl=Math.round((win?(0.4+Math.random()*2.1):-(0.4+Math.random()*0.9))*(50+Math.random()*40));
        const emo=impulsive?(Math.random()<0.5?"Frustré":"Revanchard"):(win?(Math.random()<0.5?"Confiant":"Calme"):(Math.random()<0.4?"Neutre":"Fatigué"));
        state.entries.push({
          id:uid(),date:iso,time:pad(hour)+":"+pad(min),mode:"trading",dayType:type,
          setup:setups[Math.floor(Math.random()*setups.length)],grade,
          context:ctxs[Math.floor(Math.random()*ctxs.length)],
          emotion:emo,energy,planRespected:planOK,impulsive,
          pnl,notes:(impulsive||!planOK?notesBad:notesGood)[Math.floor(Math.random()*4)],
          screenshot:null,
        });
      }
    }else if(type==="analyse"||type==="backtest"||type==="formation"){
      if(Math.random()<0.8){
        const hour=8+Math.floor(Math.random()*9);
        state.entries.push({
          id:uid(),date:iso,time:pad(hour)+":"+pad(Math.floor(Math.random()*60)),
          mode:"analyse",dayType:type,
          setup:setups[Math.floor(Math.random()*setups.length)],
          grade:Math.random()<0.4+0.3*progress?"A":(Math.random()<0.6?"B":"C"),
          context:ctxs[Math.floor(Math.random()*ctxs.length)],
          emotion:Math.random()<0.7?"Calme":"Neutre",
          energy:3+Math.floor(Math.random()*3),
          planRespected:Math.random()<0.7+0.25*progress,
          impulsive:Math.random()<0.05,
          pnl:null,screenshot:null,
          notes:Math.random()<0.5?"Cartographie des zones clés pour la semaine. Aucun trade nécessaire — journée productive.":"Étude du setup : conditions de validité listées, 3 exemples historiques documentés.",
        });
      }
    }
  }
  // objectifs & checklist d'aujourd'hui
  const td=state.days[t]||{type:"trading",objectives:[],checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))};
  td.type=td.type||"trading";
  td.objectives=["Revue macro + calendrier 14h30","Maximum 2 trades","Journal complété à chaud"];
  state.days[t]=td;
  saveState();
}

/* ═══════════════════════════════════════════════════════════════
   MOTEUR DE SCORING — Discipline Score
   Process 80 · Exécution/Setup 10 · Résultat 10
   ═══════════════════════════════════════════════════════════════ */
function entriesOn(iso){return state.entries.filter(e=>e.date===iso).sort((a,b)=>(a.time||"").localeCompare(b.time||""));}
function dayType(iso){
  const d=state.days[iso];
  if(d&&d.type)return d.type;
  const es=entriesOn(iso);
  if(!es.length)return null;
  return es.some(e=>e.mode==="trading")?"trading":"analyse";
}
function computeDayScore(iso){
  const day=state.days[iso]; const es=entriesOn(iso);
  const type=dayType(iso);
  if(!day&&!es.length)return null;
  const trades=es.filter(e=>e.mode==="trading");
  // Repos sans exécution
  if(type==="repos"&&trades.length===0){
    return{total:78,process:62,exec:8,result:8,label:"Repos respecté",type};
  }
  // Process /80
  let pCheck=0,pJournal=0,pPlan=0,pImpulse=0;
  if(day&&day.checklist&&day.checklist.length){
    pCheck=24*(day.checklist.filter(i=>i.done).length/day.checklist.length);
  }
  pJournal=es.length?12:0;
  if(trades.length){pPlan=26*avg(trades.map(e=>e.planRespected?1:0));}
  else if(type==="analyse"||type==="backtest"||type==="formation"){pPlan=es.length?20:8;}
  if(trades.length){pImpulse=18*(1-avg(trades.map(e=>e.impulsive?1:0)));}
  else{pImpulse=day?14:8;}
  const process=clamp(pCheck+pJournal+pPlan+pImpulse,0,80);
  // Exécution /10
  let exec;
  if(trades.length){const gm={A:10,B:6.5,C:3};exec=avg(trades.map(e=>gm[e.grade]||5));}
  else if(es.length){const e=es[0];const ql=clamp(((e.notes||"").length+(e.context||"").length)/70,0,1);exec=2+8*ql;}
  else{exec=day?5:3;}
  // Résultat /10
  let result;
  if(trades.length){
    const withPnl=trades.filter(e=>e.pnl!=null);
    if(withPnl.length){
      const sum=withPnl.reduce((a,e)=>a+e.pnl,0);
      result=sum>80?10:sum>0?8.5:sum>-60?6:3.5;
    }else result=6;
  }else if(type==="repos"){result=8;}
  else{result=7;} // valeur neutre du process pour les jours sans trade
  const total=Math.round(process+exec+result);
  return{total,process:Math.round(process),exec:Math.round(exec),result:Math.round(result),type,type2:type,label:null};
}
function scoreColor(s){return s>=75?"var(--good)":s>=55?"var(--warn)":"var(--bad)";}
function scorePill(s){return s>=75?"good":s>=55?"warn":"bad";}

function scoredDays(fromIso,toIso){
  const out=[];let d=fromIso;
  while(d<=toIso){const s=computeDayScore(d);if(s)out.push({date:d,...s});d=addDays(d,1);}
  return out;
}
function weekScore(isoAny){
  const s=startOfWeek(isoAny);const days=scoredDays(s,addDays(s,6));
  return days.length?Math.round(avg(days.map(d=>d.total))):null;
}
function monthScore(ym){
  const first=ym+"-01";const last=ym+"-28"; // simplification robuste
  const days=scoredDays(first,last).filter(d=>d.date.slice(0,7)===ym);
  return days.length?Math.round(avg(days.map(d=>d.total))):null;
}

/* ═══════════════════════════════════════════════════════════════
   STATISTIQUES COMPORTEMENTALES
   ═══════════════════════════════════════════════════════════════ */
function allTrades(){return state.entries.filter(e=>e.mode==="trading"&&e.pnl!=null);}
function winRate(list){const l=list.length?list:allTrades();return l.length?Math.round(100*l.filter(e=>e.pnl>0).length/l.length):null;}
function profitFactor(){
  const l=allTrades();
  const g=l.filter(e=>e.pnl>0).reduce((a,e)=>a+e.pnl,0);
  const b=Math.abs(l.filter(e=>e.pnl<0).reduce((a,e)=>a+e.pnl,0));
  if(!g&&!b)return null;
  return b===0?9.9:Math.round(100*g/b)/100;
}
function byHourBuckets(){
  const buckets=[["08–10",8,10],["10–12",10,12],["12–14",12,14],["14–16",14,16],["16–18",16,18],["18h+",18,24]];
  return buckets.map(([label,a,b])=>{
    const l=allTrades().filter(e=>{const h=hourOf(e.time);return h!=null&&h>=a&&h<b;});
    return{label,value:winRate(l),n:l.length};
  });
}
function byWeekday(){
  const names=["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
  return[1,2,3,4,5].map(d=>{
    const l=allTrades().filter(e=>dowOf(e.date)===d);
    return{label:names[d],value:winRate(l),n:l.length};
  });
}
function byGrade(){
  return["A","B","C"].map(g=>{
    const l=allTrades().filter(e=>e.grade===g);
    return{label:"Setup "+g,value:winRate(l),n:l.length,pnl:l.reduce((a,e)=>a+e.pnl,0)};
  });
}
function planRespectRate(){const l=allTrades();return pct(l.map(e=>e.planRespected));}
function impulsiveRate(){const l=allTrades();return pct(l.map(e=>e.impulsive));}
function streaks(){
  // série de jours consécutifs (en partant d'aujourd'hui) avec score>=70 et pas d'impulsion
  let cur=0,t= todayISO();
  while(true){
    const s=computeDayScore(t);
    const bad=entriesOn(t).some(e=>e.impulsive);
    if(s&&s.total>=70&&!bad){cur++;t=addDays(t,-1);}else break;
  }
  // meilleure série historique
  let best=0,run=0;const all=scoredDays(addDays(todayISO(),-74),todayISO());
  for(const d of all){
    const bad=entriesOn(d.date).some(e=>e.impulsive);
    if(d.total>=70&&!bad){run++;best=Math.max(best,run);}else run=0;
  }
  return{cur,best:Math.max(best,cur)};
}
function drawdownMax(){
  const l=allTrades().sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time));
  let eq=0,peak=0,dd=0;
  for(const e of l){eq+=e.pnl;peak=Math.max(peak,eq);dd=Math.min(dd,eq-peak);}
  return Math.round(dd);
}
function bestPeriod(){
  const byM={};
  for(const d of scoredDays(addDays(todayISO(),-74),todayISO())){
    const m=d.date.slice(0,7);(byM[m]=byM[m]||[]).push(d.total);
  }
  let best=null,bv=-1;
  for(const m in byM){const v=avg(byM[m]);if(v>bv){bv=v;best=m;}}
  return best?{month:best,score:Math.round(bv)}:null;
}
function correlations(){
  const out=[];const l=allTrades();
  const before=l.filter(e=>hourOf(e.time)!=null&&hourOf(e.time)<15);
  const after=l.filter(e=>hourOf(e.time)!=null&&hourOf(e.time)>=15);
  if(before.length>=3&&after.length>=3){
    const wb=winRate(before),wa=winRate(after);
    if(wa<wb-5)out.push({sev:"warn",txt:`Les trades pris <b>après 15h</b> ont un winrate de <b>${wa}%</b> contre <b>${wb}%</b> avant 15h (−${wb-wa} pts).`});
    else if(wa>wb+5)out.push({sev:"good",txt:`Meilleure exécution l'après-midi : <b>${wa}%</b> après 15h vs <b>${wb}%</b> le matin.`});
  }
  const fri=l.filter(e=>dowOf(e.date)===5),other=l.filter(e=>dowOf(e.date)!==5&&dowOf(e.date)!==0&&dowOf(e.date)!==6);
  if(fri.length>=3&&other.length>=5){
    const wf=winRate(fri),wo=winRate(other);
    if(wf<wo-5)out.push({sev:"bad",txt:`Le <b>vendredi</b>, winrate de <b>${wf}%</b> vs <b>${wo}%</b> le reste de la semaine. Pattern à risque identifié.`});
  }
  const imp=l.filter(e=>e.impulsive),calm=l.filter(e=>!e.impulsive);
  if(imp.length>=2&&calm.length>=3){
    const wi=winRate(imp),wc=winRate(calm);
    if(wi<wc)out.push({sev:"bad",txt:`Trades <b>impulsifs</b> : ${wi}% de réussite contre ${wc}% en exécution disciplinée (${imp.length} occurrences).`});
  }
  const mix=l.filter(e=>e.dayType==="mix"),pure=l.filter(e=>e.dayType==="trading");
  if(mix.length>=2&&pure.length>=3&&winRate(mix)<winRate(pure)-5){
    out.push({sev:"warn",txt:`Performance en baisse les jours <b>mixtes</b> (analyse + trading) : ${winRate(mix)}% vs ${winRate(pure)}% en journée trading pure.`});
  }
  const a=byGrade();
  if(a[0].n>=2&&a[2].n>=2&&a[0].value>a[2].value+8){
    out.push({sev:"good",txt:`Les setups <b>grade A</b> surperforment nettement (${a[0].value}% vs ${a[2].value}% en C) — la sélection paie.`});
  }
  const tired=state.entries.filter(e=>e.mode==="trading"&&e.energy<=2&&e.pnl!=null);
  const fresh=state.entries.filter(e=>e.mode==="trading"&&e.energy>=4&&e.pnl!=null);
  if(tired.length>=3&&fresh.length>=3&&winRate(tired)<winRate(fresh)-5){
    out.push({sev:"warn",txt:`Corrélation fatigue : <b>${winRate(tired)}%</b> de réussite quand l'énergie est ≤ 2/5, contre <b>${winRate(fresh)}%</b> à ≥ 4/5.`});
  }
  return out;
}
function strengthsWeaknesses(){
  const s=[],w=[];
  const pr=planRespectRate();
  (pr>=75?s:w).push(`Respect du plan : ${pr}%`);
  const ir=impulsiveRate();
  (ir<=12?s:w).push(`Impulsivité : ${ir}% des trades`);
  const gA=byGrade()[0];
  if(gA.n>=3)(gA.value>=55?s:w).push(`Setups A : ${gA.value}% de réussite`);
  const st=streaks();
  (st.cur>=5?s:w).push(`Série de discipline en cours : ${st.cur} j`);
  const ana=state.entries.filter(e=>e.mode==="analyse").length;
  (ana>=15?s:w).push(`${ana} journées d'analyse documentées`);
  return{s,w};
}

/* ═══════════════════════════════════════════════════════════════
   TEMPS RÉEL — horloge, phase de session, conscience contextuelle
   ═══════════════════════════════════════════════════════════════ */
function sessionPhase(d){
  const h=d.getHours(),wd=d.getDay();
  if(wd===0||wd===6)return"Marchés fermés — récupération & préparation";
  if(h<7)return"Pré-ouverture — préparation mentale";
  if(h<11)return"Session Europe — liquidité élevée";
  if(h<14)return"Creux de mi-journée — vigilance réduite";
  if(h<18)return"Session US — volatilité élevée";
  if(h<22)return"Fin de session — risque de surtrading";
  return"Hors marché — récupération";
}
function tickClock(){
  const d=now();
  $("#clockTime").textContent=pad(d.getHours())+":"+pad(d.getMinutes())+":"+pad(d.getSeconds());
  $("#clockDate").textContent=d.toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"});
  $("#sessionPhase").textContent=sessionPhase(d);
}

/* ═══════════════════════════════════════════════════════════════
   MOTEUR IA — coach contextuel (règles locales + option LLM)
   ═══════════════════════════════════════════════════════════════ */
function mdToHtml(md){
  const lines=esc(md).split("\n");
  let html="",inUl=false;
  for(const ln of lines){
    if(/^[-•] /.test(ln)){if(!inUl){html+="<ul>";inUl=true;}html+="<li>"+ln.replace(/^[-•] /,"")+"</li>";continue;}
    if(inUl){html+="</ul>";inUl=false;}
    if(/^#### /.test(ln))html+="<h4>"+ln.slice(5)+"</h4>";
    else if(ln.trim()==="")html+="<br>";
    else html+=ln+"<br>";
  }
  if(inUl)html+="</ul>";
  return html.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>");
}
function dailyReport(iso){
  const s=computeDayScore(iso);const es=entriesOn(iso);const day=state.days[iso];
  const trades=es.filter(e=>e.mode==="trading");
  const pnl=trades.reduce((a,e)=>a+(e.pnl||0),0);
  let r=`#### Rapport quotidien — ${fmtFull(iso)}\n`;
  if(!s){return r+"Aucune donnée enregistrée pour cette journée. Complète ton journal pour générer l'analyse.\n";}
  r+=`**Discipline Score : ${s.total}/100** (process ${s.process}/80 · exécution ${s.exec}/10 · résultat ${s.result}/10)\n\n`;
  if(day)r+=`Journée planifiée : **${DAY_TYPES[day.type]?DAY_TYPES[day.type].label:day.type}**\n`;
  if(day&&day.checklist){
    const done=day.checklist.filter(i=>i.done).length;
    r+=`Checklist de préparation : ${done}/${day.checklist.length} — ${done>=5?"préparation solide":done>=3?"préparation partielle":"préparation insuffisante, c'est souvent là que la journée se joue"}.\n`;
  }
  if(trades.length){
    r+=`\n${trades.length} trade(s) exécuté(s) · P&L : **${money(pnl)}** · respect du plan : ${pct(trades.map(e=>e.planRespected))}%\n`;
    const imp=trades.filter(e=>e.impulsive);
    if(imp.length)r+=`⚠ **${imp.length} action(s) impulsive(s)** détectée(s) — le coût de discipline dépasse largement le P&L du jour.\n`;
  }else{
    r+=`\nAucun trade — ${es.length?"journée d'analyse documentée, productive même sans position.":"aucune trace dans le journal : une journée non mesurée est une journée perdue pour le processus."}\n`;
  }
  const wk=weekScore(iso);
  if(wk)r+=`\nScore hebdomadaire en cours : **${wk}/100**.\n`;
  r+=`\n#### Levier prioritaire\n`;
  if(s.process<55)r+=`Le levier n'est pas la technique mais la **préparation** : checklist complète demain matin avant toute analyse de marché.`;
  else if(trades.some(e=>e.impulsive))r+=`Travailler le **circuit de pause** : quand l'impulsion monte, 10 minutes loin des écrans avant toute décision.`;
  else if(s.total>=80)r+=`Excellente journée de processus. Levier : **maintenir** — la régularité est plus rare que la performance.`;
  else r+=`Consolider l'**exécution** : un seul setup, un plan écrit, rien d'autre.`;
  return r;
}
function weeklyReport(){
  const t=todayISO();const s0=startOfWeek(t);const days=scoredDays(s0,t);
  const prev=scoredDays(addDays(s0,-7),addDays(s0,-1));
  let r=`#### Rapport hebdomadaire\n`;
  if(!days.length)return r+"Pas encore de jours scorés cette semaine.\n";
  const sc=Math.round(avg(days.map(d=>d.total)));
  const psc=prev.length?Math.round(avg(prev.map(d=>d.total))):null;
  r+=`**Discipline Score de la semaine : ${sc}/100**`;
  if(psc!=null)r+=` (${sc>=psc?"▲ +":"▼ "}${sc-psc} vs semaine dernière)`;
  r+="\n\n";
  const tr=allTrades().filter(e=>e.date>=s0&&e.date<=t);
  if(tr.length){
    r+=`Trades : ${tr.length} · winrate ${winRate(tr)}% · P&L ${money(tr.reduce((a,e)=>a+e.pnl,0))}\n`;
    r+=`Respect du plan : **${pct(tr.map(e=>e.planRespected))}%** · impulsivité : ${pct(tr.map(e=>e.impulsive))}%\n\n`;
  }
  const imp=tr.filter(e=>e.impulsive);
  r+=`#### Ce qui s'améliore\n`;
  const impr=[];
  if(psc!=null&&sc>psc)impr.push(`Discipline globale en hausse (+${sc-psc} pts).`);
  const early=tr.filter(e=>hourOf(e.time)!=null&&hourOf(e.time)<15);
  if(early.length>=2&&winRate(early)>=55)impr.push(`Exécution matinale propre (${winRate(early)}% de réussite).`);
  if(pct(tr.map(e=>e.planRespected))>=75)impr.push(`Le plan est respecté dans ${pct(tr.map(e=>e.planRespected))}% des cas — c'est le cœur du système.`);
  r+=(impr.length?impr.map(x=>"- "+x).join("\n"):"- Stabilité du processus sur la semaine.")+"\n\n";
  r+=`#### Ce qui se dégrade / points de vigilance\n`;
  const wors=[];
  if(imp.length)wors.push(`${imp.length} trade(s) impulsif(s), dont ${imp.filter(e=>hourOf(e.time)>=15).length} après 15h.`);
  const fri=tr.filter(e=>dowOf(e.date)===5);
  if(fri.length&&winRate(fri)<45)wors.push(`Vendredi fragile : ${winRate(fri)}% de réussite.`);
  if(psc!=null&&sc<psc)wors.push(`Recul de ${psc-sc} pts du score vs semaine dernière.`);
  r+=(wors.length?wors.map(x=>"- "+x).join("\n"):"- Rien de significatif — maintenir le cap.")+"\n\n";
  r+=`#### Levier prioritaire de la semaine prochaine\n`;
  if(imp.length>=2)r+=`**Zéro impulsion** : c'est le levier à plus fort rendement. Chaque impulsion évitée vaut plus qu'un bon trade.`;
  else if(sc<70)r+=`**Checklist non négociable** : 100% de complétion avant toute ouverture de graphique.`;
  else r+=`**Constance** : reproduire exactement cette structure de semaine.`;
  return r;
}
function monthlyReport(){
  const ym=todayISO().slice(0,7);
  const days=scoredDays(ym+"-01",todayISO()).filter(d=>d.date.slice(0,7)===ym);
  const pm=parseISO(ym+"-01");pm.setMonth(pm.getMonth()-1);
  const pym=isoOf(pm).slice(0,7);
  const pdays=scoredDays(pym+"-01",pym+"-28").filter(d=>d.date.slice(0,7)===pym);
  let r=`#### Rapport mensuel — synthèse stratégique\n`;
  if(!days.length)return r+"Pas de données ce mois-ci.\n";
  const sc=Math.round(avg(days.map(d=>d.total)));
  const psc=pdays.length?Math.round(avg(pdays.map(d=>d.total))):null;
  r+=`**Discipline Score du mois : ${sc}/100**`;
  if(psc!=null)r+=` (${sc>=psc?"▲ +":"▼ "}${sc-psc} vs ${pym})`;
  r+="\n\n";
  const tr=allTrades().filter(e=>e.date.slice(0,7)===ym);
  if(tr.length)r+=`${tr.length} trades · winrate ${winRate(tr)}% · profit factor ${profitFactor()||"—"} · P&L ${money(tr.reduce((a,e)=>a+e.pnl,0))}\n\n`;
  r+=`#### Lecture structurelle\n`;
  const pts=[];
  if(psc!=null){pts.push(sc>psc+4?`La trajectoire est haussière : le processus se consolide mois après mois.`:sc<psc-4?`Inflexion baissière du processus : identifier ce qui a changé (routine, sommeil, contexte de marché).`:`Stabilité structurelle : la base est posée, place à l'optimisation.`);}
  const c=correlations();
  if(c.length)pts.push(`Patterns dominants : ${c[0].txt.replace(/<[^>]+>/g,"")}`);
  r+=pts.map(x=>"- "+x).join("\n")+"\n\n";
  r+=`#### Cap du mois prochain\n`;
  r+=sc>=75?`Objectif : **tenir ≥ ${sc}** de moyenne et viser la réduction des erreurs critiques de 50%. Une seule obsession : la constance.`
          :`Objectif : **remonter au-dessus de 75** en verrouillant la préparation (checklist) et en éliminant les trades hors plan. Le P&L suivra mécaniquement.`;
  return r;
}
function proactiveInsights(){
  const out=[];const t=todayISO();const d=now();
  // contexte temps réel
  const type=dayType(t);
  if(d.getDay()===5&&d.getHours()>=14&&(type==="trading"||type==="mix")){
    out.push({sev:"bad",txt:`<b>Vendredi après-midi + trading</b> : ton historique montre une nette dégradation sur ce créneau. Envisage de basculer la journée en analyse.`});
  }
  if(d.getHours()>=18&&type==="trading"&&entriesOn(t).filter(e=>e.mode==="trading").length){
    out.push({sev:"warn",txt:`Fin de session : le risque de <b>surtrading</b> augmente fortement après 18h. Clôture du journal et sortie des écrans recommandées.`});
  }
  const wk=startOfWeek(t);
  const wImp=allTrades().filter(e=>e.date>=wk&&e.impulsive).length;
  if(wImp>=2)out.push({sev:"bad",txt:`<b>${wImp} actions impulsives</b> cette semaine, dont sur des setups pourtant bien notés. Le problème n'est pas la lecture du marché, c'est l'exécution.`});
  const st=streaks();
  if(st.cur>=3)out.push({sev:"good",txt:`Série de discipline en cours : <b>${st.cur} jours</b> consécutifs au-dessus de 70 sans impulsion. Protège cette série.`});
  const s=computeDayScore(t);
  if(!s&&d.getHours()>=9&&type&&type!=="repos")out.push({sev:"warn",txt:`Aucune trace dans le journal aujourd'hui. La checklist de préparation est le premier levier du Discipline Score.`});
  for(const c of correlations().slice(0,2))out.push({sev:c.sev,txt:c.txt});
  const s30=scoredDays(addDays(t,-30),t),sp=scoredDays(addDays(t,-60),addDays(t,-31));
  if(s30.length>=5&&sp.length>=5){
    const a=Math.round(avg(s30.map(x=>x.total))),b=Math.round(avg(sp.map(x=>x.total)));
    if(a-b>=5)out.push({sev:"good",txt:`Progression confirmée : <b>+${a-b} pts</b> de Discipline Score sur 30 jours vs la période précédente.`});
    else if(b-a>=5)out.push({sev:"warn",txt:`Recul de ${b-a} pts sur 30 jours. Le rapport hebdomadaire identifie le levier à retravailler en priorité.`});
  }
  return out;
}
function suggestedDayType(){
  const d=now();const t=todayISO();const wd=d.getDay();
  const st=streaks();
  const recentTrades=scoredDays(addDays(t,-3),addDays(t,-1)).filter(x=>x.type==="trading").length;
  if(wd===0||wd===6)return{type:"repos",why:"Week-end : la récupération fait partie du processus. Une analyse légère est possible, mais le repos est un choix de performance."};
  if(wd===5&&d.getHours()>=12)return{type:"analyse",why:"Vendredi après-midi : ton historique est fragile sur ce créneau. Une journée analyse préserve le capital et le Discipline Score."};
  if(recentTrades>=3)return{type:"repos",why:"Trois journées de trading consécutives : la fatigue décisionnelle s'accumule. Un repos ou une formation protège la qualité des prochaines exécutions."};
  if(st.cur===0){const s=computeDayScore(addDays(t,-1));if(s&&s.total<55)return{type:"backtest",why:"Journée d'hier en dessous de 55 : retravailler le setup en backtest avant de risquer du capital réel."};}
  return{type:"trading",why:"Conditions de processus favorables : préparation complète, puis exécution stricte du plan."};
}
async function coachReply(userMsg){
  const key=state.settings.apiKey.trim();
  const m=userMsg.toLowerCase();
  // Mode LLM distant (optionnel)
  if(key){
    try{
      const t=todayISO();
      const ctx={
        date:t, heure:pad(now().getHours())+":"+pad(now().getMinutes()),
        score_jour:computeDayScore(t), score_semaine:weekScore(t),
        phase_session:sessionPhase(now()),
        stats:{winrate:winRate(allTrades()),profit_factor:profitFactor(),respect_plan:planRespectRate(),impulsivite:impulsiveRate()},
        correlations:correlations().map(c=>c.txt.replace(/<[^>]+>/g,"")),
        dernieres_entrees:state.entries.slice(-8).map(e=>({date:e.date,heure:e.time,mode:e.mode,setup:e.setup,grade:e.grade,plan:e.planRespected,impulsif:e.impulsive,pnl:e.pnl})),
        regles_plan:state.profile.rules,
      };
      const res=await fetch(state.settings.endpoint,{
        method:"POST",
        headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},
        body:JSON.stringify({
          model:state.settings.model,
          messages:[
            {role:"system",content:"Tu es le coach de discipline de trading KAIROS. Tu mesures le trader, pas le marché. Réponds en français, de façon directe et concrète, en t'appuyant UNIQUEMENT sur les données fournies. Priorité : processus > exécution > résultat. Voici les données temps réel : "+JSON.stringify(ctx)},
            {role:"user",content:userMsg}
          ],
          max_tokens:700,
        }),
      });
      if(res.ok){const j=await res.json();const txt=j.choices&&j.choices[0]&&j.choices[0].message&&j.choices[0].message.content;if(txt)return mdToHtml(txt);}
      throw new Error("HTTP "+res.status);
    }catch(e){
      return mdToHtml("*(API LLM indisponible : "+esc(e.message)+" — bascule sur le moteur local)*\n\n"+localReply(m));
    }
  }
  return mdToHtml(localReply(m));
}
function localReply(m){
  const t=todayISO();
  if(/^(bonjour|bonsoir|salut|hello|coucou|hey|yo)\b/.test(m)){
    const s=computeDayScore(t);
    return `Bonjour ${esc(state.profile.name)}. ${s?`Discipline Score du jour : **${s.total}/100**.`:"Aucune donnée aujourd'hui — commence par ta checklist de préparation."} Que veux-tu analyser ? (journée, semaine, erreurs, setups, recommandation…)`;
  }
  if(/semaine|hebdo/.test(m))return weeklyReport();
  if(/mois|mensuel/.test(m))return monthlyReport();
  if(/jour|aujourd|daily|quotidien/.test(m))return dailyReport(t);
  if(/erreur|faut|d[ée]rive|impuls/.test(m)){
    const c=correlations();
    let r="#### Analyse des erreurs récurrentes\n";
    r+=c.length?c.map(x=>"- "+x.txt).join("\n"):"- Aucune erreur structurelle détectée sur la période.";
    r+=`\n\n#### Recommandation\nConcentre-toi sur **un seul** levier à la fois. Le premier de la liste est le plus rentable à corriger.`;
    return r;
  }
  if(/setup|grade|qualit/.test(m)){
    const g=byGrade();
    return "#### Qualité des setups\n"+g.map(x=>`- **${x.label}** : ${x.n} trades, winrate ${x.value??"—"}%, P&L ${money(x.pnl)}`).join("\n")+
      `\n\n#### Lecture\n${g[0].n&&g[2].n&&g[0].value>g[2].value?"La sélection fonctionne : les setups A surperforment nettement. **Réduire la fréquence, monter l'exigence.**":"Échantillon insuffisant ou sélection non différenciante : resserrer les critères du grade A."}`;
  }
  if(/conseil|recommand|quoi faire|devrais|sugg[èe]re/.test(m)){
    const sg=suggestedDayType();
    return `#### Recommandation contextuelle\nDate : ${fmtFull(t)} · ${sessionPhase(now())}\n\n**Type de journée suggéré : ${DAY_TYPES[sg.type].label}**\n\n${sg.why}\n\n#### Rappels du plan\n${state.profile.rules.slice(0,4).map(r=>"- "+r).join("\n")}`;
  }
  if(/fatigue|[ée]tat|mental|[ée]nergie/.test(m)){
    const l=state.entries.filter(e=>e.mode==="trading");
    const lo=l.filter(e=>e.energy<=2),hi=l.filter(e=>e.energy>=4);
    return `#### État & énergie\n- Trades avec énergie ≤ 2/5 : ${lo.length} (winrate ${winRate(lo)??"—"}%)\n- Trades avec énergie ≥ 4/5 : ${hi.length} (winrate ${winRate(hi)??"—"}%)\n\n${lo.length&&hi.length&&winRate(lo)<winRate(hi)?"La corrélation est claire : **l'énergie est une condition d'entrée** au même titre qu'un setup.":"Continue de noter ton énergie à chaque entrée pour affiner ce signal."}`;
  }
  if(/score|discipline/.test(m)){
    const s=computeDayScore(t),w=weekScore(t),st=streaks();
    return `#### État de la discipline\n- Aujourd'hui : **${s?s.total:"—"}/100**${s?` (process ${s.process}/80 · exécution ${s.exec}/10 · résultat ${s.result}/10)`:""}\n- Semaine : **${w??"—"}/100**\n- Série en cours : ${st.cur} j (record ${st.best} j)\n\nLe score mesure ton **processus**, pas ton P&L. C'est la seule métrique que tu contrôles à 100%.`;
  }
  return `Je suis ton coach de discipline. Je peux :\n- **Analyser** ta journée / semaine / mois ("analyse ma semaine")\n- **Détecter** tes erreurs récurrentes ("quelles sont mes erreurs ?")\n- **Recommander** le type de journée optimal ("que me conseilles-tu ?")\n- **Évaluer** tes setups ("qualité de mes setups A ?")\n- Rappeler ton **plan** à tout moment\n\nPose ta question, ou demande simplement : *"analyse ma semaine"*.`;
}

/* ═══════════════════════════════════════════════════════════════
   UI — toasts (pop-ups non bloquants), modales, graphiques SVG
   ═══════════════════════════════════════════════════════════════ */
function toast(html,sev="info",ttl=9000){
  const box=$("#toasts");if(!box)return;
  const el=document.createElement("div");
  el.className="toast "+(sev==="info"?"":sev);
  el.innerHTML=`<span class="tx" onclick="this.parentElement.remove()">✕</span>`+html;
  box.appendChild(el);
  while(box.children.length>4)box.firstElementChild.remove();
  setTimeout(()=>{if(el.parentElement){el.style.opacity="0";el.style.transition="opacity .4s";setTimeout(()=>el.remove(),400);}},ttl);
}
function openModal(title,bodyHTML,footHTML,wide){
  const root=$("#modalRoot");
  root.innerHTML=`<div class="modal-bg" id="mBg"><div class="modal${wide?" wide":""}" role="dialog" aria-modal="true" aria-labelledby="mTitle">
    <div class="modal-head"><h3 id="mTitle">${title}</h3><button class="x-btn" id="mX" aria-label="Fermer">✕</button></div>
    <div class="modal-body">${bodyHTML}</div>${footHTML?`<div class="modal-foot">${footHTML}</div>`:""}
  </div></div>`;
  document.body.classList.add("modal-open");
  enhanceResponsiveTables(root);
  const close=()=>{root.innerHTML="";document.body.classList.remove("modal-open");};
  $("#mX").onclick=close;
  $("#mBg").addEventListener("pointerdown",e=>{if(e.target.id==="mBg")close();});
  document.addEventListener("keydown",function h(e){if(e.key==="Escape"){close();document.removeEventListener("keydown",h);}});
  return close;
}
function ringSVG(score,size=132,stroke=11){
  const r=(size-stroke)/2,c=2*Math.PI*r,off=c*(1-clamp(score,0,100)/100);
  const col=scoreColor(score);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="#16233c" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${off}"
      transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .8s ease"/>
  </svg>`;
}
function lineChart(values,{w=520,h=150,color="#38e1c6",max=100,min=0}={}){
  if(values.length<2)return `<div class="muted" style="font-size:12px;padding:20px 0">Données insuffisantes.</div>`;
  const padL=6,padR=6,padT=10,padB=6;
  const span=(max-min)||1;
  const pts=values.map((v,i)=>{
    const x=padL+i*(w-padL-padR)/(values.length-1);
    const y=padT+(1-(clamp(v,min,max)-min)/span)*(h-padT-padB);
    return[x,y];
  });
  const path=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
  const area=path+` L ${pts[pts.length-1][0].toFixed(1)} ${h} L ${pts[0][0].toFixed(1)} ${h} Z`;
  const gid="g"+Math.random().toString(36).slice(2,7);
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" style="display:block">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity=".28"/><stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${path}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="${pts[pts.length-1][0]}" cy="${pts[pts.length-1][1]}" r="3.5" fill="${color}"/>
  </svg>`;
}
function barChart(data,{w=520,h=170,color="#38e1c6",max=100}={}){
  const n=data.length;if(!n)return "";
  const bw=Math.min(54,(w-40)/n-14);
  const gap=(w-40-bw*n)/(n-1||1);
  let bars="",labels="";
  data.forEach((d,i)=>{
    const x=20+i*(bw+gap);
    const val=d.value==null?0:clamp(d.value,0,max);
    const bh=(val/max)*(h-52);
    const y=h-30-bh;
    const col=d.value==null?"#22314e":(d.warn?"var(--warn)":color);
    bars+=`<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(bh,2)}" rx="5" fill="${col}" opacity="${d.value==null?0.5:0.85}"/>`;
    if(d.value!=null)bars+=`<text x="${x+bw/2}" y="${y-6}" text-anchor="middle" fill="#b9c6dd" font-size="10.5" font-family="monospace" font-weight="700">${d.value}%</text>`;
    else bars+=`<text x="${x+bw/2}" y="${y-6}" text-anchor="middle" fill="#44546f" font-size="10">—</text>`;
    labels+=`<text x="${x+bw/2}" y="${h-12}" text-anchor="middle" fill="#6e7f9e" font-size="10">${esc(d.label)}</text>`;
    if(d.n!=null)labels+=`<text x="${x+bw/2}" y="${h}" text-anchor="middle" fill="#44546f" font-size="8.5">n=${d.n}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h+2}" width="100%" style="display:block">${bars}${labels}</svg>`;
}

/* ═══════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════ */
const NAV=[
  ["dashboard","Dashboard","M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z"],
  ["calendar","Calendrier","M8 2v4 M16 2v4 M3 9h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"],
  ["journal","Journal","M4 19.5A2.5 2.5 0 0 1 6.5 17H20 M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"],
  ["scoring","Scoring","M12 2a10 10 0 1 0 10 10 M12 6v6l4 2 M19 5l3 3-3 3"],
  ["stats","Statistiques","M18 20V10 M12 20V4 M6 20v-6"],
  ["progress","Progression","M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6"],
  ["profile","Profil","M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"],
  ["coach","Coach IA","M12 2l2.1 5.9L20 10l-5.9 2.1L12 18l-2.1-5.9L4 10l5.9-2.1z M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"],
];
function buildSidebar(){
  $("#sidebar").innerHTML=NAV.map(([id,label,path])=>
    `<button type="button" class="nav-item" data-view="${id}" title="${label}" aria-label="${label}"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${path}"/></svg><span>${label}</span></button>`
  ).join("")+`<div class="side-foot"><b>KAIROS v1.0</b><br>Mesure le trader,<br>pas le marché.<br><span style="color:var(--accent)">Process 80 · Exéc 10 · P&L 10</span></div>`;
  $$(".nav-item").forEach(b=>b.onclick=()=>{showView(b.dataset.view);b.blur();});
}
let currentView="dashboard";
function showView(v){
  currentView=v;
  $$(".nav-item").forEach(b=>{
    const on=b.dataset.view===v;
    b.classList.toggle("active",on);
    b.setAttribute("aria-current",on?"page":"false");
  });
  $$(".view").forEach(s=>s.classList.remove("active"));
  $("#view-"+v).classList.add("active");
  RENDER[v]();
  enhanceResponsiveTables($("#view-"+v));
  $("#main").scrollTop=0;
  if(window.matchMedia&&window.matchMedia("(max-width: 720px)").matches)window.scrollTo(0,0);
}
function enhanceResponsiveTables(root=document){
  const scope=root||document;
  [...scope.querySelectorAll("table.tbl")].forEach(tbl=>{
    if(tbl.parentElement&&tbl.parentElement.classList.contains("table-scroll"))return;
    const wrap=document.createElement("div");
    wrap.className="table-scroll";
    tbl.parentNode.insertBefore(wrap,tbl);
    wrap.appendChild(tbl);
  });
}

/* ═══════════════════════════════════════════════════════════════
   VUES
   ═══════════════════════════════════════════════════════════════ */
const RENDER={};

/* ---------- DASHBOARD ---------- */
RENDER.dashboard=function(){
  const t=todayISO();const d=now();
  const s=computeDayScore(t)||{total:0,process:0,exec:0,result:0};
  const day=state.days[t];const type=dayType(t);
  const greet=d.getHours()<12?"Bonjour":d.getHours()<18?"Bon après-midi":"Bonsoir";
  const es=entriesOn(t);
  const sg=suggestedDayType();
  const insights=proactiveInsights().slice(0,3);
  const last30=scoredDays(addDays(t,-29),t).map(x=>x.total);
  const recent=[...state.entries].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).slice(0,4);
  const wk=weekScore(t);
  const checklist=day&&day.checklist?day.checklist:[];
  const doneN=checklist.filter(i=>i.done).length;

  $("#view-dashboard").innerHTML=`
  <div class="page-head">
    <div>
      <div class="page-title">${greet}, ${esc(state.profile.name)}.</div>
      <div class="page-sub">${fmtFull(t)} · ${sessionPhase(d)}${type?` · journée <b class="t-acc">${DAY_TYPES[type].label}</b>`:""}</div>
    </div>
    <div class="btn-row">
      <button class="btn primary" id="qTrade">+ Trade</button>
      <button class="btn" id="qAnalyse">+ Analyse</button>
      <button class="btn" id="qJournal">Journal</button>
      <button class="btn" id="qCoach">Coach IA</button>
    </div>
  </div>

  <div class="grid g-dash">
    <!-- Discipline Score -->
    <div class="card">
      <div class="card-title">Discipline Score du jour <span class="mini">process 80 · exécution 10 · résultat 10</span></div>
      <div class="ring-wrap">
        <div class="ring-center">${ringSVG(s.total,148,12)}<div class="val" style="color:${scoreColor(s.total)}">${s.total}<small>/100</small></div></div>
        <div style="flex:1">
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px"><span class="muted">Processus</span><span class="mono">${s.process}/80</span></div>
            <div class="progress"><i style="width:${s.process/80*100}%"></i></div>
          </div>
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px"><span class="muted">Exécution / setup</span><span class="mono">${s.exec}/10</span></div>
            <div class="progress"><i style="width:${s.exec/10*100}%;background:linear-gradient(90deg,#5aa7ff,#9d8cff)"></i></div>
          </div>
          <div>
            <div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px"><span class="muted">Résultat</span><span class="mono">${s.result}/10</span></div>
            <div class="progress"><i style="width:${s.result/10*100}%;background:linear-gradient(90deg,#f5b544,#f4696f)"></i></div>
          </div>
          <div style="margin-top:13px;display:flex;gap:8px;flex-wrap:wrap">
            <span class="pill ${wk!=null?scorePill(wk):""}">Semaine : ${wk!=null?wk:"—"}</span>
            <span class="pill accent">${es.filter(e=>e.mode==="trading").length} trade(s)</span>
            <span class="pill">${es.filter(e=>e.mode==="analyse").length} analyse(s)</span>
          </div>
        </div>
      </div>
      <div class="sep"></div>
      <div style="font-size:12px;color:var(--txt2)"><b class="t-acc">Suggestion du coach :</b> journée <b>${DAY_TYPES[sg.type].label}</b> — ${sg.why}</div>
    </div>

    <!-- Checklist de préparation -->
    <div class="card">
      <div class="card-title">Checklist de préparation <span class="mini">${doneN}/${checklist.length||CHECKLIST_TEMPLATE.length}</span></div>
      <div id="dashCheck">
      ${(checklist.length?checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))).map((it,i)=>`
        <div class="checkline${it.done?" done":""}" data-idx="${i}">
          <div class="box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#04231d" stroke-width="3.4"><path d="M20 6L9 17l-5-5"/></svg></div>
          <span>${esc(it.label)}</span>
        </div>`).join("")}
      </div>
      <div class="sep"></div>
      <div class="card-title" style="margin-bottom:9px">Objectifs du jour</div>
      <div style="font-size:12.8px;color:var(--txt2);line-height:1.7">
        ${(day&&day.objectives&&day.objectives.length?day.objectives:["Définir les objectifs de la journée"]).map(o=>`<div>◆ ${esc(o)}</div>`).join("")}
      </div>
      <div style="margin-top:11px"><button class="btn sm" id="editDay">Modifier la journée</button></div>
    </div>

    <!-- Activité & alertes -->
    <div class="card">
      <div class="card-title">Alertes contextuelles <span class="mini">non bloquantes</span></div>
      ${insights.length?insights.map(i=>`<div class="insight ${i.sev}">${i.txt}</div>`).join(""):`<div class="muted" style="font-size:12.5px">Aucune alerte — processus nominal.</div>`}
      <div class="sep"></div>
      <div class="card-title" style="margin-bottom:9px">Actions récentes</div>
      ${recent.length?recent.map(e=>`
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid rgba(27,42,69,.5);font-size:12.3px">
          <div><span class="muted mono">${fmtFR(e.date)} ${e.time||""}</span><br>
          <span style="color:${e.mode==="trading"?"var(--accent)":"var(--blue)"}">${e.mode==="trading"?"Trade":"Analyse"}</span> · ${esc(e.setup||"—")}
          ${e.grade?`<span class="grade ${e.grade}" style="margin-left:5px">${e.grade}</span>`:""}</div>
          <div class="mono" style="font-size:12px;color:${e.pnl==null?"var(--muted)":e.pnl>=0?"var(--good)":"var(--bad)"}">${e.pnl==null?"":money(e.pnl)}</div>
        </div>`).join(""):`<div class="muted" style="font-size:12.5px">Aucune entrée — commence par ta checklist.</div>`}
    </div>
  </div>

  <div class="grid g2" style="margin-top:16px">
    <div class="card">
      <div class="card-title">Discipline Score — 30 derniers jours <span class="mini">moyenne : ${last30.length?Math.round(avg(last30)):"—"}</span></div>
      ${lineChart(last30,{color:"#38e1c6"})}
    </div>
    <div class="card">
      <div class="card-title">Rappel du plan de trading</div>
      <div style="font-size:12.8px;line-height:1.9;color:var(--txt2)">
        ${state.profile.rules.map((r,i)=>`<div><span class="mono t-acc" style="font-size:11px">${pad(i+1)}</span> · ${esc(r)}</div>`).join("")}
      </div>
      <div style="margin-top:12px;font-size:11.5px;color:var(--faint)">Le système mesure le respect de ces règles, jamais le marché.</div>
    </div>
  </div>`;

  $("#qTrade").onclick=()=>openEntryModal("trading");
  $("#qAnalyse").onclick=()=>openEntryModal("analyse");
  $("#qJournal").onclick=()=>showView("journal");
  $("#qCoach").onclick=()=>showView("coach");
  $("#editDay").onclick=()=>openDayModal(t);
  $$("#dashCheck .checkline").forEach(el=>el.onclick=()=>{
    const idx=+el.dataset.idx;
    if(!state.days[t])state.days[t]={type:dayType(t)||"trading",objectives:[],checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))};
    if(!state.days[t].checklist)state.days[t].checklist=CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}));
    state.days[t].checklist[idx].done=!state.days[t].checklist[idx].done;
    saveState();RENDER.dashboard();
    if(state.days[t].checklist.every(i=>i.done))toast("<b>Checklist complète.</b> Préparation verrouillée — la journée peut commencer.","good");
  });
};

/* ---------- CALENDRIER ---------- */
RENDER.calendar=function(){
  const ym=state.ui.calMonth||todayISO().slice(0,7);
  const[y,m]=ym.split("-").map(Number);
  const first=new Date(y,m-1,1);
  const startOff=(first.getDay()+6)%7;
  const gridStart=isoOf(new Date(y,m-1,1-startOff));
  const label=first.toLocaleDateString("fr-FR",{month:"long",year:"numeric"});
  let cells="";
  for(let i=0;i<42;i++){
    const iso=addDays(gridStart,i);
    const inMonth=iso.slice(0,7)===ym;
    const type=dayType(iso);
    const s=computeDayScore(iso);
    const cls=type?DAY_TYPES[type].cls:"";
    cells+=`<div class="cal-cell${inMonth?"":" out"}${iso===todayISO()?" today":""}" data-date="${iso}">
      <div class="dnum">${+iso.slice(8)}</div>
      ${type?`<div class="dtype ${cls}"><i></i>${DAY_TYPES[type].label}</div>`:`<div class="dtype" style="color:var(--faint)">—</div>`}
      ${s?`<div class="cscore" style="color:${scoreColor(s.total)}">● ${s.total}</div>`:``}
    </div>`;
  }
  $("#view-calendar").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Calendrier intelligent</div>
    <div class="page-sub">Planification adaptative — le système analyse la cohérence de tes choix, sans jamais bloquer.</div></div>
    <div class="legend">
      ${Object.values(DAY_TYPES).map(t=>`<span><i style="background:${t.color}"></i>${t.label}</span>`).join("")}
    </div>
  </div>
  <div class="card">
    <div class="cal-head">
      <div style="font-size:16px;font-weight:700;text-transform:capitalize">${label}</div>
      <div class="btn-row">
        <button class="btn sm" id="calPrev">‹ Précédent</button>
        <button class="btn sm" id="calToday">Aujourd'hui</button>
        <button class="btn sm" id="calNext">Suivant ›</button>
      </div>
    </div>
    <div class="cal-grid" style="margin-bottom:8px">${["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].map(d=>`<div class="cal-dow">${d}</div>`).join("")}</div>
    <div class="cal-grid">${cells}</div>
  </div>`;
  $("#calPrev").onclick=()=>{const d=new Date(y,m-2,1);state.ui.calMonth=isoOf(d).slice(0,7);saveState();RENDER.calendar();};
  $("#calNext").onclick=()=>{const d=new Date(y,m,1);state.ui.calMonth=isoOf(d).slice(0,7);saveState();RENDER.calendar();};
  $("#calToday").onclick=()=>{state.ui.calMonth=todayISO().slice(0,7);saveState();RENDER.calendar();};
  $$(".cal-cell").forEach(c=>c.onclick=()=>openDayModal(c.dataset.date));
};

function calendarWarnings(iso,type){
  const wd=dowOf(iso);const t=todayISO();
  if(type==="trading"&&wd===5)toast("⚠ <b>Vendredi trading</b> — ton historique montre une dégradation récurrente ce jour. Analyse ou repos statistiquement plus rentables.","warn");
  if(type==="trading"&&iso>t){
    const prev1=dayType(addDays(iso,-1)),prev2=dayType(addDays(iso,-2));
    if(prev1==="trading"&&prev2==="trading")toast("⚠ <b>3e journée trading consécutive</b> planifiée — la fatigue décisionnelle s'accumule. Une journée analyse pourrait protéger ton score.","warn");
  }
  if(type==="mix")toast("ℹ <b>Journée mixte</b> — les données montrent souvent une performance inférieure quand analyse et trading cohabitent. Séquencer clairement les deux.","info");
}
function openDayModal(iso){
  const day=state.days[iso];
  const type=day?day.type:(dayType(iso)||"");
  const es=entriesOn(iso);
  const s=computeDayScore(iso);
  const body=`
    <div class="field"><label>Date</label><div style="font-size:13.5px;text-transform:capitalize;padding:4px 0">${fmtFull(iso)}${s?` · <span class="pill ${scorePill(s.total)}">Score ${s.total}</span>`:""}</div></div>
    <div class="field"><label>Type de journée</label>
      <div class="btn-row" id="typeChips">
        ${Object.entries(DAY_TYPES).map(([k,v])=>`<button class="chip${type===k?" on":""}" data-t="${k}">${v.label}</button>`).join("")}
      </div>
    </div>
    <div class="field"><label>Objectifs (un par ligne)</label>
      <textarea id="dayObjs" rows="3" placeholder="Ex : Max 2 trades · Exécuter le plan sans déviation">${esc((day&&day.objectives||[]).join("\n"))}</textarea>
    </div>
    <div class="field"><label>Checklist de préparation</label>
      <div id="dayCheck">
        ${(day&&day.checklist?day.checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))).map((it,i)=>`
          <div class="checkline${it.done?" done":""}" data-idx="${i}">
            <div class="box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#04231d" stroke-width="3.4"><path d="M20 6L9 17l-5-5"/></svg></div>
            <span>${esc(it.label)}</span>
          </div>`).join("")}
      </div>
    </div>
    <div class="field"><label>Entrées du jour (${es.length})</label>
      ${es.length?es.map(e=>`<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:8px;margin-bottom:6px;font-size:12.5px;background:var(--bg2)">
        <span><span class="mono muted">${e.time||""}</span> · ${e.mode==="trading"?"Trade":"Analyse"} · ${esc(e.setup||"—")} ${e.grade?`<span class="grade ${e.grade}">${e.grade}</span>`:""}</span>
        <span class="mono" style="color:${e.pnl==null?"var(--muted)":e.pnl>=0?"var(--good)":"var(--bad)"}">${e.pnl==null?"":money(e.pnl)}</span>
      </div>`).join(""):`<div class="muted" style="font-size:12px">Aucune entrée.</div>`}
      <div class="btn-row" style="margin-top:8px">
        <button class="btn sm" id="addTradeDay">+ Trade</button>
        <button class="btn sm" id="addAnaDay">+ Analyse</button>
      </div>
    </div>`;
  const close=openModal("Journée — "+fmtFR(iso),body,
    `<button class="btn danger" id="delDay">Effacer la planification</button><button class="btn primary" id="saveDay">Enregistrer</button>`);
  let selType=type;
  const checkState=(day&&day.checklist?day.checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))).map(x=>({...x}));
  $$("#typeChips .chip").forEach(c=>c.onclick=()=>{
    selType=c.dataset.t;
    $$("#typeChips .chip").forEach(x=>x.classList.toggle("on",x===c));
    calendarWarnings(iso,selType);
  });
  $$("#dayCheck .checkline").forEach(el=>el.onclick=()=>{
    const i=+el.dataset.idx;checkState[i].done=!checkState[i].done;
    el.classList.toggle("done",checkState[i].done);
  });
  $("#addTradeDay").onclick=()=>{close();openEntryModal("trading",iso);};
  $("#addAnaDay").onclick=()=>{close();openEntryModal("analyse",iso);};
  $("#delDay").onclick=()=>{delete state.days[iso];deleteDayRemote(iso);saveState();close();refresh();toast("Planification effacée.");};
  $("#saveDay").onclick=()=>{
    if(selType){
      state.days[iso]={
        type:selType,
        objectives:$("#dayObjs").value.split("\n").map(x=>x.trim()).filter(Boolean),
        checklist:checkState,
      };
      saveState();
    }
    close();refresh();toast("Journée enregistrée.","good");
  };
}

/* ---------- JOURNAL ---------- */
let journalFilter="all";
RENDER.journal=function(){
  const list=[...state.entries].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));
  const filtered=journalFilter==="all"?list:list.filter(e=>e.mode===journalFilter);
  $("#view-journal").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Journal de trading & d'analyse</div>
    <div class="page-sub">Double flux — les journées sans trade restent productives et mesurées.</div></div>
    <div class="btn-row">
      <button class="btn primary" id="newTrade">+ Entrée trading</button>
      <button class="btn" id="newAna">+ Entrée analyse</button>
    </div>
  </div>
  <div class="btn-row" style="margin-bottom:16px">
    <button class="chip${journalFilter==="all"?" on":""}" data-f="all">Tout (${list.length})</button>
    <button class="chip${journalFilter==="trading"?" on":""}" data-f="trading">Trading (${list.filter(e=>e.mode==="trading").length})</button>
    <button class="chip${journalFilter==="analyse"?" on":""}" data-f="analyse">Analyse (${list.filter(e=>e.mode==="analyse").length})</button>
  </div>
  <div id="entryList">
    ${filtered.length?filtered.map(entryCard).join(""):`<div class="card muted">Aucune entrée pour ce filtre.</div>`}
  </div>`;
  $("#newTrade").onclick=()=>openEntryModal("trading");
  $("#newAna").onclick=()=>openEntryModal("analyse");
  $$("[data-f]").forEach(c=>c.onclick=()=>{journalFilter=c.dataset.f;RENDER.journal();});
  $$(".entry").forEach(el=>el.onclick=e=>{
    if(e.target.closest("[data-shot]"))return;
    openEntryView(el.dataset.id);
  });
  $$("[data-shot]").forEach(el=>el.onclick=async e=>{
    e.stopPropagation();
    const directUrl=el.dataset.shot;
    const path=el.dataset.shotPath;
    if(directUrl){
      openModal("Screenshot",`<img src="${directUrl}" style="width:100%;border-radius:8px">`,"",true);
    }else if(path){
      openModal("Screenshot","<div style='padding:24px;text-align:center;color:var(--txt2)'>Chargement…</div>","",true);
      const signedUrl=await resolveScreenshotUrl(path);
      if(signedUrl)openModal("Screenshot",`<img src="${signedUrl}" style="width:100%;border-radius:8px">`,"",true);
      else openModal("Screenshot","<div style='padding:24px;text-align:center;color:var(--bad)'>Impossible de charger le screenshot.</div>","",true);
    }
  });
};
function entryCard(e){
  const dt=e.dayType&&DAY_TYPES[e.dayType]?DAY_TYPES[e.dayType]:null;
  return `<div class="entry" data-id="${e.id}">
    <div class="ehead">
      <div class="emeta">
        <span class="pill ${e.mode==="trading"?"accent":""}" ${e.mode==="analyse"?`style="color:var(--blue);border-color:rgba(90,167,255,.3);background:rgba(90,167,255,.08)"`:""}>${e.mode==="trading"?"TRADING":"ANALYSE"}</span>
        <span class="mono muted" style="font-size:11.5px">${fmtFR(e.date)} · ${e.time||"—"}</span>
        ${dt?`<span class="pill"><i style="width:6px;height:6px;border-radius:50%;background:${dt.color};display:inline-block"></i>${dt.label}</span>`:""}
        ${e.grade?`<span class="grade ${e.grade}">${e.grade}</span>`:""}
        ${e.planRespected?`<span class="pill good">Plan ✓</span>`:`<span class="pill bad">Plan ✗</span>`}
        ${e.impulsive?`<span class="pill bad">Impulsif</span>`:""}
      </div>
      <div class="mono" style="font-size:14px;font-weight:700;color:${e.pnl==null?"var(--faint)":e.pnl>=0?"var(--good)":"var(--bad)"}">${e.pnl==null?"—":money(e.pnl)}</div>
    </div>
    <div class="enotes"><b>${esc(e.setup||"Sans setup")}</b>${e.emotion?` · <span class="muted">${esc(e.emotion)} · énergie ${e.energy||"—"}/5</span>`:""}<br>${esc((e.notes||"").slice(0,220))}${(e.notes||"").length>220?"…":""}</div>
    ${(e.screenshot||e.screenshotPath)?`<div class="eshot"><img src="${e.screenshot||'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%2280%22><rect width=%22200%22 height=%2280%22 fill=%22%23161c26%22/></svg>'}" data-shot-path="${e.screenshotPath||''}" data-shot="${e.screenshot||''}" alt="screenshot cliquer pour voir"></div>`:""}
  </div>`;
}
function openEntryView(id){
  const e=state.entries.find(x=>x.id===id);if(!e)return;
  const body=`
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
      <span class="pill ${e.mode==="trading"?"accent":""}">${e.mode==="trading"?"TRADING":"ANALYSE"}</span>
      <span class="pill">${fmtFR(e.date)} · ${e.time||"—"}</span>
      ${e.grade?`<span class="grade ${e.grade}">${e.grade}</span>`:""}
      ${e.planRespected?`<span class="pill good">Plan respecté</span>`:`<span class="pill bad">Plan non respecté</span>`}
      ${e.impulsive?`<span class="pill bad">Action impulsive</span>`:""}
      ${e.pnl!=null?`<span class="pill ${e.pnl>=0?"good":"bad"}">${money(e.pnl)}</span>`:""}
    </div>
    <div class="field"><label>Setup</label><div style="padding:4px 0;font-size:13.5px">${esc(e.setup||"—")}</div></div>
    <div class="field"><label>Contexte macro / technique</label><div style="padding:4px 0;font-size:13px;color:var(--txt2)">${esc(e.context||"—")}</div></div>
    <div class="field"><label>État mental</label><div style="padding:4px 0;font-size:13px">${esc(e.emotion||"—")} · énergie ${e.energy||"—"}/5</div></div>
    <div class="field"><label>Notes</label><div style="padding:4px 0;font-size:13px;color:var(--txt2);line-height:1.6">${esc(e.notes||"—")}</div></div>
    ${(e.screenshot||e.screenshotPath)?`<div class="field"><label>Screenshot</label><img id="entryViewShot" src="${e.screenshot||''}" style="width:100%;border-radius:9px;border:1px solid var(--line);min-height:60px;background:var(--card2)"></div>`:""}`;
  const close=openModal("Entrée de journal",body,
    `<button class="btn danger" id="delE">Supprimer</button><button class="btn" id="editE">Modifier</button>`);
  if(!e.screenshot&&e.screenshotPath){
    resolveScreenshotUrl(e.screenshotPath).then(url=>{
      const img=$("#entryViewShot");
      if(img&&url)img.src=url;
    });
  }
  $("#delE").onclick=()=>{state.entries=state.entries.filter(x=>x.id!==id);deleteEntryRemote(id);saveState();close();refresh();toast("Entrée supprimée.");};
  $("#editE").onclick=()=>{close();openEntryModal(e.mode,e.date,e);};
}
function openEntryModal(mode,date,existing){
  const e=existing||{};
  const d=date||e.date||todayISO();
  const dayT=dayType(d)||(state.days[d]&&state.days[d].type)||"trading";
  const body=`
    <div class="grid g2">
      <div class="field"><label>Date</label><input type="date" id="eDate" value="${d}"></div>
      <div class="field"><label>Heure</label><input type="time" id="eTime" value="${e.time||pad(now().getHours())+":"+pad(now().getMinutes())}"></div>
    </div>
    <div class="field"><label>Mode</label>
      <div class="btn-row">
        <button class="chip${mode==="trading"?" on":""}" data-mode="trading">Trading (exécution réelle)</button>
        <button class="chip${mode==="analyse"?" on":""}" data-mode="analyse">Analyse (sans position)</button>
      </div>
    </div>
    <div class="field"><label>Type de journée associé</label>
      <select id="eDayType">${Object.entries(DAY_TYPES).map(([k,v])=>`<option value="${k}"${k===dayT?" selected":""}>${v.label}</option>`).join("")}</select>
    </div>
    <div class="field"><label>Setup identifié</label><input type="text" id="eSetup" placeholder="Ex : Pullback VWAP, cassure OB H1…" value="${esc(e.setup||"")}"></div>
    <div class="grid g2">
      <div class="field"><label>Qualité du setup</label>
        <div class="btn-row">
          ${["A","B","C"].map(g=>`<button class="chip grade-chip${(e.grade||"A")===g?" on":""}" data-g="${g}">${g}</button>`).join("")}
        </div>
      </div>
      <div class="field" id="pnlField" style="${mode==="analyse"?"display:none":""}"><label>P&L (€)</label><input type="number" id="ePnl" step="1" placeholder="+120 / -45" value="${e.pnl!=null?e.pnl:""}"></div>
    </div>
    <div class="field"><label>Contexte macro / technique</label><textarea id="eCtx" rows="2" placeholder="Environnement de marché, corrélations, annonces…">${esc(e.context||"")}</textarea></div>
    <div class="grid g2">
      <div class="field"><label>Émotion / état mental</label>
        <select id="eEmo">${EMOTIONS.map(x=>`<option${(e.emotion||"Calme")===x?" selected":""}>${x}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Énergie (1–5)</label>
        <select id="eEnergy">${[1,2,3,4,5].map(n=>`<option value="${n}"${(e.energy||4)===n?" selected":""}>${n}/5</option>`).join("")}</select>
      </div>
    </div>
    <div class="grid g2">
      <div class="checkline${e.planRespected!==false?" done":""}" id="ckPlan"><div class="box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#04231d" stroke-width="3.4"><path d="M20 6L9 17l-5-5"/></svg></div><span>Plan respecté</span></div>
      <div class="checkline${e.impulsive?" done":""}" id="ckImp"><div class="box"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#04231d" stroke-width="3.4"><path d="M20 6L9 17l-5-5"/></svg></div><span>Action impulsive (hors plan)</span></div>
    </div>
    <div class="field" style="margin-top:13px"><label>Screenshot (manuel)</label>
      <input type="file" id="eShot" accept="image/*" style="font-size:12px;color:var(--muted)">
      <div id="shotPrev">${e.screenshot?`<img class="thumb-preview" src="${e.screenshot}">`:""}</div>
    </div>
    <div class="field"><label>Notes personnelles</label><textarea id="eNotes" rows="3" placeholder="Ce qui s'est passé, ce que tu apprends…">${esc(e.notes||"")}</textarea></div>`;
  const close=openModal((existing?"Modifier — ":"Nouvelle entrée — ")+(mode==="trading"?"Trading":"Analyse"),body,
    `<button class="btn" id="cancelE">Annuler</button><button class="btn primary" id="saveE">Enregistrer</button>`,true);
  let curMode=mode,grade=e.grade||"A",shot=e.screenshot||null,planOK=e.planRespected!==false,imp=!!e.impulsive;
  $$("[data-mode]").forEach(c=>c.onclick=()=>{
    curMode=c.dataset.mode;
    $$("[data-mode]").forEach(x=>x.classList.toggle("on",x===c));
    $("#pnlField").style.display=curMode==="analyse"?"none":"";
  });
  $$(".grade-chip").forEach(c=>c.onclick=()=>{grade=c.dataset.g;$$(".grade-chip").forEach(x=>x.classList.toggle("on",x===c));});
  $("#ckPlan").onclick=()=>{planOK=!planOK;$("#ckPlan").classList.toggle("done",planOK);};
  $("#ckImp").onclick=()=>{imp=!imp;$("#ckImp").classList.toggle("done",imp);
    if(imp)toast("ℹ Action impulsive déclarée — l'honnêteté est le premier outil de progression. Le score de processus en tiendra compte.","warn");
  };
  $("#eShot").onchange=ev=>{
    const f=ev.target.files[0];if(!f)return;
    const img=new Image();const rd=new FileReader();
    rd.onload=()=>{img.onload=()=>{
      const maxW=900,sc=Math.min(1,maxW/img.width);
      const cv=document.createElement("canvas");cv.width=img.width*sc;cv.height=img.height*sc;
      cv.getContext("2d").drawImage(img,0,0,cv.width,cv.height);
      shot=cv.toDataURL("image/jpeg",0.72);
      $("#shotPrev").innerHTML=`<img class="thumb-preview" src="${shot}">`;
    };img.src=rd.result;};
    rd.readAsDataURL(f);
  };
  $("#cancelE").onclick=close;
  $("#saveE").onclick=async()=>{
    const dateV=$("#eDate").value||todayISO();
    const entryId=e.id||uid();
    const entry={
      id:entryId,date:dateV,time:$("#eTime").value,mode:curMode,
      dayType:$("#eDayType").value,setup:$("#eSetup").value.trim(),grade,
      context:$("#eCtx").value.trim(),emotion:$("#eEmo").value,energy:+$("#eEnergy").value,
      planRespected:planOK,impulsive:imp,
      pnl:curMode==="trading"&&$("#ePnl").value!==""?+$("#ePnl").value:null,
      screenshot:shot,notes:$("#eNotes").value.trim(),
      screenshotPath:e.screenshotPath||null,
    };
    // Upload du screenshot vers Storage seulement s'il a changé (nouveau dataURL choisi)
    if(shot&&shot!==e.screenshot){
      toast("Envoi du screenshot…","info",3000);
      const path=await uploadScreenshot(shot,entryId);
      entry.screenshotPath=path;
    }
    if(e.id){const i=state.entries.findIndex(x=>x.id===e.id);state.entries[i]=entry;}
    else state.entries.push(entry);
    // synchroniser le type de journée si pas encore défini
    if(!state.days[dateV])state.days[dateV]={type:entry.dayType,objectives:[],checklist:CHECKLIST_TEMPLATE.map(l=>({label:l,done:false}))};
    saveState();close();refresh();
    const s=computeDayScore(dateV);
    if(imp)toast(`Entrée enregistrée. Discipline Score du ${fmtFR(dateV)} : <b>${s?s.total:"—"}/100</b>. L'impulsion déclarée pèse sur le processus — c'est le signal, pas la punition.`,"warn");
    else toast(`Entrée enregistrée. Discipline Score du ${fmtFR(dateV)} : <b style="color:${scoreColor(s?s.total:0)}">${s?s.total:"—"}/100</b>.`,"good");
    if(!planOK&&curMode==="trading")setTimeout(()=>toast("Rappel du plan : <b>"+esc(state.profile.rules[Math.floor(Math.random()*state.profile.rules.length)])+"</b>","info"),1200);
  };
}

/* ---------- SCORING ---------- */
RENDER.scoring=function(){
  const t=todayISO();
  const s=computeDayScore(t);
  const wk=startOfWeek(t);
  const weekDays=scoredDays(addDays(t,-13),t);
  const wThis=weekScore(t),wPrev=weekScore(addDays(wk,-1));
  const ym=t.slice(0,7);const mSc=monthScore(ym);
  $("#view-scoring").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Système de scoring</div>
    <div class="page-sub">Le résultat financier est volontairement secondaire : le score mesure ce que tu contrôles.</div></div>
  </div>
  <div class="grid g3">
    <div class="card"><div class="card-title">Pondération</div>
      <div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span><b class="t-acc">Processus</b> <span class="muted">— plan, checklist, journal, impulsivité</span></span><span class="mono">80%</span></div><div class="progress"><i style="width:80%"></i></div></div>
      <div style="margin-bottom:12px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span><b style="color:var(--blue)">Exécution / setup</b></span><span class="mono">10%</span></div><div class="progress"><i style="width:10%;background:var(--blue)"></i></div></div>
      <div><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:5px"><span><b style="color:var(--warn)">Résultat du trade</b></span><span class="mono">10%</span></div><div class="progress"><i style="width:10%;background:var(--warn)"></i></div></div>
    </div>
    <div class="card"><div class="card-title">Score du jour</div>
      ${s?`<div class="ring-wrap"><div class="ring-center">${ringSVG(s.total,104,10)}<div class="val" style="font-size:22px;color:${scoreColor(s.total)}">${s.total}</div></div>
      <div style="font-size:12.3px;color:var(--txt2);line-height:1.9">Processus : <b class="mono">${s.process}/80</b><br>Exécution : <b class="mono">${s.exec}/10</b><br>Résultat : <b class="mono">${s.result}/10</b><br>${s.label?`<span class="pill">${s.label}</span>`:""}</div></div>`
      :`<div class="muted">Aucune donnée aujourd'hui.</div>`}
    </div>
    <div class="card"><div class="card-title">Agrégation</div>
      <div style="display:flex;flex-direction:column;gap:13px">
        <div><div class="stat-num" style="color:${wThis!=null?scoreColor(wThis):"var(--muted)"}">${wThis!=null?wThis:"—"}<span style="font-size:13px;color:var(--muted)"> /100</span></div><div class="stat-label">Score hebdomadaire ${wThis!=null&&wPrev!=null?`<span class="delta ${wThis>=wPrev?"up":"down"}">${wThis>=wPrev?"▲":"▼"} ${Math.abs(wThis-wPrev)} vs S-1</span>`:""}</div></div>
        <div><div class="stat-num" style="color:${mSc!=null?scoreColor(mSc):"var(--muted)"}">${mSc!=null?mSc:"—"}<span style="font-size:13px;color:var(--muted)"> /100</span></div><div class="stat-label">Score mensuel — évolution structurelle (${ym})</div></div>
      </div>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="card-title">Détail des 14 derniers jours</div>
    <table class="tbl"><thead><tr><th>Jour</th><th>Type</th><th>Process</th><th>Exéc.</th><th>Rés.</th><th>Total</th></tr></thead>
    <tbody>
      ${weekDays.slice().reverse().map(d=>{
        const dt=d.type&&DAY_TYPES[d.type]?DAY_TYPES[d.type]:null;
        return `<tr><td style="text-transform:capitalize">${fmtFR(d.date)}${d.date===t?' <span class="t-acc">· auj.</span>':""}</td>
        <td>${dt?`<span class="${dt.cls}" style="font-size:11.5px;font-weight:650">● ${dt.label}</span>`:"—"}</td>
        <td class="mono">${d.process}/80</td><td class="mono">${d.exec}/10</td><td class="mono">${d.result}/10</td>
        <td class="mono" style="color:${scoreColor(d.total)};font-weight:750">${d.total}</td></tr>`;
      }).join("")}
    </tbody></table>
  </div>`;
};

/* ---------- STATISTIQUES ---------- */
RENDER.stats=function(){
  const tr=allTrades();
  const wr=winRate(tr),pf=profitFactor(),pr=planRespectRate(),ir=impulsiveRate();
  const hb=byHourBuckets().map(b=>({...b,warn:b.label.startsWith("16")||b.label.startsWith("18")}));
  const wd=byWeekday().map(b=>({...b,warn:b.label==="Ven"}));
  const gr=byGrade();
  const corr=correlations();
  $("#view-stats").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Statistiques & analytics</div>
    <div class="page-sub">Objectif : identifier les patterns comportementaux récurrents — le winrate n'est jamais central.</div></div>
  </div>
  <div class="grid g4">
    <div class="card tight"><div class="stat-num">${wr!=null?wr+"%":"—"}</div><div class="stat-label">Winrate (${tr.length} trades)</div></div>
    <div class="card tight"><div class="stat-num">${pf!=null?pf.toFixed(2):"—"}</div><div class="stat-label">Profit factor</div></div>
    <div class="card tight"><div class="stat-num t-acc">${pr}%</div><div class="stat-label">Respect du plan</div></div>
    <div class="card tight"><div class="stat-num" style="color:${ir>15?"var(--bad)":"var(--good)"}">${ir}%</div><div class="stat-label">Impulsivité</div></div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-title">Winrate par horaire <span class="mini">comportement temporel</span></div>${barChart(hb,{color:"#38e1c6"})}</div>
    <div class="card"><div class="card-title">Winrate par jour de semaine</div>${barChart(wd,{color:"#5aa7ff"})}</div>
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-title">Qualité des setups (A / B / C)</div>
      ${gr.map(g=>`<div style="margin-bottom:13px">
        <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:5px">
          <span><span class="grade ${g.label.slice(-1)}">${g.label.slice(-1)}</span> ${g.label} · <span class="muted">${g.n} trades · ${money(g.pnl)}</span></span>
          <span class="mono">${g.value!=null?g.value+"%":"—"}</span>
        </div><div class="progress"><i style="width:${g.value||0}%;background:${g.label.slice(-1)==="A"?"var(--good)":g.label.slice(-1)==="B"?"var(--warn)":"var(--bad)"}"></i></div>
      </div>`).join("")}
    </div>
    <div class="card"><div class="card-title">Corrélations détectées <span class="mini">erreurs × conditions</span></div>
      ${corr.length?corr.map(c=>`<div class="insight ${c.sev}">${c.txt}</div>`).join(""):`<div class="muted" style="font-size:12.5px">Pas encore assez de données pour établir des corrélations solides.</div>`}
    </div>
  </div>`;
};

/* ---------- PROGRESSION ---------- */
RENDER.progress=function(){
  const t=todayISO();
  const s30=scoredDays(addDays(t,-29),t),sp=scoredDays(addDays(t,-59),addDays(t,-30));
  const a30=s30.length?Math.round(avg(s30.map(d=>d.total))):null;
  const ap=sp.length?Math.round(avg(sp.map(d=>d.total))):null;
  const tr30=allTrades().filter(e=>e.date>=addDays(t,-29));
  const trp=allTrades().filter(e=>e.date>=addDays(t,-59)&&e.date<addDays(t,-29));
  const cmp=[
    ["Discipline Score (moy.)",a30,ap,"/100"],
    ["Processus (moy.)",s30.length?Math.round(avg(s30.map(d=>d.process))):null,sp.length?Math.round(avg(sp.map(d=>d.process))):null,"/80"],
    ["Exécution (moy.)",s30.length?Math.round(avg(s30.map(d=>d.exec))):null,sp.length?Math.round(avg(sp.map(d=>d.exec))):null,"/10"],
    ["Respect du plan",tr30.length?pct(tr30.map(e=>e.planRespected)):null,trp.length?pct(trp.map(e=>e.planRespected)):null,"%"],
    ["Erreurs critiques (impulsivité)",tr30.length?pct(tr30.map(e=>e.impulsive)):null,trp.length?pct(trp.map(e=>e.impulsive)):null,"%",true],
    ["Winrate",winRate(tr30),winRate(trp),"%"],
    ["Trades",tr30.length,trp.length,""],
  ];
  const weeks=[];for(let i=11;i>=0;i--){const ws=startOfWeek(addDays(t,-7*i));const sc=scoredDays(ws,addDays(ws,6));weeks.push(sc.length?Math.round(avg(sc.map(d=>d.total))):0);}
  $("#view-progress").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Centre de progression</div>
    <div class="page-sub">Discipline · exécution · constance · réduction des erreurs — la seule courbe qui compte vraiment.</div></div>
  </div>
  <div class="card"><div class="card-title">Discipline Score quotidien — 60 jours</div>
    ${lineChart(scoredDays(addDays(t,-59),t).map(d=>d.total),{color:"#38e1c6",h:170})}
  </div>
  <div class="grid g2" style="margin-top:16px">
    <div class="card"><div class="card-title">Moyenne hebdomadaire — 12 semaines</div>${lineChart(weeks,{color:"#9d8cff"})}</div>
    <div class="card"><div class="card-title">30 derniers jours vs période précédente</div>
      <table class="tbl"><thead><tr><th>Indicateur</th><th>30 j</th><th>Précédent</th><th>Δ</th></tr></thead><tbody>
      ${cmp.map(([label,a,b,unit,inv])=>{
        const d=a!=null&&b!=null?a-b:null;
        const good=inv?(d!=null&&d<0):(d!=null&&d>0);
        return `<tr><td>${label}</td><td class="mono">${a!=null?a+unit:"—"}</td><td class="mono muted">${b!=null?b+unit:"—"}</td>
        <td class="delta ${d==null?"flat":good?"up":d===0?"flat":"down"}">${d==null?"—":(d>0?"+":"")+d+unit}</td></tr>`;
      }).join("")}
      </tbody></table>
    </div>
  </div>
  <div class="card" style="margin-top:16px"><div class="card-title">Lecture de la trajectoire</div>
    <div style="font-size:13px;line-height:1.7;color:var(--txt2)">
    ${a30!=null&&ap!=null?(a30-ap>=5?`<b class="t-good">Progression confirmée (+${a30-ap} pts).</b> Le processus se consolide : la performance financière devient une conséquence mécanique. Levier : maintenir la structure actuelle et viser la constance avant l'intensité.`
      :a30-ap<=-5?`<b class="t-bad">Recul de ${ap-a30} pts.</b> Une dérive s'installe. Le coach hebdomadaire identifie le comportement à verrouiller en priorité — généralement la préparation ou l'impulsivité de fin de session.`
      :`<b class="t-warn">Plateau (${a30} vs ${ap}).</b> La base est stable : c'est le moment d'augmenter l'exigence sur un levier précis (sélection des setups A, zéro trade après 16h30…).`)
    :`Pas encore assez de recul pour comparer les périodes.`}
    </div>
  </div>`;
};

/* ---------- PROFIL ---------- */
RENDER.profile=function(){
  const t=todayISO();
  const all=scoredDays(addDays(t,-74),t);
  const global=all.length?Math.round(avg(all.map(d=>d.total))):0;
  const tr=allTrades();
  const st=streaks();const dd=drawdownMax();const bp=bestPeriod();
  const sw=strengthsWeaknesses();
  const totalAna=state.entries.filter(e=>e.mode==="analyse").length;
  $("#view-profile").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Profil trader — identité quantifiée</div>
    <div class="page-sub">Ce que les chiffres disent de ton processus, pas de ton marché.</div></div>
    <button class="btn" id="editProfile">Modifier le profil & le plan</button>
  </div>
  <div class="grid g-dash">
    <div class="card">
      <div class="card-title">Discipline Score global <span class="mini">75 jours</span></div>
      <div class="ring-wrap">
        <div class="ring-center">${ringSVG(global,150,12)}<div class="val" style="color:${scoreColor(global)}">${global}<small>GLOBAL</small></div></div>
        <div style="font-size:12.8px;color:var(--txt2);line-height:2">
          ${esc(state.profile.name)}<br>
          <span class="pill ${scorePill(global)}">${global>=75?"Processus solide":global>=55?"En consolidation":"À reconstruire"}</span><br>
          Série en cours : <b class="t-acc">${st.cur} j</b> · record <b>${st.best} j</b>
        </div>
      </div>
    </div>
    <div class="card"><div class="card-title">Statistiques cumulées</div>
      <table class="tbl"><tbody>
        <tr><td>Trades exécutés</td><td class="mono" style="text-align:right">${tr.length}</td></tr>
        <tr><td>Analyses documentées</td><td class="mono" style="text-align:right">${totalAna}</td></tr>
        <tr><td>Journées scorées</td><td class="mono" style="text-align:right">${all.length}</td></tr>
        <tr><td>Winrate</td><td class="mono" style="text-align:right">${winRate(tr)!=null?winRate(tr)+"%":"—"}</td></tr>
        <tr><td>Profit factor</td><td class="mono" style="text-align:right">${profitFactor()!=null?profitFactor().toFixed(2):"—"}</td></tr>
        <tr><td>P&L cumulé</td><td class="mono" style="text-align:right;color:${tr.reduce((a,e)=>a+e.pnl,0)>=0?"var(--good)":"var(--bad)"}">${money(tr.reduce((a,e)=>a+e.pnl,0))}</td></tr>
        <tr><td>Drawdown maximal</td><td class="mono t-bad" style="text-align:right">${money(dd)}</td></tr>
        <tr><td>Meilleure période</td><td class="mono" style="text-align:right">${bp?bp.month+" · "+bp.score+"/100":"—"}</td></tr>
      </tbody></table>
    </div>
    <div class="card"><div class="card-title">Forces & faiblesses identifiées</div>
      <div style="margin-bottom:10px;font-size:11px;letter-spacing:.12em;color:var(--good);font-weight:700">FORCES</div>
      ${sw.s.length?sw.s.map(x=>`<div class="insight good" style="margin-bottom:7px">${esc(x)}</div>`).join(""):`<div class="muted" style="font-size:12px;margin-bottom:10px">En construction.</div>`}
      <div style="margin:12px 0 10px;font-size:11px;letter-spacing:.12em;color:var(--bad);font-weight:700">FAIBLESSES</div>
      ${sw.w.length?sw.w.map(x=>`<div class="insight bad" style="margin-bottom:7px">${esc(x)}</div>`).join(""):`<div class="muted" style="font-size:12px">Aucune faiblesse structurelle détectée.</div>`}
    </div>
  </div>`;
  $("#editProfile").onclick=openSettings;
};

/* ---------- COACH IA ---------- */
let chatLog=[];
RENDER.coach=function(){
  const ins=proactiveInsights();
  $("#view-coach").innerHTML=`
  <div class="page-head">
    <div><div class="page-title">Coach IA — hybride</div>
    <div class="page-sub">Proactif (intervient seul selon le contexte) et réactif (répond à tes demandes). Connecté à toutes tes données + temps réel.</div></div>
  </div>
  <div class="grid g2">
    <div>
      <div class="card">
        <div class="card-title">Interventions proactives <span class="mini">${pad(now().getHours())}:${pad(now().getMinutes())} · ${sessionPhase(now())}</span></div>
        ${ins.length?ins.map(i=>`<div class="insight ${i.sev}">${i.txt}</div>`).join(""):`<div class="muted" style="font-size:12.5px">Processus nominal — aucune intervention nécessaire.</div>`}
      </div>
      <div class="card" style="margin-top:16px">
        <div class="card-title">Rapports automatiques</div>
        <div class="btn-row" style="margin-bottom:14px">
          <button class="btn sm" data-rep="daily">Rapport quotidien</button>
          <button class="btn sm" data-rep="weekly">Rapport hebdomadaire</button>
          <button class="btn sm" data-rep="monthly">Rapport mensuel</button>
        </div>
        <div id="reportBox"><div class="report-box muted">Le rapport est le « moment fort » de l'application : il n'aligne pas des chiffres, il explique ce qui s'améliore, ce qui se dégrade, pourquoi, et quel levier travailler en priorité.</div></div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Conversation <span class="mini">${state.settings.apiKey?"🟢 LLM connecté":"🔵 moteur local (branchez une clé API dans ⚙ pour le mode LLM)"}</span></div>
      <div class="chat">
        <div class="chat-log" id="chatLog"></div>
        <div class="chat-input">
          <input id="chatIn" placeholder='Ex : "analyse ma semaine", "quelles sont mes erreurs ?", "que me conseilles-tu ?"'>
          <button class="btn primary" id="chatSend">Envoyer</button>
        </div>
      </div>
    </div>
  </div>`;
  renderChat();
  $$("[data-rep]").forEach(b=>b.onclick=()=>{
    const r=b.dataset.rep==="daily"?dailyReport(todayISO()):b.dataset.rep==="weekly"?weeklyReport():monthlyReport();
    $("#reportBox").innerHTML=`<div class="report-box">${mdToHtml(r)}</div>`;
  });
  const send=async()=>{
    const v=$("#chatIn").value.trim();if(!v)return;
    chatLog.push({role:"user",text:v});$("#chatIn").value="";renderChat();
    chatLog.push({role:"ai",text:"*Analyse en cours…*"});renderChat();
    const reply=await coachReply(v);
    chatLog[chatLog.length-1]={role:"ai",html:reply};renderChat();
  };
  $("#chatSend").onclick=send;
  $("#chatIn").addEventListener("keydown",e=>{if(e.key==="Enter")send();});
  if(!chatLog.length){
    chatLog.push({role:"ai",html:mdToHtml(localReply("__init__"))});renderChat();
  }
};
function renderChat(){
  const el=$("#chatLog");if(!el)return;
  el.innerHTML=chatLog.map(m=>`<div class="msg ${m.role}">${m.role==="user"?esc(m.text):(m.html||mdToHtml(m.text))}</div>`).join("");
  el.scrollTop=el.scrollHeight;
}

/* ═══════════════════════════════════════════════════════════════
   PARAMÈTRES / DONNÉES
   ═══════════════════════════════════════════════════════════════ */
function openSettings(){
  const body=`
    <div class="field"><label>Nom du trader</label><input type="text" id="setName" value="${esc(state.profile.name)}"></div>
    <div class="field"><label>Plan de trading (une règle par ligne) — utilisé par le coach et les rappels</label>
      <textarea id="setRules" rows="6">${esc(state.profile.rules.join("\n"))}</textarea>
    </div>
    <div class="sep"></div>
    <div class="field"><label>Clé API LLM (optionnel — mode coach avancé)</label>
      <input type="password" id="setKey" placeholder="sk-…" value="${esc(state.settings.apiKey)}">
      <div style="font-size:11px;color:var(--faint);margin-top:5px">Stockée uniquement dans votre navigateur. Sans clé, le moteur de règles local reste pleinement fonctionnel.</div>
    </div>
    <div class="grid g2">
      <div class="field"><label>Modèle</label><input type="text" id="setModel" value="${esc(state.settings.model)}"></div>
      <div class="field"><label>Endpoint (compatible OpenAI)</label><input type="text" id="setEp" value="${esc(state.settings.endpoint)}"></div>
    </div>
    <div class="sep"></div>
    <div class="field"><label>Données</label>
      <div class="btn-row">
        <button class="btn sm" id="expJson">Exporter JSON</button>
        <button class="btn sm" id="impJson">Importer JSON</button>
        <button class="btn sm" id="expCsv">Exporter CSV (journal)</button>
        <button class="btn sm" id="reseed">Recharger la démo</button>
        <button class="btn sm danger" id="wipe">Tout effacer</button>
      </div>
      <input type="file" id="impFile" accept="application/json" style="display:none">
    </div>`;
  const close=openModal("Paramètres",body,`<button class="btn primary" id="saveSet">Enregistrer</button>`);
  const dl=(name,content,type)=>{
    const b=new Blob([content],{type});const u=URL.createObjectURL(b);
    const a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u);
  };
  $("#expJson").onclick=()=>dl("kairos-export-"+todayISO()+".json",JSON.stringify(state,null,2),"application/json");
  $("#expCsv").onclick=()=>{
    const head="date;time;mode;dayType;setup;grade;emotion;energy;planRespected;impulsive;pnl;context;notes";
    const rows=state.entries.map(e=>[e.date,e.time,e.mode,e.dayType,e.setup,e.grade,e.emotion,e.energy,e.planRespected,e.impulsive,e.pnl==null?"":e.pnl,(e.context||"").replace(/[\n;]/g," "),(e.notes||"").replace(/[\n;]/g," ")].join(";"));
    dl("kairos-journal-"+todayISO()+".csv",[head,...rows].join("\n"),"text/csv");
  };
  $("#impJson").onclick=()=>$("#impFile").click();
  $("#impFile").onchange=ev=>{
    const f=ev.target.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{try{const j=JSON.parse(rd.result);if(j.entries&&j.days){state=j;saveState();close();refresh();toast("Données importées.","good");}else toast("Fichier invalide.","bad");}catch(e){toast("JSON illisible.","bad");}};
    rd.readAsText(f);
  };
  $("#reseed").onclick=()=>{if(confirm("Recharger les données de démonstration ? Vos données actuelles seront remplacées.")){seedDemo();close();refresh();toast("Démo rechargée.","good");}};
  $("#wipe").onclick=async()=>{
    if(!confirm("Effacer TOUTES les données (y compris sur Supabase) et repartir de zéro ? Cette action est irréversible."))return;
    const oldEntryIds=state.entries.map(x=>x.id);
    const oldDayIsos=Object.keys(state.days);
    state=freshState();state.settings.demo=false;
    await Promise.all([
      ...oldEntryIds.map(id=>deleteEntryRemote(id)),
      ...oldDayIsos.map(iso=>deleteDayRemote(iso)),
    ]);
    saveState();close();refresh();toast("Données effacées — à vous d'écrire votre processus.");
  };
  $("#saveSet").onclick=()=>{
    state.profile.name=$("#setName").value.trim()||"Trader";
    state.profile.rules=$("#setRules").value.split("\n").map(x=>x.trim()).filter(Boolean);
    state.settings.apiKey=$("#setKey").value.trim();
    state.settings.model=$("#setModel").value.trim()||"gpt-4o-mini";
    state.settings.endpoint=$("#setEp").value.trim()||"https://api.openai.com/v1/chat/completions";
    saveState();close();refresh();toast("Paramètres enregistrés.","good");
  };
}

/* ═══════════════════════════════════════════════════════════════
   RAPPEL DU PLAN (pop-up non bloquant)
   ═══════════════════════════════════════════════════════════════ */
function showPlanReminder(){
  const close=openModal("Plan de trading — rappel",`
    <div style="font-size:13.5px;line-height:2.1;color:var(--txt2)">
      ${state.profile.rules.map((r,i)=>`<div><span class="mono t-acc" style="font-size:12px">${pad(i+1)}</span> · ${esc(r)}</div>`).join("")}
    </div>
    <div class="sep"></div>
    <div style="font-size:12px;color:var(--muted)">Ce système ne bloque rien. Il mesure si ces règles ont été respectées — c'est tout l'enjeu du Discipline Score.</div>`,
    `<button class="btn primary" id="ackPlan">Reçu</button>`);
  $("#ackPlan").onclick=close;
}

/* ═══════════════════════════════════════════════════════════════
   BOOT
   ═══════════════════════════════════════════════════════════════ */
function refresh(){RENDER[currentView]();enhanceResponsiveTables($("#view-"+currentView));}

// boot() est désormais async : on hydrate `state` depuis Supabase avant
// tout rendu. Le reste de la logique est inchangé par rapport à l'original.
async function boot(){
  const session = await requireAuth(); // défini dans js/auth.js — redirige vers login.html si absent
  if (!session) return; // requireAuth() a déjà déclenché la redirection

  state = await hydrateStateFromSupabase();
  if (!state) {
    // Cas limite : session valide mais hydratation échouée (coupure réseau pile à ce moment)
    toast("Impossible de charger vos données — vérifiez votre connexion et rechargez la page.", "bad", 10000);
    return;
  }

  if(!state.ui)state.ui={calMonth:todayISO().slice(0,7)};
  if(!state.settings)state.settings={apiKey:"",model:"gpt-4o-mini",endpoint:"https://api.openai.com/v1/chat/completions",demo:false};

  buildSidebar();
  tickClock();setInterval(tickClock,1000);
  showView("dashboard");
  $("#btnSettings").onclick=openSettings;
  $("#btnPlan").onclick=showPlanReminder;
  $("#btnLogout").onclick=logout;
  // Intervention proactive du coach à l'ouverture (non bloquante)
  setTimeout(()=>{
    const ins=proactiveInsights();
    if(ins.length)toast(`<b>Coach KAIROS ·</b> ${ins[0].txt}`,ins[0].sev,12000);
    else toast("<b>Coach KAIROS ·</b> Processus nominal. Bonne session — le plan d'abord, le trade ensuite.","good",8000);
  },1500);
  // Rapport quotidien automatique en fin de session
  setInterval(()=>{
    const d=now();
    if(d.getHours()===20&&d.getMinutes()===0&&d.getSeconds()<2&&!window._drSent){
      window._drSent=true;
      toast(`<b>Rapport quotidien disponible.</b> ${fmtFR(todayISO())} — ouvrez le Coach IA pour la synthèse.`,"info",15000);
    }
  },1000);
}
document.addEventListener("DOMContentLoaded",boot);
