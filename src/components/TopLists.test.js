import React from "react";
import { render, screen, fireEvent, within, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import axios from "axios";
import TopLists from "./TopLists";
import ExampleTopCharts from "./ExampleTopCharts";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";
import { gplayCountries, iosCountries } from "../constants/countryCodes";

jest.mock("axios");

// jsdom's selector engine throws on some emotion/MUI selectors while MUI's modal code reads
// computed styles; swallow that so the Select menus and the loading dialog can open.
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) => {
    try {
        return originalGetComputedStyle(element, pseudo);
    } catch (error) {
        return { getPropertyValue: () => "" };
    }
};

// In the app the provider already holds the chosen store when /toplists mounts, so only
// render TopLists once the provider has read the store back from localStorage.
const WhenStoreChosen = ({ children }) => {
    const { selectedScraper } = useScraper();
    return selectedScraper ? children : null;
};

const renderTopLists = async (scraper, state) => {
    localStorage.setItem("selectedScraper", JSON.stringify(scraper));
    render(
        <MemoryRouter initialEntries={[{ pathname: "/toplists", state }]}>
            <ScraperProvider>
                <WhenStoreChosen>
                    <TopLists flipState={() => {}} />
                </WhenStoreChosen>
            </ScraperProvider>
        </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Search" });
};

// Each MUI Select renders a combobox named after its InputLabel ("Collection*", "Device*", ...).
const select = (label) => screen.getByRole("combobox", { name: label });
const shown = (label) => select(label).textContent.replace(/​/g, "").trim();

const openSelect = (label) => {
    fireEvent.mouseDown(select(label));
    return screen.getByRole("listbox");
};

const optionNames = (label) => {
    const listbox = openSelect(label);
    const names = within(listbox).getAllByRole("option").map((option) => option.textContent);
    fireEvent.keyDown(listbox, { key: "Escape" });
    return names;
};

const pick = async (label, optionName) => {
    fireEvent.click(within(openSelect(label)).getByRole("option", { name: optionName }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
};

const lastRequest = () => axios.get.mock.calls[axios.get.mock.calls.length - 1][0];

beforeEach(() => {
    localStorage.clear();
    // CRA runs jest with resetMocks, so the implementations are set per test.
    axios.get.mockImplementation(() => new Promise(() => {}));
    axios.isCancel = jest.fn(() => false);
    jest.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe("Home 'Fetch Top Charts' buttons", () => {
    const StateProbe = () => <pre data-testid="state">{JSON.stringify(useLocation().state)}</pre>;

    test.each([
        ["Top Free", "topfreeapplications"],
        ["Top Paid", "toppaidapplications"],
        ["Top Grossing", "topgrossingapplications"],
    ])("App Store '%s' opens the iOS chart %s", (label, expected) => {
        render(
            <MemoryRouter initialEntries={["/"]}>
                <Routes>
                    <Route path="/" element={<ExampleTopCharts selectedScraper="App Store" />} />
                    <Route path="/toplists" element={<StateProbe />} />
                </Routes>
            </MemoryRouter>,
        );
        fireEvent.click(screen.getByRole("button", { name: label }));
        expect(JSON.parse(screen.getByTestId("state").textContent).collectionState).toBe(expected);
    });

    test("TopLists lands on the handed-in iOS chart and requests it", async () => {
        await renderTopLists("App Store", { collectionState: "toppaidapplications", selectedScraper: "App Store" });

        expect(shown("Device*")).toBe("iOS");
        expect(shown("Collection*")).toBe("Top Paid iOS Apps");

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(lastRequest()).toMatch(/^\/ios\/toplists\?collection=toppaidapplications&/);
    });

    test("an App Store collection handed in for another device selects that device", async () => {
        await renderTopLists("App Store", { collectionState: "topfreemacapps", selectedScraper: "App Store" });

        expect(shown("Device*")).toBe("Mac");
        expect(shown("Collection*")).toBe("Top Free Mac Apps");
    });

    test("changing the device still switches to that device's default collection", async () => {
        await renderTopLists("App Store");

        await pick("Device*", "iPad");
        expect(shown("Device*")).toBe("iPad");
        expect(shown("Collection*")).toBe("Top Free iPad Apps");
    });

    test("Play Store buttons are unchanged", async () => {
        await renderTopLists("Play Store", { collectionState: "TOP_PAID", selectedScraper: "Play Store" });

        expect(screen.queryByRole("combobox", { name: "Device*" })).toBeNull();
        expect(shown("Collection*")).toBe("Top Paid");
    });
});

describe("Top Charts country select", () => {
    test("App Store offers only countries with an Apple storefront", async () => {
        await renderTopLists("App Store");

        const names = optionNames("Country*");
        expect(names).toEqual(iosCountries.map(({ name }) => name));
        expect(names).toContain("Japan");
        expect(names).not.toContain("Afghanistan");
    });

    test("Play Store still offers every Google Play country", async () => {
        await renderTopLists("Play Store");

        expect(optionNames("Country*")).toEqual(gplayCountries.map(({ name }) => name));
    });

    test("App Store search sends and labels the chosen storefront", async () => {
        await renderTopLists("App Store");
        await pick("Country*", "Japan");

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(lastRequest()).toMatch(/^\/ios\/toplists\?.*&country=JP&/);
        expect((await screen.findByRole("dialog")).textContent).toMatch(/in Japan\.\.\./);
    });
});

describe("Top Charts loading dialog and result heading", () => {
    // The Play Store grid calls .toString() on these columns, so every fake row needs them.
    const fakeApp = (appId, reviews) => ({
        appId,
        title: appId,
        reviews,
        available: true,
        offersIAP: false,
        adSupported: false,
        downloadable: true,
    });

    // Returns the dialog text while the request is pending, then the heading once it resolves.
    const searchAndResolve = async () => {
        let resolveRequest;
        axios.get.mockImplementation(() => new Promise((resolve) => (resolveRequest = resolve)));
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        const dialogText = (await screen.findByRole("dialog")).textContent;
        await act(async () => {
            resolveRequest({ data: { totalCount: 2, results: [fakeApp("a.b", 5), fakeApp("c.d", 3)] } });
        });
        const headingText = (await screen.findByText(/Results for/)).textContent;
        return { dialogText, headingText };
    };

    test("App Store names the App Store collection", async () => {
        await renderTopLists("App Store");
        const { dialogText, headingText } = await searchAndResolve();

        expect(dialogText).toContain("Scraping data for Top Free iOS Apps in United States...");
        expect(headingText).toBe("2 Results for Top Free iOS Apps in United States");
    });

    test("App Store folds the category into the collection name", async () => {
        await renderTopLists("App Store");
        await pick("Category*", "Games");
        const { dialogText, headingText } = await searchAndResolve();

        expect(dialogText).toContain("Scraping data for Top Free iOS Games Apps in United States...");
        expect(headingText).toBe("2 Results for Top Free iOS Games Apps in United States");
    });

    test("Play Store wording is unchanged", async () => {
        await renderTopLists("Play Store");
        await pick("Category*", "Puzzle Games");
        const { dialogText, headingText } = await searchAndResolve();

        expect(dialogText).toContain("Scraping data for Top Free Puzzle Games Apps in United States...");
        expect(headingText).toBe("2 Results for Top Free Puzzle Games Apps in United States");
    });
});

describe("App Store device change", () => {
    test("drops a category the new device's collection does not offer", async () => {
        await renderTopLists("App Store");
        await pick("Category*", "Books");

        // Books is not offered for Top Mac Apps
        await pick("Device*", "Mac");
        expect(shown("Collection*")).toBe("Top Mac Apps");
        expect(shown("Category*")).toBe("");

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(lastRequest()).toMatch(/^\/ios\/toplists\?collection=topmacapps&category=&/);
    });

    test("resets the category on every device change, like a collection change", async () => {
        await renderTopLists("App Store");
        await pick("Category*", "Books");

        await pick("Device*", "iPad");
        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        expect(lastRequest()).toBe(
            "/ios/toplists?collection=topfreeipadapplications&category=&categoryName=&country=US&includePermissions=false",
        );
    });
});
