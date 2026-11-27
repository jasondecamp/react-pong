import classNames from 'classnames';
import { useEffect, useState } from 'react';
import { Pong } from 'react-pong';
import type { PongKeys, PongOptions, PongTheme } from 'react-pong';
import { defaultKeys, defaultOptions } from 'react-pong/core';
import { defaultTheme, paletteDefaults, themeDeclarations } from '../../theme';
import type { Theme } from '../../theme';
import { useSystemDark } from '../../useSystemDark';
import { Controls } from '../Controls/Controls';
import type { ControlValue } from '../Controls/ControlsContext';
import { LobbyWatch } from '../LobbyWatch/LobbyWatch';
import styles from './App.module.scss';

type Options = Required<Pick<PongOptions, 'winningScore' | 'difficulty' | 'attract' | 'smack' | 'sound' | 'ripple' | 'trail' | 'toss' | 'keys' | 'paddleSpeed'>>
  & { theme: PongTheme };

const letterKeys: PongKeys = { w: 'up', s: 'down', Enter: 'serve', ' ': 'pause', Escape: 'reset', '?': 'help', d: 'difficulty' };

// A key like `?` has to be quoted to be an object key.
const formatKey = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : `'${key}'`);

const initialOptions: Options = {
  winningScore: defaultOptions.winningScore,
  difficulty: defaultOptions.difficulty,
  attract: defaultOptions.attract,
  smack: defaultOptions.smack,
  sound: defaultOptions.sound,
  ripple: defaultOptions.ripple,
  trail: defaultOptions.trail,
  toss: defaultOptions.toss,
  keys: defaultKeys,
  paddleSpeed: defaultOptions.paddleSpeed,
  theme: 'system',
};

