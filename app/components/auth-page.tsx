import { SignIn, SignUp } from "@clerk/react-router";
import { Link } from "react-router";
import { Brand } from "./brand";
import { ThemePicker } from "./theme";
import { ArrowLeft, LockKeyhole } from "lucide-react";
export function AuthPage({ enabled, signup = false }: { enabled: boolean; signup?: boolean }) {
  return (
    <main className="auth-layout">
      <aside className="auth-aside">
        <Brand />
        <div>
          <p className="eyebrow">TU DINERO, CON PERSPECTIVA</p>
          <h1>
            Un poco de orden.
            <br />
            Mucha más claridad.
          </h1>
          <p>Lo que entra, lo que sale y lo que viene. Todo tiene su lugar en Flujario.</p>
        </div>
        <Link to="/" className="inline-flex items-center gap-2 text-sm">
          <ArrowLeft size={16} /> Volver al inicio
        </Link>
      </aside>
      <section className="auth-main">
        <div className="auth-theme">
          <ThemePicker />
        </div>
        {enabled ? (
          signup ? (
            <SignUp routing="path" path="/crear-cuenta" signInUrl="/iniciar-sesion" />
          ) : (
            <SignIn routing="path" path="/iniciar-sesion" signUpUrl="/crear-cuenta" />
          )
        ) : (
          <div className="auth-pending">
            <LockKeyhole size={28} strokeWidth={1.2} />
            <h2>Tu espacio está en preparación.</h2>
            <p>
              El inicio de sesión todavía no está habilitado. Pronto vas a poder crear tu cuenta y
              organizar tus finanzas.
            </p>
            <Link to="/" className="text-link">
              Conocer Flujario ↗
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
