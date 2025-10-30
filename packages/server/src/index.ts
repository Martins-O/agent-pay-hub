import { buildApp } from './app';

async function main(): Promise<void> {
  try {
    const app = await buildApp();
    const { SERVER_HOST, SERVER_PORT } = app.config;

    await app.listen({
      host: SERVER_HOST,
      port: SERVER_PORT
    });

    app.log.info({ host: SERVER_HOST, port: SERVER_PORT }, 'AgentPay Hub server is running');
  } catch (error) {
    const cause = error instanceof Error ? error : new Error('Unknown bootstrap error');
    console.error('Failed to start AgentPay Hub server', cause);
    process.exit(1);
  }
}

void main();
