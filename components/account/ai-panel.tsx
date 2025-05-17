Here's the fixed script with the missing closing brackets and parentheses:

```javascript
function getColumnDistribution(selection: SelectedRange): string {
  if (selection.type !== "column") return "Select a column to see distribution.";
  
  const values = selection.values
    .map(v => Number(v.value) || 0)
    .filter(v => !isNaN(v));
  
  if (!values.length) return "No valid values to analyze.";
  
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const max = Math.max(...values);
  const min = Math.min(...values);
  
  const aboveAvg = values.filter(v => v > avg).length;
  const belowAvg = values.filter(v => v < avg).length;
  
  return `${aboveAvg} values are above average and ${belowAvg} are below average. The range spans from ${formatValue(min, selection.metricId)} to ${formatValue(max, selection.metricId)}.`;
}
```