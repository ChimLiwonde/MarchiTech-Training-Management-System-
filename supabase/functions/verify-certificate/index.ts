import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { certificate_number } = await req.json();

    if (!certificate_number) {
      return new Response(
        JSON.stringify({ found: false, error: "Missing certificate_number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    // Use service role to bypass RLS for public verification
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: cert, error } = await supabase
      .from("certificates")
      .select("certificate_number, issued_at, trainee_id, program_id")
      .eq("certificate_number", certificate_number)
      .maybeSingle();

    if (error || !cert) {
      return new Response(
        JSON.stringify({ found: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch trainee name and program title
    const [profileRes, programRes] = await Promise.all([
      supabase.from("profiles").select("full_name, email").eq("user_id", cert.trainee_id).single(),
      supabase.from("training_programs").select("title").eq("id", cert.program_id).single(),
    ]);

    return new Response(
      JSON.stringify({
        found: true,
        certificate: {
          certificate_number: cert.certificate_number,
          issued_at: cert.issued_at,
          trainee_name: profileRes.data?.full_name || profileRes.data?.email || "Unknown",
          program_title: programRes.data?.title || "Unknown",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ found: false, error: "Internal error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
