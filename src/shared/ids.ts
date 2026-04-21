import crypto from 'node:crypto';

export function stableId(prefix: string, ...parts: string[]): string {
  const hash = crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 20);
  return `${prefix}_${hash}`;
}

export function sha256Hex(value: string | Buffer): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}
