import { Badge, Button, Card, Icon, Price, Screen, Stack, StickyBar, useT } from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import type { MenuItem } from '@veyroxai/contracts';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import styles from './CrossSellScreen.module.css';

/**
 * "People also order" — shown between the cart and the confirm screen when there are
 * pairing suggestions (FR-2.13, design 2.5). Suppressed entirely when there are none;
 * `useCrossSell` decides, `Flow` routes.
 */
export function CrossSellScreen({
  pairings,
  itemCount,
  totalMinor,
  locale,
  onAdd,
  onSkip,
  onContinue,
}: {
  pairings: MenuItem[];
  itemCount: number;
  totalMinor: number | null;
  locale: Locale;
  onAdd: (item: MenuItem) => void;
  onSkip: () => void;
  onContinue: () => void;
}): React.JSX.Element {
  const { t } = useT();
  const name = (item: MenuItem) => (locale === 'ar-EG' && item.name['ar-EG']) || item.name.en;
  const desc = (item: MenuItem) =>
    item.description
      ? (locale === 'ar-EG' && item.description['ar-EG']) || item.description.en
      : null;

  return (
    <Screen
      header={<WebviewHeader title={t('crossSell.title')} onBack={onSkip} />}
      footer={
        <StickyBar>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            spread
            iconEnd="arrow-forward"
            onClick={onContinue}
          >
            <span>{t('crossSell.continue')}</span>
            {totalMinor != null ? <Price minor={totalMinor} /> : null}
          </Button>
          <button type="button" className={styles.keep} onClick={onSkip}>
            {t('crossSell.keepOriginal')}
          </button>
        </StickyBar>
      }
    >
      <Stack gap="md">
        <div className={styles.stepRow}>
          <Badge tone="secondary">{t('crossSell.step')}</Badge>
          <button type="button" className={styles.skip} onClick={onSkip}>
            {t('crossSell.skip')}
          </button>
        </div>

        <Card tone="raised" pad="md">
          <div className={styles.tray}>
            <span className={styles.trayIcon}>
              <Icon name="shopping-bag" size={20} />
            </span>
            <span className={styles.trayText}>{t('crossSell.tray', { count: itemCount })}</span>
            {totalMinor != null ? <Price minor={totalMinor} tone="accent" size="md" /> : null}
          </div>
        </Card>

        <div>
          <h2 className={styles.heading}>{t('crossSell.heading')}</h2>
          <p className={styles.subtitle}>{t('crossSell.subtitle')}</p>
        </div>

        <Stack gap="sm">
          {pairings.map((item) => (
            <Card key={item.id} tone="raised" pad="md">
              <div className={styles.pair}>
                <span className={styles.thumb}>
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <Icon name="restaurant-menu" size={22} />
                  )}
                </span>
                <div className={styles.pairBody}>
                  <span className={styles.pairName}>{name(item)}</span>
                  {desc(item) ? <span className={styles.pairDesc}>{desc(item)}</span> : null}
                  <Price minor={item.basePriceMinor} tone="accent" size="sm" />
                </div>
                <Button variant="outline" size="md" iconStart="add" onClick={() => onAdd(item)}>
                  {t('menu.add')}
                </Button>
              </div>
            </Card>
          ))}
        </Stack>
      </Stack>
    </Screen>
  );
}
