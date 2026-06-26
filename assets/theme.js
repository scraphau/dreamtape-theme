// Mobile menu
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-menu-open]')) {
    document.getElementById('mobileMenu')?.classList.add('open');
  }
  if (e.target.matches('[data-menu-close]')) {
    document.getElementById('mobileMenu')?.classList.remove('open');
  }
});

// Smooth scroll for in-page anchors
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href');
    if (id.length > 1) {
      const el = document.querySelector(id);
      if (el) {
        e.preventDefault();
        el.scrollIntoView({behavior:'smooth', block:'start'});
        document.getElementById('mobileMenu')?.classList.remove('open');
      }
    }
  });
});

// Scroll reveal
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  });
}, {threshold: 0.12});
document.querySelectorAll('.section-head, .product-card, .benefit, .how-step, .testimonial, .wakeup-grid, .guarantee-inner, .faq-item').forEach(el => {
  el.classList.add('reveal');
  io.observe(el);
});

// Variant picker for product page
document.querySelectorAll('[data-variant-picker]').forEach(picker => {
  const form = picker.closest('form');
  const options = picker.querySelectorAll('.variant-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const id = opt.dataset.variantId;
      const input = form?.querySelector('input[name="id"]');
      if (input) input.value = id;
    });
  });
});

// Product gallery thumb swap
document.querySelectorAll('[data-gallery-thumb]').forEach(thumb => {
  thumb.addEventListener('click', () => {
    const main = document.querySelector('[data-gallery-main]');
    const src = thumb.querySelector('img')?.src;
    if (main && src) {
      const mainImg = main.querySelector('img');
      if (mainImg) mainImg.src = src;
    }
    document.querySelectorAll('[data-gallery-thumb]').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
  });
});

// FAQ category tabs
document.querySelectorAll('[data-faq-tabs]').forEach(wrapper => {
  const tabs = wrapper.querySelectorAll('[data-faq-tab]');
  const panels = wrapper.querySelectorAll('[data-faq-panel]');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.faqTab;

      tabs.forEach(item => {
        const isActive = item === tab;
        item.classList.toggle('active', isActive);
        item.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      panels.forEach(panel => {
        const isActive = panel.dataset.faqPanel === target;
        panel.classList.toggle('active', isActive);
        panel.hidden = !isActive;
        if (!isActive) {
          panel.querySelectorAll('details[open]').forEach(item => item.removeAttribute('open'));
        }
      });
    });
  });
});

// Reviews page
document.querySelectorAll('[data-reviews-page]').forEach(page => {
  const dialog = page.querySelector('[data-review-dialog]');
  const form = page.querySelector('[data-review-form]');
  const list = page.querySelector('[data-reviews-list]');
  const ratingValue = page.querySelector('[data-review-rating-value]');
  const ratingButtons = page.querySelectorAll('[data-rating-value]');
  const countEls = page.querySelectorAll('[data-review-count]');
  const sort = page.querySelector('[data-review-sort]');
  const storageKey = 'dreamtapeReviews';

  const stars = rating => `${'&#9733;'.repeat(rating)}${'&#9734;'.repeat(5 - rating)}`;

  const storedReviews = () => {
    try {
      return JSON.parse(window.localStorage.getItem(storageKey)) || [];
    } catch {
      return [];
    }
  };

  const saveReviews = reviews => {
    window.localStorage.setItem(storageKey, JSON.stringify(reviews));
  };

  const reviewMarkup = review => `
    <article class="review-card" data-local-review data-rating="${review.rating}">
      <div class="review-card-top">
        <span>about <a href="/products/mouth-tape">Dreamtape Mouth Tape</a></span>
        <time>${review.date}</time>
      </div>
      <div class="reviews-stars">${stars(review.rating)}</div>
      <div class="review-author">
        <span class="review-avatar" aria-hidden="true"></span>
        <span>${review.name}</span>
        <strong>Verified</strong>
      </div>
      <h3>${review.title}</h3>
      <p>${review.content}</p>
    </article>`;

  const escapeText = value => {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  };

  const updateCount = () => {
    const total = 874 + storedReviews().length;
    countEls.forEach(el => { el.textContent = total; });
  };

  const renderStoredReviews = () => {
    list?.querySelectorAll('[data-local-review]').forEach(card => card.remove());
    const reviews = storedReviews();
    reviews.slice().reverse().forEach(review => list?.insertAdjacentHTML('afterbegin', reviewMarkup(review)));
    updateCount();
  };

  const setRating = rating => {
    if (ratingValue) ratingValue.value = rating;
    ratingButtons.forEach(button => {
      button.innerHTML = Number(button.dataset.ratingValue) <= rating ? '&#9733;' : '&#9734;';
    });
  };

  page.querySelectorAll('[data-review-open]').forEach(button => {
    button.addEventListener('click', () => {
      setRating(Number(ratingValue?.value || 5));
      if (dialog?.showModal) dialog.showModal();
      else dialog?.setAttribute('open', '');
    });
  });

  page.querySelectorAll('[data-review-close]').forEach(button => {
    button.addEventListener('click', () => dialog?.close());
  });

  ratingButtons.forEach(button => {
    button.addEventListener('click', () => setRating(Number(button.dataset.ratingValue)));
  });

  form?.addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(form);
    const review = {
      rating: Number(data.get('rating') || 5),
      title: escapeText(data.get('title') || ''),
      content: escapeText(data.get('content') || ''),
      name: escapeText(data.get('name') || ''),
      date: 'Just now'
    };
    const reviews = storedReviews();
    reviews.unshift(review);
    saveReviews(reviews.slice(0, 20));
    form.reset();
    setRating(5);
    dialog?.close();
    renderStoredReviews();
  });

  sort?.addEventListener('change', () => {
    const cards = Array.from(list?.children || []);
    const sorted = cards.sort((a, b) => {
      if (sort.value === 'highest') return Number(b.dataset.rating || 0) - Number(a.dataset.rating || 0);
      if (sort.value === 'lowest') return Number(a.dataset.rating || 0) - Number(b.dataset.rating || 0);
      return 0;
    });
    sorted.forEach(card => list?.appendChild(card));
  });

  setRating(5);
  renderStoredReviews();
});
