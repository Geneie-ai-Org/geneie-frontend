import React from 'react';

/**
 * Geneie wordmark that follows the theme with CSS alone (no hook, so it is safe in the error
 * boundary and before the theme provider mounts). The `dark` class lives on <html>. The dark-canvas
 * asset is the dark wordmark with the glyph blue lifted (and the magenta nudged) so it reads on a
 * near-black surface; the original dark-blue glyph nearly vanishes there.
 */
export default function BrandLogo({ className = 'h-7 w-auto', alt = 'Geneie' }) {
  return (
    <>
      <img
        src="/logo/Final gene light.svg"
        alt={alt}
        className={`${className} dark:hidden`}
        decoding="async"
      />
      <img
        src="/logo/Final gene dark canvas.svg"
        alt={alt}
        className={`${className} hidden dark:block`}
        decoding="async"
      />
    </>
  );
}
