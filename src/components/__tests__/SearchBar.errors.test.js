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
const serverError = {
    response: { status: 500, data: { error: "An error occurred while processing your request." } },
};

const input = () => screen.getByLabelText(/Scrape by keyword/);
const search = (term) => {
    fireEvent.change(input(), { target: { value: term } });
    fireEvent.keyDown(input(), { key: "Enter" });
};
const dialogGone = () => waitFor(() => expect(screen.queryByRole("dialog")).toBeNull(), { timeout: 4000 });

beforeEach(() => {
    localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
    // CRA's jest config resets mock implementations before every test, so re-apply the cancel check here
    axios.isCancel.mockImplementation((error) => Boolean(error && error.__CANCEL__));
    axios.get.mockReset();
    axios.post.mockReset();
    window.URL.createObjectURL = jest.fn(() => "blob:x");
    window.URL.revokeObjectURL = jest.fn();
});

test("a failed search shows an error message that includes the server's reason", async () => {
    axios.get.mockRejectedValue(serverError);
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("nothing");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"nothing"');
    expect(alert.textContent).toContain("An error occurred while processing your request.");
});

test("a failed search keeps the previous results and says the new search failed", async () => {
    axios.get.mockResolvedValue(okSearch);
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("com.x");
    await screen.findByText(/Results for "com.x"/);
    await dialogGone();

    axios.get.mockRejectedValue({ response: { status: 504 } });
    search("zzz");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain('"zzz"');
    expect(alert.textContent).toContain("took too long");
    expect(screen.getByText(/Results for "com.x"/)).toBeInTheDocument();
});

test("a search the server cannot reach says so", async () => {
    axios.get.mockRejectedValue({ message: "Network Error" });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("offline");
    await dialogGone();

    expect((await screen.findByRole("alert")).textContent).toContain("Could not reach the server.");
});

test("a network error shows only the network retry hint", async () => {
    axios.get.mockRejectedValue({ message: "Network Error" });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent.trim()).toBe('Search for "bbb" failed: Could not reach the server. Try again later.');
    expect(alert.textContent).not.toContain("No apps may match");
});

test("a 504 error shows only the timeout retry hint", async () => {
    axios.get.mockRejectedValue({ response: { status: 504 } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent.trim()).toBe('Search for "bbb" failed: The search took too long. Try again later.');
    expect(alert.textContent).not.toContain("No apps may match");
});

test("an HTML response shows an unexpected-response error and keeps the search input", async () => {
    axios.get.mockResolvedValue({ data: "<!doctype html><html><body>portal</body></html>" });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent.trim()).toBe('Search for "bbb" failed: The server returned an unexpected response. Try again later.');
    expect(screen.getByLabelText(/Scrape by keyword/)).toBeInTheDocument();
});

test("a JSON response without results shows an unexpected-response error", async () => {
    axios.get.mockResolvedValue({ data: { status: "ok" } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent.trim()).toBe('Search for "bbb" failed: The server returned an unexpected response. Try again later.');
    expect(screen.getByLabelText(/Scrape by keyword/)).toBeInTheDocument();
});

test("an HTML response keeps the previous results", async () => {
    axios.get.mockResolvedValueOnce(okSearch).mockResolvedValueOnce({ data: "<!doctype html><html><body>portal</body></html>" });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("com.x");
    await screen.findByText(/Results for "com.x"/);
    await dialogGone();

    search("zzz");
    await dialogGone();

    expect((await screen.findByRole("alert")).textContent).toContain('Search for "zzz" failed:');
    expect(screen.getByText(/Results for "com.x"/)).toBeInTheDocument();
});

test("a 400 error shows the validation reason without a hint", async () => {
    axios.get.mockRejectedValue({
        response: { status: 400, data: { error: "Search query is missing.\n" } },
    });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent.trim()).toBe('Search for "bbb" failed: Search query is missing.');
});

test("a 500 error includes the no apps hint", async () => {
    axios.get.mockRejectedValue(serverError);
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("bbb");
    await dialogGone();

    expect((await screen.findByRole("alert")).textContent).toContain("No apps may match this term");
});

test("clicking Scrape with an empty field shows a prompt without a request", async () => {
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    fireEvent.click(screen.getByRole("button", { name: "Scrape Play Store" }));

    expect(axios.get).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent.trim()).toBe("Enter a keyword or app ID to search.");
});

test("pressing Enter with whitespace shows a prompt without a request", async () => {
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("   ");

    expect(axios.get).not.toHaveBeenCalled();
    expect((await screen.findByRole("alert")).textContent.trim()).toBe("Enter a keyword or app ID to search.");
});

test("a search that returns no apps shows the no-results state", async () => {
    axios.get.mockResolvedValue({ data: { results: [], totalCount: 0 } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("qwertyuiop");
    await dialogGone();

    await screen.findByText(/No Results Found/);
    expect(screen.queryByRole("alert")).toBeNull();
});

test("the no-results panel names the term it belongs to", async () => {
    axios.get.mockResolvedValue({ data: { results: [], totalCount: 0 } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("aaa");
    await dialogGone();

    expect(await screen.findByRole("heading", { name: 'No Results Found for "aaa"' })).toBeInTheDocument();
});

test("a later failed search leaves the no-results panel labelled with the earlier term", async () => {
    axios.get.mockResolvedValueOnce({ data: { results: [], totalCount: 0 } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("aaa");
    await dialogGone();
    expect(await screen.findByRole("heading", { name: 'No Results Found for "aaa"' })).toBeInTheDocument();

    axios.get.mockRejectedValueOnce({ message: "Network Error" });
    search("bbb");
    await dialogGone();

    expect((await screen.findByRole("alert")).textContent).toContain('"bbb"');
    expect(screen.getByRole("heading", { name: 'No Results Found for "aaa"' })).toBeInTheDocument();
    expect(screen.queryByText("No Results Found", { exact: true })).toBeNull();
});

test("a later cancelled search leaves the no-results panel labelled with the earlier term", async () => {
    axios.get.mockResolvedValueOnce({ data: { results: [], totalCount: 0 } });
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("aaa");
    await dialogGone();
    expect(await screen.findByRole("heading", { name: 'No Results Found for "aaa"' })).toBeInTheDocument();

    axios.get.mockImplementationOnce(
        (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject({ __CANCEL__: true, message: "canceled" }));
            }),
    );
    search("bbb");
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await dialogGone();

    expect(screen.getByRole("heading", { name: 'No Results Found for "aaa"' })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a cancelled search shows no error and a later successful search clears any earlier error", async () => {
    axios.get.mockImplementation(
        (_url, { signal }) =>
            new Promise((_resolve, reject) => {
                signal.addEventListener("abort", () => reject({ __CANCEL__: true, message: "canceled" }));
            }),
    );
    renderSearchBar();
    await screen.findByLabelText(/Scrape by keyword/);

    search("slow");
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: /Cancel/ }));
    await dialogGone();
    expect(screen.queryByRole("alert")).toBeNull();

    axios.get.mockRejectedValue(serverError);
    search("broken");
    await screen.findByRole("alert");

    axios.get.mockResolvedValue(okSearch);
    search("com.x");
    await screen.findByText(/Results for "com.x"/);
    expect(screen.queryByRole("alert")).toBeNull();
});
