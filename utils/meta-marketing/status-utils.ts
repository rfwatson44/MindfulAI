/**
 * Meta Marketing API Status Utilities
 *
 * This file contains utilities to help understand and work with Meta's different status fields.
 * Meta provides three different status fields that serve different purposes:
 *
 * 1. status (configured_status): What you manually set for the ad/campaign/adset
 * 2. effective_status: The actual delivery status considering parent hierarchy and constraints
 * 3. configured_status: Same as status field (redundant)
 */

export interface StatusExplanation {
  field: string;
  value: string;
  meaning: string;
  isDelivering: boolean;
}

/**
 * Explains the difference between Meta's status fields for a given entity
 */
export function explainStatusFields(
  status?: string,
  effectiveStatus?: string,
  configuredStatus?: string
): StatusExplanation[] {
  const explanations: StatusExplanation[] = [];

  if (status) {
    explanations.push({
      field: "status",
      value: status,
      meaning: "The status you manually configured for this entity",
      isDelivering: status === "ACTIVE",
    });
  }

  if (configuredStatus && configuredStatus !== status) {
    explanations.push({
      field: "configured_status",
      value: configuredStatus,
      meaning: "Same as status field (redundant)",
      isDelivering: configuredStatus === "ACTIVE",
    });
  }

  if (effectiveStatus) {
    explanations.push({
      field: "effective_status",
      value: effectiveStatus,
      meaning: getEffectiveStatusMeaning(effectiveStatus),
      isDelivering: isEffectiveStatusDelivering(effectiveStatus),
    });
  }

  return explanations;
}

/**
 * Gets a human-readable explanation for an effective_status value
 */
function getEffectiveStatusMeaning(effectiveStatus: string): string {
  const meanings: Record<string, string> = {
    ACTIVE: "Currently delivering ads",
    PAUSED: "Manually paused by you",
    CAMPAIGN_PAUSED: "Not delivering because parent campaign is paused",
    ADSET_PAUSED: "Not delivering because parent ad set is paused",
    DISAPPROVED: "Not delivering due to policy violations",
    PENDING_REVIEW: "Waiting for Meta's review before delivery can start",
    PREAPPROVED: "Approved but not yet delivering",
    PENDING_BILLING_INFO: "Not delivering due to billing issues",
    CAMPAIGN_GROUP_PAUSED: "Not delivering because campaign group is paused",
    IN_PROCESS: "Being processed by Meta's systems",
    WITH_ISSUES: "Has delivery issues that need attention",
    DELETED: "Permanently deleted",
    ARCHIVED: "Archived and not delivering",
  };

  return meanings[effectiveStatus] || `Unknown status: ${effectiveStatus}`;
}

/**
 * Determines if an effective_status means the entity is actually delivering
 */
function isEffectiveStatusDelivering(effectiveStatus: string): boolean {
  const deliveringStatuses = ["ACTIVE"];
  return deliveringStatuses.includes(effectiveStatus);
}

/**
 * Checks if there's a discrepancy between configured and effective status
 */
export function hasStatusDiscrepancy(
  status?: string,
  effectiveStatus?: string
): boolean {
  if (!status || !effectiveStatus) return false;

  // If configured as ACTIVE but effective status is not ACTIVE, there's a discrepancy
  if (status === "ACTIVE" && effectiveStatus !== "ACTIVE") {
    return true;
  }

  return false;
}

/**
 * Gets a summary of why an entity might not be delivering despite being configured as ACTIVE
 */
export function getDeliveryIssueReason(
  status?: string,
  effectiveStatus?: string
): string | null {
  if (!hasStatusDiscrepancy(status, effectiveStatus)) {
    return null;
  }

  const reasons: Record<string, string> = {
    CAMPAIGN_PAUSED: "The parent campaign is paused",
    ADSET_PAUSED: "The parent ad set is paused",
    DISAPPROVED: "The ad violates Meta's advertising policies",
    PENDING_REVIEW: "The ad is waiting for Meta's review",
    PENDING_BILLING_INFO: "There are billing issues with your account",
    CAMPAIGN_GROUP_PAUSED: "The campaign group is paused",
    WITH_ISSUES: "There are delivery issues that need your attention",
  };

  return reasons[effectiveStatus || ""] || `Unknown issue: ${effectiveStatus}`;
}

/**
 * Provides actionable recommendations based on status discrepancy
 */
export function getStatusRecommendations(
  status?: string,
  effectiveStatus?: string
): string[] {
  const recommendations: string[] = [];

  if (!hasStatusDiscrepancy(status, effectiveStatus)) {
    return recommendations;
  }

  switch (effectiveStatus) {
    case "CAMPAIGN_PAUSED":
      recommendations.push(
        "Check if the parent campaign is paused and activate it if needed"
      );
      break;
    case "ADSET_PAUSED":
      recommendations.push(
        "Check if the parent ad set is paused and activate it if needed"
      );
      break;
    case "DISAPPROVED":
      recommendations.push(
        "Review Meta's policy feedback and edit the ad to comply"
      );
      recommendations.push(
        "Check the 'Issues Info' field for specific policy violations"
      );
      break;
    case "PENDING_REVIEW":
      recommendations.push(
        "Wait for Meta's review process to complete (usually 24-48 hours)"
      );
      break;
    case "PENDING_BILLING_INFO":
      recommendations.push(
        "Update your payment method in Meta Business Manager"
      );
      recommendations.push("Ensure your account has sufficient funds");
      break;
    case "WITH_ISSUES":
      recommendations.push(
        "Check the 'Issues Info' field for specific problems"
      );
      recommendations.push("Review targeting, budget, and creative settings");
      break;
    default:
      recommendations.push(
        "Check Meta Ads Manager for more details about this status"
      );
  }

  return recommendations;
}
