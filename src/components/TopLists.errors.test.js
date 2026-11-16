import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import axios from "axios";
import TopLists from "./TopLists";
import { ScraperProvider } from "./SelectedScraperProvider";

jest.mock("axios");

jest.mock("@mui/x-data-grid", () => ({
    DataGrid: () => <div data-testid="data-grid" />,
}));

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

const successfulSearch = {
    data: { totalCount: 1, results: [{ ...fakeApp }] },
};

const renderTopLists = async () => {
    localStorage.setItem("selectedScraper", JSON.stringify("Play Store"));
    render(
        <MemoryRouter initialEntries={["/toplists"]}>
            <ScraperProvider>
                <TopLists flipState={() => {}} />
            </ScraperProvider>
        </MemoryRouter>,
    );
    await screen.findByRole("button", { name: "Search" });
};

const search = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
};
const chartHeading = () => screen.queryByText("1 Result for Top Free Apps in United States");

beforeEach(() => {
    localStorage.clear();
    axios.get.mockImplementation((url) =>
        url.includes("toplists") ? Promise.resolve(successfulSearch) : Promise.resolve({ data: "x", headers: {} }),
    );
    axios.isCancel = jest.fn(() => false);
    window.URL.createObjectURL = jest.fn(() => "blob:download");
    window.URL.revokeObjectURL = jest.fn();
});

test("a successful chart with one app shows its result heading without errors", async () => {
    await renderTopLists();
    await search();

    expect(await screen.findByText("1 Result for Top Free Apps in United States")).toBeTruthy();
    expect(screen.queryByText(/No Results Found/)).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a successful empty chart still shows No Results", async () => {
    axios.get.mockImplementation((url) =>
        url.includes("toplists") ? Promise.resolve({ data: { totalCount: 0, results: [] } }) : Promise.resolve({ data: "x" }),
    );
    await renderTopLists();
    await search();

    expect(await screen.findByText(/No Results Found/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a backend search error is shown instead of an empty chart", async () => {
    axios.get.mockRejectedValue({
        response: {
            status: 502,
            data: { error: "Google Play did not return details for any app in this chart. Please try again later." },
        },
    });
    await renderTopLists();
    await search();

    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Google Play did not return details for any app in this chart. Please try again later.",
    );
    expect(screen.queryByText(/No Results Found/)).toBeNull();
});

test("search errors explain timeouts, unreachable servers, and other status codes", async () => {
    await renderTopLists();
    axios.get.mockRejectedValueOnce({ response: { status: 504, data: "<html>" } });
    await search();
    expect(await screen.findByRole("alert")).toHaveTextContent("took too long");

    axios.get.mockRejectedValueOnce(new Error("network error"));
    await search();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not reach the server");

    axios.get.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    await search();
    expect(await screen.findByRole("alert")).toHaveTextContent("status 500");
});

test("a failed search removes the old chart and a later success clears its error", async () => {
    await renderTopLists();
    await search();
    expect(await screen.findByText("1 Result for Top Free Apps in United States")).toBeTruthy();

    axios.get.mockRejectedValueOnce({ response: { status: 502, data: { error: "Chart failed." } } });
    await search();
    expect(await screen.findByRole("alert")).toHaveTextContent("Chart failed.");
    expect(chartHeading()).toBeNull();

    axios.get.mockResolvedValueOnce(successfulSearch);
    await search();
    expect(await screen.findByText("1 Result for Top Free Apps in United States")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a failed CSV download shows a Blob backend message and keeps the chart", async () => {
    await renderTopLists();
    await search();
    expect(await screen.findByText("1 Result for Top Free Apps in United States")).toBeTruthy();
    const json = JSON.stringify({
        error: "CSV data not available. Scrape this chart again with the same options, then download.",
    });
    const blob = Object.assign(new Blob([json]), { text: async () => json });
    axios.get.mockRejectedValueOnce({ response: { status: 404, data: blob } });

    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("CSV data not available");
    expect(chartHeading()).toBeTruthy();
});

test("download errors handle plain objects and unreadable bodies", async () => {
    await renderTopLists();
    await search();
    await screen.findByText("1 Result for Top Free Apps in United States");

    axios.get.mockRejectedValueOnce({ response: { status: 404, data: { error: "Object backend message." } } });
    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Object backend message.");

    axios.get.mockRejectedValueOnce({ response: { status: 500, data: "garbage" } });
    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("status 500");
});

test("a successful download clears the prior download error", async () => {
    await renderTopLists();
    await search();
    await screen.findByText("1 Result for Top Free Apps in United States");

    axios.get.mockRejectedValueOnce({ response: { status: 500, data: {} } });
    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();

    axios.get.mockResolvedValue({ data: "x", headers: {} });
    fireEvent.click(screen.getByRole("button", { name: /Download \(/ }));
    await waitFor(() => expect(window.URL.revokeObjectURL).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a cancelled search does not show an error", async () => {
    axios.isCancel = jest.fn(() => true);
    axios.get.mockRejectedValue({ message: "canceled" });
    await renderTopLists();
    await search();

    await waitFor(() => expect(axios.isCancel).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
});
