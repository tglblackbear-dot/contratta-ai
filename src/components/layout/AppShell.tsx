import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Bell,
  CreditCard,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../features/auth/AuthProvider";
import { clearOfflineUserData } from "../../lib/offlineInterviews";

const navigation = [
  { to: "/app/dashboard", label: "Início", icon: LayoutDashboard, end: true },
  { to: "/app/new-contract", label: "Criar contrato", icon: FilePlus2 },
  { to: "/app/contracts", label: "Meus contratos", icon: FileText },
  { to: "/app/templates", label: "Modelos", icon: FileText },
  { to: "/app/parties", label: "Partes frequentes", icon: UsersRound },
  { to: "/app/finance", label: "Financeiro", icon: WalletCards },
  { to: "/app/receipts", label: "Recibos", icon: ReceiptText },
  { to: "/app/notifications", label: "Notificações", icon: Bell },
  { to: "/app/billing", label: "Contratar créditos", icon: CreditCard },
];

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: ["notifications-unread", user?.id],
    enabled: Boolean(user && supabase),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.from("notifications")
        .select("id,read_at,scheduled_for").eq("owner_id", user!.id).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
  const unreadNotifications = (notificationsQuery.data ?? []).filter((item) =>
    !item.read_at && (!item.scheduled_for || Date.parse(item.scheduled_for) <= Date.now())
  ).length;
  const avatarLabel = user?.user_metadata?.full_name?.trim().charAt(0) || user?.email?.charAt(0) || "?";

  useEffect(() => {
    const client = supabase;
    if (!user || !client) return;
    const channel = client.channel(`notification-count-${user.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "notifications",
        filter: `owner_id=eq.${user.id}`,
      }, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications-unread", user.id] });
        void queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [queryClient, user?.id]);

  async function signOut() {
    try {
      if (user?.id) await clearOfflineUserData(user.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "falha inesperada";
      window.alert(`Não foi possível apagar os dados offline deste dispositivo: ${message}`);
      return;
    }
    const { error } = await supabase!.auth.signOut();
    if (error) {
      window.alert(`Não foi possível encerrar a sessão: ${error.message}`);
      return;
    }
    navigate("/login", { replace: true });
  }

  return (
    <div className="app-frame">
      <button
        className="mobile-menu-toggle"
        aria-label={menuOpen ? "Fechar menu" : "Abrir menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        {menuOpen ? <X size={21} /> : <Menu size={21} />}
      </button>
      {menuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}>
        <NavLink to="/app" className="brand-lockup" onClick={() => setMenuOpen(false)}>
          <span className="brand-mark">C</span>
          <span><strong>contratta</strong><small>ASSISTENTE JURÍDICO</small></span>
        </NavLink>
        <div className="sidebar-label">ESPAÇO DE TRABALHO</div>
        <nav className="main-nav" aria-label="Navegação principal">
          {navigation.map(({ to, label, icon: Icon, end }) =>
            (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-item${isActive ? " nav-active" : ""}`}
                onClick={() => setMenuOpen(false)}
              >
                <Icon size={18} strokeWidth={1.8} /><span>{label}</span>
                {label === "Notificações" && unreadNotifications > 0 && <span className="notification-count">{unreadNotifications > 99 ? "99+" : unreadNotifications}</span>}
              </NavLink>
            )
          )}
        </nav>
        <div className="sidebar-bottom">
          <NavLink to="/app/profile" className={({ isActive }) => `nav-item${isActive ? " nav-active" : ""}`}>
            <UsersRound size={18} strokeWidth={1.8} /><span>Meu perfil</span>
          </NavLink>
          <NavLink to="/app/settings" className={({ isActive }) => `nav-item${isActive ? " nav-active" : ""}`}>
            <Settings size={18} strokeWidth={1.8} /><span>Configurações</span>
          </NavLink>
          <button className="nav-item signout-button" onClick={signOut}>
            <LogOut size={18} strokeWidth={1.8} /><span>Sair da conta</span>
          </button>
          <p className="sidebar-footnote">Seus dados são privados e protegidos pela sua conta.</p>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <span className="breadcrumb">Seu espaço de trabalho</span>
        <span className="graffiti-mark" title="Identificador de autoria">Deus acima de tudo, familia em primeiro lugar.</span>
          <div className="topbar-right">
            <span className="secure-label"><span className="secure-dot" /> Área segura</span>
            <NavLink to="/app/profile" className="avatar-link" aria-label="Abrir meu perfil">{avatarLabel.toLocaleUpperCase("pt-BR")}</NavLink>
          </div>
        </header>
        <div className="page-content"><Outlet /></div>
      </main>
      <nav className="mobile-tabbar" aria-label="Navegação rápida">
        <NavLink to="/app/dashboard" aria-label="Início"><LayoutDashboard size={20} /></NavLink>
        <NavLink to="/app/new-contract" aria-label="Criar contrato"><FilePlus2 size={20} /></NavLink>
        <NavLink to="/app/contracts" aria-label="Meus contratos"><FileText size={20} /></NavLink>
        <NavLink to="/app/parties" aria-label="Partes frequentes"><UsersRound size={20} /></NavLink>
      </nav>
    </div>
  );
}
