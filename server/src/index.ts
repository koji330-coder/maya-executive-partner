import { checkAccess } from './access';
import type { Env } from './env';
import { failure } from './http';
import { route } from './routes';

/**
 * The MAYA server.
 *
 * The app talks to this and nothing else (docs/PLATFORM_ARCHITECTURE.md). In
 * production Cloudflare Access sits in front and turns away requests without a
 * service token. `checkAccess` verifies Access's signed token again here, and
 * refuses everything until Access is configured, so a mistake in the Access
 * settings does not leave the keys and memory open.
 */
export default {
  async fetch(request, env): Promise<Response> {
    const denied = await checkAccess(request, env);
    if (denied) {
      return denied;
    }
    try {
      return await route(request, env);
    } catch (error) {
      return failure(error);
    }
  },
} satisfies ExportedHandler<Env>;
