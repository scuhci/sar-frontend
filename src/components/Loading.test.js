import { render, screen } from "@testing-library/react";
import Loading from "./Loading";

const baseProps = {
  open: true,
  onCancel: () => {},
  country: "US",
  permissions: false,
  searchQuery: "alpha",
  time: "",
};

test("Play Store loading dialog states the 20 primary results the backend requests", () => {
  render(<Loading {...baseProps} selectedScraper="Play Store" />);
  const copy = screen.getByText(/Keyword search results/).closest("p").textContent;
  expect(copy).toMatch(/SMAR requests up to 20 results/);
  expect(copy).not.toMatch(/max of 30/);
  expect(copy).toContain("related to <app title>");
  expect(copy).not.toMatch(/Similar Apps\/Games/);
});

test("Play Store loading dialog offers email notification", () => {
  render(<Loading {...baseProps} selectedScraper="Play Store" />);
  expect(screen.getByText(/Drop an email/)).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Email Address")).toBeInTheDocument();
});

test("App Store loading dialog states the 50 primary results the backend requests", () => {
  render(<Loading {...baseProps} selectedScraper="App Store" />);
  const copy = screen.getByText(/Keyword search results/).closest("p").textContent;
  expect(copy).toMatch(/SMAR requests up to 50 results/);
  expect(copy).not.toMatch(/max of 30/);
  expect(copy).not.toMatch(/results\?/);
  expect(copy).toMatch(/App Store lists as similar/);
  expect(copy).not.toMatch(/related to|Google Play|Similar Apps\/Games/);
});

test("App Store loading dialog does not offer email notification", () => {
  render(<Loading {...baseProps} selectedScraper="App Store" />);
  expect(screen.queryByText(/Drop an email/)).toBeNull();
  expect(screen.queryByPlaceholderText("Email Address")).toBeNull();
  expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
});
