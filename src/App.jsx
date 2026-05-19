import { useState } from "react";

// ─── CONSTANTES FISCALES 2025 OFFICIELLES (ACD Luxembourg) ───────────────────

const TRANCHES_LU = [
  { min: 0,       max: 13230,   taux: 0.00 },
  { min: 13230,   max: 15435,   taux: 0.08 },
  { min: 15435,   max: 17640,   taux: 0.09 },
  { min: 17640,   max: 19845,   taux: 0.10 },
  { min: 19845,   max: 22050,   taux: 0.11 },
  { min: 22050,   max: 24255,   taux: 0.12 },
  { min: 24255,   max: 26550,   taux: 0.14 },
  { min: 26550,   max: 28845,   taux: 0.16 },
  { min: 28845,   max: 31140,   taux: 0.18 },
  { min: 31140,   max: 33435,   taux: 0.20 },
  { min: 33435,   max: 35730,   taux: 0.22 },
  { min: 35730,   max: 38025,   taux: 0.24 },
  { min: 38025,   max: 40320,   taux: 0.26 },
  { min: 40320,   max: 42615,   taux: 0.28 },
  { min: 42615,   max: 44910,   taux: 0.30 },
  { min: 44910,   max: 47205,   taux: 0.32 },
  { min: 47205,   max: 49500,   taux: 0.34 },
  { min: 49500,   max: 51795,   taux: 0.36 },
  { min: 51795,   max: 54090,   taux: 0.38 },
  { min: 54090,   max: 117450,  taux: 0.39 },
  { min: 117450,  max: 176160,  taux: 0.40 },
  { min: 176160,  max: 234870,  taux: 0.41 },
  { min: 234870,  max: Infinity, taux: 0.42 },
];

const TRANCHES_BE = [
  { min: 0,     max: 15820,   taux: 0.25 },
  { min: 15820, max: 27920,   taux: 0.40 },
  { min: 27920, max: 48320,   taux: 0.45 },
  { min: 48320, max: Infinity, taux: 0.50 },
];

const COTIS_LU      = 0.1265;
const CFE           = 0.07;
const ADD_BE        = 0.07;
const COTIS_SPEC    = 0.0307;
const COTIS_SPEC_MAX = 731.28;
const SEUIL_TV      = 24;
const JOURS_AN      = 220;
const INDEXATION    = 0.025; // 2,5% tranche indicielle LU

// Titres-repas LU : franchise 10,80€/j × 220j = 2 376€/an exonérés
const TITRES_REPAS_MENSUEL = 56;   // montant utilisateur
const FRANCHISE_TR_JOUR    = 10.8;

// Plafonds déductions LU 2025 (ACD officiel)
const P = {
  ep3: 3200, ep2: 1200, assur: 672,
  fdMax: 2574, fdUnit: 99,
  garde: 5400, baus18: 1344, baus41: 672,
  donsMin: 120, cihs: 700,
  cimMax: 3504, cimMin: 750,
};

// ─── MOTEUR ───────────────────────────────────────────────────────────────────

function impProg(base, tr) {
  if (base <= 0) return 0;
  let t = 0;
  for (const r of tr) {
    if (base <= r.min) break;
    t += (Math.min(base, r.max) - r.min) * r.taux;
  }
  return Math.max(0, t);
}

function getTxMarg(base) {
  for (let i = TRANCHES_LU.length - 1; i >= 0; i--)
    if (base > TRANCHES_LU[i].min) return TRANCHES_LU[i].taux;
  return 0;
}

// Calcul principal : prend tous les paramètres de situation + optimisations
function calcul(inp) {
  const {
    salaire, indexe, joursTV, voiture, typeVoiture, compCashMensuel,
    bonus, bonusPP, immo, classe, distanceKm,
    // Optimisations (pour calcul réel)
    ep3, ep2, assurances, interets, dateHypo, nbMenage, subvInterets,
    garde, bauspar, ageBauspar, dons, heuresSupp,
  } = inp;

  // ── Bruts
  const salaireEffectif = indexe ? salaire * (1 + INDEXATION) : salaire;
  const brutBase = salaireEffectif * 12;

  // Titres-repas : franchise 10,80€/j × 220j = 2376€/an max exonéré
  const trAnnuel = TITRES_REPAS_MENSUEL * 12;
  const trFranchise = Math.min(trAnnuel, FRANCHISE_TR_JOUR * JOURS_AN);
  const trImposable = Math.max(0, trAnnuel - trFranchise); // part imposable si > franchise

  // ATN voiture
  const tauxATN = typeVoiture === "electrique" ? 0.005 : typeVoiture === "electrique_plus" ? 0.006 : 0.02;
  const avVoiture = voiture > 0 ? voiture * tauxATN * 12 : 0;

  // Compensation cash = salaire brut pur
  const compCash = compCashMensuel * 12;

  // Bonus
  let bonusImp = bonus, bonusExo = 0;
  if (bonusPP && bonus > 0) {
    const elig = Math.min(bonus, brutBase * 0.30);
    bonusExo = elig * 0.50;
    bonusImp = bonus - bonusExo;
  }

  const brutImp = brutBase + avVoiture + compCash + trImposable + bonusImp;

  // ── Règle 24 jours
  const depasse = joursTV > SEUIL_TV;
  const exces   = Math.max(0, joursTV - SEUIL_TV);
  const pBE     = depasse ? exces / JOURS_AN : 0;
  const brutLU  = brutImp * (1 - pBE);
  const brutBE  = brutImp * pBE;

  // ── Cotisations LU
  const cotisLU = brutImp * COTIS_LU;

  // ── Frais déplacement
  const unites = Math.round(distanceKm);
  const unitesD = Math.max(0, Math.min(26, unites) - 4);
  const fd = unitesD * P.fdUnit;

  // ── Dépenses spéciales réelles (curseurs)
  const deductEp3    = Math.min(ep3, P.ep3);
  const deductEp2    = Math.min(ep2, P.ep2);
  const deductAssur  = Math.min(assurances, P.assur * nbMenage);
  const plafBaus     = ageBauspar < 41 ? P.baus18 * nbMenage : P.baus41 * nbMenage;
  const deductBaus   = Math.min(bauspar, plafBaus);
  const deductDons   = dons >= P.donsMin ? dons : 0;
  const deductGarde  = Math.min(garde, P.garde);

  // Intérêts hypo (nets de la subvention employeur)
  let interetsDeduct = 0;
  if (interets > 0) {
    const nets = Math.max(0, interets - subvInterets);
    if (dateHypo === "post2023") interetsDeduct = nets;
    else if (dateHypo === "2017_2023") interetsDeduct = Math.min(nets, 2000 * nbMenage);
    else interetsDeduct = Math.min(nets, 1500 * nbMenage);
  }

  // ── Base imposable LU (avec déductions réelles)
  const totalDS = cotisLU + deductEp3 + deductEp2 + deductAssur + deductBaus + deductDons + fd;
  const baseLU  = Math.max(0, brutLU - totalDS - deductGarde);

  let impBase;
  if (classe === "2") impBase = impProg(baseLU / 2, TRANCHES_LU) * 2;
  else impBase = impProg(baseLU, TRANCHES_LU);
  if (classe === "1a") impBase *= 0.85;
  const cfeImp   = impBase * CFE;
  const impLU    = impBase + cfeImp;
  const txM      = getTxMarg(baseLU);
  const txEff    = baseLU > 0 ? impLU / baseLU : 0;

  // Gain intérêts (bien BE → ajuste taux via revenu mondial)
  const gainInterets = interetsDeduct * txEff;

  // ── Déclaration belge
  const fpBE     = Math.min(5520, brutBE * 0.30);
  const impBEtrav = depasse ? impProg(Math.max(0, brutBE - fpBE), TRANCHES_BE) : 0;
  const mondial  = brutImp + immo;
  const baseMond = Math.max(0, mondial - Math.min(5520, mondial * 0.30));
  const txBE     = baseMond > 0 ? impProg(baseMond, TRANCHES_BE) / baseMond : 0;
  const impBEimmo = immo * txBE;
  const impBEbase = impBEtrav + impBEimmo;
  const additBE  = impBEbase * ADD_BE;
  const cotisSpecBE = Math.min(COTIS_SPEC_MAX, brutBE * COTIS_SPEC);
  const impBE    = impBEbase + additBE + cotisSpecBE;

  // ── CIM
  let cim = 0;
  if (classe === "1a") {
    if (baseLU < 60000)      cim = P.cimMax;
    else if (baseLU > 105000) cim = P.cimMin;
    else cim = Math.max(P.cimMin, P.cimMax - (baseLU - 60000) * 0.0612);
  }

  // ── CIHS
  const cihs = heuresSupp ? P.cihs : 0;

  // ── Net final
  const totalPrel = cotisLU + impLU + impBE - gainInterets - cim - cihs;
  const brutTotal = brutBase + avVoiture + compCash + trAnnuel + bonus;
  const netAnnuel = brutTotal - totalPrel;
  const netMensuel = netAnnuel / 12;
  const pression  = totalPrel / Math.max(1, brutTotal);

  // ── Économie 24j
  const eco24j = depasse
    ? impBEtrav + additBE * (impBEtrav / Math.max(1, impBEbase))
    : 0;

  // ── GAINS MAXIMAUX (indépendants des curseurs — toujours au plafond)
  // On recalcule txM sur base sans déductions pour référence maximale
  const baseLU_ref = Math.max(0, brutLU - cotisLU - fd);
  const txM_ref = getTxMarg(baseLU_ref);
  let imp_ref = classe === "2" ? impProg(baseLU_ref/2, TRANCHES_LU)*2 : impProg(baseLU_ref, TRANCHES_LU);
  if (classe === "1a") imp_ref *= 0.85;
  const txEff_ref = baseLU_ref > 0 ? (imp_ref * 1.07) / baseLU_ref : 0;

  const gainPP_max = !bonusPP && bonus > 0
    ? Math.min(bonus, brutBase * 0.30) * 0.50 * txM_ref * 1.07
    : 0;
  const gainFDsup = Math.max(0, P.fdMax * txM_ref * 1.07 - fd * txM_ref * 1.07);

  const gainsMax = [
    depasse && { id:"tv24",  label:"Respecter le seuil des 24 jours",         valMax: eco24j,                       priorite: true },
    cim > 0 && { id:"cim",   label:"Crédit d'impôt monoparental (CIM)",        valMax: P.cimMax,                     auto: true },
    { id:"ep3",   label:"Épargne pension 3e pilier (art.111bis)",              valMax: P.ep3 * txM_ref * 1.07,       plafond:"3 200€/an" },
    { id:"ep2",   label:"Régime complémentaire 2e pilier (art.110)",           valMax: P.ep2 * txM_ref * 1.07,       plafond:"1 200€/an" },
    { id:"hypo",  label:"Intérêts crédit hypothécaire (résidence BE)",         valMax: 8000 * txEff_ref,             plafond:"selon date/ménage" },
    { id:"subv",  label:"Subvention d'intérêts employeur",                     valMax: 3600 * txM_ref * 1.07,        plafond:"~3 600€/an exo." },
    { id:"assur", label:"Assurances vie / RC / santé (art.111)",               valMax: P.assur * txM_ref * 1.07,     plafond:"672€/pers." },
    { id:"baus",  label:"Épargne-logement Bausparvertrag",                     valMax: P.baus18 * txM_ref * 1.07,    plafond:"1 344€ (<41 ans)" },
    { id:"garde", label:"Frais garde enfants / domesticité",                   valMax: P.garde * txM_ref * 1.07,     plafond:"5 400€/an" },
    gainFDsup > 10 && { id:"fd", label:"Frais de déplacement (optimisés)",    valMax: gainFDsup,                    plafond:"2 574€ max" },
    gainPP_max > 0 && { id:"pp", label:"Prime participative 50% exonérée",    valMax: gainPP_max,                   plafond:"30% salaire brut" },
    { id:"cihs",  label:"Crédit CIHS heures supplémentaires",                  valMax: P.cihs,                       plafond:"700€ max" },
  ].filter(Boolean);

  const totalMax = gainsMax.reduce((s, g) => s + g.valMax, 0);

  return {
    brutBase, brutImp, brutTotal,
    trFranchise, trImposable, avVoiture, tauxATN, compCash,
    bonusImp, bonusExo,
    pBE: pBE * 100, depasse, exces,
    cotisLU, fd, unitesD,
    deductEp3, deductEp2, deductAssur, deductBaus, deductDons, deductGarde,
    gainInterets,
    impBase, cfeImp, impLU, impBE, impBEtrav, additBE, cotisSpecBE,
    cim, cihs,
    netAnnuel, netMensuel, pression: pression * 100,
    txM, txEff: txEff * 100,
    gainsMax, totalMax,
  };
}

