import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import LoginForm from '../LoginForm';

// ── Mock AuthContext ──────────────────────────────────────────
// LoginForm depends on useAuth() for the login() function. We mock the entire
// module so we can control what login() does in each test scenario.
vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from '../../context/AuthContext';

// ── Helpers ───────────────────────────────────────────────────
// Returns a fresh userEvent instance bound to the jsdom environment.
// Using setup() (rather than calling userEvent directly) gives us pointer
// events and proper event ordering — closer to how a real browser behaves.
function setup(ui) {
  return {
    user: userEvent.setup(),
    ...render(ui),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('LoginForm', () => {
  beforeEach(() => {
    // Default mock: login resolves successfully.
    // Individual tests override this when they want a different outcome.
    useAuth.mockReturnValue({
      login: vi.fn().mockResolvedValue({ id: 1, email: 'a@b.com', name: 'Test' }),
    });
  });

  test('renders email field, password field, and submit button', () => {
    render(<LoginForm />);

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  test('calls login() with the entered credentials on submit', async () => {
    const mockLogin = vi.fn().mockResolvedValue({});
    useAuth.mockReturnValue({ login: mockLogin });

    const { user } = setup(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'agent@company.com');
    await user.type(screen.getByLabelText(/password/i), 'hunter2');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // login() must receive the trimmed email and the raw password
    expect(mockLogin).toHaveBeenCalledWith('agent@company.com', 'hunter2');
  });

  test('shows inline error message when login() rejects', async () => {
    useAuth.mockReturnValue({
      login: vi.fn().mockRejectedValue(new Error('Invalid email or password')),
    });

    const { user } = setup(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'bad@example.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    // The error div has role="alert" — query by role for accessibility-aware tests
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid email or password');
    });
  });

  test('disables submit button while login is in progress', async () => {
    // A promise that never resolves simulates an in-flight request.
    // We can assert the disabled state before it completes.
    useAuth.mockReturnValue({
      login: vi.fn().mockReturnValue(new Promise(() => {})),
    });

    const { user } = setup(<LoginForm />);

    await user.type(screen.getByLabelText(/email/i), 'agent@company.com');
    await user.type(screen.getByLabelText(/password/i), 'password123');

    const button = screen.getByRole('button', { name: /sign in/i });
    await user.click(button);

    // After click, the button text changes and the element becomes disabled
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
  });
});
