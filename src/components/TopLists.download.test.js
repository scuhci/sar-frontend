import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import TopLists from "./TopLists";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";

jest.mock("axios");

jest.mock("@mui/x-data-grid", () => {
    const React = require("react");
    return {
        DataGrid: ({ rows, columns }) => {
            const reviewsColumn = columns.find((column) => column.field === "reviews");
            return (
                <div>
                    {rows.map((row) => (
                        <div key={row.appId}>
                            <span data-testid="row-app-id">{row.appId}</span>
                            {reviewsColumn && reviewsColumn.renderCell ? (
                                <span data-testid="row-reviews" data-reviews={JSON.stringify(row.reviews)}>
                                    {reviewsColumn.renderCell({ value: row.reviews, row })}
                                </span>
                            ) : (
                                <span data-testid="row-reviews">{JSON.stringify(row.reviews)}</span>
                            )}
                        </div>
                    ))}
                </div>
            );
        },
    };
});

const originalGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = (element, pseudo) => {
    try {
        return originalGetComputedStyle(element, pseudo);
    } catch (error) {
        return { getPropertyValue: () => "" };
    }
};

const SwitchStore = () => {
    const { setSelectedScraper } = useScraper();
    return <button onClick={() => setSelectedScraper("App Store")}>Switch to App Store</button>;
};

