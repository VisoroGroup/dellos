import React from 'react';

interface Props {
    rows?: number;
    cols?: number;
    className?: string;
}

// Generic skeleton block
export function SkeletonBlock({ className = '' }: { className?: string }) {
    return (
        <div className={`animate-pulse bg-navy-800/60 rounded-lg ${className}`} />
    );
}

// Task list row skeleton
export function SkeletonTaskRow() {
    return (
        <div className="grid grid-cols-[32px_1fr_120px_130px_140px_80px_130px_100px] gap-2 px-4 py-3.5 border-b border-navy-800/50 animate-pulse">
            <div className="flex items-center"><SkeletonBlock className="w-4 h-4" /></div>
            <div className="flex flex-col gap-1.5 justify-center">
                <SkeletonBlock className="h-3.5 w-3/4" />
                <SkeletonBlock className="h-2.5 w-1/3" />
            </div>
            <SkeletonBlock className="h-6 w-24 rounded-full self-center" />
            <SkeletonBlock className="h-3 w-24 self-center" />
            <SkeletonBlock className="h-6 w-28 rounded-full self-center" />
            <SkeletonBlock className="h-3 w-10 self-center" />
            <div className="flex items-center gap-1.5">
                <SkeletonBlock className="w-6 h-6 rounded-full" />
                <SkeletonBlock className="h-3 w-20" />
            </div>
            <SkeletonBlock className="h-3 w-16 self-center" />
        </div>
    );
}

// Mobile task card skeleton
function SkeletonTaskCard() {
    return (
        <div className="bg-navy-900/30 border border-navy-700/50 rounded-xl p-4 animate-pulse space-y-3">
            <div className="flex items-start gap-3">
                <SkeletonBlock className="w-5 h-5 flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                    <SkeletonBlock className="h-4 w-3/4" />
                    <SkeletonBlock className="h-3 w-1/2" />
                </div>
            </div>
            <div className="flex gap-2 flex-wrap">
                <SkeletonBlock className="h-5 w-20 rounded-full" />
                <SkeletonBlock className="h-5 w-24 rounded-full" />
                <SkeletonBlock className="h-5 w-16 rounded-full" />
            </div>
        </div>
    );
}

// Task list skeleton (header + N rows)
export function SkeletonTaskList({ rows = 5 }: { rows?: number }) {
    return (
        <>
            {/* Mobile skeleton */}
            <div className="md:hidden space-y-2">
                {Array.from({ length: rows }).map((_, i) => (
                    <SkeletonTaskCard key={i} />
                ))}
            </div>
            {/* Desktop skeleton */}
            <div className="hidden md:block bg-navy-900/30 border border-navy-700/50 rounded-xl overflow-hidden">
                {/* Header */}
                <div className="grid grid-cols-[32px_1fr_120px_130px_140px_80px_130px_100px] gap-2 px-4 py-3 bg-navy-800/30 border-b border-navy-700/50">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <SkeletonBlock key={i} className="h-3 w-16" />
                    ))}
                </div>
                {Array.from({ length: rows }).map((_, i) => (
                    <SkeletonTaskRow key={i} />
                ))}
            </div>
        </>
    );
}

// Kanban card skeleton
export function SkeletonKanbanCard() {
    return (
        <div className="bg-navy-900/90 border border-navy-700/50 rounded-lg p-3 animate-pulse space-y-2">
            <SkeletonBlock className="h-5 w-20 rounded-full" />
            <SkeletonBlock className="h-3.5 w-full" />
            <SkeletonBlock className="h-3 w-3/4" />
            <div className="flex justify-between items-center pt-1">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="w-5 h-5 rounded-full" />
            </div>
        </div>
    );
}

// Dashboard stat card skeleton
export function SkeletonStatCard() {
    return (
        <div className="bg-navy-900/50 border border-navy-700/50 rounded-xl p-5 animate-pulse">
            <div className="flex items-center justify-between mb-4">
                <SkeletonBlock className="h-4 w-28" />
                <SkeletonBlock className="w-9 h-9 rounded-lg" />
            </div>
            <SkeletonBlock className="h-8 w-16 mb-1" />
            <SkeletonBlock className="h-3 w-24" />
        </div>
    );
}

// Task drawer loading skeleton
export function SkeletonDrawer() {
    return (
        <div className="flex flex-col h-full animate-pulse p-5 space-y-6">
            {/* Header */}
            <div className="space-y-2">
                <SkeletonBlock className="h-6 w-3/4" />
                <SkeletonBlock className="h-4 w-1/2" />
            </div>
            {/* Status bar */}
            <div className="flex gap-3">
                <SkeletonBlock className="h-8 w-24 rounded-full" />
                <SkeletonBlock className="h-8 w-28 rounded-full" />
                <SkeletonBlock className="h-8 w-20 rounded-full" />
            </div>
            {/* Tabs */}
            <div className="flex gap-4 border-b border-navy-700/50 pb-2">
                {Array.from({ length: 5 }).map((_, i) => (
                    <SkeletonBlock key={i} className="h-4 w-20" />
                ))}
            </div>
            {/* Content */}
            <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-navy-800/30">
                        <SkeletonBlock className="w-5 h-5 rounded" />
                        <SkeletonBlock className="h-4 flex-1" />
                        <SkeletonBlock className="h-4 w-20" />
                    </div>
                ))}
            </div>
        </div>
    );
}
