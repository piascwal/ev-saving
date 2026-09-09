import {
  THERMIQUES, ELECTRIQUES, PRIX_DEFAUT, PRIX_ANCIENS, TARIFS_ELEC,
  CARBURANTS, CARBURANTS_COURT, CO2,
} from './vehicles.js';

const CLE_CONFIG = 'ev-saving:config:v1';
const CLE_TRAJET = 'ev-saving:trajet:v1';
const CLE_CUMUL  = 'ev-saving:cumul:v1';

const $ = (sel) => document.querySelector(sel);

/* ------------------- conditions d'utilisation --------------------- */

const CLE_CGU = 'ev-saving:cgu:v1';

// Le voile est affiché par défaut dans le HTML : si le script échoue, les
// conditions restent visibles plutôt que d'être silencieusement contournées.
function cguAcceptees() {
  try {
    return JSON.parse(localStorage.getItem(CLE_CGU) || 'null')?.accepte === true;
  } catch {
    return false;
  }
}

function fermerCgu() {
  document.getElementById('cgu').hidden = true;
  document.body.style.overflow = '';
}

function ouvrirCgu(consultation) {
  const voile = document.getElementById('cgu');
  voile.hidden = false;
  document.body.style.overflow = 'hidden';
  voile.querySelector('.cgu-texte').scrollTop = 0;
  document.getElementById('cgu-accepter').hidden = consultation;
  document.getElementById('cgu-engagement-bloc').hidden = consultation;
  document.getElementById('cgu-fermer').hidden = !consultation;
}

document.getElementById('cgu-case').addEventListener('change', (e) => {
  document.getElementById('cgu-accepter').disabled = !e.target.checked;
});

document.getElementById('cgu-accepter').addEventListener('click', () => {
  try {
    localStorage.setItem(CLE_CGU, JSON.stringify({
      accepte: true,
      version: 1,
      date: new Date().toISOString(),
    }));
  } catch { /* stockage indisponible : les conditions seront redemandées */ }
  fermerCgu();
  initAutorisation();
});

document.getElementById('cgu-fermer').addEventListener('click', fermerCgu);
document.getElementById('btn-revoir-cgu').addEventListener('click', () => ouvrirCgu(true));

if (cguAcceptees()) fermerCgu();

/* ------------------------------ état ------------------------------ */

const configDefaut = () => ({
  thermiqueId: 'tiguan-etsi',
  modeConso: 'moyenne',        // 'moyenne' (annoncée) ou 'reelle' (observée)
  consoReelleThermique: null,  // L/100 km saisis par l'utilisateur
  evId: 'modely-std',
  consoEv: null,               // kWh/100 km effectivement utilisés
  prix: {
    gazole: PRIX_DEFAUT.gazole,
    sp98: PRIX_DEFAUT.sp98,
    e10: PRIX_DEFAUT.e10,
    e85: PRIX_DEFAUT.e85,
    gpl: PRIX_DEFAUT.gpl,
  },
  tarif: {
    mode: 'unique',              // 'unique' ou 'mix' domicile / recharge publique
    unique: PRIX_DEFAUT.electricite,
    domicile: 0.1470,            // heures creuses
    public: 0.39,                // Superchargeur
    partDomicile: 85,            // % des kWh rechargés à domicile
  },
  wakelock: true,
  perso: [],                   // véhicules thermiques créés par l'utilisateur
});

const lire = (cle, defaut) => {
  try {
    const brut = localStorage.getItem(cle);
    return brut ? { ...defaut, ...JSON.parse(brut) } : { ...defaut };
  } catch {
    return { ...defaut };
  }
};
const ecrire = (cle, valeur) => {
  try { localStorage.setItem(cle, JSON.stringify(valeur)); } catch { /* stockage indisponible */ }
};

function chargerConfig() {
  const defauts = configDefaut();
  const cfg = lire(CLE_CONFIG, defauts);
  // lire() fusionne au premier niveau : les objets imbriqués enregistrés par une
  // version antérieure doivent être complétés clé par clé.
  cfg.prix = { ...defauts.prix, ...cfg.prix };
  cfg.tarif = { ...defauts.tarif, ...cfg.tarif };
  // Reprise des configurations créées avant le réglage tarifaire détaillé.
  const ancienPrix = cfg.prix?.electricite;
  if (cfg.tarifConfigure !== true) {
    if (Number.isFinite(ancienPrix)) cfg.tarif.unique = ancienPrix;
    cfg.tarifConfigure = true;
  }
  delete cfg.prix.electricite;

  // Les carburants « essence » et « diesel » sont devenus E10 et gazole, et les
  // prix de départ ont changé : on ne conserve que ceux réellement modifiés.
  if (cfg.carburantsMigres !== true) {
    if (Number.isFinite(cfg.prix.essence) && cfg.prix.essence !== PRIX_ANCIENS.essence) {
      cfg.prix.e10 = cfg.prix.essence;
    }
    if (Number.isFinite(cfg.prix.diesel) && cfg.prix.diesel !== PRIX_ANCIENS.diesel) {
      cfg.prix.gazole = cfg.prix.diesel;
    }
    if (cfg.prix.gpl === PRIX_ANCIENS.gpl) cfg.prix.gpl = PRIX_DEFAUT.gpl;
    for (const v of cfg.perso) {
      if (v.carburant === 'essence') v.carburant = 'e10';
      if (v.carburant === 'diesel') v.carburant = 'gazole';
    }
    cfg.carburantsMigres = true;
  }
  delete cfg.prix.essence;
  delete cfg.prix.diesel;
  return cfg;
}

