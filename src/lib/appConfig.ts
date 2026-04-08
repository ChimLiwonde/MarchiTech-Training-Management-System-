const normalizeBasePath = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed || trimmed === "/") {
    return "";
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const normalizeApiBaseUrl = (value?: string) => {
  const trimmed = value?.trim() || "";
  if (!trimmed) {
    return "http://localhost/marchitech-api";
  }

  return trimmed.replace(/\/+$/, "");
};

const parseBooleanEnv = (value: string | undefined, fallback: boolean) => {
  if (value == null || value.trim() === "") {
    return fallback;
  }

  return !["0", "false", "no", "off"].includes(value.trim().toLowerCase());
};

export const appBasePath = normalizeBasePath(import.meta.env.VITE_APP_BASENAME);
export const backendMode = import.meta.env.VITE_BACKEND_MODE?.trim().toLowerCase() === "xampp"
  ? "xampp"
  : "supabase";
export const isXamppMode = backendMode === "xampp";
export const xamppApiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL);
export const paymentsEnabled = parseBooleanEnv(
  import.meta.env.VITE_ENABLE_PAYMENTS,
  true,
);

export const buildAppUrl = (path = "/") => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${window.location.origin}${appBasePath}${normalizedPath}`;
};
