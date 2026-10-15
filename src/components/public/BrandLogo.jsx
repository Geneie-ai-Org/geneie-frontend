import React from 'react';

/**
 * Geneie wordmark that follows the theme with CSS alone (no hook, so it is safe in the error
 * boundary and before the theme provider mounts). The `dark` class lives on <html>.
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
        src="/logo/Final gene dark.svg"
        alt={alt}
        className={`${className} hidden dark:block`}
        decoding="async"
      />
    </>
  );
}