let config = chargerConfig();
ecrire(CLE_CONFIG, config); // fige la reprise des anciens réglages
let trajet = lire(CLE_TRAJET, { distanceM: 0, vitesse: 0 });
if (!Number.isFinite(trajet.distanceM)) trajet = { distanceM: 0, vitesse: 0 };
let cumul  = lire(CLE_CUMUL,  { euros: 0, km: 0, co2: 0 });

let veilleId = null;      // identifiant watchPosition
let suiviActif = false;   // état demandé par l'utilisateur
let dernierPoint = null;  // dernière position retenue
let wakeLock = null;
const enCours = () => suiviActif;

/* --------------------------- catalogues --------------------------- */

const tousThermiques = () => [...THERMIQUES, ...config.perso];
const thermiqueActif = () =>
  tousThermiques().find((v) => v.id === config.thermiqueId) || THERMIQUES[0];
const evActif = () =>
  ELECTRIQUES.find((v) => v.id === config.evId) || ELECTRIQUES[0];

// Consommation thermique retenue (L/100 km)
function consoThermique() {
  const v = thermiqueActif();
  if (config.modeConso === 'reelle') {
    const saisie = Number(config.consoReelleThermique);
    return saisie > 0 ? saisie : v.reelle;
  }
  return v.conso;
}

// Consommation électrique retenue (kWh/100 km)
function consoElectrique() {
  const saisie = Number(config.consoEv);
  if (saisie > 0) return saisie;
  const v = evActif();
  return config.modeConso === 'reelle' ? v.reelle : v.conso;
}

// Prix du kWh réellement payé, moyenne pondérée en mode mix
function prixElectricite() {
  const t = config.tarif;
  if (t.mode === 'mix') {
    const part = Math.min(Math.max(Number(t.partDomicile) || 0, 0), 100) / 100;
    const domicile = Math.max(Number(t.domicile) || 0, 0);
    const public_ = Math.max(Number(t.public) || 0, 0);
    return domicile * part + public_ * (1 - part);
  }
  return Math.max(Number(t.unique) || 0, 0);
}

function prixCarburant() {
  const v = thermiqueActif();
  const p = Number(config.prix[v.carburant]);
  return Number.isFinite(p) ? p : PRIX_DEFAUT[v.carburant];
}

/* ---------------------------- calculs ---------------------------- */

function bilan(distanceM) {
  const km = distanceM / 1000;
  const centaines = km / 100;
  const litres = centaines * consoThermique();
  const kwh = centaines * consoElectrique();
  const carburant = thermiqueActif().carburant;
  const coutTh = litres * prixCarburant();
  const coutEv = kwh * prixElectricite();
  const co2 = litres * CO2[carburant] - kwh * CO2.electricite;
  return { km, litres, kwh, coutTh, coutEv, economie: coutTh - coutEv, co2 };
}

/* ---------------------------- formats ---------------------------- */

const nfEuro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const nfEuroFin = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

// Formate un montant avec un millième d'euro : sans valeur monétaire, il est
// affiché en gris (voir .millieme), uniquement pour voir le compteur avancer
// entre deux positions GPS. Renvoie aussi l'index de ce chiffre dans le texte,
// pour que ecrireAnime() sache lequel griser en permanence.
function texteEuroMillieme(montant) {
  let texte = '';
  let indexMillieme = -1;
  for (const part of nfEuroFin.formatToParts(montant)) {
    texte += part.value;
    if (part.type === 'fraction') indexMillieme = texte.length - 1;
  }
  return { texte, griser: indexMillieme >= 0 ? new Set([indexMillieme]) : null };
}
const nf = (n, d = 1) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

/* -------------------------- affichage animé ------------------------ */

// Remplace le texte d'un élément chiffre par chiffre : les caractères qui
// changent depuis le rendu précédent reçoivent un petit mouvement (voir
// .tourne dans styles.css), façon compteur mécanique, plutôt que le texte ne
// saute sans transition. `griser` liste les index à toujours afficher en gris
// (le millième d'euro). Sans effet au tout premier rendu, pour ne pas faire
// tourner l'écran entier à l'ouverture de l'application.
function ecrireAnime(el, texte, griser = null) {
  const avant = el.dataset.valeur;
  el.dataset.valeur = texte;
  if (avant === texte) return;
  const premierRendu = avant === undefined;

  let html = '';
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    const classes = [];
    if (griser?.has(i)) classes.push('millieme');
    if (!premierRendu && c !== avant[i]) classes.push('tourne');
    html += classes.length ? `<span class="${classes.join(' ')}">${c}</span>` : c;
  }
  el.innerHTML = html;
}

