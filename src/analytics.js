/**
 * Consent-gated Google Analytics (GA4).
 *
 * gtag.js is only loaded after the visitor allows analytics in the consent
 * banner or on the /privacy page. Until then nothing is requested from Google.
 * The choice is kept in localStorage under CONSENT_STORAGE_KEY.
 */

export const GA_MEASUREMENT_ID = "G-NE3RESV55L";
export const CONSENT_STORAGE_KEY = "smar-analytics-consent";
export const CONSENT_GRANTED = "granted";
export const CONSENT_DENIED = "denied";

const GTAG_SRC = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
const CONSENT_EVENT = "smar-analytics-consent-change";

function gtag() {
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(arguments);
}

/** Returns "granted", "denied" or null when the visitor has not chosen yet. */
export function getAnalyticsConsent() {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === CONSENT_GRANTED || value === CONSENT_DENIED ? value : null;
  } catch (e) {
    // Storage can be blocked (private mode, disabled cookies); treat as no choice.
    return null;
  }
}

function isGtagLoaded() {
  return Boolean(document.querySelector(`script[src="${GTAG_SRC}"]`));
}

// Google's documented opt-out switch: while true, gtag.js sends nothing.
function setGaDisabled(disabled) {
  window[`ga-disable-${GA_MEASUREMENT_ID}`] = disabled;
}

function loadGtag() {
  setGaDisabled(false);
  if (isGtagLoaded()) return;
  const script = document.createElement("script");
  script.async = true;
  script.src = GTAG_SRC;
  document.head.appendChild(script);
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
}

/**
 * Called once at startup. Google Consent Mode defaults to denied so that,
 * even if the tag is loaded later, nothing is stored until consent is granted.
 * The tag itself is only fetched for visitors who already opted in.
 */
export function initAnalytics() {
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  if (getAnalyticsConsent() === CONSENT_GRANTED) {
    gtag("consent", "update", { analytics_storage: "granted" });
    loadGtag();
  }
}

/** Persist the visitor's choice and apply it immediately. */
export function setAnalyticsConsent(choice) {
  const value = choice === CONSENT_GRANTED ? CONSENT_GRANTED : CONSENT_DENIED;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch (e) {
    // If storage is unavailable the choice still applies for this page view.
  }
  if (value === CONSENT_GRANTED) {
    gtag("consent", "update", { analytics_storage: "granted" });
    loadGtag();
  } else {
    // If the tag was already loaded this page view, stop it sending anything.
    gtag("consent", "update", { analytics_storage: "denied" });
    setGaDisabled(true);
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  return value;
}

/** Subscribe to consent changes; returns an unsubscribe function. */
export function onAnalyticsConsentChange(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}
