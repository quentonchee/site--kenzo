# Echoes Films — site + CMS maison

Tout le contenu du site (textes, images, vidéos, couleurs, SEO) se trouve dans **`content/site.json`**
et se modifie depuis l'interface **`/admin`**, avec un aperçu en direct.
`index.html` est **généré automatiquement** : ne le modifiez pas à la main.

```
content/site.json   ← le contenu du site
cms/render.js       ← transforme le contenu en page HTML
cms/schema.js       ← la liste des champs modifiables dans l'admin
admin/              ← l'interface du CMS
server.js           ← serveur Node (mode hébergeur)
build.js            ← régénère index.html depuis le contenu
styles.css, main.js ← apparence et animations du site
assets/img          ← images d'origine
assets/uploads      ← images importées depuis le CMS
```

## Modifier le site

Ouvrez `https://<votre-site>/admin/`, choisissez une section à gauche, modifiez,
puis cliquez **Publier** (ou `Cmd + S`).

- **Textes** : `*texte*` met en *italique* (le style « serif » des titres), `**texte**` met en **gras**.
- **Images** : « Importer… » ou glisser-déposer. Elles sont redimensionnées automatiquement (2200 px max).
- **Vidéos** : collez simplement un lien YouTube, Vimeo ou Google Drive.
- **Listes** (projets, prestations, avis, FAQ…) : ajouter, dupliquer, réordonner (↑ ↓), supprimer.
- **Masquer une section** : interrupteur « Afficher cette section » en haut de la section.
- **Historique** : chaque publication est conservée et peut être restaurée.

## Mode 1 — GitHub Pages (actuel)

L'admin enregistre directement dans le dépôt GitHub ; GitHub Pages remet le site en ligne en 1 à 2 minutes.

À la première connexion sur `/admin/`, il faut un **jeton GitHub** (une seule fois par navigateur) :

1. <https://github.com/settings/personal-access-tokens/new>
2. *Repository access* → **Only select repositories** → `site--kenzo`
3. *Permissions* → **Contents : Read and write** (+ **Pages : Read** pour voir quand le site est en ligne)
4. Copiez le jeton et collez-le dans l'admin.

Le jeton reste dans le navigateur. Utilisez « ⋯ → Déconnexion » sur un ordinateur partagé.

## Mode 2 — Hébergeur avec Node.js (plus tard)

Même interface, mais le CMS est protégé par un mot de passe et enregistre sur le serveur.

```bash
cp .env.example .env      # puis choisir CMS_PASSWORD
npm start                 # http://localhost:4322  ·  admin : /admin
```

Chez l'hébergeur (Render, Railway, Fly.io, VPS…) : commande de démarrage `npm start`,
variables `CMS_PASSWORD` (obligatoire) et `HOST=0.0.0.0`. Aucune dépendance à installer (Node 18+).
L'admin détecte tout seul le mode serveur ; l'historique est gardé dans `content/history/`.

⚠ Choisissez un hébergeur avec **disque persistant**, sinon les modifications et images importées
seront perdues au redémarrage.

## En local

- `npm start` puis <http://localhost:4322/admin> : tester le CMS en mode serveur.
- `npm run build` : régénère `index.html` si vous modifiez `content/site.json` à la main.
- Pour ajouter un nouveau type de champ ou de section : `cms/schema.js` (formulaire) + `cms/render.js` (affichage).
