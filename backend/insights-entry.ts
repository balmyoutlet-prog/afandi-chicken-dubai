import {createInsightsHandler} from './insights.mjs';
const secret=Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'))[0]||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
Deno.serve(createInsightsHandler({base:Deno.env.get('SUPABASE_URL'),secret}));
