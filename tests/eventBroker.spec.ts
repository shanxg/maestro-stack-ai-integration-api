// 1. IMPORTS: Bring in Jest utilities. amqplib is mocked below, so no RabbitMQ server is needed.
import { describe, it, expect, jest } from '@jest/globals';

// 🐇 AMQPLIB MOCK: Record the connection options instead of opening a TCP connection.
// The fake channel answers the calls the broker makes after connecting, and consume()
// keeps the message handler so a test can deliver a message to it.
type MessageHandler = (message: { content: Buffer } | null) => Promise<void>;
const fakeChannel = {
  assertQueue: jest.fn(async () => ({})),
  consume: jest.fn(async (_queue: string, _onMessage: MessageHandler) => ({ consumerTag: 'test-consumer' })),
  ack: jest.fn(),
  nack: jest.fn()
};
const connectMock = jest.fn(async (_options: unknown) => ({ createChannel: async () => fakeChannel }));
jest.unstable_mockModule('amqplib', () => {
  return {
    default: { connect: connectMock },
    connect: connectMock
  };
});

// 2. DYNAMIC IMPORTS: They run after the mock above is registered (ESM has no mock hoisting).
const { EventBrokerService } = await import('../src/services/EventBrokerService.js');
const { env } = await import('../src/config.js');

describe('EventBrokerService (RabbitMQ connection)', () => {
  // TEST 1: Verify that the broker logs in with the configured account (CWE-1392).
  // Condition: tests/setupEnv.ts provides RABBIT_USER and a random RABBIT_PASSWORD.
  it('connects with RABBIT_USER and RABBIT_PASSWORD and never logs the password', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    new EventBrokerService();
    // Let the asynchronous connection sequence finish (all of its steps are resolved promises).
    await new Promise((resolve) => setImmediate(resolve));

    expect(connectMock).toHaveBeenCalledWith(expect.objectContaining({
      hostname: env.RABBIT_HOST,
      port: env.RABBIT_PORT,
      username: env.RABBIT_USER,
      password: env.RABBIT_PASSWORD
    }));
    expect(env.RABBIT_USER).not.toBe('guest');

    const logged = logSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain(env.RABBIT_PASSWORD);

    logSpy.mockRestore();
  });

  // TEST 2: Verify the queue consumer stores the queued hash through the trusted path (issue #41).
  // Condition: A 'user_created' message carries the bcrypt hash computed by UserController.
  it('passes the queued hash to createUserWithPasswordHash, never to createUser', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const userService = {
      createUser: jest.fn(),
      createUserWithPasswordHash: jest.fn(async () => ({ id: 'queued-id' }))
    };
    fakeChannel.consume.mockClear();

    new EventBrokerService(userService as never);
    await new Promise((resolve) => setImmediate(resolve));

    const onMessage = fakeChannel.consume.mock.calls[0]?.[1] as MessageHandler;
    const passwordHash = '$2b$12$' + 'a'.repeat(53);
    const message = {
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: passwordHash }
      }))
    };
    await onMessage(message);

    expect(userService.createUserWithPasswordHash).toHaveBeenCalledWith('Lucas Fila', 'lucas.fila@maestro.com', passwordHash);
    expect(userService.createUser).not.toHaveBeenCalled();
    expect(fakeChannel.ack).toHaveBeenCalledWith(message);

    logSpy.mockRestore();
  });

  // A stand-in for the Express response of one open /events connection.
  const fakeStream = () => ({ setHeader: jest.fn(), write: jest.fn(), on: jest.fn() });

  // TEST 3: Verify the event stream no longer opens itself to every website (CWE-942, issue #35).
  // Condition: registerSSEClient sets the stream headers but no 'Access-Control-Allow-Origin';
  // the global cors middleware in app.ts answers with an allowed origin only.
  it('opens the event stream without a wildcard Access-Control-Allow-Origin header', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const broker = new EventBrokerService();
    await new Promise((resolve) => setImmediate(resolve));

    const stream = fakeStream();
    broker.registerSSEClient({} as never, stream as never);

    expect(stream.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(stream.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());

    logSpy.mockRestore();
  });

  // TEST 4: Verify a new account is announced on the stream by its id only (issue #35).
  // Condition: Every signed-in account receives the stream, but only admins may read other records
  // (AUTHZ-01), so the user_created event must not carry the name or the e-mail.
  it('broadcasts user_created with the new id only, never the name or e-mail', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const userService = {
      createUserWithPasswordHash: jest.fn(async () => ({ id: 'queued-id', name: 'Lucas Fila', email: 'lucas.fila@maestro.com' }))
    };
    fakeChannel.consume.mockClear();

    const broker = new EventBrokerService(userService as never);
    await new Promise((resolve) => setImmediate(resolve));
    const stream = fakeStream();
    broker.registerSSEClient({} as never, stream as never);

    const onMessage = fakeChannel.consume.mock.calls[0]?.[1] as MessageHandler;
    await onMessage({
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: '$2b$12$' + 'a'.repeat(53) }
      }))
    });

    const sent = stream.write.mock.calls.map((call) => String(call[0])).filter((text) => text.startsWith('event:'));
    expect(sent).toEqual(['event: user_created\ndata: {"id":"queued-id"}\n\n']);

    logSpy.mockRestore();
  });
});
