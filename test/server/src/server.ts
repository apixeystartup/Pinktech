import { app } from './app';
import { connectDb } from './config/db';
import { env } from './config/env';

async function bootstrap() {
  await connectDb();
  app.listen(env.port, () => {
    console.log(
      `[nutrimax-saas] listening on http://127.0.0.1:${env.port} ` +
      `(env=${env.nodeEnv})`
    );
  });
}

bootstrap().catch((err) => {
  console.error('[nutrimax-saas] failed to start:', err);
  process.exit(1);
});
