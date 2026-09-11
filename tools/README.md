# Outils

Aucun ne demande de dependance native : `stub.js` fournit un DOM et un contexte
canvas 2D factices, ce qui suffit a executer le jeu entier sous node.

| script       | ce qu'il verifie                                                         |
|--------------|--------------------------------------------------------------------------|
| `test.js`    | geometrie du circuit, physique, course complete, rendu, chute hors piste |
| `harmony.js` | chaque note de la musique embarquee tombe juste sur son accord           |
| `skill.js`   | equilibrage : 4 niveaux de pilote, place finale et ecarts                |
| `music.js`   | analyse des 6 morceaux du lab `labs/03-music-tracks.html`                |
| `test-wavedash.js` | l'integration Wavedash sur la sortie terser, avec un SDK qui valide ses types |

`drive-gif.js` n'est pas un test : c'est le pilote automatique du harnais de
capture (`record-gif.py` du skill js13k-finalize). Il est appele une fois par
image et ecrit directement dans l'objet `keys` que lit `playerStep()`, plutot
que de simuler des evenements clavier. Il tient la voie de sa couleur, saute
les haies, vise les anneaux et les boites. C'est lui qui produit
`media/gameplay.gif`, de facon reproductible a l'octet pres.

Chacun accepte un chemin en argument, par defaut `src/index.html` :

    node tools/test.js src/index-nofx.html

Le contexte factice leve une erreur des qu'une valeur non finie (NaN, Infinity)
est affectee au canvas. C'est ce qui attrape les divisions par zero de la
projection avant qu'elles n'atteignent l'ecran.
