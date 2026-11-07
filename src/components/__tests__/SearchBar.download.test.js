import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import SearchBar from "../SearchBar";
import { ScraperProvider, useScraper } from "../SelectedScraperProvider";

jest.mock("axios", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), isCancel: jest.fn(() => false) },
}));

// jsdom/nwsapi: once emotion has injected certain selectors, getComputedStyle() can throw from
// inside MUI's ModalManager when the Loading dialog closes. Fall back to an empty style.
const origGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (el, pseudo) => {
    try {
        return origGetComputedStyle(el, pseudo);
    } catch (e) {
        return new Proxy({}, { get: (_t, p) => (p === "getPropertyValue" ? () => "" : "") });
    }
};

const Gate = ({ children }) => {
    const { selectedScraper } = useScraper();
    return selectedScraper ? children : null;
};

const renderBar = () =>
    render(
        <MemoryRouter>
            <ScraperProvider>
                <Gate>
                    <SearchBar flipState={() => {}} />
                </Gate>
            </ScraperProvider>
        </MemoryRouter>,
    );

// Same as Gate, but also exposes the scraper toggle the way Home.js does via setSelectedScraper.
const ScraperToggleHarness = () => {
    const { selectedScraper, setSelectedScraper } = useScraper();
    if (!selectedScraper) return null;
    return (
        <>
            <button onClick={() => setSelectedScraper("Play Store")}>go-play</button>
            <button onClick={() => setSelectedScraper("App Store")}>go-ios</button>
            <SearchBar flipState={() => {}} />
        </>
    );
};

const renderBarWithScraperToggle = () =>
    render(
        <MemoryRouter>
            <ScraperProvider>
                <ScraperToggleHarness />
            </ScraperProvider>
        </MemoryRouter>,
    );

const app = {
    appId: "com.x",
    title: "X",
    reviews: 10,
    country: "US",
    icon: "",
    developer: "d",
    score: 4,
    url: "u",
    genreId: "SOCIAL",
    available: true,
    offersIAP: false,
    adSupported: false,
    permissions: Array.from({ length: 38 }, () => ({ isPermissionRequired: false })),
};
const okSearch = { data: { results: [app], totalCount: 1 } };
const emptySearch = { data: { results: [], totalCount: 0 } };
const blobResp = { data: new Blob(["a"]), headers: { "content-disposition": 'attachment; filename="x.csv"' } };

const input = () => screen.getByLabelText(/Scrape by keyword/);
const search = async (text) => {
    fireEvent.change(input(), { target: { value: text } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await screen.findByText(`Results for "${text}"`);
    await waitFor(() => expect(document.querySelector(".MuiDialog-root")).toBeNull(), { timeout: 4000 });
};
const clickDownload = () => fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
const downloadCalls = () => axios.get.mock.calls.map((c) => c[0]).filter((u) => u.includes("/download-"));

beforeEach(() => {
    localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
    axios.get.mockReset();
    window.URL.createObjectURL = jest.fn(() => "blob:x");
    window.URL.revokeObjectURL = jest.fn();
});

test("download uses the permissions setting the displayed search was run with, not the current checkbox", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");
    expect(axios.get.mock.calls[0][0]).toContain("includePermissions=false");

    // Toggle the checkbox after the search; the table on screen still has no permission columns.
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toBeChecked();

    axios.get.mockResolvedValue(blobResp);
    clickDownload();
    await waitFor(() => expect(downloadCalls()).toHaveLength(2));
    expect(downloadCalls()[0]).toBe("/api/download-csv?query=com.x&includePermissions=false&countryCode=US");
    expect(downloadCalls()[1]).toBe(
        "/api/download-relog?query=com.x&includePermissions=false&totalCount=1&countryCode=US&store=Google Play Store",
    );
});

test("download uses the country the displayed search was run with, not the current dropdown value", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");
    expect(axios.get.mock.calls[0][0]).toContain("countryCode=US");

    // Change the country after the search.
    const combo = screen.getByRole("combobox", { name: "Country" });
    fireEvent.focus(combo);
    fireEvent.change(combo, { target: { value: "United Kingdom" } });
    fireEvent.keyDown(combo, { key: "ArrowDown" });
    fireEvent.keyDown(combo, { key: "Enter" });
    fireEvent.blur(combo);
    expect(combo.value).toBe("United Kingdom");

    axios.get.mockResolvedValue(blobResp);
    clickDownload();
    await waitFor(() => expect(downloadCalls()).toHaveLength(2));
    expect(downloadCalls()[0]).toBe("/api/download-csv?query=com.x&includePermissions=false&countryCode=US");
    expect(downloadCalls()[1]).toContain("countryCode=US");
});

test("a failed search does not change what the download button fetches", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");

    axios.get.mockRejectedValue({ response: { status: 500 } });
    fireEvent.change(input(), { target: { value: "zzz" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector(".MuiDialog-root")).toBeNull(), { timeout: 4000 });
    expect(screen.getByText('Results for "com.x"')).toBeInTheDocument();

    axios.get.mockResolvedValue(blobResp);
    clickDownload();
    await waitFor(() => expect(downloadCalls()).toHaveLength(2));
    expect(downloadCalls()[0]).toBe("/api/download-csv?query=com.x&includePermissions=false&countryCode=US");
});

test("a failed download shows an error message instead of failing silently", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");

    axios.get.mockRejectedValue({ response: { status: 500 } });
    clickDownload();
    await screen.findByRole("alert");
    expect(screen.getByRole("alert").textContent).toMatch(/download/i);
});

test("a successful download retry clears the 'download failed' alert from the earlier attempt", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");

    axios.get.mockRejectedValue({ response: { status: 500 } });
    clickDownload();
    await screen.findByRole("alert");

    axios.get.mockResolvedValue(blobResp);
    clickDownload();
    await waitFor(() => expect(downloadCalls()).toHaveLength(3));
    await waitFor(() => expect(window.URL.createObjectURL).toHaveBeenCalled());
    // The Snackbar closes with a short exit transition, so wait for the alert to leave the DOM.
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});

test("the 'download failed' alert does not come back after a zero-result search followed by a successful one", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBar();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");

    axios.get.mockRejectedValue({ response: { status: 500 } });
    clickDownload();
    await screen.findByRole("alert");

    // A zero-result search unmounts the results block (and the Snackbar inside it) while the alert is open.
    axios.get.mockResolvedValue(emptySearch);
    fireEvent.change(input(), { target: { value: "nothing" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    await waitFor(() => expect(screen.queryByText(/Results for/)).toBeNull());
    await waitFor(() => expect(document.querySelector(".MuiDialog-root")).toBeNull(), { timeout: 4000 });
    expect(screen.queryByRole("alert")).toBeNull();

    // The next successful search remounts the block; no download was attempted, so no alert may show.
    axios.get.mockResolvedValue(okSearch);
    await search("com.x");
    expect(screen.queryByRole("alert")).toBeNull();
});

test("the 'download failed' alert does not come back after switching scraper and searching again", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderBarWithScraperToggle();
    await screen.findByLabelText(/Scrape by keyword/);
    await search("com.x");

    axios.get.mockRejectedValue({ response: { status: 500 } });
    clickDownload();
    await screen.findByRole("alert");

    fireEvent.click(screen.getByText("go-ios"));
    await waitFor(() => expect(screen.queryByText(/Results for/)).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("go-play"));

    axios.get.mockResolvedValue(okSearch);
    await search("com.x");
    expect(screen.queryByRole("alert")).toBeNull();
});
