import React from 'react';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import Citation from './components/Citation';
import NotifyMe from './components/NotifyMe';

jest.mock('axios');

const routes = ['/', '/toplists', '/bulkreviews', '/userguide', '/agent-skills', '/about'];

beforeEach(() => {
  document.title = 'SMAR'; // what public/index.html ships
  axios.get.mockImplementation(() => new Promise(() => {}));
  axios.post.mockImplementation(() => new Promise(() => {}));
  axios.isCancel.mockReturnValue(false);
});

const renderRoute = (route) => render(
  <MemoryRouter initialEntries={[route]}>
    <App />
  </MemoryRouter>
);

test('Citation copy button copies the citation and announces success', async () => {
  const writeText = jest.fn().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
  render(<Citation />);

  const button = screen.getByRole('button', { name: 'Copy citation' });
  expect(button).toBeInTheDocument();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
  fireEvent.click(button);
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(await screen.findByText('Citation copied')).toHaveAttribute('role', 'status');
});

test('Citation copy button does not claim success when the clipboard is unavailable', async () => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
  render(<Citation />);

  fireEvent.click(screen.getByRole('button', { name: 'Copy citation' }));
  await Promise.resolve();
  expect(screen.getByRole('status')).toBeEmptyDOMElement();
});

test.each(['/','/toplists','/bulkreviews'])('%s has an App store tablist', (route) => {
  renderRoute(route);
  expect(screen.getByRole('tablist', { name: 'App store' })).toBeInTheDocument();
});

test('Home has one page heading without a button and descriptive heading text', () => {
  renderRoute('/');
  const headings = document.querySelectorAll('h1');
  expect(headings).toHaveLength(1);
  expect(within(headings[0]).queryByRole('button')).not.toBeInTheDocument();
  expect(headings[0]).toHaveTextContent('Systematic Mobile Application Reviews');
});

test.each(routes)('%s has one main, one h1, and a page title', (route) => {
  renderRoute(route);
  expect(document.querySelectorAll('h1')).toHaveLength(1);
  expect(document.querySelectorAll('main')).toHaveLength(1);
  expect(document.title).not.toBe('SMAR');
});

test('page titles are distinct across the main routes', () => {
  const titles = routes.map((route) => {
    const view = renderRoute(route);
    const title = document.title;
    view.unmount();
    return title;
  });
  expect(new Set(titles).size).toBe(routes.length);
});

test('User Guide tables and screenshots have distinct descriptive names', () => {
  renderRoute('/userguide');
  const tables = screen.getAllByRole('table');
  const tableNames = tables.map((table) => table.getAttribute('aria-label'));
  expect(tableNames.every((name) => name && name.trim() && name !== 'simple table')).toBe(true);
  expect(new Set(tableNames).size).toBe(tables.length);

  const alts = Array.from(document.querySelectorAll('img')).map((image) => image.getAttribute('alt'));
  expect(alts.every((alt) => alt && alt.trim())).toBe(true);
  expect(new Set(alts).size).toBe(alts.length);
});

test('About expanders and LinkedIn links have distinct accessible names', async () => {
  renderRoute('/about');
  const expanders = screen.getAllByRole('button', { name: /^Show more about / });
  const expanderNames = expanders.map((button) => button.getAttribute('aria-label'));
  expect(new Set(expanderNames).size).toBe(expanders.length);
  fireEvent.click(expanders[0]);
  expect(expanders[0].getAttribute('aria-label')).toMatch(/^Show less/);

  const linkedinLinks = screen.getAllByRole('link', { name: / on LinkedIn$/ });
  const linkedinNames = linkedinLinks.map((link) => link.getAttribute('aria-label'));
  expect(new Set(linkedinNames).size).toBe(linkedinLinks.length);
  expect(Array.from(document.querySelectorAll('a')).some((link) => link.getAttribute('href')?.endsWith('#'))).toBe(false);
});

test('NotifyMe exposes a labeled email textbox and accessible focus and text colors', () => {
  render(<NotifyMe country="us" query="x" />);
  expect(screen.getByRole('textbox', { name: 'Email address' })).toHaveAttribute('type', 'email');

  const css = fs.readFileSync(path.join(__dirname, 'css/NotifyMe.css'), 'utf8');
  expect(css).toMatch(/\.emailField:focus-visible\s*\{[^}]*outline\s*:/s);
  expect(css).toMatch(/\.NotifyBox:focus-visible\s*\{[^}]*outline\s*:/s);
  const textRule = css.match(/(?:^|\n)\.NotifyText\s*\{([^}]*)\}/);
  expect(textRule).not.toBeNull();
  const color = textRule[1].match(/color\s*:\s*(#[\da-f]{6})/i)?.[1];
  expect(color).toBeTruthy();

  const luminance = (hex) => {
    const channels = hex.slice(1).match(/.{2}/g).map((channel) => parseInt(channel, 16) / 255);
    const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  expect(1.05 / (luminance(color) + 0.05)).toBeGreaterThanOrEqual(4.5);
});

test('Bulk Reviews loading dialog has an accessible title, progress bar, and status', async () => {
  renderRoute('/bulkreviews');
  fireEvent.change(screen.getByLabelText(/Enter app IDs/), { target: { value: 'com.facebook.katana' } });
  fireEvent.click(screen.getByRole('button', { name: 'Scrape Play Store' }));

  const dialog = await screen.findByRole('dialog', { name: /Scraping data/ });
  expect(dialog).toBeInTheDocument();
  expect(within(dialog).getByRole('progressbar')).toHaveAccessibleName();
  expect(within(dialog).getByRole('status')).toHaveTextContent('Currently scraping data for');
});
