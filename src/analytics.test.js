import {
  CONSENT_DENIED,
  CONSENT_GRANTED,
  CONSENT_STORAGE_KEY,
  GA_MEASUREMENT_ID,
  getAnalyticsConsent,
  initAnalytics,
  pageReloader,
  setAnalyticsConsent,
} from "./analytics";

const gtagScript = () =>
  document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]');

// dataLayer entries are `arguments` objects; flatten for easier assertions.
const dataLayerCalls = () => (window.dataLayer || []).map((args) => Array.from(args));

beforeEach(() => {
  window.localStorage.clear();
  delete window.dataLayer;
  delete window[`ga-disable-${GA_MEASUREMENT_ID}`];
  document.head.innerHTML = "";
  document.cookie = "_ga=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  document.cookie = "_ga_NE3RESV55L=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
  jest.spyOn(pageReloader, "reload").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("without a stored choice, gtag.js is not loaded and consent defaults to denied", () => {
  initAnalytics();

  expect(getAnalyticsConsent()).toBeNull();
  expect(gtagScript()).toBeNull();
  expect(dataLayerCalls()).toEqual([
    [
      "consent",
      "default",
      expect.objectContaining({ analytics_storage: "denied", ad_storage: "denied" }),
    ],
  ]);
});

test("declining keeps gtag.js out of the page and remembers the choice", () => {
  initAnalytics();
  setAnalyticsConsent(CONSENT_DENIED);

  expect(gtagScript()).toBeNull();
  expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe(CONSENT_DENIED);
  expect(getAnalyticsConsent()).toBe(CONSENT_DENIED);
  expect(dataLayerCalls().some(([cmd, , cfg]) => cmd === "config" && cfg)).toBe(false);
});

test("accepting loads gtag.js once with the SMAR measurement id and updates consent", () => {
  initAnalytics();
  setAnalyticsConsent(CONSENT_GRANTED);
  setAnalyticsConsent(CONSENT_GRANTED); // idempotent

  const scripts = document.querySelectorAll('script[src^="https://www.googletagmanager.com/gtag/js"]');
  expect(scripts).toHaveLength(1);
  expect(scripts[0].src).toBe(`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`);
  expect(scripts[0].async).toBe(true);

  const calls = dataLayerCalls();
  expect(calls).toContainEqual(["consent", "update", { analytics_storage: "granted" }]);
  expect(calls).toContainEqual(["config", GA_MEASUREMENT_ID]);
  expect(window[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(false);
  expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe(CONSENT_GRANTED);
});

test("a previously granted choice loads gtag.js on startup; a denied one does not", () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_GRANTED);
  initAnalytics();
  expect(gtagScript()).not.toBeNull();

  document.head.innerHTML = "";
  delete window.dataLayer;
  window.localStorage.setItem(CONSENT_STORAGE_KEY, CONSENT_DENIED);
  document.cookie = "_ga=GA1.1.leftover; path=/";
  initAnalytics();
  expect(gtagScript()).toBeNull();
  expect(document.cookie).not.toContain("_ga=");
});

test("declining after accepting switches the loaded tag off", () => {
  initAnalytics();
  setAnalyticsConsent(CONSENT_GRANTED);
  document.cookie = "_ga=GA1.1.x; path=/";
  document.cookie = "_ga_NE3RESV55L=GS2.1.y; path=/";
  document.cookie = "other=1; path=/";
  setAnalyticsConsent(CONSENT_DENIED);

  expect(window[`ga-disable-${GA_MEASUREMENT_ID}`]).toBe(true);
  expect(dataLayerCalls()).toContainEqual(["consent", "update", { analytics_storage: "denied" }]);
  expect(getAnalyticsConsent()).toBe(CONSENT_DENIED);
  expect(document.cookie).not.toContain("_ga=");
  expect(document.cookie).not.toContain("_ga_NE3RESV55L=");
  expect(document.cookie).toContain("other=1");
  expect(pageReloader.reload).toHaveBeenCalledTimes(1);
});

test("declining before gtag.js loads does not reload the page", () => {
  initAnalytics();
  setAnalyticsConsent(CONSENT_DENIED);

  expect(gtagScript()).toBeNull();
  expect(pageReloader.reload).not.toHaveBeenCalled();
});

test("garbage in storage is treated as no choice", () => {
  window.localStorage.setItem(CONSENT_STORAGE_KEY, "yes please");
  expect(getAnalyticsConsent()).toBeNull();
  initAnalytics();
  expect(gtagScript()).toBeNull();
});
