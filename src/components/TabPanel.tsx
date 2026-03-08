'use client';

import { ReactNode } from 'react';

interface Tab {
    label: string;
    content: ReactNode;
    count?: number;
}

interface TabPanelProps {
    tabs: Tab[];
    activeTab: number;
    onChange: (index: number) => void;
}

export default function TabPanel({ tabs, activeTab, onChange }: TabPanelProps) {
    return (
        <div>
            <div className="flex gap-1 p-1 bg-slate-900/50 rounded-xl border border-slate-800/50 overflow-x-auto">
                {tabs.map((tab, index) => (
                    <button
                        key={index}
                        onClick={() => onChange(index)}
                        className={`px-4 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                            activeTab === index
                                ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30'
                                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
                        }`}
                    >
                        {tab.label}
                        {tab.count !== undefined && (
                            <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                                activeTab === index
                                    ? 'bg-purple-500/20 text-purple-300'
                                    : 'bg-slate-800 text-slate-500'
                            }`}>
                                {tab.count}
                            </span>
                        )}
                    </button>
                ))}
            </div>
            <div className="mt-4">
                {tabs[activeTab]?.content}
            </div>
        </div>
    );
}
