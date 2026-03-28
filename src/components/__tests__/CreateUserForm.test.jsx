import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, test, expect, vi, beforeEach } from 'vitest';
import CreateUserForm from '../CreateUserForm';

// ── Mock ToastContext ─────────────────────────────────────────
// CreateUserForm uses addToast() to show success/error feedback.
// We mock the context so we can assert on which toasts were fired
// without needing a real ToastProvider in the tree.
vi.mock('../../context/ToastContext', () => ({
  useToast: vi.fn(),
}));

import { useToast } from '../../context/ToastContext';

// ── Mock global fetch ─────────────────────────────────────────
// The component makes two kinds of fetch calls:
//   1. GET /api/settings on mount (to load minPasswordLength)
//   2. POST /api/auth/users on submit
// We use vi.fn() so each test can configure exactly what each call returns.
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ───────────────────────────────────────────────────
function makeFetchResponse(body, ok = true, status = ok ? 200 : 400) {
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(body),
  });
}

function setup(props = {}) {
  return {
    user: userEvent.setup(),
    ...render(<CreateUserForm onClose={props.onClose ?? vi.fn()} onCreated={props.onCreated} />),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
describe('CreateUserForm', () => {
  let mockAddToast;

  beforeEach(() => {
    mockAddToast = vi.fn();
    useToast.mockReturnValue({ addToast: mockAddToast });

    // Default: settings fetch succeeds with minLength 10
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ min_password_length: 10 }),
    });
  });

  // ── Rendering ─────────────────────────────────────────────────
  test('renders name, email, password, and role fields', async () => {
    setup();

    // Wait for the settings fetch to resolve so minLength is applied
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/role/i)).toBeInTheDocument();
  });

  // ── Settings fetch on mount ───────────────────────────────────
  test('fetches /api/settings on mount and applies minLength to password input', async () => {
    // Settings return a policy of 14 characters
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ min_password_length: 14 }),
    });

    setup();

    // Wait for the async effect to settle
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/settings');
    });

    const passwordInput = await screen.findByLabelText(/password/i);
    // The minLength attribute drives both browser validation and helper text
    expect(passwordInput).toHaveAttribute('minlength', '14');
  });

  // ── Successful submission ─────────────────────────────────────
  test('shows success toast and calls onClose after successful creation', async () => {
    const onClose = vi.fn();
    const createdUser = { id: 99, email: 'new@example.com', name: 'New Person', role: 'agent' };

    mockFetch
      // First call: settings
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ min_password_length: 10 }),
      })
      // Second call: POST /api/auth/users
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(createdUser),
      });

    const { user } = setup({ onClose });

    // Wait for the settings to load before interacting
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/settings'));

    await user.type(screen.getByLabelText(/name/i), 'New Person');
    await user.type(screen.getByLabelText(/email/i), 'new@example.com');
    await user.type(screen.getByLabelText(/password/i), 'securepassword');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      // Toast message includes the created user's name
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringContaining('New Person'),
        'success'
      );
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ── API failure (409 duplicate email) ─────────────────────────
  test('shows error toast on 409 duplicate email', async () => {
    mockFetch
      // Settings fetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ min_password_length: 10 }),
      })
      // POST /api/auth/users — 409
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: 'Email already in use' }),
      });

    const { user } = setup();

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/settings'));

    await user.type(screen.getByLabelText(/name/i), 'Existing User');
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com');
    await user.type(screen.getByLabelText(/password/i), 'somepassword');

    await user.click(screen.getByRole('button', { name: /create user/i }));

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.stringMatching(/email already in use/i),
        'error'
      );
    });
  });
});
