#!/usr/bin/env node
import { runCli } from '../src/cli.js';

try {
  const exitCode = await runCli(process.argv.slice(2), {
    cwd: process.cwd(),
    env: process.env,
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr
  });
  process.exitCode = exitCode;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
