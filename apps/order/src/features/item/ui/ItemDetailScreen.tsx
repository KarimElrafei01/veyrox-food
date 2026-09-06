import {
  Button,
  IconButton,
  Price,
  Screen,
  SelectionCardGroup,
  StickyBar,
  useT,
} from '@veyroxai/ui';
import type { Locale } from '@veyroxai/i18n';
import type { LoyaltyTier, MenuModifierGroup } from '@veyroxai/contracts';
import { WebviewHeader } from '../../../shared/ui/WebviewHeader.js';
import type { NewCartLine } from '../../../shared/cart-store.js';
import type { ResolvedItem } from '../../menu/usecases/loadMenu.js';
import { useItemConfigurator } from '../hooks/useItemConfigurator.js';
import { isWaived } from '../usecases/configureItem.js';
import styles from './ItemDetailScreen.module.css';

function localized(map: { en: string; 'ar-EG'?: string }, locale: Locale): string {
  return (locale === 'ar-EG' && map['ar-EG']) || map.en;
}

interface ItemDetailScreenProps {
  item: ResolvedItem;
  groups: MenuModifierGroup[];
  optionAvailable: (id: string) => boolean;
  tier: LoyaltyTier | null;
  locale: Locale;
  editingLineId: string | null;
  initial?: { byGroup: Record<string, string[]>; note: string; qty: number };
  onBack: () => void;
  onAdd: (line: NewCartLine) => void;
}

export function ItemDetailScreen({
  item,
  groups,
  optionAvailable,
  tier,
  locale,
  editingLineId,
  initial,
  onBack,
  onAdd,
}: ItemDetailScreenProps): React.JSX.Element {
  const { t } = useT();
  const cfg = useItemConfigurator(item, groups, tier, initial);
  const name = localized(item.name, locale);

  const summaryFor = (): string =>
    groups
      .flatMap((g) =>
        (cfg.selection.byGroup[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)),
      )
      .filter((o): o is NonNullable<typeof o> => o != null)
      .map((o) => localized(o.name, locale))
      .join(' · ');

  const submit = (): void => {
    const line = cfg.commit({ en: item.name.en, ar: item.name['ar-EG'] }, summaryFor());
    if (line) {
      onAdd(line);
    }
  };

  return (
    <Screen
      header={<WebviewHeader title={name} onBack={onBack} />}
      footer={
        <StickyBar>
          <div className={styles.bar}>
            <div className={styles.qty}>
              <IconButton
                icon="remove"
                label={t('common.close')}
                tone="surface"
                disabled={cfg.qty <= 1}
                onClick={() => cfg.setQty(Math.max(1, cfg.qty - 1))}
              />
              <span className={styles.qtyValue}>{cfg.qty}</span>
              <IconButton
                icon="add"
                label={t('menu.add')}
                tone="surface"
                disabled={cfg.qty >= 20}
                onClick={() => cfg.setQty(Math.min(20, cfg.qty + 1))}
              />
            </div>
            <Button
              variant="primary"
              size="lg"
              fullWidth
              spread
              iconStart="shopping-bag"
              onClick={submit}
            >
              <span className={styles.cta}>
                {editingLineId ? t('item.updateCart') : t('item.addToCart')}
              </span>
              <Price minor={cfg.estimateMinor} />
            </Button>
          </div>
        </StickyBar>
      }
    >
      {item.imageUrl ? (
        <div className={styles.hero} style={{ backgroundImage: `url(${item.imageUrl})` }}>
          <div className={styles.heroOverlay}>
            <h1 className={styles.heroTitle}>{name}</h1>
            <Price minor={item.basePriceMinor} tone="accent" size="lg" />
          </div>
        </div>
      ) : (
        <div className={styles.plainHeader}>
          <h1 className={styles.heroTitle}>{name}</h1>
          <Price minor={item.basePriceMinor} tone="accent" size="lg" />
        </div>
      )}

      {item.description ? (
        <p className={styles.description}>{localized(item.description, locale)}</p>
      ) : null}

      <div className={styles.groups}>
        {groups.map((group) => {
          const err = cfg.validation.find((v) => v.groupId === group.id)?.error;
          return (
            <SelectionCardGroup
              key={group.id}
              name={group.id}
              mode={group.selection}
              legend={localized(group.name, locale)}
              hint={
                group.selection === 'single'
                  ? t('item.selectOne')
                  : t('item.selectUpTo', { max: group.maxSelect })
              }
              error={
                err === 'required'
                  ? t('item.chooseRequired')
                  : err === 'min'
                    ? t('item.selectAtLeast', { min: group.minSelect })
                    : err === 'max'
                      ? t('item.selectUpTo', { max: group.maxSelect })
                      : undefined
              }
              value={cfg.selection.byGroup[group.id] ?? []}
              onToggle={(id) => cfg.choose(group, id)}
              options={group.options.map((o) => {
                const waived = isWaived(o.freeForTier, tier);
                return {
                  value: o.id,
                  label: localized(o.name, locale),
                  disabled: !optionAvailable(o.id),
                  trailing:
                    o.priceDeltaMinor === 0 ? (
                      <span className={styles.base}>{t('item.base')}</span>
                    ) : waived ? (
                      <span className={styles.waived}>
                        <Price minor={o.priceDeltaMinor} tone="muted" size="sm" strikethrough />
                        <span className={styles.free}>{t('common.free')}</span>
                      </span>
                    ) : (
                      <Price minor={o.priceDeltaMinor} tone="accent" size="sm" />
                    ),
                };
              })}
            />
          );
        })}
      </div>
    </Screen>
  );
}
