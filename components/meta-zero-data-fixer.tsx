"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, CheckCircle, RefreshCw } from "lucide-react";

interface ZeroDataAd {
  ad_id: string;
  name: string;
  impressions: number;
  spend: number;
}

interface ZeroDataResponse {
  accountId: string;
  zeroDataAds: number;
  ads: ZeroDataAd[];
  message: string;
  fixUrl: string;
}

interface FixResponse {
  success: boolean;
  message: string;
  details: {
    fixed: number;
    total: number;
    errors: string[];
  };
}

const fetchZeroDataAds = async (
  accountId: string
): Promise<ZeroDataResponse> => {
  const response = await fetch(
    `/api/meta-marketing-worker?accountId=${accountId}`
  );
  if (!response.ok) {
    throw new Error("Failed to fetch zero data ads");
  }
  return response.json();
};

const fixZeroDataAds = async (accountId: string): Promise<FixResponse> => {
  const response = await fetch(
    `/api/meta-marketing-worker?accountId=${accountId}&action=fix-zero-data`
  );
  if (!response.ok) {
    throw new Error("Failed to fix zero data ads");
  }
  return response.json();
};

export const MetaZeroDataFixer = () => {
  const [accountId, setAccountId] = useState("");
  const queryClient = useQueryClient();

  const {
    data: zeroDataInfo,
    isLoading: isChecking,
    error: checkError,
    refetch,
  } = useQuery({
    queryKey: ["zero-data-ads", accountId],
    queryFn: () => fetchZeroDataAds(accountId),
    enabled: !!accountId,
    refetchOnWindowFocus: false,
  });

  const fixMutation = useMutation({
    mutationFn: () => fixZeroDataAds(accountId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["zero-data-ads", accountId] });
    },
  });

  const handleCheck = () => {
    if (accountId.trim()) {
      refetch();
    }
  };

  const handleFix = () => {
    if (accountId.trim()) {
      fixMutation.mutate();
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Meta Ads Zero Data Fixer
          </CardTitle>
          <CardDescription>
            Find and fix ads with zero spend and zero impressions that should
            have data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter Meta Ad Account ID (e.g., act_123456789)"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={handleCheck}
              disabled={!accountId.trim() || isChecking}
            >
              {isChecking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Check
            </Button>
          </div>

          {checkError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Error checking account: {checkError.message}
              </AlertDescription>
            </Alert>
          )}

          {zeroDataInfo && (
            <div className="space-y-4">
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{zeroDataInfo.message}</AlertDescription>
              </Alert>

              {zeroDataInfo.zeroDataAds > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">
                        {zeroDataInfo.zeroDataAds} ads with zero data
                      </Badge>
                    </div>
                    <Button
                      onClick={handleFix}
                      disabled={fixMutation.isPending}
                      variant="default"
                    >
                      {fixMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <CheckCircle className="h-4 w-4 mr-2" />
                      )}
                      Fix Zero Data Issues
                    </Button>
                  </div>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Affected Ads</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {zeroDataInfo.ads.map((ad) => (
                          <div
                            key={ad.ad_id}
                            className="flex items-center justify-between p-2 border rounded"
                          >
                            <div>
                              <div className="font-medium text-sm">
                                {ad.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                ID: {ad.ad_id}
                              </div>
                            </div>
                            <div className="text-right text-xs">
                              <div>Impressions: {ad.impressions}</div>
                              <div>Spend: ${ad.spend}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {zeroDataInfo.zeroDataAds === 0 && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    Great! No ads with zero data found for this account.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {fixMutation.isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Error fixing ads: {fixMutation.error?.message}
              </AlertDescription>
            </Alert>
          )}

          {fixMutation.isSuccess && fixMutation.data && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div>{fixMutation.data.message}</div>
                  <div className="text-sm">
                    <div>Fixed: {fixMutation.data.details.fixed}</div>
                    <div>Total: {fixMutation.data.details.total}</div>
                    {fixMutation.data.details.errors.length > 0 && (
                      <div className="mt-2">
                        <div className="font-medium">Errors:</div>
                        <ul className="list-disc list-inside">
                          {fixMutation.data.details.errors.map(
                            (error, index) => (
                              <li key={index} className="text-xs">
                                {error}
                              </li>
                            )
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Why This Happens</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <p>
            <strong>Meta&apos;s 72-hour data delay:</strong> Meta processes
            conversion data with up to 72 hours delay, especially after iOS
            changes.
          </p>
          <p>
            <strong>Attribution window changes:</strong> iOS privacy changes
            have affected how Meta attributes conversions to ads.
          </p>
          <p>
            <strong>API rate limits:</strong> Heavy API requests can timeout,
            resulting in incomplete data fetching.
          </p>
          <p>
            <strong>Date range issues:</strong> Very long date ranges (6+
            months) can cause API timeouts for complex metrics.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
