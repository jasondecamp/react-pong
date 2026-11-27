import classNames from 'classnames';
import { useId } from 'react';
import { useControls } from './ControlsContext';
import styles from './ControlsSlider.module.scss';

type ControlsSliderProps = {
  name: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  /** A line under the slider: what it applies to, or why it is disabled. */
  note?: string;
  disabled?: boolean;
};

export const ControlsSlider = ({ name, label, min, max, step = 1, note, disabled = false }: ControlsSliderProps) => {
  const { values, onChange } = useControls();
  const id = useId();
  const value = Number(values[name] ?? min);
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div className={styles.slider}>
      <div className={classNames(styles.header, disabled && styles.disabled)}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className={styles.value}>{value}</output>
      </div>
      <div className={classNames(styles.track, disabled && styles.disabled)}>
        <div className={styles.fillArea}>
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
        <input
          id={id}
          type='range'
          className={styles.input}
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(name, Number(event.target.value))}
        />
      </div>
      {note != null && <p className={styles.note}>{note}</p>}
    </div>
  );
};
