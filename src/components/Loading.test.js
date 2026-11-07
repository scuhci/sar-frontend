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
  expect(copy).toMatch(/Google Play returns up to 20 results/);
  expect(copy).not.toMatch(/max of 30/);
});

test("App Store loading dialog states the 50 primary results the backend requests", () => {
  render(<Loading {...baseProps} selectedScraper="App Store" />);
  const copy = screen.getByText(/Keyword search results/).closest("p").textContent;
  expect(copy).toMatch(/App Store returns up to 50 results/);
  expect(copy).not.toMatch(/max of 30/);
  expect(copy).not.toMatch(/results\?/);
});
