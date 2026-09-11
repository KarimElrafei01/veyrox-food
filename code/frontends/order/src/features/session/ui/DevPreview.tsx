import {
  OpenOrderBlockScreen,
  OrderingSuspendedScreen,
  SessionExpiredScreen,
  StoreClosedScreen,
} from './SessionScreens.js';

/** Static previews of the terminal states, reached from the dev picker (`/preview/<state>`). */
export const PREVIEW_STATES = ['closed', 'suspended', 'expired', 'open-order'] as const;

export function DevPreview({
  state,
  onBack,
}: {
  state: string;
  onBack: () => void;
}): React.JSX.Element {
  switch (state) {
    case 'closed':
      return (
        <StoreClosedScreen
          storeName="Brew & Baladi"
          opensAt={new Date(Date.now() + 2.5 * 3_600_000).toISOString()}
          today={null}
          tomorrow={{ opens: '08:00', closes: '23:00' }}
          tier="silver"
          pointsBalance={320}
          whatsappUrl="https://wa.me/"
          onBrowse={onBack}
        />
      );
    case 'suspended':
      return <OrderingSuspendedScreen />;
    case 'expired':
      return <SessionExpiredScreen reopenUrl="https://wa.me/" />;
    case 'open-order':
      return (
        <OpenOrderBlockScreen
          orderNumber="A-27"
          order={null}
          whatsappUrl="https://wa.me/"
          onView={onBack}
        />
      );
    default:
      return <OrderingSuspendedScreen />;
  }
}
