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
                <li key={row.appId}>{`${row.appId} | ${row.title} | ${row.category ?? "-"}`}</li>
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
// Raw CSV text without the BOM, and its non-empty lines
const csvText = async () => (await zipEntry(/\.csv$/).blob.text()).replace(/^﻿/, "");
const csvLines = async () => (await csvText()).split(/\r?\n/).filter((line) => line !== "");

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
        expect(screen.getByRole("alert")).toHaveTextContent(/Could not look up com\.bad\.app/);
        expect(screen.getByRole("alert")).not.toHaveTextContent("No app found");

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
        expect(await screen.findByText(/Could not look up: com\.bad\.app/)).toBeInTheDocument();
        expect(screen.queryByText(/No app found/)).toBeNull();
        expect(screen.getByTestId("step")).toHaveTextContent("0");
    });
});

describe("FTB-08: an app with no reviews does not set the CSV header", () => {
    test("the header comes from the first app that has reviews", async () => {
        // The backends return a header-only CSV for an app with zero reviews
        mockBackend({ reviews: (appId) => (appId === "com.empty.app" ? `"dateScraped"` : reviewsCsv(appId)) });
        renderFor();
        await searchFor("com.empty.app, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        const lines = await csvLines();
        expect(lines[0]).toBe(`"appId",${REVIEWS_HEADER}`);
        expect(lines).toHaveLength(3);
        lines.slice(1).forEach((line) => expect(line.startsWith(`"com.example.two",`)).toBe(true));
    });

    test("when no app has reviews the file is header-only", async () => {
        mockBackend({ reviews: () => `"dateScraped"` });
        renderFor();
        await searchFor("com.empty.one, com.empty.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(await csvLines()).toEqual([`"appId","dateScraped"`]);
    });
});

describe("FTB-05: no sort control the backends ignore", () => {
    test("step 2 states the real order and offers no sort dropdown", async () => {
        renderFor();
        await searchFor("com.example.one");
        expect(screen.queryByLabelText("Sort Reviews By")).toBeNull();
        expect(screen.getByText(/Reviews are collected newest first/)).toBeInTheDocument();
    });

    test("the reviews request carries no sortBy parameter", async () => {
        renderFor();
        await searchFor("com.example.one");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(requested("/reviews")).toEqual(["/api/reviews?appId=com.example.one&countryCode=US"]);
    });
});

describe("FTB-06: reproducibility log and per-store review cap", () => {
    test("App Store step 2 uses the 500-per-app cap", async () => {
        mockBackend({ search: (appId) => [app(appId, { reviews: 2000 })] });
        renderFor("App Store");
        await searchFor("com.openai.chat");
        expect(screen.getByText(/Total 500 Reviews/)).toBeInTheDocument();
        expect(screen.getByText(/scraping limited to 500 per app/)).toBeInTheDocument();
    });

    test("Play Store step 2 keeps the 10,000-per-app cap", async () => {
        mockBackend({ search: (appId) => [app(appId, { reviews: 20000 })] });
        renderFor("Play Store");
        await searchFor("com.facebook.katana");
        expect(screen.getByText(/Total 10000 Reviews/)).toBeInTheDocument();
        expect(screen.getByText(/scraping limited to 10,000 per app/)).toBeInTheDocument();
    });

    test("the zip holds one reproducibility log covering every downloaded app", async () => {
        renderFor("App Store");
        await searchFor("com.google.ios.youtube, com.google.OPA");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        const relogUrls = requested("/download-reviews-relog");
        expect(relogUrls).toHaveLength(2);
        expect(relogUrls[0]).toBe(
            "/ios/download-reviews-relog?appId=com.google.ios.youtube&countryCode=US&store=iOS App Store&sorting=RECENT"
        );
        const relog = zipEntry(/_reproducibility_log\.txt$/);
        expect(relog).toBeDefined();
        expect(relog.blob).toContain("appId: com.google.ios.youtube");
        expect(relog.blob).toContain("appId: com.google.OPA");
        const requestUrls = axios.get.mock.calls.map((call) => call[0]);
        for (const appId of ["com.google.ios.youtube", "com.google.OPA"]) {
            const reviewsIndex = requestUrls.findIndex((url) => url.includes(`/reviews?appId=${appId}&`));
            const relogIndex = requestUrls.findIndex((url) => url.includes(`/download-reviews-relog?appId=${appId}&`));
            expect(reviewsIndex).toBeGreaterThanOrEqual(0);
            expect(reviewsIndex).toBeLessThan(relogIndex);
        }
    });

    test("the log lists the IDs that were requested but left out", async () => {
        mockBackend({
            search: (appId) => {
                if (appId === "com.missing.app") return [];
                if (appId === "com.down.app") throw new Error("Network Error");
                return [app(appId)];
            },
            reviews: (appId) => {
                if (appId === "com.example.one") throw new Error("503");
                return reviewsCsv(appId);
            },
        });
        renderFor("Play Store");
        await searchFor("com.missing.app, com.down.app, com.example.one, com.example.two, com.example.three");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        const log = zipEntry(/_reproducibility_log\.txt$/).blob;
        expect(log).toContain("appId: com.example.two");
        expect(log).toContain("appId: com.example.three");
        expect(log).toMatch(
            /\n\nRequested but not included in this download:\nNo app found: com\.missing\.app\nApp lookup failed: com\.down\.app\nReviews could not be fetched: com\.example\.one$/
        );
    });

    test("the log has no left-out section when everything downloaded", async () => {
        renderFor("Play Store");
        await searchFor("com.example.one, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(zipEntry(/_reproducibility_log\.txt$/).blob).not.toContain("Requested but not included");
    });

    test("a failed log request still downloads the reviews", async () => {
        mockBackend({
            relog: () => {
                throw new Error("500");
            },
        });
        renderFor();
        await searchFor("com.example.one");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(await csvLines()).toHaveLength(3);
        expect(zipEntry(/_reproducibility_log\.txt$/).blob).toContain("could not be generated");
    });
});

describe("FTB-07: Cancel and store switching", () => {
    // A request that only settles when its signal aborts, like axios does
    const pendingUntilAborted = (config) =>
        new Promise((_resolve, reject) => {
            config?.signal?.addEventListener("abort", () =>
                reject(Object.assign(new Error("canceled"), { name: "CanceledError" }))
            );
        });

    const { useScraper } = jest.requireActual("./SelectedScraperProvider");
    const StoreSwitch = () => {
        const { setSelectedScraper } = useScraper();
        return <button onClick={() => setSelectedScraper("App Store")}>switch store</button>;
    };
    const SwitchHarness = () => {
        const [activeStep, setActiveStep] = React.useState(0);
        return (
            <ScraperProvider>
                <StoreSwitch />
                <div data-testid="step">{activeStep}</div>
                <BulkReviewSearchBar flipState={() => {}} activeStep={activeStep} setActiveStep={setActiveStep} />
            </ScraperProvider>
        );
    };

    test("Cancel during the search stops the remaining searches and stays on step 1", async () => {
        // Each search answers after 100 ms unless its request is aborted first
        mockBackend({
            search: (appId, config) =>
                Promise.race([
                    pendingUntilAborted(config),
                    new Promise((resolve) => setTimeout(() => resolve([app(appId)]), 100)),
                ]),
        });
        renderFor();
        submit("com.example.one, com.example.two, com.example.three");
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(requested("/search")).toHaveLength(1);
        expect(screen.getByTestId("step")).toHaveTextContent("0");
    });

    test("Cancel during the review fetch does not download a partial file", async () => {
        mockBackend({
            reviews: (appId, config) => (appId === "com.example.two" ? pendingUntilAborted(config) : reviewsCsv(appId)),
        });
        renderFor();
        await searchFor("com.example.one, com.example.two, com.example.three");
        clickDownload();
        await waitFor(() => expect(requested("/reviews")).toHaveLength(2));
        fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
        expect(requested("/reviews")).toHaveLength(2);
        expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    });

    test("switching store on step 2 returns to the search step", async () => {
        localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
        render(<SwitchHarness />);
        await searchFor("com.example.one");
        fireEvent.click(screen.getByRole("button", { name: "switch store" }));
        await waitFor(() => expect(screen.getByTestId("step")).toHaveTextContent("0"));
        expect(screen.queryByRole("button", { name: "Scrape and Download Reviews" })).toBeNull();
    });

    test("leaving the page during the download stops the remaining requests and the zip", async () => {
        let resolveFirstReview;
        const firstReview = new Promise((resolve) => {
            resolveFirstReview = resolve;
        });
        mockBackend({
            reviews: (appId, config) =>
                appId === "com.example.one"
                    ? Promise.race([pendingUntilAborted(config), firstReview])
                    : reviewsCsv(appId),
        });
        const view = renderFor();
        await searchFor("com.example.one, com.example.two, com.example.three");
        clickDownload();
        await waitFor(() => expect(requested("/reviews")).toHaveLength(1));
        const firstReviewCall = axios.get.mock.calls.find((call) => call[0].startsWith("/api/reviews"));
        view.unmount();
        resolveFirstReview(reviewsCsv("com.example.one"));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(firstReviewCall[1].signal.aborted).toBe(true);
        expect(requested("/reviews")).toHaveLength(1);
        expect(requested("/download-reviews-relog")).toHaveLength(0);
        expect(window.URL.createObjectURL).not.toHaveBeenCalled();
    });

    test("switching store during the download stops it", async () => {
        mockBackend({ reviews: (_appId, config) => pendingUntilAborted(config) });
        localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
        render(<SwitchHarness />);
        await searchFor("com.example.one, com.example.two, com.example.three");
        clickDownload();
        await waitFor(() => expect(requested("/reviews")).toHaveLength(1));
        fireEvent.click(screen.getByRole("button", { name: "switch store", hidden: true }));
        await waitFor(() => expect(screen.getByTestId("step")).toHaveTextContent("0"));
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(requested("/reviews")).toHaveLength(1);
        expect(window.URL.createObjectURL).not.toHaveBeenCalled();
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    });
});

describe("FTB-09: app ID validation", () => {
    const queriesSent = () => requested("/search").map((url) => new URL("http://x" + url).searchParams.get("query"));

    test("accepts real Play package names and App Store bundle IDs", async () => {
        renderFor("App Store");
        await searchFor("com.ea.game.pvz2_row, com.my-company.app, org.3dsystems.app");
        expect(queriesSent()).toEqual(["com.ea.game.pvz2_row", "com.my-company.app", "org.3dsystems.app"]);
    });

    test("ignores a trailing comma and repeated IDs", async () => {
        renderFor();
        await searchFor("com.example.one, com.example.one, ");
        expect(queriesSent()).toEqual(["com.example.one"]);
    });

    test.each(["284882215", "not a package", "com..app", "single"])("rejects %p before sending a request", async (id) => {
        renderFor();
        submit(`com.example.one, ${id}`);
        expect(await screen.findByText(new RegExp(`Invalid app ID: ${id.replace(/\./g, "\\.")}`))).toBeInTheDocument();
        expect(axios.get).not.toHaveBeenCalled();
    });
});

describe("Failed lookups are not reported as missing apps", () => {
    test("a 502 on one ID is reported as a lookup failure, not as a missing app", async () => {
        mockBackend({
            search: (appId) => {
                if (appId === "com.b.two") {
                    throw Object.assign(new Error("Request failed with status code 502"), { response: { status: 502 } });
                }
                return [app(appId)];
            },
        });
        renderFor();
        await searchFor("com.a.one, com.b.two");

        expect(screen.getByText("1 apps selected")).toBeInTheDocument();
        expect(screen.getAllByRole("alert")).toHaveLength(1);
        expect(screen.getByRole("alert")).toHaveTextContent(/Could not look up com\.b\.two/);
        expect(screen.queryByText(/No app found/)).toBeNull();
    });

    test("a network error on every ID keeps the user on step 1 without calling the app missing", async () => {
        mockBackend({ search: () => { throw new Error("Network Error"); } });
        renderFor();
        submit("com.a.one");

        expect(await screen.findByText(/Could not look up: com\.a\.one/)).toBeInTheDocument();
        expect(screen.queryByText(/No app found/)).toBeNull();
        expect(screen.getByTestId("step")).toHaveTextContent("0");
    });

    test("a missing app and a failed lookup are reported separately", async () => {
        mockBackend({
            search: (appId) => {
                if (appId === "com.none.app") return [];
                if (appId === "com.down.app") throw new Error("Network Error");
                return [app(appId)];
            },
        });
        renderFor();
        await searchFor("com.none.app, com.down.app, com.example.two");

        const alerts = screen.getAllByRole("alert");
        expect(alerts).toHaveLength(2);
        expect(alerts.find((alert) => /No app found/.test(alert.textContent))).toHaveTextContent(/No app found for com\.none\.app\./);
        expect(alerts.find((alert) => /Could not look up/.test(alert.textContent))).toHaveTextContent(/Could not look up com\.down\.app/);
    });

    test("when nothing resolves the step 1 error names both kinds", async () => {
        mockBackend({
            search: (appId) => {
                if (appId === "com.none.app") return [];
                throw new Error("Network Error");
            },
        });
        renderFor();
        submit("com.none.app, com.down.app");

        const error = await screen.findByText(/No app found for: com\.none\.app\./);
        expect(error).toHaveTextContent("Could not look up: com.down.app.");
    });
});

describe("IDs that differ only in letter case", () => {
    test("two spellings of one bundle ID select the app once", async () => {
        mockBackend({ search: () => [app("com.facebook.Messenger")] });
        renderFor("App Store");
        await searchFor("com.facebook.Messenger, com.facebook.messenger");

        expect(screen.getByText("1 apps selected")).toBeInTheDocument();
        expect(screen.getByTestId("grid").querySelectorAll("li")).toHaveLength(1);
        expect(screen.queryByRole("alert")).toBeNull();

        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(requested("/reviews")).toEqual(["/ios/reviews?appId=com.facebook.Messenger&countryCode=US"]);
        const lines = await csvLines();
        expect(lines).toHaveLength(3);
        expect(lines[1]).not.toBe(lines[2]);
    });

    test("a differently-cased ID keeps the store's spelling", async () => {
        mockBackend({ search: () => [app("com.facebook.Messenger")] });
        renderFor("App Store");
        await searchFor("com.facebook.messenger");

        expect(screen.getByTestId("grid")).toHaveTextContent("com.facebook.Messenger");

        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(requested("/reviews")).toEqual(["/ios/reviews?appId=com.facebook.Messenger&countryCode=US"]);
        const lines = await csvLines();
        expect(lines.slice(1).every((line) => line.startsWith(`"com.facebook.Messenger",`))).toBe(true);
    });
});

describe("Category column", () => {
    test("an App Store app shows its primaryGenre", async () => {
        // Shape of a real /ios/search result: genreIds and primaryGenre, no genreId
        const { genreId, ...iosApp } = app("com.burbn.instagram", {
            genreIds: ["6008", "6005"],
            primaryGenre: "Photo & Video",
        });
        mockBackend({ search: () => [iosApp] });
        renderFor("App Store");
        await searchFor("com.burbn.instagram");
        expect(screen.getByTestId("grid")).toHaveTextContent("com.burbn.instagram | Title com.burbn.instagram | Photo & Video");
    });

    test("a Play Store app still shows its genreId", async () => {
        mockBackend({ search: (appId) => [app(appId, { genre: "Social", genreId: "SOCIAL" })] });
        renderFor();
        await searchFor("com.instagram.android");
        expect(screen.getByTestId("grid")).toHaveTextContent("| SOCIAL");
    });
});

describe("Combined CSV line endings", () => {
    test("CRLF input from the backend gives CRLF-only output", async () => {
        mockBackend({ reviews: (appId) => reviewsCsv(appId).replace(/\n/g, "\r\n") });
        renderFor();
        await searchFor("com.example.one, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());

        const text = await csvText();
        expect(text.match(/(?<!\r)\n/g)).toBeNull();
        expect(text).not.toContain("\r\r");
        expect(text.match(/\r\n/g)).toHaveLength(5);
        const lines = await csvLines();
        expect(lines).toHaveLength(5);
        expect(lines.every((line) => !line.endsWith("\r"))).toBe(true);
    });

    test("LF input stays LF, as before", async () => {
        renderFor();
        await searchFor("com.example.one, com.example.two");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());

        const expectedLines = [
            `"appId",${REVIEWS_HEADER}`,
            `"com.example.one","r1-com.example.one","5","great, really",Fri Nov 06 2026`,
            `"com.example.one","r2-com.example.one","1","bad",Fri Nov 06 2026`,
            `"com.example.two","r1-com.example.two","5","great, really",Fri Nov 06 2026`,
            `"com.example.two","r2-com.example.two","1","bad",Fri Nov 06 2026`,
        ];
        expect(await csvText()).toBe(`${expectedLines.join("\n")}\n`);
    });
});

describe("Back from step 2", () => {
    test("the chosen country survives Back and is used for the next search and the reviews", async () => {
        renderFor();
        const countryBox = screen.getByLabelText("Country");
        fireEvent.focus(countryBox);
        fireEvent.change(countryBox, { target: { value: "Japan" } });
        fireEvent.click(await screen.findByRole("option", { name: "Japan" }));
        fireEvent.blur(countryBox);

        await searchFor("com.x.app");
        expect(requested("/search")).toEqual(["/api/search?query=com.x.app&countryCode=JP"]);
        expect(screen.getByText(/Country: JP/)).toBeInTheDocument();

        fireEvent.click(screen.getByRole("button", { name: "Back" }));
        await waitFor(() => expect(screen.getByTestId("step")).toHaveTextContent("0"));
        expect(screen.getByLabelText("Country")).toHaveValue("Japan");
        expect(screen.getByLabelText(/Enter app IDs/i)).toHaveValue("com.x.app");

        await searchFor("com.x.app");
        expect(requested("/search")[1]).toBe("/api/search?query=com.x.app&countryCode=JP");
        clickDownload();
        await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
        expect(requested("/reviews")).toEqual(["/api/reviews?appId=com.x.app&countryCode=JP"]);
    });
});
