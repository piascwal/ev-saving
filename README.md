# EV Saving — compteur d'économies

Application web (PWA) qui compte **en direct l'argent économisé** en roulant en
électrique, plutôt qu'avec un véhicule thermique de référence. La distance est
mesurée par le **GPS de l'appareil**, ce qui la rend utilisable telle quelle
depuis le navigateur d'une voiture type Tesla.

## HTTPS obligatoire

Les navigateurs ne donnent accès au GPS que depuis une **origine sécurisée** :
`https://…` ou `http://localhost`. Ouvert autrement (fichier `file://`, adresse
`http://` d'un réseau local), la demande d'autorisation n'apparaît pas et aucune
position n'arrive — l'application le signale alors par un bandeau orange.

Le dépôt contient un workflow `.github/workflows/pages.yml` qui publie le dossier
sur GitHub Pages à chaque `push` sur `main`. Activez-le une fois dans
*Settings → Pages → Source: GitHub Actions*, puis ouvrez l'URL `https://…` dans
le véhicule.

## Fonctionnement

1. L'application demande l'autorisation d'accéder à la position (bouton
   « Autoriser le GPS »). Aucune donnée ne sort de l'appareil : pas de serveur,
   pas d'appel réseau, tout est stocké dans le navigateur.
2. « Démarrer le trajet » lance le suivi (`watchPosition`) et cumule la distance
   parcourue entre chaque point, en filtrant le bruit GPS.
3. Le compteur affiche l'économie du trajet, le coût électrique, le coût
   thermique équivalent, la vitesse et le CO₂ évité. Le troisième chiffre après
   la virgule est grisé : il n'a pas cours monétaire et sert seulement à voir le
   compteur avancer entre deux positions.
4. « Réinitialiser » clôt le trajet et l'ajoute au cumul de tous les trajets.

En cas de problème, le panneau **Diagnostic GPS** en bas du compteur indique si
la page est sécurisée, si l'API est disponible, l'état de l'autorisation, le
nombre de positions reçues et filtrées, la dernière position, sa précision, la
vitesse brute renvoyée par le GPS et la dernière erreur rencontrée.

Robustesse du suivi : une position est demandée immédiatement au démarrage sans
attendre le premier événement ; dès que plus aucune position n'arrive pendant 8 s,
des appels ponctuels prennent le relais (certains navigateurs embarqués n'émettent
jamais via `watchPosition`) ; l'affichage est rafraîchi chaque seconde ; sans
nouveau point la vitesse retombe à zéro et l'interruption est signalée ; une
demande d'autorisation restée sans réponse est signalée au bout de 8 s au lieu de
rester muette.

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
  (E10, SP98, gazole), ou **votre propre véhicule** — nom, carburant (E10, SP98,
  gazole, E85, GPL), consommation moyenne et consommation réelle observée.
- **Consommation utilisée** : au choix la **consommation moyenne** annoncée
  (cycle mixte) ou la **consommation réelle observée**, modifiable au litre près.
- **Véhicule électrique** : Model Y Standard par défaut, autres Tesla et modèles
  concurrents disponibles, consommation kWh/100 km ajustable.
- **Prix à la pompe** : gazole, SP98, SP95-E10, E85 et GPL, au millième d'euro.
  Le prix appliqué est celui du carburant du véhicule de référence choisi.
- **Prix de l'électricité** : au choix un **prix unique** du kWh, ou un **mix
  domicile / recharge publique** avec le curseur de répartition — le prix retenu
  est alors la moyenne pondérée des deux. Raccourcis pour les tarifs courants
  (Base, heures creuses, Tempo bleu HC, Superchargeur, Ionity, borne AC),
  chacun restant modifiable au chiffre près ; `0` si la recharge est gratuite.
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

Les points dont la précision dépasse 200 m sont ignorés, ainsi que les sauts de
position au-delà de 250 km/h. En dessous, le seuil de bruit vaut la moitié de la
précision annoncée, plafonné à 15 m : un récepteur pessimiste ne fige donc pas la
distance. Un déplacement sous ce seuil n'est pas perdu — le point de référence est
conservé et la distance s'accumule jusqu'à le dépasser ; et si le récepteur
annonce une vitesse réelle, celle-ci est intégrée sur l'intervalle plutôt que
d'attendre. La distance mesurée reste légèrement inférieure à celle du
compteur du véhicule.

Les consommations livrées avec l'application sont des ordres de grandeur : pour
un chiffre juste, saisissez votre consommation réelle observée.
