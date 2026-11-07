import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { unstable_HistoryRouter as HistoryRouter } from "react-router-dom";
import { createMemoryHistory } from "@remix-run/router";
import App from "./App";

// TopLists calls flipState once a Top Charts request has finished, and Home's
// SearchBar does the same after a keyword search. Stand in buttons that do the
// same so the tests need no store traffic.
jest.mock("./components/TopLists", () => ({ flipState }) => (
    <button onClick={flipState}>fake top charts search</button>
));
jest.mock("./pages/Home", () => ({ flipState }) => (
    <button onClick={flipState}>fake keyword search</button>
));

// jsdom does not implement reload(); record where the router is at the moment
// it is called, because the browser reloads the URL that is current then.
const realLocation = window.location;
const reload = jest.fn();
let history;
let pathAtReload;

const setup = (initialPath) => {
    history = createMemoryHistory({ initialEntries: [initialPath] });
    pathAtReload = null;
    // CRA runs jest with resetMocks, so the implementation has to be set here.
    reload.mockImplementation(() => {
        pathAtReload = history.location.pathname;
    });
    render(
        <HistoryRouter history={history}>
            <App />
        </HistoryRouter>,
    );
};

beforeEach(() => {
    delete window.location;
    window.location = { ...realLocation, reload };
});

afterEach(() => {
    window.location = realLocation;
});

const homeNav = () => screen.getByRole("button", { name: "Keyword & App ID Search" });
const topChartsNav = () => screen.getByRole("button", { name: "Top Charts" });

test("Keyword & App ID Search nav button goes home after a Top Charts search", () => {
    setup("/toplists");
    fireEvent.click(screen.getByText("fake top charts search"));

    fireEvent.click(homeNav());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(pathAtReload).toBe("/");
    expect(history.location.pathname).toBe("/");
    // exactly one new entry: Back returns to /toplists
    expect(history.index).toBe(1);
});

test("Keyword & App ID Search nav button does not reload before any search", () => {
    setup("/toplists");

    fireEvent.click(homeNav());

    expect(reload).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe("/");
    expect(history.index).toBe(1);
});

test("Keyword & App ID Search nav button reloads home in place after a keyword search", () => {
    setup("/");
    fireEvent.click(screen.getByText("fake keyword search"));

    fireEvent.click(homeNav());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(pathAtReload).toBe("/");
    expect(history.location.pathname).toBe("/");
    // no duplicate "/" entry: one Back still leaves the page
    expect(history.index).toBe(0);
});

test("Top Charts nav button still reloads on /toplists after a search", () => {
    setup("/toplists");
    fireEvent.click(screen.getByText("fake top charts search"));

    fireEvent.click(topChartsNav());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(pathAtReload).toBe("/toplists");
    expect(history.location.pathname).toBe("/toplists");
    expect(history.index).toBe(0);
});

test("Top Charts nav button pushes /toplists once after a keyword search", () => {
    setup("/");
    fireEvent.click(screen.getByText("fake keyword search"));

    fireEvent.click(topChartsNav());

    expect(reload).toHaveBeenCalledTimes(1);
    expect(pathAtReload).toBe("/toplists");
    expect(history.location.pathname).toBe("/toplists");
    expect(history.index).toBe(1);
});

test("modifier-click on a nav button after a search leaves this tab alone", () => {
    setup("/toplists");
    fireEvent.click(screen.getByText("fake top charts search"));

    fireEvent.click(homeNav(), { metaKey: true });
    fireEvent.click(homeNav(), { ctrlKey: true });

    expect(reload).not.toHaveBeenCalled();
    expect(history.location.pathname).toBe("/toplists");
    expect(history.index).toBe(0);
});
