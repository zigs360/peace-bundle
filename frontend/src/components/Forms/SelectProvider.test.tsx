import { render, screen, fireEvent } from '@testing-library/react';
import SelectProvider from './SelectProvider';
import { describe, it, expect, vi } from 'vitest';

describe('SelectProvider', () => {
  it('renders all providers', () => {
    const handleChange = vi.fn();
    render(<SelectProvider value="" onChange={handleChange} />);
    
    expect(screen.getByText('MTN')).toBeInTheDocument();
    expect(screen.getByText('Airtel')).toBeInTheDocument();
    expect(screen.getByText('Glo')).toBeInTheDocument();
    expect(screen.getByText('9mobile')).toBeInTheDocument();
  });

  it('calls onChange when a provider is clicked', () => {
    const handleChange = vi.fn();
    render(<SelectProvider value="" onChange={handleChange} />);
    
    fireEvent.click(screen.getByText('MTN'));
    expect(handleChange).toHaveBeenCalledWith('MTN');
  });

  it('highlights the selected provider', () => {
    const handleChange = vi.fn();
    render(<SelectProvider value="MTN" onChange={handleChange} />);
    
    const mtnButton = screen.getByText('MTN').closest('button');
    expect(mtnButton).toHaveClass('ring-2');
  });
});
