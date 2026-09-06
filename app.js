import { THERMIQUES, ELECTRIQUES, PRIX_DEFAUT, TARIFS_ELEC, CARBURANTS, CO2 } from './vehicles.js';

const CLE_CONFIG = 'ev-saving:config:v1';
const CLE_TRAJET = 'ev-saving:trajet:v1';
const CLE_CUMUL  = 'ev-saving:cumul:v1';

const $ = (sel) => document.querySelector(sel);

/* ------------------------------ état ------------------------------ */

const configDefaut = () => ({
  thermiqueId: 'tiguan-etsi',
  modeConso: 'moyenne',        // 'moyenne' (annoncée) ou 'reelle' (observée)
  consoReelleThermique: null,  // L/100 km saisis par l'utilisateur
  evId: 'modely-std',
  consoEv: null,               // kWh/100 km effectivement utilisés
  prix: { essence: PRIX_DEFAUT.essence, diesel: PRIX_DEFAUT.diesel, gpl: PRIX_DEFAUT.gpl },
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
  const cfg = lire(CLE_CONFIG, configDefaut());
  // Reprise des configurations créées avant le réglage tarifaire détaillé.
  const ancienPrix = cfg.prix?.electricite;
  if (cfg.tarifConfigure !== true) {
    if (Number.isFinite(ancienPrix)) cfg.tarif.unique = ancienPrix;
    cfg.tarifConfigure = true;
  }
  delete cfg.prix.electricite;
  return cfg;
}

let config = chargerConfig();
let trajet = lire(CLE_TRAJET, { distanceM: 0, vitesse: 0 });
let cumul  = lire(CLE_CUMUL,  { euros: 0, km: 0, co2: 0 });

let veilleId = null;      // identifiant watchPosition
let dernierPoint = null;  // dernière position retenue
let wakeLock = null;
const enCours = () => veilleId !== null;

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
const nf = (n, d = 1) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

/* -------------------------- affichage ---------------------------- */

function majCompteur() {
  const b = bilan(trajet.distanceM);
  $('#economie').textContent = nfEuro.format(b.economie);
  $('#economie-km').textContent =
    b.km > 0.2 ? `${nfEuro.format((b.economie / b.km) * 100)} / 100 km` : '— € / 100 km';
  $('#co2').textContent = `${nf(Math.max(b.co2, 0), 1)} kg de CO₂ évités`;
  $('#distance').innerHTML = `${nf(b.km, 1)}<small> km</small>`;
  $('#vitesse').innerHTML = `${nf(trajet.vitesse || 0, 0)}<small> km/h</small>`;
  $('#cout-ev').innerHTML = `${nf(b.coutEv, 2)}<small> €</small>`;
  $('#cout-th').innerHTML = `${nf(b.coutTh, 2)}<small> €</small>`;
  $('#economie').classList.toggle('negatif', b.economie < 0);
}

function majResume() {
  const th = thermiqueActif();
  const ev = evActif();
  const mode = config.modeConso === 'reelle' ? 'réelle' : 'moyenne';
  $('#etiquette-thermique').textContent = `Coût ${th.carburant}`;
  $('#resume-thermique').textContent =
    `${th.nom} — ${nf(consoThermique(), 1)} L/100 (${mode})`;
  $('#resume-ev').textContent = `${ev.nom} — ${nf(consoElectrique(), 1)} kWh/100`;
  $('#resume-prix').textContent =
    `${nf(prixCarburant(), 2)} €/L · ${nf(prixElectricite(), 3)} €/kWh`;
}

function majCumul() {
  $('#cumul-euros').textContent = nfEuro.format(cumul.euros);
  $('#cumul-km').textContent = `${nf(cumul.km, 0)} km`;
  $('#cumul-co2').textContent = `${nf(Math.max(cumul.co2, 0), 0)} kg`;
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
  majCompteur();
  majCumul();
  majBoutons();
}

/* ------------------------------ GPS ------------------------------ */

const RAYON_TERRE = 6371000; // m

function distanceEntre(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * RAYON_TERRE * Math.asin(Math.sqrt(h));
}

function surPosition(pos) {
  const point = {
    lat: pos.coords.latitude,
    lon: pos.coords.longitude,
    t: pos.timestamp,
    precision: pos.coords.accuracy ?? 999,
  };

  // On ignore les points trop imprécis : ils font gonfler la distance à l'arrêt.
  if (point.precision > 50) {
    etat(`Signal GPS faible (±${Math.round(point.precision)} m)`);
    return;
  }

  const vitesseMesuree = pos.coords.speed; // m/s, souvent fournie en voiture
  if (Number.isFinite(vitesseMesuree) && vitesseMesuree !== null) {
    trajet.vitesse = Math.max(vitesseMesuree, 0) * 3.6;
  }

  if (dernierPoint) {
    const d = distanceEntre(dernierPoint, point);
    const dt = (point.t - dernierPoint.t) / 1000;
    const vitesse = dt > 0 ? d / dt : 0; // m/s

    const bruit = d < Math.max(5, point.precision * 0.5); // dérive à l'arrêt
    const aberrant = vitesse > 70; // > 250 km/h : saut de position
    if (!bruit && !aberrant) {
      trajet.distanceM += d;
      if (!Number.isFinite(vitesseMesuree) || vitesseMesuree === null) {
        trajet.vitesse = vitesse * 3.6;
      }
      dernierPoint = point;
      ecrire(CLE_TRAJET, trajet);
    } else if (bruit && dt > 8) {
      // À l'arrêt prolongé, on recale la référence sans compter la dérive.
      trajet.vitesse = 0;
      dernierPoint = point;
    }
  } else {
    dernierPoint = point;
  }

  etat(`GPS actif — précision ±${Math.round(point.precision)} m`);
  majCompteur();
}

function surErreurGps(err) {
  const messages = {
    1: "Autorisation GPS refusée. Autorisez la localisation dans les réglages du navigateur.",
    2: "Position indisponible. Vérifiez que le GPS est actif.",
    3: "Le GPS met trop de temps à répondre.",
  };
  const msg = messages[err.code] || `Erreur GPS : ${err.message}`;
  etat(msg, true);
  if (err.code === 1) {
    arreterSuivi();
    $('#bloc-gps').hidden = false;
    const zone = $('#gps-erreur');
    zone.textContent = msg;
    zone.hidden = false;
  }
}

function demarrerSuivi() {
  if (!('geolocation' in navigator)) {
    etat("Ce navigateur ne fournit pas de position GPS.", true);
    return;
  }
  dernierPoint = null;
  veilleId = navigator.geolocation.watchPosition(surPosition, surErreurGps, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 20000,
  });
  etat('Recherche du signal GPS…');
  majBoutons();
  demanderWakeLock();
}

