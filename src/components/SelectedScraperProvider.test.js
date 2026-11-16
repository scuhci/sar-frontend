import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "../App";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";

const ScraperConsumer = () => {
    const { selectedScraper, setSelectedScraper } = useScraper();

    return (
        <div>
            <span>{selectedScraper}</span>
            <button onClick={() => setSelectedScraper("App Store")}>
                Choose App Store
            </button>
        </div>
    );
};

const renderConsumer = () =>
    render(
        <ScraperProvider>
            <ScraperConsumer />
        </ScraperProvider>
    );

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
});

test("defaults to Play Store when nothing is stored", () => {
    renderConsumer();

    expect(screen.getByText("Play Store")).toBeInTheDocument();
});

test('loads the stored "App Store" choice', () => {
    localStorage.setItem("selectedScraper", JSON.stringify("App Store"));

    renderConsumer();

    expect(screen.getByText("App Store")).toBeInTheDocument();
});

test("defaults to Play Store when storage contains invalid JSON", () => {
    localStorage.setItem("selectedScraper", "Play Store");

    expect(() => renderConsumer()).not.toThrow();
    expect(screen.getByText("Play Store")).toBeInTheDocument();
});

test("defaults to Play Store for an unknown stored choice", () => {
    localStorage.setItem("selectedScraper", JSON.stringify("iOS"));

    renderConsumer();

    expect(screen.getByText("Play Store")).toBeInTheDocument();
});

test("keeps the selection usable when localStorage is blocked", () => {
    jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
    });
    jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("Storage is blocked", "SecurityError");
    });

    expect(() => renderConsumer()).not.toThrow();
    expect(screen.getByText("Play Store")).toBeInTheDocument();

    expect(() =>
        fireEvent.click(screen.getByRole("button", { name: "Choose App Store" }))
    ).not.toThrow();
    expect(screen.getByText("App Store")).toBeInTheDocument();
});

test('writes the selected "App Store" choice to localStorage as JSON', () => {
    renderConsumer();

    fireEvent.click(screen.getByRole("button", { name: "Choose App Store" }));

    expect(localStorage.getItem("selectedScraper")).toBe(
        JSON.stringify("App Store")
    );
});

test("renders the About page when storage contains invalid JSON", () => {
    localStorage.setItem("selectedScraper", "Play Store");

    expect(() =>
        render(
            <MemoryRouter initialEntries={["/about"]}>
                <App />
            </MemoryRouter>
        )
    ).not.toThrow();
    expect(
        screen.getByRole("heading", { name: "About the SMAR project" })
    ).toBeInTheDocument();
});
