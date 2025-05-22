"use client";
import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface HistogramChartProps {
  data: number[];
  bins?: number;
  label?: string;
}

function getHistogramBins(data: number[], bins: number) {
  if (!data.length) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  const binSize = (max - min) / bins || 1;
  const edges = Array.from({ length: bins + 1 }, (_, i) => min + i * binSize);
  const counts = Array(bins).fill(0);
  data.forEach((value) => {
    let idx = Math.floor((value - min) / binSize);
    if (idx === bins) idx = bins - 1; // include max value in last bin
    counts[idx]++;
  });
  return counts.map((count, i) => ({
    bin: `${edges[i].toFixed(1)} - ${edges[i + 1].toFixed(1)}`,
    count,
  }));
}

const HistogramChart: React.FC<HistogramChartProps> = ({ data, bins = 20, label = "Value" }) => {
  const histogramData = getHistogramBins(data, bins);
  return (
    <ResponsiveContainer width="100%" height={340}>
      <BarChart data={histogramData} margin={{ top: 24, right: 32, left: 24, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="bin" angle={-28} textAnchor="end" interval={0} height={64} tick={{ fontSize: 12 }}
          label={{ value: label, position: "insideBottom", offset: -8, fontSize: 13 }}
        />
        <YAxis label={{ value: "Count", angle: -90, position: "insideLeft", fontSize: 12 }} tick={{ fontSize: 12 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default HistogramChart;