function majCompteur() {
  const b = bilan(trajet.distanceM);
  const { texte: texteEconomie, griser } = texteEuroMillieme(b.economie);
  ecrireAnime($('#economie'), texteEconomie, griser);
  ecrireAnime($('#economie-km'),
    b.km > 0.2 ? `${nfEuro.format((b.economie / b.km) * 100)} / 100 km` : '— € / 100 km');
  ecrireAnime($('#co2'), `${nf(Math.max(b.co2, 0), 1)} kg de CO₂ évités`);
  ecrireAnime($('#distance'), nf(b.km, b.km < 10 ? 2 : 1));
  ecrireAnime($('#vitesse'), nf(trajet.vitesse || 0, 0));
  ecrireAnime($('#cout-ev'), nf(b.coutEv, 2));
  ecrireAnime($('#cout-th'), nf(b.coutTh, 2));
  $('#economie').classList.toggle('negatif', b.economie < 0);
  majCumul(b);
}

function majResume() {
  const th = thermiqueActif();
  const ev = evActif();
  const mode = config.modeConso === 'reelle' ? 'réelle' : 'moyenne';
  $('#etiquette-thermique').textContent = `Coût ${CARBURANTS_COURT[th.carburant] || th.carburant}`;
  $('#resume-thermique').textContent =
    `${th.nom} — ${nf(consoThermique(), 1)} L/100 (${mode})`;
  $('#resume-ev').textContent = `${ev.nom} — ${nf(consoElectrique(), 1)} kWh/100`;
  $('#resume-prix').textContent =
    `${nf(prixCarburant(), 3)} €/L · ${nf(prixElectricite(), 3)} €/kWh`;
}

// Le cumul affiché inclut le trajet en cours, pas seulement les trajets déjà
// clôturés : sans cela, cette carte restait figée entre deux appuis sur
// « Réinitialiser » pendant que le compteur du trajet, lui, avançait.
function majCumul(b = bilan(trajet.distanceM)) {
  const euros = cumul.euros + b.economie;
  const km = cumul.km + b.km;
  const co2 = Math.max(cumul.co2 + b.co2, 0);
  const { texte: texteEuros, griser } = texteEuroMillieme(euros);
  ecrireAnime($('#cumul-euros'), texteEuros, griser);
  ecrireAnime($('#cumul-km'), `${nf(km, km < 10 ? 2 : 1)} km`);
  ecrireAnime($('#cumul-co2'), `${nf(co2, 1)} kg`);
}

function majBoutons() {
  $('#btn-demarrer').textContent = enCours() ? 'Mettre en pause' : 'Démarrer le trajet';
  $('#btn-demarrer').classList.toggle('actif', enCours());
}

function etat(texte, erreur = false) {
  const el = $('#etat-gps');
  el.textContent = texte;
  el.classList.toggle('erreur', erreur);
}

function toutAfficher() {
  majResume();
  majCompteur(); // met aussi à jour le cumul
  majBoutons();
}

/* ------------------------------ GPS ------------------------------ */

const RAYON_TERRE = 6371000;   // m
const PRECISION_MAX = 200;     // m : au-delà, la position n'est pas exploitable
const PRECISION_RESEAU = 500;  // m : au-delà, la position vient du réseau, pas du GPS
const PRECISION_BRUIT_MAX = 30; // m : plafond du seuil de bruit, une précision
                                // annoncée pessimiste ne doit pas figer la distance
const SANS_SIGNAL_MS = 15000;  // au-delà, on prévient qu'aucun point n'arrive
const SILENCE_SONDAGE_MS = 8000; // sans point depuis ce délai, le sondage prend le relais

// Éléments de diagnostic : sans console dans un navigateur embarqué, c'est le
// seul moyen de savoir pourquoi rien ne bouge.
const diag = {
  points: 0,          // positions reçues depuis l'ouverture de la page
  pointsSuivi: 0,     // positions reçues depuis le démarrage du trajet en cours
  rejets: 0,
  sauts: 0,           // rejets « saut de position » consécutifs
  intervalle: '—',
  precisionBrute: 0,
  precisionLissee: 0,
  meilleurePrecision: Infinity,
  horodatage: '—',
  derniereErreur: 'aucune',
  derniereReception: 0,
  dernierFiltre: '—',
  source: '—',
};

// Filtre de Kalman à une dimension appliqué à la position, la précision
// annoncée servant de variance de mesure. Le GPS d'un véhicule oscille de
// plusieurs mètres d'une seconde à l'autre : sans lissage, cette dérive est
// comptée comme de la distance parcourue, et la vitesse calculée saute.
const BRUIT_MANOEUVRE = 5; // m/s : marge d'évolution laissée au véhicule
let filtre = null;

function reinitialiserFiltre() {
  filtre = null;
}

function lisser(point) {
  const varianceMesure = Math.max(point.precision, 1) ** 2;
  if (!filtre) {
    filtre = { lat: point.lat, lon: point.lon, variance: varianceMesure, t: point.t };
  } else {
    const dt = (point.t - filtre.t) / 1000;
    if (dt > 0) {
      filtre.variance += dt * BRUIT_MANOEUVRE ** 2;
      filtre.t = point.t;
    }
    const gain = filtre.variance / (filtre.variance + varianceMesure);
    filtre.lat += gain * (point.lat - filtre.lat);
    filtre.lon += gain * (point.lon - filtre.lon);
    filtre.variance *= 1 - gain;
  }
  return {
    lat: filtre.lat,
    lon: filtre.lon,
    t: point.t,
    precision: Math.sqrt(filtre.variance),
  };
}

