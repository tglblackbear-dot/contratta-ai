import { useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "./AuthProvider";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { loginSchema, registerSchema, emailSchema } from "../../lib/validators";
import type { z } from "zod";

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;
const TERMS_VERSION = "2026-11";
const PRIVACY_VERSION = "2026-11";

function AuthLayout({ children, eyebrow, title, description }: {
  children: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link to="/login" className="brand-lockup auth-brand">
          <span className="brand-mark">C</span>
          <span><strong>contratta</strong><small>ASSISTENTE JURÍDICO</small></span>
        </Link>
        <div className="auth-promise">
          <span className="eyebrow light-eyebrow">CONTRATOS INTELIGENTES</span>
          <h1>Clareza para formalizar. <em>Confiança para seguir.</em></h1>
          <p>Organize suas informações e acompanhe seus contratos em um só lugar.</p>
          <div className="promise-note"><ShieldCheck size={18} /> Seus documentos pertencem a você.</div>
        </div>
        <span className="auth-aside-foot">CONTRATTA AI · DOCUMENTOS COM MAIS CLAREZA</span>
      </section>
      <section className="auth-form-side">
        <div className="auth-form-wrap">
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
          <p className="auth-description">{description}</p>
          {!isSupabaseConfigured && (
            <div className="setup-notice" role="status">
              <strong>Conexão ainda não configurada</strong>
              <span>Para ativar contas e salvar dados, configure o projeto Supabase separado conforme o README.</span>
            </div>
          )}
          {children}
          <p className="auth-legal">Consulte nossos <Link to="/terms">termos de uso</Link> e a <Link to="/privacy">política de privacidade</Link>.</p>
        </div>
      </section>
    </main>
  );
}

export function LoginPage() {
  const { user, loading } = useAuth();
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });
  if (!loading && user) return <Navigate to="/app" replace />;

  async function onSubmit(values: LoginValues) {
    setErrorMessage("");
    setMessage("");
    if (!supabase) {
      setErrorMessage("Configure as credenciais do Supabase para entrar.");
      return;
    }
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) setErrorMessage(error.message);
  }

  return (
    <AuthLayout eyebrow="BEM-VINDO DE VOLTA" title="Entre na sua conta" description="Acesse seu espaço de trabalho com segurança.">
      <form className="form-stack" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="field-label">E-mail
          <input className="text-input" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register("email")} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </label>
        <label className="field-label">Senha
          <input className="text-input" type="password" autoComplete="current-password" placeholder="Sua senha" {...register("password")} />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </label>
        <div className="form-inline"><span /> <Link to="/forgot-password">Esqueci minha senha</Link></div>
        {errorMessage && <p className="form-message error-message" role="alert">{errorMessage}</p>}
        {message && <p className="form-message success-message" role="status">{message}</p>}
        <button className="button button-primary button-full" disabled={isSubmitting || !isSupabaseConfigured}>
          {isSubmitting ? "Entrando…" : "Entrar"} <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">Ainda não tem uma conta? <Link to="/register">Criar conta</Link></p>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
  });
  if (user) return <Navigate to="/app" replace />;

  async function onSubmit(values: RegisterValues) {
    setErrorMessage("");
    setFeedback("");
    if (!supabase) {
      setErrorMessage("Configure as credenciais do Supabase para criar uma conta.");
      return;
    }
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: {
          full_name: values.name.trim(),
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    if (error) {
      setErrorMessage(error.message);
      return;
    }
    if (data.session) return;
    setFeedback("Conta criada. Verifique seu e-mail para confirmar o cadastro antes de entrar.");
  }

  return (
    <AuthLayout eyebrow="COMECE POR AQUI" title="Crie sua conta" description="Um espaço seguro para organizar seus acordos.">
      <form className="form-stack" onSubmit={handleSubmit(onSubmit)} noValidate>
        <label className="field-label">Nome completo
          <input className="text-input" autoComplete="name" placeholder="Como podemos chamar você?" {...register("name")} />
          {errors.name && <span className="field-error">{errors.name.message}</span>}
        </label>
        <label className="field-label">E-mail
          <input className="text-input" type="email" autoComplete="email" placeholder="voce@exemplo.com" {...register("email")} />
          {errors.email && <span className="field-error">{errors.email.message}</span>}
        </label>
        <label className="field-label">Senha
          <input className="text-input" type="password" autoComplete="new-password" placeholder="Pelo menos 8 caracteres" {...register("password")} />
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </label>
        <label className="field-label">Confirme sua senha
          <input className="text-input" type="password" autoComplete="new-password" placeholder="Digite novamente" {...register("confirmPassword")} />
          {errors.confirmPassword && <span className="field-error">{errors.confirmPassword.message}</span>}
        </label>
        <label className="consent-check">
          <input type="checkbox" aria-invalid={Boolean(errors.acceptTerms)} {...register("acceptTerms")} />
          <span>Li e aceito os <Link to="/terms" target="_blank" rel="noreferrer">termos de uso</Link> e a <Link to="/privacy" target="_blank" rel="noreferrer">política de privacidade</Link>.</span>
        </label>
        {errors.acceptTerms && <span className="field-error" role="alert">{errors.acceptTerms.message}</span>}
        {errorMessage && <p className="form-message error-message" role="alert">{errorMessage}</p>}
        {feedback && <p className="form-message success-message" role="status">{feedback}</p>}
        <button className="button button-primary button-full" disabled={isSubmitting || !isSupabaseConfigured}>
          {isSubmitting ? "Criando conta…" : "Criar conta"} <ArrowRight size={17} />
        </button>
      </form>
      <p className="auth-switch">Já tem uma conta? <Link to="/login">Entrar</Link></p>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setErrorMessage("");
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setErrorMessage("Informe um e-mail válido.");
      return;
    }
    if (!supabase) {
      setErrorMessage("Configure as credenciais do Supabase para recuperar a senha.");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}login`,
    });
    setSubmitting(false);
    if (error) setErrorMessage(error.message);
    else setFeedback("Se houver uma conta com esse e-mail, enviaremos as instruções de recuperação.");
  }

  return (
    <AuthLayout eyebrow="RECUPERAÇÃO DE ACESSO" title="Redefina sua senha" description="Enviaremos um link para o e-mail associado à sua conta.">
      <form className="form-stack" onSubmit={onSubmit}>
        <label className="field-label">E-mail
          <input className="text-input" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        {errorMessage && <p className="form-message error-message" role="alert">{errorMessage}</p>}
        {feedback && <p className="form-message success-message" role="status">{feedback}</p>}
        <button className="button button-primary button-full" disabled={submitting || !isSupabaseConfigured}>
          {submitting ? "Enviando…" : "Enviar link de recuperação"}
        </button>
      </form>
      <p className="auth-switch"><Link to="/login">Voltar para o login</Link></p>
    </AuthLayout>
  );
}
