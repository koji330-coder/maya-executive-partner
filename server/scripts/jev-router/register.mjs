// Lets Node run the eval harness straight from TypeScript, importing the real
// ToolDeclarations from server/src. Node strips the types itself; this hook only
// fills in what the Worker bundler normally does: extensionless relative imports
// ("./clock") and the "@/" alias for the app's src/.
import { register } from 'node:module';

register('./resolve-hook.mjs', import.meta.url);