function qualiteSignal(precision) {
  if (precision <= 12) return 'bon';
  if (precision <= 30) return 'moyen';
  return 'faible';
}

function distanceEntre(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.sqrt(h));
}

function majDiagnostic(pos) {
  $('#diag-secure').textContent = window.isSecureContext ? 'oui' : 'NON (HTTPS requis)';
  $('#diag-secure').classList.toggle('ko', !window.isSecureContext);
  $('#diag-api').textContent = 'geolocation' in navigator ? 'disponible' : 'ABSENTE';
  $('#diag-api').classList.toggle('ko', !('geolocation' in navigator));
  $('#diag-points').textContent =
    `${diag.points} reçus · ${diag.pointsSuivi} depuis le départ · ${diag.rejets} filtrés`;
  $('#diag-distance').textContent = `${trajet.distanceM.toFixed(0)} m`;
  $('#diag-filtre').textContent = diag.dernierFiltre;
  $('#diag-intervalle').textContent = diag.intervalle;
  $('#diag-horodatage').textContent = diag.horodatage;
  $('#diag-source').textContent = diag.source;
  $('#diag-erreur').textContent = diag.derniereErreur;
  $('#diag-erreur').classList.toggle('ko', diag.derniereErreur !== 'aucune');
  if (pos) {
    const c = pos.coords;
    $('#diag-pos').textContent = `${c.latitude.toFixed(5)}, ${c.longitude.toFixed(5)}`;
    $('#diag-precision').textContent = diag.precisionLissee
      ? `±${Math.round(diag.precisionBrute)} m brut · ±${Math.round(diag.precisionLissee)} m lissé`
      : `±${Math.round(c.accuracy ?? 0)} m`;
    $('#diag-vitesse').textContent = Number.isFinite(c.speed) && c.speed !== null
      ? `${(c.speed * 3.6).toFixed(0)} km/h`
      : 'non fournie';
  }
}

function majPermissionAffichee(etatPerm) {
  const libelles = { granted: 'accordée', denied: 'refusée', prompt: 'à demander' };
  $('#diag-perm').textContent = libelles[etatPerm] || etatPerm;
  $('#diag-perm').classList.toggle('ko', etatPerm === 'denied');
  // Le bloc d'autorisation ne disparaît qu'une fois la position réellement reçue.
  $('#bloc-gps').hidden = etatPerm === 'granted' && diag.points > 0;
}

