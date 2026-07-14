import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, User } from 'lucide-react';

// 4 tabs: Cuerpo vive en Progreso/Perfil (menos ruido en el gym)
const navItems = [
    { path: '/', icon: Home, label: 'Inicio', end: true },
    { path: '/routines', icon: Dumbbell, label: 'Rutinas' },
    { path: '/progress', icon: TrendingUp, label: 'Progreso' },
    { path: '/profile', icon: User, label: 'Perfil' },
];

export default function Layout() {
    const { pathname } = useLocation();
    // En sesión: sin barra de logo (más espacio vertical para series)
    const isWorkout = pathname.startsWith('/workout');
    const isImmersive = isWorkout;

    return (
        // h-dvh + min-h-0: sin min-h-0 el hijo flex crece con el contenido y no hay scroll
        <div className="flex h-dvh max-h-dvh bg-[var(--bg-dark)] overflow-hidden">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-64 bg-[var(--bg-card)] border-r border-[var(--border)] p-4 shrink-0 min-h-0 overflow-y-auto">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <img src="/logo.png" alt="NexLift" className="w-10 h-10 rounded-xl" />
                    <h1 className="text-2xl font-bold gradient-text">NexLift</h1>
                </div>
                <nav className="space-y-1" aria-label="Principal">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            end={item.end}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-4 py-3 min-h-[44px] rounded-xl
                                transition-all duration-200 font-medium focus-ring
                                ${isActive
                                    ? 'bg-[var(--primary)] text-white shadow-lg shadow-[var(--primary)]/20'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-white'
                                }
                            `}
                        >
                            <item.icon size={20} aria-hidden />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>

            <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* Mobile header — oculto en Workout para ganar altura útil */}
                {!isImmersive && (
                    <header
                        className="lg:hidden glass shrink-0 z-50 px-4 py-2.5 flex items-center justify-center border-b border-[var(--border)]"
                        style={{ paddingTop: 'max(0.5rem, env(safe-area-inset-top))' }}
                    >
                        <div className="flex items-center gap-2">
                            <img src="/logo.png" alt="" className="w-7 h-7 rounded-lg" aria-hidden />
                            <h1 className="text-lg font-bold gradient-text">NexLift</h1>
                        </div>
                    </header>
                )}

                <main
                    className={`flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain lg:p-6 pb-24 lg:pb-6 [-webkit-overflow-scrolling:touch] ${
                        isImmersive ? 'p-0' : 'p-4'
                    }`}
                    style={isImmersive ? { paddingTop: 'env(safe-area-inset-top)' } : undefined}
                >
                    <div className={isImmersive ? 'w-full' : 'max-w-5xl mx-auto'}>
                        <Outlet />
                    </div>
                </main>

                {/* Mobile bottom nav */}
                <nav
                    className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-card)]/95 backdrop-blur-lg border-t border-[var(--border)] z-50"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                    aria-label="Navegación principal"
                >
                    <div className="flex justify-around items-stretch">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                end={item.end}
                                className={({ isActive }) => `
                                    flex flex-col items-center justify-center gap-0.5 py-2 px-1 min-h-[52px] w-full relative
                                    transition-colors duration-200 focus-ring
                                    ${isActive
                                        ? 'text-[var(--primary)]'
                                        : 'text-[var(--text-secondary)]'
                                    }
                                `}
                            >
                                {({ isActive }) => (
                                    <>
                                        <item.icon
                                            size={22}
                                            strokeWidth={isActive ? 2.5 : 2}
                                            aria-hidden
                                            className={isActive ? 'drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]' : ''}
                                        />
                                        <span className="text-[10px] font-semibold leading-none">{item.label}</span>
                                        {isActive && (
                                            <span className="absolute bottom-1 w-1 h-1 bg-[var(--primary)] rounded-full" aria-hidden />
                                        )}
                                    </>
                                )}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            </div>
        </div>
    );
}
