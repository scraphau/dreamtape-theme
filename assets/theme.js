// Mobile menu
document.addEventListener('click', (e) => {
  if (e.target.matches('[data-menu-open]')) {
    document.getElementById('mobileMenu')?.classList.add('open');
    document.getElementById('mobileMenuBackdrop')?.classList.add('open');
    document.documentElement.classList.add('menu-open');
  }
  if (e.target.matches('[data-menu-close]')) {
    document.getElementById('mobileMenu')?.classList.remove('open');
    document.getElementById('mobileMenuBackdrop')?.classList.remove('open');
    document.documentElement.classList.remove('menu-open');
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
document.querySelectorAll('.section-head, .product-card, .benefit, .how-step, .testimonial, .wakeup-inner, .guarantee-inner, .faq-item').forEach(el => {
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

// FAQ page accordion (question opens/closes like the product page gallery FAQ)
function closeFaqPageItem(item) {
  const body = item.querySelector('.faq-page-body');
  const btn = item.querySelector('.faq-page-summary');
  item.classList.remove('is-open');
  if (body) body.style.maxHeight = '0px';
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

document.querySelectorAll('.faq-page-summary').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-page-item');
    const body = item.querySelector('.faq-page-body');
    if (item.classList.contains('is-open')) {
      closeFaqPageItem(item);
    } else {
      item.classList.add('is-open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// Bottom-of-product-page FAQ accordion (same open/close as the gallery FAQ)
document.querySelectorAll('.faq-item .faq-summary').forEach(btn => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const body = item.querySelector('.faq-body');
    if (item.classList.contains('is-open')) {
      item.classList.remove('is-open');
      body.style.maxHeight = '0px';
      btn.setAttribute('aria-expanded', 'false');
    } else {
      item.classList.add('is-open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    }
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
          panel.querySelectorAll('.faq-page-item.is-open').forEach(closeFaqPageItem);
        }
      });
    });
  });
});
