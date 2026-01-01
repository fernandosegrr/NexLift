import { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';

// Componente para celebrar logros como nuevos PRs
export default function Celebration({ show, message = '¡Nuevo PR!' }) {
    const [particles, setParticles] = useState([]);

    useEffect(() => {
        if (show) {
            // Generar partículas aleatorias
            const newParticles = Array.from({ length: 12 }, (_, i) => ({
                id: i,
                x: Math.random() * 100,
                delay: Math.random() * 0.3,
                size: 8 + Math.random() * 8,
                color: ['#fbbf24', '#f59e0b', '#8b5cf6', '#06b6d4'][Math.floor(Math.random() * 4)]
            }));
            setParticles(newParticles);
        }
    }, [show]);

    if (!show) return null;

    return (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
            {/* Partículas de celebración */}
            {particles.map(p => (
                <div
                    key={p.id}
                    className="absolute animate-confetti"
                    style={{
                        left: `${p.x}%`,
                        top: '50%',
                        animationDelay: `${p.delay}s`,
                        width: p.size,
                        height: p.size,
                        backgroundColor: p.color,
                        borderRadius: '2px',
                        transform: `rotate(${Math.random() * 360}deg)`
                    }}
                />
            ))}

            {/* Mensaje central */}
            <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-6 py-4 rounded-2xl shadow-2xl animate-scale-in flex items-center gap-3">
                <Sparkles size={28} className="animate-bounce-subtle" />
                <div>
                    <p className="text-lg font-bold">{message}</p>
                    <p className="text-sm opacity-90">¡Sigue así! 💪</p>
                </div>
            </div>
        </div>
    );
}
