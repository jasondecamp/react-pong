import type { ReactNode } from 'react';
import styles from './ControlsGroup.module.scss';

type ControlsGroupProps = {
  title: string;
  /** A line under the title about the whole group: what it applies to, or why it is disabled. */
  note?: string;
  /** Disables every control in the group. */
  disabled?: boolean;
  children: ReactNode;
};

export const ControlsGroup = ({ title, note, disabled = false, children }: ControlsGroupProps) => (
  <fieldset className={styles.group} disabled={disabled}>
    <legend className={styles.title}>{title}</legend>
    {note != null && <p className={styles.note}>{note}</p>}
    <div className={styles.fields}>{children}</div>
  </fieldset>
);
