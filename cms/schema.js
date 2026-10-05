// Describes every editable field of content/site.json. The admin builds its forms from this.
// Field types: text, textarea, rich (supports *italique* / **gras**), image, video, color,
// toggle, select, list (repeatable items), group (nested object).

const RICH_HELP = 'Astuce : *texte* = italique, **texte** = gras.';
const visible = { key: 'visible', type: 'toggle', label: 'Afficher cette section sur le site' };

export const SCHEMA = [
  {
    id: 'hero', path: 'hero', title: 'Accueil', anchor: '#top',
    hint: 'Le grand écran d\'ouverture du site.',
    fields: [
      { key: 'image', type: 'image', label: 'Image de fond' },
      { key: 'title', type: 'rich', label: 'Titre principal', help: RICH_HELP + ' La partie en italique passe à la ligne.' },
      { key: 'lead', type: 'textarea', label: 'Texte d\'introduction', rows: 3 },
      { key: 'primary', type: 'group', label: 'Bouton principal', fields: [
        { key: 'label', type: 'text', label: 'Texte du bouton' },
        { key: 'href', type: 'text', label: 'Lien', help: 'Ex. #contact pour descendre au formulaire, ou une adresse https://…' },
      ] },
      { key: 'showreelLabel', type: 'text', label: 'Texte du bouton vidéo' },
      { key: 'showreelVideo', type: 'video', label: 'Vidéo du showreel' },
      { key: 'showreelTitle', type: 'text', label: 'Titre affiché au-dessus de la vidéo' },
      { key: 'hud', type: 'toggle', label: 'Afficher « REC » et le compteur en haut' },
    ],
  },
  {
    id: 'proof', path: 'proof', title: 'Chiffres & clients', anchor: '.proof',
    fields: [
      visible,
      { key: 'stats', type: 'list', label: 'Chiffres clés', itemTitle: (s) => `${s.value || ''}${s.suffix || ''} ${s.label || ''}`.trim(),
        defaults: { value: '0', suffix: '+', label: 'Nouveau chiffre' },
        fields: [
          { key: 'value', type: 'text', label: 'Nombre', help: 'Un nombre entier s\'anime au défilement.', half: true },
          { key: 'suffix', type: 'text', label: 'Après le nombre', help: 'Ex. M+, k+, ans', half: true },
          { key: 'label', type: 'text', label: 'Légende' },
        ] },
      { key: 'clientsLabel', type: 'text', label: 'Titre de la liste des clients' },
      { key: 'clients', type: 'list', label: 'Clients / partenaires', itemTitle: (c) => c.name, compact: true,
        defaults: { name: 'Nouveau client' },
        fields: [{ key: 'name', type: 'text', label: 'Nom' }] },
    ],
  },
  {
    id: 'portfolio', path: 'portfolio', title: 'Réalisations', anchor: '#realisations',
    fields: [
      visible,
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'items', type: 'list', label: 'Projets', itemTitle: (p) => p.title, thumb: 'image', addLabel: 'Ajouter un projet',
        defaults: { title: 'Nouveau projet', type: '', category: '', image: '', alt: '', video: '', featured: false },
        fields: [
          { key: 'title', type: 'text', label: 'Titre du projet' },
          { key: 'type', type: 'text', label: 'Sous-titre', help: 'Ex. Clip live · captation & montage' },
          { key: 'category', type: 'select', label: 'Catégorie', options: 'portfolio.categories' },
          { key: 'image', type: 'image', label: 'Image' },
          { key: 'alt', type: 'text', label: 'Description de l\'image', help: 'Pour l\'accessibilité et Google.' },
          { key: 'video', type: 'video', label: 'Vidéo' },
          { key: 'featured', type: 'toggle', label: 'Mettre en avant (grande image pleine largeur)' },
        ] },
      { key: 'categories', type: 'list', label: 'Catégories (filtres)', itemTitle: (c) => c.label, compact: true,
        defaults: { id: '', label: 'Nouvelle catégorie' },
        fields: [
          { key: 'label', type: 'text', label: 'Nom affiché', half: true },
          { key: 'id', type: 'text', label: 'Identifiant', help: 'Court, sans espace (ex. live)', half: true, slugFrom: 'label' },
        ] },
      { key: 'allLabel', type: 'text', label: 'Texte du filtre « tout »', half: true },
      { key: 'playLabel', type: 'text', label: 'Texte au survol des projets', half: true },
    ],
  },
  {
    id: 'services', path: 'services', title: 'Prestations', anchor: '#services',
    fields: [
      visible,
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'items', type: 'list', label: 'Prestations', itemTitle: (s) => s.title, thumb: 'image', addLabel: 'Ajouter une prestation',
        defaults: { title: 'Nouvelle prestation', text: '', audience: '', image: '' },
        fields: [
          { key: 'title', type: 'text', label: 'Nom' },
          { key: 'text', type: 'rich', label: 'Description', rows: 3 },
          { key: 'audience', type: 'text', label: 'Pour qui', help: 'Ex. Artistes, groupes, salles' },
          { key: 'image', type: 'image', label: 'Image au survol (ordinateur)' },
        ] },
      { key: 'note', type: 'rich', label: 'Phrase sous la liste', help: RICH_HELP },
      { key: 'cta', type: 'group', label: 'Bouton', fields: [
        { key: 'label', type: 'text', label: 'Texte du bouton', half: true },
        { key: 'href', type: 'text', label: 'Lien', half: true },
      ] },
    ],
  },
  {
    id: 'method', path: 'method', title: 'Méthode', anchor: '#methode',
    fields: [
      visible,
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'steps', type: 'list', label: 'Étapes', itemTitle: (s) => s.title,
        defaults: { code: '00:00:05', title: 'Nouvelle étape', text: '' },
        fields: [
          { key: 'code', type: 'text', label: 'Repère', help: 'Ex. 00:00:01', half: true },
          { key: 'title', type: 'text', label: 'Titre', half: true },
          { key: 'text', type: 'rich', label: 'Texte', rows: 3 },
        ] },
    ],
  },
  {
    id: 'about', path: 'about', title: 'À propos', anchor: '#apropos',
    fields: [
      visible,
      { key: 'image', type: 'image', label: 'Photo' },
      { key: 'alt', type: 'text', label: 'Description de la photo' },
      { key: 'caption', type: 'text', label: 'Légende sous la photo' },
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'lead', type: 'rich', label: 'Paragraphe d\'accroche (en grand)', rows: 3 },
      { key: 'body', type: 'rich', label: 'Texte', rows: 7, help: 'Laissez une ligne vide pour créer un nouveau paragraphe.' },
      { key: 'facts', type: 'list', label: 'Infos clés', itemTitle: (f) => f.label, compact: true,
        defaults: { label: 'Nouveau', value: '' },
        fields: [
          { key: 'label', type: 'text', label: 'Intitulé', half: true },
          { key: 'value', type: 'text', label: 'Valeur', half: true },
        ] },
    ],
  },
  {
    id: 'testimonials', path: 'testimonials', title: 'Avis clients', anchor: '#avis',
    fields: [
      visible,
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'featuredQuote', type: 'textarea', label: 'Citation mise en avant (en grand)', rows: 3, help: 'Les guillemets sont ajoutés automatiquement.' },
      { key: 'featuredAuthor', type: 'text', label: 'Auteur de la citation' },
      { key: 'items', type: 'list', label: 'Autres avis', itemTitle: (t) => t.name, addLabel: 'Ajouter un avis',
        defaults: { quote: '', name: 'Nouveau client', role: '' },
        fields: [
          { key: 'quote', type: 'textarea', label: 'Avis', rows: 4 },
          { key: 'name', type: 'text', label: 'Nom', half: true },
          { key: 'role', type: 'text', label: 'Fonction / structure', half: true },
        ] },
    ],
  },
  {
    id: 'faq', path: 'faq', title: 'FAQ', anchor: '#faq',
    fields: [
      visible,
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'items', type: 'list', label: 'Questions', itemTitle: (q) => q.question, addLabel: 'Ajouter une question',
        defaults: { question: 'Nouvelle question ?', answer: '' },
        fields: [
          { key: 'question', type: 'text', label: 'Question' },
          { key: 'answer', type: 'rich', label: 'Réponse', rows: 3 },
        ] },
    ],
  },
  {
    id: 'contact', path: 'contact', title: 'Contact', anchor: '#contact',
    fields: [
      { key: 'label', type: 'text', label: 'Petit titre' },
      { key: 'title', type: 'rich', label: 'Titre', help: RICH_HELP },
      { key: 'text', type: 'rich', label: 'Texte', rows: 3 },
      { key: 'email', type: 'text', label: 'Email de réception des demandes', help: 'Le formulaire ouvre un email pré-rempli vers cette adresse.' },
      { key: 'links', type: 'list', label: 'Réseaux sociaux / liens', itemTitle: (l) => l.label, compact: true,
        defaults: { label: 'Réseau', text: '@', url: 'https://' },
        fields: [
          { key: 'label', type: 'text', label: 'Nom', half: true },
          { key: 'text', type: 'text', label: 'Texte affiché', half: true },
          { key: 'url', type: 'text', label: 'Adresse du lien' },
        ] },
      { key: 'projectTypes', type: 'list', label: 'Types de projet proposés dans le formulaire', itemTitle: (t) => t.label, compact: true,
        defaults: { label: 'Nouveau type' },
        fields: [{ key: 'label', type: 'text', label: 'Type' }] },
      { key: 'formNote', type: 'text', label: 'Petite phrase à côté du bouton', half: true },
      { key: 'submitLabel', type: 'text', label: 'Texte du bouton d\'envoi', half: true },
    ],
  },
  {
    id: 'nav', path: 'nav', title: 'Menu', anchor: '#top',
    fields: [
      { key: 'brand', type: 'text', label: 'Nom en haut à gauche' },
      { key: 'links', type: 'list', label: 'Liens du menu', itemTitle: (l) => l.label, compact: true,
        defaults: { label: 'Lien', href: '#' },
        fields: [
          { key: 'label', type: 'text', label: 'Texte', half: true },
          { key: 'href', type: 'text', label: 'Lien', half: true, help: '#realisations, #services, #methode, #apropos, #avis, #faq, #contact' },
        ] },
      { key: 'cta', type: 'group', label: 'Bouton à droite', fields: [
        { key: 'label', type: 'text', label: 'Texte', half: true },
        { key: 'href', type: 'text', label: 'Lien', half: true },
      ] },
    ],
  },
  {
    id: 'footer', path: 'footer', title: 'Pied de page', anchor: '.footer',
    fields: [
      { key: 'mark', type: 'text', label: 'Grand texte en bas de page' },
      { key: 'left', type: 'text', label: 'Ligne d\'information' },
      { key: 'copyright', type: 'text', label: 'Nom après le ©' },
      { key: 'stickyCta', type: 'text', label: 'Bouton fixe sur mobile', help: 'Laissez vide pour le masquer.' },
      { key: 'modalText', type: 'text', label: 'Phrase sous les vidéos' },
      { key: 'modalCta', type: 'text', label: 'Bouton sous les vidéos' },
    ],
  },
  {
    id: 'theme', path: 'theme', title: 'Couleurs', anchor: '#top',
    fields: [
      { key: 'bg', type: 'color', label: 'Fond' },
      { key: 'text', type: 'color', label: 'Texte' },
      { key: 'muted', type: 'color', label: 'Texte secondaire' },
    ],
  },
  {
    id: 'meta', path: 'meta', title: 'Google & partage', anchor: '#top',
    hint: 'Ce qui s\'affiche dans Google et quand le lien est partagé (WhatsApp, Instagram…).',
    fields: [
      { key: 'title', type: 'text', label: 'Titre de la page (onglet & Google)', max: 65 },
      { key: 'description', type: 'textarea', label: 'Description Google', rows: 3, max: 160 },
      { key: 'ogTitle', type: 'text', label: 'Titre lors d\'un partage' },
      { key: 'ogDescription', type: 'text', label: 'Description lors d\'un partage' },
      { key: 'ogImage', type: 'image', label: 'Image lors d\'un partage' },
      { key: 'favicon', type: 'image', label: 'Icône de l\'onglet (favicon)' },
    ],
  },
];
