import type { Env } from './env';
import { failure } from './http';
import { route } from './routes';

/**
 * The MAYA server.
 *
 * The app talks to this and nothing else (docs/PLATFORM_ARCHITECTURE.md). In
 * production it sits behind Cloudflare Access, so an unauthenticated request is
 * turned away before it reaches this code; the checks here are about the request
 * being well-formed, not about who sent it.
 */
export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      return failure(error);
    }
  },
} satisfies ExportedHandler<Env>;