function surPosition(pos, source = 'watchPosition') {
  diag.points += 1;
  if (enCours()) diag.pointsSuivi += 1;
  diag.source = source;
  diag.derniereReception = Date.now();
  diag.derniereErreur = 'aucune';
  majDiagnostic(pos);

  // Une position reçue vaut autorisation : on referme le bloc de demande.
  $('#bloc-gps').hidden = true;
  $('#gps-erreur').hidden = true;

  // L'écart entre deux points est mesuré sur l'horloge de l'appareil, à la
  // réception. Le timestamp fourni par le récepteur n'est pas fiable partout :
  // unité différente, horloge figée ou décalée. Une seconde mal mesurée suffit
  // à faire passer chaque segment pour un saut de position et à bloquer la
  // distance à zéro, alors que la vitesse, lue directement, continue d'avancer.
  const maintenant = Date.now();
  const ecartHorodatage = Number.isFinite(pos.timestamp)
    ? Math.abs(maintenant - pos.timestamp)
    : NaN;
  diag.horodatage = Number.isFinite(ecartHorodatage)
    ? (ecartHorodatage < 60000 ? 'cohérent' : `décalé de ${Math.round(ecartHorodatage / 1000)} s`)
    : 'absent';

  const brut = {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    t: maintenant,
    precision: pos.coords.accuracy ?? PRECISION_MAX,
  };

  diag.meilleurePrecision = Math.min(diag.meilleurePrecision, brut.precision);

  // Une position à plusieurs centaines de mètres près ne vient pas du récepteur
  // GPS mais des antennes ou du Wi-Fi : la compter fabriquerait des kilomètres
  // imaginaires. On l'écarte, et on explique comment obtenir mieux.
  if (brut.precision > PRECISION_MAX) {
    diag.rejets += 1;
    diag.dernierFiltre = `précision ±${Math.round(brut.precision)} m`;
    etat(
      brut.precision > PRECISION_RESEAU
        ? `Position réseau (±${Math.round(brut.precision)} m) — le GPS n'est pas encore accroché`
        : `Signal GPS trop imprécis (±${Math.round(brut.precision)} m)`,
      true,
    );
    majDiagnostic(pos);
    return;
  }

  const point = lisser(brut);
  diag.precisionBrute = brut.precision;
  diag.precisionLissee = point.precision;

  const vitesseMesuree = pos.coords.speed; // m/s, généralement fournie en voiture
  const vitesseFiable = Number.isFinite(vitesseMesuree) && vitesseMesuree !== null;
  if (vitesseFiable) trajet.vitesse = Math.max(vitesseMesuree, 0) * 3.6;

  if (dernierPoint) {
    const d = distanceEntre(dernierPoint, point);
    const dt = (point.t - dernierPoint.t) / 1000;
    const vitesseCalculee = dt > 0 ? d / dt : 0; // m/s

    // Le seuil de bruit est plafonné : certains récepteurs annoncent une
    // précision très pessimiste tout en suivant correctement la route.
    const seuil = Math.max(4, Math.min(point.precision, PRECISION_BRUIT_MAX) * 0.5);
    const aberrant = dt > 0 && vitesseCalculee > 70; // > 250 km/h : saut de position

    diag.intervalle = `${dt.toFixed(1)} s`;

    if (aberrant) {
      // Un point de référence erroné — première position captée ailleurs, fix
      // en cache — rendrait tous les suivants aberrants et figerait la distance
      // définitivement. Après trois rejets d'affilée, on repart d'ici.
      diag.rejets += 1;
      diag.sauts += 1;
      diag.dernierFiltre = `saut de position (${Math.round(vitesseCalculee * 3.6)} km/h)`;
      if (diag.sauts >= 3) {
        dernierPoint = point;
        diag.sauts = 0;
        diag.dernierFiltre += ' — référence recalée';
      }
    } else if (d >= seuil) {
      // Déplacement significatif : distance mesurée entre les deux points.
      trajet.distanceM += d;
      if (!vitesseFiable) trajet.vitesse = vitesseCalculee * 3.6;
      dernierPoint = point;
      diag.sauts = 0;
      diag.dernierFiltre = '—';
      ecrire(CLE_TRAJET, trajet);
    } else if (vitesseFiable && vitesseMesuree > 1.5 && dt > 0 && dt < 30) {
      // Déplacement sous le bruit du GPS alors que le récepteur annonce une
      // vitesse réelle : on intègre cette vitesse plutôt que de tout perdre.
      trajet.distanceM += vitesseMesuree * dt;
      dernierPoint = point;
      diag.sauts = 0;
      diag.dernierFiltre = 'distance estimée à partir de la vitesse';
      ecrire(CLE_TRAJET, trajet);
    } else {
      // Sous le seuil : le point de référence est conservé, la distance
      // s'accumule jusqu'à devenir significative.
      diag.rejets += 1;
      diag.dernierFiltre = `sous le bruit (${d.toFixed(1)} m < ${seuil.toFixed(0)} m)`;
      if (dt > 8) {
        // Arrêt prolongé : on recale la référence sans compter la dérive.
        if (!vitesseFiable) trajet.vitesse = 0;
        dernierPoint = point;
      }
    }
  } else {
    dernierPoint = point;
  }

  if (enCours()) {
    etat(`GPS actif — précision ±${Math.round(brut.precision)} m (signal ${qualiteSignal(brut.precision)})`);
  }
  else etat('GPS prêt — appuyez sur « Démarrer le trajet »');
  majCompteur();
}

function surErreurGps(err) {
  const messages = {
    1: "Autorisation GPS refusée. Autorisez la localisation pour ce site dans les réglages du navigateur, puis rechargez la page.",
    2: "Position indisponible : le récepteur GPS ne renvoie rien pour l'instant.",
    3: "Le GPS met trop de temps à répondre, nouvelle tentative en cours…",
  };
  const msg = messages[err.code] || `Erreur GPS : ${err.message}`;
  diag.derniereErreur = msg;
  majDiagnostic();
  etat(msg, true);

  if (err.code === 1) {
    arreterSuivi();
    $('#bloc-gps').hidden = false;
    const zone = $('#gps-erreur');
    zone.textContent = msg;
    zone.hidden = false;
    etat(msg, true); // l'arrêt du suivi ne doit pas masquer la cause
  }
  // Les codes 2 et 3 sont transitoires : watchPosition continue de tenter.
}

// maximumAge à 0 : une position en cache fausse la distance et la vitesse.
const OPTIONS_GPS = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

let sondageId = null;      // secours si watchPosition ne délivre rien
let batteur = null;        // rafraîchit l'affichage même sans nouveau point

// Certains navigateurs embarqués n'émettent jamais via watchPosition : on
// double alors le suivi par des appels ponctuels à getCurrentPosition.
function demarrerSondage() {
  if (sondageId !== null) return;
  diag.source = 'sondage (watchPosition muet)';
  sondageId = setInterval(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => surPosition(pos, 'sondage'),
      surErreurGps,
      { ...OPTIONS_GPS, maximumAge: 0 },
    );
  }, 2000);
}

function arreterSondage() {
  if (sondageId !== null) clearInterval(sondageId);
  sondageId = null;
}

