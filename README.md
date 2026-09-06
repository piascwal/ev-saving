# EV Saving — compteur d'économies

Application web (PWA) qui compte **en direct l'argent économisé** en roulant en
électrique, plutôt qu'avec un véhicule thermique de référence. La distance est
mesurée par le **GPS de l'appareil**, ce qui la rend utilisable telle quelle
depuis le navigateur d'une voiture type Tesla.

## Fonctionnement

1. L'application demande l'autorisation d'accéder à la position (bouton
   « Autoriser le GPS »). Aucune donnée ne sort de l'appareil : pas de serveur,
   pas d'appel réseau, tout est stocké dans le navigateur.
2. « Démarrer le trajet » lance le suivi (`watchPosition`) et cumule la distance
   parcourue entre chaque point, en filtrant le bruit GPS.
3. Le compteur affiche l'économie du trajet, le coût électrique, le coût
   thermique équivalent, la vitesse et le CO₂ évité.
4. « Réinitialiser » clôt le trajet et l'ajoute au cumul de tous les trajets.

## Calcul

```
coût thermique  = distance/100 × conso (L/100 km)   × prix carburant (€/L)
coût électrique = distance/100 × conso (kWh/100 km) × prix électricité (€/kWh)
économie        = coût thermique − coût électrique
```

## Configuration

Par défaut, l'application compare une **Tesla Model Y Standard (2026)** à un
**VW Tiguan 1.5 eTSI 150**, l'équivalent thermique le plus proche en gabarit et
en usage. Les deux se changent dans les réglages.

- **Véhicule thermique de référence** : une vingtaine de modèles courants
  (essence, diesel), ou **votre propre véhicule** — nom, carburant,
  consommation moyenne et consommation réelle observée.
- **Consommation utilisée** : au choix la **consommation moyenne** annoncée
  (cycle mixte) ou la **consommation réelle observée**, modifiable au litre près.
- **Véhicule électrique** : Model Y Standard par défaut, autres Tesla et modèles
  concurrents disponibles, consommation kWh/100 km ajustable.
- **Prix** : essence, diesel, GPL, électricité (mettre `0` si la recharge est
  gratuite, ou le tarif Superchargeur pour l'itinérance).
- **Écran allumé** pendant le trajet (Wake Lock), utile à bord.

Tous les réglages, le trajet en cours et le cumul sont conservés dans le
`localStorage` de l'appareil.

## Lancer en local

Un serveur statique suffit — la géolocalisation et le service worker exigent
`https://` ou `localhost` :

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

Pour l'usage en voiture, publiez le dossier sur n'importe quel hébergement
statique en HTTPS (GitHub Pages, Netlify, Cloudflare Pages…) et ouvrez l'URL
dans le navigateur du véhicule.

## Précision

Les points dont la précision dépasse 50 m sont ignorés, ainsi que les
déplacements inférieurs au bruit GPS (dérive à l'arrêt) et les sauts de position
au-delà de 250 km/h. La distance mesurée reste légèrement inférieure à celle du
compteur du véhicule.

Les consommations livrées avec l'application sont des ordres de grandeur : pour
un chiffre juste, saisissez votre consommation réelle observée.
