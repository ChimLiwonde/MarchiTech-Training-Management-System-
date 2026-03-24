import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function requireEnv(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  try {
    const body = await req.json();
    const enrollmentId = body?.enrollment_id;
    const returnUrl = body?.return_url;
    const requestedProgramId = body?.program_id;
    const requestedTraineeId = body?.trainee_id;

    if (!enrollmentId || !returnUrl) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const paychanguSecretKey = requireEnv("PAYCHANGU_SECRET_KEY");

    const callbackUrl =
      body?.callback_url ||
      `${requireEnv("SUPABASE_URL")}/functions/v1/paychangu-webhook`;

    const { data: enrollment } = await supabase
      .from("enrollments")
      .select("id, program_id, trainee_id")
      .eq("id", enrollmentId)
      .maybeSingle();

    if (!enrollment) {
      return new Response(JSON.stringify({ error: "Enrollment not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optionally validate the frontend-provided IDs (defense in depth)
    if (requestedProgramId && requestedProgramId !== enrollment.program_id) {
      return new Response(JSON.stringify({ error: "program_id mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (requestedTraineeId && requestedTraineeId !== enrollment.trainee_id) {
      return new Response(JSON.stringify({ error: "trainee_id mismatch" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: program } = await supabase
      .from("training_programs")
      .select("id, title, fee_amount, currency")
      .eq("id", enrollment.program_id)
      .maybeSingle();

    if (!program) {
      return new Response(JSON.stringify({ error: "Program not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const programId = enrollment.program_id;
    const traineeId = enrollment.trainee_id;
    const amount = Math.round(Number(program.fee_amount ?? 0));
    const currency = program.currency || "MWK";

    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Program fee must be > 0" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const txRef = crypto.randomUUID();
    const customization = {
      title: "M'archiTech Training Payment",
      description: program?.title ? `Payment for: ${program.title}` : "Training payment",
    };

    // Initiate PayChangu hosted checkout (test mode depends on the API key you provide)
    const resp = await fetch("https://api.paychangu.com/payment", {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${paychanguSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount,
        currency,
        callback_url: callbackUrl,
        return_url: returnUrl,
        tx_ref: txRef,
        customization,
        meta: {
          program_id: programId,
          trainee_id: traineeId,
          enrollment_id: enrollmentId,
          tx_ref: txRef,
        },
      }),
    });

    const json = await resp.json();
    if (!resp.ok || json?.status !== "success") {
      return new Response(JSON.stringify({ error: "PayChangu initiation failed", details: json }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const checkoutUrl = json?.data?.checkout_url;
    if (!checkoutUrl) {
      return new Response(JSON.stringify({ error: "Missing checkout_url in PayChangu response", details: json }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        checkout_url: checkoutUrl,
        tx_ref: txRef,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("paychangu-initiate error", e);
    return new Response(JSON.stringify({ error: "Internal initiation error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

