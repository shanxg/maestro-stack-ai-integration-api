// 1. IMPORTS: Bring in Jest utilities. amqplib is mocked below, so no RabbitMQ server is needed.
import { describe, it, expect, jest } from '@jest/globals';
import { captureLogs } from './helpers/logCapture.js';

// 🐇 AMQPLIB MOCK: Record the connection options instead of opening a TCP connection.
// The fake channel answers the calls the broker makes after connecting, and consume()
// keeps the message handler so a test can deliver a message to it.
type MessageHandler = (message: { content: Buffer } | null) => Promise<void>;
const fakeChannel = {
  // The topology (src/queue/topology.ts): dead-letter exchange, dead-letter queue, binding, main queue.
  assertExchange: jest.fn(async (_exchange: string, _type: string, _options?: object) => ({})),
  bindQueue: jest.fn(async (_queue: string, _exchange: string, _pattern: string) => ({})),
  assertQueue: jest.fn(async (_queue: string, _options?: object) => ({})),
  consume: jest.fn(async (_queue: string, _onMessage: MessageHandler) => ({ consumerTag: 'test-consumer' })),
  ack: jest.fn(),
  nack: jest.fn(),
  close: jest.fn(async () => undefined)
};
const fakeConnection = { createChannel: async () => fakeChannel, close: jest.fn(async () => undefined) };
const connectMock = jest.fn(async (_options: unknown) => fakeConnection);
jest.unstable_mockModule('amqplib', () => {
  return {
    default: { connect: connectMock },
    connect: connectMock
  };
});

// 2. DYNAMIC IMPORTS: They run after the mock above is registered (ESM has no mock hoisting).
const { EventBrokerService } = await import('../src/services/EventBrokerService.js');
const { env } = await import('../src/config.js');
const { logger } = await import('../src/logger.js');