const formatProp = (name: string, value: ControlValue) => {
  if (value === true) return name;
  if (typeof value === 'string') return `${name}='${value}'`;
  if (typeof value === 'object') {
    const entries = Object.entries(value).map(([key, action]) => `${formatKey(key)}: '${action}'`);
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

// The two-player server: the one named when the playground was built, or in development the one
// `pnpm dev:server` runs. With neither there is no two-player.
const server = import.meta.env.VITE_PONG_SERVER || (import.meta.env.DEV ? 'ws://localhost:8787' : undefined);

// The playground: the game filling the window, as the original's page did,
// beside a panel of controls for every option and theme property.
export const App = () => {
  const [options, setOptions] = useState(initialOptions);
  const [theme, setTheme] = useState(defaultTheme);
  const [panelOpen, setPanelOpen] = useState(false);
  // The winning score of the two-player lobby the game is in, or `null` when it is in none.
  const [lobbyScore, setLobbyScore] = useState<number | null>(null);
  const inLobby = lobbyScore != null;
  const standardNote = inLobby ? 'The standard court\'s in two player.' : undefined;
  const systemDark = useSystemDark();
  const declarations = themeDeclarations(theme);
  const dark = options.theme === 'dark' || (options.theme === 'system' && systemDark);
  const palette = dark ? paletteDefaults.dark : paletteDefaults.light;

  // The page wears the game's theme: global.scss follows the system unless the root element names one.
  useEffect(() => {
    if (options.theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = options.theme;
  }, [options.theme]);

  const setOption = (name: string, value: ControlValue) => setOptions((current) => ({ ...current, [name]: value }));
  const setThemeValue = (name: string, value: ControlValue) => setTheme((current): Theme => ({ ...current, [name]: value }));

  return (
    <main className={styles.scene}>
      {/* The theme goes through a style sheet: custom properties never go in inline styles. */}
      {declarations.length > 0 && <style>{`.${styles.game} { ${declarations.join(' ')} }`}</style>}
      <div className={styles.stage}>
        <Pong
          className={styles.game}
          {...options}
          server={server}
          onDifficultyChange={(difficulty) => setOption('difficulty', difficulty)}
        >
          <Pong.Court autoFocus />
          <Pong.Score />
          <Pong.Message />
          <Pong.Help />
          <Pong.Lobby />
          <LobbyWatch onChange={setLobbyScore} />
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
            Click the court, then press Enter to serve. Up and down move your paddle, on the right. Space pauses, ? lists the keys, and D changes the difficulty between games.
          </p>
          {server != null && (
            <p className={styles.help}>
              {inLobby
                ? 'You are in a two-player lobby. The match rules are the lobby\'s, and what two player doesn\'t use is switched off until you leave.'
                : 'Press 2 for two player. Each group below says how it applies there.'}
            </p>
          )}
          <Controls values={inLobby ? { ...options, winningScore: lobbyScore } : options} onChange={setOption}>
            <Controls.Group title='Appearance'>
              <Controls.Choice name='theme' label='Light or dark'>
                <Controls.ChoiceOption value='system' label='System' />
                <Controls.ChoiceOption value='light' label='Light' />
                <Controls.ChoiceOption value='dark' label='Dark' />
              </Controls.Choice>
            </Controls.Group>
            <Controls.Group
              title='Match rules'
              note={inLobby
                ? 'Shared by both players. Set when this lobby was created, and fixed until you leave it.'
                : 'In two player: shared by both players. Whoever creates the lobby sets them, and they are fixed from then on.'}
              disabled={inLobby}
            >
              <Controls.Slider name='winningScore' label='Winning score' min={1} max={21} />
            </Controls.Group>
            <Controls.Group title='Single player only' note='Not used in two player.' disabled={inLobby}>
              <Controls.Choice name='difficulty' label='Difficulty'>
                <Controls.ChoiceOption value='easy' label='Easy' />
                <Controls.ChoiceOption value='normal' label='Normal' />
                <Controls.ChoiceOption value='hard' label='Hard' />
                <Controls.ChoiceOption value='impossible' label='Impossible' />
              </Controls.Choice>
              <Controls.Slider name='paddleSpeed' label='Paddle speed (court heights/s)' min={0} max={4} step={0.1} />
              <Controls.Toggle name='attract' label='Attract mode' />
              <Controls.Toggle name='smack' label='Smack talk' />
              <Controls.Toggle name='toss' label='Toss for first serve' />
            </Controls.Group>
            <Controls.Group title='Your game' note='In two player: these change only your own screen.'>
              <Controls.Choice name='keys' label='Keys'>
                <Controls.ChoiceOption value={defaultKeys} label='Arrows' />
                <Controls.ChoiceOption value={letterKeys} label='W and S' />
              </Controls.Choice>
              <Controls.Toggle name='sound' label='Sound' />
              <Controls.Toggle name='ripple' label='Ripple' />
              <Controls.Toggle name='trail' label='Ball trail' />
            </Controls.Group>
          </Controls>
          <Controls values={theme} onChange={setThemeValue}>
            <Controls.Group
              title='Theme'
              note='In two player: these change only your own screen, except the ball and paddle sizes, which are fixed.'
            >
              <Controls.Color name='color' label='Color' />
              <Controls.Color name='ballColor' label='Ball (one color)' />
              <Controls.Color name='leftPaddleColor' label='Left paddle' fallback={palette.leftPaddleColor} />
              <Controls.Color name='rightPaddleColor' label='Right paddle' fallback={theme.color} />
              <Controls.Color name='muted' label='Muted' fallback={palette.muted} />
              <Controls.Slider name='ballSize' label='Ball size (px)' min={5} max={60} disabled={inLobby} note={standardNote} />
              <Controls.Slider name='ballRadius' label='Ball roundness (%)' min={0} max={50} />
              <Controls.Slider name='paddleWidth' label='Paddle width (px)' min={5} max={60} disabled={inLobby} note={standardNote} />
              <Controls.Slider name='paddleHeight' label='Paddle height (% of court)' min={5} max={50} disabled={inLobby} note={standardNote} />
              <Controls.Slider name='rippleSize' label='Ripple size (px)' min={20} max={600} />
              <Controls.Slider name='rippleDuration' label='Ripple duration (s)' min={0.1} max={2} step={0.1} />
              <Controls.Slider name='scoreSize' label='Score size (px)' min={20} max={120} />
              <Controls.Slider name='messageSize' label='Message size (px)' min={12} max={100} />
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
