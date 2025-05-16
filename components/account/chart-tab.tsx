"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
  LineChart, Line
} from 'recharts';
import { BarChart2 } from "lucide-react";
import { SelectedRange } from "@/lib/types";

import React, { useState } from "react";

export default function ChartTab({ selectedRange }: { selectedRange: SelectedRange | null }) {
  console.log("ChartTab selectedRange:", selectedRange);

  if (!selectedRange) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
        <BarChart2 className="mb-2 h-8 w-8 text-muted-foreground/70" />
        <p>Select data to generate a chart</p>
      </div>
    );
  }

  const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
  const [sortType, setSortType] = useState<'value-desc' | 'value-asc' | 'name-asc' | 'name-desc'>('value-desc');

  let chartData: any[] = [];
  let xKey = 'name';
  let yKey = 'value';
  let label = '';

  // Grouped bar chart data transformation
  if (selectedRange.type === 'column') {
    // Get unique column/metric names in order of appearance
    const colOrder: string[] = [];
    selectedRange.values.forEach((v: any) => {
      const col = v.metricName || v.metricId || 'Metric';
      if (!colOrder.includes(col)) colOrder.push(col);
    });
    // Group by adName
    const adMap: Record<string, any> = {};
    selectedRange.values.forEach((v: any) => {
      if (!v.adName || v.value == null || isNaN(Number(v.value))) return;
      if (!adMap[v.adName]) adMap[v.adName] = { name: v.adName };
      adMap[v.adName][v.metricName || v.metricId || 'Metric'] = Math.round(Number(v.value) * 10) / 10;
    });
    // If exactly 2 columns, plot ratio
    if (colOrder.length === 2) {
      const [numerator, denominator] = colOrder;
      chartData = Object.values(adMap).map((row: any) => {
        const ratio = row[denominator] !== 0 && row[denominator] != null ? row[numerator] / row[denominator] : null;
        return {
          name: row.name,
          [`${numerator} / ${denominator}`]: ratio && isFinite(ratio) ? Math.round(ratio * 1000) / 1000 : null, // keep more precision for percent formatting
        };
      });
      label = `${numerator} / ${denominator}`;
      xKey = 'name';
    } else {
      // 1 or 3+ columns: plot all metrics as usual
      chartData = Object.values(adMap);
      label = colOrder.join(', ');
      xKey = 'name';
    }
  } else if (selectedRange.type === 'row') {
    // Group by metricName, each ad as a separate property
    const metricMap: Record<string, any> = {};
    const adNames = new Set<string>();
    selectedRange.values.forEach((v: any) => {
      if (!v.metricName || v.value == null || isNaN(Number(v.value))) return;
      if (!metricMap[v.metricName]) metricMap[v.metricName] = { name: v.metricName };
      metricMap[v.metricName][v.adName || v.adId || 'Ad'] = Math.round(Number(v.value) * 10) / 10;
      adNames.add(v.adName || v.adId || 'Ad');
    });
    chartData = Object.values(metricMap);
    label = Array.from(adNames).join(', ');
    xKey = 'name';
  } else if (selectedRange.type === 'cell') {
    chartData = [{
      name: selectedRange.metricName || selectedRange.adName || 'Selected',
      value: typeof selectedRange.value === 'number' ? Math.round(selectedRange.value * 10) / 10 : Math.round(Number(selectedRange.value) * 10) / 10,
      metric: selectedRange.metricName || selectedRange.metricId || '',
    }];
    label = selectedRange.metricName || selectedRange.adName || '';
    xKey = 'name';
  }

  // Filter out invalid values
  chartData = chartData.filter(d => Object.keys(d).some(k => k !== 'name' && typeof d[k] === 'number' && !isNaN(d[k])));

  // --- Sorting ---
  if (sortType.startsWith('value')) {
    // Sort by the first metric/ad value in each row
    chartData.sort((a, b) => {
      const aVal = Object.keys(a).find(k => k !== 'name') ? a[Object.keys(a).find(k => k !== 'name')!] : 0;
      const bVal = Object.keys(b).find(k => k !== 'name') ? b[Object.keys(b).find(k => k !== 'name')!] : 0;
      return sortType === 'value-desc' ? bVal - aVal : aVal - bVal;
    });
  } else if (sortType === 'name-asc') {
    chartData.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  } else if (sortType === 'name-desc') {
    chartData.sort((a, b) => String(b.name).localeCompare(String(a.name)));
  }

  console.log("ChartTab chartData:", chartData);

  if (!chartData.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <span>No valid numeric data to chart.</span>
      </div>
    );
  }

  // Dynamically determine bar keys (metrics or ads)
  let barKeys: string[] = [];
  if (selectedRange.type === 'column') {
    // Each metric as a bar
    const metrics = new Set<string>();
    chartData.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (k !== 'name') metrics.add(k);
      });
    });
    barKeys = Array.from(metrics);
  } else if (selectedRange.type === 'row') {
    // Each ad as a bar
    const ads = new Set<string>();
    chartData.forEach((row: any) => {
      Object.keys(row).forEach(k => {
        if (k !== 'name') ads.add(k);
      });
    });
    barKeys = Array.from(ads);
  } else if (selectedRange.type === 'cell') {
    barKeys = ['value'];
  }

  // --- Controls ---
  const controlStyle = {
    display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', marginBottom: 16
  };
  const buttonStyle = (active: boolean) => ({
    padding: '6px 16px', borderRadius: 8, border: '1px solid #ddd', background: active ? '#2563eb' : '#fff', color: active ? '#fff' : '#222', cursor: 'pointer', fontWeight: 500
  });
  const selectStyle = {
    padding: '4px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: 14
  };

  // --- Tooltip Formatter ---
  // Format numbers and show percent for ratios < 1
  function formatNumber(val: number) {
    if (val == null || isNaN(val)) return '-';
    if (val < 1 && val > 0) return (val * 100).toFixed(1) + '%';
    if (Math.abs(val) >= 1e6) return (val / 1e6).toFixed(1) + 'M';
    if (Math.abs(val) >= 1e3) return (val / 1e3).toFixed(1) + 'K';
    return val.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div style={controlStyle}>
        <div style={{display:'flex',gap:4}}>
          <button style={buttonStyle(chartType==='bar')} onClick={()=>setChartType('bar')}>Bar</button>
          <button style={buttonStyle(chartType==='line')} onClick={()=>setChartType('line')}>Line</button>
        </div>
        <select style={selectStyle} value={sortType} onChange={e=>setSortType(e.target.value as any)}>
          <option value="value-desc">Value (High to Low)</option>
          <option value="value-asc">Value (Low to High)</option>
          <option value="name-asc">Name (A-Z)</option>
          <option value="name-desc">Name (Z-A)</option>
        </select>
      </div>
      {/* Chart Title */}
      <p className="text-center text-sm text-muted-foreground">
        {selectedRange.type === "column"
          ? `Chart showing ${label} across all ads`
          : selectedRange.type === "row"
          ? `Chart showing all metrics for "${label}"`
          : "Chart visualization"}
      </p>
      {/* Chart */}
      <div style={{ width: '100%', height: 340, padding: '0 8px' }}>
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'bar' ? (
            <BarChart data={chartData} margin={{ top: 24, right: 32, left: 24, bottom: 40 }} barGap={8} barCategoryGap={20}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} angle={-28} textAnchor="end" interval={0} height={64} tickFormatter={v=>String(v).length>16?String(v).slice(0,15)+"…":v} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: label, angle: -90, position: 'insideLeft', fontSize: 12 }} tickFormatter={formatNumber} />
              <Tooltip formatter={formatNumber} labelFormatter={l=>`Name: ${l}`}/>
              <Legend wrapperStyle={{fontSize:13}}/>
              {barKeys.map((barKey, idx) => (
                <Bar key={barKey} dataKey={barKey} fill={['#2563eb', '#22c55e', '#f59e42', '#f43f5e'][idx % 4]} radius={[8,8,0,0]} maxBarSize={40}>
                  <LabelList dataKey={barKey} position="top" formatter={formatNumber}/>
                </Bar>
              ))}
            </BarChart>
          ) : (
            <LineChart data={chartData} margin={{ top: 24, right: 32, left: 24, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={xKey} tick={{ fontSize: 12 }} angle={-28} textAnchor="end" interval={0} height={64} tickFormatter={v=>String(v).length>16?String(v).slice(0,15)+"…":v} />
              <YAxis tick={{ fontSize: 12 }} label={{ value: label, angle: -90, position: 'insideLeft', fontSize: 12 }} tickFormatter={formatNumber} />
              <Tooltip formatter={formatNumber} labelFormatter={l=>`Name: ${l}`}/>
              <Legend wrapperStyle={{fontSize:13}}/>
              {barKeys.map((barKey, idx) => (
                <Line key={barKey} type="monotone" dataKey={barKey} stroke={['#2563eb', '#22c55e', '#f59e42', '#f43f5e'][idx % 4]} strokeWidth={3} dot={{r:4}} activeDot={{r:7}} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

