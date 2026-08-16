import { useEffect } from 'react';

export const SITE_URL = 'https://geneie.chat';

/**
 * Per-route document head. index.html carries the landing page's tags statically
 * (crawlers that don't run JavaScript only ever see those); this keeps them in
 * sync as the router moves between routes, and marks the authenticated surfaces
 * noindex so private conversation URLs stay out of search results.
 */

function upsert(selector, create, attribute, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  el.setAttribute(attribute, value);
}

function meta(name, content) {
  upsert(
    `meta[name="${name}"]`,
    () => Object.assign(document.createElement('meta'), { name }),
    'content',
    content
  );
}

function property(prop, content) {
  upsert(
    `meta[property="${prop}"]`,
    () => {
      const el = document.createElement('meta');
      el.setAttribute('property', prop);
      return el;
    },
    'content',
    content
  );
}

export function useSeo({ title, description, path = '/', noindex = false }) {
  useEffect(() => {
    const url = `${SITE_URL}${path}`;

    document.title = title;
    meta('description', description);
    meta('robots', noindex
      ? 'noindex, nofollow'
      : 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');

    upsert(
      'link[rel="canonical"]',
      () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
      'href',
      url
    );

    property('og:url', url);
    property('og:title', title);
    property('og:description', description);
    meta('twitter:title', title);
    meta('twitter:description', description);
  }, [title, description, path, noindex]);
}
