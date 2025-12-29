import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { Home, Dumbbell, TrendingUp, Upload, Menu, X, Settings } from 'lucide-react';
import { useState } from 'react';

const navItems = [
    { path: '/', icon: Home, label: 'Inicio' },
    { path: '/routines', icon: Dumbbell, label: 'Rutinas' },
    { path: '/progress', icon: TrendingUp, label: 'Progreso' },
    { path: '/settings', icon: Settings, label: 'Ajustes' },
];

export default function Layout() {
    const [menuOpen, setMenuOpen] = useState(false);
    const location = useLocation();

    return (
        <div className="min-h-screen flex flex-col bg-[var(--bg-dark)]">
            {/* Header - Mobile */}
            <header className="lg:hidden glass sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <img src="/logo.png" alt="NexLift" className="w-8 h-8 rounded-lg" />
                    <h1 className="text-xl font-bold gradient-text">NexLift</h1>
                </div>
                <button
                    onClick={() => setMenuOpen(!menuOpen)}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                >
                    {menuOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {/* Mobile Menu Overlay */}
            {menuOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-black/60 z-40"
                    onClick={() => setMenuOpen(false)}
                />
            )}

            {/* Mobile Slide Menu */}
            <nav className={`
        lg:hidden fixed top-0 right-0 h-full w-64 bg-[var(--bg-card)] z-50
        transform transition-transform duration-300 ease-in-out
        ${menuOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
                <div className="p-4 pt-16">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => setMenuOpen(false)}
                            className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl mb-2
                transition-all duration-200
                ${isActive
                                    ? 'bg-[var(--primary)] text-white'
                                    : 'text-[var(--text-secondary)] hover:bg-white/5'
                                }
              `}
                        >
                            <item.icon size={20} />
                            <span className="font-medium">{item.label}</span>
                        </NavLink>
                    ))}
                </div>
            </nav>

            <div className="flex-1 flex">
                {/* Desktop Sidebar */}
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
                  transition-all duration-200
                  ${isActive
                                        ? 'bg-[var(--primary)] text-white shadow-lg shadow-purple-500/20'
                                        : 'text-[var(--text-secondary)] hover:bg-white/5 hover:text-white'
                                    }
                `}
                            >
                                <item.icon size={20} />
                                <span className="font-medium">{item.label}</span>
                            </NavLink>
                        ))}
                    </nav>
                </aside>

                {/* Main Content */}
                <main className="flex-1 p-4 lg:p-6 pb-24 lg:pb-6 overflow-x-hidden">
                    <Outlet />
                </main>
            </div>

            {/* Bottom Navigation - Mobile */}
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 glass safe-bottom">
                <div className="flex justify-around items-center py-2">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <NavLink
                                key={item.path}
                                to={item.path}
                                className={`
                  flex flex-col items-center gap-1 px-4 py-2 rounded-xl
                  transition-all duration-200
                  ${isActive
                                        ? 'text-[var(--primary)]'
                                        : 'text-[var(--text-secondary)]'
                                    }
                `}
                            >
                                <item.icon size={22} className={isActive ? 'animate-pulse-glow' : ''} />
                                <span className="text-xs font-medium">{item.label}</span>
                            </NavLink>
                        );
                    })}
                </div>
            </nav>
        </div>
    );
}
