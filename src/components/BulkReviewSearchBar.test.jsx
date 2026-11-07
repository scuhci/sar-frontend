// Regression tests for the Bulk Reviews flow (search step -> download step).
// Run: CI=true npx react-scripts test --watchAll=false src/components/BulkReviewSearchBar
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import JSZip from "jszip";
import BulkReviewSearchBar from "./BulkReviewSearchBar";
import { ScraperProvider } from "./SelectedScraperProvider";

jest.mock("axios");
jest.mock("jszip");
jest.setTimeout(20000);

// The real grid needs layout APIs jsdom lacks; a plain list of the rows is enough here
jest.mock("@mui/x-data-grid", () => ({
    DataGrid: ({ rows }) => (
        <ul data-testid="grid">
            {rows.map((row) => (
                <li key={row.appId}>{`${row.appId} | ${row.title}`}</li>
            ))}
        </ul>
    ),
}));

// jsdom + nwsapi can throw on some MUI/emotion selectors inside getComputedStyle
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (el, pseudo) => {
    try {
        return originalGetComputedStyle(el, pseudo);
    } catch (e) {
        return { getPropertyValue: () => "", display: "block", visibility: "visible", pointerEvents: "auto" };
    }
};

// jsdom's Blob has no text(); the component uses it to read the CSV responses
if (!Blob.prototype.text) {
    Blob.prototype.text = function () {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.readAsText(this);
        });
    };
}

const app = (appId, extra = {}) => ({
    appId,
    title: `Title ${appId}`,
    icon: "",
    reviews: 10,
    developer: "dev",
    score: 4,
    url: "u",
    genreId: "g",
    ...extra,
});

// Backend-shaped reviews CSV (no trailing newline) whose rows name the app they belong to
const REVIEWS_HEADER = `"reviewID","rating","reviewText","dateScraped"`;
const reviewsCsv = (appId) =>
    `${REVIEWS_HEADER}\n"r1-${appId}","5","great, really",Fri Nov 06 2026\n"r2-${appId}","1","bad",Fri Nov 06 2026`;

// Fake backend. `search(appId)` returns the results array (or throws), `reviews(appId)` returns CSV text (or throws).
let backend;
const mockBackend = (overrides = {}) => {
    backend = {
        search: (appId) => [app(appId)],
        reviews: (appId) => reviewsCsv(appId),
        relog: (params) => `appId: ${params.get("appId")}`,
        ...overrides,
    };
    axios.get.mockImplementation(async (url, config) => {
        const u = new URL("http://x" + url);
        const path = u.pathname.replace(/^\/(api|ios)/, "");
        if (path === "/search") {
            return { data: { totalCount: 1, results: await backend.search(u.searchParams.get("query"), config) } };
        }
        if (path === "/reviews") {
            const text = await backend.reviews(u.searchParams.get("appId"), config);
            return { data: new Blob([text], { type: "text/csv" }) };
        }
        if (path === "/download-reviews-relog") {
            return { data: new Blob([await backend.relog(u.searchParams, config)], { type: "text/plain" }) };
        }
        throw new Error(`unexpected request ${url}`);
    });
};

const Harness = () => {
    const [activeStep, setActiveStep] = React.useState(0);
    return (
        <ScraperProvider>
            <div data-testid="step">{activeStep}</div>
            <BulkReviewSearchBar flipState={() => {}} activeStep={activeStep} setActiveStep={setActiveStep} />
        </ScraperProvider>
    );
};

const renderFor = (store = "Play Store") => {
    localStorage.setItem("selectedScraper", JSON.stringify(store));
    return render(<Harness />);
};

const submit = (text) => {
    fireEvent.change(screen.getByLabelText(/Enter app IDs/i), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: /Scrape (Play|App) Store/ }));
};

