import fs from "fs";
import path from "path";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import Footer from "./components/Footer";
import { CONSENT_STORAGE_KEY } from "./analytics";

const gtagScript = () =>
  document.querySelector('script[src^="https://www.googletagmanager.com/gtag/js"]');
const originalUserAgent = window.navigator.userAgent;

afterEach(() => {
  Object.defineProperty(window.navigator, "userAgent", {
    value: originalUserAgent,
    configurable: true,
  });
});

beforeEach(() => {
  window.localStorage.clear();
  delete window.dataLayer;
  document.head.innerHTML = "";
});

describe("public/index.html", () => {
  const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");
  const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]*)"/)[1];

  test("has no inline or Google Analytics scripts", () => {
    expect(html).not.toMatch(/<script[^>]*>\s*[^<\s]/); // no script with a body
    expect(html).not.toMatch(/googletagmanager\.com\/gtag\/js/);
    expect(html).not.toMatch(/gtag\(/);
  });

  test("CSP allows the hosts GA4 sends data to", () => {
    const connectSrc = csp.match(/connect-src([^;]*);/)[1];
    expect(connectSrc).toContain("https://*.google-analytics.com");
    expect(connectSrc).toContain("https://*.analytics.google.com");
  });

  test("script-src CSP does not allow 'unsafe-inline'", () => {
    const scriptSrc = csp.match(/script-src([^;]*);/)[1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).toContain("'self'");
    expect(scriptSrc).toContain("https://*.googletagmanager.com");
  });
});

test("footer links to the privacy notice", () => {
  render(
    <MemoryRouter>
      <Footer />
    </MemoryRouter>
  );
  expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
});

test("/privacy renders the notice and lets the visitor decline analytics", () => {
  render(
    <MemoryRouter initialEntries={["/privacy"]}>
      <App />
    </MemoryRouter>
  );

  expect(screen.getByRole("heading", { name: /privacy notice/i })).toBeInTheDocument();
  expect(screen.getByText(/notify me/i, { selector: "h5" })).toBeInTheDocument();

  // Banner is shown until a choice is made, and nothing has been sent to Google.
  const banner = screen.getByRole("dialog", { name: /analytics consent/i });
  expect(gtagScript()).toBeNull();

  fireEvent.click(screen.getAllByRole("button", { name: /^decline/i })[0]);

  expect(banner).not.toBeInTheDocument();
  expect(gtagScript()).toBeNull();
  expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("denied");
  expect(screen.getByText(/analytics is currently declined/i)).toBeInTheDocument();
});

test("accepting from the banner loads Google Analytics", () => {
  render(
    <MemoryRouter initialEntries={["/about"]}>
      <App />
    </MemoryRouter>
  );

  expect(gtagScript()).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /allow analytics/i }));

  expect(gtagScript()).not.toBeNull();
  expect(window.localStorage.getItem(CONSENT_STORAGE_KEY)).toBe("granted");
  expect(screen.queryByRole("dialog", { name: /analytics consent/i })).toBeNull();
});

test.each(["/", "/toplists", "/bulkreviews"])(
  "%s shows a privacy notice link on mobile after consent",
  (route) => {
    Object.defineProperty(window.navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });

    render(
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText("SMAR is Unavailable on Mobile Devices.")).toBeInTheDocument();
    // Answer the banner if it is shown, so its own link is out of the way.
    const allow = screen.queryByRole("button", { name: /allow analytics/i });
    if (allow) fireEvent.click(allow);

    expect(screen.getByRole("link", { name: /privacy notice/i })).toHaveAttribute("href", "/privacy");
  }
);