const renderTopLists = async (scraper = "Play Store") => {
    localStorage.setItem("selectedScraper", JSON.stringify(scraper));
    render(
        <MemoryRouter initialEntries={["/toplists"]}>
            <ScraperProvider>
                <SwitchStore />
                <TopLists flipState={() => {}} />
            </ScraperProvider>
        </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Search" });
};

const select = (label) => screen.getByRole("combobox", { name: label });
const openSelect = (label) => {
    fireEvent.mouseDown(select(label));
    return screen.getByRole("listbox");
};
const pick = async (label, optionName) => {
    fireEvent.click(within(openSelect(label)).getByRole("option", { name: optionName }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
};

const fakeApp = {
    appId: "example.app",
    title: "Example App",
    reviews: 12,
    available: true,
    offersIAP: false,
    adSupported: false,
    downloadable: true,
    permissions: Array.from({ length: 38 }, () => ({ isPermissionRequired: false })),
};

const requestUrls = () => axios.get.mock.calls.map(([url]) => url);
const searchAndWait = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await screen.findByText(/Result[s]? for/);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};
// The ZIP is built after the requests return; wait for it so nothing runs after the test ends.
const zipSaved = () => waitFor(() => expect(window.URL.revokeObjectURL).toHaveBeenCalled());
const downloadAndWait = async () => {
    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
    await waitFor(() => expect(axios.get).toHaveBeenCalledTimes(3));
    await zipSaved();
};
const tickPermissions = () => fireEvent.click(screen.getByLabelText("Include permissions in scrape"));

beforeEach(() => {
    localStorage.clear();
    axios.get.mockImplementation((url) => {
        if (url.includes("toplists")) return Promise.resolve({ data: { totalCount: 1, results: [{ ...fakeApp }] } });
        return Promise.resolve({ data: "x", headers: {} });
    });
    axios.isCancel = jest.fn(() => false);
    window.URL.createObjectURL = jest.fn(() => "blob:download");
    window.URL.revokeObjectURL = jest.fn();
});

test("Play Store download keeps the permissions setting used for the chart", async () => {
    await renderTopLists();
    await searchAndWait();
    expect(requestUrls()[0]).toContain("includePermissions=false");
    tickPermissions();
    await downloadAndWait();

    expect(requestUrls()).toContain("/api/download-top-csv?query=TOP_FREEUS&includePermissions=false");
    expect(requestUrls()).toContain(
        "/api/download-top-relog?collection=Top Free&category=&country=United States&includePermissions=false&totalCount=1",
    );
});

test("Play Store download preserves permissions enabled for the chart", async () => {
    await renderTopLists();
    tickPermissions();
    await searchAndWait();
    expect(requestUrls()[0]).toContain("includePermissions=true");
    tickPermissions();
    await downloadAndWait();

    expect(requestUrls()).toContain("/api/download-top-csv?query=TOP_FREEUS&includePermissions=true");
    expect(requestUrls()).toContain(
        "/api/download-top-relog?collection=Top Free&category=&country=United States&includePermissions=true&totalCount=1",
    );
});

test("App Store download keeps the searched device and permissions setting", async () => {
    await renderTopLists("App Store");
    await searchAndWait();
    await pick("Device*", "Mac");
    await downloadAndWait();

    expect(requestUrls()).toContain(
        "/ios/download-top-relog?collection=Top Free iOS Apps&category=&country=United States&device=iOS&includePermissions=false&totalCount=1",
    );
    expect(requestUrls()).toContain("/ios/download-top-csv?query=topfreeapplicationsUS&includePermissions=false");
});

test("Play Store permissions do not leak into App Store requests", async () => {
    await renderTopLists();
    tickPermissions();
    fireEvent.click(screen.getByRole("button", { name: "Switch to App Store" }));
    await screen.findByText("iOS");
    await searchAndWait();
    await downloadAndWait();

    expect(requestUrls().filter((url) => url.startsWith("/ios/")).every((url) => url.includes("includePermissions=false"))).toBe(
        true,
    );
});

test("chart heading and row action keep the searched country", async () => {
    await renderTopLists();
    await searchAndWait();
    await pick("Country*", "Japan");

    expect(screen.getByText("1 Result for Top Free Apps in United States")).toBeTruthy();
    const rowReviews = screen.getByTestId("row-reviews");
    expect(JSON.parse(rowReviews.getAttribute("data-reviews"))).toEqual([12, "example.app", "US"]);
});

test("download keeps the searched collection and country", async () => {
    await renderTopLists();
    await searchAndWait();
    await pick("Country*", "Japan");
    await pick("Collection*", "Top Paid");
    await downloadAndWait();

    expect(requestUrls()).toContain("/api/download-top-csv?query=TOP_FREEUS&includePermissions=false");
    expect(requestUrls()).toContain(
        "/api/download-top-relog?collection=Top Free&category=&country=United States&includePermissions=false&totalCount=1",
    );
});

test("loading dialog names the current selection while a search is pending", async () => {
    let resolveSearch;
    axios.get.mockImplementation((url) =>
        url.includes("toplists")
            ? new Promise((resolve) => {
                  resolveSearch = resolve;
              })
            : Promise.resolve({ data: "x", headers: {} }),
    );
    await renderTopLists();
    await pick("Country*", "Japan");
    fireEvent.click(screen.getByRole("button", { name: "Search" }));

    expect((await screen.findByRole("dialog")).textContent).toContain("in Japan...");
    await act(async () => resolveSearch({ data: { totalCount: 1, results: [{ ...fakeApp }] } }));
});

describe("cancelling a second search", () => {
    // First request resolves with a chart; later ones stay pending until aborted, like real axios.
    const searchThenLeaveNextPending = async () => {
        await renderTopLists();
        await searchAndWait();
        axios.isCancel = jest.fn((error) => error && error.name === "CanceledError");
        axios.get.mockImplementation((url, config) =>
            url.includes("toplists")
                ? new Promise((_resolve, reject) => {
                      config.signal.addEventListener("abort", () =>
                          reject(Object.assign(new Error("canceled"), { name: "CanceledError" })),
                      );
                  })
                : Promise.resolve({ data: "x", headers: {} }),
        );
    };

    const chartOnScreen = () => ({
        heading: screen.queryByText(/Result[s]? for/)?.textContent ?? null,
        row: screen.queryByTestId("row-app-id")?.textContent ?? null,
        download: screen.queryByRole("button", { name: /Download \(/ }) !== null,
    });

    test("the Cancel button keeps the chart already on screen", async () => {
        await searchThenLeaveNextPending();
        const before = chartOnScreen();
        expect(before.heading).toBe("1 Result for Top Free Apps in United States");

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        expect(chartOnScreen()).toEqual(before);
    });

    test("Escape keeps the chart already on screen", async () => {
        await searchThenLeaveNextPending();
        const before = chartOnScreen();

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        fireEvent.keyDown(await screen.findByRole("dialog"), { key: "Escape" });
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        expect(chartOnScreen()).toEqual(before);
    });

    test("a cancelled search for another country leaves the chart labelled and downloadable as before", async () => {
        await searchThenLeaveNextPending();
        await pick("Country*", "Japan");

        fireEvent.click(screen.getByRole("button", { name: "Search" }));
        fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
        await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

        expect(chartOnScreen().heading).toBe("1 Result for Top Free Apps in United States");
        fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
        await waitFor(() =>
            expect(requestUrls()).toContain("/api/download-top-csv?query=TOP_FREEUS&includePermissions=false"),
        );
        await zipSaved();
    });
});
