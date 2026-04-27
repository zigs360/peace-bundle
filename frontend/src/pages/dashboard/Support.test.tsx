import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Support from './Support';

// Mock the API service
vi.mock('../../services/api', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

describe('Support Page WhatsApp Redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.open
    global.window.open = vi.fn();
  });

  it('renders the WhatsApp support button', () => {
    render(
      <BrowserRouter>
        <Support />
      </BrowserRouter>
    );
    expect(screen.getByText(/Chat on WhatsApp/i)).toBeInTheDocument();
  });

  it('triggers WhatsApp redirect with correct URL on click', () => {
    render(
      <BrowserRouter>
        <Support />
      </BrowserRouter>
    );

    const whatsappButton = screen.getByText(/Chat on WhatsApp/i).closest('button');
    fireEvent.click(whatsappButton!);

    const expectedPhone = '2348035446865';
    const expectedMessage = encodeURIComponent('Hello Peace Bundle Support, I need assistance with my account.');
    const expectedUrl = `https://wa.me/${expectedPhone}?text=${expectedMessage}`;

    expect(global.window.open).toHaveBeenCalledWith(expectedUrl, '_blank', 'noopener,noreferrer');
  });
});
