// Catalogue de véhicules de référence.
// conso  : consommation moyenne annoncée (cycle mixte WLTP), L/100 km
// reelle : consommation réelle typiquement observée sur route, L/100 km
export const THERMIQUES = [
  { id: 'clio-tce90',    nom: 'Renault Clio TCe 90',        carburant: 'essence', conso: 5.8,  reelle: 6.8 },
  { id: 'sandero-tce90', nom: 'Dacia Sandero TCe 90',       carburant: 'essence', conso: 5.7,  reelle: 6.6 },
  { id: '208-puretech',  nom: 'Peugeot 208 PureTech 100',   carburant: 'essence', conso: 5.6,  reelle: 6.6 },
  { id: 'golf-etsi',     nom: 'VW Golf 1.5 eTSI',           carburant: 'essence', conso: 5.9,  reelle: 7.0 },
  { id: 'octavia-tsi',   nom: 'Skoda Octavia 1.5 TSI',      carburant: 'essence', conso: 5.8,  reelle: 6.9 },
  { id: 'corolla-hev',   nom: 'Toyota Corolla Hybride 122', carburant: 'essence', conso: 4.6,  reelle: 5.2 },
  { id: '308-bluehdi',   nom: 'Peugeot 308 BlueHDi 130',    carburant: 'diesel',  conso: 4.7,  reelle: 5.5 },
  { id: 'passat-tdi',    nom: 'VW Passat 2.0 TDI 150',      carburant: 'diesel',  conso: 5.3,  reelle: 6.1 },
  { id: '5008-bluehdi',  nom: 'Peugeot 5008 BlueHDi 130',   carburant: 'diesel',  conso: 5.4,  reelle: 6.4 },
  { id: 'bmw-320d',      nom: 'BMW Série 3 320d',           carburant: 'diesel',  conso: 5.2,  reelle: 6.0 },
  { id: 'bmw-330i',      nom: 'BMW Série 3 330i',           carburant: 'essence', conso: 7.1,  reelle: 8.5 },
  { id: 'audi-a4-40tdi', nom: 'Audi A4 40 TDI',             carburant: 'diesel',  conso: 5.4,  reelle: 6.3 },
  { id: 'merco-c220d',   nom: 'Mercedes Classe C 220 d',    carburant: 'diesel',  conso: 5.3,  reelle: 6.2 },
  { id: 'audi-a6-45',    nom: 'Audi A6 45 TFSI',            carburant: 'essence', conso: 7.9,  reelle: 9.2 },
  { id: 'audi-q5-40tdi', nom: 'Audi Q5 40 TDI',             carburant: 'diesel',  conso: 6.2,  reelle: 7.2 },
  { id: 'bmw-x3-20i',    nom: 'BMW X3 xDrive20i',           carburant: 'essence', conso: 8.3,  reelle: 9.8 },
  { id: 'volvo-xc60-b5', nom: 'Volvo XC60 B5',              carburant: 'essence', conso: 8.0,  reelle: 9.5 },
  { id: 'glc-300',       nom: 'Mercedes GLC 300',           carburant: 'essence', conso: 8.6,  reelle: 10.2 },
  { id: 'macan-s',       nom: 'Porsche Macan S',            carburant: 'essence', conso: 10.7, reelle: 12.5 },
  { id: 'bmw-x5-40i',    nom: 'BMW X5 xDrive40i',           carburant: 'essence', conso: 9.5,  reelle: 11.5 },
  { id: 'mustang-gt',    nom: 'Ford Mustang GT V8',         carburant: 'essence', conso: 12.4, reelle: 14.5 },
];

// conso : consommation moyenne annoncée, kWh/100 km — reelle : observée au volant
export const ELECTRIQUES = [
  { id: 'model3-prop',  nom: 'Tesla Model 3 Propulsion',      conso: 13.2, reelle: 15.0 },
  { id: 'model3-ga',    nom: 'Tesla Model 3 Grande Autonomie', conso: 14.0, reelle: 16.0 },
  { id: 'model3-perf',  nom: 'Tesla Model 3 Performance',     conso: 15.2, reelle: 18.0 },
  { id: 'modely-prop',  nom: 'Tesla Model Y Propulsion',      conso: 14.9, reelle: 17.0 },
  { id: 'modely-ga',    nom: 'Tesla Model Y Grande Autonomie', conso: 15.7, reelle: 18.0 },
  { id: 'models',       nom: 'Tesla Model S',                 conso: 17.5, reelle: 20.0 },
  { id: 'modelx',       nom: 'Tesla Model X',                 conso: 19.8, reelle: 23.0 },
  { id: 'zoe',          nom: 'Renault Zoe R135',              conso: 17.2, reelle: 19.0 },
  { id: 'e208',         nom: 'Peugeot e-208',                 conso: 15.9, reelle: 18.0 },
  { id: 'id3',          nom: 'VW ID.3 Pro',                   conso: 16.2, reelle: 18.5 },
  { id: 'ioniq5',       nom: 'Hyundai Ioniq 5',               conso: 17.9, reelle: 20.5 },
  { id: 'megane-etech', nom: 'Renault Megane E-Tech',         conso: 16.1, reelle: 18.0 },
];

// Prix moyens de départ (France) — tous modifiables dans les réglages
export const PRIX_DEFAUT = {
  essence: 1.75,   // €/L SP95-E10
  diesel: 1.65,    // €/L gazole
  gpl: 0.95,       // €/L GPL
  electricite: 0.1740, // €/kWh tarif base domestique
};

export const CARBURANTS = {
  essence: 'Essence (SP95-E10)',
  diesel: 'Diesel (gazole)',
  gpl: 'GPL',
};

// Facteurs d'émission utilisés pour le CO2 évité (kg de CO2 par unité)
export const CO2 = {
  essence: 2.28,     // kg/L
  diesel: 2.60,      // kg/L
  gpl: 1.66,         // kg/L
  electricite: 0.06, // kg/kWh (mix électrique français)
};
