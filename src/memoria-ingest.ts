import {spawn} from 'node:child_process';

export async function ingestIntoMemoria(ndjson: string, command = process.env.MEMORIA_COMMAND ?? 'memoria'): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, ['ingest', '-'], {
      stdio: ['pipe', 'inherit', 'inherit'],
      env: process.env
    });

    child.once('error', (error) => {
      reject(new Error(`Could not start ${command}. Install Hermes Memoria or set MEMORIA_COMMAND.`, {cause: error}));
    });
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ingest failed${signal ? ` with signal ${signal}` : ` with exit code ${code ?? 'unknown'}`}`));
    });

    child.stdin.on('error', (error) => reject(error));
    child.stdin.end(ndjson);
  });
}
