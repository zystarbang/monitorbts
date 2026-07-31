import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-monitor-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const AVAILABLE_TERMS = [
  "comprar ingressos",
  "comprar ingresso",
  "selecionar ingressos",
  "selecionar ingresso",
  "ingressos disponíveis",
  "ingresso disponível",
  "buy tickets",
  "find tickets",
  "select tickets",
  "get tickets",
];

const SOLD_OUT_TERMS = [
  "esgotado",
  "ingressos esgotados",
  "sold out",
  "currently unavailable",
  "indisponível",
  "não há ingressos disponíveis",
  "no tickets available",
];

const BLOCKED_TERMS = [
  "access denied",
  "verify you are human",
  "captcha",
  "unusual traffic",
  "pardon the interruption",
];

type Show = {
  id: string;
  date: string;
  subtitle: string;
  url: string;
  enabled: boolean;
  status: string;
  label: string;
  details: string;
  statusChangedAt: string | null;
};

type PublicData = {
  version: number;
  updatedAt: string | null;
  monitorEnabled: boolean;
  shows: Show[];
  [key: string]: unknown;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

async function inspectPage(url: string): Promise<"available" | "sold_out" | "blocked" | "unknown"> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.7,en;q=0.6",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(20000),
    });

    const text = normalize(await response.text());

    if (
      response.status === 403 ||
      response.status === 429 ||
      containsAny(text, BLOCKED_TERMS)
    ) {
      return "blocked";
    }

    if (containsAny(text, AVAILABLE_TERMS)) return "available";
    if (containsAny(text, SOLD_OUT_TERMS)) return "sold_out";
    return "unknown";
  } catch {
    return "unknown";
  }
}

async function verifyAvailable(url: string): Promise<boolean> {
  const first = await inspectPage(url);
  if (first !== "available") return false;

  await new Promise((resolve) => setTimeout(resolve, 3500));
  const second = await inspectPage(url);
  return second === "available";
}

async function isAuthorizedAdmin(
  request: Request,
  serviceClient: ReturnType<typeof createClient>,
): Promise<boolean> {
  const authorization = request.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;

  const token = authorization.replace("Bearer ", "");
  const { data: userData, error: userError } =
    await serviceClient.auth.getUser(token);

  if (userError || !userData.user) return false;

  const { data: admin } = await serviceClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();

  return Boolean(admin);
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({ ok: false, error: "Método não permitido." }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const monitorSecret = Deno.env.get("MONITOR_SECRET") || "";
  const serviceClient = createClient(supabaseUrl, serviceRole);

  const secretAuthorized =
    monitorSecret.length > 20 &&
    request.headers.get("x-monitor-secret") === monitorSecret;
  const adminAuthorized = await isAuthorizedAdmin(request, serviceClient);

  if (!secretAuthorized && !adminAuthorized) {
    return new Response(
      JSON.stringify({ ok: false, error: "Não autorizado." }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const bucket = "monitor-public";
  const file = "data.json";

  const { data: downloaded, error: downloadError } =
    await serviceClient.storage.from(bucket).download(file);

  if (downloadError || !downloaded) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "data.json ainda não foi enviado para o bucket.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const publicData = JSON.parse(await downloaded.text()) as PublicData;

  if (!publicData.monitorEnabled) {
    return new Response(
      JSON.stringify({ ok: true, changed: false, message: "Monitor desligado." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  let changed = false;
  const nextShows: Show[] = [];

  for (const show of publicData.shows || []) {
    if (!show.enabled || !show.url) {
      nextShows.push(show);
      continue;
    }

    const initialResult = await inspectPage(show.url);
    let nextStatus: "available" | "sold_out" | null = null;

    if (initialResult === "available") {
      const confirmed = await verifyAvailable(show.url);
      if (confirmed) nextStatus = "available";
    } else if (initialResult === "sold_out") {
      nextStatus = "sold_out";
    }

    if (nextStatus && nextStatus !== show.status) {
      changed = true;
      nextShows.push({
        ...show,
        status: nextStatus,
        label:
          nextStatus === "available"
            ? "INGRESSOS DISPONÍVEIS!"
            : "ESGOTADO",
        details:
          nextStatus === "available"
            ? "Disponibilidade confirmada em duas verificações consecutivas."
            : "A página oficial indica ingressos esgotados.",
        statusChangedAt: new Date().toISOString(),
      });
    } else {
      nextShows.push(show);
    }
  }

  if (!changed) {
    return new Response(
      JSON.stringify({
        ok: true,
        changed: false,
        message: "Nenhuma mudança confirmada.",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const updated: PublicData = {
    ...publicData,
    shows: nextShows,
    updatedAt: new Date().toISOString(),
  };

  const body = new Blob(
    [JSON.stringify(updated, null, 2)],
    { type: "application/json;charset=utf-8" },
  );

  const { error: uploadError } = await serviceClient.storage
    .from(bucket)
    .upload(file, body, {
      upsert: true,
      contentType: "application/json",
      cacheControl: "60",
    });

  if (uploadError) {
    return new Response(
      JSON.stringify({ ok: false, error: uploadError.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response(
    JSON.stringify({
      ok: true,
      changed: true,
      message: "Status público atualizado.",
    }),
    {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
