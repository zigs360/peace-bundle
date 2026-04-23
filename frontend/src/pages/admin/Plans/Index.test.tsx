import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PlansIndex from './Index';

const apiGet = vi.fn();
const apiPut = vi.fn();
const apiPost = vi.fn();

vi.mock('../../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
    put: (...args: any[]) => apiPut(...args),
    post: (...args: any[]) => apiPost(...args),
  },
}));

describe('PlansIndex', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('alert', vi.fn());

    apiGet.mockImplementation(async (url: string, config?: any) => {
      if (url === '/admin/plans') {
        return {
          data: {
            items: [
              {
                id: 1,
                source: 'ogdams',
                network: 'mtn',
                provider: 'mtn',
                name: '1GB [GIFTING]',
                plan_id: '20002',
                validity: '1 Day',
                data_size: '1GB',
                original_price: 500,
                your_price: 475,
                wallet_price: 495,
                available_sim: true,
                available_wallet: true,
                is_active: true,
                last_updated_by: 'admin@test.com',
              },
            ],
            total: 1,
          },
          config,
        };
      }
      if (url === '/admin/plans/filters') {
        return { data: { sources: ['ogdams', 'smeplug'], networks: ['mtn', 'airtel', 'glo'] } };
      }
      if (url === '/admin/stats/summary') {
        return { data: { totalPlans: 1, activePlans: 1, zeroPricePlans: 0 } };
      }
      if (url === '/admin/stats/recent-updates') {
        return {
          data: {
            items: [
              {
                id: 'h1',
                field_name: 'your_price',
                old_price: 475,
                new_price: 490,
                changed_by: 'admin@test.com',
                plan: { name: '1GB [GIFTING]', provider: 'mtn' },
              },
            ],
          },
        };
      }
      if (url === '/admin/stats/cheapest-plans') {
        return {
          data: {
            items: {
              mtn: [{ id: 1, name: '1GB [GIFTING]', your_price: 475 }],
              airtel: [],
              glo: [],
            },
          },
        };
      }
      return { data: {} };
    });

    apiPut.mockResolvedValue({
      data: {
        item: {
          id: 1,
          source: 'ogdams',
          network: 'mtn',
          provider: 'mtn',
          name: '1GB [GIFTING]',
          plan_id: '20002',
          validity: '1 Day',
          data_size: '1GB',
          original_price: 500,
          your_price: 490,
          wallet_price: 495,
          available_sim: true,
          available_wallet: true,
          is_active: true,
          last_updated_by: 'admin@test.com',
        },
      },
    });
  });

  it('loads plans, applies filters, and saves modal edits', async () => {
    const { container } = render(
      <MemoryRouter>
        <PlansIndex />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Plans Management')).toBeInTheDocument();
    expect((await screen.findAllByText('1GB [GIFTING]')).length).toBeGreaterThan(0);

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.change(comboboxes[0], { target: { value: 'ogdams' } });
    fireEvent.change(comboboxes[1], { target: { value: 'mtn' } });
    fireEvent.change(comboboxes[2], { target: { value: 'active' } });
    fireEvent.change(screen.getByPlaceholderText('Plan name, ID, size'), { target: { value: '1GB' } });
    fireEvent.click(screen.getByText('Apply Filters'));

    await waitFor(() => {
      expect(apiGet).toHaveBeenCalledWith('/admin/plans', {
        params: {
          source: 'ogdams',
          network: 'mtn',
          status: 'active',
          search: '1GB',
          limit: 200,
        },
      });
    });

    fireEvent.click(screen.getByText('Edit'));

    expect(await screen.findByText('Edit Plan: 1GB [GIFTING]')).toBeInTheDocument();
    const priceInputs = screen.getAllByDisplayValue('475');
    fireEvent.change(priceInputs[priceInputs.length - 1], { target: { value: '490' } });
    const reasonBox = container.querySelector('textarea');
    expect(reasonBox).toBeTruthy();
    fireEvent.change(reasonBox as HTMLTextAreaElement, { target: { value: 'Vendor update' } });
    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(apiPut).toHaveBeenCalledWith(
        '/admin/plans/1',
        expect.objectContaining({
          your_price: 490,
          reason: 'Vendor update',
          plan_id: '20002',
        }),
      );
    });
  });

  it('opens the import modal and uploads a csv file', async () => {
    render(
      <MemoryRouter>
        <PlansIndex />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Plans Management')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Import CSV'));

    expect(await screen.findByRole('heading', { name: 'Import Plans' })).toBeInTheDocument();

    const file = new File(
      ['Plan Name,Plan ID\n1GB [GIFTING],20002\n'],
      'mtn-plans.csv',
      { type: 'text/csv' },
    );
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [file] } });

    apiPost.mockResolvedValueOnce({
      data: {
        message: 'Imported plans successfully. Created 1, updated 0, skipped 0.',
        summary: { created: 1, updated: 0, skipped: 0 },
        sample: [{ name: '1GB [GIFTING]', provider: 'mtn', plan_id: '20002' }],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Import Plans' }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith(
        '/admin/plans/import',
        expect.any(FormData),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'multipart/form-data',
          }),
        }),
      );
    });

    expect(await screen.findByText(/Imported plans successfully/i)).toBeInTheDocument();
  });
});
