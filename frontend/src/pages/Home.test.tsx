import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from './Home';

describe('Home Page', () => {
  it('renders the hero headline', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByText(/Digital Services/i)).toBeInTheDocument();
    expect(screen.getByText(/Simplified/i)).toBeInTheDocument();
  });

  it('renders the main call to action', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    // Checking for "Get Started" or similar button
    const ctaButtons = screen.getAllByRole('link', { name: /Get Started/i });
    expect(ctaButtons.length).toBeGreaterThan(0);
  });

  it('renders the services section', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );
    expect(screen.getByRole('heading', { name: /Airtime Top-up/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Data Bundles/i })).toBeInTheDocument();
  });
});
