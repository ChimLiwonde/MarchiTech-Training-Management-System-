import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple helper to verify HMAC SHA-256 signatures from PayChangu
async function verifySignature(req: Request, secret: string | null): Promise<boolean> {
  if (!secret) return false;
  const signature = req.headers.get("signature") || req.headers.get("Signature");
  if (!signature) return false;

  const rawBody = await req.clone().text();

  // PayChangu sends signature as a hex string; convert to bytes for crypto verification.
  const signatureHex = signature.trim();
  if (!/^[0-9a-fA-F]+$/.test(signatureHex)) return false;
  const signatureBytes = new Uint8Array(
    signatureHex.match(/.{1,2}/g)?.map((byte) => Number.parseInt(byte, 16)) || [],
  );

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const ok = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBytes,
    new TextEncoder().encode(rawBody),
  );
  return ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const webSecret = Deno.env.get("PAYCHANGU_WEBHOOK_SECRET") || null;

    // Verify signature only when PayChangu includes a signature header.
    // Some integrations send signed webhooks only for the "webhook URL" (not the callback/IPN URL).
    if (webSecret) {
      const signatureHeader = req.headers.get("signature") || req.headers.get("Signature");
      if (signatureHeader) {
        const ok = await verifySignature(req, webSecret);
        if (!ok) {
          return new Response(JSON.stringify({ error: "Invalid signature" }), {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const payload = await req.json();
    // Shape depends on PayChangu; we assume common fields
    const eventType = payload?.event || payload?.type || "";
    const data = payload?.data || payload;

    const status = (data?.status || payload?.status || "").toLowerCase();
    if (!status) {
      return new Response(
        JSON.stringify({ received: true, ignored: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let normalizedPaymentStatus: "successful" | "failed" | "cancelled" | null = null;
    if (status === "success" || status === "successful") {
      normalizedPaymentStatus = "successful";
    } else if (status.includes("fail")) {
      normalizedPaymentStatus = "failed";
    } else if (status.includes("cancel")) {
      normalizedPaymentStatus = "cancelled";
    }

    if (!normalizedPaymentStatus) {
      return new Response(
        JSON.stringify({ received: true, ignored: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const providerReference = data?.id || data?.reference || data?.transaction_id;
    const amount = Number(data?.amount || 0);
    const currency = data?.currency || "MWK";
    const programId = data?.metadata?.program_id;
    const traineeId = data?.metadata?.trainee_id;
    const enrollmentIdMeta = data?.metadata?.enrollment_id || null;

    if (!providerReference || !programId || !traineeId) {
      return new Response(
        JSON.stringify({ error: "Missing metadata" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Upsert payment row
    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id, enrollment_id")
      .eq("program_id", programId)
      .eq("trainee_id", traineeId)
      .maybeSingle();

    let enrollmentId = enrollmentIdMeta || existingPayment?.enrollment_id || null;

    if (!existingPayment) {
      // Try to find an existing enrollment
      if (!enrollmentId) {
        const { data: enrollment } = await supabase
          .from("enrollments")
          .select("id")
          .eq("program_id", programId)
          .eq("trainee_id", traineeId)
          .maybeSingle();
        enrollmentId = enrollment?.id || null;
      }

      await supabase.from("payments").insert({
        trainee_id: traineeId,
        program_id: programId,
        enrollment_id: enrollmentId,
        provider: "paychangu",
        provider_reference: providerReference,
        amount: Number.isFinite(amount) && amount > 0 ? amount : 0,
        currency: currency || "MWK",
        status: normalizedPaymentStatus,
        raw_payload: payload,
      });
    } else {
      const updatePayload: Record<string, unknown> = {
        provider_reference: providerReference,
        status: normalizedPaymentStatus,
        raw_payload: payload,
      };
      if (Number.isFinite(amount) && amount > 0) updatePayload.amount = amount;
      if (currency) updatePayload.currency = currency;

      await supabase.from("payments").update(updatePayload).eq("id", existingPayment.id);
    }

    // Approve/reject enrollment based on payment outcome
    if (enrollmentId) {
      if (normalizedPaymentStatus === "successful") {
        await supabase
          .from("enrollments")
          .update({ status: "approved" })
          .eq("id", enrollmentId);
      } else {
        await supabase
          .from("enrollments")
          .update({ status: "rejected" })
          .eq("id", enrollmentId);
      }
    }

    return new Response(
      JSON.stringify({ received: true, updated: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("paychangu-webhook error", e);
    return new Response(
      JSON.stringify({ error: "Internal webhook error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

