import { ControlsColorInput } from './ControlsColorInput';
import { useControls } from './ControlsContext';

type ControlsColorProps = {
  name: string;
  label: string;
  /** The color in effect while the value is empty, shown in the picker. */
  fallback?: string;
};

export const ControlsColor = ({ name, label, fallback }: ControlsColorProps) => {
  const { values, onChange } = useControls();
  return (
    <ControlsColorInput
      label={label}
      value={String(values[name] ?? '')}
      fallback={fallback}
      onChange={(next) => onChange(name, next)}
    />
  );
};
