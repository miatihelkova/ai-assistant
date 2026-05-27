export default async function handler(req, res) {
  return res.status(200).json({
    SUPABASE_URL_EXISTS: !!process.env.SUPABASE_URL,
    SUPABASE_KEY_EXISTS: !!process.env.SUPABASE_KEY,
    ALL_ENV_KEYS: Object.keys(process.env)
      .filter(key => key.includes("SUPABASE"))
  });
}