// Sans point depuis quelques secondes, la vitesse affichée retombe à zéro et
// l'utilisateur est prévenu que le signal s'est interrompu.
function battre() {
  if (!enCours()) return;
  const depuis = diag.derniereReception ? Date.now() - diag.derniereReception : Infinity;

  // watchPosition reste muet chez plusieurs navigateurs embarqués : dès que le
  // flux se tarit, les appels ponctuels prennent le relais.
  if (depuis > SILENCE_SONDAGE_MS) demarrerSondage();

  if (depuis > 5000 && trajet.vitesse !== 0) {
    trajet.vitesse = 0;
  }
  if (diag.pointsSuivi === 0) {
    etat('Recherche du signal GPS…');
  } else if (depuis > SANS_SIGNAL_MS) {
    etat(`Aucune position depuis ${Math.round(depuis / 1000)} s`, true);
  }
  majCompteur();   // l'affichage reste vivant même sans nouveau point
  majDiagnostic();
}

function demarrerSuivi() {
  if (!verifierContexte()) return;

  dernierPoint = null;
  reinitialiserFiltre();
  diag.meilleurePrecision = Infinity;
  diag.derniereReception = 0;
  diag.pointsSuivi = 0;
  diag.dernierFiltre = '—';
  suiviActif = true;

  const id = navigator.geolocation.watchPosition(surPosition, surErreurGps, OPTIONS_GPS);
  // Un refus immédiat peut avoir arrêté le suivi avant même cette affectation.
  if (!suiviActif) {
    navigator.geolocation.clearWatch(id);
    return;
  }
  veilleId = id;

  // Un point immédiat évite d'attendre le premier événement de watchPosition.
  navigator.geolocation.getCurrentPosition(
    (pos) => surPosition(pos, 'getCurrentPosition'),
    () => {},
    { ...OPTIONS_GPS, maximumAge: 0 },
  );

  batteur = setInterval(battre, 1000);
  etat('Recherche du signal GPS…');
  majBoutons();
  demanderWakeLock();
}

function arreterSuivi() {
  suiviActif = false;
  if (veilleId !== null) {
    navigator.geolocation.clearWatch(veilleId);
    veilleId = null;
  }
  arreterSondage();
  reinitialiserFiltre();
  if (batteur !== null) clearInterval(batteur);
  batteur = null;
  dernierPoint = null;
  trajet.vitesse = 0;
  ecrire(CLE_TRAJET, trajet);
  relacherWakeLock();
  majBoutons();
  majCompteur();
  etat('GPS en pause');
}

/* --------------------------- wake lock --------------------------- */

async function demanderWakeLock() {
  if (!config.wakelock || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch { /* refusé ou non supporté : sans conséquence */ }
}

function relacherWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && enCours() && !wakeLock) demanderWakeLock();
});

/* -------------------------- autorisation ------------------------- */

// La géolocalisation exige un contexte sécurisé : en http:// ou file://,
// l'appel échoue silencieusement dans plusieurs navigateurs.
function verifierContexte() {
  const zone = $('#gps-erreur');
  if (!window.isSecureContext) {
    $('#alerte-https').hidden = false;
    $('#bloc-gps').hidden = false;
    zone.textContent = "Le GPS n'est accessible qu'en HTTPS (ou sur localhost). Ouvrez l'application via une adresse https:// ; un fichier ouvert directement ne peut pas géolocaliser.";
    zone.hidden = false;
    etat('GPS indisponible : page non sécurisée', true);
    return false;
  }
  if (!('geolocation' in navigator)) {
    $('#bloc-gps').hidden = false;
    zone.textContent = 'Ce navigateur ne fournit pas de position GPS.';
    zone.hidden = false;
    etat('GPS indisponible sur ce navigateur', true);
    return false;
  }
  return true;
}

async function etatAutorisation() {
  if (!navigator.permissions?.query) return 'prompt';
  try {
    // Certains navigateurs embarqués laissent la promesse en suspens :
    // au-delà d'une seconde on considère l'autorisation comme à demander.
    return await Promise.race([
      navigator.permissions.query({ name: 'geolocation' }).then((r) => r.state),
      new Promise((resoudre) => setTimeout(() => resoudre('prompt'), 1000)),
    ]);
  } catch {
    return 'prompt';
  }
}

let surveillanceDemande = null;

function demanderAutorisation() {
  if (!verifierContexte()) return;
  etat("Demande d'autorisation en cours…");
  const pointsAvant = diag.points;

  if (surveillanceDemande !== null) clearTimeout(surveillanceDemande);
  surveillanceDemande = setTimeout(() => {
    if (diag.points > pointsAvant) return;
    const msg = "Le navigateur n'a renvoyé aucune position. Vérifiez que la localisation est autorisée pour ce site et que le GPS du véhicule est actif, puis réessayez.";
    diag.derniereErreur = msg;
    majDiagnostic();
    etat(msg, true);
    $('#bloc-gps').hidden = false;
    const zone = $('#gps-erreur');
    zone.textContent = msg;
    zone.hidden = false;
  }, 8000);

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      clearTimeout(surveillanceDemande);
      surPosition(pos);
      etat('GPS autorisé — prêt à démarrer');
      majPermissionAffichee('granted');
    },
    (err) => {
      clearTimeout(surveillanceDemande);
      surErreurGps(err);
    },
    OPTIONS_GPS,
  );
}

