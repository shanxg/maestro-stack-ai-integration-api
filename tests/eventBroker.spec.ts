// 1. IMPORTS: Bring in Jest utilities. amqplib is mocked below, so no RabbitMQ server is needed.
import { describe, it, expect, jest } from '@jest/globals';

// 🐇 AMQPLIB MOCK: Record the connection options instead of opening a TCP connection.
// The fake channel answers the two calls the broker makes after connecting.
const fakeChannel = {
  assertQueue: jest.fn(async () => ({})),
  consume: jest.fn(async () => ({ consumerTag: 'test-consumer' }))
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
});
