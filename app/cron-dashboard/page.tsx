"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Loader2,
  Play,
  RefreshCw,
  Database,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";

interface Account {
  account_id: string;
  account_name: string;
  formatted_id?: string;
}

interface Job {
  request_id: string;
  job_type: string;
  status: string;
  progress: number;
  error_message?: string;
  result_data?: any;
  created_at: string;
  updated_at: string;
}

interface CronLog {
  id: number;
  execution_time: string;
  accounts_processed: number;
  successful_accounts: number;
  failed_accounts: number;
  results: any;
}

export default function CronDashboard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [cronLogs, setCronLogs] = useState<CronLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [testingCron, setTestingCron] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Fetch accounts
  const fetchAccounts = async () => {
    try {
      const response = await fetch("/api/test-accounts");
      const data = await response.json();
      if (data.success) {
        setAccounts(data.accounts || []);
      }
    } catch (error) {
      console.error("Failed to fetch accounts:", error);
    }
  };

  // Fetch job status
  const fetchJobs = async () => {
    try {
      const response = await fetch("/api/job-status?limit=20");
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch jobs:", error);
    }
  };

  // Fetch cron logs
  const fetchCronLogs = async () => {
    try {
      const response = await fetch("/api/job-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      const data = await response.json();
      if (data.success) {
        setCronLogs(data.cron_logs || []);
      }
    } catch (error) {
      console.error("Failed to fetch cron logs:", error);
    }
  };

  // Add test accounts
  const addTestAccounts = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/test-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const data = await response.json();

      if (data.success) {
        setMessage({ type: "success", text: data.message });
        await fetchAccounts();
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to add accounts",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to add test accounts" });
    } finally {
      setLoading(false);
    }
  };

  // Test cron job
  const testCronJob = async () => {
    setTestingCron(true);
    try {
      const response = await fetch("/api/test-cron");
      const data = await response.json();

      if (data.success) {
        setMessage({
          type: "success",
          text: "Cron job triggered successfully!",
        });
        // Refresh data after a short delay
        setTimeout(() => {
          fetchJobs();
          fetchCronLogs();
        }, 2000);
      } else {
        setMessage({
          type: "error",
          text: data.error || "Failed to trigger cron job",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: "Failed to test cron job" });
    } finally {
      setTestingCron(false);
    }
  };

  // Refresh all data
  const refreshAll = async () => {
    setLoading(true);
    await Promise.all([fetchAccounts(), fetchJobs(), fetchCronLogs()]);
    setLoading(false);
  };

  useEffect(() => {
    refreshAll();
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "processing":
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variant =
      status === "completed"
        ? "default"
        : status === "failed"
        ? "destructive"
        : status === "processing"
        ? "secondary"
        : "outline";
    return <Badge variant={variant}>{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Cron Dashboard
            </h1>
            <p className="text-muted-foreground">
              Monitor and test Meta Marketing cron jobs
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={refreshAll} disabled={loading} variant="outline">
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
            <Button onClick={testCronJob} disabled={testingCron}>
              {testingCron ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Test Cron
            </Button>
          </div>
        </div>

        {message && (
          <Alert variant={message.type === "error" ? "destructive" : "default"}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Accounts
              </CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{accounts.length}</div>
              <p className="text-xs text-muted-foreground">
                Configured in database
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Recent Jobs</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{jobs.length}</div>
              <p className="text-xs text-muted-foreground">
                Last 20 background jobs
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Cron Executions
              </CardTitle>
              <RefreshCw className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{cronLogs.length}</div>
              <p className="text-xs text-muted-foreground">Recent cron runs</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="accounts" className="space-y-4">
          <TabsList>
            <TabsTrigger value="accounts">Accounts</TabsTrigger>
            <TabsTrigger value="jobs">Background Jobs</TabsTrigger>
            <TabsTrigger value="cron-logs">Cron Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Configured Accounts</CardTitle>
                <CardDescription>
                  Accounts that will be processed by the daily cron job
                </CardDescription>
                <Button
                  onClick={addTestAccounts}
                  disabled={loading}
                  className="w-fit"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Database className="h-4 w-4 mr-2" />
                  )}
                  Add Test Accounts
                </Button>
              </CardHeader>
              <CardContent>
                {accounts.length === 0 ? (
                  <p className="text-muted-foreground">
                    No accounts configured
                  </p>
                ) : (
                  <div className="space-y-2">
                    {accounts.map((account) => (
                      <div
                        key={account.account_id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{account.account_name}</p>
                          <p className="text-sm text-muted-foreground">
                            ID: {account.account_id} → act_{account.account_id}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Background Jobs</CardTitle>
                <CardDescription>
                  Status of Meta Marketing worker jobs
                </CardDescription>
              </CardHeader>
              <CardContent>
                {jobs.length === 0 ? (
                  <p className="text-muted-foreground">No jobs found</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <div
                        key={job.request_id}
                        className="flex items-center justify-between p-3 border rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <p className="font-medium">{job.request_id}</p>
                            <p className="text-sm text-muted-foreground">
                              {new Date(job.created_at).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          {getStatusBadge(job.status)}
                          <p className="text-sm text-muted-foreground mt-1">
                            {job.progress}%
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cron-logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Cron Execution Logs</CardTitle>
                <CardDescription>
                  History of daily cron job executions
                </CardDescription>
              </CardHeader>
              <CardContent>
                {cronLogs.length === 0 ? (
                  <p className="text-muted-foreground">No cron logs found</p>
                ) : (
                  <div className="space-y-2">
                    {cronLogs.map((log) => (
                      <div key={log.id} className="p-3 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-medium">
                            {new Date(log.execution_time).toLocaleString()}
                          </p>
                          <div className="flex gap-2">
                            <Badge variant="default">
                              {log.successful_accounts} success
                            </Badge>
                            {log.failed_accounts > 0 && (
                              <Badge variant="destructive">
                                {log.failed_accounts} failed
                              </Badge>
                            )}
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Processed {log.accounts_processed} accounts
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
