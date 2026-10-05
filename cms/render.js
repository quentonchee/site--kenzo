// Turns content/site.json into the full index.html.
// Shared by the admin (live preview, GitHub publishing) and by Node (build.js, server.js).

const esc = (v = '') => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Light formatting for editors: *italique*, **gras**, line breaks, French non-breaking spaces.
export function inline(text = '') {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/ ([:;!?»])/g, '&nbsp;$1')
    .replace(/« /g, '«&nbsp;')
    .replace(/\n/g, '<br>');
}

const paragraphs = (text = '') => String(text).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

// Accepts a YouTube / Google Drive / Vimeo URL (or an already-short "yt:ID") and returns the
// token main.js understands for the video modal.
export function videoToken(url = '') {
  const u = String(url).trim();
  if (!u) return '';
  if (/^(yt|drive|vimeo):/.test(u)) return u;
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/);
  if (m) return `yt:${m[1]}`;
  m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=)([\w-]{10,})/);
  if (m) return `drive:${m[1]}`;
  m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m) return `vimeo:${m[1]}`;
  return u;
}

const pad = (n) => String(n).padStart(2, '0');
const isOn = (section) => section && section.visible !== false;
const list = (arr) => (Array.isArray(arr) ? arr : []);

// `resolve` lets the admin swap not-yet-published uploads for local previews.
export function renderPage(c, { resolve = (p) => p, base = '' } = {}) {
  const img = (p) => esc(resolve(p || ''));
  const { meta = {}, theme = {}, nav = {}, hero = {}, proof = {}, portfolio = {}, services = {},
    method = {}, about = {}, testimonials = {}, faq = {}, contact = {}, footer = {} } = c;

  const themeVars = [
    theme.bg && `--bg:${theme.bg}`,
    theme.text && `--text:${theme.text}`,
    theme.muted && `--muted:${theme.muted}`,
  ].filter(Boolean).join(';');

  const navLinks = list(nav.links).map((l) => `<a href="${esc(l.href)}">${esc(l.label)}</a>`).join('\n      ');

  /* ---------- Hero ---------- */
  const heroHtml = `
    <section class="hero">
      <div class="hero__media" aria-hidden="true">
        ${hero.image ? `<img src="${img(hero.image)}" alt="">` : ''}
      </div>
      ${hero.hud !== false ? `<div class="hero__hud" aria-hidden="true">
        <span class="rec"><i></i>REC</span>
        <span id="timecode">00:00:00:00</span>
      </div>` : ''}
      <div class="hero__content wrap">
        <h1 class="hero__title">${inline(hero.title)}</h1>
        <div class="hero__bottom">
          <p class="hero__lead">${inline(hero.lead)}</p>
          <div class="hero__actions">
            ${hero.primary?.label ? `<a href="${esc(hero.primary.href || '#contact')}" class="btn btn--light">${esc(hero.primary.label)}</a>` : ''}
            ${hero.showreelVideo ? `<button class="btn btn--line" data-video="${esc(videoToken(hero.showreelVideo))}" data-title="${esc(hero.showreelTitle || hero.showreelLabel)}">▶&ensp;${esc(hero.showreelLabel || 'Showreel')}</button>` : ''}
          </div>
        </div>
      </div>
    </section>`;

  /* ---------- Proof ---------- */
  const statHtml = (s) => {
    const n = String(s.value ?? '').trim();
    const counter = /^\d+$/.test(n) ? `<span data-count="${n}">${n}</span>` : esc(n);
    return `<div><strong>${counter}${esc(s.suffix || '')}</strong><span>${esc(s.label)}</span></div>`;
  };
  const clients = list(proof.clients).map((x) => esc(x.name)).filter(Boolean);
  const proofHtml = isOn(proof) ? `
    <section class="proof" aria-label="En chiffres">
      ${list(proof.stats).length ? `<div class="wrap proof__grid">
        ${list(proof.stats).map(statHtml).join('\n        ')}
      </div>` : ''}
      ${clients.length ? `<p class="wrap proof__clients">
        <span class="label">${esc(proof.clientsLabel)}</span>
        ${clients.join(' <i>/</i> ')}
      </p>` : ''}
    </section>` : '';

  /* ---------- Portfolio ---------- */
  const items = list(portfolio.items);
  const cats = list(portfolio.categories).filter((cat) => cat.id);
  const count = (id) => items.filter((it) => it.category === id).length;
  const filters = [
    `<button class="filter is-active" data-filter="all" role="tab" aria-selected="true">${esc(portfolio.allLabel || 'Tout')} <sup>${items.length}</sup></button>`,
    ...cats.filter((cat) => count(cat.id) > 0).map((cat) =>
      `<button class="filter" data-filter="${esc(cat.id)}" role="tab" aria-selected="false">${esc(cat.label)} <sup>${count(cat.id)}</sup></button>`),
  ];
  const workHtml = (it, i) => {
    const token = videoToken(it.video);
    const attrs = token ? ` data-video="${esc(token)}" data-title="${esc(it.title)}"` : '';
    return `
          <article class="work${it.featured ? ' work--feature' : ''}" data-cat="${esc(it.category)}"${attrs}>
            <figure class="work__img"><img src="${img(it.image)}" alt="${esc(it.alt || it.title)}" loading="lazy">${token ? `<span class="work__cue">${esc(portfolio.playLabel || '▶ Lire')}</span>` : ''}</figure>
            <div class="work__cap"><span class="work__n">${pad(i + 1)}</span><h3>${esc(it.title)}</h3><span class="work__type">${esc(it.type)}</span></div>
          </article>`;
  };
  const portfolioHtml = isOn(portfolio) ? `
    <section class="section" id="realisations">
      <div class="wrap">
        <header class="head">
          <span class="label">${esc(portfolio.label)}</span>
          <h2 class="h2">${inline(portfolio.title)}</h2>
          ${cats.length ? `<div class="filters" role="tablist" aria-label="Filtrer les réalisations">
            ${filters.join('\n            ')}
          </div>` : ''}
        </header>
        <div class="grid" id="grid">${items.map(workHtml).join('')}
        </div>
      </div>
    </section>` : '';

  /* ---------- Services ---------- */
  const servicesHtml = isOn(services) ? `
    <section class="section" id="services">
      <div class="wrap">
        <header class="head">
          <span class="label">${esc(services.label)}</span>
          <h2 class="h2">${inline(services.title)}</h2>
        </header>
        <ol class="offers">${list(services.items).map((s, i) => `
          <li class="offer">
            <span class="offer__n">${pad(i + 1)}</span>
            <h3>${esc(s.title)}</h3>
            <p>${inline(s.text)}</p>
            <span class="offer__for">${esc(s.audience)}</span>
            ${s.image ? `<img class="offer__peek" src="${img(s.image)}" alt="" aria-hidden="true">` : ''}
          </li>`).join('')}
        </ol>
        ${services.note || services.cta?.label ? `<div class="quote-line">
          <p>${inline(services.note)}</p>
          ${services.cta?.label ? `<a href="${esc(services.cta.href || '#contact')}" class="btn btn--light">${esc(services.cta.label)}</a>` : ''}
        </div>` : ''}
      </div>
    </section>` : '';

  /* ---------- Method ---------- */
  const methodHtml = isOn(method) ? `
    <section class="section section--tight" id="methode">
      <div class="wrap">
        <header class="head">
          <span class="label">${esc(method.label)}</span>
          <h2 class="h2">${inline(method.title)}</h2>
        </header>
        <ol class="steps">${list(method.steps).map((s) => `
          <li><span class="tc">${esc(s.code)}</span><h3>${esc(s.title)}</h3><p>${inline(s.text)}</p></li>`).join('')}
        </ol>
      </div>
    </section>` : '';

  /* ---------- About ---------- */
  const aboutHtml = isOn(about) ? `
    <section class="section" id="apropos">
      <div class="wrap about">
        <figure class="about__media">
          ${about.image ? `<img src="${img(about.image)}" alt="${esc(about.alt)}" loading="lazy">` : ''}
          ${about.caption ? `<figcaption>${esc(about.caption)}</figcaption>` : ''}
        </figure>
        <div class="about__text">
          <span class="label">${esc(about.label)}</span>
          <h2 class="h2">${inline(about.title)}</h2>
          ${about.lead ? `<p class="about__lead">${inline(about.lead)}</p>` : ''}
          ${paragraphs(about.body).map((p) => `<p>${inline(p)}</p>`).join('\n          ')}
          ${list(about.facts).length ? `<dl class="about__facts">${list(about.facts).map((f) => `
            <div><dt>${esc(f.label)}</dt><dd>${inline(f.value)}</dd></div>`).join('')}
          </dl>` : ''}
        </div>
      </div>
    </section>` : '';

  /* ---------- Testimonials ---------- */
  const testiHtml = isOn(testimonials) ? `
    <section class="section" id="avis">
      <div class="wrap">
        <span class="label">${esc(testimonials.label)}</span>
        ${testimonials.featuredQuote ? `<figure class="testi-main">
          <blockquote>${inline(`« ${testimonials.featuredQuote} »`)}</blockquote>
          <figcaption>${esc(testimonials.featuredAuthor)}</figcaption>
        </figure>` : ''}
        ${list(testimonials.items).length ? `<div class="testis">${list(testimonials.items).map((t) => `
          <figure>
            <blockquote>${inline(t.quote)}</blockquote>
            <figcaption><strong>${esc(t.name)}</strong>${esc(t.role)}</figcaption>
          </figure>`).join('')}
        </div>` : ''}
      </div>
    </section>` : '';

  /* ---------- FAQ ---------- */
  const faqHtml = isOn(faq) ? `
    <section class="section section--tight" id="faq">
      <div class="wrap faq">
        <header>
          <span class="label">${esc(faq.label)}</span>
          <h2 class="h2">${inline(faq.title)}</h2>
        </header>
        <div class="faq__list">${list(faq.items).map((q) => `
          <details>
            <summary>${inline(q.question)}</summary>
            <p>${inline(q.answer)}</p>
          </details>`).join('')}
        </div>
      </div>
    </section>` : '';

  /* ---------- Contact ---------- */
  const types = list(contact.projectTypes).map((t) => t.label).filter(Boolean);
  const contactHtml = `
    <section class="contact" id="contact">
      <div class="wrap contact__inner">
        <div class="contact__pitch">
          <span class="label">${esc(contact.label)}</span>
          <h2 class="contact__title">${inline(contact.title)}</h2>
          <p>${inline(contact.text)}</p>
          <dl class="contact__list">
            ${contact.email ? `<div><dt>Email</dt><dd><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></dd></div>` : ''}${list(contact.links).map((l) => `
            <div><dt>${esc(l.label)}</dt><dd><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.text || l.url)}</a></dd></div>`).join('')}
          </dl>
        </div>

        <form class="form" id="contactForm" data-email="${esc(contact.email)}" novalidate>
          <div class="form__row">
            <label>Nom<input type="text" name="name" required autocomplete="name"></label>
            <label>Email<input type="email" name="email" required autocomplete="email"></label>
          </div>
          ${types.length ? `<fieldset class="choice">
            <legend>Type de projet</legend>
            ${types.map((t, i) => `<label><input type="radio" name="type" value="${esc(t)}"${i === 0 ? ' checked' : ''}><span>${esc(t)}</span></label>`).join('\n            ')}
          </fieldset>` : ''}
          <div class="form__row">
            <label>Date envisagée<input type="text" name="date"></label>
            <label>Lieu<input type="text" name="place"></label>
          </div>
          <label>Votre projet<textarea name="message" rows="3" required></textarea></label>
          <div class="form__foot">
            <p class="form__note">${inline(contact.formNote)}</p>
            <button type="submit" class="btn btn--light">${esc(contact.submitLabel || 'Envoyer')}</button>
          </div>
          <p class="form__error" id="formError" role="alert"></p>
        </form>
      </div>
    </section>`;

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${base ? `<base href="${esc(base)}">` : ''}
  <title>${esc(meta.title)}</title>
  <meta name="description" content="${esc(meta.description)}">
  <meta property="og:title" content="${esc(meta.ogTitle || meta.title)}">
  <meta property="og:description" content="${esc(meta.ogDescription || meta.description)}">
  ${meta.ogImage ? `<meta property="og:image" content="${img(meta.ogImage)}">` : ''}
  <meta name="theme-color" content="${esc(theme.bg || '#0b0b0b')}">
  ${meta.favicon ? `<link rel="icon" href="${img(meta.favicon)}">` : ''}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="styles.css">
  ${themeVars ? `<style>:root{${themeVars}}</style>` : ''}
