// The stylesheet's custom properties that the playground exposes, with the
// package defaults (src/styles.css).

export type Theme = {
  color: string;
  /** Empty follows `color`. */
  ballColor: string;
  /** Empty follows `color`. */
  leftPaddleColor: string;
  /** Empty follows `color`. */
  rightPaddleColor: string;
  muted: string;
  ballSize: number;
  paddleWidth: number;
  paddleHeight: number;
  rippleSize: number;
  rippleDuration: number;
  scoreSize: number;
  messageSize: number;
};

export const defaultTheme: Theme = {
  color: '#007ee5',
  ballColor: '',
  leftPaddleColor: '',
  rightPaddleColor: '',
  muted: '#ccc',
  ballSize: 15,
  paddleWidth: 15,
  paddleHeight: 15,
  rippleSize: 240,
  rippleDuration: 0.6,
  scoreSize: 50,
  messageSize: 30,
};

const properties: Record<keyof Theme, { property: string; unit: string }> = {
  color: { property: '--pong-color', unit: '' },
  ballColor: { property: '--pong-ball-color', unit: '' },
  leftPaddleColor: { property: '--pong-paddle-left-color', unit: '' },
  rightPaddleColor: { property: '--pong-paddle-right-color', unit: '' },
  muted: { property: '--pong-muted', unit: '' },
  ballSize: { property: '--pong-ball-size', unit: 'px' },
  paddleWidth: { property: '--pong-paddle-width', unit: 'px' },
  paddleHeight: { property: '--pong-paddle-height', unit: '%' },
  rippleSize: { property: '--pong-ripple-size', unit: 'px' },
  rippleDuration: { property: '--pong-ripple-duration', unit: 's' },
  scoreSize: { property: '--pong-score-size', unit: 'px' },
  messageSize: { property: '--pong-message-size', unit: 'px' },
};

// A typed color goes into a style sheet as written, so keep it to one value.
const clean = (value: string | number) => String(value).replace(/[;{}<>]/g, '');

/** A CSS declaration for each property that differs from its default. */
export const themeDeclarations = (theme: Theme) => (Object.keys(properties) as (keyof Theme)[])
  .filter((key) => theme[key] !== defaultTheme[key])
  .map((key) => `${properties[key].property}: ${clean(theme[key])}${properties[key].unit};`);