async function initAutorisation() {
  majDiagnostic();
  if (!window.isSecureContext || !('geolocation' in navigator)) {
    verifierContexte();
    majPermissionAffichee('indisponible');
    return;
  }
  const etatPerm = await etatAutorisation();
  majPermissionAffichee(etatPerm);
  if (etatPerm === 'denied') {
    const zone = $('#gps-erreur');
    zone.textContent = "La localisation est bloquée pour ce site. Réautorisez-la dans les réglages du navigateur, puis rechargez la page.";
    zone.hidden = false;
  }
  if (etatPerm === 'granted') demanderAutorisation(); // récupère un premier point
}

$('#btn-autoriser').addEventListener('click', demanderAutorisation);
$('#btn-relancer').addEventListener('click', demanderAutorisation);

/* -------------------------- interactions ------------------------- */

document.querySelectorAll('.tab').forEach((onglet) => {
  onglet.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((o) => o.classList.toggle('is-active', o === onglet));
    $('#vue-compteur').hidden = onglet.dataset.vue !== 'compteur';
    $('#vue-reglages').hidden = onglet.dataset.vue !== 'reglages';
  });
});

$('#btn-demarrer').addEventListener('click', () => {
  if (enCours()) arreterSuivi();
  else demarrerSuivi();
});

$('#btn-reinit').addEventListener('click', () => {
  const b = bilan(trajet.distanceM);
  const message = b.km > 0.05
    ? `Terminer ce trajet ? ${nfEuro.format(b.economie)} sur ${nf(b.km, 1)} km seront ajoutés au cumul, puis le compteur repartira de zéro.`
    : 'Remettre le compteur de trajet à zéro ?';
  if (!confirm(message)) return;

  if (b.km > 0.05) {
    cumul.euros += b.economie;
    cumul.km += b.km;
    cumul.co2 += b.co2;
    ecrire(CLE_CUMUL, cumul);
  }
  trajet = { distanceM: 0, vitesse: 0 };
  dernierPoint = null;
  ecrire(CLE_TRAJET, trajet);
  majCompteur(); // met aussi à jour le cumul
  etat(enCours() ? 'Nouveau trajet en cours' : 'Trajet remis à zéro');
});

$('#btn-vider-cumul').addEventListener('click', () => {
  if (!confirm('Remettre le cumul de tous les trajets à zéro ?')) return;
  cumul = { euros: 0, km: 0, co2: 0 };
  ecrire(CLE_CUMUL, cumul);
  majCumul();
});

/* --------------------------- réglages ---------------------------- */

function remplirSelects() {
  const selTh = $('#sel-thermique');
  selTh.innerHTML = '';
  for (const v of tousThermiques()) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = `${v.nom} — ${CARBURANTS[v.carburant]}`;
    selTh.append(opt);
  }
  selTh.value = thermiqueActif().id;

  const selEv = $('#sel-ev');
  selEv.innerHTML = '';
  for (const v of ELECTRIQUES) {
    const opt = document.createElement('option');
    opt.value = v.id;
    opt.textContent = v.nom;
    selEv.append(opt);
  }
  selEv.value = evActif().id;
}

function majReglages() {
  const th = thermiqueActif();
  $('#apercu-moyenne').textContent = `(${nf(th.conso, 1)} L/100 km)`;
  $('#apercu-reelle').textContent = `(${nf(th.reelle, 1)} L/100 km par défaut)`;
  $('#conso-reelle').value = config.consoReelleThermique ?? th.reelle;
  $('#champ-conso-reelle').hidden = config.modeConso !== 'reelle';
  $('#conso-ev').value = nf(consoElectrique(), 1).replace(',', '.');
  $('#btn-perso-supprimer').hidden = !th.id.startsWith('perso-');
  document.querySelector(`input[name="mode-conso"][value="${config.modeConso}"]`).checked = true;
  for (const [sel, cle] of Object.entries(champsPrix)) $(sel).value = config.prix[cle];
  $('#opt-wakelock').checked = config.wakelock;
  majTarif();
}

function enregistrer() {
  ecrire(CLE_CONFIG, config);
  majResume();
  majCompteur();
}

$('#sel-thermique').addEventListener('change', (e) => {
  config.thermiqueId = e.target.value;
  config.consoReelleThermique = thermiqueActif().reelle; // valeur de départ réajustable
  enregistrer();
  majReglages();
});

$('#sel-ev').addEventListener('change', (e) => {
  config.evId = e.target.value;
  config.consoEv = null; // reprend la valeur du modèle choisi
  enregistrer();
  majReglages();
});

document.querySelectorAll('input[name="mode-conso"]').forEach((r) => {
  r.addEventListener('change', () => {
    config.modeConso = document.querySelector('input[name="mode-conso"]:checked').value;
    config.consoEv = null;
    enregistrer();
    majReglages();
  });
});

$('#conso-reelle').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  config.consoReelleThermique = v > 0 ? v : null;
  enregistrer();
});

$('#conso-ev').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value);
  config.consoEv = v > 0 ? v : null;
  enregistrer();
});

const champsPrix = {
  '#prix-gazole': 'gazole',
  '#prix-sp98': 'sp98',
  '#prix-e10': 'e10',
  '#prix-e85': 'e85',
  '#prix-gpl': 'gpl',
};
for (const [sel, cle] of Object.entries(champsPrix)) {
  $(sel).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    config.prix[cle] = Number.isFinite(v) && v >= 0 ? v : 0;
    enregistrer();
  });
}

