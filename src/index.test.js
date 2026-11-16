jest.mock('react-dom/client', () => ({
  createRoot: jest.fn(() => ({ render: jest.fn() })),
}));
jest.mock('./analytics', () => ({ initAnalytics: jest.fn() }));
jest.mock('./App', () => () => null);
jest.mock('./reportWebVitals', () => jest.fn());

describe('application startup', () => {
  it('initializes analytics and renders the app once', () => {
    document.body.innerHTML = '<div id="root"></div>';

    require('./index');

    const { initAnalytics } = require('./analytics');
    const { createRoot } = require('react-dom/client');
    expect(initAnalytics).toHaveBeenCalledTimes(1);
    expect(createRoot).toHaveBeenCalledTimes(1);
    expect(createRoot.mock.results[0].value.render).toHaveBeenCalledTimes(1);
  });
});
