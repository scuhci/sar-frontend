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

  expect(
    screen.getByRole('heading', { level: 3, name: /Systematic Mobile Application Reviews/ })
  ).toBeInTheDocument();

  expect(screen.getByRole('link', { name: 'Top Charts' })).toHaveAttribute('href', '/toplists');
  expect(screen.getByRole('link', { name: 'Bulk Reviews' })).toHaveAttribute('href', '/bulkreviews');
  expect(screen.getByRole('link', { name: /Agent Skills/ })).toHaveAttribute('href', '/agent-skills');
  expect(screen.getByRole('link', { name: 'User Guide' })).toHaveAttribute('href', '/userguide');
  expect(screen.getByRole('link', { name: 'About' })).toHaveAttribute('href', '/about');
});

test('renders the about page on /about', () => {
  renderApp('/about');

  expect(
    screen.getByRole('heading', { level: 3, name: 'About the SMAR project' })
  ).toBeInTheDocument();
});
