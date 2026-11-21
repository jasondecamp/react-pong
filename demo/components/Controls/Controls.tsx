import type { ReactNode } from 'react';
import { ControlsChoice } from './ControlsChoice';
import { ControlsChoiceOption } from './ControlsChoiceOption';
import { ControlsColor } from './ControlsColor';
import { ControlsContext } from './ControlsContext';
import type { ControlValue } from './ControlsContext';
import { ControlsGroup } from './ControlsGroup';
import { ControlsSlider } from './ControlsSlider';
import { ControlsToggle } from './ControlsToggle';
import styles from './Controls.module.scss';

type ControlsProps = {
  values: Record<string, ControlValue>;
  onChange: (name: string, value: ControlValue) => void;
  children: ReactNode;
};

// A panel of labeled inputs bound by name to one values object.
//
//   <Controls values={options} onChange={setOption}>
//     <Controls.Group title='Game'>
//       <Controls.Slider name='winningScore' label='Winning score' min={1} max={21} />
//       <Controls.Toggle name='smack' label='Smack talk' />
//     </Controls.Group>
//   </Controls>
export const Controls = ({ values, onChange, children }: ControlsProps) => (
  <ControlsContext.Provider value={{ values, onChange }}>
    <form className={styles.controls} onSubmit={(event) => event.preventDefault()}>
      {children}
    </form>
  </ControlsContext.Provider>
);

Controls.Group = ControlsGroup;
Controls.Slider = ControlsSlider;
Controls.Toggle = ControlsToggle;
Controls.Color = ControlsColor;
Controls.Choice = ControlsChoice;
Controls.ChoiceOption = ControlsChoiceOption;
