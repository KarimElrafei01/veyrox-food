import { AppHeader, useT } from '@veyroxai/ui';
import { translate, type MessageKey } from '@veyroxai/i18n';
import { useReadySession } from '../session-context.js';

/** The shared header: store name, screen title, loyalty chip, language toggle. */
export function WebviewHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}): React.JSX.Element {
  const { locale, setLocale, t } = useT();
  const session = useReadySession();
  const { customer } = session;

  const loyaltyLabel =
    customer.tier != null
      ? `${translate(locale, `loyalty.tier.${customer.tier}` as MessageKey)} · ${translate(
          locale,
          'loyalty.pointsBalance',
          { points: customer.pointsBalance },
        )}`
      : undefined;

  return (
    <AppHeader
      storeName={session.tenant.name}
      title={title}
      subtitle={subtitle}
      loyaltyLabel={loyaltyLabel}
      languageLabel={locale === 'en' ? 'ع' : 'EN'}
      onToggleLanguage={() => setLocale(locale === 'en' ? 'ar-EG' : 'en')}
      onBack={onBack}
      backLabel={t('common.back')}
      closeLabel={t('common.close')}
      onClose={() => {
        // window.close() only works on a tab/window opened by script — never on
        // one reached by navigation, which is exactly how every real customer
        // gets here (the WhatsApp CTA-URL button). It silently no-ops there, so
        // "X" did nothing on any real phone. Fall back to returning the customer
        // to the WhatsApp chat, which is the only place left to send them.
        window.close();
        window.location.assign('https://wa.me/');
      }}
    />
  );
}
