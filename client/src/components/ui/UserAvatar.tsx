import React, { useState } from 'react';
import { UserCircle } from 'lucide-react';

// Predefined gradient pairs for deterministic user colors
const AVATAR_GRADIENTS = [
    ['#3B82F6', '#06B6D4'], // blue → cyan
    ['#8B5CF6', '#EC4899'], // violet → pink
    ['#F59E0B', '#EF4444'], // amber → red
    ['#10B981', '#3B82F6'], // emerald → blue
    ['#EC4899', '#F97316'], // pink → orange
    ['#6366F1', '#8B5CF6'], // indigo → violet
    ['#14B8A6', '#22D3EE'], // teal → cyan
    ['#F97316', '#FBBF24'], // orange → amber
    ['#EF4444', '#F472B6'], // red → pink
    ['#06B6D4', '#6366F1'], // cyan → indigo
];

/**
 * Generates a consistent gradient pair for a given name string.
 * Same name will always get the same color.
 */
function getGradientForName(name: string): [string, string] {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
        hash = hash & hash; // Convert to 32bit integer
    }
    const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
    return AVATAR_GRADIENTS[idx] as [string, string];
}

interface UserAvatarProps {
    name?: string | null;
    avatarUrl?: string | null;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
}

const SIZE_MAP = {
    xs: { container: 'w-6 h-6', text: 'text-[10px]', icon: 'w-3.5 h-3.5' },
    sm: { container: 'w-8 h-8', text: 'text-xs', icon: 'w-4 h-4' },
    md: { container: 'w-10 h-10', text: 'text-sm', icon: 'w-5 h-5' },
    lg: { container: 'w-14 h-14', text: 'text-xl', icon: 'w-7 h-7' },
    xl: { container: 'w-24 h-24', text: 'text-3xl', icon: 'w-12 h-12' },
};

export default function UserAvatar({ name, avatarUrl, size = 'md', className = '' }: UserAvatarProps) {
    const s = SIZE_MAP[size];
    const [imgFailed, setImgFailed] = useState(false);

    // If we have a real avatar image that hasn't failed
    if (avatarUrl && !imgFailed) {
        return (
            <div className={`${s.container} rounded-full overflow-hidden flex-shrink-0 shadow-md ${className}`}>
                <img
                    src={avatarUrl}
                    alt={name || 'Avatar'}
                    className="w-full h-full object-cover"
                    onError={() => setImgFailed(true)}
                />
            </div>
        );
    }

    // No name at all — unassigned
    if (!name) {
        return (
            <div className={`${s.container} rounded-full bg-navy-800 border border-navy-700 flex items-center justify-center text-navy-500 flex-shrink-0 ${className}`}>
                <UserCircle className={s.icon} />
            </div>
        );
    }

    // Initials with unique color
    const [from, to] = getGradientForName(name);
    const initial = name.charAt(0).toUpperCase();

    return (
        <div
            className={`${s.container} rounded-full flex items-center justify-center text-white ${s.text} font-bold shadow-md flex-shrink-0 ${className}`}
            style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
            {initial}
        </div>
    );
}

