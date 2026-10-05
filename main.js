(() => {
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Nav: scrolled state, active link, sticky CTA ---------- */
  const nav = $('#nav');
  const sticky = $('.sticky-cta');
  const hero = $('.hero');
  const contact = $('#contact');
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 40);
    if (!sticky) return;
    const pastHero = y > (hero ? hero.offsetHeight : window.innerHeight) * 0.7;
    const atContact = contact ? contact.getBoundingClientRect().top < window.innerHeight * 0.8 : false;
    sticky.classList.toggle('is-visible', pastHero && !atContact);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const links = $$('.nav__links a');
  const spy = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === '#' + e.target.id));
    });
  }, { rootMargin: '-45% 0px -50% 0px' });
  links.forEach((a) => { const s = $(a.getAttribute('href')); if (s) spy.observe(s); });

  /* ---------- Mobile menu ---------- */
  const burger = $('.nav__burger');
  const menu = $('#mobileMenu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
    document.body.style.overflow = open ? 'hidden' : '';
  };
  burger.addEventListener('click', () => setMenu(menu.hidden));
  $$('a', menu).forEach((a) => a.addEventListener('click', () => setMenu(false)));

  /* ---------- Hero timecode ---------- */
  const tc = $('#timecode');
  if (tc && !reduced) {
    const start = performance.now();
    const pad = (n) => String(n).padStart(2, '0');
    const tick = (now) => {
      const t = (now - start) / 1000;
      tc.textContent = `${pad(Math.floor(t / 3600))}:${pad(Math.floor(t / 60) % 60)}:${pad(Math.floor(t) % 60)}:${pad(Math.floor((t % 1) * 25))}`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* ---------- Count-up stats ---------- */
  const counters = $$('[data-count]');
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target;
      const end = +el.dataset.count;
      countIO.unobserve(el);
      if (reduced) { el.textContent = end; return; }
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min((now - t0) / 1400, 1);
        el.textContent = Math.round(end * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.6 });
  counters.forEach((c) => countIO.observe(c));

  /* ---------- Reveal on scroll ---------- */
  const revealTargets = $$('.head, .work, .offer, .steps li, .about__media, .about__text, .testi-main, .testis figure, .faq > *, .contact__pitch, .form, .quote-line');
  revealTargets.forEach((el) => el.classList.add('reveal'));
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      const siblings = [...e.target.parentElement.children].filter((c) => c.classList.contains('reveal'));
      e.target.style.transitionDelay = `${Math.min(siblings.indexOf(e.target), 4) * 70}ms`;
      e.target.classList.add('is-in');
      revealIO.unobserve(e.target);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
  revealTargets.forEach((el) => revealIO.observe(el));

  /* ---------- Portfolio filters ---------- */
  const filters = $$('.filter');
  const cards = $$('.work');
  filters.forEach((btn) => btn.addEventListener('click', () => {
    const f = btn.dataset.filter;
    filters.forEach((b) => {
      const on = b === btn;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
    cards.forEach((c) => c.classList.toggle('is-hidden', f !== 'all' && c.dataset.cat !== f));
  }));

  /* ---------- Video modal ---------- */
  const modal = $('#modal');
  const frame = $('#modalFrame');
  const title = $('#modalTitle');
  let lastFocus = null;

  const embedUrl = (src) => {
    const [kind, id] = src.split(':');
    if (kind === 'yt') return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
    if (kind === 'drive') return `https://drive.google.com/file/d/${id}/preview`;
    if (kind === 'vimeo') return `https://player.vimeo.com/video/${id}?autoplay=1`;
    return src;
  };
  const openVideo = (src, label) => {
    lastFocus = document.activeElement;
    title.textContent = label || '';
    const iframe = document.createElement('iframe');
    iframe.src = embedUrl(src);
    iframe.title = label || 'Vidéo';
    iframe.allow = 'autoplay; encrypted-media; fullscreen; picture-in-picture';
    iframe.allowFullscreen = true;
    frame.replaceChildren(iframe);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    $('.modal__close', modal).focus();
  };
  const closeVideo = () => {
    modal.hidden = true;
    frame.innerHTML = '';
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  };

  $$('[data-video]').forEach((el) => {
    if (el.tagName === 'ARTICLE') {
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `Lire la vidéo : ${el.dataset.title}`);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openVideo(el.dataset.video, el.dataset.title); }
      });
    }
    el.addEventListener('click', () => openVideo(el.dataset.video, el.dataset.title));
  });
  $$('[data-close]', modal).forEach((el) => el.addEventListener('click', closeVideo));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeVideo();
    if (e.key === 'Escape' && !menu.hidden) setMenu(false);
  });

  /* ---------- Contact form → pre-filled email ---------- */
  const form = $('#contactForm');
  const err = $('#formError');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const required = ['name', 'email', 'message'];
    let ok = true;
    required.forEach((n) => {
      const input = form.elements[n];
      const bad = !input.value.trim() || (n === 'email' && !/^\S+@\S+\.\S+$/.test(input.value));
      input.classList.toggle('is-invalid', bad);
      if (bad) ok = false;
    });
    if (!ok) { err.textContent = 'Merci de compléter votre nom, un email valide et quelques mots sur le projet.'; return; }
    err.textContent = '';

    const type = data.get('type') || 'Projet';
    const subject = `Demande de devis — ${type} — ${data.get('name')}`;
    const body = [
      `Nom : ${data.get('name')}`,
      `Email : ${data.get('email')}`,
      `Type de projet : ${type}`,
      `Date envisagée : ${data.get('date') || '—'}`,
      `Lieu : ${data.get('place') || '—'}`,
      '',
      data.get('message'),
    ].join('\n');
    window.location.href = `mailto:${form.dataset.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();
})();