function arreterSuivi() {
  if (veilleId !== null) {
    navigator.geolocation.clearWatch(veilleId);
    veilleId = null;
  }
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

async function etatAutorisation() {
  if (!navigator.permissions?.query) return 'prompt';
  try {
    const res = await navigator.permissions.query({ name: 'geolocation' });
    return res.state;
  } catch {
    return 'prompt';
  }
}

async function initAutorisation() {
  const etatPerm = await etatAutorisation();
  $('#bloc-gps').hidden = etatPerm === 'granted';
  if (etatPerm === 'denied') {
    const zone = $('#gps-erreur');
    zone.textContent = "La localisation est bloquée pour ce site. Réautorisez-la dans les réglages du navigateur, puis rechargez la page.";
    zone.hidden = false;
  }
}

$('#btn-autoriser').addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    $('#gps-erreur').textContent = "Ce navigateur ne fournit pas de position GPS.";
    $('#gps-erreur').hidden = false;
    return;
  }
  etat('Demande d\'autorisation en cours…');
  navigator.geolocation.getCurrentPosition(
    () => {
      $('#bloc-gps').hidden = true;
      $('#gps-erreur').hidden = true;
      etat('GPS autorisé — prêt à démarrer');
    },
    surErreurGps,
    { enableHighAccuracy: true, timeout: 20000 },
  );
});

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
  if (b.km > 0.05) {
    cumul.euros += b.economie;
    cumul.km += b.km;
    cumul.co2 += b.co2;
    ecrire(CLE_CUMUL, cumul);
  }
  trajet = { distanceM: 0, vitesse: 0 };
  dernierPoint = null;
  ecrire(CLE_TRAJET, trajet);
  majCumul();
  majCompteur();
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
  $('#prix-essence').value = config.prix.essence;
  $('#prix-diesel').value = config.prix.diesel;
  $('#prix-gpl').value = config.prix.gpl;
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
  '#prix-essence': 'essence',
  '#prix-diesel': 'diesel',
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
initAutorisation();
etat('GPS inactif');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
