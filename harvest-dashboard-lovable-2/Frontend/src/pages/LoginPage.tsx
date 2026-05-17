import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

const CREDENTIALS = { email: "sarah@upspringpr.com", password: "upspring@789" };
export const AUTH_KEY = "upspring_auth";
export const AUTH_USER_KEY = "upspring_auth_user";

export function isAuthenticated(): boolean {
  return localStorage.getItem(AUTH_KEY) === "true";
}

export function getLoggedInEmail(): string | null {
  return localStorage.getItem(AUTH_USER_KEY);
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

const RINGS = [
  { size: 520, x: "72%", y: "60%", delay: 0,   dur: 12 },
  { size: 320, x: "20%", y: "75%", delay: 2,   dur: 16 },
  { size: 200, x: "60%", y: "15%", delay: 1.5, dur: 10 },
];

const BLOBS = [
  { size: 380, x: "65%", y: "55%", delay: 0,   dur: 11 },
  { size: 260, x: "15%", y: "70%", delay: 3,   dur: 14 },
  { size: 180, x: "50%", y: "20%", delay: 1,   dur: 9  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState<string | null>(null);
  const [loading, setLoading]   = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setTimeout(() => {
      if (email === CREDENTIALS.email && password === CREDENTIALS.password) {
        localStorage.setItem(AUTH_KEY, "true");
        localStorage.setItem(AUTH_USER_KEY, email);
        navigate("/dashboard", { replace: true });
      } else {
        setError("Invalid email or password. Please try again.");
        setLoading(false);
      }
    }, 600);
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif",
      background: "#ffffff",
    }}>

      {/* ── LEFT BRAND PANEL ─────────────────────────────────── */}
      <div style={{
        flex: "0 0 45%",
        background: "linear-gradient(150deg, #111010 0%, #1c1508 60%, #0f0f0f 100%)",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "44px 48px",
        minHeight: "100vh",
      }}>

        {/* Animated glow blobs */}
        {BLOBS.map((b, i) => (
          <motion.div key={`blob-${i}`}
            style={{
              position: "absolute",
              left: b.x, top: b.y,
              width: b.size, height: b.size,
              borderRadius: "50%",
              background: "rgba(240,192,64,0.09)",
              filter: "blur(70px)",
              transform: "translate(-50%,-50%)",
              pointerEvents: "none",
            }}
            animate={{ x: [0,20,-15,8,0], y: [0,-15,20,-8,0], scale: [1,1.1,0.92,1.05,1] }}
            transition={{ duration: b.dur, repeat: Infinity, ease: "easeInOut", delay: b.delay }}
          />
        ))}

        {/* Decorative rings */}
        {RINGS.map((r, i) => (
          <motion.div key={`ring-${i}`}
            style={{
              position: "absolute",
              left: r.x, top: r.y,
              width: r.size, height: r.size,
              borderRadius: "50%",
              border: "1px solid rgba(240,192,64,0.1)",
              transform: "translate(-50%,-50%)",
              pointerEvents: "none",
            }}
            animate={{ scale: [1, 1.06, 0.96, 1.03, 1], opacity: [0.5, 0.8, 0.4, 0.7, 0.5] }}
            transition={{ duration: r.dur, repeat: Infinity, ease: "easeInOut", delay: r.delay }}
          />
        ))}

        {/* Dot grid overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          pointerEvents: "none",
        }} />

        {/* Top: Logo */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          style={{ display: "flex", alignItems: "center", gap: 12, position: "relative", zIndex: 1 }}
        >
          <div style={{
            width: 40, height: 40,
            background: "#f0c040",
            borderRadius: 9,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: "0 0 20px rgba(240,192,64,0.35)",
          }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: "#0f0f0f", letterSpacing: -1 }}>U</span>
          </div>
          <span style={{ color: "#ffffff", fontSize: 15, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>
            Upspring
          </span>
        </motion.div>

        {/* Middle: Headline */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2, ease: "easeOut" }}
          style={{ position: "relative", zIndex: 1 }}
        >
          <p style={{
            color: "rgba(240,192,64,0.7)",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 3,
            textTransform: "uppercase",
            marginBottom: 16,
          }}>
            Operations Hub
          </p>
          <h2 style={{
            color: "#ffffff",
            fontSize: 38,
            fontWeight: 700,
            lineHeight: 1.18,
            margin: 0,
            letterSpacing: -0.5,
          }}>
            Where strategy<br />meets data.
          </h2>
          <p style={{
            color: "rgba(255,255,255,0.38)",
            fontSize: 14,
            lineHeight: 1.65,
            marginTop: 18,
            maxWidth: 320,
          }}>
            Track revenue, manage projects, and monitor team performance across every department — all in one place.
          </p>

          {/* Decorative stat pills */}
          <div style={{ display: "flex", gap: 12, marginTop: 36, flexWrap: "wrap" }}>
            {[
              { label: "Revenue Tracking", icon: "$" },
              { label: "Team Utilization", icon: "%" },
              { label: "Project Pipeline", icon: "↗" },
            ].map((pill) => (
              <div key={pill.label} style={{
                display: "flex", alignItems: "center", gap: 7,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 24,
                padding: "7px 14px",
              }}>
                <span style={{ color: "#f0c040", fontSize: 11, fontWeight: 700 }}>{pill.icon}</span>
                <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 500 }}>{pill.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Bottom: Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          style={{
            color: "rgba(255,255,255,0.18)",
            fontSize: 11,
            position: "relative", zIndex: 1,
            letterSpacing: 0.3,
          }}
        >
          © {new Date().getFullYear()} Upspring PR & Marketing Agency
        </motion.p>
      </div>

      {/* ── RIGHT FORM PANEL ─────────────────────────────────── */}
      <div style={{
        flex: 1,
        background: "#ffffff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 48px",
        position: "relative",
      }}>

        {/* Subtle background texture */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "radial-gradient(rgba(0,0,0,0.025) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }} />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15, ease: [0.16,1,0.3,1] }}
          style={{ width: "100%", maxWidth: 380, position: "relative", zIndex: 1 }}
        >
          {/* Heading */}
          <div style={{ marginBottom: 36 }}>
            <h1 style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#111111",
              margin: 0,
              letterSpacing: -0.5,
            }}>
              Welcome back
            </h1>
            <p style={{ color: "#888888", fontSize: 14, marginTop: 6 }}>
              Sign in to access your operations dashboard
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {/* Email */}
            <div>
              <label style={{
                display: "block",
                color: "#444",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 7,
              }}>
                Email address
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                placeholder="Enter your email"
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocusedField("email")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%",
                  background: focusedField === "email" ? "#fffdf5" : "#f9f9f9",
                  border: focusedField === "email" ? "1.5px solid #f0c040" : "1.5px solid #e8e8e8",
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: "#111",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s, background 0.2s",
                  boxShadow: focusedField === "email" ? "0 0 0 3px rgba(240,192,64,0.12)" : "none",
                }}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{
                display: "block",
                color: "#444",
                fontSize: 13,
                fontWeight: 500,
                marginBottom: 7,
              }}>
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                placeholder="Enter your password"
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setFocusedField("password")}
                onBlur={() => setFocusedField(null)}
                style={{
                  width: "100%",
                  background: focusedField === "password" ? "#fffdf5" : "#f9f9f9",
                  border: focusedField === "password" ? "1.5px solid #f0c040" : "1.5px solid #e8e8e8",
                  borderRadius: 10,
                  padding: "12px 14px",
                  color: "#111",
                  fontSize: 14,
                  outline: "none",
                  boxSizing: "border-box",
                  transition: "border-color 0.2s, background 0.2s",
                  boxShadow: focusedField === "password" ? "0 0 0 3px rgba(240,192,64,0.12)" : "none",
                }}
              />
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  background: "#fff5f5",
                  border: "1px solid #fecaca",
                  borderRadius: 9,
                  padding: "10px 14px",
                  color: "#dc2626",
                  fontSize: 13,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 15 }}>⚠</span>
                {error}
              </motion.div>
            )}

            {/* Submit */}
            <motion.button
              type="submit"
              disabled={loading}
              whileTap={{ scale: 0.98 }}
              style={{
                marginTop: 4,
                width: "100%",
                background: loading ? "#f5d878" : "#f0c040",
                color: "#0f0f0f",
                border: "none",
                borderRadius: 10,
                padding: "13.5px",
                fontSize: 14,
                fontWeight: 700,
                cursor: loading ? "not-allowed" : "pointer",
                letterSpacing: 0.3,
                boxShadow: loading ? "none" : "0 4px 20px rgba(240,192,64,0.3)",
                transition: "background 0.2s, box-shadow 0.2s",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
              }}
            >
              {loading ? (
                <>
                  <motion.span
                    animate={{ rotate: 360 }}
                    transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
                    style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #0f0f0f", borderTopColor: "transparent", borderRadius: "50%" }}
                  />
                  Signing in…
                </>
              ) : "Sign In →"}
            </motion.button>
          </form>

          {/* Footer */}
          <p style={{
            color: "#bbb",
            fontSize: 11,
            textAlign: "center",
            marginTop: 28,
            letterSpacing: 0.2,
          }}>
            © {new Date().getFullYear()} Upspring
          </p>
        </motion.div>
      </div>
    </div>
  );
}