/* ---------------------- tarif de l'électricité -------------------- */

function majTarif() {
  const t = config.tarif;
  document.querySelector(`input[name="mode-tarif"][value="${t.mode}"]`).checked = true;
  $('#bloc-tarif-unique').hidden = t.mode !== 'unique';
  $('#bloc-tarif-mix').hidden = t.mode !== 'mix';
  $('#tarif-unique').value = t.unique;
  $('#tarif-domicile').value = t.domicile;
  $('#tarif-public').value = t.public;
  $('#part-domicile').value = t.partDomicile;
  $('#part-valeur').textContent = `${t.partDomicile} %`;
  $('#tarif-effectif').textContent = `${nf(prixElectricite(), 4)} €/kWh`;
  document.querySelectorAll('.raccourcis .puce').forEach((b) => {
    b.classList.toggle('actif', Math.abs(Number(b.dataset.prix) - Number(t[b.dataset.cible])) < 1e-9);
  });
}

// Boutons de tarifs courants : un appui remplit le champ correspondant.
function poserRaccourcis(conteneur, tarifs, cible) {
  const zone = $(conteneur);
  zone.innerHTML = '';
  for (const tarif of tarifs) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'puce';
    b.dataset.prix = tarif.prix;
    b.dataset.cible = cible;
    b.textContent = tarif.prix > 0 ? `${tarif.nom} · ${nf(tarif.prix, 4)} €` : tarif.nom;
    b.addEventListener('click', () => {
      config.tarif[cible] = tarif.prix;
      enregistrer();
      majTarif();
    });
    zone.append(b);
  }
}

poserRaccourcis('#raccourcis-unique', [...TARIFS_ELEC.domicile, TARIFS_ELEC.public[0]], 'unique');
poserRaccourcis('#raccourcis-domicile', TARIFS_ELEC.domicile, 'domicile');
poserRaccourcis('#raccourcis-public', TARIFS_ELEC.public, 'public');

document.querySelectorAll('input[name="mode-tarif"]').forEach((r) => {
  r.addEventListener('change', () => {
    config.tarif.mode = document.querySelector('input[name="mode-tarif"]:checked').value;
    enregistrer();
    majTarif();
  });
});

for (const [sel, cle] of Object.entries({
  '#tarif-unique': 'unique',
  '#tarif-domicile': 'domicile',
  '#tarif-public': 'public',
})) {
  $(sel).addEventListener('input', (e) => {
    const v = parseFloat(e.target.value);
    config.tarif[cle] = Number.isFinite(v) && v >= 0 ? v : 0;
    enregistrer();
    $('#tarif-effectif').textContent = `${nf(prixElectricite(), 4)} €/kWh`;
  });
}

$('#part-domicile').addEventListener('input', (e) => {
  config.tarif.partDomicile = Number(e.target.value);
  enregistrer();
  $('#part-valeur').textContent = `${config.tarif.partDomicile} %`;
  $('#tarif-effectif').textContent = `${nf(prixElectricite(), 4)} €/kWh`;
});

$('#opt-wakelock').addEventListener('change', (e) => {
  config.wakelock = e.target.checked;
  ecrire(CLE_CONFIG, config);
  if (config.wakelock && enCours()) demanderWakeLock();
  else relacherWakeLock();
});

$('#btn-perso-ajouter').addEventListener('click', () => {
  const nom = $('#perso-nom').value.trim();
  const conso = parseFloat($('#perso-conso').value);
  const reelleSaisie = parseFloat($('#perso-reelle').value);
  const erreur = $('#perso-erreur');

  if (!nom || !(conso > 0)) {
    erreur.textContent = 'Indiquez au minimum un nom et une consommation moyenne.';
    erreur.hidden = false;
    return;
  }
  erreur.hidden = true;

  const vehicule = {
    id: `perso-${Date.now()}`,
    nom,
    carburant: $('#perso-carburant').value,
    conso,
    reelle: reelleSaisie > 0 ? reelleSaisie : conso,
  };
  config.perso.push(vehicule);
  config.thermiqueId = vehicule.id;
  config.consoReelleThermique = vehicule.reelle;
  enregistrer();
  remplirSelects();
  majReglages();
  $('#perso-nom').value = '';
  $('#perso-conso').value = '';
  $('#perso-reelle').value = '';
  $('#creer-thermique').open = false;
});

$('#btn-perso-supprimer').addEventListener('click', () => {
  const id = config.thermiqueId;
  if (!id.startsWith('perso-')) return;
  config.perso = config.perso.filter((v) => v.id !== id);
  config.thermiqueId = THERMIQUES[0].id;
  config.consoReelleThermique = null;
  enregistrer();
  remplirSelects();
  majReglages();
});

/* ------------------------------ init ----------------------------- */

remplirSelects();
majReglages();
toutAfficher();
etat('GPS inactif');
// Aucune demande de position tant que les conditions ne sont pas acceptées.
if (cguAcceptees()) initAutorisation();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
