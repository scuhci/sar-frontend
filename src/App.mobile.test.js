import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

jest.mock("axios", () => ({
    __esModule: true,
    default: { get: jest.fn(), post: jest.fn(), isCancel: jest.fn(() => false) },
}));

const IPHONE_UA =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const DESKTOP_UA =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const originalUserAgent = window.navigator.userAgent;

const setUserAgent = (ua) =>
    Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true });

const renderApp = (path) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <App />
        </MemoryRouter>,
    );

const ALL_ROUTES = ["/", "/toplists", "/bulkreviews", "/userguide", "/agent-skills", "/about"];

afterEach(() => {
    setUserAgent(originalUserAgent);
});

test("every route shows the mobile screen on a phone, with no navigation bar", () => {
    setUserAgent(IPHONE_UA);

    for (const path of ALL_ROUTES) {
        const { unmount } = renderApp(path);

        expect(screen.getByText("SMAR is Unavailable on Mobile Devices.")).toBeInTheDocument();
        expect(screen.queryByText("Keyword & App ID Search")).toBeNull();
        expect(screen.queryByText("Agent Skills", { selector: "h1, h2, h3, h4" })).toBeNull();

        unmount();
    }
});

test("desktop browsers get the navigation bar and the page content", () => {
    setUserAgent(DESKTOP_UA);

    renderApp("/about");

    expect(screen.queryByText("SMAR is Unavailable on Mobile Devices.")).toBeNull();
    expect(screen.getByText("Keyword & App ID Search")).toBeInTheDocument();
});
