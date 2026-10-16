// 1. IMPORTS: Jest utilities, the YAML parser and Node's file reader.
import fs from 'node:fs';
import yaml from 'js-yaml';
import { describe, it, expect } from '@jest/globals';

// The parts of docker-compose.yml this suite reads: each service and its published ports.
// Compose accepts a port as a short string ("127.0.0.1:5433:5432") or as an object (long syntax).
type PortEntry = string | number | { host_ip?: string; published?: string | number; target?: number };
type ComposeFile = { services: Record<string, { ports?: PortEntry[] }> };

// Host addresses that only the local machine can reach (IPv4 and IPv6 loopback).
const LOOPBACK = new Set(['127.0.0.1', '::1', '[::1]']);

// The host address a port entry binds to, or undefined when it has none (Compose then binds 0.0.0.0).
function hostAddressOf(port: PortEntry): string | undefined {
  if (typeof port === 'object') return port.host_ip;

  // Short syntax: [HOST_IP:]HOST_PORT:CONTAINER_PORT[/PROTOCOL]. With three parts, the first is the
  // address (an IPv6 address is written in brackets, so split on the last two colons only).
  const withoutProtocol = String(port).split('/')[0] ?? '';
  const parts = withoutProtocol.match(/^(.*):([^:]+):([^:]+)$/);
  return parts ? parts[1] : undefined;
}

describe('Local infrastructure (docker-compose.yml)', () => {
  // TEST 1: Verify every backing service is published on the loopback address only (CWE-1327, issue #119).
  // Condition: PostgreSQL, Redis and RabbitMQ (broker and management UI) must not listen on every
  // network interface, where other machines on the same network could reach them.
  it('publishes every port on 127.0.0.1 only', () => {
    const compose = yaml.load(fs.readFileSync('docker-compose.yml', 'utf8')) as ComposeFile;

    const published = Object.entries(compose.services).flatMap(([service, definition]) =>
      (definition.ports ?? []).map((port) => ({ service, port: String(typeof port === 'object' ? port.published : port), host: hostAddressOf(port) ?? '(all interfaces)' }))
    );

    expect(published.length).toBeGreaterThan(0);
    expect(published.filter(({ host }) => !LOOPBACK.has(host))).toEqual([]);
  });
});
