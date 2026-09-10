# EV Saving — compteur d'économies

> **Avertissement — à lire avant tout usage.** Application de divertissement,
> fournie sans aucune garantie. **Elle ne doit en aucun cas être utilisée par le
> conducteur d'un véhicule en circulation.** Toute manipulation se fait véhicule
> à l'arrêt et moteur coupé, ou par un passager. L'utilisateur reste seul
> responsable du respect du code de la route ; l'éditeur décline toute
> responsabilité en cas d'accident, d'infraction ou de dommage. Les chiffres
> affichés sont des ordres de grandeur indicatifs, sans valeur de mesure ni de
> conseil. Voir [CONDITIONS.md](CONDITIONS.md) — leur acceptation est demandée
> au premier lancement.

Application web (PWA) qui compte **en direct l'argent économisé** en roulant en
électrique, plutôt qu'avec un véhicule thermique de référence. La distance est
mesurée par le **GPS de l'appareil**, ce qui la rend utilisable telle quelle
depuis le navigateur d'une voiture type Tesla.

## Interface

Thème sombre en verre dépoli (glassmorphism) : cartes translucides à bord
flouté (`backdrop-filter`), police Outfit, étiquettes en petites majuscules
espacées. Le montant économisé est seul à porter un halo (texte en dégradé
émeraude avec ombre portée) — les cartes véhicule thermique / véhicule
électrique / prix retenus n'ont volontairement aucun contour lumineux.

Les deux cartes de coût (électrique, thermique) portent un anneau lumineux
autour du contour, qui progresse de 0 à 100 % selon les centimes affichés (25 ct
= quart de tour). À chaque euro entier franchi, l'anneau boucle un tour complet
avant de se recaler sur les nouveaux centimes, plutôt que de reculer
visuellement. Implémenté en CSS pur via une propriété personnalisée typée
(`@property --progression`) et un dégradé conique masqué sur le contour ; sans
effet dans les navigateurs qui ne supportent pas `@property`, la valeur
s'applique alors sans transition.

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
   thermique équivalent, la vitesse et le CO₂ évité. Sur le montant économisé
   uniquement, un troisième chiffre après la virgule reste affiché en gris —
   il n'a pas cours monétaire — et chaque chiffre qui change s'anime d'un léger
   mouvement, façon compteur mécanique ; le reste s'affiche normalement.
4. « Réinitialiser » clôt le trajet et l'ajoute au cumul de tous les trajets. La
   carte « Depuis le début » inclut déjà le trajet en cours avant même ce clic :
   elle avance en direct, sans animation ni millième — ces effets restent
   réservés au montant économisé sur le trajet.

En cas de problème, le panneau **Diagnostic GPS** en bas du compteur indique si
la page est sécurisée, si l'API est disponible, l'état de l'autorisation, le
nombre de positions reçues et filtrées, la source des positions, la distance
brute, l'intervalle entre deux points, la cohérence de l'horodatage du
récepteur, le motif du dernier filtrage et la dernière erreur rencontrée.

L'intervalle entre deux points est mesuré sur l'horloge de l'appareil, à la
réception : l'horodatage renvoyé par le récepteur n'est pas fiable partout, et
une seconde mal mesurée suffirait à faire passer chaque segment pour un saut de
position — la distance resterait alors à zéro alors que la vitesse, lue
directement, continuerait d'avancer.

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

## Mises à jour et cache

`styles.css`, `app.js` et `vehicles.js` sont référencés avec un paramètre de
version (`?v=15`) et importés ainsi entre eux. À chaque changement de l'un de
ces trois fichiers, incrémenter ce numéro partout où il apparaît (les liens
dans `index.html`, l'import en tête de `app.js`, `VERSION` dans `sw.js`) :
sans cela, un appareil qui a déjà visité l'application peut charger un fichier
à jour aux côtés d'un autre resté sur son ancienne version — deux versions
mélangées produisant un rendu incohérent (des unités dupliquées, par exemple).
Le nom d'URL différent force chaque fichier à être retéléchargé ensemble, quel
que soit l'état du cache HTTP du navigateur, du CDN ou du service worker.

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

## Conditions d'utilisation

Les conditions complètes figurent dans [CONDITIONS.md](CONDITIONS.md) et sont
présentées dans l'application au premier lancement : leur acceptation explicite,
avec engagement de ne pas utiliser l'application en conduisant, est nécessaire
avant toute demande de position. Elles restent consultables à tout moment depuis
l'onglet *Réglages*. Le code est publié sous licence MIT, sans garantie
(voir [LICENSE](LICENSE)).

## Précision

Les positions sont lissées par un filtre de Kalman à une dimension dont la
variance de mesure est la précision annoncée : sans cela, l'oscillation du
récepteur à l'arrêt est comptée comme de la distance parcourue. Une position
annoncée à plus de 500 m près ne vient pas du GPS mais des antennes ou du
Wi-Fi ; l'application l'écarte et le signale dans la ligne d'état.

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
