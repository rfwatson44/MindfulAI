import React from "react";
import { Ad } from "@/lib/types";

interface AdTableDebugCellProps {
  ad: Ad;
}

export const AdTableDebugCell: React.FC<AdTableDebugCellProps> = ({ ad }) => {
  // Step-by-step debug info
  let debugSteps: string[] = [];
  let conversionsDisplayValue: number | string = '--';
  let conversionsSource = 'none';
  let rawConversionValue: any = ad.conversions;

  if (ad.conversions && typeof ad.conversions === 'object' && 'mobile_app_install' in ad.conversions) {
    const raw = ad.conversions.mobile_app_install;
    debugSteps.push(`Found conversions as object with mobile_app_install: ${JSON.stringify(raw)}`);
    rawConversionValue = raw;
    if (typeof raw === 'string' && raw && typeof raw.trim === 'function' && raw.trim() !== '') {
      conversionsDisplayValue = parseFloat(raw);
      conversionsSource = 'mobile_app_install (string)';
      debugSteps.push(`Parsed mobile_app_install string to number: ${conversionsDisplayValue}`);
    } else if (typeof raw === 'number') {
      conversionsDisplayValue = raw;
      conversionsSource = 'mobile_app_install (number)';
      debugSteps.push(`Used mobile_app_install number directly: ${conversionsDisplayValue}`);
    } else {
      debugSteps.push('mobile_app_install is not a valid string or number');
    }
  } else if (typeof ad.conversions === 'number') {
    conversionsDisplayValue = ad.conversions;
    conversionsSource = 'conversions (number)';
    debugSteps.push(`Used conversions number directly: ${conversionsDisplayValue}`);
  } else if (typeof ad.conversions === 'string') {
    if ((ad.conversions as string).trim() !== '') {
      conversionsDisplayValue = Number(ad.conversions);
      conversionsSource = 'conversions (string)';
      debugSteps.push(`Parsed conversions string to number: ${conversionsDisplayValue}`);
    } else {
      debugSteps.push('No valid conversions value found');
    }
  } else {
    debugSteps.push('No valid conversions value found');
  }

  const amountSpent = typeof ad.spend === 'number' ? ad.spend : Number(ad.spend);
  debugSteps.push(`Amount Spent: ${ad.spend} (parsed: ${amountSpent})`);

  let costPerConv = '--';
  let costPerConvValid = false;
  if (
    conversionsDisplayValue !== '--' &&
    typeof conversionsDisplayValue === 'number' && !isNaN(conversionsDisplayValue) && conversionsDisplayValue !== 0 &&
    typeof amountSpent === 'number' && !isNaN(amountSpent) && amountSpent !== 0
  ) {
    costPerConv = (amountSpent / conversionsDisplayValue).toFixed(2);
    costPerConvValid = true;
    debugSteps.push(`Calculated Cost/Conv: ${costPerConv}`);
  } else {
    debugSteps.push('Cost/Conv could not be calculated due to invalid or missing data.');
    if (conversionsDisplayValue === '--') debugSteps.push('→ conversionsDisplayValue is --');
    if (typeof conversionsDisplayValue !== 'number' || isNaN(conversionsDisplayValue)) debugSteps.push('→ conversionsDisplayValue is not a valid number');
    if (conversionsDisplayValue === 0) debugSteps.push('→ conversionsDisplayValue is 0');
    if (typeof amountSpent !== 'number' || isNaN(amountSpent)) debugSteps.push('→ amountSpent is not a valid number');
    if (amountSpent === 0) debugSteps.push('→ amountSpent is 0');
  }

  return (
    <div style={{ background: costPerConvValid ? '#fefcbf' : '#ffe5e5', border: '1px solid #ccc', padding: 4, fontSize: 11, borderRadius: 4 }}>
      <div><b>Debug: {ad.name || ad.id}</b></div>
      <div>Raw conversions: <code>{JSON.stringify(rawConversionValue)}</code></div>
      <div>Conversions Source: <code>{conversionsSource}</code></div>
      <div>Conversions Display Value: <code>{String(conversionsDisplayValue)}</code></div>
      <div>Amount Spent: <code>{String(amountSpent)}</code></div>
      <div>Cost/Conv: <code>{String(costPerConv)}</code></div>
      <ul style={{ margin: '4px 0 0 12px', padding: 0 }}>
        {debugSteps.map((step, idx) => (
          <li key={idx} style={{ color: step.startsWith('→') ? 'red' : '#444' }}>{step}</li>
        ))}
      </ul>
      {!costPerConvValid && (
        <div style={{ color: 'red', marginTop: 2 }}>
          <b>How to fix:</b>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {conversionsDisplayValue === '--' && <li>Check that conversions value exists and is not '--'.</li>}
            {(typeof conversionsDisplayValue !== 'number' || isNaN(conversionsDisplayValue)) && <li>Ensure conversions is a valid number.</li>}
            {conversionsDisplayValue === 0 && <li>Conversions must not be zero.</li>}
            {(typeof amountSpent !== 'number' || isNaN(amountSpent)) && <li>Ensure amount spent is a valid number.</li>}
            {amountSpent === 0 && <li>Amount spent must not be zero.</li>}
          </ul>
        </div>
      )}
    </div>
  );
};
