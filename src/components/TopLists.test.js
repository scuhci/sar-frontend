import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import axios from "axios";
import TopLists from "./TopLists";
import ExampleTopCharts from "./ExampleTopCharts";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";

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
