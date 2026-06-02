# Dreamtape Shopify Theme

A custom Shopify 2.0 theme for Dreamtape — mouth tape and nose strips for better sleep.

## Folder structure

```
dreamtape-theme/
├── assets/
│   ├── base.css           # All theme styles
│   └── theme.js           # Mobile menu, scroll reveal, variant picker
├── config/
│   ├── settings_schema.json   # Theme settings (colors, favicon)
│   └── settings_data.json     # Saved settings values
├── layout/
│   └── theme.liquid       # Master HTML wrapper for every page
├── locales/
│   └── en.default.json    # English translations
├── sections/
│   ├── announcement-bar.liquid
│   ├── header.liquid
│   ├── footer.liquid
│   ├── hero.liquid
│   ├── trust-badges.liquid
│   ├── wakeup-stat.liquid
│   ├── featured-products.liquid
│   ├── benefits.liquid
│   ├── how-it-works.liquid
│   ├── testimonials.liquid
│   ├── guarantee.liquid
│   ├── faq.liquid
│   ├── final-cta.liquid
│   ├── main-product.liquid    # Product page hero
│   ├── main-collection.liquid # Collection grid
│   ├── main-page.liquid       # Generic page wrapper
│   ├── main-cart.liquid       # Cart page
│   ├── header-group.json      # Bundles announcement + header
│   └── footer-group.json
├── snippets/
│   ├── meta-tags.liquid       # SEO/OG tags
│   └── product-card.liquid    # Reusable product tile
└── templates/
    ├── index.json             # Homepage
    ├── product.json           # Product detail pages
    ├── collection.json        # Collection / category pages
    ├── page.json              # Generic content pages
    ├── page.faq.json          # FAQ-specific page template
    ├── cart.json              # Cart page
    ├── search.json            # Search results
    ├── list-collections.json  # All collections page
    └── 404.json               # Not found
```

## Pages this theme supports out of the box

- **Homepage** (`/`) — Hero, trust badges, wake-up stat, products, benefits, how it works, testimonials, guarantee, FAQ, final CTA
- **Product pages** (`/products/dreamtape-mouth-tape`, etc.) — Gallery, variant picker (1/3/6 month packs), add to cart, plus reused benefits/how/testimonials/guarantee/FAQ sections
- **Collection pages** (`/collections/all`) — Title, description, product grid
- **FAQ page** (`/pages/faq`) — Use the "page.faq" template
- **Generic pages** — About, Science, Contact, etc. (`/pages/about`)
- **Cart** (`/cart`)
- **Search results** (`/search`)
- **404**

## How to upload to Shopify

### Option 1: ZIP upload (easiest)

1. Zip the entire `dreamtape-theme` folder (make sure the zip contains the folders directly, not a parent folder).
2. In your Shopify admin: **Online Store → Themes**
3. Click **"Add theme" → "Upload zip file"**
4. Upload the zip
5. Once it appears in your theme library, click **"Customize"** to edit content, or **"Publish"** to make it live.

### Option 2: Shopify CLI (recommended for ongoing dev)

```bash
# Install once
npm install -g @shopify/cli @shopify/theme

# From inside the dreamtape-theme folder
cd dreamtape-theme
shopify theme dev --store=your-store.myshopify.com
```

This opens a live-reload preview at a local URL while you edit files.

To push your local theme to Shopify:
```bash
shopify theme push --unpublished
```

## After uploading — set up products & pages

### Step 1: Create your products
- **Online Store → Products → Add product**
- Suggested products: "Dreamtape Mouth Tape", "Dreamtape Nose Strips", "The Dream Bundle"
- For multi-pack variants (1/3/6 month supply), use Shopify's variant system: add an option called "Pack size" with values "1 month", "3 months", "6 months"

### Step 2: Create a collection
- **Online Store → Collections → Create collection**
- Name it something like "Featured" — add your 3 products
- In the homepage editor, the "Featured products" section will pull from this collection

### Step 3: Build your navigation menu
- **Online Store → Navigation**
- Edit the "Main menu" — add links to Mouth Tape, Nose Strips, Bundles, FAQ, etc.
- The header section automatically uses this menu.

### Step 4: Create content pages
- **Online Store → Pages → Add page**
- Create pages for: About, Science, FAQ, Contact, Shipping, Returns
- For the FAQ page specifically, in the "Online store" sidebar of the page editor, change the template from `page` to `page.faq` to get the styled FAQ accordion layout.

### Step 5: Customise content in the theme editor
- **Online Store → Themes → Customize**
- Click any section to edit headings, body text, buttons
- Rearrange section order via drag-and-drop
- Hide/show sections per page

## Recommended Shopify apps

To match the full Respire-style functionality:

- **Recharge** or **Skio** — Subscription billing (1/3/6 month auto-refills)
- **Loox** or **Judge.me** — Photo/video reviews
- **ReConvert** or **Rebuy** — Cart upsells & bundle builder
- **Klaviyo** — Email marketing
- **Privy** — Pop-ups for the 15% off email capture

## Notes & customisation

- **Colors**: edit in **Theme settings → Colors** in the theme editor. The four core colours (midnight, cream, paper, gold) flow through every section via CSS variables.
- **Fonts**: Fraunces (display serif) + Inter Tight (sans). Loaded from Google Fonts in `layout/theme.liquid`. To change fonts, edit that link + the `--font-serif` / `--font-sans` variables in `assets/base.css`.
- **Product images**: Upload via product admin. Theme uses `featured_media` for the hero shot and `product.media` for the thumbnail gallery.
- **Empty state**: If no collection is set on the homepage product grid, placeholder cards display. Once you assign a real collection, real products appear.

## Anything not working?

Common issues:
1. **"Liquid error: invalid url"** — Make sure linked pages, products, and collections actually exist before referencing them.
2. **Homepage doesn't show products** — Edit "Featured products" section in theme customiser and pick a collection.
3. **Header menu empty** — Create a menu in **Navigation** and assign it in the header section settings.

Built with Shopify Online Store 2.0 (JSON templates, sections everywhere, section groups). Compatible with Shopify checkout, payments, discounts, and gift cards.

