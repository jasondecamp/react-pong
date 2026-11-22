// The stylesheet's custom properties that the playground exposes, with the
// package defaults (src/styles.css).

export type Theme = {
  color: string;
  /** Empty leaves the ball its gradient between the paddle colors. */
  ballColor: string;
  /** Empty keeps the package default, which the light and dark palettes each set. */
  leftPaddleColor: string;
  /** Empty follows `color`. */
  rightPaddleColor: string;
  /** Empty keeps the package default, which the light and dark palettes each set. */
  muted: string;
  ballSize: number;
  /** 0 is square, 50 round. */
  ballRadius: number;
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
  muted: '',
  ballSize: 15,
  ballRadius: 0,
  paddleWidth: 15,
  paddleHeight: 15,
  rippleSize: 240,
  rippleDuration: 0.6,
  scoreSize: 50,
  messageSize: 52,
};

const properties: Record<keyof Theme, { property: string; unit: string }> = {
  color: { property: '--pong-color', unit: '' },
  ballColor: { property: '--pong-ball-color', unit: '' },
  leftPaddleColor: { property: '--pong-paddle-left-color', unit: '' },
  rightPaddleColor: { property: '--pong-paddle-right-color', unit: '' },
  muted: { property: '--pong-muted', unit: '' },
  ballSize: { property: '--pong-ball-size', unit: 'px' },
  ballRadius: { property: '--pong-ball-radius', unit: '%' },
  paddleWidth: { property: '--pong-paddle-width', unit: 'px' },
  paddleHeight: { property: '--pong-paddle-height', unit: '%' },
  rippleSize: { property: '--pong-ripple-size', unit: 'px' },
  rippleDuration: { property: '--pong-ripple-duration', unit: 's' },
  scoreSize: { property: '--pong-score-size', unit: 'px' },
  messageSize: { property: '--pong-message-size', unit: 'px' },
};

// A typed color goes into a style sheet as written, so keep it to one value.
const clean = (value: string | number) => String(value).replace(/[;{}<>]/g, '');

/** The package's defaults for the colors that its light and dark palettes set differently. */
export const paletteDefaults = {
  light: { leftPaddleColor: '#a61c28', muted: '#ccc' },
  dark: { leftPaddleColor: '#c42b38', muted: '#555' },
};

/** A CSS declaration for each property that differs from its default. */
export const themeDeclarations = (theme: Theme) => (Object.keys(properties) as (keyof Theme)[])
  .filter((key) => theme[key] !== defaultTheme[key] && theme[key] !== '')
  .map((key) => `${properties[key].property}: ${clean(theme[key])}${properties[key].unit};`);
