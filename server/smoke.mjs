const base = process.argv[2] ?? 'ws://localhost:8791';
const origin = process.argv[3] ?? 'http://localhost:5318';
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connect = (path, useOrigin = origin) => new Promise((resolve) => {
  const socket = new WebSocket(`${base}${path}`, { headers: { Origin: useOrigin } });
  const got = [];
  const player = { socket, got, closed: false, failed: false, say: (message) => socket.send(JSON.stringify(message)) };
  socket.addEventListener('message', (event) => got.push(JSON.parse(event.data)));
  socket.addEventListener('close', () => { player.closed = true; resolve(player); });
  socket.addEventListener('error', () => { player.failed = true; resolve(player); });
  socket.addEventListener('open', () => resolve(player));
});

const last = (player, type) => [...player.got].reverse().find((message) => message.type === type);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` ${detail}`}`); };

const stranger = await connect('/lobby/new', 'https://example.com');
check('an origin off the list is refused', stranger.failed || stranger.closed);

const a = await connect('/lobby/new');
a.say({ type: 'hello', version: 2, winningScore: 2 });
await wait(300);
const welcome = last(a, 'welcome');
check('the creator is welcomed with a code', /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(welcome?.state.code ?? ''), JSON.stringify(a.got));
const code = welcome.state.code;

const missing = await connect('/lobby/ZZZZ');
missing.say({ type: 'hello', version: 2 });
await wait(300);
check('an unknown code is not found', last(missing, 'error')?.error === 'notFound', JSON.stringify(missing.got));

const old = await connect(`/lobby/${code}`);
old.say({ type: 'hello', version: 99 });
await wait(300);
check('another protocol version is refused', last(old, 'error')?.error === 'version', JSON.stringify(old.got));

const b = await connect(`/lobby/${code.toLowerCase()}`);
b.say({ type: 'hello', version: 2 });
await wait(300);
check('the joiner is welcomed with the creator\'s winning score', last(b, 'welcome')?.state.winningScore === 2, JSON.stringify(b.got));
check('the creator hears of the joiner', last(a, 'state')?.state.opponent?.connected === true);

check('the creator is the host', last(a, 'welcome')?.state.host === true && last(b, 'welcome')?.state.host === false);
b.say({ type: 'winningScore', winningScore: 9 });
a.say({ type: 'winningScore', winningScore: 3 });
await wait(300);
check('only the host changes the winning score', last(b, 'state')?.state.winningScore === 3, JSON.stringify(b.got));
a.say({ type: 'winningScore', winningScore: 2 });
await wait(300);

const third = await connect(`/lobby/${code}`);
third.say({ type: 'hello', version: 2 });
await wait(300);
check('a third player finds it full', last(third, 'error')?.error === 'full', JSON.stringify(third.got));

a.say({ type: 'ready', ready: true });
b.say({ type: 'ready', ready: true });
await wait(300);
check('both ready starts the match', last(a, 'start') != null && last(b, 'start') != null && last(a, 'start').server !== last(b, 'start').server);

const serve = { type: 'game', time: 1, message: { type: 'ball', kind: 'serve', x: 1170, y: 300, speed: 780, heading: -1, angle: 0.1, contactY: 300 } };
a.say(serve);
await wait(200);
check('a game message reaches the other player', JSON.stringify(last(b, 'game')) === JSON.stringify(serve));
b.say({ type: 'game', time: 2, message: { type: 'miss' } });
await wait(200);
check('a miss scores for the other player', last(a, 'state')?.state.scores.you === 1 && last(b, 'state')?.state.scores.opponent === 1);

a.say({ type: 'ping', time: 5 });
await wait(200);
check('a ping is answered with the server\'s time', last(a, 'pong')?.time === 5 && Math.abs(last(a, 'pong').serverTime - Date.now()) < 5000);

b.say({ type: 'pause', reason: 'manual' });
await wait(200);
a.say({ type: 'resume' });
await wait(200);
check('only the pauser can resume', last(a, 'state')?.state.phase === 'paused');
b.say({ type: 'resume' });
await wait(200);
check('resuming sends a countdown to both', last(a, 'resume') != null && last(b, 'resume') != null && last(a, 'state')?.state.phase === 'playing');

b.socket.close();
await wait(400);
check('a dropped connection pauses the match', last(a, 'state')?.state.pause?.reason === 'disconnected');
const back = await connect(`/lobby/${code}`);
back.say({ type: 'hello', version: 2, seat: last(b, 'welcome').seat });
await wait(400);
check('coming back with the key resumes it', last(back, 'welcome')?.state.scores.opponent === 1 && last(a, 'state')?.state.phase === 'playing');

a.say(serve);
back.say({ type: 'game', time: 3, message: { type: 'miss' } });
await wait(300);
check('the winning score ends the match in the lobby', last(a, 'state')?.state.phase === 'lobby' && last(a, 'state')?.state.scores.you === 2);

back.say({ type: 'leave' });
await wait(300);
check('leaving tells the other player', last(a, 'notice')?.notice === 'opponentLeft' && last(a, 'state')?.state.opponent === null);

a.say('{"type":"nonsense"}');
a.socket.send('not json');
await wait(300);
check('nonsense gets the connection dropped', last(a, 'error')?.error === 'rejected');

for (const player of [a, b, back, third, old, missing, stranger]) player.socket.close();
console.log(results.every(Boolean) ? 'ALL OK' : 'SOME FAILED');
process.exit(results.every(Boolean) ? 0 : 1);
