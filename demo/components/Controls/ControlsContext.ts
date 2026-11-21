import { createContext, useContext } from 'react';
import type { PongKeys } from 'react-pong';

export type ControlValue = number | boolean | string | PongKeys;

export type ControlsContextValue = {
  values: Record<string, ControlValue>;
  onChange: (name: string, value: ControlValue) => void;
};

// The default renders every control empty and inert.
export const ControlsContext = createContext<ControlsContextValue>({
  values: {},
  onChange: () => {},
});

export const useControls = () => useContext(ControlsContext);
