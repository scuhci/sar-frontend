import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import axios from "axios";
import DownloadReviews from "./DownloadReviews";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";

jest.mock("axios", () => ({
    __esModule: true,
    default: {
        get: jest.fn(),
        isCancel: jest.fn(),
    },
}));

// jsdom + emotion: getComputedStyle can throw from inside MUI's ModalManager when a Dialog closes.
const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) => {
    try {
        return originalGetComputedStyle(element, pseudo);
    } catch (e) {
        return { getPropertyValue: () => "" };
    }
};

// DownloadReviews is called as a function from a DataGrid renderCell, so wrap it the same way here.
const Cell = () => DownloadReviews("com.x", "US");
const Gate = ({ children }) => {
    const { selectedScraper } = useScraper();
    return selectedScraper ? children : null;
};
const renderCell = () =>
    render(
        <ScraperProvider>
            <Gate>
                <Cell />
            </Gate>
        </ScraperProvider>,
    );

// The Tooltip gives the button its aria-label, so find it by its visible text.
const scrapeButton = async () => (await screen.findByText("Scrape Reviews")).closest("button");
const dialogGone = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 4000 });

beforeEach(() => {
    localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
    // CRA's jest config resets mock implementations before every test, so re-apply the cancel check here
    axios.isCancel.mockImplementation((error) => Boolean(error && error.__CANCEL__));
    axios.get.mockReset();
    window.URL.createObjectURL = jest.fn(() => "blob:x");
    window.URL.revokeObjectURL = jest.fn();
});

test("a failed review scrape shows an error with the app id instead of failing silently", async () => {
    axios.get.mockRejectedValue({ response: { status: 504 } });
    renderCell();

    fireEvent.click(await scrapeButton());
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("com.x");
    expect(alert.textContent).toMatch(/failed/);
});

test("cancelling a review scrape shows no error", async () => {
    axios.get.mockImplementation(
        (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject({ __CANCEL__: true, message: "canceled" }));
            }),
    );
    renderCell();

    fireEvent.click(await scrapeButton());
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await dialogGone();

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("alert")).toBeNull();
});