// ─── DESIGN ───────────────────────────────────────────────────────────────────

const C = {
  bg:"#030c18", card:"rgba(255,255,255,0.03)", border:"rgba(255,255,255,0.07)",
  blue:"#38bdf8", green:"#34d399", amber:"#fbbf24",
  red:"#f87171", purple:"#a78bfa", text:"#f1f5f9", muted:"#64748b", sub:"#94a3b8",
};

const fmt  = v => new Intl.NumberFormat("fr-BE",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(v);
const fmtP = v => `${(+v).toFixed(1)}%`;

// ─── UI ATOMS ─────────────────────────────────────────────────────────────────

function Sl({ label, value, onChange, min, max, step=1, fmtFn, hint, color, disabled }) {
  return (
    <div style={{marginBottom:"1rem",opacity:disabled?0.5:1}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.22rem"}}>
        <span style={{fontSize:"0.7rem",color:color||C.sub,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</span>
        <span style={{fontSize:"0.88rem",fontWeight:700,color:C.text,fontVariantNumeric:"tabular-nums"}}>
          {fmtFn?fmtFn(value):value}
        </span>
      </div>
      {hint&&<p style={{fontSize:"0.65rem",color:C.muted,margin:"0 0 0.28rem"}}>{hint}</p>}
      <input type="range" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={e=>!disabled&&onChange(+e.target.value)}
        style={{width:"100%",accentColor:color||C.blue,cursor:disabled?"not-allowed":"pointer",height:"3px"}}/>
    </div>
  );
}

function Tog({ label, hint, checked, onChange }) {
  return (
    <div onClick={()=>onChange(!checked)} style={{
      display:"flex",justifyContent:"space-between",alignItems:"center",
      background:checked?"rgba(56,189,248,0.06)":C.card,
      border:`1px solid ${checked?"rgba(56,189,248,0.22)":C.border}`,
      borderRadius:"9px",padding:"0.6rem 0.8rem",marginBottom:"0.45rem",cursor:"pointer"
    }}>
      <div>
        <div style={{fontSize:"0.76rem",color:C.text,fontWeight:600}}>{label}</div>
        {hint&&<div style={{fontSize:"0.63rem",color:C.muted,marginTop:"0.1rem"}}>{hint}</div>}
      </div>
      <div style={{width:"32px",height:"17px",borderRadius:"9px",
        background:checked?C.blue:"#1e293b",
        border:`1px solid ${checked?C.blue:"#334155"}`,
        position:"relative",flexShrink:0,marginLeft:"0.7rem",transition:"background 0.15s"}}>
        <div style={{position:"absolute",top:"2px",left:checked?"15px":"2px",width:"11px",height:"11px",
          borderRadius:"50%",background:"#fff",transition:"left 0.15s"}}/>
      </div>
    </div>
  );
}

function Row({ label, val, sub, color, small }) {
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:small?"0.4rem 0":"0.52rem 0",borderBottom:`1px solid ${C.border}`}}>
      <div>
        <div style={{fontSize:small?"0.68rem":"0.73rem",color:C.sub}}>{label}</div>
        {sub&&<div style={{fontSize:"0.6rem",color:C.muted}}>{sub}</div>}
      </div>
      <div style={{fontSize:small?"0.8rem":"0.86rem",fontWeight:700,
        color:color||C.text,fontVariantNumeric:"tabular-nums"}}>{val}</div>
    </div>
  );
}

function Sect({ children }) {
  return <div style={{fontSize:"0.58rem",color:C.blue,textTransform:"uppercase",
    letterSpacing:"0.12em",margin:"1rem 0 0.55rem",
    display:"flex",alignItems:"center",gap:"0.5rem"}}>
    <div style={{flex:1,height:"1px",background:"rgba(56,189,248,0.12)"}}/>
    {children}
    <div style={{flex:1,height:"1px",background:"rgba(56,189,248,0.12)"}}/>
  </div>;
}

function Alrt({ children, type="info" }) {
  const m={
    info:{bg:"rgba(56,189,248,0.06)",b:"rgba(56,189,248,0.2)",c:C.blue,i:"ℹ️"},
    warn:{bg:"rgba(245,158,11,0.06)",b:"rgba(245,158,11,0.2)",c:C.amber,i:"⚠️"},
    ok:{bg:"rgba(52,211,153,0.06)",b:"rgba(52,211,153,0.2)",c:C.green,i:"✅"},
  }[type];
  return <div style={{background:m.bg,border:`1px solid ${m.b}`,borderRadius:"9px",
    padding:"0.55rem 0.8rem",marginBottom:"0.6rem",display:"flex",gap:"0.45rem",alignItems:"flex-start"}}>
    <span style={{fontSize:"0.78rem",flexShrink:0}}>{m.i}</span>
    <span style={{fontSize:"0.7rem",color:m.c,lineHeight:1.5}}>{children}</span>
  </div>;
}

// ─── PAYWALL ──────────────────────────────────────────────────────────────────

function PaywallCTA({ totalMax, plan, onSelect }) {
  const plans = [
    {id:"decouverte", label:"Découverte", price:"9,99",  period:"une fois",   desc:"1 rapport · 30 jours",         color:C.blue},
    {id:"annuel",     label:"Annuel",     price:"29,99", period:"/ an",       desc:"Illimité · 1 personne",        color:C.amber, best:true, savings:"= 2,50€/mois"},
    {id:"cabinet",    label:"Cabinet",    price:"99",    period:"/ an",       desc:"Multi-clients · Fiduciaires",  color:C.purple},
  ];
  const sel = plans.find(p=>p.id===plan)||plans[1];

  const features = {
    decouverte: ["✓ Analyse complète de vos 12 leviers fiscaux","✓ Rapport PDF personnalisé téléchargeable","✓ Valable 30 jours — idéal pour tester"],
    annuel:     ["✓ Simulations illimitées toute l'année","✓ Mises à jour si loi change","✓ Formulaire Modèle 100 prérempli","✓ Alertes échéances BE + LU","✓ Scénarios : mariage, enfant, déménagement"],
    cabinet:    ["✓ Clients illimités — tableau de bord dédié","✓ PDF marque blanche avec votre logo","✓ Export Excel multi-dossiers","✓ Accès API pour intégration","✓ Support prioritaire + formation incluse"],
  };

  return (
    <div style={{background:"linear-gradient(135deg,rgba(14,165,233,0.07),rgba(2,132,199,0.03))",
      border:"1px solid rgba(56,189,248,0.18)",borderRadius:"14px",padding:"1.1rem",marginTop:"0.8rem"}}>
      <div style={{textAlign:"center",marginBottom:"0.9rem"}}>
        <div style={{fontSize:"0.6rem",color:C.blue,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.2rem"}}>
          🔓 Débloquer l'analyse complète
        </div>
        <div style={{fontSize:"1.05rem",fontWeight:800,color:C.text}}>
          Récupérez jusqu'à <span style={{color:C.green}}>{fmt(totalMax)}/an</span>
        </div>
        <div style={{fontSize:"0.65rem",color:C.muted,marginTop:"0.12rem"}}>
          soit <strong style={{color:C.green}}>{fmt(totalMax/12)}/mois</strong> supplémentaires nets
        </div>
      </div>

      <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.8rem"}}>
        {plans.map(p=>(
          <button key={p.id} onClick={()=>onSelect(p.id)} style={{
            flex:1,padding:"0.6rem 0.15rem",borderRadius:"9px",cursor:"pointer",
            border:`2px solid ${plan===p.id?p.color:C.border}`,
            background:plan===p.id?`rgba(${p.id==="decouverte"?"56,189,248":p.id==="annuel"?"251,191,36":"167,139,250"},0.09)`:C.card,
            color:plan===p.id?p.color:C.muted,
            fontFamily:"inherit",transition:"all 0.14s",position:"relative",
          }}>
            {p.best&&<div style={{position:"absolute",top:"-7px",left:"50%",transform:"translateX(-50%)",
              background:C.amber,color:"#000",fontSize:"0.48rem",fontWeight:800,
              padding:"0.07rem 0.32rem",borderRadius:"3px",whiteSpace:"nowrap"}}>MEILLEURE VALEUR</div>}
            <div style={{fontSize:"0.7rem",fontWeight:800}}>{p.label}</div>
            <div style={{fontSize:"0.95rem",fontWeight:900}}>€{p.price}</div>
            <div style={{fontSize:"0.52rem",opacity:0.85,marginTop:"0.04rem"}}>{p.period}</div>
          </button>
        ))}
      </div>

      <div style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${sel.color}22`,
        borderRadius:"9px",padding:"0.65rem 0.8rem",marginBottom:"0.7rem"}}>
        <div style={{fontSize:"0.68rem",fontWeight:700,color:sel.color,marginBottom:"0.35rem"}}>{sel.desc}</div>
        {sel.savings&&<div style={{fontSize:"0.6rem",color:C.green,marginBottom:"0.3rem",fontWeight:600}}>💡 {sel.savings}</div>}
        {(features[sel.id]||[]).map((f,i)=>(
          <div key={i} style={{fontSize:"0.65rem",color:C.sub,marginBottom:"0.18rem"}}>{f}</div>
        ))}
      </div>

      {totalMax > 0 && (
        <div style={{background:"rgba(52,211,153,0.05)",border:"1px solid rgba(52,211,153,0.16)",
          borderRadius:"8px",padding:"0.45rem 0.7rem",marginBottom:"0.65rem",
          display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{fontSize:"0.63rem",color:C.muted}}>Retour sur investissement</span>
          <span style={{fontSize:"0.7rem",fontWeight:800,color:C.green}}>
            {Math.round(totalMax/parseFloat(sel.price.replace(",",".")))
              .toLocaleString("fr-BE")}× votre abonnement
          </span>
        </div>
      )}

      <button style={{width:"100%",padding:"0.82rem",borderRadius:"9px",
        background:`linear-gradient(135deg,${sel.color},${sel.id==="annuel"?"#d97706":sel.id==="cabinet"?"#7c3aed":"#0284c7"})`,
        border:"none",color:"#fff",fontSize:"0.82rem",fontWeight:800,
        cursor:"pointer",fontFamily:"inherit",letterSpacing:"0.02em"}}>
        Commencer avec {sel.label} — €{sel.price}{sel.period!=="une fois"?` ${sel.period}`:""} →
      </button>
      <div style={{fontSize:"0.56rem",color:C.muted,textAlign:"center",marginTop:"0.4rem"}}>
        {plan==="decouverte"?"Paiement unique · Aucun abonnement · Remboursé si insatisfait"
          :"Résiliation à tout moment · Remboursé si insatisfait · RGPD conforme"}
      </div>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────

export default function FrontalierFiscal() {
  const [tab, setTab]     = useState("situation");
  const [plan, setPlan]   = useState("annuel");
  const [unlocked, setUnlocked] = useState(false);

  // ── Situation
  const [salaire, setSalaire]         = useState(5000);
  const [indexe, setIndexe]           = useState(false);
  const [joursTV, setJoursTV]         = useState(20);
  const [voiture, setVoiture]         = useState(0);
  const [typeVoiture, setTypeVoiture] = useState("thermique");
  const [compCashMensuel, setCompCash]= useState(0);
  const [bonus, setBonus]             = useState(0);
  const [bonusPP, setBonusPP]         = useState(false);
  const [classe, setClasse]           = useState("1");
  // Revenus immobiliers BE : non exposés dans le MVP (à ajouter plus tard)
  const immo = 0;

  // ── Optimisations (tous interactifs)
  const [distanceKm, setDistKm]   = useState(20);
  const [ep3, setEp3]             = useState(0);
  const [ep2, setEp2]             = useState(0);
  const [assurances, setAssur]    = useState(0);
  const [interets, setInterets]   = useState(0);
  const [dateHypo, setDateHypo]   = useState("2017_2023");
  const [nbMenage, setNbMenage]   = useState(1);
  const [subvInterets, setSubv]   = useState(0);
  const [garde, setGarde]         = useState(0);
  const [bauspar, setBauspar]     = useState(0);
  const [ageBauspar, setAgeBaus]  = useState(35);
  const [dons, setDons]           = useState(0);
  const [heuresSupp, setHS]       = useState(false);

  const r = calcul({
    salaire, indexe, joursTV, voiture, typeVoiture, compCashMensuel,
    bonus, bonusPP, immo, classe, distanceKm,
    ep3, ep2, assurances, interets, dateHypo, nbMenage, subvInterets,
    garde, bauspar, ageBauspar, dons, heuresSupp,
  });

  const TABS = [
    {id:"situation",   label:"Ma situation"},
    {id:"resultats",   label:"Résultats"},
    {id:"optimisation",label:"Optimisation"},
  ];

  const VISIBLE = 2;
  const gainsVis  = r.gainsMax.slice(0, VISIBLE);
  const gainsFlo  = r.gainsMax.slice(VISIBLE);
  const totVis    = gainsVis.reduce((s,g)=>s+g.valMax,0);
  const totFlo    = gainsFlo.reduce((s,g)=>s+g.valMax,0);

  const pressBarre = [
    {label:"Net perçu", pct:100-r.pression,                                                    color:C.blue},
    {label:"Cotis. LU", pct:(r.cotisLU/Math.max(1,r.brutTotal))*100,                          color:C.amber},
    {label:"Impôt LU",  pct:(r.impLU/Math.max(1,r.brutTotal))*100,                            color:C.red},
    {label:"Impôt BE",  pct:(r.impBE/Math.max(1,r.brutTotal))*100,                            color:C.purple},
  ];

  // Salaire indexé pour affichage comparatif
  const salaireIndexe = salaire * (1 + INDEXATION);

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,
      fontFamily:"'IBM Plex Mono','Fira Code','Courier New',monospace",
      maxWidth:"460px",margin:"0 auto"}}>

      {/* ── HEADER ── */}
      <div style={{background:"linear-gradient(180deg,#091525 0%,transparent 100%)",
        borderBottom:`1px solid ${C.border}`,padding:"1.15rem 1.25rem 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.65rem",marginBottom:"0.75rem"}}>
          <div style={{width:"30px",height:"30px",borderRadius:"7px",
            background:"linear-gradient(135deg,#0ea5e9,#0369a1)",
            display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.95rem"}}>🇱🇺</div>
          <div style={{flex:1}}>
            <div style={{fontSize:"0.88rem",fontWeight:700,letterSpacing:"0.02em"}}>FrontalierFiscal</div>
            <div style={{fontSize:"0.57rem",color:C.blue,textTransform:"uppercase",letterSpacing:"0.1em"}}>
              BE × LU · Barème ACD officiel 2025
            </div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"0.55rem",color:C.muted,textTransform:"uppercase"}}>Taux marginal</div>
            <div style={{fontSize:"0.78rem",fontWeight:700,color:C.amber}}>
              {fmtP((r.txM + r.txM * CFE) * 100)}
            </div>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1,background:"none",border:"none",padding:"0.48rem 0.15rem",
              fontSize:"0.68rem",fontFamily:"inherit",cursor:"pointer",
              color:tab===t.id?C.blue:C.muted,
              borderBottom:tab===t.id?`2px solid ${C.blue}`:"2px solid transparent",
              transition:"color 0.14s",position:"relative"
            }}>
              {t.label}
              {t.id==="optimisation" && r.totalMax > 0 && (
                <span style={{position:"absolute",top:"-1px",right:"1px",
                  background:C.green,color:"#000",fontSize:"0.48rem",fontWeight:800,
                  padding:"0.04rem 0.28rem",borderRadius:"3px"}}>
                  max {fmt(r.totalMax)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── STICKY NET ── */}
      <div style={{background:"linear-gradient(90deg,rgba(14,165,233,0.09),rgba(2,132,199,0.04))",
        borderBottom:`1px solid rgba(56,189,248,0.14)`,padding:"0.8rem 1.25rem",
        display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:"0.57rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Net mensuel</div>
          <div style={{fontSize:"1.75rem",fontWeight:900,color:C.blue,fontVariantNumeric:"tabular-nums",lineHeight:1.1}}>
            {fmt(r.netMensuel)}
          </div>
          <div style={{fontSize:"0.6rem",color:C.muted}}>{fmt(r.netAnnuel)}/an</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:"0.57rem",color:C.muted,textTransform:"uppercase",letterSpacing:"0.08em"}}>Pression fiscale</div>
          <div style={{fontSize:"1.25rem",fontWeight:800,
            color:r.pression>48?C.red:r.pression>38?C.amber:C.green}}>
            {fmtP(r.pression)}
          </div>
          <div style={{fontSize:"0.6rem",color:C.green,fontWeight:600}}>
            ↑ max {fmt(r.totalMax)}/an récup.
          </div>
        </div>
      </div>

      <div style={{padding:"1rem 1.25rem 4rem"}}>

        {/* ════════ SITUATION ════════ */}
        {tab==="situation" && (<>

          <Sect>Revenus luxembourgeois</Sect>

          {/* Salaire + Indexation */}
          <Sl label="Salaire brut mensuel" value={salaire} onChange={setSalaire}
            min={2500} max={20000} step={10} fmtFn={fmt}/>

          {/* Toggle indexation */}
          <div onClick={()=>setIndexe(v=>!v)} style={{
            display:"flex",justifyContent:"space-between",alignItems:"center",
            background:indexe?"rgba(52,211,153,0.06)":C.card,
            border:`1px solid ${indexe?"rgba(52,211,153,0.25)":C.border}`,
            borderRadius:"9px",padding:"0.6rem 0.8rem",marginBottom:"0.5rem",cursor:"pointer"
          }}>
            <div>
              <div style={{fontSize:"0.76rem",color:C.text,fontWeight:600}}>
                Appliquer l'indexation salariale (+2,5%)
              </div>
              <div style={{fontSize:"0.63rem",color:C.muted,marginTop:"0.1rem"}}>
                Tranche indicielle LU 2025 — impact sur le brut annuel
              </div>
            </div>
            <div style={{width:"32px",height:"17px",borderRadius:"9px",
              background:indexe?C.green:"#1e293b",
              border:`1px solid ${indexe?C.green:"#334155"}`,
              position:"relative",flexShrink:0,marginLeft:"0.7rem",transition:"background 0.15s"}}>
              <div style={{position:"absolute",top:"2px",left:indexe?"15px":"2px",
                width:"11px",height:"11px",borderRadius:"50%",
                background:"#fff",transition:"left 0.15s"}}/>
            </div>
          </div>

          {/* Aperçu indexation */}
          {indexe && (
            <div style={{background:"rgba(52,211,153,0.05)",border:"1px solid rgba(52,211,153,0.2)",
              borderRadius:"9px",padding:"0.6rem 0.8rem",marginBottom:"0.8rem"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.25rem"}}>
                <span style={{fontSize:"0.68rem",color:C.sub}}>Salaire brut actuel</span>
                <span style={{fontSize:"0.78rem",fontWeight:700,color:C.muted}}>{fmt(salaire)}/mois</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.25rem"}}>
                <span style={{fontSize:"0.68rem",color:C.sub}}>Indexation +2,5%</span>
                <span style={{fontSize:"0.78rem",fontWeight:700,color:C.green}}>
                  +{fmt(salaire * INDEXATION)}/mois
                </span>
              </div>
              <div style={{borderTop:`1px solid rgba(52,211,153,0.2)`,paddingTop:"0.25rem",
                display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <span style={{fontSize:"0.72rem",color:C.text,fontWeight:700}}>Brut après indexation</span>
                <span style={{fontSize:"0.9rem",fontWeight:900,color:C.green,fontVariantNumeric:"tabular-nums"}}>
                  {fmt(salaireIndexe)}/mois
                </span>
              </div>
              <div style={{fontSize:"0.6rem",color:C.muted,marginTop:"0.2rem"}}>
                Soit {fmt(salaireIndexe*12)}/an (+{fmt(salaire*INDEXATION*12)}/an)
              </div>
            </div>
          )}

          <Sl label="Bonus / 13e mois annuel" value={bonus} onChange={setBonus}
            min={0} max={60000} step={10} fmtFn={fmt}/>
          <Tog label="Prime participative (art. 115 13a LIR)"
            hint="50% exonérée si bénéfices · max 30% salaire brut"
            checked={bonusPP} onChange={setBonusPP}/>

          {/* Titres-repas */}
          <Sect>Titres-repas</Sect>
          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:"9px",padding:"0.75rem 0.85rem",marginBottom:"0.8rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.3rem"}}>
              <span style={{fontSize:"0.72rem",color:C.sub}}>Montant mensuel</span>
              <span style={{fontSize:"0.9rem",fontWeight:800,color:C.text}}>
                {fmt(TITRES_REPAS_MENSUEL)}/mois
              </span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.65rem",marginBottom:"0.18rem"}}>
              <span style={{color:C.sub}}>Franchise exonérée (10,80€/j × 220j)</span>
              <span style={{color:C.green,fontWeight:700}}>{fmt(r.trFranchise)}/an</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.65rem"}}>
              <span style={{color:C.sub}}>Part imposable (si dépassement)</span>
              <span style={{color:r.trImposable>0?C.amber:C.muted,fontWeight:700}}>
                {r.trImposable>0?fmt(r.trImposable)+"/an":"— néant"}
              </span>
            </div>
          </div>

          <Sect>Package voiture</Sect>
          <div style={{marginBottom:"0.8rem"}}>
            <div style={{fontSize:"0.66rem",color:C.sub,textTransform:"uppercase",
              letterSpacing:"0.05em",marginBottom:"0.45rem"}}>Votre employeur vous propose</div>
            <div style={{display:"flex",gap:"0.35rem",marginBottom:"0.6rem"}}>
              {[["voiture","🚗 Voiture de société"],["cash","💶 Compensation financière"]].map(([v,l])=>(
                <button key={v}
                  onClick={()=>{ if(v==="voiture") setCompCash(0); else setVoiture(0); }}
                  style={{
                    flex:1,padding:"0.5rem 0.3rem",borderRadius:"8px",cursor:"pointer",
                    border:`1px solid ${(v==="voiture"?voiture>0:compCashMensuel>0)?C.blue:C.border}`,
                    background:(v==="voiture"?voiture>0:compCashMensuel>0)?"rgba(56,189,248,0.09)":"transparent",
                    color:(v==="voiture"?voiture>0:compCashMensuel>0)?C.blue:C.muted,
                    fontSize:"0.68rem",fontWeight:700,fontFamily:"inherit",
                  }}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {compCashMensuel === 0 && (<>
            <Sl label="Valeur catalogue du véhicule" value={voiture} onChange={setVoiture}
              min={0} max={100000} step={10} fmtFn={fmt}
              hint={voiture>0?`ATN imposable : ${fmt(Math.round(voiture*r.tauxATN*12))}/an (taux ${(r.tauxATN*100).toFixed(1)}%/mois)`:"Entrez la valeur TTC du véhicule"}/>
            {voiture>0&&(
              <div style={{marginBottom:"0.8rem"}}>
                <div style={{fontSize:"0.66rem",color:C.sub,textTransform:"uppercase",
                  letterSpacing:"0.05em",marginBottom:"0.4rem"}}>Motorisation (taux ATN 2025)</div>
                <div style={{display:"flex",gap:"0.35rem"}}>
                  {[["thermique","⛽ Thermique","2%/mois"],["electrique","⚡ Élec. ≤18kWh","0,5%/mois"],["electrique_plus","⚡ Élec. >18kWh","0,6%/mois"]].map(([v,l,t])=>(
                    <button key={v} onClick={()=>setTypeVoiture(v)} style={{
                      flex:1,padding:"0.42rem 0.15rem",borderRadius:"7px",cursor:"pointer",
                      border:`1px solid ${typeVoiture===v?C.green:C.border}`,
                      background:typeVoiture===v?"rgba(52,211,153,0.09)":"transparent",
                      color:typeVoiture===v?C.green:C.muted,
                      fontSize:"0.58rem",fontWeight:700,fontFamily:"inherit",
                      display:"flex",flexDirection:"column",alignItems:"center",gap:"0.08rem"
                    }}>
                      <span>{l}</span><span style={{fontSize:"0.58rem"}}>{t}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {voiture===0&&(<>
            <Sl label="Compensation financière mensuelle" value={compCashMensuel}
              onChange={setCompCash} min={0} max={2000} step={10} fmtFn={fmt}/>
            {compCashMensuel>0&&(
              <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.2)",
                borderRadius:"9px",padding:"0.65rem 0.8rem",marginBottom:"0.8rem"}}>
                <div style={{fontSize:"0.7rem",color:C.amber,fontWeight:700,marginBottom:"0.25rem"}}>
                  ⚠️ Traitement fiscal de la compensation cash
                </div>
                <div style={{fontSize:"0.67rem",color:C.sub,lineHeight:1.5}}>
                  Traitée comme <strong style={{color:C.text}}>salaire brut ordinaire</strong> — cotisations sociales LU (12,65%) + impôt au barème progressif complet.
                  Généralement <strong style={{color:C.amber}}>moins avantageux</strong> qu'une voiture de société de valeur équivalente.
                </div>
              </div>
            )}
          </>)}

          <Sect>Télétravail</Sect>
          <div style={{background:joursTV>SEUIL_TV?"rgba(245,158,11,0.05)":"rgba(52,211,153,0.04)",
            border:`1px solid ${joursTV>SEUIL_TV?"rgba(245,158,11,0.18)":"rgba(52,211,153,0.16)"}`,
            borderRadius:"9px",padding:"0.75rem",marginBottom:"0.75rem"}}>
            <Sl label="Jours de télétravail / an" value={joursTV} onChange={setJoursTV}
              min={0} max={110} step={1} color={joursTV>SEUIL_TV?C.amber:C.green}/>
            <div style={{fontSize:"0.66rem",color:joursTV>SEUIL_TV?C.amber:C.green,fontWeight:600}}>
              {joursTV>SEUIL_TV
                ?`⚠️ +${r.exces} jours → ${fmtP(r.pBE)} de vos revenus imposés en Belgique`
                :`✅ ${SEUIL_TV-joursTV} jour(s) de marge restante`}
            </div>
          </div>

          <Sect>Situation personnelle</Sect>
          <div style={{marginBottom:"1rem"}}>
            <div style={{fontSize:"0.66rem",color:C.sub,textTransform:"uppercase",
              letterSpacing:"0.05em",marginBottom:"0.45rem"}}>Classe d'imposition LU</div>
            <div style={{display:"flex",gap:"0.35rem"}}>
              {[["1","Célibataire"],["1a","Monoparental"],["2","Marié/Pacsé"]].map(([c,l])=>(
                <button key={c} onClick={()=>setClasse(c)} style={{
                  flex:1,padding:"0.48rem 0.2rem",borderRadius:"7px",cursor:"pointer",
                  border:`1px solid ${classe===c?C.blue:C.border}`,
                  background:classe===c?"rgba(56,189,248,0.09)":"transparent",
                  color:classe===c?C.blue:C.muted,
                  fontSize:"0.66rem",fontWeight:700,fontFamily:"inherit",
                  display:"flex",flexDirection:"column",alignItems:"center",gap:"0.08rem"
                }}>
                  <span style={{fontSize:"0.78rem"}}>Cl.{c}</span>
                  <span style={{fontSize:"0.52rem",opacity:0.8}}>{l}</span>
                </button>
              ))}
            </div>
          </div>

          <button onClick={()=>setTab("resultats")} style={{
            width:"100%",padding:"0.82rem",borderRadius:"9px",
            background:"linear-gradient(135deg,#0ea5e9,#0284c7)",
            border:"none",color:"#fff",fontSize:"0.8rem",fontWeight:800,
            cursor:"pointer",fontFamily:"inherit",marginTop:"0.3rem"}}>
            Calculer mes résultats →
          </button>
        </>)}

        {/* ════════ RÉSULTATS ════════ */}
        {tab==="resultats" && (<>
          {r.depasse
            ?<Alrt type="warn"><strong>Seuil 24j dépassé !</strong> {joursTV}j ({r.exces} de trop) → {fmtP(r.pBE)} de vos revenus imposés en Belgique.</Alrt>
            :<Alrt type="ok">Seuil 24j respecté ({joursTV}/{SEUIL_TV}j). Revenus du travail intégralement imposés au Luxembourg.</Alrt>
          }

          <Sect>Revenus bruts annuels</Sect>
          <Row label="Salaire brut LU" sub={indexe?"Indexation +2,5% appliquée":undefined} val={fmt(r.brutBase)} small/>
          <Row label={`Titres-repas (${fmt(TITRES_REPAS_MENSUEL)}/mois)`}
            sub={`Dont ${fmt(r.trFranchise)}/an exonérés (10,80€/j)`}
            val={fmt(TITRES_REPAS_MENSUEL*12)} small/>
          {r.avVoiture>0&&<Row label={`ATN voiture (${(r.tauxATN*100).toFixed(1)}%/mois)`}
            sub="Avantage en nature imposable" val={fmt(r.avVoiture)} small/>}
          {r.compCash>0&&<Row label="Compensation financière (cash)"
            sub="Salaire brut pur — cotisations + impôt pleins" val={fmt(r.compCash)} color={C.amber} small/>}
          {r.bonusExo>0&&<Row label="Prime participative — exonérée 50%" val={`− ${fmt(r.bonusExo)}`} color={C.green} small/>}
          {r.bonusImp>0&&<Row label="Bonus imposable" val={fmt(r.bonusImp)} small/>}
          <Row label="Total brut imposable" val={fmt(r.brutImp)}/>

          <Sect>Prélèvements annuels</Sect>
          <Row label="Cotisations sociales LU (12,65%)" val={`− ${fmt(r.cotisLU)}`} color={C.amber} small/>
          {r.fd>0&&<Row label={`Frais déplacement (${r.unitesD} unités × 99€)`}
            sub="Déduit avant impôt LU" val={`− ${fmt(r.fd)}`} color={C.green} small/>}
          {r.deductEp3>0&&<Row label="Épargne pension 3e pilier" val={`− ${fmt(r.deductEp3)}`} color={C.green} small/>}
          {r.deductEp2>0&&<Row label="Régime complémentaire 2e pilier" val={`− ${fmt(r.deductEp2)}`} color={C.green} small/>}
          {r.gainInterets>0&&<Row label="Gain intérêts hypothécaires" val={`− ${fmt(r.gainInterets)}`} color={C.green} small/>}
          {r.deductAssur>0&&<Row label="Assurances (art.111 LIR)" val={`− ${fmt(r.deductAssur)}`} color={C.green} small/>}
          {r.deductBaus>0&&<Row label="Épargne-logement Bauspar" val={`− ${fmt(r.deductBaus)}`} color={C.green} small/>}
          {r.deductGarde>0&&<Row label="Frais garde / domesticité" val={`− ${fmt(r.deductGarde)}`} color={C.green} small/>}
          {r.deductDons>0&&<Row label="Dons organismes agréés" val={`− ${fmt(r.deductDons)}`} color={C.green} small/>}
          <Row label={`Impôt LU (Classe ${classe})`} sub={`Taux eff. ${fmtP(r.txEff)}`}
            val={`− ${fmt(r.impBase)}`} color={C.red} small/>
          <Row label="CFE (7% sur l'impôt)" val={`− ${fmt(r.cfeImp)}`} color={C.red} small/>
          {r.cim>0&&<Row label="Crédit d'impôt monoparental (CIM)" val={`+ ${fmt(r.cim)}`} color={C.green} small/>}
          {r.cihs>0&&<Row label="Crédit CIHS heures supp." val={`+ ${fmt(r.cihs)}`} color={C.green} small/>}
          {r.impBE>0&&<>
            <Row label="Impôt belge + additionnels" val={`− ${fmt(r.impBEtrav+r.additBE)}`} color={C.purple} small/>
            <Row label="Cotisation spéciale SS belge" val={`− ${fmt(r.cotisSpecBE)}`} color={C.purple} small/>
          </>}

          <div style={{marginTop:"0.75rem"}}>
            <Row label="Revenu net annuel" val={fmt(r.netAnnuel)}/>
          </div>
          <div style={{background:"linear-gradient(135deg,#0ea5e9,#0284c7)",borderRadius:"11px",
            padding:"0.9rem 1.1rem",display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"0.5rem"}}>
            <div>
              <div style={{fontSize:"0.6rem",color:"rgba(255,255,255,0.7)",textTransform:"uppercase",letterSpacing:"0.08em"}}>Net mensuel</div>
              <div style={{fontSize:"0.62rem",color:"rgba(255,255,255,0.5)"}}>Tous prélèvements déduits</div>
            </div>
            <div style={{fontSize:"1.6rem",fontWeight:900,color:"#fff",fontVariantNumeric:"tabular-nums"}}>
              {fmt(r.netMensuel)}
            </div>
          </div>

          <div style={{background:C.card,border:`1px solid ${C.border}`,
            borderRadius:"9px",padding:"0.85rem",marginTop:"0.9rem"}}>
            <div style={{fontSize:"0.58rem",color:C.muted,textTransform:"uppercase",
              letterSpacing:"0.08em",marginBottom:"0.6rem"}}>Répartition du brut</div>
            {pressBarre.map(b=>(
              <div key={b.label} style={{marginBottom:"0.42rem"}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.66rem",marginBottom:"0.14rem"}}>
                  <span style={{color:C.sub}}>{b.label}</span>
                  <span style={{color:b.color,fontWeight:700}}>{fmtP(b.pct)}</span>
                </div>
                <div style={{height:"3px",background:"rgba(255,255,255,0.04)",borderRadius:"2px",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${Math.max(0,Math.min(100,b.pct))}%`,
                    background:b.color,transition:"width 0.4s",borderRadius:"2px"}}/>
                </div>
              </div>
            ))}
          </div>

          <button onClick={()=>setTab("optimisation")} style={{
            width:"100%",marginTop:"0.9rem",padding:"0.75rem",borderRadius:"9px",
            background:"linear-gradient(135deg,rgba(52,211,153,0.12),rgba(52,211,153,0.06))",
            border:`1px solid rgba(52,211,153,0.25)`,color:C.green,fontSize:"0.78rem",
            fontWeight:700,cursor:"pointer",fontFamily:"inherit"}}>
            Voir mes optimisations (max {fmt(r.totalMax)}/an) →
          </button>
        </>)}

        {/* ════════ OPTIMISATION ════════ */}
        {tab==="optimisation" && (<>

          <Alrt type="info">
            Ajustez vos leviers. Le gain <strong>maximum atteignable</strong> affiché en bas
            est calculé aux plafonds légaux 2025, indépendamment des curseurs.
          </Alrt>

          {/* ═══ LEVIERS VISIBLES (3 premiers) ═══ */}

          {/* Levier 1 : 24 jours (priorité si dépassé) */}
          {r.depasse && (
            <div style={{background:"rgba(249,115,22,0.06)",border:"1px solid rgba(249,115,22,0.22)",
              borderRadius:"10px",padding:"0.85rem",marginBottom:"0.8rem"}}>
              <div style={{fontSize:"0.6rem",color:"#fb923c",textTransform:"uppercase",
                letterSpacing:"0.08em",marginBottom:"0.3rem"}}>⚡ Priorité absolue</div>
              <Sl label="Jours de télétravail / an" value={joursTV} onChange={setJoursTV}
                min={0} max={110} step={1} color={joursTV>SEUIL_TV?C.amber:C.green}
                hint={joursTV>SEUIL_TV?`Dépasse de ${r.exces}j — économie potentielle si sous le seuil`:`✅ Sous le seuil — gain préservé`}/>
            </div>
          )}

          {/* Levier 2 : Frais de déplacement */}
          <Sect>Frais de déplacement</Sect>
          <Sl label="Distance domicile ↔ travail (km)" value={distanceKm} onChange={setDistKm}
            min={1} max={100} step={1} color={C.blue}
            hint={`${r.unitesD} unité(s) × 99€ = ${fmt(r.fd)}/an déduit automatiquement`}/>

          {/* Levier 3 : Épargne 3e pilier */}
          <Sect>Épargne pension 3e pilier</Sect>
          <Sl label="Versement annuel (art. 111bis)" value={ep3} onChange={setEp3}
            min={0} max={3200} step={10} fmtFn={fmt}
            hint={`Plafond 2025 : 3 200€ · Gain estimé : ${fmt(ep3*(r.txM*1.07))}/an`}/>

          {/* ═══ LEVIERS FLOUTÉS (paywall) ═══ */}
          {!unlocked ? (
            <div style={{position:"relative",marginTop:"1.2rem"}}>

              {/* Contenu flouté */}
              <div style={{filter:"blur(6px)",pointerEvents:"none",userSelect:"none"}}>
                <Sect>Régime complémentaire 2e pilier</Sect>
                <Sl label="Cotisations personnelles (art. 110)" value={ep2} onChange={()=>{}}
                  min={0} max={1200} step={10} fmtFn={fmt}
                  hint="Plafond : 1 200€/an"/>

                <Sect>Crédit hypothécaire (résidence BE)</Sect>
                <Sl label="Intérêts débiteurs annuels" value={interets} onChange={()=>{}}
                  min={0} max={20000} step={10} fmtFn={fmt}/>
                <Sl label="Subvention d'intérêts employeur" value={subvInterets} onChange={()=>{}}
                  min={0} max={3600} step={10} fmtFn={fmt}/>
                <Sl label="Personnes dans le ménage fiscal" value={nbMenage} onChange={()=>{}}
                  min={1} max={6} step={1}/>

                <Sect>Dépenses spéciales (art. 111 LIR)</Sect>
                <Sl label="Assurances vie / RC / santé" value={assurances} onChange={()=>{}}
                  min={0} max={P.assur*4} step={10} fmtFn={fmt}/>
                <Sl label="Épargne-logement Bausparvertrag" value={bauspar} onChange={()=>{}}
                  min={0} max={P.baus18*4} step={10} fmtFn={fmt}/>

                <Sect>Charges extraordinaires</Sect>
                <Sl label="Frais garde enfants / domesticité" value={garde} onChange={()=>{}}
                  min={0} max={5400} step={10} fmtFn={fmt}/>
                <Sl label="Dons à organismes agréés" value={dons} onChange={()=>{}}
                  min={0} max={5000} step={10} fmtFn={fmt}/>

                <Sect>Crédits d'impôt</Sect>
                <Tog label="Heures supplémentaires au LU (CIHS)" checked={false} onChange={()=>{}}/>
              </div>

              {/* Overlay paywall */}
              <div style={{position:"absolute",inset:0,display:"flex",alignItems:"flex-start",
                justifyContent:"center",paddingTop:"4rem",pointerEvents:"none"}}>
                <div style={{background:"rgba(3,12,24,0.95)",backdropFilter:"blur(8px)",
                  borderRadius:"14px",border:`1px solid rgba(56,189,248,0.25)`,
                  padding:"1.1rem 1.3rem",textAlign:"center",maxWidth:"320px",
                  boxShadow:"0 8px 32px rgba(0,0,0,0.4)",pointerEvents:"auto"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:"0.4rem"}}>🔒</div>
                  <div style={{fontSize:"0.85rem",fontWeight:800,color:C.text,marginBottom:"0.3rem"}}>
                    8 leviers fiscaux supplémentaires
                  </div>
                  <div style={{fontSize:"0.68rem",color:C.sub,lineHeight:1.5,marginBottom:"0.7rem"}}>
                    Intérêts hypothécaires, assurances, épargne-logement,
                    frais de garde, dons, heures supp... pour récupérer jusqu'à{" "}
                    <strong style={{color:C.green}}>{fmt(r.totalMax)}/an</strong>
                  </div>
                  <div style={{fontSize:"0.62rem",color:C.muted,marginBottom:"0.6rem"}}>
                    ⬇ Débloquez l'analyse complète ci-dessous
                  </div>
                  <div style={{display:"inline-block",background:"rgba(56,189,248,0.12)",
                    color:C.blue,padding:"0.3rem 0.7rem",borderRadius:"6px",
                    fontSize:"0.65rem",fontWeight:700}}>
                    À partir de €9,99
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Tous les leviers débloqués */}
              <Sect>Régime complémentaire 2e pilier</Sect>
              <Sl label="Cotisations personnelles (art. 110)" value={ep2} onChange={setEp2}
                min={0} max={1200} step={10} fmtFn={fmt}
                hint={`Plafond : 1 200€/an · Gain estimé : ${fmt(ep2*(r.txM*1.07))}/an`}/>

              <Sect>Crédit hypothécaire (résidence BE)</Sect>
              <Sl label="Intérêts débiteurs annuels" value={interets} onChange={setInterets}
                min={0} max={20000} step={10} fmtFn={fmt}/>
              {interets>0&&(<>
                <Sl label="Subvention d'intérêts employeur" value={subvInterets} onChange={setSubv}
                  min={0} max={Math.min(interets,3600)} step={10} fmtFn={fmt}
                  hint="Exonérée — à déduire des intérêts bruts"/>
                <div style={{marginBottom:"0.8rem"}}>
                  <div style={{fontSize:"0.66rem",color:C.sub,textTransform:"uppercase",
                    letterSpacing:"0.05em",marginBottom:"0.4rem"}}>Date de disponibilité du bien</div>
                  <div style={{display:"flex",gap:"0.35rem"}}>
                    {[["post2023","Après 2023 ✨"],["2017_2023","2017–2023"],["avant2017","Avant 2017"]].map(([v,l])=>(
                      <button key={v} onClick={()=>setDateHypo(v)} style={{
                        flex:1,padding:"0.4rem 0.2rem",borderRadius:"7px",cursor:"pointer",
                        border:`1px solid ${dateHypo===v?C.blue:C.border}`,
                        background:dateHypo===v?"rgba(56,189,248,0.08)":"transparent",
                        color:dateHypo===v?C.blue:C.muted,
                        fontSize:"0.6rem",fontWeight:700,fontFamily:"inherit"
                      }}>{l}</button>
                    ))}
                  </div>
                </div>
                <Sl label="Personnes dans le ménage fiscal" value={nbMenage} onChange={setNbMenage}
                  min={1} max={6} step={1}
                  hint={`Plafond total : ${dateHypo==="post2023"?"illimité":fmt(dateHypo==="2017_2023"?2000*nbMenage:1500*nbMenage)}`}/>
              </>)}

              <Sect>Dépenses spéciales (art. 111 LIR)</Sect>
              <Sl label="Assurances vie / RC / santé" value={assurances} onChange={setAssur}
                min={0} max={P.assur*4} step={10} fmtFn={fmt}
                hint={`Plafond : ${fmt(P.assur*nbMenage)} (672€ × ${nbMenage} pers.)`}/>
              <Sl label="Épargne-logement Bausparvertrag" value={bauspar} onChange={setBauspar}
                min={0} max={P.baus18*4} step={10} fmtFn={fmt}
                hint={`Plafond : ${ageBauspar<41?"1 344":"672"}€/pers.`}/>
              {bauspar>0&&<Sl label="Votre âge" value={ageBauspar} onChange={setAgeBaus}
                min={18} max={70} step={1} fmtFn={v=>`${v} ans`}
                hint={ageBauspar<41?"< 41 ans → 1 344€/pers.":"≥ 41 ans → 672€/pers."}/>}

              <Sect>Charges extraordinaires</Sect>
              <Sl label="Frais garde enfants / domesticité" value={garde} onChange={setGarde}
                min={0} max={5400} step={10} fmtFn={fmt}
                hint="Plafond 2025 : 450€/mois · 5 400€/an"/>
              <Sl label="Dons à organismes agréés" value={dons} onChange={setDons}
                min={0} max={5000} step={10} fmtFn={fmt}
                hint="Minimum 120€/an pour être déductible"/>

              <Sect>Crédits d'impôt</Sect>
              {classe==="1a"&&(
                <div style={{background:"rgba(52,211,153,0.06)",border:"1px solid rgba(52,211,153,0.2)",
                  borderRadius:"9px",padding:"0.75rem",marginBottom:"0.6rem"}}>
                  <div style={{fontSize:"0.7rem",color:C.green,fontWeight:700}}>
                    Crédit d'impôt monoparental (CIM) — Classe 1a
                  </div>
                  <div style={{fontSize:"0.68rem",color:C.sub,marginTop:"0.15rem"}}>Calculé automatiquement</div>
                  <div style={{fontSize:"1.1rem",fontWeight:900,color:C.green,marginTop:"0.25rem"}}>
                    + {fmt(r.cim)}/an
                  </div>
                </div>
              )}
              <Tog label="Heures supplémentaires au LU (CIHS)"
                hint="Crédit max 700€/an si heures exonérées LU sont réimposées en BE"
                checked={heuresSupp} onChange={setHS}/>
            </>
          )}

          {/* ── RÉCAP GAINS MAXIMAUX ── */}
          <Sect>Gains maximaux atteignables</Sect>

          <div style={{background:"rgba(52,211,153,0.04)",border:"1px solid rgba(52,211,153,0.15)",
            borderRadius:"9px",padding:"0.6rem 0.8rem",marginBottom:"0.65rem",
            display:"flex",gap:"0.45rem",alignItems:"flex-start"}}>
            <span style={{fontSize:"0.78rem",flexShrink:0}}>📊</span>
            <span style={{fontSize:"0.67rem",color:C.sub,lineHeight:1.5}}>
              Les montants ci-dessous sont le{" "}
              <strong style={{color:C.green}}>maximum légal atteignable</strong>{" "}
              si chaque levier est appliqué à son plafond ACD 2025.
              Votre gain réel figure dans l'onglet Résultats.
            </span>
          </div>

          {/* Gains visibles */}
          {gainsVis.map(g=>(
            <div key={g.id} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:g.priorite?"rgba(249,115,22,0.06)":g.auto?"rgba(52,211,153,0.06)":C.card,
              border:`1px solid ${g.priorite?"rgba(249,115,22,0.22)":g.auto?"rgba(52,211,153,0.2)":C.border}`,
              borderRadius:"9px",padding:"0.65rem 0.85rem",marginBottom:"0.38rem"
            }}>
              <div>
                <div style={{fontSize:"0.7rem",color:C.sub}}>{g.label}</div>
                {g.plafond&&<div style={{fontSize:"0.58rem",color:C.muted}}>Plafond : {g.plafond}</div>}
                {g.priorite&&<div style={{fontSize:"0.58rem",color:C.amber}}>⚡ Configuré ci-dessus</div>}
                {g.auto&&<div style={{fontSize:"0.58rem",color:C.green}}>✓ Automatique</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:"0.6rem"}}>
                <div style={{fontSize:"0.9rem",fontWeight:800,
                  color:g.priorite?C.amber:C.green,fontVariantNumeric:"tabular-nums"}}>
                  + {fmt(g.valMax)}/an
                </div>
                <div style={{fontSize:"0.56rem",color:C.muted}}>max atteignable</div>
              </div>
            </div>
          ))}

          {/* Gains floutés (paywall) */}
          {!unlocked && gainsFlo.length>0&&(
            <div style={{position:"relative",marginTop:"0.2rem"}}>
              <div style={{filter:"blur(5px)",pointerEvents:"none",userSelect:"none"}}>
                {gainsFlo.map(g=>(
                  <div key={g.id} style={{
                    display:"flex",justifyContent:"space-between",alignItems:"center",
                    background:C.card,border:`1px solid ${C.border}`,
                    borderRadius:"9px",padding:"0.65rem 0.85rem",marginBottom:"0.38rem"
                  }}>
                    <div>
                      <div style={{fontSize:"0.7rem",color:C.sub}}>{g.label}</div>
                      {g.plafond&&<div style={{fontSize:"0.58rem",color:C.muted}}>Plafond : {g.plafond}</div>}
                    </div>
                    <div style={{textAlign:"right",flexShrink:0,marginLeft:"0.6rem"}}>
                      <div style={{fontSize:"0.9rem",fontWeight:800,color:C.green}}>+ {fmt(g.valMax)}/an</div>
                      <div style={{fontSize:"0.56rem",color:C.muted}}>max atteignable</div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center"}}>
                <div style={{background:"rgba(3,12,24,0.92)",borderRadius:"11px",
                  padding:"0.65rem 1rem",textAlign:"center",
                  border:`1px solid rgba(56,189,248,0.18)`}}>
                  <div style={{fontSize:"0.95rem",marginBottom:"0.18rem"}}>🔒</div>
                  <div style={{fontSize:"0.7rem",color:C.amber,fontWeight:700}}>
                    {gainsFlo.length} levier{gainsFlo.length>1?"s":""} masqué{gainsFlo.length>1?"s":""}
                  </div>
                  <div style={{fontSize:"0.62rem",color:C.muted,marginTop:"0.1rem"}}>
                    dont <span style={{color:C.green,fontWeight:700}}>{fmt(totFlo)}/an</span> supplémentaires
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Gains débloqués */}
          {unlocked && gainsFlo.map(g=>(
            <div key={g.id} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              background:C.card,border:`1px solid ${C.border}`,
              borderRadius:"9px",padding:"0.65rem 0.85rem",marginBottom:"0.38rem"
            }}>
              <div>
                <div style={{fontSize:"0.7rem",color:C.sub}}>{g.label}</div>
                {g.plafond&&<div style={{fontSize:"0.58rem",color:C.muted}}>Plafond : {g.plafond}</div>}
              </div>
              <div style={{textAlign:"right",flexShrink:0,marginLeft:"0.6rem"}}>
                <div style={{fontSize:"0.9rem",fontWeight:800,color:C.green}}>+ {fmt(g.valMax)}/an</div>
                <div style={{fontSize:"0.56rem",color:C.muted}}>max atteignable</div>
              </div>
            </div>
          ))}

          {/* Totaux */}
          <div style={{marginTop:"0.5rem"}}>
            {!unlocked&&(
              <div style={{display:"flex",justifyContent:"space-between",
                padding:"0.45rem 0",borderTop:`1px solid ${C.border}`}}>
                <span style={{fontSize:"0.7rem",color:C.sub}}>Gains visibles ({VISIBLE}/{r.gainsMax.length})</span>
                <span style={{fontSize:"0.82rem",fontWeight:800,color:C.green}}>+ {fmt(totVis)}/an</span>
              </div>
            )}
            <div style={{display:"flex",justifyContent:"space-between",
              padding:"0.5rem 0",borderTop:`1px solid rgba(52,211,153,0.2)`}}>
              <span style={{fontSize:"0.78rem",fontWeight:700,color:C.text}}>Total max atteignable</span>
              <span style={{fontSize:"0.85rem",fontWeight:800,color:C.green,
                filter:unlocked?"none":"blur(5px)",userSelect:unlocked?"auto":"none"}}>
                + {fmt(r.totalMax)}/an
              </span>
            </div>
          </div>

          {/* Total débloqué */}
          {unlocked&&(
            <div style={{background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.22)",
              borderRadius:"10px",padding:"0.8rem 0.95rem",
              display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:"0.3rem"}}>
              <div>
                <div style={{fontSize:"0.73rem",fontWeight:700,color:C.text}}>Max légal — plafonds ACD 2025</div>
                <div style={{fontSize:"0.6rem",color:C.muted}}>★ Tous leviers au plafond</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:"1.15rem",fontWeight:900,color:C.green}}>+ {fmt(r.totalMax)}</div>
                <div style={{fontSize:"0.6rem",color:C.muted}}>+{fmt(r.totalMax/12)}/mois</div>
              </div>
            </div>
          )}

          {/* CTA */}
          {!unlocked&&<PaywallCTA totalMax={r.totalMax} plan={plan} onSelect={setPlan}/>}

          <button onClick={()=>setUnlocked(v=>!v)} style={{
            width:"100%",marginTop:"0.5rem",padding:"0.45rem",
            background:"transparent",border:`1px dashed ${C.border}`,
            color:C.muted,fontSize:"0.62rem",cursor:"pointer",
            borderRadius:"7px",fontFamily:"inherit"
          }}>
            [DÉMO] {unlocked?"Réactiver le paywall":"Simuler un accès Premium"}
          </button>
        </>)}

        <div style={{marginTop:"1.8rem",paddingTop:"0.7rem",borderTop:`1px solid ${C.border}`,
          fontSize:"0.56rem",color:"#1a2535",lineHeight:1.6,textAlign:"center"}}>
          Simulation basée sur le barème ACD officiel (Mémorial A N°590/2024) et le Code des impôts belge 2025.
          Ne constitue pas un conseil fiscal. Consultez un expert pour votre situation personnelle.
        </div>
      </div>
    </div>
  );
  
}
