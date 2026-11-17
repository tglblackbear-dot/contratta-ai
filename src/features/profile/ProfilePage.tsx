import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Save, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { PageTitle, QueryState } from "../../components/ui/Page";
import { requireSupabase } from "../../lib/supabase";
import { formatCpfCnpj, profileSchema } from "../../lib/validators";
import { useAuth } from "../auth/AuthProvider";

interface ProfileForm {
  full_name: string;
  document: string;
  rg: string;
  marital_status: string;
  phone: string;
  profession: string;
  address: string;
}

const emptyProfile: ProfileForm = { full_name: "", document: "", rg: "", marital_status: "", phone: "", profession: "", address: "" };

export function ProfilePage({ onboarding = false }: { onboarding?: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ProfileForm>(emptyProfile);
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const query = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from("profiles")
        .select("full_name,document,rg,marital_status,phone,profession,address").eq("id", user!.id).single();
      if (error) throw error;
      return data as ProfileForm;
    },
    enabled: Boolean(user),
  });
  useEffect(() => {
    if (query.data) {
      setForm({
        ...emptyProfile,
        ...query.data,
        document: query.data.document ?? "",
        rg: query.data.rg ?? "",
        marital_status: query.data.marital_status ?? "",
        phone: query.data.phone ?? "",
        profession: query.data.profession ?? "",
        address: query.data.address ?? "",
      });
    }
  }, [query.data]);
  const save = useMutation({
    mutationFn: async (values: ProfileForm) => {
      const { error } = await requireSupabase().from("profiles").upsert({
        id: user!.id,
        ...values,
        document: values.document.replace(/\D/g, "") || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setErrorMessage("");
      setFeedback("Perfil salvo.");
      void queryClient.invalidateQueries({ queryKey: ["profile", user?.id] });
    },
    onError: (error) => { setFeedback(""); setErrorMessage(error.message); },
  });

  return (
    <>
      <PageTitle
        eyebrow={onboarding ? "PRIMEIROS PASSOS" : "SUA CONTA"}
        title={onboarding ? "Configure seu perfil" : "Meu perfil"}
        description="Mantenha suas informações atualizadas. Campos opcionais podem ser preenchidos depois."
        action={onboarding ? <Link className="button button-secondary" to="/app">Completar depois</Link> : undefined}
      />
      <QueryState loading={query.isLoading} error={query.error as Error | null}>
        <div className="profile-layout">
          <section className="panel profile-panel">
            <div className="section-heading"><div><h2>Dados pessoais</h2><p>Os dados do perfil não são inseridos em contratos sem sua confirmação.</p></div></div>
            <form className="profile-form" onSubmit={(event) => { event.preventDefault(); const parsed = profileSchema.safeParse(form); if (!parsed.success) { setErrorMessage(parsed.error.issues[0]?.message ?? "Confira os dados do perfil."); setFeedback(""); return; } save.mutate(parsed.data); }}>
              <label className="field-label">Nome completo<input className="text-input" value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
              <label className="field-label">CPF ou CNPJ <span className="optional-label">opcional</span><input className="text-input" value={formatCpfCnpj(form.document ?? "")} onChange={(event) => setForm({ ...form, document: formatCpfCnpj(event.target.value) })} /></label>
              <label className="field-label">RG <span className="optional-label">opcional</span><input className="text-input" value={form.rg ?? ""} onChange={(event) => setForm({ ...form, rg: event.target.value })} /></label>
              <label className="field-label">Estado civil <span className="optional-label">opcional</span><input className="text-input" value={form.marital_status ?? ""} onChange={(event) => setForm({ ...form, marital_status: event.target.value })} /></label>
              <label className="field-label">E-mail da conta<input className="text-input" value={user?.email ?? ""} disabled /></label>
              <label className="field-label">Telefone <span className="optional-label">opcional</span><input className="text-input" value={form.phone ?? ""} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label className="field-label">Profissão <span className="optional-label">opcional</span><input className="text-input" value={form.profession ?? ""} onChange={(event) => setForm({ ...form, profession: event.target.value })} /></label>
              <label className="field-label profile-address">Endereço <span className="optional-label">opcional</span><input className="text-input" value={form.address ?? ""} onChange={(event) => setForm({ ...form, address: event.target.value })} /></label>
              {errorMessage && <p className="form-message error-message profile-feedback" role="alert">{errorMessage}</p>}
              {feedback && <p className="form-message success-message profile-feedback" role="status">{feedback}</p>}
              <button className="button button-primary profile-save" disabled={save.isPending}><Save size={16} /> {save.isPending ? "Salvando…" : "Salvar alterações"}</button>
            </form>
          </section>
          <aside className="privacy-card profile-privacy"><ShieldCheck size={19} /><div><b>Privacidade dos dados</b><p>Seu perfil é visível apenas para você. Confirme os dados antes de incluí-los em qualquer contrato.</p></div></aside>
        </div>
      </QueryState>
    </>
  );
}

export function OnboardingPage() {
  return <ProfilePage onboarding />;
}
