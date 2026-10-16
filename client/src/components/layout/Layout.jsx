import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, User } from 'lucide-react';

// 4 tabs: Cuerpo/Export viven bajo el hub de Progreso
const navItems = [
    { path: '/', icon: Home, label: 'Inicio', end: true },
    { path: '/routines', icon: Dumbbell, label: 'Rutinas' },
    {
        path: '/progress',
        icon: TrendingUp,
        label: 'Progreso',
        // Destinos “hijos” sin tab propio (no dejar al usuario sin tab activo)
        alsoActive: ['/body', '/export', '/goals']
    },
    { path: '/profile', icon: User, label: 'Perfil' },
];

function pathMatches(pathname, item) {
    if (item.end) return pathname === item.path;
    if (pathname === item.path || pathname.startsWith(`${item.path}/`)) return true;
    return (item.alsoActive || []).some(
        p => pathname === p || pathname.startsWith(`${p}/`)
    );
}

export default function Layout() {
    const { pathname } = useLocation();
    const isWorkout = pathname.startsWith('/workout');

    return (
        <div className="flex h-dvh max-h-dvh bg-[var(--bg-dark)] overflow-hidden">
            <aside className="hidden lg:flex flex-col w-64 bg-[var(--bg-card)] border-r border-[var(--border)] p-4 shrink-0 min-h-0 overflow-y-auto">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <img src="/logo.png" alt="NexLift" className="w-10 h-10 rounded-xl" />
                    <h1 className="text-2xl font-bold text-white">
                        <span className="text-[var(--primary)]">Nex</span>Lift
                    </h1>
                </div>
                <nav className="space-y-1" aria-label="Principal">
                    {navItems.map((item) => {
                        const active = pathMatches(pathname, item);
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.end}
                                className={`
                                    flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl
                                    transition-all duration-200 font-medium focus-ring
                                    ${active
                                        ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-white'
                                    }
                                `}
                            >
                                <item.icon size={20} aria-hidden />
                                <span>{item.label}</span>
                            </NavLink>
                        );
                    })}
                </nav>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* Brand bar móvil: logo + nombre centrados (siempre visible) */}
                <header
                    className="flex max-lg:flex lg:hidden shrink-0 z-50 border-b border-[var(--border)] bg-[var(--bg-card)]"
                    style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
                >
                    <div className="flex items-center justify-center gap-2.5 h-14 w-full px-4">
                        <img
                            src="/logo.png"
                            alt="NexLift"
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-xl object-cover shrink-0 shadow-sm shadow-[var(--primary)]/25"
                        />
                        <span className="text-lg font-bold tracking-tight text-white select-none">
                            <span className="text-[var(--primary)]">Nex</span>Lift
                        </span>
                    </div>
                </header>

                <main
                    className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain lg:p-6 pb-24 lg:pb-6 [-webkit-overflow-scrolling:touch] ${
                        isWorkout ? 'p-3 pt-2' : 'p-4 pt-3'
                    }`}
                >
                    <div className="max-w-5xl mx-auto w-full">
                        <Outlet />
                    </div>
                </main>

                {/* Bottom nav: indicador arriba del label (nunca pisa el texto) */}
                <nav
                    className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-card)]/95 backdrop-blur-lg border-t border-[var(--border)] z-50"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    aria-label="Navegación principal"
                >
                    <div className="flex justify-around items-stretch h-14">
                        {navItems.map((item) => {
                            const active = pathMatches(pathname, item);
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    end={item.end}
                                    aria-current={active ? 'page' : undefined}
                                    className={`
                                        flex flex-col items-center justify-center gap-1 px-1 w-full min-w-0
                                        transition-colors duration-200 focus-ring
                                        ${active ? 'text-[var(--primary)]' : 'text-[var(--text-secondary)]'}
                                    `}
                                >
                                    <item.icon
                                        size={22}
                                        strokeWidth={active ? 2.5 : 2}
                                        aria-hidden
                                        className={active ? 'drop-shadow-[0_0_8px_rgba(139,92,246,0.45)]' : ''}
                                    />
                                    <span className="text-[10px] font-semibold leading-tight truncate max-w-full px-0.5">
                                        {item.label}
                                    </span>
                                    {/* Punto bajo el icono, no bajo la palabra */}
                                    <span
                                        className={`h-0.5 w-4 rounded-full transition-opacity ${
                                            active ? 'bg-[var(--primary)] opacity-100' : 'opacity-0'
                                        }`}
                                        aria-hidden
                                    />
                                </NavLink>
                            );
                        })}
                    </div>
                </nav>
            </div>
        </div>
    );
}
