import { z } from "zod";
const schema = z.object({
  supabaseUrl: z.string().url(),
  supabaseKey: z.string().min(20),
  revenueCatIosKey: z.string().optional(),
  revenueCatAndroidKey: z.string().optional(),
  posthogKey: z.string().optional(),
  posthogHost: z.string().url().default("https://us.i.posthog.com"),
  sentryDsn: z.string().url().optional(),
});
const raw = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY,
  revenueCatAndroidKey: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY,
  posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  posthogHost: process.env.EXPO_PUBLIC_POSTHOG_HOST,
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN || undefined,
};
export const env = schema.parse(raw);
