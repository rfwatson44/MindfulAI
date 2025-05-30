"use client";

import React from "react";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InfoIcon, AlertTriangleIcon, CheckCircleIcon } from "lucide-react";
import {
  explainStatusFields,
  hasStatusDiscrepancy,
  getDeliveryIssueReason,
  getStatusRecommendations,
} from "@/utils/meta-marketing/status-utils";

interface StatusIndicatorProps {
  status?: string;
  effectiveStatus?: string;
  configuredStatus?: string;
  entityType?: "campaign" | "adset" | "ad";
  showDetails?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  effectiveStatus,
  configuredStatus,
  entityType = "ad",
  showDetails = false,
}) => {
  const hasDiscrepancy = hasStatusDiscrepancy(status, effectiveStatus);
  const deliveryIssue = getDeliveryIssueReason(status, effectiveStatus);
  const recommendations = getStatusRecommendations(status, effectiveStatus);
  const explanations = explainStatusFields(
    status,
    effectiveStatus,
    configuredStatus
  );

  // Determine the primary status to display
  const primaryStatus = effectiveStatus || status || "UNKNOWN";
  const isDelivering = effectiveStatus === "ACTIVE";

  // Get badge variant based on status
  const getBadgeVariant = (statusValue: string) => {
    switch (statusValue) {
      case "ACTIVE":
        return "default";
      case "PAUSED":
      case "CAMPAIGN_PAUSED":
      case "ADSET_PAUSED":
        return "secondary";
      case "DISAPPROVED":
      case "WITH_ISSUES":
        return "destructive";
      case "PENDING_REVIEW":
      case "PENDING_BILLING_INFO":
        return "outline";
      default:
        return "secondary";
    }
  };

  return (
    <div className="space-y-2">
      {/* Primary Status Badge */}
      <div className="flex items-center gap-2">
        <Badge variant={getBadgeVariant(primaryStatus)}>
          {isDelivering ? (
            <CheckCircleIcon className="w-3 h-3 mr-1" />
          ) : (
            <AlertTriangleIcon className="w-3 h-3 mr-1" />
          )}
          {primaryStatus}
        </Badge>

        {hasDiscrepancy && (
          <Badge variant="outline" className="text-orange-600">
            <InfoIcon className="w-3 h-3 mr-1" />
            Status Mismatch
          </Badge>
        )}
      </div>

      {/* Status Discrepancy Alert */}
      {hasDiscrepancy && deliveryIssue && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangleIcon className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Delivery Issue:</strong> {deliveryIssue}
            {status && (
              <span className="block mt-1 text-sm">
                Configured as{" "}
                <code className="bg-orange-100 px-1 rounded">{status}</code> but
                effective status is{" "}
                <code className="bg-orange-100 px-1 rounded">
                  {effectiveStatus}
                </code>
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <Alert className="border-blue-200 bg-blue-50">
          <InfoIcon className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Recommendations:</strong>
            <ul className="mt-1 ml-4 list-disc text-sm">
              {recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* Detailed Status Breakdown */}
      {showDetails && explanations.length > 0 && (
        <div className="border rounded-lg p-3 bg-gray-50">
          <h4 className="font-medium text-sm mb-2">Status Field Details:</h4>
          <div className="space-y-2">
            {explanations.map((explanation, index) => (
              <div
                key={index}
                className="flex justify-between items-start text-sm"
              >
                <div className="flex-1">
                  <code className="bg-gray-200 px-1 rounded text-xs">
                    {explanation.field}
                  </code>
                  <span className="ml-2">{explanation.meaning}</span>
                </div>
                <Badge
                  variant={explanation.isDelivering ? "default" : "secondary"}
                  className="ml-2 text-xs"
                >
                  {explanation.value}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusIndicator;
