import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: 'div' | 'article' | 'section';
  tone?: 'raised' | 'sunken' | 'flat';
  pad?: 'sm' | 'md' | 'lg' | 'none';
}

export function Card({
  as: Tag = 'div',
  tone = 'raised',
  pad = 'md',
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <Tag
      className={[styles.card, styles[tone], styles[`pad-${pad}`], className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </Tag>
  );
}
