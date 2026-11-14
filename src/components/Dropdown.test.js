import React from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";
import Dropdown from "./Dropdown";
import { ScraperProvider, useScraper } from "./SelectedScraperProvider";
import { gplayCountries, iosCountries, iosReviewCountries } from "../constants/countryCodes";

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

const renderDropdown = (handler = () => {}, props = {}) =>
    render(
        <ScraperProvider>
            <StoreTabs />
            <Dropdown handler={handler} {...props} />
        </ScraperProvider>,
    );

const optionNames = () => {
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    return within(screen.getByRole("listbox")).getAllByRole("option").map((option) => option.textContent);
};

afterEach(() => {
    localStorage.clear();
});

test("App Store chart/search list holds unique ISO codes from the scraper library markets table", () => {
    const codes = iosCountries.map(({ code }) => code);
    codes.forEach((code) => expect(code).toMatch(/^[A-Z]{2}$/));
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(["US", "GB", "JP", "DE", "BR", "MU"]));
    // CU, IR and PR are not Apple storefronts; AF and RS are storefronts the library cannot resolve.
    ["AF", "CU", "IR", "RS", "PR"].forEach((code) => expect(codes).not.toContain(code));
});

test("App Store review list includes all supported Apple storefronts in name order", () => {
    const codes = iosReviewCountries.map(({ code }) => code);
    expect(codes).toHaveLength(173);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toEqual(expect.arrayContaining(iosCountries.map(({ code }) => code)));
    expect(codes).toEqual(expect.arrayContaining(["AF", "KZ", "RS", "MA", "GE", "DO"]));
    ["CU", "IR", "PR"].forEach((code) => expect(codes).not.toContain(code));
    iosReviewCountries.forEach(({ name, code }) => {
        expect(name).toEqual(expect.any(String));
        expect(name.trim()).not.toBe("");
        expect(code).toMatch(/^[A-Z]{2}$/);
    });
    expect(iosReviewCountries.map(({ name }) => name)).toEqual(
        [...iosReviewCountries.map(({ name }) => name)].sort((a, b) => a.localeCompare(b)),
    );
});

test("App Store shows only storefront countries", () => {
    renderDropdown();
    fireEvent.click(screen.getByText("app"));

    expect(optionNames()).toEqual(iosCountries.map(({ name }) => name));
});

test("App Store shows the provided review storefront countries", () => {
    renderDropdown(() => {}, { appStoreCountries: iosReviewCountries });
    fireEvent.click(screen.getByText("app"));

    expect(optionNames()).toEqual(iosReviewCountries.map(({ name }) => name));
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

test("App Store review selection sends Kazakhstan's country code", () => {
    const handler = jest.fn();
    renderDropdown(handler, { appStoreCountries: iosReviewCountries });
    fireEvent.click(screen.getByText("app"));

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Kazakhstan" }));
    fireEvent.blur(screen.getByRole("combobox"));
    expect(handler).toHaveBeenLastCalledWith("KZ");
});

test("switching to the App Store with a review storefront country keeps Afghanistan", async () => {
    const handler = jest.fn();
    renderDropdown(handler, { appStoreCountries: iosReviewCountries });
    fireEvent.click(screen.getByText("play"));

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(within(screen.getByRole("listbox")).getByRole("option", { name: "Afghanistan" }));
    fireEvent.blur(screen.getByRole("combobox"));
    expect(screen.getByRole("combobox")).toHaveValue("Afghanistan");
    expect(handler).toHaveBeenLastCalledWith("AF");

    fireEvent.click(screen.getByText("app"));
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveValue("Afghanistan"));
    expect(handler).toHaveBeenLastCalledWith("AF");
});