const searchFor = async (text) => {
    submit(text);
    await waitFor(() => expect(screen.getByTestId("step")).toHaveTextContent("1"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};

const clickDownload = () => fireEvent.click(screen.getByRole("button", { name: "Scrape and Download Reviews" }));

const requested = (path) =>
    axios.get.mock.calls.map((call) => call[0]).filter((url) => url.replace(/^\/(api|ios)/, "").startsWith(path));

let zipFiles;
const zipEntry = (pattern) => zipFiles.find((f) => pattern.test(f.name));
const csvLines = async () => {
    const text = await zipEntry(/\.csv$/).blob.text();
    return text.replace(/^﻿/, "").split("\n").filter((line) => line !== "");
};

beforeEach(() => {
    zipFiles = [];
    localStorage.clear();
    axios.get.mockReset();
    axios.isCancel = jest.fn((error) => Boolean(error) && error.name === "CanceledError");
    JSZip.mockImplementation(() => ({
        file: (name, blob) => zipFiles.push({ name, blob }),
        generateAsync: jest.fn().mockResolvedValue(new Blob(["zip"])),
    }));
    window.URL.createObjectURL = jest.fn(() => "blob:zip");
    window.URL.revokeObjectURL = jest.fn();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockBackend();
});

afterEach(() => jest.restoreAllMocks());

describe("FTB-02: rows are attributed by appId, not by position", () => {
    test("every combined CSV row is tagged with the app its reviews were fetched for", async () => {
        renderFor();
        await searchFor("com.example.one, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(await csvLines()).toEqual([
            `"appId",${REVIEWS_HEADER}`,
            `"com.example.one","r1-com.example.one","5","great, really",Fri Nov 06 2026`,
            `"com.example.one","r2-com.example.one","1","bad",Fri Nov 06 2026`,
            `"com.example.two","r1-com.example.two","5","great, really",Fri Nov 06 2026`,
            `"com.example.two","r2-com.example.two","1","bad",Fri Nov 06 2026`,
        ]);
    });

    test("a failed search is reported and later apps keep their own reviews", async () => {
        mockBackend({
            search: (appId) => {
                if (appId === "com.bad.app") throw new Error("500");
                return [app(appId)];
            },
        });
        renderFor();
        await searchFor("com.bad.app, com.example.two, com.example.three");

        expect(screen.getByText("2 apps selected")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(/No app found for com\.bad\.app/);

        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(requested("/reviews")).toEqual([
            expect.stringContaining("appId=com.example.two&"),
            expect.stringContaining("appId=com.example.three&"),
        ]);
        const lines = await csvLines();
        expect(lines.slice(1).map((line) => line.split(",").slice(0, 2).join(","))).toEqual([
            `"com.example.two","r1-com.example.two"`,
            `"com.example.two","r2-com.example.two"`,
            `"com.example.three","r1-com.example.three"`,
            `"com.example.three","r2-com.example.three"`,
        ]);
    });

    test("a keyword-search fallback that returns other apps does not stand in for the requested app", async () => {
        // When the ID does not resolve, the backends return keyword results for unrelated apps
        mockBackend({
            search: (appId) => (appId === "com.typo.app" ? [app("com.unrelated.app"), app("com.other.app")] : [app(appId)]),
        });
        renderFor("App Store");
        await searchFor("com.typo.app, com.example.two");

        expect(screen.getByTestId("grid")).toHaveTextContent("com.example.two");
        expect(screen.getByTestId("grid")).not.toHaveTextContent("com.unrelated.app");
        expect(screen.getByRole("alert")).toHaveTextContent(/No app found for com\.typo\.app/);
    });

    test("a search that returns 200 with an empty result list counts as not found", async () => {
        mockBackend({ search: (appId) => (appId === "com.none.app" ? [] : [app(appId)]) });
        renderFor("App Store");
        await searchFor("com.none.app, com.example.two");
        expect(screen.getByText("1 apps selected")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(/No app found for com\.none\.app/);
    });

    test("a failed reviews fetch is reported and the other apps still download with the right appId", async () => {
        mockBackend({
            reviews: (appId) => {
                if (appId === "com.example.one") throw new Error("503");
                return reviewsCsv(appId);
            },
        });
        renderFor();
        await searchFor("com.example.one, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        const lines = await csvLines();
        expect(lines).toHaveLength(3);
        expect(lines.slice(1).every((line) => line.startsWith(`"com.example.two",`))).toBe(true);
        expect(await screen.findByText(/Reviews could not be fetched for com\.example\.one/)).toBeInTheDocument();
    });

    test("when every search fails the user stays on step 1 with an error", async () => {
        mockBackend({
            search: () => {
                throw new Error("500");
            },
        });
        renderFor();
        submit("com.bad.app");
        expect(await screen.findByText(/No app found for: com\.bad\.app/)).toBeInTheDocument();
        expect(screen.getByTestId("step")).toHaveTextContent("0");
    });
});