</head>
<body>
  <!-- Généré automatiquement depuis content/site.json — modifiez le contenu via /admin -->

  <header class="nav" id="nav">
    <a href="#top" class="brand" aria-label="${esc(nav.brand)} — accueil">${esc(nav.brand)}</a>
    <nav class="nav__links" aria-label="Navigation principale">
      ${navLinks}
    </nav>
    ${nav.cta?.label ? `<a href="${esc(nav.cta.href || '#contact')}" class="nav__cta">${esc(nav.cta.label)}</a>` : ''}
    <button class="nav__burger" aria-label="Ouvrir le menu" aria-expanded="false"><span></span><span></span></button>
  </header>

  <div class="mobile-menu" id="mobileMenu" hidden>
    ${navLinks}
    ${nav.cta?.label ? `<a href="${esc(nav.cta.href || '#contact')}">${esc(nav.cta.label)}</a>` : ''}
  </div>

  <main id="top">
${heroHtml}
${proofHtml}
${portfolioHtml}
${servicesHtml}
${methodHtml}
${aboutHtml}
${testiHtml}
${faqHtml}
${contactHtml}
  </main>

  <footer class="footer">
    <div class="wrap">
      <p class="footer__mark" aria-hidden="true">${esc(footer.mark)}</p>
      <div class="footer__row">
        <span>${esc(footer.left)}</span>
        <span>© <span id="year">${new Date().getFullYear()}</span> ${esc(footer.copyright)}</span>
      </div>
    </div>
  </footer>

  ${footer.stickyCta ? `<a href="#contact" class="sticky-cta">${esc(footer.stickyCta)}</a>` : ''}

  <div class="modal" id="modal" hidden role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="modal__backdrop" data-close></div>
    <div class="modal__box">
      <div class="modal__bar">
        <p id="modalTitle"></p>
        <button class="modal__close" data-close aria-label="Fermer la vidéo">Fermer ✕</button>
      </div>
      <div class="modal__frame" id="modalFrame"></div>
      <div class="modal__foot">
        <span>${inline(footer.modalText)}</span>
        ${footer.modalCta ? `<a href="#contact" class="btn btn--light btn--sm" data-close>${esc(footer.modalCta)}</a>` : ''}
      </div>
    </div>
  </div>

  <script src="main.js"></script>
</body>
</html>
`;
}
