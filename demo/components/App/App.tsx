import classNames from 'classnames';
import { useState } from 'react';
import { Pong } from 'react-pong';
import type { PongKeys, PongOptions } from 'react-pong';
import { defaultKeys, defaultOptions } from 'react-pong/core';
import { defaultTheme, themeDeclarations } from '../../theme';
import type { Theme } from '../../theme';
import { Controls } from '../Controls/Controls';
import type { ControlValue } from '../Controls/ControlsContext';
import styles from './App.module.scss';

type Options = Required<Pick<PongOptions, 'winningScore' | 'difficulty' | 'smack' | 'sound' | 'keys' | 'paddleSpeed'>>;

const letterKeys: PongKeys = { w: 'up', s: 'down', Enter: 'serve', Escape: 'pause' };

const initialOptions: Options = {
  winningScore: defaultOptions.winningScore,
  difficulty: defaultOptions.difficulty,
  smack: defaultOptions.smack,
  sound: defaultOptions.sound,
  keys: defaultKeys,
  paddleSpeed: defaultOptions.paddleSpeed,
};

const formatProp = (name: string, value: ControlValue) => {
  if (value === true) return name;
  if (typeof value === 'string') return `${name}='${value}'`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, action]) => `${key}: '${action}'`);
    return `${name}={{ ${entries.join(', ')} }}`;
  }
  return `${name}={${String(value)}}`;
};

/** The JSX and CSS for the current settings, listing only what differs from the defaults. */
const snippet = (options: Options, declarations: string[]) => {
  const props = (Object.keys(options) as (keyof Options)[])
    .filter((key) => options[key] !== initialOptions[key])
    .map((key) => formatProp(key, options[key]));
  if (declarations.length > 0) props.push("className='game'");
  const jsx = props.length === 0 ? '<Pong />' : `<Pong ${props.join(' ')} />`;
  return declarations.length === 0 ? jsx : `${jsx}\n\n.game {\n${declarations.map((line) => `  ${line}`).join('\n')}\n}`;
};

// The playground: the game filling the window, as the original's page did,
// beside a panel of controls for every option and theme property.
export const App = () => {
  const [options, setOptions] = useState(initialOptions);
  const [theme, setTheme] = useState(defaultTheme);
  const [panelOpen, setPanelOpen] = useState(true);
  const declarations = themeDeclarations(theme);

  const setOption = (name: string, value: ControlValue) => setOptions((current) => ({ ...current, [name]: value }));
  const setThemeValue = (name: string, value: ControlValue) => setTheme((current): Theme => ({ ...current, [name]: value }));

  return (
    <main className={styles.scene}>
      {/* The theme goes through a style sheet: custom properties never go in inline styles. */}
      {declarations.length > 0 && <style>{`.${styles.game} { ${declarations.join(' ')} }`}</style>}
      <div className={styles.stage}>
        <Pong className={styles.game} {...options}>
          <Pong.Court autoFocus />
          <Pong.Score />
          <Pong.Message />
        </Pong>
        {!panelOpen && (
          <button type='button' className={classNames(styles.button, styles.show)} onClick={() => setPanelOpen(true)}>
            Show options
          </button>
        )}
      </div>
      {panelOpen && (
        <aside className={styles.panel}>
          <header className={styles.header}>
            <h1 className={styles.title}>react-pong playground</h1>
            <button type='button' className={styles.button} onClick={() => setPanelOpen(false)}>
              Hide
            </button>
          </header>
          <p className={styles.help}>
            Click the court, then press Enter to serve. Up and down move your paddle, on the right. Esc pauses.
          </p>
          <Controls values={options} onChange={setOption}>
            <Controls.Group title='Game'>
              <Controls.Slider name='winningScore' label='Winning score' min={1} max={21} />
              <Controls.Choice name='difficulty' label='Difficulty'>
                <Controls.ChoiceOption value='easy' label='Easy' />
                <Controls.ChoiceOption value='normal' label='Normal' />
                <Controls.ChoiceOption value='hard' label='Hard' />
              </Controls.Choice>
              <Controls.Slider name='paddleSpeed' label='Paddle speed (court heights/s)' min={0} max={4} step={0.1} />
              <Controls.Choice name='keys' label='Keys'>
                <Controls.ChoiceOption value={defaultKeys} label='Arrows' />
                <Controls.ChoiceOption value={letterKeys} label='W and S' />
              </Controls.Choice>
              <Controls.Toggle name='smack' label='Smack talk' />
              <Controls.Toggle name='sound' label='Sound' />
            </Controls.Group>
          </Controls>
          <Controls values={theme} onChange={setThemeValue}>
            <Controls.Group title='Theme'>
              <Controls.Color name='color' label='Color' />
              <Controls.Color name='ballColor' label='Ball' fallback={theme.color} />
              <Controls.Color name='leftPaddleColor' label='Left paddle' fallback={theme.color} />
              <Controls.Color name='rightPaddleColor' label='Right paddle' fallback={theme.color} />
              <Controls.Color name='muted' label='Muted' />
              <Controls.Slider name='ballSize' label='Ball size (px)' min={5} max={60} />
              <Controls.Slider name='paddleWidth' label='Paddle width (px)' min={5} max={60} />
              <Controls.Slider name='paddleHeight' label='Paddle height (% of court)' min={5} max={50} />
              <Controls.Slider name='scoreSize' label='Score size (px)' min={20} max={120} />
              <Controls.Slider name='messageSize' label='Message size (px)' min={12} max={60} />
            </Controls.Group>
          </Controls>
          <button
            type='button'
            className={styles.button}
            onClick={() => {
              setOptions(initialOptions);
              setTheme(defaultTheme);
            }}
          >
            Reset options
          </button>
          <pre className={styles.snippet}>{snippet(options, declarations)}</pre>
        </aside>
      )}
    </main>
  );
};
