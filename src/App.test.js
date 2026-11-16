import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

// App calls useNavigate, so it has to be rendered inside a router the way
// index.js does with BrowserRouter. MemoryRouter lets the test pick the route.
const renderApp = (route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <App />
    </MemoryRouter>
  );

test('renders the home page with the navigation bar', () => {
  renderApp('/');

  const title = screen.getByRole('link', { name: 'Systematic Mobile Application Reviews' });
  expect(title).toHaveAttribute('href', '/');

  // The page title sits next to the same text in the navigation bar (an h6).
  const pageTitles = screen
    .getAllByRole('heading', { name: /Systematic Mobile Application Reviews/ })
    .filter((heading) => heading.tagName !== 'H6');
  expect(pageTitles).toHaveLength(1);

  expect(screen.getByRole('link', { name: 'Top Charts' })).toHaveAttribute('href', '/toplists');
  expect(screen.getByRole('link', { name: 'Bulk Reviews' })).toHaveAttribute('href', '/bulkreviews');
  expect(screen.getByRole('link', { name: /Agent Skills/ })).toHaveAttribute('href', '/agent-skills');
  expect(screen.getByRole('link', { name: 'User Guide' })).toHaveAttribute('href', '/userguide');
  expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
});

test('renders the about page on /about', () => {
  renderApp('/about');

  expect(
    screen.getByRole('heading', { name: 'About the SMAR project' })
  ).toBeInTheDocument();
});

test.each([
  '/toplist',
  '/topcharts',
  '/user-guide',
  '/agent-skills/smar-appstore-agent.skill',
])('renders the not found page on %s', (route) => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

  try {
    renderApp(route);

    expect(
      screen.getByRole('heading', { level: 3, name: 'Page not found' })
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'search page' })).toHaveAttribute('href', '/');
    expect(
      screen.getByRole('link', { name: 'Systematic Mobile Application Reviews' })
    ).toBeInTheDocument();
    expect(
      warn.mock.calls.some(([message]) => String(message).includes('No routes matched'))
    ).toBe(false);
  } finally {
    warn.mockRestore();
  }
});

test('does not render the not found page on /about', () => {
  renderApp('/about');

  expect(screen.queryByRole('heading', { level: 3, name: 'Page not found' })).not.toBeInTheDocument();
});
