import { useState } from 'react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
  ReferenceLine, Legend,
} from 'recharts';
import { money } from '../lib/money';
import type { CategorySlice } from '../lib/finance';

const AXIS = { stroke: '#5B5D75', fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = <CartesianGrid stroke="#1b1d33" vertical={false} />;
const compact = (c: number) => {
  const v = Math.abs(c) / 100;
  const s = v >= 1000 ? `$${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `$${v.toFixed(0)}`;
  return c < 0 ? `−${s}` : s;
};

interface TipPayload { name: string; value: number; color: string; dataKey: string }
function MoneyTip({ active, payload, label, pct }: { active?: boolean; payload?: TipPayload[]; label?: string; pct?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <div className="t">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="row" style={{ gap: 8, justifyContent: 'space-between' }}>
          <span className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} /><span className="muted">{p.name}</span></span>
          <b className="num">{pct ? `${p.value.toFixed(1)}%` : money(p.value)}</b>
        </div>
      ))}
    </div>
  );
}

export interface FlowDatum { label: string; income: number; expense: number }
export function CashFlowChart({ data, height = 260 }: { data: FlowDatum[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 6, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00D9A0" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#00D9A0" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="gExpense" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FF5470" stopOpacity={0.18} />
            <stop offset="100%" stopColor="#FF5470" stopOpacity={0} />
          </linearGradient>
        </defs>
        {GRID}
        <XAxis dataKey="label" {...AXIS} dy={6} minTickGap={12} />
        <YAxis {...AXIS} tickFormatter={compact} width={56} />
        <Tooltip content={<MoneyTip />} cursor={{ stroke: '#2c2f4a', strokeWidth: 1 }} />
        <Area type="monotone" dataKey="income" name="Income" stroke="#00D9A0" strokeWidth={2.2} fill="url(#gIncome)"
          dot={false} activeDot={{ r: 5, stroke: '#111225', strokeWidth: 2 }} />
        <Area type="monotone" dataKey="expense" name="Expenses" stroke="#FF5470" strokeWidth={2} fill="url(#gExpense)"
          dot={false} activeDot={{ r: 5, stroke: '#111225', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({ slices, total, label = 'total spent', size = 190 }: { slices: CategorySlice[]; total: number; label?: string; size?: number }) {
  const [active, setActive] = useState<number | null>(null);
  const shown = active != null ? slices[active] : null;
  return (
    <div style={{ position: 'relative', width: size, height: size, margin: '0 auto' }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={slices} dataKey="amount" nameKey="name" innerRadius="70%" outerRadius="96%" paddingAngle={slices.length > 1 ? 2 : 0}
            stroke="#111225" strokeWidth={2} cornerRadius={4} isAnimationActive={false}
            onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}>
            {slices.map((s, i) => <Cell key={s.name} fill={s.color} opacity={active == null || active === i ? 1 : 0.35} style={{ outline: 'none', cursor: 'pointer' }} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
        <div>
          <div className="num" style={{ fontSize: size > 170 ? 22 : 18, fontWeight: 800, letterSpacing: '-0.03em' }}>{money(shown ? shown.amount : total, { whole: true })}</div>
          <div className="muted tiny" style={{ maxWidth: size * 0.55 }}>{shown ? `${shown.name} · ${shown.pct.toFixed(0)}%` : label}</div>
        </div>
      </div>
    </div>
  );
}

export function SimpleBars({ data, keys, height = 260, stacked, horizontal }: {
  data: Record<string, unknown>[]; keys: { key: string; name: string; color: string }[]; height?: number; stacked?: boolean; horizontal?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 10, right: 10, left: horizontal ? 0 : -8, bottom: 0 }} barGap={2} barCategoryGap={horizontal ? '22%' : '28%'}>
        {horizontal ? <CartesianGrid stroke="#1b1d33" horizontal={false} /> : GRID}
        {horizontal ? <XAxis type="number" {...AXIS} tickFormatter={compact} /> : <XAxis dataKey="label" {...AXIS} dy={6} minTickGap={8} />}
        {horizontal ? <YAxis type="category" dataKey="label" {...AXIS} width={92} interval={0} /> : <YAxis {...AXIS} tickFormatter={compact} width={56} />}
        <Tooltip content={<MoneyTip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        {keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#B6B8CC' }} />}
        {keys.map((k) => <Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} stackId={stacked ? 's' : undefined} maxBarSize={horizontal ? 12 : 28}
          stroke={stacked ? '#111225' : undefined} strokeWidth={stacked ? 1 : 0} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SimpleLine({ data, keys, height = 240, percent, zeroLine }: {
  data: Record<string, unknown>[]; keys: { key: string; name: string; color: string }[]; height?: number; percent?: boolean; zeroLine?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
        {GRID}
        <XAxis dataKey="label" {...AXIS} dy={6} minTickGap={8} />
        <YAxis {...AXIS} tickFormatter={percent ? (v: number) => `${v.toFixed(0)}%` : compact} width={56} />
        <Tooltip content={<MoneyTip pct={percent} />} cursor={{ stroke: '#2c2f4a' }} />
        {zeroLine && <ReferenceLine y={0} stroke="#2c2f4a" />}
        {keys.length > 1 && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: '#B6B8CC' }} />}
        {keys.map((k) => <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} strokeWidth={2} dot={{ r: 3, strokeWidth: 0, fill: k.color }} activeDot={{ r: 5, stroke: '#111225', strokeWidth: 2 }} />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AreaSingle({ data, dataKey, name, color = '#00D9A0', height = 240 }: { data: Record<string, unknown>[]; dataKey: string; name: string; color?: string; height?: number }) {
  const id = `g-${dataKey.replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        {GRID}
        <XAxis dataKey="label" {...AXIS} dy={6} minTickGap={8} />
        <YAxis {...AXIS} tickFormatter={compact} width={60} domain={['auto', 'auto']} />
        <Tooltip content={<MoneyTip />} cursor={{ stroke: '#2c2f4a' }} />
        <Area type="monotone" dataKey={dataKey} name={name} stroke={color} strokeWidth={2.2} fill={`url(#${id})`} dot={false} activeDot={{ r: 5, stroke: '#111225', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
