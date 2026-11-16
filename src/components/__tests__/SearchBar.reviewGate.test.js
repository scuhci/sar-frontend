import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import SearchBar from "../SearchBar";
import { ScraperProvider, useScraper } from "../SelectedScraperProvider";

jest.mock("axios", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        post: jest.fn(),
        isCancel: jest.fn(),
    },
}));

jest.mock("../Loading", () => () => null);

// jsdom + emotion: getComputedStyle can throw from inside MUI's ModalManager when a Dialog closes.
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) => {
    try {
        return originalGetComputedStyle(element, pseudo);
    } catch (e) {
        return { getPropertyValue: () => "" };
    }
};

// SearchBar reads selectedScraper from context; the provider resolves it from localStorage on mount.
const Gate = ({ children }) => {
    const { selectedScraper } = useScraper();
    return selectedScraper ? children : null;
};

const renderSearchBar = () =>
    render(
        <MemoryRouter>
            <ScraperProvider>
                <Gate>
                    <SearchBar flipState={() => {}} />
                </Gate>
            </ScraperProvider>
        </MemoryRouter>,
    );

const app = (reviews) => ({
    appId: "com.example.same",
    title: "Same App",
    reviews,
    country: "US",
    icon: "",
    developer: "Example",
    score: 4,
    url: "https://example.com",
    genreId: "SOCIAL",
    available: true,
    offersIAP: false,
    adSupported: false,
    permissions: Array.from({ length: 38 }, () => ({ isPermissionRequired: false })),
});

const input = () => screen.getByLabelText(/Scrape by keyword/);
const search = (term) => {
    fireEvent.change(input(), { target: { value: term } });
    fireEvent.keyDown(input(), { key: "Enter" });
};
const scrapeButton = () => screen.getByText("Scrape Reviews").closest("button");

beforeEach(() => {
    localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
    axios.isCancel.mockImplementation((error) => Boolean(error && error.__CANCEL__));
    axios.get.mockReset();
    axios.post.mockReset();
});

describe.each(["Play Store", "App Store"])("%s", (store) => {
    beforeEach(() => {
        localStorage.setItem("selectedScraper", JSON.stringify(store));
    });

    test.each([
        [4200, 4300],
        [250000, 4200],
        [4200, 250000],
        [4200, 0],
        [0, 4200],
    ])("keeps the page mounted and the Scrape Reviews button in sync when the same app goes from %i to %i reviews", async (initialCount, nextCount) => {
        axios.get.mockResolvedValueOnce({ data: { results: [app(initialCount)], totalCount: 1 } });
        renderSearchBar();
        await screen.findByLabelText(/Scrape by keyword/);

        search("first query");
        await screen.findByText(/Results for "first query"/);
        expect(scrapeButton().disabled).toBe(initialCount <= 0);

        axios.get.mockResolvedValueOnce({ data: { results: [app(nextCount)], totalCount: 1 } });
        search("second query");
        await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
        await screen.findByText(/Results for "second query"/);

        expect(screen.getByText(/Results for "second query"/)).toBeInTheDocument();
        expect(input()).toBeInTheDocument();
        await waitFor(() => expect(scrapeButton().disabled).toBe(nextCount <= 0));
    });

    test("keeps Scrape Reviews enabled for apps with 29684781 reviews", async () => {
        axios.get.mockResolvedValueOnce({ data: { results: [app(29684781)], totalCount: 1 } });
        renderSearchBar();
        await screen.findByLabelText(/Scrape by keyword/);

        search("popular app");
        await screen.findByText(/Results for "popular app"/);

        expect(scrapeButton().disabled).toBe(false);
    });
});
