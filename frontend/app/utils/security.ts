// Import DOMPurify to parse and strip malicious scripts from the DOM context
import DOMPurify from 'dompurify';

/**
 * APPSEC REMEDIATION - DOM-BASED XSS SAFEGUARD
 * 
 * This function sanitizes untrusted text strings returned by AI LLM processing nodes 
 * or raw client inputs before inserting them into the browser render tree.
 * It prevents Malicious Script Injection vectors while safely preserving standard HTML layout tags.
 * 
 * @param rawHTMLString - The raw, unvetted payload coming from the API network interface.
 * @returns A cryptographically sanitized HTML string safe for React execution.
 */
export function sanitizeClientOutput(rawHTMLString: string): string {
  // Edge-case validation: Ensure we bypass processing if the string is empty or invalid
  if (!rawHTMLString || typeof rawHTMLString !== 'string') {
    return '';
  }

  // Configure DOMPurify strict options to prevent typical bypass vectors (e.g., <img src=x onerror=...>)
  const cleanDOM = DOMPurify.sanitize(rawHTMLString, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'code', 'pre'],
    ALLOWED_ATTR: [], // Enforce zero raw attribute injection to block event listener triggers (onload, onerror)
    RETURN_TRUSTED_TYPE: false // Toggle to false to standardise handling if Trusted Types API is missing
  });

  return cleanDOM;
}
