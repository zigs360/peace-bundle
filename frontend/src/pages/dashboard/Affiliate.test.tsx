import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import Affiliate from './Affiliate';

const apiGet = vi.fn();

vi.mock('../../services/api', () => ({
  default: {
    get: (...args: any[]) => apiGet(...args),
  },
}));

describe('Affiliate Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders affiliate dashboard with detailed click-funnel metrics and referral history', async () => {
    apiGet.mockResolvedValue({
      data: {
        referralCode: 'REF1234',
        referralLink: 'https://peacebundlle.com/register?ref=REF1234',
        totalEarnings: '150.00',
        pendingPayout: '10.00',
        totalClicks: 25,
        totalConvertedClicks: 5,
        conversionRate: 20,
        totalRefereeRewardsIssued: '40.00',
        referredUsersCount: 1,
        recentReferrals: [
          {
            name: 'John Doe',
            date: '2026-06-26T12:00:00.000Z',
            status: 'Active',
            commission: '125.00',
            refereeReward: '30.00',
          },
        ],
      },
    });

    const { container } = render(<Affiliate />);

    // Loader should be shown initially
    expect(container.querySelector('.animate-spin')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Affiliate Program')).toBeTruthy();
    });

    // Check stats cards are rendered with values
    expect(screen.getByText('₦150.00')).toBeTruthy(); // Total earnings
    expect(screen.getByText('₦10.00')).toBeTruthy(); // Pending payout
    expect(screen.getByText('25')).toBeTruthy(); // Link Clicks
    expect(screen.getByText('20%')).toBeTruthy(); // Conversion Rate
    expect(screen.getByText('₦40.00')).toBeTruthy(); // Friend Bonuses Paid

    // Check table headers and rows
    expect(screen.getByText('Your Earnings')).toBeTruthy();
    expect(screen.getByText("Friend's Bonus")).toBeTruthy();
    expect(screen.getByText('John Doe')).toBeTruthy();
    expect(screen.getByText('Active')).toBeTruthy();
    expect(screen.getByText('₦125.00')).toBeTruthy(); // Recent referral commission
    expect(screen.getByText('₦30.00')).toBeTruthy(); // Recent referral referee reward
  });
});
