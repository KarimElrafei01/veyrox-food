import { useEffect } from 'react';
import { render, waitFor } from '@testing-library/react';
import { ApiError } from '@veyroxai/api-client';
import { beforeEach, expect, it, vi } from 'vitest';
import { sessionFixture } from '../dev/fixtures.js';
import { resolveSession } from '../features/session/usecases/resolveSession.js';
import { SessionProvider, useSession } from './session-context.js';
import { readStoredCustomerSessionToken } from './customer-session-token.js';

vi.mock('../features/session/usecases/resolveSession.js', () => ({
  resolveSession: vi.fn(),
}));

function ResolveOnMount({ token }: { token: string }): React.JSX.Element {
  const { resolve, status } = useSession();
  useEffect(() => {
    void resolve(token);
  }, [resolve, token]);
  return <span>{status}</span>;
}

beforeEach(() => {
  vi.mocked(resolveSession).mockReset();
});

it('stores a resolved customer token for the current browser tab', async () => {
  vi.mocked(resolveSession).mockResolvedValue(sessionFixture);

  render(
    <SessionProvider>
      <ResolveOnMount token="customer-token" />
    </SessionProvider>,
  );

  await waitFor(() => {
    expect(readStoredCustomerSessionToken()).toBe('customer-token');
  });
});

it.each(['SESSION_EXPIRED', 'SESSION_INVALID', 'WHATSAPP_ORDERING_DISABLED'])(
  'clears the tab token when the API returns %s',
  async (code) => {
    vi.mocked(resolveSession).mockRejectedValue(new ApiError(401, { code }, null));

    render(
      <SessionProvider>
        <ResolveOnMount token="customer-token" />
      </SessionProvider>,
    );

    await waitFor(() => {
      expect(readStoredCustomerSessionToken()).toBeNull();
    });
  },
);