describe('EventBrokerService (RabbitMQ connection)', () => {
  // TEST 1: Verify that the broker logs in with the configured account (CWE-1392).
  // Condition: tests/setupEnv.ts provides RABBIT_USER and a random RABBIT_PASSWORD.
  it('connects with RABBIT_USER and RABBIT_PASSWORD and never logs the password', async () => {
    // Everything the broker logs while connecting (issue #53: through the shared logger).
    const logs = captureLogs(logger);

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

    expect(logs.text()).not.toContain(env.RABBIT_PASSWORD);

    logs.restore();
  });

  // TEST 2: Verify the queue consumer stores the queued hash through the trusted path (issue #41).
  // Condition: A 'user_created' message carries the bcrypt hash computed by UserController.
  it('passes the queued hash to createUserWithPasswordHash, never to createUser', async () => {
    const userService = {
      createUser: jest.fn(),
      // Typed with the real signature (name, email, passwordHash), so the toHaveBeenCalledWith
      // checks are type-checked against it.
      createUserWithPasswordHash: jest.fn<(name: string, email: string, passwordHash: string) => Promise<{ id: string }>>(
        async () => ({ id: 'queued-id' })
      )
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
  });

  // A stand-in for the Express response of one open /api/v1/events connection.
  const fakeStream = () => ({ setHeader: jest.fn(), write: jest.fn(), on: jest.fn() });

  // TEST 3: Verify the event stream no longer opens itself to every website (CWE-942, issue #35).
  // Condition: registerSSEClient sets the stream headers but no 'Access-Control-Allow-Origin';
  // the global cors middleware in app.ts answers with an allowed origin only.
  it('opens the event stream without a wildcard Access-Control-Allow-Origin header', async () => {
    const broker = new EventBrokerService();
    await new Promise((resolve) => setImmediate(resolve));

    const stream = fakeStream();
    broker.registerSSEClient({} as never, stream as never);

    expect(stream.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(stream.setHeader).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything());
  });

  // TEST 4: Verify a new account is announced on the stream by its id only (issue #35).
  // Condition: Every signed-in account receives the stream, but only admins may read other records
  // (AUTHZ-01), so the user_created event must not carry the name or the e-mail.
  it('broadcasts user_created with the new id only, never the name or e-mail', async () => {
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
  });

  // TEST 5: Verify the consumer logs a new account by its id, never by its e-mail or name (CWE-532, issue #53).
  // Condition: A valid 'user_created' message; before, the consumer printed the e-mail of every new account.
  it('logs the account created from the queue without its e-mail or name', async () => {
    const userService = {
      createUserWithPasswordHash: jest.fn(async () => ({ id: 'queued-id', name: 'Lucas Fila', email: 'lucas.fila@maestro.com' }))
    };
    fakeChannel.consume.mockClear();
    new EventBrokerService(userService as never);
    await new Promise((resolve) => setImmediate(resolve));
    const onMessage = fakeChannel.consume.mock.calls[0]?.[1] as MessageHandler;

    const logs = captureLogs(logger);
    try {
      await onMessage({
        content: Buffer.from(JSON.stringify({
          action: 'user_created',
          data: { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: '$2b$12$' + 'a'.repeat(53) }
        }))
      });

      // The id identifies the record; the personal fields stay out of every log line.
      expect(logs.text()).toContain('queued-id');
      expect(logs.text()).not.toContain('lucas.fila@maestro.com');
      expect(logs.text()).not.toContain('Lucas Fila');
    } finally {
      logs.restore();
    }
  });

  // TEST 6: Verify the consumer invalidates the users cache once the account is saved, not before (issue #52).
  // Condition: One message is saved and one fails; only the saved one may make the cached pages stale.
  it('invalidates the users cache after saving a queued account, and not when saving fails', async () => {
    const usersCache = { invalidate: jest.fn(async () => undefined) };
    const userService = {
      // Typed with the real signature (name, email, passwordHash), so the toHaveBeenCalledWith
      // checks are type-checked against it.
      createUserWithPasswordHash: jest.fn<(name: string, email: string, passwordHash: string) => Promise<{ id: string }>>(
        async () => ({ id: 'queued-id' })
      )
    };
    fakeChannel.consume.mockClear();
    new EventBrokerService(userService as never, usersCache as never);
    await new Promise((resolve) => setImmediate(resolve));
    const onMessage = fakeChannel.consume.mock.calls[0]?.[1] as MessageHandler;
    const message = () => ({
      content: Buffer.from(JSON.stringify({
        action: 'user_created',
        data: { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: '$2b$12$' + 'a'.repeat(53) }
      }))
    });

    await onMessage(message());
    expect(usersCache.invalidate).toHaveBeenCalledTimes(1);
    expect(usersCache.invalidate.mock.invocationCallOrder[0]).toBeGreaterThan(
      userService.createUserWithPasswordHash.mock.invocationCallOrder[0] as number
    );

    userService.createUserWithPasswordHash.mockRejectedValueOnce(new Error('duplicate key value'));
    await onMessage(message());
    expect(usersCache.invalidate).toHaveBeenCalledTimes(1);
  });

  // TEST 7: Verify close() ends the open event streams and closes the channel and the connection (issue #51).
  // Condition: One stream is open; an open stream would keep server.close() waiting until SIGKILL.
  it('close() ends every open stream and closes the RabbitMQ channel and connection', async () => {
    const broker = new EventBrokerService();
    await new Promise((resolve) => setImmediate(resolve));
    const stream = { ...fakeStream(), end: jest.fn() };
    broker.registerSSEClient({} as never, stream as never);
    fakeChannel.close.mockClear();
    fakeConnection.close.mockClear();
    expect(broker.isConnected()).toBe(true);

    await broker.close();

    expect(stream.end).toHaveBeenCalledTimes(1);
    expect(fakeChannel.close).toHaveBeenCalledTimes(1);
    expect(fakeConnection.close).toHaveBeenCalledTimes(1);
    expect(broker.isConnected()).toBe(false);
  });

  // TEST 8: Verify a closed broker stops its reconnection loop, so the process can exit (issue #51).
  // Condition: The first connection attempt fails, which schedules a retry in 5 seconds.
  it('close() cancels a scheduled reconnection', async () => {
    jest.useFakeTimers();
    try {
      connectMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5672'));
      connectMock.mockClear();
      const broker = new EventBrokerService();
      await Promise.resolve();
      await Promise.resolve();

      await broker.close();
      jest.advanceTimersByTime(10_000);

      expect(connectMock).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  // Start a consumer with the given service and return its message handler (issue #50 tests).
  const startConsumer = async (userService: object, usersCache?: object) => {
    fakeChannel.consume.mockClear();
    fakeChannel.ack.mockClear();
    fakeChannel.nack.mockClear();
    new EventBrokerService(userService as never, usersCache as never);
    await new Promise((resolve) => setImmediate(resolve));
    return fakeChannel.consume.mock.calls[0]?.[1] as MessageHandler;
  };
  const registration = (data: Record<string, unknown>) => ({
    content: Buffer.from(JSON.stringify({ action: 'user_created', data }))
  });
  const validData = { name: 'Lucas Fila', email: 'lucas.fila@maestro.com', password: '$2b$12$' + 'a'.repeat(53) };

  // TEST 9: Verify the queue is declared with a dead-letter exchange, so rejected messages are kept (issue #50).
  // Condition: Before, 'user_events' had no dead-letter exchange and RabbitMQ deleted every nacked message.
  it('declares user_events with a dead-letter exchange bound to user_events.dead', async () => {
    fakeChannel.assertExchange.mockClear();
    fakeChannel.assertQueue.mockClear();
    fakeChannel.bindQueue.mockClear();

    new EventBrokerService();
    await new Promise((resolve) => setImmediate(resolve));

    expect(fakeChannel.assertExchange).toHaveBeenCalledWith('user_events.dlx', 'fanout', { durable: true });
    expect(fakeChannel.assertQueue).toHaveBeenCalledWith('user_events.dead', { durable: true });
    expect(fakeChannel.bindQueue).toHaveBeenCalledWith('user_events.dead', 'user_events.dlx', '');
    expect(fakeChannel.assertQueue).toHaveBeenCalledWith('user_events', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'user_events.dlx' }
    });
  });

  // TEST 10: Verify a registration for an e-mail that already has an account is acknowledged on purpose,
  // without touching the cache or the stream, and logged without the e-mail (issue #50).
  // Condition: The repository reports a duplicate; before, the consumer logged a failure and dropped it.
  it('acknowledges a duplicate e-mail registration and changes nothing', async () => {
    const { DuplicateEmailError } = await import('../src/errors/DuplicateEmailError.js');
    const usersCache = { invalidate: jest.fn(async () => undefined) };
    const onMessage = await startConsumer({
      createUserWithPasswordHash: jest.fn(async () => { throw new DuplicateEmailError(); })
    }, usersCache);
    const message = registration(validData);
    const logs = captureLogs(logger);

    try {
      await onMessage(message);

      expect(fakeChannel.ack).toHaveBeenCalledWith(message);
      expect(fakeChannel.nack).not.toHaveBeenCalled();
      expect(usersCache.invalidate).not.toHaveBeenCalled();
      expect(logs.text()).toContain('already has an account');
      expect(logs.text()).not.toContain(validData.email);
    } finally {
      logs.restore();
    }
  });

  // TEST 11: Verify malformed registrations never reach the service and go to the dead-letter queue (issue #50).
  // Condition: A body that is not JSON, an invalid e-mail and a plaintext password; before, the consumer
  // passed whatever JSON.parse returned to the service.
  it('dead-letters malformed registrations without calling the service', async () => {
    const service = { createUserWithPasswordHash: jest.fn(async () => ({ id: 'never' })) };
    const onMessage = await startConsumer(service);
    const notJson = { content: Buffer.from('{not-json') };
    const badEmail = registration({ ...validData, email: 'email_invalido' });
    const plaintext = registration({ ...validData, password: 'senha-em-texto' });

    for (const message of [notJson, badEmail, plaintext]) {
      await onMessage(message);
    }

    expect(service.createUserWithPasswordHash).not.toHaveBeenCalled();
    expect(fakeChannel.nack).toHaveBeenNthCalledWith(1, notJson, false, false);
    expect(fakeChannel.nack).toHaveBeenNthCalledWith(2, badEmail, false, false);
    expect(fakeChannel.nack).toHaveBeenNthCalledWith(3, plaintext, false, false);
    expect(fakeChannel.ack).not.toHaveBeenCalled();
  });

  // TEST 12: Verify a registration that fails to save goes to the dead-letter queue, not back to the
  // queue (issue #50). Condition: The database is down when the message arrives.
  it('dead-letters a registration whose save fails', async () => {
    const onMessage = await startConsumer({
      createUserWithPasswordHash: jest.fn(async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5433'); })
    });
    const message = registration(validData);

    await onMessage(message);

    expect(fakeChannel.nack).toHaveBeenCalledWith(message, false, false);
    expect(fakeChannel.ack).not.toHaveBeenCalled();
  });
});
