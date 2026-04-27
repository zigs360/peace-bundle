import { useEffect } from 'react';

interface SeoHeadProps {
  title: string;
  description: string;
  keywords?: string;
  image?: string;
  url?: string;
}

export default function SeoHead({ 
  title, 
  description, 
  keywords = "data, airtime, vtu, nigeria, cheap data, mtn, airtel, glo, 9mobile, electricity, cable tv", 
  image = "/og-image.jpg", 
  url = window.location.href 
}: SeoHeadProps) {
  useEffect(() => {
    // Update Title
    document.title = `${title} | Peace Bundle`;

    // Helper to update meta tags
    const updateMeta = (name: string, content: string, attribute: 'name' | 'property' = 'name') => {
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attribute, name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
    };

    // Standard Meta
    updateMeta('description', description);
    updateMeta('keywords', keywords);

    // Open Graph / Facebook
    updateMeta('og:type', 'website', 'property');
    updateMeta('og:url', url, 'property');
    updateMeta('og:title', title, 'property');
    updateMeta('og:description', description, 'property');
    updateMeta('og:image', image, 'property');

    // Twitter
    updateMeta('twitter:card', 'summary_large_image', 'property');
    updateMeta('twitter:url', url, 'property');
    updateMeta('twitter:title', title, 'property');
    updateMeta('twitter:description', description, 'property');
    updateMeta('twitter:image', image, 'property');

    // Canonical
    let linkCanonical = document.querySelector("link[rel='canonical']");
    if (!linkCanonical) {
      linkCanonical = document.createElement('link');
      linkCanonical.setAttribute('rel', 'canonical');
      document.head.appendChild(linkCanonical);
    }
    linkCanonical.setAttribute('href', url);

  }, [title, description, keywords, image, url]);

  return null;
}
