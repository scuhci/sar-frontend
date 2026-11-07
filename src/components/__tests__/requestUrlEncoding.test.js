/**
 * Every user-supplied value that ends up in a request URL (search term, app ID) must be
 * URL-encoded, otherwise '&', '+', '#' and '%' corrupt the
 * query string the backend parses.
 *
 * These tests use the real axios with a stubbed adapter so they assert on the URL that
 * would actually be sent, not on how the component happened to build it.
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern requestUrlEncoding
 */
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SearchBar from "../SearchBar";
import DownloadReviews from "../DownloadReviews";
import { ScraperProvider } from "../SelectedScraperProvider";

// Jest 27 (react-scripts 5) cannot load axios's ESM entry point, so point it at the
// CommonJS browser build instead of mocking axios away.
jest.mock("axios", () => require("axios/dist/browser/axios.cjs"));
import axios from "axios";

// The MUI Dialog chrome (portal + focus trap) is irrelevant here and is flaky under jsdom.
jest.mock("@mui/material/Dialog", () => {
    const React = require("react");
    return {
        __esModule: true,
        default: ({ open, children }) => (open ? React.createElement("div", { role: "dialog" }, children) : null),
    };
});

beforeAll(() => {
    if (!global.ResizeObserver) {
        global.ResizeObserver = class {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
});

// Characters that each break a hand-built query string in a different way.
const TERM = "health & fitness #1 +2 100%";
const APP_ID = "com.example.a&b";

const pending = () => new Promise(() => {});
const ok = (config, data) => Promise.resolve({ data, status: 200, statusText: "OK", headers: {}, config });

const requests = [];
let respond = pending;

beforeEach(() => {
    localStorage.clear();
    requests.length = 0;
    respond = pending;
    axios.defaults.adapter = (config) => {
        requests.push(config);
        return respond(config);
    };
});

// The query string exactly as the server will parse it.
const sentParams = (config) => new URL(axios.getUri(config), "http://localhost").searchParams;
const requestTo = (pathPart) => requests.find((r) => r.url.includes(pathPart));

const renderSearch = () =>
    render(
        <MemoryRouter>
            <ScraperProvider>
                <SearchBar flipState={() => {}} />
            </ScraperProvider>
        </MemoryRouter>,
    );

const searchFor = async (term) => {
    const input = screen.getByLabelText(/Scrape by keyword/i);
    fireEvent.change(input, { target: { value: term } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(requestTo("/search")).toBeDefined());
};

test("search request carries the full search term", async () => {
    renderSearch();
    await searchFor(TERM);

    const params = sentParams(requestTo("/api/search"));
    expect(params.get("query")).toBe(TERM);
    expect(params.get("includePermissions")).toBe("false");
    expect(params.get("countryCode")).toBe("US");
    expect(Array.from(params.keys()).sort()).toEqual(["countryCode", "includePermissions", "query", "time"]);
});

test("download-csv and download-relog requests carry the full search term", async () => {
    const app = {
        appId: "com.example.app",
        title: "Example",
        reviews: 10,
        country: "US",
        available: true,
        offersIAP: false,
        adSupported: false,
    };
    respond = (config) => ok(config, { results: [app], totalCount: 1 });
    renderSearch();
    await searchFor(TERM);
    await screen.findByText(/Download \(1 Results/);

    // Let the CSV request finish so the relog request is sent too, but never finish the
    // relog request so the ZIP is never assembled under jsdom.
    respond = (config) => (config.url.includes("download-csv") ? ok(config, "a,b\n") : pending());
    fireEvent.click(screen.getByText(/Download \(1 Results/));
    await waitFor(() => expect(requestTo("/api/download-relog")).toBeDefined());

    const csv = sentParams(requestTo("/api/download-csv"));
    expect(csv.get("query")).toBe(TERM);
    expect(csv.get("includePermissions")).toBe("false");
    expect(csv.get("countryCode")).toBe("US");

    const relog = sentParams(requestTo("/api/download-relog"));
    expect(relog.get("query")).toBe(TERM);
    expect(relog.get("totalCount")).toBe("1");
    expect(relog.get("store")).toBe("Google Play Store");
});

test("per-app reviews and reviews-relog requests carry the full app ID", async () => {
    // columns.js calls DownloadReviews(appId, country) as a plain function inside renderCell.
    const Cell = () => DownloadReviews(APP_ID, "US");
    respond = (config) => (config.url.includes("/api/reviews") ? ok(config, "a,b\n") : pending());
    render(
        <ScraperProvider>
            <Cell />
        </ScraperProvider>,
    );
    fireEvent.click(screen.getByText("Scrape Reviews"));
    await waitFor(() => expect(requestTo("/api/download-reviews-relog")).toBeDefined());

    const reviews = sentParams(requestTo("/api/reviews"));
    expect(reviews.get("appId")).toBe(APP_ID);
    expect(reviews.get("countryCode")).toBe("US");

    const relog = sentParams(requestTo("/api/download-reviews-relog"));
    expect(relog.get("appId")).toBe(APP_ID);
    expect(relog.get("countryCode")).toBe("US");
    expect(relog.get("sorting")).toBe("RECENT");
});
