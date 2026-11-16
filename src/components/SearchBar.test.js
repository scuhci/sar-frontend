import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import { MemoryRouter } from "react-router-dom";
import SearchBar from "./SearchBar";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";

jest.mock("axios", () => ({
    get: jest.fn(),
    isCancel: jest.fn(() => false),
}));

// Small helper so the test can switch stores the way the header toggle does.
const ScraperSwitch = () => {
    const { setSelectedScraper } = useScraper();
    return (
        <>
            <button onClick={() => setSelectedScraper("Play Store")}>use-play</button>
            <button onClick={() => setSelectedScraper("App Store")}>use-ios</button>
        </>
    );
};

const renderSearchBar = () =>
    render(
        <MemoryRouter>
            <ScraperProvider>
                <ScraperSwitch />
                <SearchBar flipState={() => {}} />
            </ScraperProvider>
        </MemoryRouter>,
    );

const permissionsCheckbox = () => screen.getByLabelText(/include permissions in scrape/i);

const lastSearchUrl = () => {
    const calls = axios.get.mock.calls;
    return calls[calls.length - 1][0];
};

beforeEach(() => {
    localStorage.clear();
    axios.get.mockReset();
    axios.get.mockResolvedValue({ data: { results: [], totalCount: 0 } });
});

test("permissions checkbox stays in sync with the request after switching stores", async () => {
    renderSearchBar();

    fireEvent.click(permissionsCheckbox());
    expect(permissionsCheckbox()).toBeChecked();

    // Toggle to the App Store (checkbox unmounts) and back.
    fireEvent.click(screen.getByText("use-ios"));
    expect(screen.queryByLabelText(/include permissions in scrape/i)).toBeNull();
    fireEvent.click(screen.getByText("use-play"));

    const checkedAfterSwitch = permissionsCheckbox().checked;

    fireEvent.change(screen.getByRole("textbox", { name: /scrape by keyword/i }), {
        target: { value: "puzzle" },
    });
    fireEvent.click(screen.getByRole("button", { name: /scrape play store/i }));

    await waitFor(() => expect(axios.get).toHaveBeenCalled());
    expect(lastSearchUrl()).toContain(`includePermissions=${checkedAfterSwitch}`);

    // Wait for the loading dialog to close so the form is interactive again.
    const scrapeButton = await screen.findByRole("button", { name: /scrape play store/i });

    // A further click must flip both the box and the request together.
    fireEvent.click(permissionsCheckbox());
    const checkedAfterClick = permissionsCheckbox().checked;
    expect(checkedAfterClick).toBe(!checkedAfterSwitch);

    fireEvent.click(scrapeButton);
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    expect(lastSearchUrl()).toContain(`includePermissions=${checkedAfterClick}`);
});
