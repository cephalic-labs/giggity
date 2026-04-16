export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL?.trim() || "http://localhost:8000";

export const persistAuthContext = async (
  accessToken: string,
  refreshToken: string,
) => {
  const meRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!meRes.ok) {
    throw new Error("Unable to load your worker profile.");
  }

  const me = (await meRes.json()) as { user_id: number; role: string; email: string };
  const userRes = await fetch(`${API_BASE}/api/v1/users/${me.user_id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!userRes.ok) {
    throw new Error("Unable to load account details.");
  }

  const user = (await userRes.json()) as { name: string; current_zone: string };

  localStorage.setItem("giggity_access_token", accessToken);
  localStorage.setItem("giggity_refresh_token", refreshToken);
  localStorage.setItem("giggity_user_id", me.user_id.toString());
  localStorage.setItem("giggity_role", me.role);
  localStorage.setItem("giggity_zone", user.current_zone);
  localStorage.setItem("giggity_worker_name", user.name);
};

export const signIn = async (email: string, password: string) => {
  const tokenRes = await fetch(`${API_BASE}/api/v1/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: email.trim(),
      password,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error("Invalid email or password.");
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
  };

  await persistAuthContext(tokenData.access_token, tokenData.refresh_token);
};
