import { Outlet, NavLink } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, Settings } from 'lucide-react';

const navItems = [
    { path: '/', icon: Home, label: 'Inicio' },
    { path: '/routines', icon: Dumbbell, label: 'Rutinas' },
    { path: '/progress', icon: TrendingUp, label: 'Progreso' },
    { path: '/settings', icon: Settings, label: 'Ajustes' },
];

export default function Layout() {
    return (
        <div className="flex h-screen bg-[var(--bg-dark)] overflow-hidden">
            {/* Desktop Sidebar (Visible only on LG screens) */}
            <aside className="hidden lg:flex flex-col w-64 bg-[var(--bg-card)] border-r border-[var(--border)] p-4">
                <div className="flex items-center gap-3 mb-8 px-2">
                    <img src="/logo.png" alt="NexLift" className="w-10 h-10 rounded-xl" />
                    <h1 className="text-2xl font-bold gradient-text">NexLift</h1>
                </div>
                <nav className="space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            className={({ isActive }) => `
                                flex items-center gap-3 px-4 py-3 rounded-xl
                                transition-all duration-200 font-medium
                                ${isActive
                                    ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-500/20'
                                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-dark)] hover:text-white'
                                }
                            `}
                        >
                            <item.icon size={20} />
                            <span>{item.label}</span>
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Header */}
                <header className="lg:hidden glass sticky top-0 z-50 px-4 py-3 flex items-center justify-center border-b border-[var(--border)]">
                    <div className="flex items-center gap-2">
                        <img src="/logo.png" alt="NexLift" className="w-8 h-8 rounded-lg" />
                        <h1 className="text-xl font-bold gradient-text">NexLift</h1>
                    </div>
                </header>

                {/* Scrollable Page Content */}
                <main className="flex-1 overflow-y-auto p-4 lg:p-6 pb-24 lg:pb-6 scroll-smooth">
                    <div className="max-w-5xl mx-auto">
                        <Outlet />
                    </div>
                </main>

                {/* Mobile Bottom Navigation */}
                <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[var(--bg-card)]/90 backdrop-blur-lg border-t border-[var(--border)] z-50 pb-[env(safe-area-inset-bottom)]">
                    <div className="flex justify-around items-center py-2">
                        {navItems.map((item) => (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={({ isActive }) => `
                                    flex flex-col items-center gap-1 p-2 rounded-xl w-full
                                    transition-all duration-300
                                    ${isActive
                                        ? 'text-[var(--primary)] scale-105'
                                        : 'text-[var(--text-secondary)] hover:text-white'
                                    }
                                `}
                            >
                                {({ isActive }) => (
                                    <>
                                        <item.icon
                                            size={24}
                                            strokeWidth={isActive ? 2.5 : 2}
                                            className={isActive ? 'drop-shadow-[0_0_8px_rgba(139,92,246,0.5)]' : ''}
                                        />
                                        <span className="text-[10px] font-medium">{item.label}</span>
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