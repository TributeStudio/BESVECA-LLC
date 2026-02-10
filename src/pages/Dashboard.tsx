import React, { useMemo } from 'react';
import { useApp } from '../context/AppContext';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from 'recharts';
import {
    CurrencyDollar,
    ArrowUpRight,
    UserSquare
} from '@phosphor-icons/react';

const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 transition-transform hover:scale-[1.02]">
        <div className="flex items-center justify-between mb-4">
            <div className={`p-3 rounded-xl bg-${color}-50 text-${color}-600`}>
                <Icon size={24} weight="duotone" />
            </div>
            <span className="flex items-center text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                <ArrowUpRight size={14} className="mr-1" /> +12%
            </span>
        </div>
        <h3 className="text-slate-500 text-sm font-medium mb-1 font-sans">{title}</h3>
        <p className="text-3xl font-bold text-slate-900">{value}</p>
    </div>
);

const Dashboard: React.FC = () => {
    const { logs, projects } = useApp();

    const stats = useMemo(() => {
        let totalRevenue = 0;
        const projectRevenueMap: Record<string, number> = {};

        logs.forEach(log => {
            const project = projects.find(p => p.id === log.projectId);
            if (log.type === 'TIME' && log.hours) {
                if (project) {
                    const rev = log.hours * project.hourlyRate;
                    totalRevenue += rev;
                    projectRevenueMap[project.name] = (projectRevenueMap[project.name] || 0) + rev;
                }
            } else if (log.type === 'EXPENSE' && log.billableAmount) {
                totalRevenue += log.billableAmount;
                if (project) {
                    projectRevenueMap[project.name] = (projectRevenueMap[project.name] || 0) + log.billableAmount;
                }
            }
        });

        const chartData = Object.entries(projectRevenueMap).map(([name, value]) => ({ name, value }));
        return { totalRevenue, activeGuests: projects.length, chartData };
    }, [logs, projects]);

    return (
        <div className="space-y-8">
            <div className="flex flex-col">
                <h1 className="text-4xl font-bold text-slate-900 mb-2">Executive Summary</h1>
                <p className="text-slate-500">Your studio performance at a glance.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <StatCard
                    title="Total Revenue"
                    value={`$${stats.totalRevenue.toLocaleString()}`}
                    icon={CurrencyDollar}
                    color="sky"
                />
                <StatCard
                    title="Active Guests"
                    value={stats.activeGuests.toLocaleString()}
                    icon={UserSquare}
                    color="amber"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Chart */}
                <div className="lg:col-span-2 bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-8">
                        <h2 className="text-xl font-bold">Revenue Distribution</h2>
                        <select className="bg-slate-50 border-none rounded-lg text-sm font-medium px-4 py-2 focus:ring-1 focus:ring-slate-200">
                            <option>Month to Date</option>
                        </select>
                    </div>
                    <div className="h-[350px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats.chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis
                                    dataKey="name"
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    dy={10}
                                />
                                <YAxis
                                    axisLine={false}
                                    tickLine={false}
                                    tick={{ fill: '#94a3b8', fontSize: 12 }}
                                    tickFormatter={(value) => `$${value}`}
                                />
                                <Tooltip
                                    cursor={{ fill: '#f8fafc' }}
                                    contentStyle={{
                                        borderRadius: '12px',
                                        border: 'none',
                                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'
                                    }}
                                />
                                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={40}>
                                    {stats.chartData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={['#0ea5e9', '#6366f1', '#f59e0b', '#ec4899'][index % 4]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-100">
                    <h2 className="text-xl font-bold mb-6">Recent Activity</h2>
                    <div className="space-y-6">
                        {logs.slice(0, 5).map((log) => (
                            <div key={log.id} className="flex gap-4">
                                <div className={`w-2 mt-1.5 h-2 rounded-full flex-shrink-0 ${log.type === 'TIME' ? 'bg-sky-500' : 'bg-pink-500'}`} />
                                <div>
                                    <p className="text-sm font-medium text-slate-900">{log.description}</p>
                                    <p className="text-xs text-slate-500">
                                        {projects.find(p => p.id === log.projectId)?.name} • {log.type === 'TIME' ? `${log.hours}h` : `$${log.cost}`}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <button className="w-full mt-8 py-3 rounded-xl border border-slate-100 text-slate-600 font-medium text-sm hover:bg-slate-50 transition-colors">
                        View All History
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
