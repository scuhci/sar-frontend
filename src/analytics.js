/**
 * Consent-gated Google Analytics (GA4).
 *
 * gtag.js is only loaded after the visitor allows analytics in the consent
 * banner or on the /privacy page. No Google Analytics request is made until
 * the visitor allows it.
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

/** Expire Google Analytics cookies for the current host and its parent domains. */
export function clearAnalyticsCookies() {
  try {
    const cookieNames = document.cookie
      .split(";")
      .map((cookie) => cookie.trim().split("=")[0])
      .filter((name) => /^_ga(_|$)/.test(name));
    const hostname = window.location.hostname;
    const labels = hostname.split(".");
    const domains = [hostname, `.${hostname}`];

    for (let index = 1; index <= labels.length - 2; index += 1) {
      const parentDomain = labels.slice(index).join(".");
      domains.push(parentDomain, `.${parentDomain}`);
    }

    cookieNames.forEach((name) => {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
      domains.forEach((domain) => {
        document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=${domain}`;
      });
    });
  } catch (e) {
    // Cookie access can be blocked; consent changes must still apply.
  }
}

// Indirection so tests can stub the reload (jsdom does not implement it).
export const pageReloader = { reload: () => window.location.reload() };

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
  } else if (getAnalyticsConsent() === CONSENT_DENIED) {
    // Remove cookies left by an earlier visit that had allowed analytics.
    clearAnalyticsCookies();
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
  const withdrawn = value === CONSENT_DENIED && isGtagLoaded();
  if (value === CONSENT_GRANTED) {
    gtag("consent", "update", { analytics_storage: "granted" });
    loadGtag();
  } else {
    gtag("consent", "update", { analytics_storage: "denied" });
    setGaDisabled(true);
    clearAnalyticsCookies();
  }
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
  // ga-disable does not stop a batch gtag.js has already queued, so when the
  // tag was running in this page view, reload to drop it along with the tag.
  if (withdrawn) pageReloader.reload();
  return value;
}

/** Subscribe to consent changes; returns an unsubscribe function. */
export function onAnalyticsConsentChange(listener) {
  const handler = (event) => listener(event.detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}
