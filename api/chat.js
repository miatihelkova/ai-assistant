import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default async function handler(req, res) {
  // testovací akce
  const action = {
    type: "shopping",
    item: "aviváž"
  };

  // zápis do Supabase
  const { data, error } = await supabase
    .from("shopping")
    .insert([
      {
        item: action.item,
        status: "open"
      }
    ]);

  if (error) {
    return res.status(500).json({
      success: false,
      error
    });
  }

  return res.status(200).json({
    success: true,
    message: "Položka přidána do nákupu",
    data
  });
}
