import { act, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { stubBrowser } from '../test/browserStubs.js';
import type { BrowserStubs } from '../test/browserStubs.js';
import { stubLobbyServer } from '../test/lobbyServer.js';
import type { LobbyServerStub } from '../test/lobbyServer.js';
import { Pong } from './Pong.js';

let browser: BrowserStubs;
let server: LobbyServerStub;

const settle = () => act(() => server.settle());

beforeEach(() => {
  browser = stubBrowser();
  server = stubLobbyServer();
});

afterEach(() => {
  browser.restore();
  window.history.replaceState(null, '', '/');
});

describe('Pong.Lobby', () => {
  it('renders nothing without a server', () => {
    const { container } = render(<Pong />);
    expect(container.querySelector('.pong-lobby')).not.toBeInTheDocument();
    expect(screen.queryByText(/two player/)).not.toBeInTheDocument();
  });

  it('hints at its key on the start screen, and lists it in the help', () => {
    render(<Pong server='ws://pong.test' />);
    expect(screen.getByText('press 2 for two player')).toHaveClass('pong-hint');
    expect(screen.getByText('Two player', { selector: 'dd' })).toBeInTheDocument();
  });

  it('opens on its key with a button to create a lobby and a field to join one', async () => {
    const user = userEvent.setup();
    const { container } = render(<Pong server='ws://pong.test'><Pong.Court autoFocus /><Pong.Lobby /></Pong>);
    expect(container.querySelector('.pong-lobby')).toHaveClass('pong-lobby-hidden');
    await user.keyboard('2');
    expect(container.querySelector('.pong-lobby')).not.toHaveClass('pong-lobby-hidden');
    expect(screen.queryByText('press 2 for two player')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create lobby' })).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Lobby code' })).toHaveValue('');
    await user.keyboard('{Escape}');
    expect(container.querySelector('.pong-lobby')).toHaveClass('pong-lobby-hidden');
  });

  it('creates a lobby and shows its code, its link, and who is here', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <Pong server='ws://pong.test' winningScore={7}><Pong.Court autoFocus /><Pong.Message /><Pong.Lobby /></Pong>,
    );
    await user.keyboard('2');
    await user.click(screen.getByRole('button', { name: 'Create lobby' }));
    await settle();
    const code = container.querySelector('.pong-lobby-code')?.textContent ?? '';
    expect(code).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
    expect(container.querySelector('.pong-lobby-link')).toHaveTextContent(`http://localhost:3000/?pong=${code}`);
    expect(screen.getByText('Waiting for another player.')).toBeVisible();
    expect(screen.getByText('7')).toHaveClass('pong-lobby-score');
    expect(container.querySelector('.pong-court')).toHaveClass('pong-court-standard');
    expect(screen.getByRole('button', { name: 'Copy link' })).toHaveClass('pong-lobby-button-primary');
    await user.click(screen.getByRole('button', { name: 'Ready' }));
    await settle();
    expect(screen.getByText("You're ready. Waiting for another player.")).toBeVisible();
    expect(screen.getByRole('button', { name: 'Not ready' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Leave' }));
    await settle();
    expect(container.querySelector('.pong-lobby')).toHaveClass('pong-lobby-hidden');
    expect(screen.getByText('Shall we play a game?')).toBeVisible();
  });

  it('joins the lobby whose code is typed, keeping the typing from the game', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Pong server='ws://pong.test'><Pong.Court aria-label='First' /><Pong.Lobby /></Pong>
        <Pong server='ws://pong.test' difficulty='easy'><Pong.Court aria-label='Second' /><Pong.Lobby /><Pong.Help /></Pong>
      </>,
    );
    await user.click(screen.getByRole('application', { name: 'First' }));
    await user.keyboard('2');
    await user.click(screen.getAllByRole('button', { name: 'Create lobby' })[0] as HTMLElement);
    await settle();
    const code = document.querySelector('.pong-lobby-code')?.textContent ?? '';
    await user.click(screen.getByRole('application', { name: 'Second' }));
    await user.keyboard('2');
    const field = screen.getByRole('textbox', { name: 'Lobby code' });
    await user.type(field, code.toLowerCase());
    expect(field).toHaveValue(code);
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await settle();
    // With both players in, being ready leads and the code steps back.
    expect(screen.getAllByText('Your opponent is here')).toHaveLength(2);
    expect(document.querySelector('.pong-lobby-code')).not.toBeInTheDocument();
    expect(document.querySelectorAll('.pong-lobby-code-small')[0]).toHaveTextContent(code);
    const [ready] = screen.getAllByRole('button', { name: 'Ready' });
    expect(ready).toHaveClass('pong-lobby-button-primary');
    await user.click(ready as HTMLElement);
    await settle();
    expect(screen.getByText('Waiting for your opponent')).toHaveClass('pong-lobby-headline');
    expect(screen.getByText('Your opponent is ready')).toHaveClass('pong-lobby-headline');
    // Typing a code changed nothing in the game, though D is its difficulty key and the code may hold one.
    expect(screen.queryByText('normal')).not.toBeInTheDocument();
  });

  it('opens on a lobby\'s link with the code filled in', () => {
    window.history.replaceState(null, '', '/?pong=BDFG');
    const { container } = render(<Pong server='ws://pong.test' />);
    expect(container.querySelector('.pong-lobby')).not.toHaveClass('pong-lobby-hidden');
    expect(screen.getByRole('textbox', { name: 'Lobby code' })).toHaveValue('BDFG');
    // Joining is what the link was for, so it leads and creating steps back.
    expect(screen.getByRole('button', { name: 'Join' })).toHaveClass('pong-lobby-button-primary');
    expect(screen.getByRole('button', { name: 'Create a new lobby' })).toHaveClass('pong-lobby-button-quiet');
  });

  it('says why a lobby couldn\'t be joined', async () => {
    const user = userEvent.setup();
    render(<Pong server='ws://pong.test'><Pong.Court autoFocus /><Pong.Lobby /></Pong>);
    await user.keyboard('2');
    await user.type(screen.getByRole('textbox', { name: 'Lobby code' }), 'zzzz');
    await user.click(screen.getByRole('button', { name: 'Join' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('No lobby has that code.');
  });
});
