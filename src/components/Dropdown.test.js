import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import Dropdown from "./Dropdown";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";
import { gplayCountries, iosCountries } from "../constants/countryCodes";

// Store tabs live outside the dropdown (search bar, Bulk Reviews); stand in for them.
const StoreTabs = () => {
    const { setSelectedScraper } = useScraper();
    return (
        <>
            <button onClick={() => setSelectedScraper("Play Store")}>play</button>
            <button onClick={() => setSelectedScraper("App Store")}>app</button>
        </>
    );
};

const renderDropdown = (handler = () => {}) =>
    render(
        <ScraperProvider>
            <StoreTabs />
            <Dropdown handler={handler} />
        </ScraperProvider>,
    );

const optionNames = () => {
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent);
};

afterEach(() => {
    localStorage.clear();
});

test("App Store storefront list holds unique ISO codes and leaves out non-storefront countries", () => {
    const codes = iosCountries.map(({ code }) => code);
    codes.forEach((code) => expect(code).toMatch(/^[A-Z]{2}$/));
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(["US", "GB", "JP", "DE", "BR", "MU"]));
    ["AF", "CU", "IR", "RS", "PR"].forEach((code) => expect(codes).not.toContain(code));
});

test("App Store shows only storefront countries", () => {
    renderDropdown();
    fireEvent.click(screen.getByText("app"));

    expect(optionNames()).toEqual(iosCountries.map(({ name }) => name));
});

test("Play Store shows every Google Play country", () => {
    renderDropdown();
    fireEvent.click(screen.getByText("play"));

    expect(optionNames()).toEqual(gplayCountries.map(({ name }) => name));
});

test("switching to the App Store with a non-storefront country falls back to United States", async () => {
    const handler = jest.fn();
    renderDropdown(handler);
    fireEvent.click(screen.getByText("play"));

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Afghanistan" }));
    fireEvent.blur(screen.getByRole("combobox"));
    expect(screen.getByRole("combobox")).toHaveValue("Afghanistan");
    expect(handler).toHaveBeenLastCalledWith("AF");

    fireEvent.click(screen.getByText("app"));
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("United States"));
    expect(handler).toHaveBeenLastCalledWith("US");
});
